/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { useLocalStorage } from "@plane/hooks";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IBaseLayoutsBaseGroup, IHelpdeskRequest, IHelpdeskStatus } from "@plane/types";
import { cn } from "@plane/utils";
import {
  BarChart2,
  CalendarDays,
  Headset,
  KanbanSquare,
  LayoutList,
  MessageSquareText,
  Settings,
  UserRound,
} from "lucide-react";
import { BaseKanbanLayout } from "@/components/base-layouts/kanban/layout";
import { AppHeader } from "@/components/core/app-header";
import { isHelpdeskRequestActive } from "@/helpers/helpdesk/statuses";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";

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
  const storageKey = workspaceSlug ? `helpdesk-layout:${workspaceSlug}` : "helpdesk-layout";
  const { storedValue: storedLayout, setValue: setStoredLayout } = useLocalStorage<THelpdeskAgentLayout>(
    storageKey,
    "list"
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [inlineStatusRequest, setInlineStatusRequest] = useState<string | null>(null);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newRequestTitle, setNewRequestTitle] = useState("");
  const kanbanAddInputRef = useRef<HTMLInputElement>(null);
  const listAddInputRef = useRef<HTMLInputElement>(null);

  const wSlug = workspaceSlug?.toString() || "";
  const layout = storedLayout || "list";

  useEffect(() => {
    if (!wSlug) return;
    helpdeskStore.fetchStatuses(wSlug);
    helpdeskStore.fetchPortals(wSlug);
    helpdeskStore.fetchRequests(wSlug);
  }, [wSlug, helpdeskStore]);

  const statuses = helpdeskStore.getWorkspaceStatuses(wSlug);
  const requests = helpdeskStore.getWorkspaceRequests(wSlug);
  const groupedRequests = helpdeskStore.getRequestsGroupedByStatus(wSlug);
  const portals = helpdeskStore.getWorkspacePortals(wSlug);
  const defaultPortalId = portals[0]?.id;
  const portalMap = useMemo(() => Object.fromEntries(portals.map((portal) => [portal.id, portal])), [portals]);

  const statusMap = useMemo(() => Object.fromEntries(statuses.map((s) => [s.id, s])), [statuses]);

  const filteredRequests = useMemo(
    () => (statusFilter === "all" ? requests : requests.filter((r) => r.status === statusFilter)),
    [requests, statusFilter]
  );

  const kanbanGroups = useMemo<IBaseLayoutsBaseGroup[]>(
    () => statuses.map((s) => ({ id: s.id, name: s.name })),
    [statuses]
  );

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
    return map;
  }, [requests, addingToGroup]);

  const requestGroups = useMemo(() => {
    return statuses.reduce(
      (acc, s) => {
        const ids = (groupedRequests[s.id] || []).map((r) => r.id);
        if (addingToGroup === s.id) ids.push(`__add__:${s.id}`);
        acc[s.id] = ids;
        return acc;
      },
      {} as Record<string, string[]>
    );
  }, [statuses, groupedRequests, addingToGroup]);

  const statusesState = helpdeskStore.getCollectionState(`statuses:${wSlug}`);
  const requestsState = helpdeskStore.getCollectionState(`requests:${wSlug}`);
  const isLoading = statusesState.isLoading || requestsState.isLoading;
  const totalRequests = requests.length;
  const activeRequests = requests.filter((request) =>
    isHelpdeskRequestActive(request, statuses, portalMap[request.portal]?.auto_assignment_config)
  ).length;
  const resolvedRequests = totalRequests - activeRequests;

  useEffect(() => {
    if (addingToGroup) {
      kanbanAddInputRef.current?.focus();
      listAddInputRef.current?.focus();
    }
  }, [addingToGroup]);

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
      await helpdeskStore.fetchRequests(wSlug);
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
      await helpdeskStore.createRequest(wSlug, { title, status: statusId, portal: defaultPortalId, description: "" });
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
                <span className="rounded-md bg-layer-1 px-2 py-0.5 text-12 text-secondary">{totalRequests} total</span>
                <span className="bg-orange-500/10 text-orange-500 rounded-md px-2 py-0.5 text-12">
                  {activeRequests} active
                </span>
                <span className="bg-emerald-500/10 text-emerald-500 rounded-md px-2 py-0.5 text-12">
                  {resolvedRequests} resolved
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(`/${wSlug}/helpdesk/analytics`)}
                className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-13 text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
              >
                <BarChart2 className="size-3.5" />
                <span className="hidden sm:inline">Analytics</span>
              </button>
              <button
                type="button"
                onClick={() => navigate(`/${wSlug}/helpdesk/settings`)}
                className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-13 text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
              >
                <Settings className="size-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </button>
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
            <p className="text-13 font-medium text-primary">No requests yet</p>
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
          <BaseKanbanLayout<THelpdeskKanbanItem>
            items={requestItems}
            groups={kanbanGroups}
            groupedItemIds={requestGroups}
            enableDragDrop
            onDrop={handleStatusDrop}
            renderGroupHeader={({ group, itemCount }) => {
              const statusObj = statusMap[group.id];
              if (!statusObj) return null;
              const realCount = itemCount - (addingToGroup === group.id ? 1 : 0);
              return (
                <div className="relative flex w-full flex-row items-center gap-1 py-1.5">
                  <div
                    className="flex size-5 shrink-0 items-center justify-center rounded-xs"
                    style={{ backgroundColor: `${statusObj.color}1a` }}
                  >
                    <StatusDot color={statusObj.color} className="h-2 w-2" />
                  </div>
                  <div className="flex w-full flex-row items-baseline gap-1 overflow-hidden">
                    <span className="line-clamp-1 inline-block truncate font-medium text-primary">{group.name}</span>
                    <span className="shrink-0 pl-2 text-13 font-medium text-tertiary">{realCount}</span>
                  </div>
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
                </div>
              );
            }}
            renderItem={(request) => {
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
                <button
                  type="button"
                  className="group/kanban-block relative mb-2 w-full cursor-pointer text-left"
                  onClick={() => navigate(`/${wSlug}/helpdesk/${request.id}`)}
                >
                  <div className="block w-full rounded-lg border border-subtle bg-layer-2 p-3 text-13 shadow-raised-100 outline-[0.5px] outline-transparent transition-all hover:border-strong hover:shadow-raised-200">
                    <div className="line-clamp-1 w-full text-body-sm-medium text-primary">{request.title}</div>
                    {request.description && (
                      <p className="mt-1 line-clamp-2 text-12 text-tertiary">{request.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 pt-1 text-tertiary">
                      <div className="flex items-center gap-1.5 text-13">
                        <UserRound className="size-3 shrink-0" />
                        <span className="max-w-[120px] truncate text-12">
                          {request.contact_email || "Authenticated"}
                        </span>
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
              );
            }}
          />
        ) : (
          /* List view */
          <div className="flex h-full flex-col overflow-hidden">
            {/* Status filter chips */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-subtle bg-layer-1 px-4 py-2">
              <button
                key="all"
                type="button"
                onClick={() => setStatusFilter("all")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-12 font-medium transition-colors",
                  statusFilter === "all"
                    ? "bg-accent-strong/10 text-accent-strong"
                    : "bg-layer-2 text-secondary hover:bg-layer-1 hover:text-primary"
                )}
              >
                All
                <span
                  className={cn(
                    "rounded-full px-1 text-11 font-semibold",
                    statusFilter === "all" ? "opacity-70" : "bg-layer-1 text-tertiary"
                  )}
                >
                  {totalRequests}
                </span>
              </button>
              {statuses.map((s) => {
                const isActive = statusFilter === s.id;
                const count = (groupedRequests[s.id] || []).length;
                const { r, g, b } = hexToRgb(s.color);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStatusFilter(s.id)}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-12 font-medium transition-colors"
                    style={isActive ? { backgroundColor: `rgba(${r}, ${g}, ${b}, 0.15)`, color: s.color } : undefined}
                  >
                    {!isActive && (
                      <span className="flex items-center gap-1.5 rounded-full bg-layer-2 px-2.5 py-1 text-12 font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary">
                        {s.name}
                        <span className="rounded-full bg-layer-1 px-1 text-11 font-semibold text-tertiary">
                          {count}
                        </span>
                      </span>
                    )}
                    {isActive && (
                      <>
                        <StatusDot color={s.color} className="h-1.5 w-1.5 shrink-0" />
                        {s.name}
                        <span className="rounded-full px-1 text-11 font-semibold opacity-70">{count}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredRequests.length === 0 && !addingToGroup ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <MessageSquareText className="mb-3 size-7 text-tertiary" />
                  <p className="text-13 font-medium text-primary">No requests with this status</p>
                </div>
              ) : (
                <div>
                  {filteredRequests.map((request) => {
                    const statusObj = request.status ? statusMap[request.status] : null;
                    const isStatusOpen = inlineStatusRequest === request.id;
                    return (
                      <div
                        key={request.id}
                        className="group relative flex items-center gap-3 border-b border-subtle px-4 py-2.5 transition-colors hover:bg-layer-1"
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
                          <p className="truncate text-body-sm-medium text-primary">{request.title}</p>
                          {request.description && (
                            <p className="mt-0.5 truncate text-12 text-tertiary">{request.description}</p>
                          )}
                        </button>

                        {/* Meta */}
                        <div className="hidden shrink-0 items-center gap-4 text-tertiary md:flex">
                          <div className="flex items-center gap-1.5 text-13">
                            <UserRound className="size-3.5 shrink-0" />
                            <span className="max-w-[120px] truncate">{request.contact_email || "Authenticated"}</span>
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
                      </div>
                    );
                  })}

                  {/* Inline add row */}
                  {addingToGroup && (
                    <div className="flex items-center gap-3 border-b border-subtle px-4 py-2.5">
                      {statusMap[addingToGroup] && (
                        <StatusChip status={statusMap[addingToGroup]} showDot className="shrink-0" />
                      )}
                      <input
                        ref={listAddInputRef}
                        value={newRequestTitle}
                        onChange={(e) => setNewRequestTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddRequest(addingToGroup);
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
                          onClick={() => handleAddRequest(addingToGroup)}
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
              )}

              {/* + New request */}
              <button
                type="button"
                onClick={() => {
                  const target = statusFilter !== "all" ? statusFilter : (statuses[0]?.id ?? null);
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default WorkspaceHelpdeskPage;
