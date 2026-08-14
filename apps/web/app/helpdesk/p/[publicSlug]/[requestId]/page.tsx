/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { observer } from "mobx-react";
import { ArrowLeft, Send, Lock } from "lucide-react";
import { cn } from "@plane/utils";
import { PublicHelpdeskService } from "@plane/services";
import type { IHelpdeskRequest, IHelpdeskRequestComment, IHelpdeskPortal } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { publicHelpdeskStore } from "@/store/public-helpdesk.store";
import { AttachmentPicker } from "@/components/helpdesk/attachments/attachment-picker";
import { CommentAttachments, PendingAttachmentChips } from "@/components/helpdesk/attachments/attachment-chips";
import { useAttachmentUpload } from "@/components/helpdesk/attachments/use-attachment-upload";

const publicHelpdeskService = new PublicHelpdeskService();

const HelpdeskPublicRequestPage = observer(() => {
  const { publicSlug, requestId } = useParams();
  const navigate = useNavigate();

  const [portal, setPortal] = useState<IHelpdeskPortal | null>(null);
  const [request, setRequest] = useState<IHelpdeskRequest | null>(null);
  const [comments, setComments] = useState<IHelpdeskRequestComment[]>([]);
  const [loading, setLoading] = useState(true);

  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (publicSlug && requestId) {
      const pSlug = publicSlug.toString();
      const rId = requestId.toString();
      const token = publicHelpdeskStore.customerToken || undefined;

      if (!token) {
        setLoading(false);
        return;
      }

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

  const attachmentTransport = useMemo(
    () => ({
      getCredentials: (data: { name: string; type: string; size: number }) =>
        publicHelpdeskService.getAssetUploadCredentials(
          publicSlug || "",
          data,
          publicHelpdeskStore.customerToken || undefined
        ),
      markUploaded: (assetId: string) =>
        publicHelpdeskService.markAssetUploaded(
          publicSlug || "",
          assetId,
          publicHelpdeskStore.customerToken || undefined
        ),
      // No remove: the public endpoint deliberately exposes no delete, so an
      // abandoned upload is collected by the daily unbound-asset sweep instead.
    }),
    [publicSlug]
  );
  const attachments = useAttachmentUpload(attachmentTransport);

  const handleAddComment = async () => {
    if (!newComment.trim() || !publicSlug || !requestId) return;
    setSubmitting(true);
    try {
      const response = await publicHelpdeskService.createPublicRequestComment(
        publicSlug,
        requestId,
        {
          content: newComment,
          asset_ids: attachments.assetIds,
        },
        publicHelpdeskStore.customerToken || undefined
      );
      setComments((prev) => [...prev, response]);
      setNewComment("");
      attachments.clear();
    } catch (_err) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to post comment." });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files: File[] = [];
    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      for (let i = 0; i < e.clipboardData.files.length; i++) {
        const file = e.clipboardData.files[i];
        if (file) files.push(file);
      }
    } else if (e.clipboardData?.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      attachments.upload(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      attachments.upload(files);
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="border-accent-subtle h-8 w-8 animate-spin rounded-full border-b-2"></div>
      </div>
    );
  }

  if (!publicHelpdeskStore.customerToken) {
    const loginUrl = `/helpdesk/p/${publicSlug}/login?next=/helpdesk/p/${publicSlug}/${requestId}`;
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mb-4 flex justify-center">
          <div className="bg-accent-subtle flex h-14 w-14 items-center justify-center rounded-full">
            <Lock className="size-7 text-primary" />
          </div>
        </div>
        <h2 className="text-xl text-primary font-bold">Sign in to view this ticket</h2>
        <p className="text-placeholder text-sm mt-2">
          You need an account to access ticket details and follow the conversation.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => navigate(loginUrl)}
            className="bg-accent-primary hover:bg-accent-primary-hover text-sm rounded-md px-5 py-2 font-medium text-white transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={() =>
              navigate(
                `/helpdesk/p/${publicSlug}/register?next=${encodeURIComponent(`/helpdesk/p/${publicSlug}/${requestId}`)}`
              )
            }
            className="text-sm text-secondary rounded-md border border-subtle px-5 py-2 font-medium transition-colors hover:bg-surface-2"
          >
            Create account
          </button>
        </div>
        <Link to={`/helpdesk/p/${publicSlug}`} className="text-sm text-placeholder mt-6 block hover:underline">
          Return to Portal
        </Link>
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
        <span className="bg-accent-subtle text-sm rounded-full px-3 py-1 font-medium text-accent-primary">
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
            {publicComments.map((comment) => {
              // Authorship drives four separate decisions here -- side, colour,
              // label and surface -- and all of them used to derive from the
              // single boolean `!comment.actor`. That made a comment with
              // neither an actor nor a customer render as the customer's own
              // message: in a chat layout, position and colour assert "this is
              // yours" far more strongly than any caption, so correcting only
              // the label would have produced an inconsistency rather than a
              // fix. Three states, every decision derived from them.
              const authorKind = comment.actor ? "agent" : comment.customer ? "customer" : "unattributed";
              const isOwnMessage = authorKind === "customer";
              // Neutral, not an accusation: an unattributed message is most
              // often benign (a reply posted without a valid portal token),
              // and treating it identically to a spoofed one is deliberate --
              // it denies an attacker any feedback about detection.
              const authorLabel =
                authorKind === "customer" ? "You" : authorKind === "agent" ? "Support Team" : "Participant";
              return (
                <div key={comment.id} className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`shadow-sm max-w-[85%] rounded-lg border p-4 ${isOwnMessage ? "bg-accent-subtle border-accent-subtle" : "border-subtle bg-surface-1"}`}
                  >
                    <div className="mb-2 flex items-baseline justify-between gap-4">
                      <span className="text-sm font-semibold text-primary">{authorLabel}</span>
                      <span className="text-xs text-tertiary">{new Date(comment.created_at).toLocaleString()}</span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap text-secondary">{comment.content}</div>
                    <CommentAttachments attachments={comment.attachments} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reply Input */}
      {portal?.enable_chat && (
        <div className="mt-8">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "focus-within:border-accent-subtle focus-within:ring-accent-primary/20 shadow-sm relative flex flex-col gap-2 rounded-md border border-subtle bg-surface-1 transition-all focus-within:ring-1",
              isDragOver && "border-accent-primary bg-accent-subtle/50 border-dashed"
            )}
          >
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onPaste={handlePaste}
              placeholder="Type your reply here..."
              className="text-sm min-h-[120px] w-full resize-none bg-transparent p-4 text-primary outline-none"
            />
            <PendingAttachmentChips attachments={attachments.pending} onRemove={attachments.remove} />
            <div className="flex items-center justify-between px-4 pb-3">
              <div className="flex items-center gap-2">
                <AttachmentPicker onSelect={attachments.upload} disabled={submitting} />
                <span className="text-xs text-tertiary">We usually reply within 24 hours.</span>
              </div>
              <button
                onClick={handleAddComment}
                disabled={submitting || !newComment.trim()}
                className="bg-accent-primary text-sm hover:bg-accent-primary-hover flex items-center gap-2 rounded-md px-4 py-2 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
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
