/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useHelpdeskSSE, type THelpdeskSSEEvent } from "@/hooks/use-helpdesk-sse";
import { observer } from "mobx-react";
import { Link, useParams } from "react-router";
import type { TIntakeIssueStatus } from "@plane/types";
import { Badge } from "@plane/propel/badge";
import { Button } from "@plane/propel/button";
import { Switch } from "@plane/propel/switch";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IHelpdeskStatus, ISearchIssueResponse } from "@plane/types";
import { AppHeader } from "@/components/core/app-header";
import { DateDropdown } from "@/components/dropdowns/date";
import { generateWorkItemLink, getDate, renderFormattedPayloadDate } from "@plane/utils";

const FORM_RESPONSE_LABELS: Record<string, string> = {
  category_1: "Categoria",
  category_2: "Subcategoria",
  category_3: "Detalhe",
  erpnext_name: "ERP ID",
  erpnext_status: "Status ERP",
  erpnext_creation: "Criado no ERP",
  erpnext_modified: "Modificado no ERP",
  resolution_deadline: "Prazo de resolução",
  resolved_at: "Resolvido em",
  first_responded_at: "Primeira resposta em",
  sector_applicant: "Departamento do solicitante",
  employee_name: "Nome do funcionário",
  employee_sector: "Departamento do funcionário",
  employee_id: "ID do funcionário",
  date_entry: "Data de abertura",
  owner: "Responsável ERP",
  assigned_user: "Atribuído a (ERP)",
  attach: "Anexo",
  link_doc: "Links de documentos",
};

const HIDDEN_FORM_RESPONSE_KEYS = new Set(["erpnext_creation", "erpnext_modified"]);

function labelFor(key: string): string {
  return FORM_RESPONSE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFormValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}
