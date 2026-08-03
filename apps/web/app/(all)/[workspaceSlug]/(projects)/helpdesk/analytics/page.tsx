/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { BarChart2 } from "lucide-react";
import type { IHelpdeskAnalyticsFilters } from "@plane/types";
import { AppHeader } from "@/components/core/app-header";
import { HelpdeskAnalyticsView } from "@/components/helpdesk/analytics";
import { AnalyticsFilters } from "@/components/helpdesk/analytics/analytics-filters";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";
import { useHelpdeskAnalytics } from "@/hooks/store/use-helpdesk-analytics";

const WorkspaceHelpdeskAnalyticsPage = observer(() => {
  const { workspaceSlug } = useParams();
  const navigate = useNavigate();
  const helpdeskStore = useHelpdesk();
  const helpdeskAnalyticsStore = useHelpdeskAnalytics();

  const wSlug = workspaceSlug?.toString() || "";

  const [filters, setFilters] = useState<IHelpdeskAnalyticsFilters>({
    date_filter: "last_30_days",
  });

  useEffect(() => {
    if (!wSlug) return;
    helpdeskStore.fetchPortals(wSlug);
  }, [wSlug, helpdeskStore]);

  useEffect(() => {
    if (!wSlug) return;
    helpdeskAnalyticsStore.fetchAnalytics(wSlug, filters);
  }, [wSlug, filters, helpdeskAnalyticsStore]);

  const portals = helpdeskStore.getWorkspacePortals(wSlug);
  const analytics = helpdeskAnalyticsStore.getAnalytics(wSlug, filters);
  const isLoading = helpdeskAnalyticsStore.isLoading(wSlug, filters);

  return (
    <div className="bg-surface-1 flex h-full w-full flex-col">
      <AppHeader
        header={
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(`/${wSlug}/helpdesk`)}
                className="text-xs text-tertiary hover:text-primary font-medium transition-colors"
              >
                Helpdesk
              </button>
              <span className="text-tertiary text-xs">/</span>
              <div className="flex items-center gap-1.5">
                <BarChart2 className="text-secondary size-4" />
                <span className="text-sm text-primary font-semibold tracking-tight">Analytics</span>
              </div>
            </div>
            <AnalyticsFilters filters={filters} portals={portals} onChange={setFilters} />
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <HelpdeskAnalyticsView
          filters={filters}
          portals={portals}
          analytics={analytics}
          isLoading={isLoading}
          onFiltersChange={setFilters}
        />
      </div>
    </div>
  );
});

export default WorkspaceHelpdeskAnalyticsPage;
