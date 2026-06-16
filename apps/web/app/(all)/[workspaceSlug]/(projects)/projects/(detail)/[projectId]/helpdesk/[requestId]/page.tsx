/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { Header } from "@plane/ui";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";

const RequestDetailPage = observer(() => {
  const { workspaceSlug, projectId, requestId } = useParams();
  const helpdeskStore = useHelpdesk();
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (workspaceSlug && projectId && requestId) {
      Promise.all([
        helpdeskStore.fetchRequestById(workspaceSlug.toString(), projectId.toString(), requestId.toString()),
        helpdeskStore.fetchRequestComments(workspaceSlug.toString(), projectId.toString(), requestId.toString()),
        helpdeskStore.fetchRequestIssues(workspaceSlug.toString(), projectId.toString(), requestId.toString()),
      ]).finally(() => setLoading(false));
    }
  }, [workspaceSlug, projectId, requestId, helpdeskStore]);

  const wSlug = workspaceSlug?.toString() || "";
  const pId = projectId?.toString() || "";
  const rId = requestId?.toString() || "";

  const rawRequestsList = helpdeskStore.requests[`${wSlug}_${pId}`];
  const requestsList = Array.isArray(rawRequestsList) ? rawRequestsList : [];
  const request = requestsList.find((r) => r.id === rId);

  const rawComments = helpdeskStore.comments[rId];
  const comments = Array.isArray(rawComments) ? rawComments : [];

  const rawRequestIssues = helpdeskStore.requestIssues[rId];
  const requestIssues = Array.isArray(rawRequestIssues) ? rawRequestIssues : [];

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      await helpdeskStore.createRequestComment(wSlug, pId, rId, {
        content: newComment,
        is_internal: false, // By default, send to customer. We can add a toggle later.
      });
      setNewComment("");
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success", message: "Comment added" });
    } catch (_err) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to add comment" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex h-full w-full flex-col">
        <Header>
          <div className="flex items-center gap-2">
            <Link
              href={`/${wSlug}/projects/${pId}/helpdesk`}
              className="text-tertiary transition-colors hover:text-primary"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <h3 className="text-lg font-semibold">Request Not Found</h3>
          </div>
        </Header>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-tertiary">The request you are looking for does not exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <Header>
        <div className="flex items-center gap-2">
          <Link
            href={`/${wSlug}/projects/${pId}/helpdesk`}
            className="text-tertiary transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <h3 className="text-lg max-w-md truncate font-semibold text-primary">{request.title}</h3>
          <span className="bg-primary/10 text-xs ml-2 rounded-full px-2 py-1 text-primary">{request.status}</span>
        </div>
      </Header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Content Area: Request Info & Chat */}
        <div className="flex h-full flex-1 flex-col border-r border-subtle">
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            {/* Original Request Details */}
            <div className="shadow-sm rounded-lg border border-subtle bg-surface-2 p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-primary">{request.title}</h2>
                  <p className="text-sm mt-1 text-tertiary">
                    Submitted by {request.contact_email || "Customer"} via {request.source} on{" "}
                    {new Date(request.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="prose-sm max-w-none text-secondary prose">{request.description}</div>
            </div>

            {/* Comments Thread */}
            <div className="space-y-4">
              <h3 className="text-sm tracking-wider font-semibold text-tertiary uppercase">Conversation</h3>
              {comments.length === 0 ? (
                <p className="text-sm py-4 text-center text-tertiary">No comments yet.</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className={`flex ${comment.actor ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`shadow-sm max-w-[80%] rounded-lg border p-4 ${comment.actor ? "bg-primary/5 border-primary/20" : "border-subtle bg-surface-2"}`}
                    >
                      <div className="mb-2 flex items-baseline justify-between gap-4">
                        <span className="text-sm font-semibold text-primary">
                          {comment.actor ? "Agent" : "Customer"}{" "}
                          {comment.is_internal && (
                            <span className="text-xs font-normal text-orange-500 bg-orange-500/10 ml-1 rounded px-1">
                              Internal Note
                            </span>
                          )}
                        </span>
                        <span className="text-xs whitespace-nowrap text-tertiary">
                          {new Date(comment.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap text-secondary">{comment.content}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Comment Input Box */}
          <div className="border-t border-subtle bg-surface-1 p-4">
            <div className="focus-within:border-primary relative flex flex-col gap-2 rounded-md border border-subtle bg-surface-2 transition-colors">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Type a message to the customer..."
                className="text-sm min-h-[80px] w-full resize-none bg-transparent p-3 text-primary outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <span className="text-xs text-tertiary">Press Enter to send, Shift+Enter for new line</span>
                <button
                  onClick={handleAddComment}
                  disabled={submitting || !newComment.trim()}
                  className="bg-primary rounded-md p-1.5 text-white transition-opacity disabled:opacity-50"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Linked Issues & Meta */}
        <div className="flex h-full w-80 flex-shrink-0 flex-col bg-surface-1">
          <div className="border-b border-subtle p-5">
            <h3 className="text-sm tracking-wider mb-4 font-semibold text-tertiary uppercase">Request Details</h3>

            <div className="space-y-4">
              <div>
                <p className="text-xs mb-1 text-tertiary">Status</p>
                <div className="text-sm font-medium">{request.status}</div>
              </div>
              <div>
                <p className="text-xs mb-1 text-tertiary">Contact Email</p>
                <div className="text-sm">{request.contact_email || "-"}</div>
              </div>
              <div>
                <p className="text-xs mb-1 text-tertiary">Source</p>
                <div className="text-sm">{request.source}</div>
              </div>
              <div>
                <p className="text-xs mb-1 text-tertiary">Created</p>
                <div className="text-sm">{new Date(request.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm tracking-wider font-semibold text-tertiary uppercase">Linked Issues</h3>
            </div>

            {requestIssues.length === 0 ? (
              <p className="text-sm text-tertiary">No issues linked.</p>
            ) : (
              <div className="space-y-3">
                {requestIssues.map((ri) => (
                  <div
                    key={ri.id}
                    className="shadow-sm flex items-center justify-between rounded-md border border-subtle bg-surface-2 p-3"
                  >
                    <span className="text-sm font-medium text-primary">Issue #{ri.issue.substring(0, 8)}</span>
                    <Link
                      href={`/${wSlug}/projects/${pId}/issues/${ri.issue}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {/* TODO: Add Issue linking combobox */}
            <button className="text-sm border-primary/20 bg-primary/5 hover:bg-primary/10 mt-4 w-full rounded-md border py-2 font-medium text-primary transition-colors">
              Link Existing Issue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default RequestDetailPage;
