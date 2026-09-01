/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  IHelpdeskDisplayFilters,
  IHelpdeskRequest,
  IHelpdeskStatus,
  ISearchIssueResponse,
  THelpdeskOrderBy,
  TIssuePriorities,
} from "@plane/types";
import { MessageSquareText } from "lucide-react";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { useAttachmentUpload } from "@/components/helpdesk/attachments/use-attachment-upload";
import { ForwardToIntakeModal } from "@/components/helpdesk/forward-to-intake-modal";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";
import { useIssues } from "@/hooks/store/use-issues";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { ConversationPanel } from "./conversation-panel";
import { DetailPanel } from "./detail-panel";
import { TicketQueue } from "./ticket-queue";
import type { TComposerMode } from "./composer";

// A public reply always reaches the customer through both channels; the only
// distinction an agent makes is public vs. internal. An internal note stays on
// the portal and is never delivered by email.
const PUBLIC_REPLY_CHANNELS = ["portal", "email"];
const INTERNAL_NOTE_CHANNELS = ["portal"];

type THelpdeskSplitViewProps = {
  workspaceSlug: string;
  requests: IHelpdeskRequest[];
  statuses: IHelpdeskStatus[];
  statusMap: Record<string, IHelpdeskStatus>;
  displayFilters: IHelpdeskDisplayFilters;
  onOrderByChange: (orderBy: THelpdeskOrderBy) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  /** Owned by the route, so a ticket URL is shareable and survives reload. */
  selectedRequestId: string | null;
  onSelectRequest: (requestId: string) => void;
  /** Mobile only: returns from the conversation to the full-width queue. */
  onClearSelection: () => void;
};

