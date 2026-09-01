/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  IHelpdeskDisplayFilters,
  IHelpdeskForm,
  IHelpdeskPortal,
  IHelpdeskRequest,
  IHelpdeskRequestFilters,
  IHelpdeskStatus,
  THelpdeskGroupBy,
  TIssuePriorities,
} from "@plane/types";

export const DEFAULT_HELPDESK_FILTERS: IHelpdeskRequestFilters = {
  status: [],
  assignees: [],
  portal: [],
  form: [],
  source: [],
  priority: [],
  created_at: [],
};

export const DEFAULT_HELPDESK_DISPLAY_FILTERS: IHelpdeskDisplayFilters = {
  group_by: "status",
  order_by: "-created_at",
};

/** Number of filter dimensions that currently have at least one value selected. */
export const countActiveHelpdeskFilters = (filters: IHelpdeskRequestFilters): number =>
  (Object.keys(filters) as (keyof IHelpdeskRequestFilters)[]).reduce(
    (acc, key) => acc + (filters[key]?.length ? 1 : 0),
    0
  );

export const hasActiveHelpdeskFilters = (filters: IHelpdeskRequestFilters): boolean =>
  countActiveHelpdeskFilters(filters) > 0;

/** Extract "after:" / "before:" tokens from the created_at date filter array. */
const parseDateRange = (createdAt: string[]): { after?: string; before?: string } => {
  const result: { after?: string; before?: string } = {};
  for (const token of createdAt) {
    if (token.startsWith("after:")) result.after = token.slice("after:".length);
    else if (token.startsWith("before:")) result.before = token.slice("before:".length);
  }
  return result;
};

/**
 * Build the query params for GET /helpdesk/requests/ from the current filters,
 * display filters and search string. Multi-value filters are comma-joined
 * (Plane backend convention).
 */
export const buildHelpdeskRequestParams = (
  filters: IHelpdeskRequestFilters,
  displayFilters: IHelpdeskDisplayFilters,
  search: string
): Record<string, string> => {
  const params: Record<string, string> = {};

  if (filters.status.length) params.status = filters.status.join(",");
  if (filters.assignees.length) params.assignees = filters.assignees.join(",");
  if (filters.portal.length) params.portal = filters.portal.join(",");
  if (filters.form.length) params.form = filters.form.join(",");
  if (filters.source.length) params.source = filters.source.join(",");
  if (filters.priority.length) params.priority = filters.priority.join(",");

  const { after, before } = parseDateRange(filters.created_at);
  if (after) params.created_at__gte = after;
  if (before) params.created_at__lte = before;

  params.order_by = displayFilters.order_by;

  const trimmedSearch = search.trim();
  if (trimmedSearch) params.search = trimmedSearch;

  return params;
};

export interface IHelpdeskGroup {
  id: string;
  name: string;
  color?: string;
}

const NONE_GROUP: IHelpdeskGroup = { id: "__none__", name: "None" };
const ALL_GROUP: IHelpdeskGroup = { id: "__all__", name: "All requests" };

export interface IHelpdeskGroupContext {
  statuses: IHelpdeskStatus[];
  portals: IHelpdeskPortal[];
  forms: IHelpdeskForm[];
  getMemberName: (memberId: string) => string;
}

const SOURCE_LABELS: Record<string, string> = {
  public_form: "Public form",
  internal_form: "Internal form",
};

/** Severity order, matching PRIORITY_ORDER on the API. */
export const HELPDESK_PRIORITIES: { id: TIssuePriorities; name: string }[] = [
  { id: "urgent", name: "Urgent" },
  { id: "high", name: "High" },
  { id: "medium", name: "Medium" },
  { id: "low", name: "Low" },
  { id: "none", name: "None" },
];

/**
 * Generic grouping for the helpdesk list/kanban. Returns the ordered group
 * definitions plus a map of groupId -> requestId[] (requests are assumed to be
 * already filtered & ordered by the backend; relative order is preserved).
 */
export const groupHelpdeskRequests = (
  requests: IHelpdeskRequest[],
  groupBy: THelpdeskGroupBy,
  ctx: IHelpdeskGroupContext
): { groups: IHelpdeskGroup[]; grouped: Record<string, string[]> } => {
  if (groupBy === "none") {
    return {
      groups: [ALL_GROUP],
      grouped: { [ALL_GROUP.id]: requests.map((r) => r.id) },
    };
  }

  let groups: IHelpdeskGroup[] = [];
  // resolve which group(s) a request belongs to
  let keyOf: (request: IHelpdeskRequest) => string;

  switch (groupBy) {
    case "status": {
      groups = ctx.statuses.map((s) => ({ id: s.id, name: s.name, color: s.color }));
      keyOf = (r) => r.status || NONE_GROUP.id;
      break;
    }
    case "portal": {
      groups = ctx.portals.map((p) => ({ id: p.id, name: p.public_slug }));
      keyOf = (r) => r.portal || NONE_GROUP.id;
      break;
    }
    case "form": {
      groups = ctx.forms.map((f) => ({ id: f.id, name: f.name }));
      keyOf = (r) => r.form || NONE_GROUP.id;
      break;
    }
    case "source": {
      groups = Object.entries(SOURCE_LABELS).map(([id, name]) => ({ id, name }));
      keyOf = (r) => r.source || NONE_GROUP.id;
      break;
    }
    case "priority": {
      groups = HELPDESK_PRIORITIES.map((p) => ({ id: p.id, name: p.name }));
      keyOf = (r) => r.priority || "none";
      break;
    }
    case "assignee": {
      // build assignee groups dynamically from the requests
      const seen = new Set<string>();
      for (const r of requests) {
        for (const a of r.assignees || []) seen.add(a);
      }
      groups = Array.from(seen).map((id) => ({ id, name: ctx.getMemberName(id) }));
      // assignee is many-to-many: handled below (a request can land in multiple groups)
      keyOf = () => "";
      break;
    }
    default: {
      keyOf = () => NONE_GROUP.id;
    }
  }

  const grouped: Record<string, string[]> = {};
  for (const group of groups) grouped[group.id] = [];
  grouped[NONE_GROUP.id] = [];

  if (groupBy === "assignee") {
    for (const r of requests) {
      const assignees = r.assignees || [];
      if (assignees.length === 0) {
        grouped[NONE_GROUP.id].push(r.id);
      } else {
        for (const a of assignees) {
          if (!grouped[a]) grouped[a] = [];
          grouped[a].push(r.id);
        }
      }
    }
  } else {
    for (const r of requests) {
      const key = keyOf(r);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r.id);
    }
  }

  // append the "None" group only when it has members
  const orderedGroups = [...groups];
  if (grouped[NONE_GROUP.id]?.length) orderedGroups.push(NONE_GROUP);

  return { groups: orderedGroups, grouped };
};