import {
  ArrowLeft,
  ArrowUpRight,
  Link2,
  Lock,
  MessageCircleMore,
  MessageSquareText,
  Plus,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { AttachmentPicker } from "@/components/helpdesk/attachments/attachment-picker";
import {
  CommentAttachments,
  PendingAttachmentChips,
} from "@/components/helpdesk/attachments/attachment-chips";
import { useAttachmentUpload } from "@/components/helpdesk/attachments/use-attachment-upload";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
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
      remove: (assetId: string) =>
        helpdeskStore.helpdeskService.deleteAsset(workspaceSlug?.toString() || "", assetId),
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
      <div className="flex h-full w-full flex-col bg-surface-1">
        <AppHeader
          rowClassName="h-auto min-h-11 py-2.5"
          header={
            <div className="flex w-full items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Link to={`/${wSlug}/helpdesk`} className="shrink-0 text-tertiary transition-colors hover:text-primary">
                  <ArrowLeft className="size-4" />
                </Link>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    {request.display_id && (
                      <span className="font-mono shrink-0 text-11 text-tertiary">{request.display_id}</span>
                    )}
                    <h1 className="text-sm text-text-100 min-w-0 truncate font-semibold">{request.title}</h1>
                    {request.status && statusMap[request.status] && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-11 font-medium"
                        style={{
                          backgroundColor: `${statusMap[request.status].color}1f`,
                          color: statusMap[request.status].color,
                        }}
                      >
                        <span
                          className="block size-[5px] shrink-0 rounded-full"
                          style={{ backgroundColor: statusMap[request.status].color }}
                        />
                        {statusMap[request.status].name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-400 mt-0.5 truncate">
                    {request.contact_email || "Authenticated customer"} ·{" "}
                    {request.source === "public_form" ? "Public form" : "Internal form"} ·{" "}
                    {new Date(request.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setIsIssueModalOpen(true)}>
                <span className="flex items-center gap-2">
                  <Link2 className="size-4" />
                  Link issue
                </span>
              </Button>
            </div>
          }
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Main content — conversation (70%) */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-subtle px-4 py-3">
              <MessageCircleMore className="text-text-300 size-4" />
              <h2 className="text-sm text-text-100 font-semibold">Conversation</h2>
              <span className="text-xs text-text-400">· replies and internal notes</span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5">
              <div className="mx-auto max-w-3xl space-y-5">
                {/* Original customer message — always shown as first bubble */}
                <div className="shadow-sm rounded-xl border border-subtle bg-surface-2 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="text-text-300 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-1">
                      <MessageSquareText className="size-3.5" />
                    </div>
                    <span className="text-sm text-text-100 font-medium">{request.contact_email || "Customer"}</span>
                    <Badge variant="neutral" size="sm">
                      Original request
                    </Badge>
                    <span className="text-text-400 ml-auto text-11">
                      {new Date(request.created_at).toLocaleString()}
                    </span>
                  </div>
                  {request.description ? (
                    <div
                      className="prose-sm prose-invert text-sm text-text-200 max-w-none prose [&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: request.description }}
                    />
                  ) : (
                    <p className="text-sm text-text-400 italic">No description provided.</p>
                  )}
                </div>

                {commentsState.isLoading && comments.length === 0 ? (
                  <div className="flex justify-center py-10">
                    <div className="border-primary h-7 w-7 animate-spin rounded-full border-b-2" />
                  </div>
                ) : (
                  comments.map((comment) => {
                    // Three states, not a boolean. `!!comment.actor` sent every
                    // unattributed comment down the customer branch, so an
                    // inbound message whose sender could not be proven was
                    // shown to the agent as though the *customer* had written
                    // it -- the same misattribution as the forged-agent bug,
                    // pointed the other way. Alignment, surface, icon and name
                    // all derive from this instead.
                    const authorKind = comment.actor ? "agent" : comment.customer ? "customer" : "unattributed";
                    const isAgent = authorKind === "agent";
                    const avatarClass = isAgent ? "bg-primary/10 text-primary" : "bg-surface-2 text-text-300";
                    // actor_detail/customer_detail may be absent on comments
                    // cached before the API started sending them, so both the
                    // name and the avatar fall back to the previous behaviour.
                    // "Participant" is factual and passes no judgement: whoever
                    // wrote it is a participant of the ticket, which is true in
                    // the benign case too. It deliberately does not distinguish
                    // a spoof from a false positive.
                    const authorName =
                      authorKind === "agent"
                        ? (comment.actor_detail?.display_name ?? "Agent")
                        : authorKind === "customer"
                          ? (comment.customer_detail?.name ?? "Customer")
                          : "Participant";
                    const avatarUrl = isAgent ? comment.actor_detail?.avatar_url : null;
                    return (
                      <div key={comment.id} className={`flex gap-3 ${isAgent ? "flex-row-reverse" : "flex-row"}`}>
                        <div
                          className={`mt-0.5 flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full ${comment.is_internal ? "text-blue-400" : avatarClass}`}
                          style={comment.is_internal ? { backgroundColor: "rgba(59,130,246,0.15)" } : undefined}
                        >
                          {avatarUrl ? (
                            <img src={avatarUrl} alt={authorName} className="size-full object-cover" />
                          ) : authorKind === "agent" ? (
                            <UserRound className="size-3.5" />
                          ) : authorKind === "customer" ? (
                            <MessageSquareText className="size-3.5" />
                          ) : (
                            // Generic, from the same family as the customer
                            // icon: it must not read as a warning badge.
                            <MessageCircleMore className="size-3.5" />
                          )}
                        </div>
                        <div className={`flex max-w-[80%] min-w-0 flex-col ${isAgent ? "items-end" : "items-start"}`}>
                          <div className={`mb-1.5 flex items-center gap-2 ${isAgent ? "flex-row-reverse" : ""}`}>
                            <span className="text-sm text-text-100 font-medium">{authorName}</span>
                            {comment.is_internal && (
                              <Badge variant="neutral" size="sm">
                                Internal note
                              </Badge>
                            )}
                            {!comment.is_internal &&
                              comment.delivery_channels &&
                              comment.delivery_channels.length > 0 && (
                                <Badge variant="neutral" size="sm">
                                  Sent via{" "}
                                  {comment.delivery_channels
                                    .map((c) => c.charAt(0).toUpperCase() + c.slice(1))
                                    .join(" + ")}
                                </Badge>
                              )}
                            {comment.email_status === "failed" && (
                              <Badge variant="danger" size="sm">
                                ❌ Delivery failed
                              </Badge>
                            )}
                            {comment.email_status === "pending" && (
                              <Badge variant="warning" size="sm">
                                ⏳ Pending
                              </Badge>
                            )}
                            <span className="text-text-400 text-11">
                              {new Date(comment.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div
                            className={`text-sm shadow-sm rounded-xl border px-4 py-3 ${comment.is_internal ? "" : "text-text-100 border-subtle bg-surface-2"}`}
                            style={
                              comment.is_internal
                                ? {
                                    backgroundColor: "rgba(59,130,246,0.12)",
                                    borderColor: "rgba(59,130,246,0.35)",
                                    color: "#bfdbfe",
                                  }
                                : undefined
                            }
                          >
                            <p className="whitespace-pre-wrap">{comment.content}</p>
                            <CommentAttachments attachments={comment.attachments} />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="border-t border-subtle px-4 py-3">
              <div className="mx-auto max-w-3xl">
                <div
                  className={`rounded-lg border bg-surface-2 transition-colors focus-within:border-strong ${
                    isInternalNote ? "border-amber-500/30 bg-amber-500/5" : "border-subtle"
                  }`}
                >
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={
                      isInternalNote ? "Capture context for the team..." : "Write a reply to the customer..."
                    }
                    className="text-sm text-text-100 min-h-[72px] w-full resize-none bg-transparent p-3 outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleAddComment();
                      }
                    }}
                  />
                  <PendingAttachmentChips attachments={attachments.pending} onRemove={attachments.remove} />
                  <div className="flex items-center justify-between gap-3 px-3 pb-2.5">
                    {/* A bordered chip in both states: the control previously had
                        no background or border when off, so nothing signalled it
                        was clickable. aria-pressed carries the state to screen
                        readers, which the bare colour change did not. */}
                    <button
                      type="button"
                      onClick={() => setIsInternalNote((v) => !v)}
                      aria-pressed={isInternalNote}
                      className={`text-xs flex items-center gap-2 rounded-md border px-2 py-1 transition-colors ${
                        isInternalNote
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                          : "text-text-300 hover:text-text-100 border-subtle bg-surface-2 hover:bg-layer-1"
                      }`}
                    >
                      <Lock className="size-3.5" />
                      Internal note
                      <Switch value={isInternalNote} onChange={() => setIsInternalNote((v) => !v)} />
                    </button>
                    <AttachmentPicker onSelect={attachments.upload} disabled={submittingComment} />
                    <div className="flex items-center gap-2">
                      <p className="text-text-400 hidden text-11 sm:block">Ctrl/Cmd + Enter</p>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleAddComment}
                        disabled={submittingComment || !newComment.trim()}
                      >
                        <span className="flex items-center gap-1.5">
                          <Send className="size-3.5" />
                          {isInternalNote ? "Save note" : "Send reply"}
                        </span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar (30%) */}
          <aside className="w-[30%] max-w-[380px] min-w-[260px] shrink-0 overflow-y-auto border-l border-subtle bg-surface-2">
            <div className="flex flex-col">
              {/* Request details */}
              <section className="border-b border-subtle p-4">
                <h2 className="text-xs tracking-wider text-text-400 mb-3 font-semibold uppercase">Request details</h2>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-text-400 shrink-0">Status</p>
                    <select
                      value={request.status ?? ""}
                      onChange={(e) => helpdeskStore.updateRequest(wSlug, rId, { status: e.target.value })}
                      className="text-sm max-w-[60%] cursor-pointer rounded-md border px-2 py-1 font-medium transition-colors outline-none"
                      style={
                        request.status && statusMap[request.status]
                          ? {
                              backgroundColor: `${statusMap[request.status].color}1f`,
                              color: statusMap[request.status].color,
                              borderColor: `${statusMap[request.status].color}40`,
                            }
                          : undefined
                      }
                    >
                      <option value="">— No status —</option>
                      {statuses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-text-400 shrink-0">Contact</p>
                    <p className="text-sm text-text-100 truncate">{request.contact_email || "Authenticated"}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-text-400 shrink-0">Source</p>
                    <p className="text-sm text-text-100">
                      {request.source === "public_form" ? "Public form" : "Internal form"}
                    </p>
                  </div>
                  {request.form_detail ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-text-400 shrink-0">Form</p>
                      <p className="text-sm text-text-100 truncate">{request.form_detail.name}</p>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-text-400 shrink-0">Assignees</p>
                    <MemberDropdown
                      value={request.assignees}
                      onChange={(assignees: string[]) => helpdeskStore.updateRequest(wSlug, rId, { assignees })}
                      multiple
                      buttonVariant={request.assignees.length > 0 ? "transparent-without-text" : "border-without-text"}
                      buttonClassName={request.assignees.length > 0 ? "hover:bg-transparent px-0" : ""}
                      placeholder="Assign"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-text-400 shrink-0">Start date</p>
                    <DateDropdown
                      placeholder="Add start date"
                      value={request.start_date}
                      onChange={(val) =>
                        helpdeskStore.updateRequest(wSlug, rId, {
                          start_date: val ? renderFormattedPayloadDate(val) : null,
                        })
                      }
                      maxDate={request.target_date ? (getDate(request.target_date) ?? undefined) : undefined}
                      buttonVariant="transparent-with-text"
                      className="group w-full grow"
                      buttonContainerClassName="w-full text-right h-7"
                      buttonClassName={`text-sm ${request.start_date ? "text-text-100" : "text-text-400"}`}
                      hideIcon
                      clearIconClassName="h-3 w-3 hidden group-hover:inline"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-text-400 shrink-0">Due date</p>
                    <DateDropdown
                      placeholder="Add due date"
                      value={request.target_date}
                      onChange={(val) =>
                        helpdeskStore.updateRequest(wSlug, rId, {
                          target_date: val ? renderFormattedPayloadDate(val) : null,
                        })
                      }
                      minDate={request.start_date ? (getDate(request.start_date) ?? undefined) : undefined}
                      buttonVariant="transparent-with-text"
                      className="group w-full grow"
                      buttonContainerClassName="w-full text-right h-7"
                      buttonClassName={`text-sm ${request.target_date ? "text-text-100" : "text-text-400"}`}
                      hideIcon
                      clearIconClassName="h-3 w-3 hidden group-hover:inline"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-text-400 shrink-0">Updated</p>
                    <p className="text-sm text-text-100 truncate">
                      {new Date(request.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </section>

              {/* Form responses */}
              {Object.keys(request.form_responses || {}).filter((k) => !HIDDEN_FORM_RESPONSE_KEYS.has(k)).length > 0 ? (
                <section className="border-b border-subtle p-4">
                  <h2 className="text-xs tracking-wider text-text-400 mb-3 font-semibold uppercase">
                    Detalhes do formulário
                  </h2>
                  <div className="space-y-2.5">
                    {Object.entries(request.form_responses || {})
                      .filter(([key, value]) => !HIDDEN_FORM_RESPONSE_KEYS.has(key) && formatFormValue(value) !== "—")
                      .map(([key, value]) => {
                        const field = request.form_detail?.fields_detail?.find((item) => item.key === key);
                        return (
                          <div key={key} className="flex items-start justify-between gap-2">
                            <p className="text-xs text-text-400 shrink-0 pt-0.5">{field?.label || labelFor(key)}</p>
                            <p className="text-sm text-text-100 text-right break-all">{formatFormValue(value)}</p>
                          </div>
                        );
                      })}
                  </div>
                </section>
              ) : null}

              {/* Dev pipeline — Intake links */}
              <section className="border-b border-subtle p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-xs tracking-wider text-text-400 font-semibold uppercase">Dev pipeline</h2>
                  <Button variant="secondary" size="sm" onClick={openForwardModal}>
                    <span className="flex items-center gap-1.5">
                      <ArrowUpRight className="size-3.5" />
                      Forward
                    </span>
                  </Button>
                </div>

                {intakeLinksState.isLoading && intakeLinks.length === 0 ? (
                  <div className="flex justify-center py-4">
                    <div className="border-primary h-6 w-6 animate-spin rounded-full border-b-2" />
                  </div>
                ) : intakeLinks.length === 0 ? (
                  <p className="text-xs text-text-400">No intake issues yet. Forward to create one.</p>
                ) : (
                  <div className="space-y-1">
                    {intakeLinks.map((link) => {
                      const project = getProjectById(link.forwarded_to_project);
                      const identifier = link.project_identifier || project?.identifier;
                      const intakeUrl = project ? `/${wSlug}/projects/${link.forwarded_to_project}/intake` : "#";
                      const intakeMeta =
                        link.intake_status != null ? INTAKE_STATUS_META[link.intake_status] : INTAKE_STATUS_META[-2];
                      return (
                        <div
                          key={link.id}
                          className="group -mx-2 rounded-md px-2 py-2 transition-colors hover:bg-surface-1"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Link to={intakeUrl} className="min-w-0 flex-1 hover:text-primary">
                              <div className="flex items-center gap-1.5">
                                {identifier ? (
                                  <span className="text-text-400 rounded bg-surface-1 px-1 py-0.5 text-11 font-semibold">
                                    {identifier}
                                  </span>
                                ) : null}
                                <p className="text-sm text-text-100 truncate font-medium">
                                  {project?.name || link.forwarded_to_project}
                                </p>
                              </div>
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <Badge variant={intakeMeta.variant} size="sm">
                                  {intakeMeta.label}
                                </Badge>
                                {link.intake_status === 1 && link.issue_id && (
                                  <Link
                                    to={`/${wSlug}/projects/${link.forwarded_to_project}/issues/${link.issue_id}`}
                                    className="text-xs text-primary hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    View issue →
                                  </Link>
                                )}
                              </div>
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleUnlinkIntakeIssue(link.id)}
                              className="text-text-300 hover:bg-red-500/10 hover:text-red-500 shrink-0 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100"
                              title="Remove intake link"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Linked issues */}
              <section className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-xs tracking-wider text-text-400 font-semibold uppercase">Linked issues</h2>
                  <Button variant="secondary" size="sm" onClick={() => setIsIssueModalOpen(true)}>
                    <span className="flex items-center gap-1.5">
                      <Plus className="size-3.5" />
                      Add
                    </span>
                  </Button>
                </div>

                {linkedIssuesState.isLoading && linkedIssues.length === 0 ? (
                  <div className="flex justify-center py-4">
                    <div className="border-primary h-6 w-6 animate-spin rounded-full border-b-2" />
                  </div>
                ) : linkedIssues.length === 0 ? (
                  <p className="text-xs text-text-400">No linked issues yet.</p>
                ) : (
                  <div className="space-y-1">
                    {linkedIssues.map((requestIssue) => {
                      const issue = issueMap[requestIssue.issue];
                      const isUnavailable = unresolvedLinkedIssues.includes(requestIssue.issue);
                      const projectIdentifier = getProjectIdentifierById(issue?.project_id);
                      const workItemLink =
                        issue && issue.project_id && projectIdentifier
                          ? generateWorkItemLink({
                              workspaceSlug: wSlug,
                              projectId: issue.project_id,
                              issueId: requestIssue.issue,
                              projectIdentifier,
                              sequenceId: issue.sequence_id,
                            })
                          : undefined;

                      return (
                        <div
                          key={requestIssue.id}
                          className="group -mx-2 rounded-md px-2 py-2 transition-colors hover:bg-surface-1"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Link to={workItemLink || "#"} className="min-w-0 flex-1">
                              {issue && issue.project_id && projectIdentifier ? (
                                <IssueIdentifier
                                  projectId={issue.project_id}
                                  issueTypeId={issue.type_id}
                                  projectIdentifier={projectIdentifier}
                                  issueSequenceId={issue.sequence_id}
                                  size="xs"
                                  variant="secondary"
                                />
                              ) : (
                                <Badge variant="neutral" size="sm">
                                  {isUnavailable ? "Issue unavailable" : "Linked issue"}
                                </Badge>
                              )}
                              <p className="text-sm text-text-100 mt-1 truncate font-medium">
                                {issue?.name || requestIssue.issue}
                              </p>
                              <p className="text-text-400 mt-0.5 text-11">
                                {isUnavailable
                                  ? "This issue could not be loaded."
                                  : `Linked ${new Date(requestIssue.created_at).toLocaleDateString()}`}
                              </p>
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleUnlinkIssue(requestIssue.id)}
                              className="text-text-300 hover:bg-red-500/10 hover:text-red-500 shrink-0 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100"
                              title="Unlink issue"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </aside>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="shadow-xl w-full max-w-md rounded-xl border border-subtle bg-surface-1 p-6">
            <div className="mb-5">
              <h2 className="text-base text-text-100 font-semibold">Forward to Intake</h2>
              <p className="text-sm text-text-400 mt-1">
                This will create an Intake issue in the selected project for the dev team to review.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="forward-project" className="text-xs text-text-400 mb-1.5 block font-medium">
                  Project
                </label>
                <select
                  id="forward-project"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="text-sm text-text-100 focus:border-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 transition-colors outline-none"
                >
                  <option value="">Select a project…</option>
                  {(workspaceProjectIds || []).map((projectId) => {
                    const project = getProjectById(projectId);
                    if (!project) return null;
                    return (
                      <option key={projectId} value={projectId}>
                        {project.identifier} — {project.name}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label htmlFor="forward-title" className="text-xs text-text-400 mb-1.5 block font-medium">
                  Title
                </label>
                <input
                  id="forward-title"
                  value={forwardTitle}
                  onChange={(e) => setForwardTitle(e.target.value)}
                  placeholder="Issue title for the dev team"
                  className="text-sm text-text-100 focus:border-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 transition-colors outline-none"
                />
              </div>

              <div>
                <label htmlFor="forward-description" className="text-xs text-text-400 mb-1.5 block font-medium">
                  Description (optional)
                </label>
                <textarea
                  id="forward-description"
                  value={forwardDescription}
                  onChange={(e) => setForwardDescription(e.target.value)}
                  placeholder="Additional context for the dev team…"
                  className="text-sm text-text-100 focus:border-primary min-h-20 w-full resize-none rounded-md border border-subtle bg-surface-2 px-3 py-2 transition-colors outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <Button variant="ghost" size="base" onClick={() => setIsForwardModalOpen(false)} disabled={isForwarding}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="base"
                onClick={handleForwardToIntake}
                disabled={isForwarding || !selectedProjectId || !forwardTitle.trim()}
              >
                <span className="flex items-center gap-2">
                  <ArrowUpRight className="size-4" />
                  {isForwarding ? "Forwarding…" : "Forward to Intake"}
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default WorkspaceRequestDetailPage;
