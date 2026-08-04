/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Adapters for the triage (split) view.
 *
 * Originally every field the design needed but the API didn't yet expose
 * (priority, tags, team, unread state, per-customer aggregates) was routed
 * through a stub here returning null/empty, so wiring the backend later meant
 * editing only this file. Priority, tags, team and unread/bookmark state have
 * since landed on the backend and are computed for real below. Only the
 * per-customer aggregate (`getCustomerStats`) remains a stub.
 */

import type { IHelpdeskPortal, IHelpdeskRequest, TIssuePriorities } from "@plane/types";

/** Tags for the Classification panel, derived from labels M2M on the request. */
export type THelpdeskLabelDetail = { id: string; name: string; color: string };

export function getRequestTags(request: IHelpdeskRequest): THelpdeskLabelDetail[] {
  return request.label_detail ?? [];
}

/** Team / agent group assigned to the request. */
export function getRequestTeam(request: IHelpdeskRequest): string | null {
  return request.team_detail?.name ?? null;
}

/** Read receipt status for the current user. */
export function isRequestUnread(request: IHelpdeskRequest): boolean {
  return request.is_unread ?? false;
}

/** Bookmark / favorite status for the current user. */
export function isRequestBookmarked(request: IHelpdeskRequest): boolean {
  return request.is_bookmarked ?? false;
}

/** Snooze date/time set by agent. */
export function getRequestSnoozedUntil(request: IHelpdeskRequest): string | null {
  return request.snoozed_until ?? null;
}

export type THelpdeskCustomerStats = {
  total: number;
  open: number;
  resolved: number;
  firstContactAt: string | null;
};

/* ------------------------------------------------------------------ *
 * Pending backend — returns empty until the API grows the field.
 * ------------------------------------------------------------------ */

/** TODO(backend): aggregate endpoint keyed by customer/contact_email. */
export function getCustomerStats(_request: IHelpdeskRequest): THelpdeskCustomerStats | null {
  return null;
}

/* ------------------------------------------------------------------ *
 * Derived from data the API already returns — real values, not stubs.
 * ------------------------------------------------------------------ */

/**
 * Ticket priority. Shares the work-item value set, so callers render it with
 * `PriorityIcon` / `PriorityDropdown` directly. Returns null for "none" so the
 * UI can fall back to its em-dash placeholder rather than showing a "None" chip
 * on every untriaged ticket.
 */
export function getRequestPriority(request: IHelpdeskRequest): TIssuePriorities | null {
  const priority = request.priority;
  if (!priority || priority === "none") return null;
  return priority;
}

export type THelpdeskSla = {
  /** Fraction of the SLA window consumed, clamped to 0..1. */
  progress: number;
  isBreached: boolean;
  label: string;
};

/**
 * Resolution SLA for a request, from the portal's configured window and the
 * request's own timestamps. Stops counting at `resolved_at` when present.
 * Returns null when the portal has no resolution SLA configured.
 */
export function getRequestSla(request: IHelpdeskRequest, portal: IHelpdeskPortal | undefined): THelpdeskSla | null {
  const hours = portal?.sla_resolution_hours;
  if (!hours || hours <= 0) return null;

  const startedAt = new Date(request.created_at).getTime();
  if (Number.isNaN(startedAt)) return null;

  const windowMs = hours * 60 * 60 * 1000;
  const settledAt = request.resolved_at ? new Date(request.resolved_at).getTime() : Date.now();
  const elapsedMs = settledAt - startedAt;
  const remainingMs = windowMs - elapsedMs;
  const progress = Math.min(Math.max(elapsedMs / windowMs, 0), 1);

  if (request.resolved_at) {
    return {
      progress,
      isBreached: remainingMs < 0,
      label: remainingMs < 0 ? `Resolvido com atraso` : `Resolvido no prazo`,
    };
  }

  if (remainingMs < 0) return { progress: 1, isBreached: true, label: `${formatDuration(-remainingMs)} em atraso` };
  return { progress, isBreached: false, label: `${formatDuration(remainingMs)} restantes` };
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  if (days >= 1) return `${days}d ${Math.floor((totalMinutes % 1440) / 60)}h`;
  const hours = Math.floor(totalMinutes / 60);
  return `${String(hours).padStart(2, "0")}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}

/**
 * How the request reached us. The API models this as `source`; the extra
 * channels in the design (email, API) are not distinguishable yet.
 */
export function getRequestChannel(request: IHelpdeskRequest): string {
  return request.source === "public_form" ? "Formulário público" : "Formulário interno";
}

export type THelpdeskClassification = { label: string; value: string };

/**
 * Category / subcategory, read out of the form responses using the form's own
 * field labels when available. Mirrors the standalone ticket page.
 */
export function getRequestClassification(request: IHelpdeskRequest): THelpdeskClassification[] {
  const responses = request.form_responses || {};
  const fields = request.form_detail?.fields_detail;

  return (["category_1", "category_2", "category_3"] as const)
    .map((key) => {
      const raw = responses[key];
      if (raw === null || raw === undefined || raw === "") return null;
      const field = fields?.find((item) => item.key === key);
      return { label: field?.label ?? DEFAULT_CATEGORY_LABELS[key], value: String(raw) };
    })
    .filter((entry): entry is THelpdeskClassification => entry !== null);
}

const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  category_1: "Categoria",
  category_2: "Subcategoria",
  category_3: "Detalhe",
};
