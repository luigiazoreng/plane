/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useHelpdeskSSE, type THelpdeskSSEEvent } from "@/hooks/use-helpdesk-sse";
import { observer } from "mobx-react";
import { Link, useParams } from "react-router";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IHelpdeskStatus, ISearchIssueResponse, TIntakeIssueStatus } from "@plane/types";
import { AppHeader } from "@/components/core/app-header";
import { cn, getFileURL } from "@plane/utils";
import { HelpdeskDetailHeader } from "@/components/helpdesk/detail/helpdesk-detail-header";
import { HelpdeskChatTimeline } from "@/components/helpdesk/detail/helpdesk-chat-timeline";
import { HelpdeskChatComposer } from "@/components/helpdesk/detail/helpdesk-chat-composer";
import { HelpdeskSidebar } from "@/components/helpdesk/detail/helpdesk-sidebar";
import { useUser } from "@/hooks/store/user";
import { ArrowLeft, ArrowUpRight, Paperclip } from "lucide-react";
import { useAttachmentUpload } from "@/components/helpdesk/attachments/use-attachment-upload";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";

const INTAKE_STATUS_META: Record<
  TIntakeIssueStatus,
  { label: string; variant: "warning" | "brand" | "success" | "neutral" | "danger" }
> = {
  [-2]: { label: "Pending", variant: "warning" },
  [-1]: { label: "Rejected", variant: "danger" },
  [1]: { label: "Accepted", variant: "success" },
  [2]: { label: "Duplicate", variant: "neutral" },
};

