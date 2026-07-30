"use client";

import { observer } from "mobx-react";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Lock,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import React, { useState } from "react";
import type { IHelpdeskRequest, IHelpdeskRequestComment } from "@plane/types";
import { CommentAttachments } from "@/components/helpdesk/attachments/attachment-chips";

type Props = {
  request: IHelpdeskRequest;
  comments: IHelpdeskRequestComment[];
  isLoading: boolean;
  currentUserId?: string;
};

function HelpdeskCommentContent({ content }: { content: string }) {
  const [showEmailDetails, setShowEmailDetails] = useState(false);

  if (!content) return null;

  const parsed = content
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  const dividers = [
    /\n_{3,}\s*From:/i,
    /\n-{3,}\s*Original\s*-{3,}/i,
    /\nOn\s+.*?\s+wrote:\s*\n/i,
    /\nFrom:\s+.*?<.*?>\s*\nDate:\s+/i,
    /\n-{3,}\s*Forwarded message\s*-{3,}/i,
  ];

  let splitIndex = -1;
  for (const regex of dividers) {
    const match = parsed.match(regex);
    if (match && match.index !== undefined) {
      if (splitIndex === -1 || match.index < splitIndex) {
        splitIndex = match.index;
      }
    }
  }

  if (splitIndex !== -1) {
    const mainText = parsed.substring(0, splitIndex).trim();
    const quotedText = parsed.substring(splitIndex).trim();
    return (
      <div className="flex flex-col gap-2 mt-2">
        {mainText ? <p className="break-words whitespace-pre-wrap">{mainText}</p> : null}
        <button
          type="button"
          onClick={() => setShowEmailDetails((prev) => !prev)}
          className="text-xs text-custom-text-300 hover:text-custom-text-100 flex items-center gap-1 font-medium select-none cursor-pointer mt-1"
        >
          <span>Mostrar detalhes do e-mail</span>
          {showEmailDetails ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
        {showEmailDetails && (
          <div className="text-xs text-custom-text-400 mt-1 border-0 border-l-2 border-white/10 pl-3 opacity-80">
            <p className="break-words whitespace-pre-wrap">{quotedText}</p>
          </div>
        )}
      </div>
    );
  }

  return <p className="break-words whitespace-pre-wrap mt-2">{parsed}</p>;
}

function getInitials(name?: string | null): string {
  if (!name) return "?";
  const cleanName = name.replace(/\s*\([^)]*\)/g, "").trim();
  const parts = cleanName.split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const HelpdeskChatTimeline = observer(function HelpdeskChatTimeline({
  request,
  comments,
  isLoading,
  currentUserId,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-6 py-6 pb-20">
      {/* Date Header Divider */}
      <div className="flex items-center justify-center my-2">
        <span className="rounded-full bg-[#1e1e22] px-3 py-1 text-[11px] font-semibold text-custom-text-300">
          Hoje
        </span>
      </div>

      {/* Original customer ticket submission card - LEFT ALIGNED */}
      <div className="flex justify-start w-full">
        <div className="flex items-start gap-3.5 w-full max-w-[85%] sm:max-w-[80%]">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white font-bold text-xs shadow-xs mt-0.5">
            {getInitials(request.contact_email || "Cliente")}
          </div>

          <div className="flex-1 min-w-0 rounded-xl border border-sky-500/20 bg-[#161a23] p-4 text-custom-text-100 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-custom-text-100 truncate">
                  {request.contact_email ? request.contact_email.split("@")[0] : "Cliente"}
                </span>
                <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-400 shrink-0">
                  Solicitação original
                </span>
              </div>
              <span className="text-xs font-medium text-custom-text-400 shrink-0">
                {new Date(request.created_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <div className="mt-2 text-sm leading-relaxed text-custom-text-100">
              {request.description ? (
                <div
                  className="prose-sm text-sm leading-relaxed text-custom-text-100 max-w-none [&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: request.description }}
                />
              ) : (
                <p className="text-sm text-custom-text-400 italic">Nenhuma descrição fornecida.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Comments List */}
      {isLoading && comments.length === 0 ? (
        <div className="flex justify-center py-10">
          <div className="size-7 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        </div>
      ) : (
        comments.map((comment) => {
          const isAgent = Boolean(comment.actor);
          const isCurrentUser = isAgent && comment.actor === currentUserId;
          const displayBaseName = isAgent
            ? comment.actor_detail?.display_name || "Agente"
            : comment.customer_detail?.name || comment.customer_detail?.email || "Cliente";

          const initials = getInitials(displayBaseName);
          const fullDisplayName = `${displayBaseName}${isCurrentUser ? " (você)" : ""}`;

          /* 1. Internal Note Card (RIGHT ALIGNED, Amber Accent) */
          if (comment.is_internal) {
            return (
              <div key={comment.id} className="flex justify-end w-full">
                <div className="flex items-start gap-3.5 w-full max-w-[85%] sm:max-w-[80%] flex-row-reverse">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs shadow-xs border border-amber-500/30 mt-0.5">
                    <Lock className="size-4" />
                  </div>

                  <div className="flex-1 min-w-0 rounded-xl border border-amber-500/30 bg-[#251d14] p-4 text-custom-text-100 shadow-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-amber-400">🔒 Nota interna</span>
                        <span className="text-xs text-amber-200/90 font-semibold truncate">
                          {fullDisplayName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-amber-300/70 font-medium">
                          {new Date(comment.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <div className="flex items-center gap-1 text-amber-300/60">
                          <button type="button" className="p-1 hover:text-amber-300 transition-colors" title="Editar">
                            <Pencil className="size-3.5" />
                          </button>
                          <button type="button" className="p-1 hover:text-amber-300 transition-colors" title="Mais opções">
                            <MoreHorizontal className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="text-sm text-amber-100/90 leading-relaxed">
                      <HelpdeskCommentContent content={comment.content} />
                      <CommentAttachments attachments={comment.attachments} />
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          /* 2. Agent Reply Card (RIGHT ALIGNED, Sky-Blue Tint) */
          if (isAgent) {
            return (
              <div key={comment.id} className="flex justify-end w-full">
                <div className="flex items-start gap-3.5 w-full max-w-[85%] sm:max-w-[80%] flex-row-reverse">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white font-bold text-xs shadow-xs mt-0.5 overflow-hidden">
                    {comment.actor_detail?.avatar_url ? (
                      <img
                        src={comment.actor_detail.avatar_url}
                        alt={displayBaseName}
                        className="size-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </div>

                  <div className="flex-1 min-w-0 rounded-xl border border-sky-500/20 bg-[#131f2f] p-4 text-custom-text-100 shadow-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-sky-300/70 font-medium shrink-0">
                        {new Date(comment.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <div className="flex items-center gap-2 min-w-0">
                        {comment.delivery_channels && comment.delivery_channels.length > 0 && (
                          <span className="rounded-md bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300 shrink-0">
                            {comment.delivery_channels.includes("email") ? "E-mail + Portal" : "Portal"}
                          </span>
                        )}
                        <span className="text-xs font-bold text-sky-300 truncate">{fullDisplayName}</span>
                      </div>
                    </div>

                    <div className="text-sm text-sky-100/90 leading-relaxed">
                      <HelpdeskCommentContent content={comment.content} />
                      <CommentAttachments attachments={comment.attachments} />
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          /* 3. Customer Message Card (LEFT ALIGNED, Purple Tint) */
          return (
            <div key={comment.id} className="flex justify-start w-full">
              <div className="flex items-start gap-3.5 w-full max-w-[85%] sm:max-w-[80%]">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white font-bold text-xs shadow-xs mt-0.5">
                  {initials}
                </div>

                <div className="flex-1 min-w-0 rounded-xl border border-purple-500/20 bg-[#1d1829] p-4 text-custom-text-100 shadow-xs">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-purple-200 truncate">{fullDisplayName}</span>
                      {comment.customer_detail?.email && (
                        <span className="text-xs text-purple-300/70 truncate hidden sm:inline">
                          {comment.customer_detail.email}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-purple-300/70 font-medium shrink-0">
                      {new Date(comment.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div className="text-sm text-purple-100/90 leading-relaxed">
                    <HelpdeskCommentContent content={comment.content} />
                    <CommentAttachments attachments={comment.attachments} />
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
});
