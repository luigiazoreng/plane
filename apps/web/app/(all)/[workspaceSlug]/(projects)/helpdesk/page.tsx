/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import type { ReactNode, RefObject } from "react";
import { useHelpdeskSSE, type THelpdeskSSEEvent } from "@/hooks/use-helpdesk-sse";
import { observer } from "mobx-react";
import { useNavigate, useParams, type NavigateFunction } from "react-router";
import { useLocalStorage } from "@plane/hooks";
import { Button } from "@plane/propel/button";
import { ArchiveIcon, CopyIcon, EditIcon, LinkIcon, NewTabIcon, TrashIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  IBaseLayoutsBaseGroup,
  IHelpdeskDisplayFilters,
  IHelpdeskRequest,
  IHelpdeskRequestFilters,
  IHelpdeskStatus,
} from "@plane/types";
import type { TContextMenuItem } from "@plane/ui";
import { ContextMenu } from "@plane/ui";
import { cn, copyUrlToClipboard } from "@plane/utils";
import {
  CalendarDays,
  Headset,
  KanbanSquare,
  LayoutList,
  MessageSquareText,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import { BaseKanbanLayout } from "@/components/base-layouts/kanban/layout";
import { AppHeader } from "@/components/core/app-header";
import { HelpdeskAppliedFilters } from "@/components/helpdesk/filters/helpdesk-applied-filters";
import { HelpdeskDisplayDropdown } from "@/components/helpdesk/filters/helpdesk-display-dropdown";
import { HelpdeskFiltersDropdown } from "@/components/helpdesk/filters/helpdesk-filters-dropdown";
import {
  DEFAULT_HELPDESK_DISPLAY_FILTERS,
  DEFAULT_HELPDESK_FILTERS,
  buildHelpdeskRequestParams,
  groupHelpdeskRequests,
} from "@/helpers/helpdesk/filters";
import { isHelpdeskRequestActive } from "@/helpers/helpdesk/statuses";
import useDebounce from "@/hooks/use-debounce";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";
import { useMember } from "@/hooks/store/use-member";
import type { IHelpdeskStore } from "@/store/helpdesk.store";

type THelpdeskAgentLayout = "list" | "kanban";
type THelpdeskKanbanItem = IHelpdeskRequest & Record<string, unknown>;

// Derive a stable color set from the status color (hex → tint bg + text)
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return { r, g, b };
}

function StatusDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block rounded-full", className)} style={{ backgroundColor: color }} />;
}

