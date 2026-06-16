/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { Badge } from "@plane/propel/badge";
import { Plus, LifeBuoy, Inbox } from "lucide-react";
import { publicHelpdeskStore as publicStore } from "@/store/public-helpdesk.store";

const HelpdeskPublicDashboard = observer(() => {
  const { publicSlug } = useParams();
  const navigate = useNavigate();
  const pSlug = publicSlug?.toString() || "";

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPortalData = async () => {
      if (!pSlug) return;
      try {
        const portal = await publicStore.fetchPublicPortal(pSlug);
        if (portal?.require_login && !publicStore.customerToken) {
          window.location.href = `/helpdesk/p/${pSlug}/login`;
        } else {
          await publicStore.fetchMyRequests(pSlug);
        }
      } catch (error) {
        console.error("Failed to load portal data", error);
      } finally {
        setLoading(false);
      }
    };
    loadPortalData();
  }, [pSlug]);

  const { currentPortal, myRequests, customerToken } = publicStore;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="shadow-sm rounded-xl border border-subtle bg-surface-2 p-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <div className="bg-primary/10 mb-2 flex h-12 w-12 items-center justify-center rounded-lg text-primary">
              <LifeBuoy className="size-6" />
            </div>
            <h1 className="text-3xl text-text-100 font-bold">Welcome to {currentPortal?.public_slug || "Support"}</h1>
            <p className="text-text-400 mt-2 max-w-xl">
              Need help? Submit a request and our team will get back to you as soon as possible.
            </p>
          </div>
          <Button
            variant="primary"
            size="lg"
            prependIcon={<Plus className="size-5" />}
            onClick={() => navigate(`/helpdesk/p/${pSlug}/new`)}
            className="shrink-0"
          >
            Submit a Request
          </Button>
        </div>
      </div>

      {/* Requests Table */}
      {(customerToken || myRequests.length > 0) && (
        <section>
          <h2 className="text-xl text-text-100 mb-4 font-bold">My Requests</h2>

          {myRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-subtle bg-surface-2 py-16 text-center">
              <Inbox className="text-text-400 mb-4 size-10" />
              <h3 className="text-lg text-text-100 font-medium">No requests yet</h3>
              <p className="text-sm text-text-400 mt-1">When you submit a request, it will appear here.</p>
            </div>
          ) : (
            <div className="shadow-sm overflow-hidden rounded-lg border border-subtle bg-surface-2">
              <table className="text-sm w-full text-left">
                <thead className="text-xs text-text-400 border-b border-subtle bg-surface-1 uppercase">
                  <tr>
                    <th className="tracking-wider px-6 py-4 font-medium">Request ID</th>
                    <th className="tracking-wider px-6 py-4 font-medium">Title</th>
                    <th className="tracking-wider px-6 py-4 font-medium">Status</th>
                    <th className="tracking-wider px-6 py-4 font-medium">Submitted On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {myRequests.map((req) => (
                    <tr
                      key={req.id}
                      className="group cursor-pointer transition-colors hover:bg-surface-1"
                      onClick={() => navigate(`/helpdesk/p/${pSlug}/${req.id}`)}
                    >
                      <td className="font-mono text-xs text-text-400 px-6 py-4">#{req.id.split("-")[0]}</td>
                      <td className="text-text-100 px-6 py-4 font-medium transition-colors group-hover:text-primary">
                        {req.title}
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant={req.status === "open" ? "warning" : req.status === "waiting" ? "brand" : "success"}
                          size="sm"
                        >
                          {req.status.replace("_", " ")}
                        </Badge>
                      </td>
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
      )}
    </div>
  );
});

export default HelpdeskPublicDashboard;
