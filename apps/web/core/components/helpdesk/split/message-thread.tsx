/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useEffect, useRef } from "react";
import type { IHelpdeskRequest, IHelpdeskRequestComment } from "@plane/types";
import { cn } from "@plane/utils";
import { Badge } from "@plane/propel/badge";
import { CommentAttachments } from "@/components/helpdesk/attachments/attachment-chips";
import { HelpdeskCommentContent } from "@/components/helpdesk/comment-content";

type TMessageThreadProps = {
  request: IHelpdeskRequest;
  comments: IHelpdeskRequestComment[];
  isLoading: boolean;
};

export function MessageThread({ request, comments, isLoading }: TMessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows, and reset to the bottom when the
  // agent switches tickets in the queue.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [request.id, comments.length]);

  if (isLoading && comments.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <div className="size-7 animate-spin rounded-full border-b-2 border-accent-strong" />
      </div>
    );
  }

  let lastDayKey = "";

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-3.5">
      {/* The original request opens the thread as the customer's first message. */}
      <DaySeparator iso={request.created_at} />
      <MessageRow
        kind="customer"
        name={request.contact_email || "Customer"}
        timestamp={request.created_at}
        tag="Original request"
      >
        {request.description ? (
          <div
            className="prose-sm prose-invert max-w-none text-13 leading-relaxed prose [&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: request.description }}
          />
        ) : (
          <p className="text-13 italic opacity-70">Nenhuma descrição informada.</p>
        )}
      </MessageRow>

      {comments.map((comment) => {
        // Three states, not a boolean. `!!comment.actor` sent every
        // unattributed comment down the customer branch, so an inbound message
        // whose sender could not be proven was shown to the agent as though the
        // *customer* had written it. Alignment, surface, name and tag all derive
        // from this instead.
        const authorKind = comment.actor ? "agent" : comment.customer ? "customer" : "unattributed";
        const kind = comment.is_internal ? "note" : authorKind;
        const authorName =
          authorKind === "agent"
            ? (comment.actor_detail?.display_name ?? "Agent")
            : authorKind === "customer"
              ? (comment.customer_detail?.name ?? "Customer")
              : "Participant";

        const dayKey = new Date(comment.created_at).toDateString();
        const needsSeparator = dayKey !== lastDayKey && dayKey !== new Date(request.created_at).toDateString();
        lastDayKey = dayKey;

        return (
          <Fragment key={comment.id}>
            {needsSeparator && <DaySeparator iso={comment.created_at} />}
            <MessageRow
              kind={kind}
              name={authorName}
              timestamp={comment.created_at}
              tag={
                comment.is_internal
                  ? "Internal note"
                  : comment.delivery_channels && comment.delivery_channels.length > 0
                    ? `Sent via ${comment.delivery_channels.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(" + ")}`
                    : undefined
              }
              badge={
                comment.email_status === "failed" ? (
                  <Badge variant="danger" size="sm">
                    Delivery failed
                  </Badge>
                ) : comment.email_status === "pending" ? (
                  <Badge variant="warning" size="sm">
                    Pending
                  </Badge>
                ) : undefined
              }
            >
              <HelpdeskCommentContent content={comment.content} />
              <CommentAttachments attachments={comment.attachments} />
            </MessageRow>
          </Fragment>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}

function DaySeparator({ iso }: { iso: string }) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const label =
    date.toDateString() === today.toDateString()
      ? "Hoje"
      : date.toDateString() === yesterday.toDateString()
        ? "Ontem"
        : date.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="flex items-center justify-center">
      <span className="inline-flex h-5 items-center rounded-full bg-layer-1 px-2.5 text-11 font-medium text-tertiary">
        {label}
      </span>
    </div>
  );
}

type TMessageKind = "customer" | "agent" | "note" | "unattributed";

const AVATAR_CLASS: Record<TMessageKind, string> = {
  customer: "bg-accent-primary text-white",
  agent: "bg-success-primary text-white",
  note: "bg-warning-primary text-white",
  unattributed: "bg-layer-2 text-secondary",
};

const BUBBLE_CLASS: Record<TMessageKind, string> = {
  customer: "border-subtle bg-surface-2 text-primary",
  agent: "border-accent-strong/40 bg-accent-primary/10 text-primary",
  note: "border-warning-strong bg-warning-subtle text-warning-primary",
  unattributed: "border-subtle bg-surface-2 text-primary",
};

function MessageRow({
  kind,
  name,
  timestamp,
  tag,
  badge,
  children,
}: {
  kind: TMessageKind;
  name: string;
  timestamp: string;
  tag?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Agent replies sit on the right; everything the agent did not write stays left.
  const alignEnd = kind === "agent";

  return (
    <div className={cn("flex items-start gap-2.5", alignEnd && "flex-row-reverse")}>
      <span
        className={cn(
          "mt-5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-11 font-semibold",
          AVATAR_CLASS[kind]
        )}
      >
        {name.charAt(0).toUpperCase()}
      </span>

      <div className={cn("flex max-w-[78%] min-w-0 flex-col gap-1.5", alignEnd ? "items-end" : "items-start")}>
        <div className={cn("flex flex-wrap items-center gap-2", alignEnd && "flex-row-reverse")}>
          <span className="text-13 font-medium text-primary">{name}</span>
          {tag && (
            <span
              className={cn(
                "inline-flex h-[18px] items-center rounded px-1.5 text-11",
                kind === "note" ? "bg-warning-subtle text-warning-primary" : "bg-layer-2 text-tertiary"
              )}
            >
              {tag}
            </span>
          )}
          {badge}
          <span className="text-11 text-tertiary">{new Date(timestamp).toLocaleString()}</span>
        </div>

        <div
          className={cn("max-w-full rounded-[10px] border px-3.5 py-2.5 text-13 leading-relaxed", BUBBLE_CLASS[kind])}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