function StatusChip({
  status,
  className,
  onClick,
  showDot = true,
}: {
  status: IHelpdeskStatus;
  className?: string;
  onClick?: () => void;
  showDot?: boolean;
}) {
  const { r, g, b } = hexToRgb(status.color);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded px-2 py-1 text-12 font-medium transition-colors",
        onClick ? "hover:opacity-90" : "cursor-default",
        className
      )}
      style={{
        backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`,
        color: status.color,
      }}
    >
      {showDot && <StatusDot color={status.color} className="h-1.5 w-1.5 shrink-0" />}
      {status.name}
    </button>
  );
}

const WorkspaceHelpdeskPage = observer(() => {
  const { workspaceSlug } = useParams();
  const navigate = useNavigate();
  const helpdeskStore = useHelpdesk();
  const { getUserDetails } = useMember();
  const storageKey = workspaceSlug ? `helpdesk-layout:${workspaceSlug}` : "helpdesk-layout";
  const { storedValue: storedLayout, setValue: setStoredLayout } = useLocalStorage<THelpdeskAgentLayout>(
    storageKey,
    "list"
  );
  const { storedValue: storedFilters, setValue: setStoredFilters } = useLocalStorage<IHelpdeskRequestFilters>(
    workspaceSlug ? `helpdesk-filters:${workspaceSlug}` : "helpdesk-filters",
    DEFAULT_HELPDESK_FILTERS
  );
  const { storedValue: storedDisplay, setValue: setStoredDisplay } = useLocalStorage<IHelpdeskDisplayFilters>(
    workspaceSlug ? `helpdesk-display:${workspaceSlug}` : "helpdesk-display",
    DEFAULT_HELPDESK_DISPLAY_FILTERS
  );
  const filters = useMemo(() => ({ ...DEFAULT_HELPDESK_FILTERS, ...storedFilters }), [storedFilters]);
  const displayFilters = useMemo(() => ({ ...DEFAULT_HELPDESK_DISPLAY_FILTERS, ...storedDisplay }), [storedDisplay]);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [inlineStatusRequest, setInlineStatusRequest] = useState<string | null>(null);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newRequestTitle, setNewRequestTitle] = useState("");
  const kanbanAddInputRef = useRef<HTMLInputElement>(null);
  const listAddInputRef = useRef<HTMLInputElement>(null);
  const listSentinelRef = useRef<HTMLDivElement>(null);

  const wSlug = workspaceSlug?.toString() || "";
  const layout = storedLayout || "list";

  const statuses = helpdeskStore.getWorkspaceStatuses(wSlug);
  const requests = helpdeskStore.getWorkspaceRequests(wSlug);
  const portals = helpdeskStore.getWorkspacePortals(wSlug);
  const forms = useMemo(
    () => portals.flatMap((portal) => helpdeskStore.getPortalForms(portal.id)),
    [portals, helpdeskStore]
  );
  const defaultPortalId = portals[0]?.id;
  const portalMap = useMemo(() => Object.fromEntries(portals.map((portal) => [portal.id, portal])), [portals]);
  const statusMap = useMemo(() => Object.fromEntries(statuses.map((s) => [s.id, s])), [statuses]);

  // group-by drives drag-drop / inline-add availability
  const groupByStatus = displayFilters.group_by === "status";

  const queryParams = useMemo(
    () => buildHelpdeskRequestParams(filters, displayFilters, debouncedSearch),
    [filters, displayFilters, debouncedSearch]
  );

  // initial load of statuses / portals
  useEffect(() => {
    if (!wSlug) return;
    helpdeskStore.fetchStatuses(wSlug);
    helpdeskStore.fetchPortals(wSlug);
  }, [wSlug, helpdeskStore]);

  // fetch forms per portal (used by the Form filter + grouping)
  useEffect(() => {
    if (!wSlug) return;
    portals.forEach((portal) => helpdeskStore.fetchForms(wSlug, portal.id));
  }, [wSlug, portals, helpdeskStore]);

  // re-fetch requests whenever filters / display / search change
  useEffect(() => {
    if (!wSlug) return;
    helpdeskStore.fetchRequests(wSlug, queryParams);
  }, [wSlug, helpdeskStore, queryParams]);

  // re-fetch on tab focus
  useEffect(() => {
    if (!wSlug) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        helpdeskStore.fetchRequests(wSlug, queryParams);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [wSlug, helpdeskStore, queryParams]);

  useHelpdeskSSE(wSlug, (event: THelpdeskSSEEvent) => {
    if (event.type === "request.created" || event.type === "request.updated") {
      helpdeskStore.fetchRequestById(wSlug, event.request_id);
    }
  });

  // generic grouping (kanban + list group headers)
  const { groups, grouped } = useMemo(
    () =>
      groupHelpdeskRequests(requests, displayFilters.group_by, {
        statuses,
        portals,
        forms,
        getMemberName: (id) => getUserDetails(id)?.display_name ?? "Unknown",
      }),
    [requests, displayFilters.group_by, statuses, portals, forms, getUserDetails]
  );

  const kanbanGroups = useMemo<IBaseLayoutsBaseGroup[]>(
    () => groups.map((g) => ({ id: g.id, name: g.name })),
    [groups]
  );

  // Pagination state — declared before the useMemos that depend on hasMoreRequests
  const loadMoreState = helpdeskStore.getCollectionState(`requests-more:${wSlug}`);
  const isLoadingMore = loadMoreState.isLoading;
  const pagination = helpdeskStore.requestPagination[wSlug];
  const totalRequests = pagination?.totalCount ?? requests.length;
  const hasMoreRequests = pagination?.nextPageResults ?? false;

  const requestItems = useMemo(() => {
    const map = requests.reduce(
      (acc, request) => {
        acc[request.id] = request as THelpdeskKanbanItem;
        return acc;
      },
      {} as Record<string, THelpdeskKanbanItem>
    );
    if (addingToGroup) {
      const sentinelId = `__add__:${addingToGroup}`;
      map[sentinelId] = { id: sentinelId, status: addingToGroup } as unknown as THelpdeskKanbanItem;
    }
    for (const g of groups) {
      let showSentinel: boolean;
      if (groupByStatus) {
        const statusPag = helpdeskStore.getStatusPagination(wSlug, g.id);
        // cold start (undefined) = first per-column fetch hasn't run yet → show sentinel
        showSentinel = statusPag === undefined ? true : statusPag.nextPageResults;
      } else {
        showSentinel = hasMoreRequests;
      }
      if (showSentinel) {
        const sentinelId = `__sentinel__:${g.id}`;
        map[sentinelId] = { id: sentinelId, status: g.id } as unknown as THelpdeskKanbanItem;
      }
    }
    return map;
  }, [requests, addingToGroup, hasMoreRequests, groups, groupByStatus, helpdeskStore, wSlug]);

  const requestGroups = useMemo(() => {
    const next: Record<string, string[]> = {};
    for (const g of groups) {
      const ids = [...(grouped[g.id] || [])];
      if (groupByStatus && addingToGroup === g.id) ids.push(`__add__:${g.id}`);
      let showSentinel: boolean;
      if (groupByStatus) {
        const statusPag = helpdeskStore.getStatusPagination(wSlug, g.id);
        showSentinel = statusPag === undefined ? true : statusPag.nextPageResults;
      } else {
        showSentinel = hasMoreRequests;
      }
      if (showSentinel) ids.push(`__sentinel__:${g.id}`);
      next[g.id] = ids;
    }
    return next;
  }, [groups, grouped, groupByStatus, addingToGroup, hasMoreRequests, helpdeskStore, wSlug]);

  const statusesState = helpdeskStore.getCollectionState(`statuses:${wSlug}`);
  const requestsState = helpdeskStore.getCollectionState(`requests:${wSlug}`);
  const isLoading = statusesState.isLoading || requestsState.isLoading;

  const fetchMore = useCallback(() => {
    if (!isLoadingMore && hasMoreRequests) {
      helpdeskStore.fetchMoreRequests(wSlug, queryParams);
    }
  }, [isLoadingMore, hasMoreRequests, helpdeskStore, wSlug, queryParams]);

  const isLoadingMoreForStatus = useCallback(
    (statusId: string) => helpdeskStore.getCollectionState(`requests-more:${wSlug}:${statusId}`).isLoading,
    [helpdeskStore, wSlug]
  );

  // Infinite scroll — list view: observe the sentinel at the bottom of the scroll container
  useEffect(() => {
    const sentinel = listSentinelRef.current;
    if (!sentinel || !hasMoreRequests) return;
    const listObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchMore();
      },
      { rootMargin: "200px" }
    );
    listObserver.observe(sentinel);
    return () => listObserver.disconnect();
  }, [hasMoreRequests, fetchMore]);
  const activeRequests = requests.filter((request) =>
    isHelpdeskRequestActive(request, statuses, portalMap[request.portal]?.auto_assignment_config)
  ).length;
  const resolvedRequests = requests.length - activeRequests;

  useEffect(() => {
    if (addingToGroup) {
      kanbanAddInputRef.current?.focus();
      listAddInputRef.current?.focus();
    }
  }, [addingToGroup]);

  const handleFilterChange = (key: keyof IHelpdeskRequestFilters, values: string[]) => {
    setStoredFilters({ ...filters, [key]: values });
  };
  const handleRemoveFilter = (key: keyof IHelpdeskRequestFilters, value: string) => {
    setStoredFilters({ ...filters, [key]: (filters[key] as string[]).filter((v) => v !== value) });
  };
  const handleClearFilters = () => setStoredFilters({ ...DEFAULT_HELPDESK_FILTERS });
  const handleDisplayChange = (data: Partial<IHelpdeskDisplayFilters>) =>
    setStoredDisplay({ ...displayFilters, ...data });

  const handleStatusDrop = async (
    sourceId: string,
    _destinationId: string | null,
    sourceGroupId: string,
    destinationGroupId: string
  ) => {
    if (sourceGroupId === destinationGroupId) return;
    try {
      await helpdeskStore.updateRequest(wSlug, sourceId, { status: destinationGroupId });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Status updated" });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to move request" });
      await helpdeskStore.fetchRequests(wSlug, queryParams);
    }
  };

  const handleInlineStatusChange = async (requestId: string, newStatusId: string) => {
    setInlineStatusRequest(null);
    try {
      await helpdeskStore.updateRequest(wSlug, requestId, { status: newStatusId });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update status" });
    }
  };

  const handleAddRequest = async (statusId: string) => {
    const title = newRequestTitle.trim();
    if (!title || !defaultPortalId) return;
    setAddingToGroup(null);
    setNewRequestTitle("");
    try {
      await helpdeskStore.createRequest(wSlug, { title, status: statusId, portal: defaultPortalId });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to create request" });
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <AppHeader
        header={
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="bg-custom-sidebar-accent/15 text-custom-sidebar-accent flex size-6 shrink-0 items-center justify-center rounded-md">
                <Headset className="size-3.5" />
              </div>
              <span className="text-sm text-text-100 font-semibold">Helpdesk</span>
              <div className="hidden items-center gap-1.5 md:flex">
                <span className="text-13 text-tertiary">·</span>
                <span className="rounded-md bg-layer-1 px-2 py-0.5 text-12 text-secondary">
                  {requests.length < totalRequests ? `${requests.length} / ${totalRequests}` : `${totalRequests}`} total
                </span>
                <span className="bg-orange-500/10 text-orange-500 rounded-md px-2 py-0.5 text-12">
                  {activeRequests} active
                </span>
                <span className="bg-emerald-500/10 text-emerald-500 rounded-md px-2 py-0.5 text-12">
                  {resolvedRequests} resolved
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="hidden items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-2 py-1 md:flex">
                <Search className="size-3.5 text-tertiary" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-32 bg-transparent text-13 text-primary outline-none placeholder:text-tertiary"
                />
              </div>

              <HelpdeskFiltersDropdown
                filters={filters}
                statuses={statuses}
                portals={portals}
                forms={forms}
                onChange={handleFilterChange}
              />
              <HelpdeskDisplayDropdown displayFilters={displayFilters} onChange={handleDisplayChange} />

              <div className="flex items-center gap-0.5 rounded-md border border-subtle bg-layer-1 p-0.5">
                <button
                  type="button"
                  onClick={() => setStoredLayout("list")}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-2.5 py-1 text-13 font-medium transition-colors",
                    layout === "list"
                      ? "bg-accent-strong shadow-sm text-white"
                      : "text-secondary hover:bg-layer-2 hover:text-primary"
                  )}
                >
                  <LayoutList className="size-3.5" />
                  <span className="hidden sm:inline">List</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStoredLayout("kanban")}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-2.5 py-1 text-13 font-medium transition-colors",
                    layout === "kanban"
                      ? "bg-accent-strong shadow-sm text-white"
                      : "text-secondary hover:bg-layer-2 hover:text-primary"
                  )}
                >
                  <KanbanSquare className="size-3.5" />
                  <span className="hidden sm:inline">Kanban</span>
                </button>
              </div>
            </div>
          </div>
        }
      />

      <HelpdeskAppliedFilters
        filters={filters}
        statuses={statuses}
        portals={portals}
        forms={forms}
        onRemove={handleRemoveFilter}
        onClear={handleClearFilters}
      />

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-accent-strong" />
          </div>
        ) : requestsState.error ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-13 font-medium text-primary">We couldn&apos;t load the Helpdesk queue.</p>
            <p className="mt-1 text-13 text-tertiary">{requestsState.error}</p>
          </div>
        ) : statuses.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <MessageSquareText className="mb-4 size-8 text-tertiary" />
            <p className="text-13 font-medium text-primary">No statuses configured</p>
            <p className="mt-1 max-w-sm text-13 text-tertiary">Go to Settings to set up your Helpdesk statuses.</p>
            <button
              type="button"
              className="mt-4 flex items-center gap-2 rounded-md border border-subtle bg-layer-2 px-3 py-1.5 text-13 font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
              onClick={() => navigate(`/${wSlug}/helpdesk/settings`)}
            >
              <Settings className="size-3.5" />
              Configure
            </button>
          </div>
        ) : requests.length === 0 && !addingToGroup ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <MessageSquareText className="mb-4 size-8 text-tertiary" />
            <p className="text-13 font-medium text-primary">No requests found</p>
            <p className="mt-1 max-w-sm text-13 text-tertiary">
              Requests submitted through your portal will appear here for triage.
            </p>
            <button
              type="button"
              className="mt-4 flex items-center gap-2 rounded-md border border-subtle bg-layer-2 px-3 py-1.5 text-13 font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
              onClick={() => navigate(`/${wSlug}/helpdesk/settings`)}
            >
              <Settings className="size-3.5" />
              Configure portal
            </button>
          </div>
        ) : layout === "kanban" ? (
          <div className="flex h-full flex-col overflow-hidden">
            <BaseKanbanLayout<THelpdeskKanbanItem>
              items={requestItems}
              groups={kanbanGroups}
              groupedItemIds={requestGroups}
              enableDragDrop={groupByStatus}
              onDrop={handleStatusDrop}
              renderGroupHeader={({ group, itemCount }) => {
                const statusObj = statusMap[group.id];
                const statusPag = groupByStatus ? helpdeskStore.getStatusPagination(wSlug, group.id) : undefined;
                const groupHasMore = groupByStatus
                  ? statusPag === undefined || statusPag.nextPageResults
                  : hasMoreRequests;
                const realCount =
                  itemCount - (groupByStatus && addingToGroup === group.id ? 1 : 0) - (groupHasMore ? 1 : 0);
                return (
                  <div className="relative flex w-full flex-row items-center gap-1 py-1.5">
                    <div
                      className="flex size-5 shrink-0 items-center justify-center rounded-xs"
                      style={statusObj ? { backgroundColor: `${statusObj.color}1a` } : undefined}
                    >
                      {statusObj ? (
                        <StatusDot color={statusObj.color} className="h-2 w-2" />
                      ) : (
                        <StatusDot color="#9ca3af" className="h-2 w-2" />
                      )}
                    </div>
                    <div className="flex w-full flex-row items-baseline gap-1 overflow-hidden">
                      <span className="line-clamp-1 inline-block truncate font-medium text-primary">{group.name}</span>
                      <span className="shrink-0 pl-2 text-13 font-medium text-tertiary">{realCount}</span>
                    </div>
                    {groupByStatus && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingToGroup(group.id);
                          setNewRequestTitle("");
                        }}
                        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm bg-layer-transparent transition-all hover:bg-layer-transparent-hover"
                        title="Add request"
                      >
                        <span className="text-xs leading-none font-semibold text-secondary">+</span>
                      </button>
                    )}
                  </div>
                );
              }}
              renderItem={(request, groupId) => {
                if (request.id.startsWith("__sentinel__:")) {
                  if (groupByStatus && groupId) {
                    const statusId = groupId;
                    return (
                      <KanbanColumnSentinel
                        isLoadingMore={isLoadingMoreForStatus(statusId)}
                        onVisible={() => helpdeskStore.fetchMoreRequestsForStatus(wSlug, statusId, queryParams)}
                      />
                    );
                  }
                  return <KanbanColumnSentinel isLoadingMore={isLoadingMore} onVisible={fetchMore} />;
                }
                if (request.id.startsWith("__add__:")) {
                  const statusId = request.status as string;
                  return (
                    <div className="rounded-lg border border-accent-strong bg-layer-2 p-2 shadow-raised-100">
                      <input
                        ref={kanbanAddInputRef}
                        value={newRequestTitle}
                        onChange={(e) => setNewRequestTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddRequest(statusId);
                          if (e.key === "Escape") {
                            setAddingToGroup(null);
                            setNewRequestTitle("");
                          }
                        }}
                        placeholder="Request title..."
                        className="w-full bg-transparent text-13 font-medium text-primary outline-none placeholder:text-tertiary"
                      />
                      <div className="mt-2 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAddRequest(statusId)}
                          disabled={!newRequestTitle.trim() || !defaultPortalId}
                          className="bg-accent-strong rounded px-2 py-0.5 text-12 font-medium text-white transition-opacity disabled:opacity-40"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingToGroup(null);
                            setNewRequestTitle("");
                          }}
                          className="rounded px-2 py-0.5 text-12 text-secondary transition-colors hover:bg-layer-transparent-hover"
                        >
                          Cancel
                        </button>
                        {!defaultPortalId && <span className="text-red-400 text-11">No portal configured</span>}
                      </div>
                    </div>
                  );
                }
                return (
                  <HelpdeskKanbanRequestCard
                    request={request}
                    workspaceSlug={wSlug}
                    helpdeskStore={helpdeskStore}
                    navigate={navigate}
                  />
                );
              }}
            />
          </div>
        ) : (
          /* List view — grouped */
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              {requests.length === 0 && !addingToGroup ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <MessageSquareText className="mb-3 size-7 text-tertiary" />
                  <p className="text-13 font-medium text-primary">No requests match your filters</p>
                </div>
              ) : (
                groups.map((group) => {
                  const groupRequestIds = grouped[group.id] || [];
                  const showAddRow = groupByStatus && addingToGroup === group.id;
                  if (groupRequestIds.length === 0 && !showAddRow) return null;
                  const groupStatus = statusMap[group.id];
                  return (
                    <div key={group.id}>
                      {/* Group header */}
                      <div className="sticky top-0 z-1 flex items-center gap-2 border-b border-subtle bg-layer-1 px-4 py-2">
                        <StatusDot
                          color={group.color || groupStatus?.color || "#9ca3af"}
                          className="h-2 w-2 shrink-0"
                        />
                        <span className="text-13 font-medium text-primary">{group.name}</span>
                        <span className="text-12 text-tertiary">{groupRequestIds.length}</span>
                        {groupByStatus && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingToGroup(group.id);
                              setNewRequestTitle("");
                            }}
                            className="ml-1 grid size-5 place-items-center rounded-sm text-secondary transition-colors hover:bg-layer-2"
                            title="Add request"
                          >
                            <span className="text-xs leading-none font-semibold">+</span>
                          </button>
                        )}
                      </div>

                      {groupRequestIds.map((requestId) => {
                        const request = requestItems[requestId];
                        if (!request) return null;
                        const statusObj = request.status ? statusMap[request.status] : null;
                        const isStatusOpen = inlineStatusRequest === request.id;
                        return (
                          <HelpdeskListRequestRow
                            key={request.id}
                            request={request}
                            workspaceSlug={wSlug}
                            helpdeskStore={helpdeskStore}
                            navigate={navigate}
                          >
                            {/* Status badge — clickable inline */}
                            <div className="relative shrink-0">
                              {statusObj ? (
                                <StatusChip
                                  status={statusObj}
                                  onClick={() => setInlineStatusRequest(isStatusOpen ? null : request.id)}
                                />
                              ) : (
                                <span className="rounded px-2 py-1 text-12 text-tertiary">—</span>
                              )}
                              {isStatusOpen && (
                                <div className="shadow-lg absolute top-full left-0 z-10 mt-1 min-w-40 rounded-lg border border-subtle bg-layer-1 py-1">
                                  {statuses.map((s) => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => handleInlineStatusChange(request.id, s.id)}
                                      className={cn(
                                        "flex w-full items-center gap-2 px-3 py-1.5 text-13 transition-colors hover:bg-layer-2",
                                        s.id === request.status ? "font-medium text-primary" : "text-secondary"
                                      )}
                                    >
                                      <StatusDot color={s.color} className="h-2 w-2 shrink-0" />
                                      {s.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Title + description — navigate on click */}
                            <button
                              type="button"
                              className="min-w-0 flex-1 cursor-pointer text-left"
                              onClick={() => navigate(`/${wSlug}/helpdesk/${request.id}`)}
                            >
                              {request.display_id && (
                                <p className="font-mono text-11 text-tertiary">{request.display_id}</p>
                              )}
                              <p className="truncate text-body-sm-medium text-primary">{request.title}</p>
                              {request.description && (
                                <p className="mt-0.5 truncate text-12 text-tertiary">{request.description}</p>
                              )}
                            </button>

                            {/* Meta */}
                            <div className="hidden shrink-0 items-center gap-4 text-tertiary md:flex">
                              <div className="flex items-center gap-1.5 text-13">
                                <UserRound className="size-3.5 shrink-0" />
                                <span className="max-w-[120px] truncate">
                                  {request.contact_email || "Authenticated"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-13">
                                <CalendarDays className="size-3.5 shrink-0" />
                                {new Date(request.created_at).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </div>
                            </div>
                          </HelpdeskListRequestRow>
                        );
                      })}

                      {/* Inline add row */}
                      {showAddRow && (
                        <div className="flex items-center gap-3 border-b border-subtle px-4 py-2.5">
                          {statusMap[group.id] && (
                            <StatusChip status={statusMap[group.id]} showDot className="shrink-0" />
                          )}
                          <input
                            ref={listAddInputRef}
                            value={newRequestTitle}
                            onChange={(e) => setNewRequestTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddRequest(group.id);
                              if (e.key === "Escape") {
                                setAddingToGroup(null);
                                setNewRequestTitle("");
                              }
                            }}
                            placeholder="Request title..."
                            className="min-w-0 flex-1 bg-transparent text-body-sm-medium text-primary outline-none placeholder:text-tertiary"
                          />
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleAddRequest(group.id)}
                              disabled={!newRequestTitle.trim() || !defaultPortalId}
                              className="bg-accent-strong rounded px-2 py-0.5 text-12 font-medium text-white transition-opacity disabled:opacity-40"
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingToGroup(null);
                                setNewRequestTitle("");
                              }}
                              className="rounded px-2 py-0.5 text-12 text-secondary transition-colors hover:bg-layer-transparent-hover"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* + New request */}
              {groupByStatus && (
                <button
                  type="button"
                  onClick={() => {
                    const target = statuses[0]?.id ?? null;
                    if (target) {
                      setAddingToGroup(target);
                      setNewRequestTitle("");
                    }
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-13 text-tertiary transition-colors hover:bg-layer-1 hover:text-secondary"
                >
                  <span className="text-base leading-none font-medium">+</span>
                  New request
                </button>
              )}

              {/* Infinite scroll sentinel — list */}
              <div ref={listSentinelRef} className="px-4 py-1">
                {isLoadingMore && (
                  <div className="flex items-center justify-center py-2">
                    <div className="size-4 animate-spin rounded-full border-b-2 border-accent-strong" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

type THelpdeskRequestContextMenuProps = {
  request: IHelpdeskRequest;
  workspaceSlug: string;
  helpdeskStore: IHelpdeskStore;
  navigate: NavigateFunction;
  parentRef: RefObject<HTMLElement>;
};

const HELPDESK_ARCHIVABLE_STATUS_NAMES = ["resolved", "closed", "completed", "canceled", "cancelled"];

const isHelpdeskRequestArchivable = (request: IHelpdeskRequest): boolean => {
  if (request.status_detail?.is_terminal) return true;
  const statusName = request.status_detail?.name?.toLowerCase() ?? "";
  return HELPDESK_ARCHIVABLE_STATUS_NAMES.some((name) => statusName.includes(name));
};

function HelpdeskRequestContextMenu({
  request,
  workspaceSlug,
  helpdeskStore,
  navigate,
  parentRef,
}: THelpdeskRequestContextMenuProps) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const requestPath = `/${workspaceSlug}/helpdesk/${request.id}`;
  const isArchivable = isHelpdeskRequestArchivable(request);

  const handleCopyLink = () =>
    copyUrlToClipboard(requestPath).then(() =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Link copied",
        message: "Helpdesk ticket link copied to clipboard",
      })
    );

  const handleDuplicate = async () => {
    try {
      await helpdeskStore.createRequest(workspaceSlug, {
        portal: request.portal,
        form: request.form,
        title: `${request.title} (copy)`,
        description: request.description,
        status: request.status,
        form_responses: request.form_responses,
        assignees: request.assignees,
        contact_email: request.contact_email,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Ticket copied" });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to copy ticket." });
    }
  };

  const handleDelete = async () => {
    try {
      await helpdeskStore.deleteRequest(workspaceSlug, request.id);
      setDeleteModalOpen(false);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Ticket deleted" });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to delete ticket." });
    }
  };

  const handleArchive = async () => {
    try {
      await helpdeskStore.archiveRequest(workspaceSlug, request.id);
      setArchiveModalOpen(false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Ticket archived",
        message: "Your archived tickets can be restored later.",
      });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to archive ticket." });
    }
  };

  const menuItems: TContextMenuItem[] = [
    {
      key: "edit",
      title: "Edit",
      icon: EditIcon,
      action: () => navigate(requestPath),
    },
    {
      key: "make-a-copy",
      title: "Make a copy",
      icon: CopyIcon,
      action: handleDuplicate,
    },
    {
      key: "open-in-new-tab",
      title: "Open in new tab",
      icon: NewTabIcon,
      action: () => window.open(requestPath, "_blank"),
    },
    {
      key: "copy-link",
      title: "Copy link",
      icon: LinkIcon,
      action: handleCopyLink,
    },
    {
      key: "archive",
      title: "Archive",
      description: isArchivable ? undefined : "Only completed or canceled\nwork items can be archived",
      icon: ArchiveIcon,
      className: "items-start",
      iconClassName: isArchivable ? undefined : "mt-1",
      action: () => setArchiveModalOpen(true),
      disabled: !isArchivable,
    },
    {
      key: "delete",
      title: "Delete",
      icon: TrashIcon,
      action: () => setDeleteModalOpen(true),
    },
  ];

  return (
    <>
      <ContextMenu parentRef={parentRef} items={menuItems} />
      {archiveModalOpen && (
        <ConfirmModal
          title="Archive ticket"
          body={`Are you sure you want to archive "${request.title}"? You can restore archived tickets later.`}
          confirmLabel="Archive"
          onConfirm={handleArchive}
          onCancel={() => setArchiveModalOpen(false)}
        />
      )}
      {deleteModalOpen && (
        <ConfirmModal
          title="Delete ticket"
          body={`Are you sure you want to permanently delete "${request.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteModalOpen(false)}
        />
      )}
    </>
  );
}

