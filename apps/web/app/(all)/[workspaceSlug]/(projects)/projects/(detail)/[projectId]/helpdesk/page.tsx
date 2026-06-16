/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Headset, Globe, MessageSquare, Clock, Plus, ExternalLink } from "lucide-react";
import { Header } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { Switch } from "@plane/propel/switch";
import { Badge } from "@plane/propel/badge";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";

const HelpdeskPage = observer(() => {
  const { workspaceSlug, projectId } = useParams();
  const helpdeskStore = useHelpdesk();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (workspaceSlug && projectId) {
      Promise.all([
        helpdeskStore.fetchPortals(workspaceSlug.toString(), projectId.toString()),
        helpdeskStore.fetchRequests(workspaceSlug.toString(), projectId.toString()),
      ]).finally(() => setLoading(false));
    }
  }, [workspaceSlug, projectId, helpdeskStore]);

  const rawRequests = workspaceSlug && projectId ? helpdeskStore.requests[`${workspaceSlug}_${projectId}`] : [];
  const requests = Array.isArray(rawRequests) ? rawRequests : [];

  const rawPortals = workspaceSlug && projectId ? helpdeskStore.portals[`${workspaceSlug}_${projectId}`] : [];
  const portals = Array.isArray(rawPortals) ? rawPortals : [];

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <Header>
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 flex h-6 w-6 items-center justify-center rounded text-primary">
            <Headset className="size-4" />
          </div>
          <h3 className="text-sm text-text-100 font-semibold">Helpdesk</h3>
        </div>
      </Header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl text-text-100 font-bold">Helpdesk Dashboard</h1>
              <p className="text-sm text-text-400 mt-1">Manage incoming customer requests and support tickets.</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  const wSlug = workspaceSlug?.toString();
                  const pId = projectId?.toString();
                  if (wSlug && pId) {
                    helpdeskStore.portals[`${wSlug}_${pId}`] = [
                      {
                        id: "p1",
                        public_slug: "suporte-growatt",
                        require_login: false,
                        enable_chat: true,
                        project_id: pId,
                      } as any,
                    ];
                    helpdeskStore.requests[`${wSlug}_${pId}`] = [
                      {
                        id: "req1",
                        title: "Inversor não liga",
                        status: "open",
                        source: "public_form",
                        created_at: new Date().toISOString(),
                        project_id: pId,
                      } as any,
                      {
                        id: "req2",
                        title: "Dúvida sobre configuração WiFi",
                        status: "waiting",
                        source: "internal_form",
                        created_at: new Date(Date.now() - 86400000).toISOString(),
                        project_id: pId,
                      } as any,
                    ];
                  }
                }}
              >
                Mock Test Data
              </Button>
              <Button
                variant="primary"
                prependIcon={<Plus className="size-4" />}
                onClick={async () => {
                  const slug = window.prompt("Enter the public slug for the new portal:");
                  if (!slug) return;
                  const wSlug = workspaceSlug?.toString();
                  const pId = projectId?.toString();
                  if (!wSlug || !pId) return;

                  try {
                    await helpdeskStore.createPortal(wSlug, pId, {
                      public_slug: slug,
                      require_login: false,
                      is_public: true,
                      enable_chat: true,
                    });
                    setToast({ type: TOAST_TYPE.SUCCESS, title: "Success", message: "Portal created successfully" });
                  } catch (_e) {
                    setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to create portal" });
                  }
                }}
              >
                New Portal
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Active Portals Section */}
              <section>
                <h2 className="text-lg text-text-100 mb-4 flex items-center gap-2 font-semibold">
                  <Globe className="text-text-400 size-5" /> Active Portals
                </h2>
                {portals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-subtle py-12 text-center">
                    <Globe className="text-text-400 mb-4 size-8" />
                    <p className="text-sm text-text-100 font-medium">No public portals active</p>
                    <p className="text-xs text-text-400 mt-1">Create a portal to start receiving customer tickets.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {portals.map((portal) => (
                      <div
                        key={portal.id}
                        className="group shadow-sm hover:border-primary/50 hover:shadow-md flex flex-col justify-between rounded-lg border border-subtle bg-surface-2 p-5 transition-all"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <h3 className="text-text-100 truncate font-semibold">{portal.public_slug}</h3>
                            <a
                              href={`/helpdesk/p/${portal.public_slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-text-400 transition-colors hover:text-primary"
                            >
                              <ExternalLink className="size-4" />
                            </a>
                          </div>
                          <div className="text-xs text-text-400 mt-4 flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" /> Login Required:
                            </span>
                            <Badge variant={portal.require_login ? "brand" : "neutral"} size="sm">
                              {portal.require_login ? "Yes" : "No"}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-5 flex items-center justify-between border-t border-subtle pt-4">
                          <span className="text-sm text-text-300 flex items-center gap-2 font-medium">
                            <MessageSquare className="size-4" /> Customer Chat
                          </span>
                          <Switch
                            value={portal.enable_chat}
                            onChange={() => {
                              if (workspaceSlug && projectId) {
                                helpdeskStore.updatePortal(workspaceSlug.toString(), projectId.toString(), portal.id, {
                                  enable_chat: !portal.enable_chat,
                                });
                              }
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Tickets Section */}
              <section>
                <h2 className="text-lg text-text-100 mb-4 flex items-center gap-2 font-semibold">
                  <Headset className="text-text-400 size-5" /> Recent Requests
                </h2>
                {requests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-subtle py-12 text-center">
                    <MessageSquare className="text-text-400 mb-4 size-8" />
                    <p className="text-sm text-text-100 font-medium">No tickets found</p>
                    <p className="text-xs text-text-400 mt-1">
                      Tickets submitted through your portals will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="shadow-sm overflow-hidden rounded-lg border border-subtle bg-surface-2">
                    <table className="text-sm w-full text-left">
                      <thead className="text-xs text-text-400 border-b border-subtle bg-surface-1 uppercase">
                        <tr>
                          <th className="tracking-wider px-6 py-4 font-medium">Title</th>
                          <th className="tracking-wider px-6 py-4 font-medium">Status</th>
                          <th className="tracking-wider px-6 py-4 font-medium">Source</th>
                          <th className="tracking-wider px-6 py-4 font-medium">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-subtle">
                        {requests.map((req) => (
                          <tr
                            key={req.id}
                            className="group cursor-pointer transition-colors hover:bg-surface-1"
                            onClick={() =>
                              (window.location.href = `/${workspaceSlug}/projects/${projectId}/helpdesk/${req.id}`)
                            }
                          >
                            <td className="text-text-100 px-6 py-4 font-medium transition-colors group-hover:text-primary">
                              {req.title}
                            </td>
                            <td className="px-6 py-4">
                              <Badge
                                variant={
                                  req.status === "open" ? "warning" : req.status === "waiting" ? "brand" : "success"
                                }
                                size="sm"
                              >
                                {req.status.replace("_", " ")}
                              </Badge>
                            </td>
                            <td className="text-text-400 px-6 py-4 capitalize">{req.source}</td>
                            <td className="text-text-400 px-6 py-4">
                              {new Date(req.created_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default HelpdeskPage;
