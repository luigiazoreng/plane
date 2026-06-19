/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Link, useParams } from "react-router";
import type { TIntakeIssueStatus } from "@plane/types";
import { Badge } from "@plane/propel/badge";
import { Button } from "@plane/propel/button";
import { Switch } from "@plane/propel/switch";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IHelpdeskStatus, ISearchIssueResponse } from "@plane/types";
import { AppHeader } from "@/components/core/app-header";
import { generateWorkItemLink } from "@plane/utils";
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

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      await helpdeskStore.createRequestComment(wSlug, rId, {
        content: newComment.trim(),
        is_internal: isInternalNote,
      });
      setNewComment("");
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
          header={
            <div className="flex w-full items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Link to={`/${wSlug}/helpdesk`} className="text-tertiary transition-colors hover:text-primary">
                  <ArrowLeft className="size-4" />
                </Link>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {request.display_id && (
                      <span className="shrink-0 font-mono text-11 text-tertiary">{request.display_id}</span>
                    )}
                    <h1 className="text-sm text-text-100 truncate font-semibold">{request.title}</h1>
                    {request.status && statusMap[request.status] && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-11 font-medium"
                        style={{
                          backgroundColor: `${statusMap[request.status].color}22`,
                          color: statusMap[request.status].color,
                        }}
                      >
                        {statusMap[request.status].name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-400 truncate">
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
          {/* Main content — conversation */}
          <div className="flex min-w-0 flex-1 flex-col border-r border-subtle">
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="mx-auto flex max-w-4xl flex-col gap-6">
                <section className="rounded-xl border border-subtle bg-surface-2 p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs tracking-wider text-text-400 uppercase">Original request</p>
                      <div className="mt-2 flex items-center gap-2">
                        {request.display_id && (
                          <span className="font-mono text-12 text-tertiary">{request.display_id}</span>
                        )}
                        <h2 className="text-base text-text-100 font-semibold">{request.title}</h2>
                      </div>
                      {request.form_detail ? (
                        <p className="text-xs text-text-400 mt-1">
                          Submitted via form: <span className="text-text-100">{request.form_detail.name}</span>
                        </p>
                      ) : null}
                    </div>
                    <Badge variant="neutral" size="sm">
                      {request.customer ? "Authenticated" : "Anonymous"}
                    </Badge>
                  </div>
                  <div className="text-sm text-text-300 whitespace-pre-wrap">{request.description}</div>
                  {Object.keys(request.form_responses || {}).length > 0 ? (
                    <div className="mt-5 border-t border-subtle pt-4">
                      <p className="text-xs tracking-wider text-text-400 uppercase">Form responses</p>
                      <div className="mt-3 space-y-3">
                        {Object.entries(request.form_responses || {}).map(([key, value]) => {
                          const field = request.form_detail?.fields_detail?.find((item) => item.key === key);
                          return (
                            <div key={key} className="rounded-lg border border-subtle bg-surface-1 p-3">
                              <p className="text-xs text-text-400">{field?.label || key}</p>
                              <div className="text-sm text-text-100 mt-1 whitespace-pre-wrap">
                                {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="rounded-xl border border-subtle bg-surface-2">
                  <div className="border-b border-subtle px-5 py-4">
                    <div className="flex items-center gap-2">
                      <MessageCircleMore className="text-text-300 size-4" />
                      <div>
                        <h2 className="text-base text-text-100 font-semibold">Conversation</h2>
                        <p className="text-sm text-text-400">Visible replies and internal notes in one timeline.</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    {commentsState.isLoading && comments.length === 0 ? (
                      <div className="flex justify-center py-8">
                        <div className="border-primary h-7 w-7 animate-spin rounded-full border-b-2" />
                      </div>
                    ) : comments.length === 0 ? (
                      <p className="text-sm text-text-400 py-8 text-center">No replies yet.</p>
                    ) : (
                      comments.map((comment) => {
                        const isAgent = !!comment.actor;
                        return (
                          <div key={comment.id} className={`flex ${isAgent ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[90%] rounded-xl border p-4 md:max-w-[80%] ${
                                comment.is_internal
                                  ? "border-amber-500/20 bg-amber-500/5"
                                  : isAgent
                                    ? "border-primary/20 bg-primary/5"
                                    : "border-subtle bg-surface-1"
                              }`}
                            >
                              <div className="mb-2 flex items-center gap-2">
                                {isAgent ? (
                                  <UserRound className="size-4 text-primary" />
                                ) : (
                                  <MessageSquareText className="text-text-300 size-4" />
                                )}
                                <span className="text-sm text-text-100 font-medium">
                                  {isAgent ? "Agent" : "Customer"}
                                </span>
                                {comment.is_internal && (
                                  <Badge variant="warning" size="sm">
                                    Internal note
                                  </Badge>
                                )}
                                <span className="text-xs text-text-400">
                                  {new Date(comment.created_at).toLocaleString()}
                                </span>
                              </div>
                              <div className="text-sm text-text-300 whitespace-pre-wrap">{comment.content}</div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              </div>
            </div>

            <div className="border-t border-subtle bg-surface-2 p-4">
              <div className="mx-auto max-w-4xl rounded-xl border border-subtle bg-surface-1 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-text-100 font-medium">
                      {isInternalNote ? "Add internal note" : "Reply to customer"}
                    </p>
                    <p className="text-xs text-text-400">
                      {isInternalNote
                        ? "Only agents will see this note."
                        : "This message will appear in the customer conversation."}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Lock className="text-text-300 size-4" />
                    <span className="text-xs text-text-400">Internal note</span>
                    <Switch value={isInternalNote} onChange={() => setIsInternalNote((v) => !v)} />
                  </div>
                </div>

                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={isInternalNote ? "Capture context for the team..." : "Write a reply to the customer..."}
                  className="text-sm text-text-100 focus:border-primary min-h-[110px] w-full resize-none rounded-lg border border-subtle bg-surface-2 p-3 transition-colors outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                />

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-text-400">Press Ctrl/Cmd + Enter to send quickly.</p>
                  <Button
                    variant="primary"
                    size="base"
                    onClick={handleAddComment}
                    disabled={submittingComment || !newComment.trim()}
                  >
                    <span className="flex items-center gap-2">
                      <Send className="size-4" />
                      {isInternalNote ? "Save note" : "Send reply"}
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <aside className="hidden w-[340px] shrink-0 overflow-y-auto bg-surface-2 xl:block">
            <div className="space-y-6 p-5">
              {/* Request details */}
              <section className="rounded-xl border border-subtle bg-surface-1 p-4">
                <h2 className="text-sm tracking-wider text-text-400 mb-4 font-semibold uppercase">Request details</h2>
                <div className="text-sm space-y-4">
                  <div>
                    <p className="text-xs text-text-400 mb-1">Status</p>
                    <select
                      value={request.status ?? ""}
                      onChange={(e) => helpdeskStore.updateRequest(wSlug, rId, { status: e.target.value })}
                      className="text-sm text-text-100 focus:border-primary w-full rounded-md border border-subtle bg-surface-2 px-2 py-1.5 transition-colors outline-none"
                    >
                      <option value="">— No status —</option>
                      {statuses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-text-400 mb-1">Contact</p>
                    <p className="text-text-100">{request.contact_email || "Authenticated customer"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-400 mb-1">Source</p>
                    <p className="text-text-100">
                      {request.source === "public_form" ? "Public form" : "Internal form"}
                    </p>
                  </div>
                  {request.form_detail ? (
                    <div>
                      <p className="text-xs text-text-400 mb-1">Form</p>
                      <p className="text-text-100">{request.form_detail.name}</p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs text-text-400 mb-1">Assignees</p>
                    <MemberDropdown
                      value={request.assignees}
                      onChange={(assignees: string[]) => helpdeskStore.updateRequest(wSlug, rId, { assignees })}
                      multiple
                      buttonVariant={request.assignees.length > 0 ? "transparent-without-text" : "border-without-text"}
                      buttonClassName={request.assignees.length > 0 ? "hover:bg-transparent px-0" : ""}
                      placeholder="Assign agent"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-text-400 mb-1">Updated</p>
                    <p className="text-text-100">{new Date(request.updated_at).toLocaleString()}</p>
                  </div>
                </div>
              </section>

              {/* Dev pipeline — Intake links */}
              <section className="rounded-xl border border-subtle bg-surface-1 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm tracking-wider text-text-400 font-semibold uppercase">Dev pipeline</h2>
                    <p className="text-xs text-text-400 mt-1">Intake issues created from this ticket.</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={openForwardModal}>
                    <span className="flex items-center gap-2">
                      <ArrowUpRight className="size-4" />
                      Forward
                    </span>
                  </Button>
                </div>

                {intakeLinksState.isLoading && intakeLinks.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <div className="border-primary h-7 w-7 animate-spin rounded-full border-b-2" />
                  </div>
                ) : intakeLinks.length === 0 ? (
                  <p className="text-sm text-text-400">
                    No intake issues yet. Forward this ticket to a project to create one.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {intakeLinks.map((link) => {
                      const project = getProjectById(link.forwarded_to_project);
                      const identifier = link.project_identifier || project?.identifier;
                      const intakeUrl = project ? `/${wSlug}/projects/${link.forwarded_to_project}/intake` : "#";
                      const intakeMeta =
                        link.intake_status != null ? INTAKE_STATUS_META[link.intake_status] : INTAKE_STATUS_META[-2];
                      return (
                        <div key={link.id} className="rounded-lg border border-subtle bg-surface-2 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <Link to={intakeUrl} className="min-w-0 flex-1 hover:text-primary">
                              <div className="flex items-center gap-2">
                                {identifier ? (
                                  <span className="text-xs text-text-400 rounded bg-surface-1 px-1 py-0.5 font-semibold">
                                    {identifier}
                                  </span>
                                ) : null}
                                <p className="text-sm text-text-100 truncate font-medium">
                                  {project?.name || link.forwarded_to_project}
                                </p>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
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
                              className="text-text-300 hover:bg-red-500/10 hover:text-red-500 rounded p-0.5 transition-colors"
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
              <section className="rounded-xl border border-subtle bg-surface-1 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm tracking-wider text-text-400 font-semibold uppercase">Linked issues</h2>
                    <p className="text-xs text-text-400 mt-1">Product work connected to this request.</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setIsIssueModalOpen(true)}>
                    <span className="flex items-center gap-2">
                      <Plus className="size-4" />
                      Add
                    </span>
                  </Button>
                </div>

                {linkedIssuesState.isLoading && linkedIssues.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <div className="border-primary h-7 w-7 animate-spin rounded-full border-b-2" />
                  </div>
                ) : linkedIssues.length === 0 ? (
                  <p className="text-sm text-text-400">No linked issues yet.</p>
                ) : (
                  <div className="space-y-3">
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
                          className="hover:border-primary/40 rounded-lg border border-subtle bg-surface-2 p-3 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
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
                              <p className="text-sm text-text-100 mt-2 truncate font-medium">
                                {issue?.name || requestIssue.issue}
                              </p>
                              <p className="text-xs text-text-400 mt-1">
                                {isUnavailable
                                  ? "This issue could not be loaded. It may have been removed or is no longer accessible."
                                  : `Linked on ${new Date(requestIssue.created_at).toLocaleDateString()}`}
                              </p>
                            </Link>
                            <div className="flex shrink-0 items-center gap-1">
                              <Link2 className="text-text-300 mt-0.5 size-4" />
                              <button
                                type="button"
                                onClick={() => handleUnlinkIssue(requestIssue.id)}
                                className="text-text-300 hover:bg-red-500/10 hover:text-red-500 rounded p-0.5 transition-colors"
                                title="Unlink issue"
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
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
                  className="text-sm text-text-100 focus:border-primary min-h-[80px] w-full resize-none rounded-md border border-subtle bg-surface-2 px-3 py-2 transition-colors outline-none"
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