function KanbanColumnSentinel({ isLoadingMore, onVisible }: { isLoadingMore: boolean; onVisible: () => void }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const columnObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onVisibleRef.current();
      },
      { rootMargin: "100px" }
    );
    columnObserver.observe(el);
    return () => columnObserver.disconnect();
  }, []); // stable — observer created once per mount

  return (
    <div ref={sentinelRef} className="flex h-6 items-center justify-center">
      {isLoadingMore && <div className="size-3.5 animate-spin rounded-full border-b-2 border-accent-strong" />}
    </div>
  );
}

function HelpdeskKanbanRequestCard({
  request,
  workspaceSlug,
  helpdeskStore,
  navigate,
}: {
  request: IHelpdeskRequest;
  workspaceSlug: string;
  helpdeskStore: IHelpdeskStore;
  navigate: NavigateFunction;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={cardRef} className="group/kanban-block relative mb-2 w-full">
      <HelpdeskRequestContextMenu
        request={request}
        workspaceSlug={workspaceSlug}
        helpdeskStore={helpdeskStore}
        navigate={navigate}
        parentRef={cardRef}
      />
      <button
        type="button"
        className="w-full cursor-pointer text-left"
        onClick={() => navigate(`/${workspaceSlug}/helpdesk/${request.id}`)}
      >
        <div className="block w-full rounded-lg border border-subtle bg-layer-2 p-3 text-13 shadow-raised-100 outline-[0.5px] outline-transparent transition-all hover:border-strong hover:shadow-raised-200">
          {request.display_id && <p className="font-mono mb-1 text-11 text-tertiary">{request.display_id}</p>}
          <div className="line-clamp-1 w-full text-body-sm-medium text-primary">{request.title}</div>
          {request.description && <p className="mt-1 line-clamp-2 text-12 text-tertiary">{request.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 pt-1 text-tertiary">
            <div className="flex items-center gap-1.5 text-13">
              <UserRound className="size-3 shrink-0" />
              <span className="max-w-[120px] truncate text-12">{request.contact_email || "Authenticated"}</span>
            </div>
            <div className="flex items-center gap-1 text-13">
              <CalendarDays className="size-3 shrink-0" />
              <span className="text-12">
                {new Date(request.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

function HelpdeskListRequestRow({
  request,
  workspaceSlug,
  helpdeskStore,
  navigate,
  children,
}: {
  request: IHelpdeskRequest;
  workspaceSlug: string;
  helpdeskStore: IHelpdeskStore;
  navigate: NavigateFunction;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rowRef}
      className="group relative flex items-center gap-3 border-b border-subtle px-4 py-2.5 transition-colors hover:bg-layer-1"
    >
      <HelpdeskRequestContextMenu
        request={request}
        workspaceSlug={workspaceSlug}
        helpdeskStore={helpdeskStore}
        navigate={navigate}
        parentRef={rowRef}
      />
      {children}
    </div>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="shadow-xl w-full max-w-sm rounded-xl border border-subtle bg-layer-1 p-6">
        <h3 className="text-base font-semibold text-primary">{title}</h3>
        <p className="mt-2 text-13 text-tertiary">{body}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" size="base" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="error-fill" size="base" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceHelpdeskPage;
