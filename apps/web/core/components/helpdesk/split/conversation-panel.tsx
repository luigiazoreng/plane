/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import type { IHelpdeskRequest, IHelpdeskRequestComment, IHelpdeskStatus, TIssuePriorities } from "@plane/types";
import { cn, convertBytesToSize, getFileURL } from "@plane/utils";
import { ArrowLeft, ChevronDown, Clock, MoreHorizontal, Paperclip, Star } from "lucide-react";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { HelpdeskStatusDot } from "@/components/helpdesk/status-pill";
import { getRequestPriority, getRequestTeam } from "./adapters";
import { Composer, type TComposerMode } from "./composer";
import { MessageThread } from "./message-thread";
import type { useAttachmentUpload } from "@/components/helpdesk/attachments/use-attachment-upload";

type TConversationTab = "conversation" | "attachments" | "activity" | "history";

type TConversationPanelProps = {
  request: IHelpdeskRequest;
  comments: IHelpdeskRequestComment[];
  isLoadingComments: boolean;
  statuses: IHelpdeskStatus[];
  statusMap: Record<string, IHelpdeskStatus>;
  onStatusChange: (statusId: string) => void;
  onPriorityChange: (priority: TIssuePriorities) => void;
  onAssigneesChange: (assignees: string[]) => void;
  composerMode: TComposerMode;
  onComposerModeChange: (mode: TComposerMode) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  attachments: ReturnType<typeof useAttachmentUpload>;
  onBackToQueue: () => void;
};

export function ConversationPanel({
  request,
  comments,
  isLoadingComments,
  statuses,
  statusMap,
  onStatusChange,
  onPriorityChange,
  onAssigneesChange,
  composerMode,
  onComposerModeChange,
  draft,
  onDraftChange,
  onSubmit,
  isSubmitting,
  attachments,
  onBackToQueue,
}: TConversationPanelProps) {
  const [tab, setTab] = useState<TConversationTab>("conversation");

  const status = request.status ? statusMap[request.status] : undefined;
  const priority = getRequestPriority(request);
  const team = getRequestTeam(request);

  const sentAttachments = useMemo(() => comments.flatMap((comment) => comment.attachments ?? []), [comments]);

  const tabs: { key: TConversationTab; label: string; count?: number }[] = [
    { key: "conversation", label: "Conversation" },
    { key: "attachments", label: "Attachments", count: sentAttachments.length },
    { key: "activity", label: "Activity" },
    { key: "history", label: "History" },
  ];

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-surface-1">
      {/* ------------------------------- Header ------------------------------- */}
      <div className="flex flex-col gap-2 border-b border-subtle px-5 pt-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToQueue}
            aria-label="Voltar para a fila"
            className="-ml-1 grid size-7 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-1 hover:text-primary lg:hidden"
          >
            <ArrowLeft className="size-4" />
          </button>
          {request.display_id && <span className="font-mono shrink-0 text-11 text-tertiary">{request.display_id}</span>}
          <h2 className="text-sm min-w-0 truncate font-semibold text-primary">{request.title}</h2>
          <PriorityDropdown
            value={request.priority}
            onChange={onPriorityChange}
            buttonVariant={priority ? "border-with-text" : "border-without-text"}
            buttonClassName="h-5"
            className="shrink-0"
            highlightUrgent
          />

          {/* Favourite and snooze are in the design but have no API yet. */}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled
              title="Favoritar — em breve"
              className="grid size-6 place-items-center rounded text-tertiary opacity-40"
            >
              <Star className="size-4" />
            </button>
            <button
              type="button"
              disabled
              title="Adiar — em breve"
              className="grid size-6 place-items-center rounded text-tertiary opacity-40"
            >
              <Clock className="size-4" />
            </button>
            <button
              type="button"
              disabled
              title="Mais ações — em breve"
              className="grid size-6 place-items-center rounded text-tertiary opacity-40"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status — native select layered over the styled trigger keeps keyboard
              and mobile behaviour without hand-rolling a listbox. */}
          <div className="relative inline-flex">
            <span
              className="inline-flex h-6 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-2 text-12 font-medium"
              style={status ? { color: status.color } : undefined}
            >
              {status ? <HelpdeskStatusDot color={status.color} className="size-1.5" /> : null}
              {status?.name ?? "Sem status"}
              <ChevronDown className="size-3" />
            </span>
            <select
              aria-label="Alterar status"
              value={request.status ?? ""}
              onChange={(e) => onStatusChange(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              <option value="">— Sem status —</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <span className="text-12 text-tertiary">Assigned to</span>
          <MemberDropdown
            value={request.assignees}
            onChange={onAssigneesChange}
            multiple
            buttonVariant={request.assignees.length > 0 ? "transparent-without-text" : "border-without-text"}
            placeholder="Assign"
          />

          <span className="text-12 text-tertiary">Team</span>
          <span className="inline-flex h-6 items-center rounded-md border border-subtle bg-layer-1 px-2 text-12 text-secondary">
            {team ?? "—"}
          </span>
        </div>

        <div className="flex items-center gap-4.5">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "inline-flex h-[34px] items-center gap-1.5 text-13 font-medium transition-colors",
                tab === item.key
                  ? "text-primary shadow-[inset_0_-2px_0_0_var(--border-color-accent-strong)]"
                  : "text-tertiary hover:text-secondary"
              )}
            >
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span className="inline-flex h-4 items-center rounded bg-layer-2 px-1.5 text-11 text-tertiary">
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------- Body ------------------------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5">
        {tab === "conversation" ? (
          <MessageThread request={request} comments={comments} isLoading={isLoadingComments} />
        ) : tab === "attachments" ? (
          sentAttachments.length === 0 ? (
            <TabEmpty title="Attachments" body="Arquivos enviados na conversa aparecem aqui." />
          ) : (
            <div className="mx-auto flex max-w-[760px] flex-col gap-1.5">
              {sentAttachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.asset_url ? getFileURL(attachment.asset_url) : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary transition-colors hover:border-strong"
                >
                  <Paperclip className="size-3.5 shrink-0 text-tertiary" />
                  <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                  <span className="shrink-0 text-11 text-tertiary">{convertBytesToSize(attachment.size)}</span>
                </a>
              ))}
            </div>
          )
        ) : tab === "activity" ? (
          <TabEmpty
            title="Activity"
            body="O histórico de alterações de status, responsável e SLA ainda não é exposto pela API."
          />
        ) : (
          <TabEmpty title="History" body="Tickets anteriores deste cliente ainda não são agregados pela API." />
        )}
      </div>

      {/* ------------------------------ Composer ------------------------------ */}
      <Composer
        mode={composerMode}
        onModeChange={onComposerModeChange}
        value={draft}
        onChange={onDraftChange}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        attachments={attachments}
      />
    </div>
  );
}

function TabEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
      <span className="text-13 font-medium text-secondary">{title}</span>
      <span className="max-w-xs text-12 text-tertiary">{body}</span>
    </div>
  );
}
