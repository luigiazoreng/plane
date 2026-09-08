/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import type { IHelpdeskDisplayFilters, IHelpdeskRequest, IHelpdeskStatus, THelpdeskOrderBy } from "@plane/types";
import { cn } from "@plane/utils";
import { PriorityIcon } from "@plane/propel/icons";
import { ChevronDown } from "lucide-react";
import { HelpdeskStatusPill } from "@/components/helpdesk/status-pill";
import { getRequestPriority, isRequestUnread } from "./adapters";

const ORDER_BY_LABELS: Record<THelpdeskOrderBy, string> = {
  "-created_at": "Recent",
  created_at: "Oldest",
  "-updated_at": "Last updated",
  updated_at: "Least recently updated",
  title: "Title",
  priority: "Priority",
  "-priority": "Priority (low first)",
};

/** Compact relative age, matching the queue density in the design ("Agora", "2h", "3d"). */
function relativeAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type TTicketQueueProps = {
  requests: IHelpdeskRequest[];
  statusMap: Record<string, IHelpdeskStatus>;
  selectedRequestId: string | null;
  onSelect: (requestId: string) => void;
  displayFilters: IHelpdeskDisplayFilters;
  onOrderByChange: (orderBy: THelpdeskOrderBy) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  /** Drives the mobile split: queue and conversation swap instead of stacking. */
  isTicketOpen: boolean;
};

export function TicketQueue({
  requests,
  statusMap,
  selectedRequestId,
  onSelect,
  displayFilters,
  onOrderByChange,
  hasMore,
  isLoadingMore,
  onLoadMore,
  isTicketOpen,
}: TTicketQueueProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMoreRef.current();
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]);

  return (
    <div
      className={cn(
        "flex flex-col border-r border-subtle bg-surface-1",
        // Below lg the three columns cannot coexist: the queue takes the whole
        // width until a ticket is opened, then yields it to the conversation.
        "w-full lg:w-78 lg:min-w-78",
        isTicketOpen && "hidden lg:flex"
      )}
    >
      {/* Sort bar */}
      <div className="flex h-9 min-h-9 items-center justify-between gap-2 border-b border-subtle px-3">
        <div className="relative flex items-center gap-1 text-secondary">
          <span className="text-12 font-medium">Sort: {ORDER_BY_LABELS[displayFilters.order_by]}</span>
          <ChevronDown className="size-3 shrink-0" />
          <select
            aria-label="Sort tickets"
            value={displayFilters.order_by}
            onChange={(e) => onOrderByChange(e.target.value as THelpdeskOrderBy)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {(Object.keys(ORDER_BY_LABELS) as THelpdeskOrderBy[]).map((key) => (
              <option key={key} value={key}>
                {ORDER_BY_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <span className="text-11 text-tertiary">{requests.length}</span>
      </div>

      {/* Rows */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
            <p className="text-13 font-medium text-primary">Nenhum ticket na fila</p>
            <p className="text-12 text-tertiary">Ajuste os filtros ou aguarde novas solicitações do portal.</p>
          </div>
        ) : (
          requests.map((request) => {
            const isSelected = request.id === selectedRequestId;
            const isUnread = isRequestUnread(request);
            const priority = getRequestPriority(request);
            const status = request.status ? statusMap[request.status] : undefined;

            return (
              <button
                key={request.id}
                type="button"
                onClick={() => onSelect(request.id)}
                className={cn(
                  "relative flex flex-col gap-1 border-b border-subtle px-3.5 py-2.5 text-left transition-colors",
                  isSelected ? "bg-layer-transparent-hover" : "hover:bg-layer-1"
                )}
              >
                {isSelected && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent-primary" />}

                <div className="flex items-center gap-2">
                  {request.display_id && <span className="font-mono text-11 text-tertiary">{request.display_id}</span>}
                  {priority && <PriorityIcon priority={priority} size={12} withContainer />}
                  {isUnread && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-accent-primary" />}
                </div>

                <p
                  className={cn(
                    "truncate text-13 leading-tight",
                    isSelected || isUnread ? "text-primary" : "text-secondary",
                    isUnread ? "font-semibold" : "font-medium"
                  )}
                >
                  {request.title}
                </p>

                {request.description && (
                  <p className="truncate text-12 leading-tight text-tertiary">{stripHtml(request.description)}</p>
                )}

                <div className="flex items-center gap-1.5 text-12 text-tertiary">
                  <span className="min-w-0 truncate">
                    {request.customer_detail?.name || request.contact_email
                      ? request.customer_detail?.name || request.contact_email
                      : request.created_by_detail
                        ? `Agente: ${request.created_by_detail.display_name || request.created_by_detail.first_name || "Membro"}`
                        : "Sem cliente"}
                  </span>
                  <span>·</span>
                  <span className="shrink-0">{relativeAge(request.created_at)}</span>
                  {status && <HelpdeskStatusPill status={status} className="ml-auto" />}
                </div>
              </button>
            );
          })
        )}

        <div ref={sentinelRef} className="px-3 py-1">
          {isLoadingMore && (
            <div className="flex items-center justify-center py-2">
              <div className="size-4 animate-spin rounded-full border-b-2 border-accent-strong" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Descriptions arrive as HTML from the editor; the queue preview is a single plain line. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