const WorkspaceRequestDetailPage = observer(() => {
  const { workspaceSlug, requestId } = useParams();
  const helpdeskStore = useHelpdesk();
  const { issueMap } = useIssues();
  const { getProjectIdentifierById, getProjectById, workspaceProjectIds } = useProject();
  const { data: currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<"conversa" | "anexos" | "atividades" | "historico">("conversa");
  const [showSidebar, setShowSidebar] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  // Intake forwarding state
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [forwardTitle, setForwardTitle] = useState("");
  const [forwardDescription, setForwardDescription] = useState("");
  const [isForwarding, setIsForwarding] = useState(false);
  const previousAcceptedIssueIdsRef = useRef<string[]>([]);

  // A public reply always reaches the customer through both channels; the only
  // distinction an agent makes is public vs. internal, via the toggle below.
  // An internal note stays on the portal and is never delivered by email --
  // sending it would be the RC-2 leak the API now rejects outright.
  const PUBLIC_REPLY_CHANNELS = ["portal", "email"];
  const INTERNAL_NOTE_CHANNELS = ["portal"];

  const attachmentTransport = useMemo(
    () => ({
      getCredentials: (data: { name: string; type: string; size: number }) =>
        helpdeskStore.helpdeskService.getAssetUploadCredentials(workspaceSlug?.toString() || "", data),
      markUploaded: (assetId: string) =>
        helpdeskStore.helpdeskService.markAssetUploaded(workspaceSlug?.toString() || "", assetId),
      remove: (assetId: string) => helpdeskStore.helpdeskService.deleteAsset(workspaceSlug?.toString() || "", assetId),
    }),
    [workspaceSlug, helpdeskStore]
  );
  const attachments = useAttachmentUpload(attachmentTransport);

  useEffect(() => {
    if (!workspaceSlug || !requestId) return;
    const wSlug = workspaceSlug.toString();
    const rId = requestId.toString();

    Promise.all([
      helpdeskStore.fetchStatuses(wSlug),
      helpdeskStore.fetchRequestById(wSlug, rId),
      helpdeskStore.fetchRequestComments(wSlug, rId),
      helpdeskStore.fetchRequestIssues(wSlug, rId).then(() => helpdeskStore.hydrateLinkedIssues(wSlug, rId)),
      helpdeskStore.fetchRequestIntakeIssues(wSlug, rId),
    ]);
  }, [workspaceSlug, requestId, helpdeskStore]);

  const wSlug = workspaceSlug?.toString() || "";
  const rId = requestId?.toString() || "";
  const statuses = helpdeskStore.getWorkspaceStatuses(wSlug);
  const statusMap = useMemo(
    () => Object.fromEntries(statuses.map((s) => [s.id, s])) as Record<string, IHelpdeskStatus>,
    [statuses]
  );
  const request = helpdeskStore.getWorkspaceRequests(wSlug).find((r) => r.id === rId);
  const comments = helpdeskStore.getRequestComments(rId);
  const linkedIssues = helpdeskStore.getRequestIssues(rId);
  const intakeLinks = helpdeskStore.getRequestIntakeIssues(rId);
  const unresolvedLinkedIssues = helpdeskStore.getUnresolvedLinkedIssues(rId);
  const requestState = helpdeskStore.getCollectionState(`request:${rId}`);
  const commentsState = helpdeskStore.getCollectionState(`comments:${rId}`);
  const linkedIssuesState = helpdeskStore.getCollectionState(`request-issues:${rId}`);
  const intakeLinksState = helpdeskStore.getCollectionState(`request-intake-issues:${rId}`);

  const linkedIssueIds = useMemo(() => linkedIssues.map((i) => i.issue), [linkedIssues]);

  useEffect(() => {
    if (!wSlug || !rId) return;

    let intervalId: number | undefined;

    const refreshIntakeLinks = async () => {
      const latestLinks = await helpdeskStore.fetchRequestIntakeIssues(wSlug, rId);
      const currentAcceptedIssueIds = latestLinks
        .filter((link) => link.intake_status === 1 && link.issue_id)
        .map((link) => link.issue_id as string);

      const hasNewAcceptedIssue = currentAcceptedIssueIds.some(
        (issueId) => !previousAcceptedIssueIdsRef.current.includes(issueId)
      );
      previousAcceptedIssueIdsRef.current = currentAcceptedIssueIds;

      if (hasNewAcceptedIssue) {
        await helpdeskStore.hydrateLinkedIssues(wSlug, rId);
      }
    };

    const restartPolling = () => {
      if (intervalId) window.clearInterval(intervalId);
      if (document.visibilityState !== "visible") return;
      intervalId = window.setInterval(() => {
        refreshIntakeLinks().catch(() => null);
      }, 20000);
    };

    restartPolling();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshIntakeLinks().catch(() => null);
      }
      restartPolling();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [helpdeskStore, rId, wSlug]);

  useEffect(() => {
    previousAcceptedIssueIdsRef.current = intakeLinks
      .filter((link) => link.intake_status === 1 && link.issue_id)
      .map((link) => link.issue_id as string);
  }, [intakeLinks]);

  useHelpdeskSSE(wSlug, (event: THelpdeskSSEEvent) => {
    if (event.request_id !== rId) return;
    if (event.type === "request.updated") helpdeskStore.fetchRequestById(wSlug, rId);
    if (event.type === "comment.created") helpdeskStore.fetchRequestComments(wSlug, rId);
  });

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      await helpdeskStore.createRequestComment(wSlug, rId, {
        content: newComment.trim(),
        is_internal: isInternalNote,
        delivery_channels: isInternalNote ? INTERNAL_NOTE_CHANNELS : PUBLIC_REPLY_CHANNELS,
        asset_ids: attachments.assetIds,
      });
      setNewComment("");
      attachments.clear();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: isInternalNote ? "Internal note added" : "Reply sent to the request thread",
      });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to add comment" });
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleLinkIssues = async (issues: ISearchIssueResponse[]) => {
    const toLink = issues.filter((issue) => !linkedIssueIds.includes(issue.id));
    if (toLink.length === 0) return;
    try {
      await Promise.all(toLink.map((issue) => helpdeskStore.createRequestIssue(wSlug, rId, { issue: issue.id })));
      await helpdeskStore.hydrateLinkedIssues(wSlug, rId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success", message: "Issue linked successfully" });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not link the selected issue" });
    }
  };

  const handleUnlinkIssue = async (requestIssueId: string) => {
    try {
      await helpdeskStore.deleteRequestIssue(wSlug, requestIssueId, rId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success", message: "Issue unlinked" });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not unlink the issue" });
    }
  };

  const handleForwardToIntake = async () => {
    if (!selectedProjectId || !forwardTitle.trim()) return;
    setIsForwarding(true);
    try {
      await helpdeskStore.createRequestIntakeIssue(wSlug, rId, {
        project: selectedProjectId,
        title: forwardTitle.trim(),
        description: forwardDescription.trim() || undefined,
      });
      setIsForwardModalOpen(false);
      setSelectedProjectId("");
      setForwardTitle("");
      setForwardDescription("");
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Forwarded",
        message: "Intake issue created in the selected project",
      });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not forward to Intake" });
    } finally {
      setIsForwarding(false);
    }
  };

  const handleUnlinkIntakeIssue = async (requestIntakeIssueId: string) => {
    try {
      await helpdeskStore.deleteRequestIntakeIssue(wSlug, requestIntakeIssueId, rId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success", message: "Intake issue link removed" });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not remove intake link" });
    }
  };

  // Pre-fill forward form with request title when opening modal
  const openForwardModal = () => {
    if (request) {
      setForwardTitle(request.title);
      setForwardDescription(request.description || "");
    }
    setIsForwardModalOpen(true);
  };

  if (requestState.isLoading && !request) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex h-full w-full flex-col bg-surface-1">
        <AppHeader
          header={
            <div className="flex items-center gap-3">
              <Link to={`/${wSlug}/helpdesk`} className="text-tertiary transition-colors hover:text-primary">
                <ArrowLeft className="size-4" />
              </Link>
              <div>
                <h3 className="text-sm text-text-100 font-semibold">Request not found</h3>
                <p className="text-xs text-text-400">The selected request is unavailable or was removed.</p>
              </div>
            </div>
          }
        />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-text-400">No request data available.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full w-full flex-col overflow-hidden bg-[#0f0f11]">
        {/* Modular Detail Header - Fixed height */}
        <HelpdeskDetailHeader
          request={request}
          statuses={statuses}
          statusMap={statusMap}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          attachmentsCount={
            comments.reduce((acc, c) => acc + (c.attachments?.length || 0), 0)
          }
          onUpdateStatus={(status) => helpdeskStore.updateRequest(wSlug, rId, { status })}
          onUpdatePriority={(priority) => helpdeskStore.updateRequest(wSlug, rId, { priority })}
          onUpdateAssignees={(assignees) => helpdeskStore.updateRequest(wSlug, rId, { assignees })}
          onOpenIssueModal={() => setIsIssueModalOpen(true)}
          onOpenForwardModal={openForwardModal}
          wSlug={wSlug}
          onToggleSidebar={() => setShowSidebar(!showSidebar)}
        />

        {/* Flexible Workspace Content & Right Sidebar */}
        <div className="relative flex flex-1 overflow-hidden">
          {/* Central Workspace Pane - Occupies 100% available width */}
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0f0f11]">
            {activeTab === "conversa" && (
              <div className="flex h-full w-full flex-col overflow-hidden">
                {/* Independent Scroll Timeline */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  <HelpdeskChatTimeline
                    request={request}
                    comments={comments}
                    isLoading={commentsState.isLoading}
                    currentUserId={currentUser?.id}
                  />
                </div>
                {/* Fixed Bottom Composer */}
                <div className="shrink-0">
                  <HelpdeskChatComposer
                    onAddComment={async (content, isInternal) => {
                      await helpdeskStore.createRequestComment(wSlug, rId, {
                        content,
                        is_internal: isInternal,
                        delivery_channels: isInternal ? INTERNAL_NOTE_CHANNELS : PUBLIC_REPLY_CHANNELS,
                        asset_ids: attachments.assetIds,
                      });
                      attachments.clear();
                    }}
                    submitting={submittingComment}
                    attachments={attachments}
                  />
                </div>
              </div>
            )}

            {activeTab === "anexos" && (
              <div className="flex-1 overflow-y-auto p-6">
                <h3 className="text-sm font-semibold text-custom-text-100 mb-4">Anexos do chamado</h3>
                {comments.flatMap((c) => c.attachments || []).length === 0 ? (
                  <p className="text-xs text-custom-text-400">Nenhum anexo encontrado neste chamado.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {comments
                      .flatMap((c) => c.attachments || [])
                      .map((att) => (
                        <a
                          key={att.id}
                          href={getFileURL(`/api/workspaces/${wSlug}/helpdesk/assets/${att.asset_id}/`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 rounded-lg border-0 bg-[#18181b] p-3 hover:bg-[#202024] transition-all"
                        >
                          <Paperclip className="size-4 text-sky-400 shrink-0" />
                          <span className="text-xs font-medium text-custom-text-100 truncate">
                            {att.attributes?.name || "Anexo"}
                          </span>
                        </a>
                      ))}
                  </div>
                )}
              </div>
            )}

            {(activeTab === "atividades" || activeTab === "historico") && (
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                <h3 className="text-sm font-semibold text-custom-text-100 mb-4">Histórico de Atividades</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-custom-text-300">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span>Chamado criado em {new Date(request.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  {request.updated_at && (
                    <div className="flex items-center gap-2 text-xs text-custom-text-300">
                      <span className="size-2 rounded-full bg-blue-500" />
                      <span>Última atualização em {new Date(request.updated_at).toLocaleString("pt-BR")}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>

          {/* Right Details Sidebar: Controlled width on desktop (320-340px), Drawer on smaller screens */}
          <div
            className={cn(
              "h-full shrink-0 transition-all duration-200 z-20",
              "hidden lg:block lg:w-[280px] xl:w-[300px]",
              showSidebar && "fixed inset-y-0 right-0 w-[300px] sm:w-[320px] shadow-2xl block bg-[#121214]"
            )}
          >
            <HelpdeskSidebar
              request={request}
              statuses={statuses}
              statusMap={statusMap}
              linkedIssues={linkedIssues}
              intakeLinks={intakeLinks}
              unresolvedLinkedIssues={unresolvedLinkedIssues}
              issueMap={issueMap}
              wSlug={wSlug}
              rId={rId}
              onUpdateStatus={(status) => helpdeskStore.updateRequest(wSlug, rId, { status })}
              onUpdatePriority={(priority) => helpdeskStore.updateRequest(wSlug, rId, { priority })}
              onUpdateAssignees={(assignees) => helpdeskStore.updateRequest(wSlug, rId, { assignees })}
              onOpenIssueModal={() => setIsIssueModalOpen(true)}
              onOpenForwardModal={openForwardModal}
              onUnlinkIssue={handleUnlinkIssue}
              onUnlinkIntakeIssue={handleUnlinkIntakeIssue}
              getProjectById={getProjectById}
              getProjectIdentifierById={getProjectIdentifierById}
              updateRequestField={(data) => helpdeskStore.updateRequest(wSlug, rId, data)}
              onCloseMobile={() => setShowSidebar(false)}
            />
          </div>

          {/* Mobile Drawer Overlay Backdrop */}
          {showSidebar && (
            <div
              className="fixed inset-0 bg-black/60 z-10 xl:hidden"
              onClick={() => setShowSidebar(false)}
            />
          )}
        </div>
      </div>

      {/* Link issue modal */}
      <ExistingIssuesListModal
        workspaceSlug={wSlug}
        isOpen={isIssueModalOpen}
        handleClose={() => setIsIssueModalOpen(false)}
        searchParams={{}}
        shouldHideIssue={(issue) => linkedIssueIds.includes(issue.id)}
        handleOnSubmit={handleLinkIssues}
      />

      {/* Forward to Intake modal */}
      {isForwardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#18181b] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-0 border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-custom-text-100 flex items-center gap-2">
                <ArrowUpRight className="size-4 text-emerald-400" />
                Forward para Pipeline (Intake)
              </h3>
              <button
                type="button"
                onClick={() => setIsForwardModalOpen(false)}
                className="text-xs text-custom-text-400 hover:text-custom-text-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-custom-text-200 mb-1">
                  Selecione o Projeto de Destino:
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#222226] p-2 text-xs text-custom-text-100 outline-none"
                >
                  <option value="">Selecione um projeto...</option>
                  {(workspaceProjectIds ?? []).map((pId) => {
                    const proj = getProjectById(pId);
                    return (
                      <option key={pId} value={pId} className="bg-[#18181b] text-custom-text-100">
                        {proj?.name || pId} ({proj?.identifier})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-custom-text-200 mb-1">Título da Issue:</label>
                <input
                  type="text"
                  value={forwardTitle}
                  onChange={(e) => setForwardTitle(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#222226] p-2 text-xs text-custom-text-100 outline-none"
                  placeholder="Título da issue no projeto..."
                />
              </div>

              <div>
                <label className="block font-semibold text-custom-text-200 mb-1">Descrição / Contexto:</label>
                <textarea
                  value={forwardDescription}
                  onChange={(e) => setForwardDescription(e.target.value)}
                  className="w-full min-h-[80px] rounded-lg border border-white/10 bg-[#222226] p-2 text-xs text-custom-text-100 outline-none resize-none"
                  placeholder="Detalhes ou observações para o time..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-0 border-t border-white/10">
              <Button variant="secondary" size="sm" onClick={() => setIsForwardModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleForwardToIntake}
                disabled={isForwarding || !selectedProjectId || !forwardTitle.trim()}
              >
                {isForwarding ? "Criando..." : "Criar Issue no Intake"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default WorkspaceRequestDetailPage;
