/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import type {
  IHelpdeskRequest,
  IHelpdeskRequestActivity,
  IHelpdeskRequestComment,
  IHelpdeskStatus,
  IHelpdeskMacro,
  IHelpdeskTeam,
  TIssuePriorities,
} from "@plane/types";
import { cn, convertBytesToSize, getFileURL } from "@plane/utils";
import { ArrowLeft, ChevronDown, Clock, Paperclip, Star, Activity } from "lucide-react";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { HelpdeskStatusDot, HelpdeskStatusPill } from "@/components/helpdesk/status-pill";
import { Popover } from "@headlessui/react";
import { isRequestBookmarked, getRequestSnoozedUntil, getRequestPriority, getRequestTeam } from "./adapters";
import { Composer, type TComposerMode } from "./composer";
import { MessageThread } from "./message-thread";
import type { useAttachmentUpload } from "@/components/helpdesk/attachments/use-attachment-upload";

type TConversationTab = "conversation" | "attachments" | "activity" | "history";

type TConversationPanelProps = {
  request: IHelpdeskRequest;
  comments: IHelpdeskRequestComment[];
  activities?: IHelpdeskRequestActivity[];
  customerHistory?: IHelpdeskRequest[];
  macros?: IHelpdeskMacro[];
  teams?: IHelpdeskTeam[];
  isLoadingComments: boolean;
  statuses: IHelpdeskStatus[];
  statusMap: Record<string, IHelpdeskStatus>;
  onStatusChange: (statusId: string) => void;
  onPriorityChange: (priority: TIssuePriorities) => void;
  onAssigneesChange: (assignees: string[]) => void;
  onTeamChange?: (teamId: string | null) => void;
  onToggleBookmark?: () => void;
  onSnooze?: (snoozedUntil: string | null) => void;
  composerMode: TComposerMode;
  onComposerModeChange: (mode: TComposerMode) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  attachments: ReturnType<typeof useAttachmentUpload>;
  onBackToQueue: () => void;
  workspaceSlug?: string;
};

