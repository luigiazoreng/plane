/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { useLocalStorage } from "@plane/hooks";
import { Badge } from "@plane/propel/badge";
import { Button } from "@plane/propel/button";
import { Switch } from "@plane/propel/switch";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IBaseLayoutsBaseGroup, IHelpdeskRequest } from "@plane/types";
import { Header } from "@plane/ui";
import { cn } from "@plane/utils";
import { ExternalLink, Globe, Headset, KanbanSquare, LayoutList, MessageSquareText, Plus } from "lucide-react";
import { BaseKanbanLayout } from "@/components/base-layouts/kanban/layout";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";

type THelpdeskAgentLayout = "list" | "kanban";
type THelpdeskKanbanItem = IHelpdeskRequest & Record<string, unknown>;

const STATUS_META: Record<
  IHelpdeskRequest["status"],
  {
    label: string;
    badgeVariant: "warning" | "brand" | "success" | "neutral";
    chipClassName: string;
  }
> = {
  open: {
    label: "Open",
    badgeVariant: "warning",
    chipClassName: "bg-orange-500/10 text-orange-500",
  },
  in_progress: {
    label: "In progress",
    badgeVariant: "brand",
    chipClassName: "bg-blue-500/10 text-blue-500",
  },
  waiting: {
    label: "Waiting",
    badgeVariant: "brand",
    chipClassName: "bg-violet-500/10 text-violet-500",
  },
  resolved: {
    label: "Resolved",
    badgeVariant: "success",
    chipClassName: "bg-emerald-500/10 text-emerald-500",
  },
  closed: {
    label: "Closed",
    badgeVariant: "neutral",
    chipClassName: "bg-slate-500/10 text-slate-500",
  },
};

const KANBAN_GROUPS: IBaseLayoutsBaseGroup[] = [
  { id: "open", name: "Open" },
  { id: "in_progress", name: "In progress" },
  { id: "waiting", name: "Waiting" },
  { id: "resolved", name: "Resolved" },
  { id: "closed", name: "Closed" },
];

