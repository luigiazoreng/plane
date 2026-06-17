/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { observer } from "mobx-react";
import { ArrowLeft, Send } from "lucide-react";
import { PublicHelpdeskService } from "@plane/services";
import type { IHelpdeskRequest, IHelpdeskRequestComment, IHelpdeskPortal } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { publicHelpdeskStore } from "@/store/public-helpdesk.store";

const publicHelpdeskService = new PublicHelpdeskService();

const HelpdeskPublicRequestPage = observer(() => {
  const { publicSlug, requestId } = useParams();

  const [portal, setPortal] = useState<IHelpdeskPortal | null>(null);
  const [request, setRequest] = useState<IHelpdeskRequest | null>(null);
  const [comments, setComments] = useState<IHelpdeskRequestComment[]>([]);
  const [loading, setLoading] = useState(true);

  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (publicSlug && requestId) {
      const pSlug = publicSlug.toString();
      const rId = requestId.toString();
      const token = publicHelpdeskStore.customerToken || undefined;

      Promise.all([
        publicHelpdeskService.getPublicPortal(pSlug),
        publicHelpdeskService.getPublicRequestById(pSlug, rId, token),
        publicHelpdeskService.getPublicRequestComments(pSlug, rId, token),
      ])
        .then(([portalData, reqData, commentsData]) => {
          setPortal(portalData);
          setRequest(reqData);
          setComments(commentsData);
          return;
        })
        .catch((_err) => {
          console.error(_err);
          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to load ticket details." });
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [publicSlug, requestId]);

  const handleAddComment = async () => {
    if (!newComment.trim() || !publicSlug || !requestId) return;
    setSubmitting(true);
    try {
      const response = await publicHelpdeskService.createPublicRequestComment(
        publicSlug,
        requestId,
        {
          content: newComment,
        },
        publicHelpdeskStore.customerToken || undefined
      );
      setComments((prev) => [...prev, response]);
      setNewComment("");
    } catch (_err) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to post comment." });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl mb-2 font-semibold text-primary">Request Not Found</h2>
        <p className="mb-6 text-tertiary">The link might be invalid or the request was deleted.</p>
        <Link to={`/helpdesk/p/${publicSlug}`} className="font-medium text-primary hover:underline">
          Return to Portal
        </Link>
      </div>
    );
  }

  // Filter out internal comments from the customer view
  const publicComments = comments.filter((c) => !c.is_internal);

  return (
    <div className="space-y-6">
      <div className="mb-6 flex items-center gap-3">
        <Link to={`/helpdesk/p/${publicSlug}`} className="text-tertiary transition-colors hover:text-primary">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl flex-1 font-bold text-primary">{request.title}</h1>
        <span className="bg-primary/10 text-sm rounded-full px-3 py-1 font-medium text-primary">
          {request.status_detail?.name || "Open"}
        </span>
      </div>

      {/* Original Request Details */}
      <div className="shadow-sm rounded-lg border border-subtle bg-surface-1 p-6">
        <div className="text-sm mb-4 flex justify-between text-tertiary">
          <span>Submitted on {new Date(request.created_at).toLocaleString()}</span>
        </div>
        <div className="prose-sm max-w-none text-secondary prose">{request.description}</div>
      </div>

      {/* Chat History */}
      <div className="space-y-4 pt-4">
        <h3 className="text-lg mb-4 font-semibold text-primary">Conversation</h3>

        {publicComments.length === 0 ? (
          <p className="text-sm rounded-lg border border-dashed border-subtle bg-surface-2 py-4 text-center text-tertiary">
            No replies yet. Our team will get back to you soon.
          </p>
        ) : (
          <div className="space-y-4">
            {publicComments.map((comment) => (
              <div key={comment.id} className={`flex ${!comment.actor ? "justify-end" : "justify-start"}`}>
                <div
                  className={`shadow-sm max-w-[85%] rounded-lg border p-4 ${!comment.actor ? "bg-primary/5 border-primary/20" : "border-subtle bg-surface-1"}`}
                >
                  <div className="mb-2 flex items-baseline justify-between gap-4">
                    <span className="text-sm font-semibold text-primary">
                      {!comment.actor ? "You" : "Support Team"}
                    </span>
                    <span className="text-xs text-tertiary">{new Date(comment.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap text-secondary">{comment.content}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply Input */}
      {portal?.enable_chat && (
        <div className="mt-8">
          <div className="focus-within:border-primary focus-within:ring-primary/20 shadow-sm relative flex flex-col gap-2 rounded-md border border-subtle bg-surface-1 transition-all focus-within:ring-1">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Type your reply here..."
              className="text-sm min-h-[120px] w-full resize-none bg-transparent p-4 text-primary outline-none"
            />
            <div className="flex items-center justify-between px-4 pb-3">
              <span className="text-xs text-tertiary">We usually reply within 24 hours.</span>
              <button
                onClick={handleAddComment}
                disabled={submitting || !newComment.trim()}
                className="bg-primary text-sm hover:bg-primary-hover flex items-center gap-2 rounded-md px-4 py-2 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>Send Reply</span>
                <Send className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default HelpdeskPublicRequestPage;