export const HelpdeskSplitView = observer(
  ({
    workspaceSlug,
    requests,
    statuses,
    statusMap,
    displayFilters,
    onOrderByChange,
    hasMore,
    isLoadingMore,
    onLoadMore,
    selectedRequestId,
    onSelectRequest,
    onClearSelection,
  }: THelpdeskSplitViewProps) => {
    const helpdeskStore = useHelpdesk();
    const { issueMap } = useIssues();
    const { getProjectById, getProjectIdentifierById, workspaceProjectIds } = useProject();
    const { getWorkspaceLabels, fetchWorkspaceLabels } = useLabel();

    const [composerMode, setComposerMode] = useState<TComposerMode>("reply");
    const [draft, setDraft] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
    const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);

    // A ticket reached by URL is very often outside the loaded page — the queue
    // holds ~100 of several thousand, and filters narrow it further. It is
    // fetched on its own and kept in local state rather than through
    // helpdeskStore.fetchRequestById, which would prepend it to the queue (wrong
    // position, possibly outside the active filter) and inflate totalCount.
    // Falling back to requests[0] here would be worse than a 404: the agent
    // would silently be shown a different ticket than the link named.
    const [offQueueRequest, setOffQueueRequest] = useState<IHelpdeskRequest | null>(null);
    const [isLoadingOffQueue, setIsLoadingOffQueue] = useState(false);
    const [isMissing, setIsMissing] = useState(false);

    const queuedRequest = useMemo(
      () => requests.find((r) => r.id === selectedRequestId),
      [requests, selectedRequestId]
    );

    useEffect(() => {
      if (!selectedRequestId || queuedRequest) {
        setOffQueueRequest(null);
        setIsMissing(false);
        return;
      }
      if (offQueueRequest?.id === selectedRequestId) return;

      let cancelled = false;
      setIsLoadingOffQueue(true);
      setIsMissing(false);
      void (async () => {
        try {
          const request = await helpdeskStore.helpdeskService.getRequestById(workspaceSlug, selectedRequestId);
          if (!cancelled) setOffQueueRequest(request);
        } catch {
          if (!cancelled) setIsMissing(true);
        } finally {
          if (!cancelled) setIsLoadingOffQueue(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [selectedRequestId, queuedRequest, offQueueRequest, workspaceSlug, helpdeskStore]);

    useEffect(() => {
      if (workspaceSlug) {
        void helpdeskStore.fetchCustomers(workspaceSlug);
      }
    }, [workspaceSlug, helpdeskStore]);

    // Load the detail bundle for whichever ticket is selected.
    useEffect(() => {
      if (!workspaceSlug || !selectedRequestId) return;
      const rId = selectedRequestId;
      helpdeskStore.fetchRequestComments(workspaceSlug, rId);
      helpdeskStore
        .fetchRequestIssues(workspaceSlug, rId)
        .then(() => helpdeskStore.hydrateLinkedIssues(workspaceSlug, rId));
      helpdeskStore.fetchRequestIntakeIssues(workspaceSlug, rId);
      helpdeskStore.fetchRequestActivities(workspaceSlug, rId);
      helpdeskStore.fetchCustomerHistory(workspaceSlug, rId);
      helpdeskStore.fetchCustomerStats(workspaceSlug, rId);
      helpdeskStore.fetchMacros(workspaceSlug);
      helpdeskStore.fetchTeams(workspaceSlug);
      helpdeskStore.markRequestRead(workspaceSlug, rId);
    }, [workspaceSlug, selectedRequestId, helpdeskStore]);

    // Tags reuse the workspace-wide label set (labels on a request are validated
    // against workspace_id, not project_id, since tickets aren't project-scoped).
    useEffect(() => {
      if (!workspaceSlug) return;
      if (!getWorkspaceLabels(workspaceSlug)) fetchWorkspaceLabels(workspaceSlug);
    }, [workspaceSlug, getWorkspaceLabels, fetchWorkspaceLabels]);

    const workspaceLabels = getWorkspaceLabels(workspaceSlug) ?? [];

    // Drafts are per-ticket in the agent's head; clear when switching rows so a
    // reply meant for one customer cannot be sent to another.
    useEffect(() => {
      setDraft("");
      setComposerMode("reply");
    }, [selectedRequestId]);

    const attachmentTransport = useMemo(
      () => ({
        getCredentials: (data: { name: string; type: string; size: number }) =>
          helpdeskStore.helpdeskService.getAssetUploadCredentials(workspaceSlug, data),
        markUploaded: (assetId: string) => helpdeskStore.helpdeskService.markAssetUploaded(workspaceSlug, assetId),
        remove: (assetId: string) => helpdeskStore.helpdeskService.deleteAsset(workspaceSlug, assetId),
      }),
      [workspaceSlug, helpdeskStore]
    );
    const attachments = useAttachmentUpload(attachmentTransport);

    // The queue copy wins when present so store updates keep flowing into it.
    const selectedRequest = queuedRequest ?? (offQueueRequest?.id === selectedRequestId ? offQueueRequest : undefined);

    const rId = selectedRequestId ?? "";
    const comments = helpdeskStore.getRequestComments(rId);
    const activities = helpdeskStore.getRequestActivities(rId);
    const customerHistory = helpdeskStore.getCustomerHistory(rId);
    const customerStats = helpdeskStore.getCustomerStats(rId);
    const macros = helpdeskStore.getWorkspaceMacros(workspaceSlug);
    const teams = helpdeskStore.getWorkspaceTeams(workspaceSlug);
    const linkedIssues = helpdeskStore.getRequestIssues(rId);
    const intakeLinks = helpdeskStore.getRequestIntakeIssues(rId);
    const unresolvedLinkedIssueIds = helpdeskStore.getUnresolvedLinkedIssues(rId);
    const commentsState = helpdeskStore.getCollectionState(`comments:${rId}`);
    const linkedIssuesState = helpdeskStore.getCollectionState(`request-issues:${rId}`);
    const intakeLinksState = helpdeskStore.getCollectionState(`request-intake-issues:${rId}`);

    const portal = useMemo(
      () => helpdeskStore.getWorkspacePortals(workspaceSlug).find((p) => p.id === selectedRequest?.portal),
      [helpdeskStore, workspaceSlug, selectedRequest]
    );

    const linkedIssueIds = useMemo(() => linkedIssues.map((i) => i.issue), [linkedIssues]);

    // updateRequest maps its response into the queue list, which is a no-op for
    // an off-queue ticket — so feed the response back into local state by hand.
    const applyRequestUpdate = useCallback((updated: IHelpdeskRequest) => {
      setOffQueueRequest((current) => (current && current.id === updated.id ? updated : current));
    }, []);

    const handleSubmitComment = useCallback(async () => {
      const content = draft.trim();
      if (!content || !selectedRequestId) return;
      const isInternal = composerMode === "note";
      setIsSubmitting(true);
      try {
        await helpdeskStore.createRequestComment(workspaceSlug, selectedRequestId, {
          content,
          is_internal: isInternal,
          delivery_channels: isInternal ? INTERNAL_NOTE_CHANNELS : PUBLIC_REPLY_CHANNELS,
          asset_ids: attachments.assetIds,
        });
        setDraft("");
        attachments.clear();
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success",
          message: isInternal ? "Internal note added" : "Reply sent to the request thread",
        });
      } catch (_error) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to add comment" });
      } finally {
        setIsSubmitting(false);
      }
    }, [draft, selectedRequestId, composerMode, helpdeskStore, workspaceSlug, attachments]);

    const handleStatusChange = useCallback(
      async (statusId: string) => {
        if (!selectedRequestId) return;
        try {
          applyRequestUpdate(
            await helpdeskStore.updateRequest(workspaceSlug, selectedRequestId, { status: statusId || null })
          );
        } catch (_error) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update status" });
        }
      },
      [helpdeskStore, workspaceSlug, selectedRequestId, applyRequestUpdate]
    );

    const handlePriorityChange = useCallback(
      async (priority: TIssuePriorities) => {
        if (!selectedRequestId) return;
        try {
          applyRequestUpdate(await helpdeskStore.updateRequest(workspaceSlug, selectedRequestId, { priority }));
        } catch (_error) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update priority" });
        }
      },
      [helpdeskStore, workspaceSlug, selectedRequestId, applyRequestUpdate]
    );

    const handleTargetDateChange = useCallback(
      async (targetDate: string | null) => {
        if (!selectedRequestId) return;
        try {
          applyRequestUpdate(
            await helpdeskStore.updateRequest(workspaceSlug, selectedRequestId, { target_date: targetDate })
          );
        } catch (_error) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update due date" });
        }
      },
      [helpdeskStore, workspaceSlug, selectedRequestId, applyRequestUpdate]
    );

    const handleAssigneesChange = useCallback(
      async (assignees: string[]) => {
        if (!selectedRequestId) return;
        try {
          applyRequestUpdate(await helpdeskStore.updateRequest(workspaceSlug, selectedRequestId, { assignees }));
        } catch (_error) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update assignees" });
        }
      },
      [helpdeskStore, workspaceSlug, selectedRequestId, applyRequestUpdate]
    );

    const handleTeamChange = useCallback(
      async (teamId: string | null) => {
        if (!selectedRequestId) return;
        try {
          applyRequestUpdate(await helpdeskStore.updateRequest(workspaceSlug, selectedRequestId, { team: teamId }));
        } catch (_error) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update team" });
        }
      },
      [helpdeskStore, workspaceSlug, selectedRequestId, applyRequestUpdate]
    );

    const handleCustomerChange = useCallback(
      async (customerId: string | null) => {
        if (!selectedRequestId) return;
        try {
          applyRequestUpdate(
            await helpdeskStore.updateRequest(workspaceSlug, selectedRequestId, { customer: customerId })
          );
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: "Sucesso",
            message: customerId ? "Cliente vinculado ao ticket." : "Cliente desvinculado.",
          });
        } catch (_error) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao vincular cliente." });
        }
      },
      [helpdeskStore, workspaceSlug, selectedRequestId, applyRequestUpdate]
    );

    const handleLabelsChange = useCallback(
      async (labelIds: string[]) => {
        if (!selectedRequestId) return;
        try {
          applyRequestUpdate(await helpdeskStore.updateRequest(workspaceSlug, selectedRequestId, { labels: labelIds }));
        } catch (_error) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update tags" });
        }
      },
      [helpdeskStore, workspaceSlug, selectedRequestId, applyRequestUpdate]
    );

    const handleToggleBookmark = useCallback(() => {
      if (!selectedRequestId) return;
      helpdeskStore.toggleBookmark(workspaceSlug, selectedRequestId);
    }, [workspaceSlug, selectedRequestId, helpdeskStore]);

    const handleSnooze = useCallback(
      (snoozedUntil: string | null) => {
        if (!selectedRequestId) return;
        helpdeskStore.snoozeRequest(workspaceSlug, selectedRequestId, snoozedUntil);
      },
      [workspaceSlug, selectedRequestId, helpdeskStore]
    );

    const handleLinkIssues = useCallback(
      async (issues: ISearchIssueResponse[]) => {
        if (!selectedRequestId) return;
        const toLink = issues.filter((issue) => !linkedIssueIds.includes(issue.id));
        if (toLink.length === 0) return;
        try {
          await Promise.all(
            toLink.map((issue) =>
              helpdeskStore.createRequestIssue(workspaceSlug, selectedRequestId, { issue: issue.id })
            )
          );
          await helpdeskStore.hydrateLinkedIssues(workspaceSlug, selectedRequestId);
          setToast({ type: TOAST_TYPE.SUCCESS, title: "Success", message: "Issue linked successfully" });
        } catch (_error) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not link the selected issue" });
        }
      },
      [helpdeskStore, workspaceSlug, selectedRequestId, linkedIssueIds]
    );

    const handleUnlinkIssue = useCallback(
      async (requestIssueId: string) => {
        if (!selectedRequestId) return;
        try {
          await helpdeskStore.deleteRequestIssue(workspaceSlug, requestIssueId, selectedRequestId);
          setToast({ type: TOAST_TYPE.SUCCESS, title: "Success", message: "Issue unlinked" });
        } catch (_error) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not unlink the issue" });
        }
      },
      [helpdeskStore, workspaceSlug, selectedRequestId]
    );

    const handleForward = useCallback(
      async (payload: { project: string; title: string; description?: string }) => {
        if (!selectedRequestId) return;
        try {
          await helpdeskStore.createRequestIntakeIssue(workspaceSlug, selectedRequestId, payload);
          setIsForwardModalOpen(false);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: "Forwarded",
            message: "Intake issue created in the selected project",
          });
        } catch (_error) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not forward to Intake" });
        }
      },
      [helpdeskStore, workspaceSlug, selectedRequestId]
    );

    const handleUnlinkIntake = useCallback(
      async (linkId: string) => {
        if (!selectedRequestId) return;
        try {
          await helpdeskStore.deleteRequestIntakeIssue(workspaceSlug, linkId, selectedRequestId);
          setToast({ type: TOAST_TYPE.SUCCESS, title: "Success", message: "Intake issue link removed" });
        } catch (_error) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not remove intake link" });
        }
      },
      [helpdeskStore, workspaceSlug, selectedRequestId]
    );

    return (
      <>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <TicketQueue
            requests={requests}
            statusMap={statusMap}
            selectedRequestId={selectedRequestId}
            onSelect={onSelectRequest}
            displayFilters={displayFilters}
            onOrderByChange={onOrderByChange}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={onLoadMore}
            isTicketOpen={!!selectedRequestId}
          />

          {selectedRequest ? (
            <>
              <ConversationPanel
                request={selectedRequest}
                comments={comments}
                activities={activities}
                customerHistory={customerHistory}
                macros={macros}
                teams={teams}
                isLoadingComments={commentsState.isLoading}
                statuses={statuses}
                statusMap={statusMap}
                onStatusChange={handleStatusChange}
                onPriorityChange={handlePriorityChange}
                onAssigneesChange={handleAssigneesChange}
                onTeamChange={handleTeamChange}
                onToggleBookmark={handleToggleBookmark}
                onSnooze={handleSnooze}
                composerMode={composerMode}
                onComposerModeChange={setComposerMode}
                draft={draft}
                onDraftChange={setDraft}
                onSubmit={handleSubmitComment}
                isSubmitting={isSubmitting}
                attachments={attachments}
                onBackToQueue={onClearSelection}
                workspaceSlug={workspaceSlug}
              />

              <DetailPanel
                workspaceSlug={workspaceSlug}
                request={selectedRequest}
                statusMap={statusMap}
                portal={portal}
                customerStats={customerStats}
                customers={helpdeskStore.getWorkspaceCustomers(workspaceSlug)}
                onCustomerChange={handleCustomerChange}
                onAssigneesChange={handleAssigneesChange}
                onPriorityChange={handlePriorityChange}
                onTargetDateChange={handleTargetDateChange}
                teams={teams}
                onTeamChange={handleTeamChange}
                labels={workspaceLabels}
                onLabelsChange={handleLabelsChange}
                intakeLinks={intakeLinks}
                isLoadingIntakeLinks={intakeLinksState.isLoading}
                onForward={() => setIsForwardModalOpen(true)}
                onUnlinkIntake={handleUnlinkIntake}
                linkedIssues={linkedIssues}
                isLoadingLinkedIssues={linkedIssuesState.isLoading}
                unresolvedLinkedIssueIds={unresolvedLinkedIssueIds}
                onAddLinkedIssue={() => setIsIssueModalOpen(true)}
                onUnlinkIssue={handleUnlinkIssue}
                getIssueById={(issueId) => issueMap[issueId]}
                getProjectIdentifierById={getProjectIdentifierById}
                getProjectById={getProjectById}
              />
            </>
          ) : isLoadingOffQueue ? (
            <div className="hidden flex-1 items-center justify-center lg:flex">
              <div className="size-7 animate-spin rounded-full border-b-2 border-accent-strong" />
            </div>
          ) : isMissing ? (
            <div className="hidden flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center lg:flex">
              <MessageSquareText className="mb-2 size-7 text-tertiary" />
              <p className="text-13 font-medium text-primary">Ticket não encontrado</p>
              <p className="max-w-sm text-12 text-tertiary">
                Este ticket foi removido ou você não tem acesso a ele. Escolha outro na fila à esquerda.
              </p>
            </div>
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center lg:flex">
              <MessageSquareText className="mb-2 size-7 text-tertiary" />
              <p className="text-13 font-medium text-primary">Selecione um ticket</p>
              <p className="text-12 text-tertiary">Escolha uma conversa na fila à esquerda para começar a triagem.</p>
            </div>
          )}
        </div>

        <ExistingIssuesListModal
          workspaceSlug={workspaceSlug}
          isOpen={isIssueModalOpen}
          handleClose={() => setIsIssueModalOpen(false)}
          searchParams={{}}
          shouldHideIssue={(issue) => linkedIssueIds.includes(issue.id)}
          handleOnSubmit={handleLinkIssues}
        />

        <ForwardToIntakeModal
          isOpen={isForwardModalOpen}
          onClose={() => setIsForwardModalOpen(false)}
          projectIds={workspaceProjectIds || []}
          getProjectById={getProjectById}
          defaultTitle={selectedRequest?.title ?? ""}
          defaultDescription={selectedRequest?.description ?? ""}
          onSubmit={handleForward}
        />
      </>
    );
  }
);