const HelpdeskPage = observer(() => {
  const { workspaceSlug, projectId } = useParams();
  const navigate = useNavigate();
  const helpdeskStore = useHelpdesk();
  const [newPortalSlug, setNewPortalSlug] = useState("");
  const projectStorageKey = workspaceSlug && projectId ? `helpdesk-layout:${workspaceSlug}:${projectId}` : "helpdesk-layout";
  const { storedValue: storedLayout, setValue: setStoredLayout } = useLocalStorage<THelpdeskAgentLayout>(
    projectStorageKey,
    "list"
  );

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;

    helpdeskStore.fetchPortals(workspaceSlug.toString(), projectId.toString());
    helpdeskStore.fetchRequests(workspaceSlug.toString(), projectId.toString());
  }, [workspaceSlug, projectId, helpdeskStore]);

  const wSlug = workspaceSlug?.toString() || "";
  const pId = projectId?.toString() || "";
  const layout = storedLayout || "list";
  const requests = helpdeskStore.getProjectRequests(wSlug, pId);
  const portals = helpdeskStore.getProjectPortals(wSlug, pId);
  const groupedRequests = helpdeskStore.getRequestsGroupedByStatus(wSlug, pId);
  const requestItems = useMemo(
    () =>
      requests.reduce(
        (acc, request) => {
          acc[request.id] = request as THelpdeskKanbanItem;
          return acc;
        },
        {} as Record<string, THelpdeskKanbanItem>
      ),
    [requests]
  );
  const requestGroups = useMemo(
    () =>
      KANBAN_GROUPS.reduce(
        (acc, group) => {
          acc[group.id] = groupedRequests[group.id as IHelpdeskRequest["status"]].map((request) => request.id);
          return acc;
        },
        {} as Record<string, string[]>
      ),
    [groupedRequests]
  );

  const portalState = helpdeskStore.getCollectionState(`portals:${wSlug}_${pId}`);
  const requestsState = helpdeskStore.getCollectionState(`requests:${wSlug}_${pId}`);
  const isLoading = portalState.isLoading || requestsState.isLoading;
  const totalRequests = requests.length;
  const activeRequests = groupedRequests.open.length + groupedRequests.in_progress.length + groupedRequests.waiting.length;
  const resolvedRequests = groupedRequests.resolved.length + groupedRequests.closed.length;

  const handleCreatePortal = async () => {
    if (!newPortalSlug.trim() || !wSlug || !pId) return;

    try {
      await helpdeskStore.createPortal(wSlug, pId, {
        public_slug: newPortalSlug.trim(),
        require_login: false,
        is_public: true,
        enable_chat: true,
      });
      setNewPortalSlug("");
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success", message: "Portal created successfully" });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to create portal" });
    }
  };

  const handleStatusDrop = async (
    sourceId: string,
    _destinationId: string | null,
    sourceGroupId: string,
    destinationGroupId: string
  ) => {
    if (sourceGroupId === destinationGroupId) return;

    try {
      await helpdeskStore.updateRequest(wSlug, pId, sourceId, {
        status: destinationGroupId as IHelpdeskRequest["status"],
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Status updated", message: "Request moved successfully" });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to move request" });
      await helpdeskStore.fetchRequests(wSlug, pId);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <Header>
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-md bg-custom-sidebar-accent/15 text-custom-sidebar-accent">
              <Headset className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-text-100">Helpdesk</h3>
              <p className="truncate text-xs text-text-400">Customer requests, replies, and linked product work</p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-subtle bg-surface-2 p-1">
            <Button variant={layout === "list" ? "primary" : "ghost"} size="sm" onClick={() => setStoredLayout("list")}>
              <span className="flex items-center gap-2">
                <LayoutList className="size-4" />
                List
              </span>
            </Button>
            <Button
              variant={layout === "kanban" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setStoredLayout("kanban")}
            >
              <span className="flex items-center gap-2">
                <KanbanSquare className="size-4" />
                Kanban
              </span>
            </Button>
          </div>
        </div>
      </Header>

      <div className="flex-1 overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-4 p-4 md:p-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-xl border border-subtle bg-surface-2">
              <div className="border-b border-subtle px-4 py-4">
                <h2 className="text-sm font-semibold text-text-100">Portal quick settings</h2>
                <p className="mt-1 text-xs text-text-400">Lightweight intake config without leaving triage.</p>
              </div>

              <div className="space-y-4 p-4">
                <div className="rounded-lg border border-subtle bg-surface-1 p-3">
                  <label htmlFor="new-portal-slug" className="mb-2 block text-[11px] font-medium uppercase text-text-400">
                    New portal slug
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="new-portal-slug"
                      value={newPortalSlug}
                      onChange={(e) => setNewPortalSlug(e.target.value)}
                      placeholder="support-acme"
                      className="min-w-0 flex-1 rounded-md border border-subtle bg-surface-2 px-3 py-2 text-sm text-text-100 outline-none transition-colors focus:border-primary"
                    />
                    <Button variant="primary" size="base" onClick={handleCreatePortal} disabled={!newPortalSlug.trim()}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>

                {portals.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-subtle px-4 py-8 text-center">
                    <Globe className="mx-auto mb-3 size-6 text-text-300" />
                    <p className="text-sm font-medium text-text-100">No portal configured</p>
                    <p className="mt-1 text-xs text-text-400">Create one to start receiving external requests.</p>
                  </div>
                ) : (
                  portals.map((portal) => (
                    <div key={portal.id} className="rounded-lg border border-subtle bg-surface-1 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-text-100">{portal.public_slug}</span>
                            <a
                              href={`/helpdesk/p/${portal.public_slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-text-300 transition-colors hover:text-primary"
                            >
                              <ExternalLink className="size-4" />
                            </a>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant={portal.is_public ? "success" : "neutral"} size="sm">
                              {portal.is_public ? "Public" : "Private"}
                            </Badge>
                            <Badge variant={portal.require_login ? "brand" : "neutral"} size="sm">
                              {portal.require_login ? "Login required" : "Open access"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-md border border-subtle bg-surface-2 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-text-100">Customer chat</p>
                          <p className="text-xs text-text-400">Allow replies from the public portal.</p>
                        </div>
                        <Switch
                          value={portal.enable_chat}
                          onChange={() => {
                            helpdeskStore.updatePortal(wSlug, pId, portal.id, { enable_chat: !portal.enable_chat });
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </aside>

            <section className="flex min-h-0 flex-col rounded-xl border border-subtle bg-surface-2">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-subtle px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-text-100">Agent queue</h2>
                  <p className="mt-1 text-xs text-text-400">
                    Triage incoming requests, move status, and jump into the conversation.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="rounded-md border border-subtle bg-surface-1 px-3 py-2">
                    <p className="text-[11px] uppercase text-text-400">Total</p>
                    <p className="mt-1 text-sm font-medium text-text-100">{totalRequests}</p>
                  </div>
                  <div className="rounded-md border border-subtle bg-surface-1 px-3 py-2">
                    <p className="text-[11px] uppercase text-text-400">Active</p>
                    <p className="mt-1 text-sm font-medium text-text-100">{activeRequests}</p>
                  </div>
                  <div className="rounded-md border border-subtle bg-surface-1 px-3 py-2">
                    <p className="text-[11px] uppercase text-text-400">Resolved</p>
                    <p className="mt-1 text-sm font-medium text-text-100">{resolvedRequests}</p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {isLoading ? (
                  <div className="flex h-full min-h-[420px] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                  </div>
                ) : requestsState.error ? (
                  <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 text-center">
                    <p className="text-sm font-medium text-text-100">We couldn&apos;t load the Helpdesk queue.</p>
                    <p className="mt-1 text-xs text-text-400">{requestsState.error}</p>
                  </div>
                ) : requests.length === 0 ? (
                  <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 text-center">
                    <MessageSquareText className="mb-4 size-8 text-text-300" />
                    <p className="text-sm font-medium text-text-100">No requests yet</p>
                    <p className="mt-1 max-w-sm text-xs text-text-400">
                      Requests submitted through your portal will appear here for triage.
                    </p>
                  </div>
                ) : layout === "kanban" ? (
                  <BaseKanbanLayout<THelpdeskKanbanItem>
                    items={requestItems}
                    groups={KANBAN_GROUPS}
                    groupedItemIds={requestGroups}
                    enableDragDrop
                    onDrop={handleStatusDrop}
                    groupClassName="w-[320px] border-r border-subtle last:border-r-0 rounded-none bg-surface-2"
                    className="h-full gap-0 overflow-x-auto overflow-y-hidden p-0"
                    renderGroupHeader={({ group, itemCount }) => (
                      <div className="flex items-center justify-between border-b border-subtle bg-surface-2 px-3 py-3">
                        <span className="text-sm font-medium text-text-100">{group.name}</span>
                        <Badge variant={STATUS_META[group.id as IHelpdeskRequest["status"]].badgeVariant} size="sm">
                          {itemCount}
                        </Badge>
                      </div>
                    )}
                    renderItem={(request) => {
                      const statusMeta = STATUS_META[request.status];

                      return (
                        <button
                          type="button"
                          onClick={() => navigate(`/${wSlug}/projects/${pId}/helpdesk/${request.id}`)}
                          className="w-full rounded-lg border border-subtle bg-surface-1 p-3 text-left transition-colors hover:border-primary/40 hover:bg-surface-2"
                        >
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-text-100">{request.title}</p>
                              <p className="mt-1 line-clamp-2 text-xs text-text-400">{request.description}</p>
                            </div>
                            <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", statusMeta.chipClassName)}>
                              {statusMeta.label}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-text-400">
                            <span>{request.contact_email || "Authenticated customer"}</span>
                            <span>•</span>
                            <span>{request.source === "public_form" ? "Public form" : "Internal form"}</span>
                            <span>•</span>
                            <span>{request.assignees.length} assignees</span>
                          </div>
                        </button>
                      );
                    }}
                  />
                ) : (
                  <div className="h-full overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 z-[1] border-b border-subtle bg-surface-2 text-xs uppercase tracking-wider text-text-400">
                        <tr>
                          <th className="px-5 py-3 font-medium">Request</th>
                          <th className="px-5 py-3 font-medium">Status</th>
                          <th className="px-5 py-3 font-medium">Source</th>
                          <th className="px-5 py-3 font-medium">Contact</th>
                          <th className="px-5 py-3 font-medium">Assignees</th>
                          <th className="px-5 py-3 font-medium">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-subtle">
                        {requests.map((request) => {
                          const statusMeta = STATUS_META[request.status];

                          return (
                            <tr
                              key={request.id}
                              className="cursor-pointer transition-colors hover:bg-surface-1"
                              onClick={() => navigate(`/${wSlug}/projects/${pId}/helpdesk/${request.id}`)}
                            >
                              <td className="px-5 py-4">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-text-100">{request.title}</p>
                                  <p className="mt-1 line-clamp-1 text-xs text-text-400">{request.description}</p>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <Badge variant={statusMeta.badgeVariant} size="sm">
                                  {statusMeta.label}
                                </Badge>
                              </td>
                              <td className="px-5 py-4 text-text-400">
                                {request.source === "public_form" ? "Public form" : "Internal form"}
                              </td>
                              <td className="px-5 py-4 text-text-400">{request.contact_email || "Authenticated customer"}</td>
                              <td className="px-5 py-4 text-text-400">{request.assignees.length}</td>
                              <td className="px-5 py-4 text-text-400">
                                {new Date(request.created_at).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
});

export default HelpdeskPage;
