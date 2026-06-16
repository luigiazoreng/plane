/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link, useParams } from "react-router";
import { Badge } from "@plane/propel/badge";
import { Button } from "@plane/propel/button";
import { Switch } from "@plane/propel/switch";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IHelpdeskRequest, ISearchIssueResponse } from "@plane/types";
import { Header } from "@plane/ui";
import { generateWorkItemLink } from "@plane/utils";
import {
  ArrowLeft,
  Link2,
  Lock,
  MessageCircleMore,
  MessageSquareText,
  Plus,
  Send,
  UserRound,
} from "lucide-react";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";

const STATUS_META: Record<IHelpdeskRequest["status"], { label: string; variant: "warning" | "brand" | "success" | "neutral" }> = {
  open: { label: "Open", variant: "warning" },
  in_progress: { label: "In progress", variant: "brand" },
  waiting: { label: "Waiting", variant: "brand" },
  resolved: { label: "Resolved", variant: "success" },
  closed: { label: "Closed", variant: "neutral" },
};

const RequestDetailPage = observer(() => {
  const { workspaceSlug, projectId, requestId } = useParams();
  const helpdeskStore = useHelpdesk();
  const { issueMap } = useIssues();
  const { getProjectIdentifierById } = useProject();
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

  useEffect(() => {
    if (!workspaceSlug || !projectId || !requestId) return;

    const wSlug = workspaceSlug.toString();
    const pId = projectId.toString();
    const rId = requestId.toString();

    Promise.all([
      helpdeskStore.fetchRequestById(wSlug, pId, rId),
      helpdeskStore.fetchRequestComments(wSlug, pId, rId),
      helpdeskStore.fetchRequestIssues(wSlug, pId, rId).then(() => helpdeskStore.hydrateLinkedIssues(wSlug, pId, rId)),
    ]);
  }, [workspaceSlug, projectId, requestId, helpdeskStore]);

  const wSlug = workspaceSlug?.toString() || "";
  const pId = projectId?.toString() || "";
  const rId = requestId?.toString() || "";
  const request = helpdeskStore.getProjectRequests(wSlug, pId).find((currentRequest) => currentRequest.id === rId);
  const comments = helpdeskStore.getRequestComments(rId);
  const linkedIssues = helpdeskStore.getRequestIssues(rId);
  const requestState = helpdeskStore.getCollectionState(`request:${rId}`);
  const commentsState = helpdeskStore.getCollectionState(`comments:${rId}`);
  const linkedIssuesState = helpdeskStore.getCollectionState(`request-issues:${rId}`);

  const linkedIssueIds = useMemo(() => linkedIssues.map((issue) => issue.issue), [linkedIssues]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      await helpdeskStore.createRequestComment(wSlug, pId, rId, {
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
    const issuesToLink = issues.filter((issue) => !linkedIssueIds.includes(issue.id));

    if (issuesToLink.length === 0) return;

    try {
      await Promise.all(issuesToLink.map((issue) => helpdeskStore.createRequestIssue(wSlug, pId, rId, { issue: issue.id })));
      await helpdeskStore.hydrateLinkedIssues(wSlug, pId, rId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success", message: "Issue linked successfully" });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not link the selected issue" });
    }
  };

  if (requestState.isLoading && !request) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex h-full w-full flex-col bg-surface-1">
        <Header>
          <div className="flex items-center gap-3">
            <Link to={`/${wSlug}/projects/${pId}/helpdesk`} className="text-tertiary transition-colors hover:text-primary">
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h3 className="text-sm font-semibold text-text-100">Request not found</h3>
              <p className="text-xs text-text-400">The selected request is unavailable or was removed.</p>
            </div>
          </div>
        </Header>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-text-400">No request data available.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full w-full flex-col bg-surface-1">
        <Header>
          <div className="flex w-full items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-3">
                <Link
                  to={`/${wSlug}/projects/${pId}/helpdesk`}
                  className="text-tertiary transition-colors hover:text-primary"
                >
                  <ArrowLeft className="size-4" />
                </Link>
                <span className="text-xs uppercase tracking-wider text-text-400">Helpdesk</span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className="truncate text-lg font-semibold text-text-100">{request.title}</h1>
                <Badge variant={STATUS_META[request.status].variant} size="sm">
                  {STATUS_META[request.status].label}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-text-400">
                {request.contact_email || "Authenticated customer"} submitted this via{" "}
                {request.source === "public_form" ? "public form" : "internal form"} on{" "}
                {new Date(request.created_at).toLocaleString()}.
              </p>
            </div>

            <Button variant="secondary" size="base" onClick={() => setIsIssueModalOpen(true)}>
              <span className="flex items-center gap-2">
                <Link2 className="size-4" />
                Link issue
              </span>
            </Button>
          </div>
        </Header>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col border-r border-subtle">
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="mx-auto flex max-w-4xl flex-col gap-6">
                <section className="rounded-xl border border-subtle bg-surface-2 p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-text-400">Original request</p>
                      <h2 className="mt-2 text-base font-semibold text-text-100">{request.title}</h2>
                    </div>
                    <Badge variant="neutral" size="sm">
                      {request.customer ? "Authenticated" : "Anonymous"}
                    </Badge>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-text-300">{request.description}</div>
                </section>

                <section className="rounded-xl border border-subtle bg-surface-2">
                  <div className="border-b border-subtle px-5 py-4">
                    <div className="flex items-center gap-2">
                      <MessageCircleMore className="size-4 text-text-300" />
                      <div>
                        <h2 className="text-base font-semibold text-text-100">Conversation</h2>
                        <p className="text-sm text-text-400">Visible replies and internal notes in one timeline.</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    {commentsState.isLoading && comments.length === 0 ? (
                      <div className="flex justify-center py-8">
                        <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-primary" />
                      </div>
                    ) : comments.length === 0 ? (
                      <p className="py-8 text-center text-sm text-text-400">No replies yet.</p>
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
                                  <MessageSquareText className="size-4 text-text-300" />
                                )}
                                <span className="text-sm font-medium text-text-100">
                                  {isAgent ? "Agent" : "Customer"}
                                </span>
                                {comment.is_internal && (
                                  <Badge variant="warning" size="sm">
                                    Internal note
                                  </Badge>
                                )}
                                <span className="text-xs text-text-400">{new Date(comment.created_at).toLocaleString()}</span>
                              </div>
                              <div className="whitespace-pre-wrap text-sm text-text-300">{comment.content}</div>
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
                    <p className="text-sm font-medium text-text-100">
                      {isInternalNote ? "Add internal note" : "Reply to customer"}
                    </p>
                    <p className="text-xs text-text-400">
                      {isInternalNote
                        ? "Only agents will see this note."
                        : "This message will appear in the customer conversation."}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Lock className="size-4 text-text-300" />
                    <span className="text-xs text-text-400">Internal note</span>
                    <Switch value={isInternalNote} onChange={() => setIsInternalNote((current) => !current)} />
                  </div>
                </div>

                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={isInternalNote ? "Capture context for the team..." : "Write a reply to the customer..."}
                  className="min-h-[110px] w-full resize-none rounded-lg border border-subtle bg-surface-2 p-3 text-sm text-text-100 outline-none transition-colors focus:border-primary"
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

          <aside className="hidden w-[340px] flex-shrink-0 overflow-y-auto bg-surface-2 xl:block">
            <div className="space-y-6 p-5">
              <section className="rounded-xl border border-subtle bg-surface-1 p-4">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-400">Request details</h2>
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="mb-1 text-xs text-text-400">Status</p>
                    <Badge variant={STATUS_META[request.status].variant} size="sm">
                      {STATUS_META[request.status].label}
                    </Badge>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-text-400">Contact</p>
                    <p className="text-text-100">{request.contact_email || "Authenticated customer"}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-text-400">Source</p>
                    <p className="text-text-100">{request.source === "public_form" ? "Public form" : "Internal form"}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-text-400">Assignees</p>
                    <p className="text-text-100">{request.assignees.length || 0}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-text-400">Updated</p>
                    <p className="text-text-100">{new Date(request.updated_at).toLocaleString()}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-subtle bg-surface-1 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-text-400">Linked issues</h2>
                    <p className="mt-1 text-xs text-text-400">Product work connected to this request.</p>
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
                    <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-primary" />
                  </div>
                ) : linkedIssues.length === 0 ? (
                  <p className="text-sm text-text-400">No linked issues yet.</p>
                ) : (
                  <div className="space-y-3">
                    {linkedIssues.map((requestIssue) => {
                      const issue = issueMap[requestIssue.issue];
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
                        <Link
                          key={requestIssue.id}
                          to={workItemLink || "#"}
                          className="block rounded-lg border border-subtle bg-surface-2 p-3 transition-colors hover:border-primary/40"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
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
                                  Linked issue
                                </Badge>
                              )}
                              <p className="mt-2 truncate text-sm font-medium text-text-100">
                                {issue?.name || requestIssue.issue}
                              </p>
                              <p className="mt-1 text-xs text-text-400">
                                Linked on {new Date(requestIssue.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <Link2 className="mt-0.5 size-4 flex-shrink-0 text-text-300" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>
      </div>

      <ExistingIssuesListModal
        workspaceSlug={wSlug}
        projectId={pId}
        isOpen={isIssueModalOpen}
        handleClose={() => setIsIssueModalOpen(false)}
        searchParams={{}}
        shouldHideIssue={(issue) => linkedIssueIds.includes(issue.id)}
        handleOnSubmit={handleLinkIssues}
      />
    </>
  );
});

export default RequestDetailPage;
