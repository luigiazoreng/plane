/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Headset } from "lucide-react";
import { Header } from "@plane/ui";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";

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
    <div className="flex h-full w-full flex-col">
      <Header>
        <div className="flex items-center gap-2">
          <Headset className="size-5" />
          <h3 className="text-lg font-semibold">Helpdesk</h3>
        </div>
      </Header>

      <div className="flex-1 overflow-y-auto bg-surface-1 p-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Helpdesk Dashboard</h1>
            <p className="text-sm text-tertiary">Manage incoming customer requests and support tickets.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active Portals Section */}
            <section className="rounded-lg border border-subtle bg-surface-2 p-6">
              <h2 className="text-lg mb-4 font-semibold">Active Portals</h2>
              {portals.length === 0 ? (
                <p className="text-sm text-tertiary">No public portals active.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {portals.map((portal) => (
                    <div
                      key={portal.id}
                      className="flex flex-col justify-between rounded border border-subtle bg-surface-1 p-4"
                    >
                      <div>
                        <p className="text-sm font-medium">Public Slug: {portal.public_slug}</p>
                        <p className="text-xs mt-1 text-tertiary">
                          Requires Login: {portal.require_login ? "Yes" : "No"}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-subtle pt-3">
                        <span className="text-xs font-medium text-secondary">Customer Chat</span>
                        <button
                          onClick={() => {
                            if (workspaceSlug && projectId) {
                              helpdeskStore.updatePortal(workspaceSlug.toString(), projectId.toString(), portal.id, {
                                enable_chat: !portal.enable_chat,
                              });
                            }
                          }}
                          className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${portal.enable_chat ? "bg-primary" : "bg-surface-3"}`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${portal.enable_chat ? "translate-x-4" : "translate-x-1"}`}
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Tickets Section */}
            <section className="rounded-lg border border-subtle bg-surface-2 p-6">
              <h2 className="text-lg mb-4 font-semibold">Recent Requests</h2>
              {requests.length === 0 ? (
                <p className="text-sm text-tertiary">No tickets found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-sm w-full text-left">
                    <thead className="bg-surface-1 text-tertiary">
                      <tr>
                        <th className="px-4 py-2 font-medium">Title</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Source</th>
                        <th className="px-4 py-2 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle">
                      {requests.map((req) => (
                        <tr
                          key={req.id}
                          className="cursor-pointer transition-colors hover:bg-surface-2"
                          onClick={() =>
                            (window.location.href = `/${workspaceSlug}/projects/${projectId}/helpdesk/${req.id}`)
                          }
                        >
                          <td className="px-4 py-3 font-medium text-primary">{req.title}</td>
                          <td className="px-4 py-3">
                            <span className="bg-primary/10 text-xs rounded-full px-2 py-1 text-primary">
                              {req.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-tertiary">{req.source}</td>
                          <td className="px-4 py-3 text-tertiary">{new Date(req.created_at).toLocaleDateString()}</td>
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
  );
});

export default HelpdeskPage;