export function ConversationPanel({
  request,
  comments,
  activities = [],
  customerHistory = [],
  macros = [],
  teams = [],
  isLoadingComments,
  statuses,
  statusMap,
  onStatusChange,
  onPriorityChange,
  onAssigneesChange,
  onTeamChange,
  onToggleBookmark,
  onSnooze,
  composerMode,
  onComposerModeChange,
  draft,
  onDraftChange,
  onSubmit,
  isSubmitting,
  attachments,
  onBackToQueue,
  workspaceSlug,
}: TConversationPanelProps) {
  const [tab, setTab] = useState<TConversationTab>("conversation");
  const isBookmarked = isRequestBookmarked(request);
  const snoozedUntil = getRequestSnoozedUntil(request);
  const status = request.status ? statusMap[request.status] : undefined;
  const priority = getRequestPriority(request);
  const team = getRequestTeam(request);

  const sentAttachments = useMemo(() => comments.flatMap((comment) => comment.attachments ?? []), [comments]);

  const tabs: { key: TConversationTab; label: string; count?: number }[] = [
    { key: "conversation", label: "Conversation" },
    { key: "attachments", label: "Attachments", count: sentAttachments.length },
    { key: "activity", label: "Activity", count: activities.length },
    { key: "history", label: "History", count: customerHistory.length },
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

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onToggleBookmark}
              title={isBookmarked ? "Remover dos favoritos" : "Favoritar ticket"}
              className={cn(
                "grid size-6 place-items-center rounded transition-colors hover:bg-layer-2",
                isBookmarked ? "text-warning-primary" : "text-tertiary hover:text-primary"
              )}
            >
              <Star className={cn("size-4", isBookmarked && "fill-current")} />
            </button>

            <Popover className="relative">
              <Popover.Button
                type="button"
                title={snoozedUntil ? `Adiado até ${new Date(snoozedUntil).toLocaleString()}` : "Adiar ticket"}
                className={cn(
                  "grid size-6 place-items-center rounded transition-colors hover:bg-layer-2",
                  snoozedUntil ? "text-accent-primary" : "text-tertiary hover:text-primary"
                )}
              >
                <Clock className="size-4" />
              </Popover.Button>
              <Popover.Panel className="shadow-md absolute top-full right-0 z-20 mt-1.5 w-44 rounded-md border border-subtle bg-surface-1 p-1">
                {({ close }: { close: () => void }) => (
                  <div className="flex flex-col gap-0.5 text-12">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setHours(d.getHours() + 4);
                        if (onSnooze) onSnooze(d.toISOString());
                        close();
                      }}
                      className="rounded px-2.5 py-1.5 text-left text-primary hover:bg-layer-2"
                    >
                      Por 4 horas
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        if (onSnooze) onSnooze(d.toISOString());
                        close();
                      }}
                      className="rounded px-2.5 py-1.5 text-left text-primary hover:bg-layer-2"
                    >
                      Até amanhã
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 7);
                        if (onSnooze) onSnooze(d.toISOString());
                        close();
                      }}
                      className="rounded px-2.5 py-1.5 text-left text-primary hover:bg-layer-2"
                    >
                      Até próxima semana
                    </button>
                    {snoozedUntil && (
                      <button
                        type="button"
                        onClick={() => {
                          if (onSnooze) onSnooze(null);
                          close();
                        }}
                        className="rounded px-2.5 py-1.5 text-left text-danger-primary hover:bg-layer-2"
                      >
                        Remover adiamento
                      </button>
                    )}
                  </div>
                )}
              </Popover.Panel>
            </Popover>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {request.created_by_detail && (
            <span className="border-accent-primary/20 inline-flex items-center gap-1 rounded-md border bg-accent-primary/10 px-2 py-0.5 text-11 font-medium text-accent-primary">
              Criado por Agente:{" "}
              {request.created_by_detail.display_name || request.created_by_detail.first_name || "Agente"}
            </span>
          )}
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
          <Popover className="relative">
            <Popover.Button
              type="button"
              className="inline-flex h-6 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-2 text-12 text-secondary transition-colors hover:border-strong"
            >
              {request.team_detail ? (
                <>
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: request.team_detail.color || "#3B82F6" }}
                  />
                  <span>{request.team_detail.name}</span>
                </>
              ) : team ? (
                <span>{team}</span>
              ) : (
                <span className="text-tertiary">—</span>
              )}
              <ChevronDown className="size-3 text-tertiary" />
            </Popover.Button>
            <Popover.Panel className="shadow-md absolute top-full left-0 z-20 mt-1 w-48 rounded-md border border-subtle bg-surface-1 p-1">
              {({ close }: { close: () => void }) => (
                <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto text-12">
                  <button
                    type="button"
                    onClick={() => {
                      if (onTeamChange) onTeamChange(null);
                      close();
                    }}
                    className="rounded px-2.5 py-1.5 text-left text-tertiary hover:bg-layer-2"
                  >
                    — Sem time —
                  </button>
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (onTeamChange) onTeamChange(t.id);
                        close();
                      }}
                      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-left text-primary hover:bg-layer-2"
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: t.color || "#3B82F6" }} />
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </Popover.Panel>
          </Popover>
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
          activities.length === 0 ? (
            <TabEmpty title="Activity" body="Nenhuma atividade registrada para este ticket." />
          ) : (
            <div className="mx-auto flex max-w-[760px] flex-col gap-2.5">
              {activities.map((act) => {
                const actorName = act.actor_detail?.display_name || act.actor_detail?.name || "Sistema";
                return (
                  <div
                    key={act.id}
                    className="flex items-center gap-2.5 rounded-md border border-subtle bg-surface-2 px-3 py-2 text-12 text-primary"
                  >
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-layer-2 text-tertiary">
                      <Activity className="size-3" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                      <span className="font-medium text-primary">{actorName}</span>
                      <span className="text-tertiary">
                        {act.verb === "commented"
                          ? "adicionou uma resposta"
                          : act.verb === "internal_note"
                            ? "adicionou uma nota interna"
                            : act.verb === "added"
                              ? `adicionou ${act.field}`
                              : act.verb === "removed"
                                ? `removeu ${act.field}`
                                : `alterou ${act.field}`}
                      </span>
                      {act.old_value && act.new_value && (
                        <span className="font-mono text-11 text-secondary">
                          ({act.old_value} &rarr; {act.new_value})
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-11 text-tertiary">{new Date(act.created_at).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          )
        ) : customerHistory.length === 0 ? (
          <TabEmpty title="History" body="Nenhum ticket anterior encontrado para este cliente." />
        ) : (
          <div className="mx-auto flex max-w-[760px] flex-col gap-2">
            {customerHistory.map((hist) => {
              const histStatus = hist.status ? statusMap[hist.status] : undefined;
              return (
                <div
                  key={hist.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-subtle bg-surface-2 px-3 py-2.5 text-13"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {hist.display_id && (
                      <span className="font-mono shrink-0 text-11 text-tertiary">{hist.display_id}</span>
                    )}
                    <span className="truncate font-medium text-primary">{hist.title}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {histStatus ? <HelpdeskStatusPill status={histStatus} /> : null}
                    <span className="text-11 text-tertiary">{new Date(hist.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
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
        macros={macros}
        workspaceSlug={workspaceSlug}
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
