"use client";

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Info } from "lucide-react";
// ui
import { Spinner } from "@plane/ui";
// plane types
import type { IHelpdeskAnalyticsFilters, TKpiPeriod, IKpiAggregates } from "@plane/types";
// hooks
import { useHelpdeskAnalytics } from "@/hooks/store/use-helpdesk-analytics";
import { useKpi } from "@/hooks/store/use-kpi";
// KPI components (Projects)
import { UnifiedKpiHero } from "@/components/kpi/unified-kpi-hero";
import { KpiStatBar } from "@/components/kpi/stat-bar";
import { KpiScoreBarChart } from "@/components/kpi/score-bar-chart";
// Helpdesk components
import { KpiCards as HelpdeskKpiCards } from "@/components/helpdesk/analytics/kpi-cards";
import { SLAComplianceCard } from "@/components/helpdesk/analytics/sla-compliance-card";
import { RequestsOverTimeChart } from "@/components/helpdesk/analytics/requests-over-time-chart";
import { ResolutionTimeTrendChart } from "@/components/helpdesk/analytics/resolution-time-trend-chart";

type Props = {
  workspaceSlug: string;
};

// Reusable card wrapper — uses the same token set as the Helpdesk analytics
// cards so the two columns look visually consistent.
const CardWrapper = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <div className="border-custom-border-200 bg-custom-background-100 flex flex-col justify-between gap-4 rounded-xl border p-5">
    <div className="border-custom-border-100 flex items-center justify-between border-b pb-3">
      <h3 className="text-xs text-custom-text-100 tracking-wider font-semibold uppercase">{title}</h3>
      {subtitle && <span className="text-custom-text-400 text-[11px] font-medium">{subtitle}</span>}
    </div>
    <div className="flex-1">{children}</div>
  </div>
);

export const ExecutiveDashboardLayout = observer(function ExecutiveDashboardLayout({ workspaceSlug }: Props) {
  // ── Store hooks ──────────────────────────────────────────────
  const { fetchAnalytics, getAnalytics, isLoading: isHelpdeskLoading } = useHelpdeskAnalytics();
  const { workspaceOverview, fetchWorkspaceOverview } = useKpi();

  // ── Local state ──────────────────────────────────────────────
  const [loading, setLoading] = useState(true);

  // Fixed 90-day window for the executive view.
  const kpiPeriod: Exclude<TKpiPeriod, "custom"> = "90d";
  const hdFilters: IHelpdeskAnalyticsFilters = useMemo(() => ({
    date_filter: "last_3_months",
  }), []);

  // ── Derived data ─────────────────────────────────────────────
  const overview = workspaceOverview[workspaceSlug];
  const helpdeskData = getAnalytics(workspaceSlug, hdFilters);
  const hdLoading = isHelpdeskLoading(workspaceSlug, hdFilters);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      fetchWorkspaceOverview(workspaceSlug, { period: kpiPeriod }),
      fetchAnalytics(workspaceSlug, hdFilters),
    ]).finally(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [workspaceSlug, kpiPeriod, hdFilters, fetchWorkspaceOverview, fetchAnalytics]);

  // Adapt the unified KPI summary into the shape expected by KpiStatBar.
  const statAggregates: IKpiAggregates | undefined = useMemo(() => {
    if (!overview) return undefined;
    const { unified } = overview;
    return {
      sum_vp: unified.sum_vp_raw,
      sum_vf: unified.sum_vf_raw,
      efficiency: unified.kpi,
      counts: unified.counts,
      total: unified.scored_items,
    };
  }, [overview]);

  const projectChartData = useMemo(
    () =>
      (overview?.projects ?? [])
        .filter((row) => row.efficiency != null)
        .map((row) => ({
          name: row.identifier,
          value: Number(((row.efficiency ?? 0) * 100).toFixed(1)),
        })),
    [overview]
  );

  // ── Loading state ────────────────────────────────────────────
  if (loading && (!overview || !helpdeskData)) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="executive-dashboard-print vertical-scrollbar scrollbar-lg flex h-full w-full flex-col overflow-y-auto bg-custom-background-90 pb-10">

      {/* Context Hero / Disclaimer — visible both on-screen and in print */}
      <div className="px-page-x py-6">
        <div className="border-custom-border-200 bg-custom-background-100 rounded-lg border p-5 flex items-start gap-4">
          <Info className="size-5 text-custom-text-300 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-custom-text-100 mb-1">Bimodal IT Operations</h2>
            <p className="text-sm text-custom-text-300">
              This dashboard provides a unified view of our IT performance across two distinct focus areas.
              <strong className="text-custom-text-200"> Helpdesk & Support</strong> metrics reflect our operational
              stability and rapid response capabilities, while
              <strong className="text-custom-text-200"> Engineering & Projects</strong> (KPIs) reflect our development
              velocity and delivery of new features. Teams and individuals may focus on one area exclusively, and both
              are essential to the organization's success.
            </p>
          </div>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="px-page-x grid grid-cols-1 xl:grid-cols-2 gap-8 mt-2">

        {/* ─── COLUMN 1: Helpdesk / Operations ─────────────────── */}
        <div className="flex flex-col gap-6">
          <div className="border-custom-border-100 border-b pb-2">
            <h2 className="text-lg font-medium text-custom-text-100">Helpdesk & Support</h2>
            <p className="text-xs text-custom-text-300">Operational performance and response times over the last 90 days.</p>
          </div>

          {/* Fix #5: Helpdesk KPI summary cards */}
          <HelpdeskKpiCards kpis={helpdeskData?.kpis} isLoading={hdLoading} />

          {/* Fix #6: SLA compliance */}
          <SLAComplianceCard sla={helpdeskData?.sla} isLoading={hdLoading} />

          {/* Trend charts */}
          <CardWrapper title="Requests Volume Over Time" subtitle="Trend analysis">
            <RequestsOverTimeChart data={helpdeskData?.charts.requests_over_time} isLoading={hdLoading} />
          </CardWrapper>

          <CardWrapper title="Resolution Time Trend" subtitle="Average time to resolve in hours">
            <ResolutionTimeTrendChart data={helpdeskData?.charts.resolution_time_trend} isLoading={hdLoading} />
          </CardWrapper>
        </div>

        {/* ─── COLUMN 2: Projects / Engineering KPIs ───────────── */}
        <div className="flex flex-col gap-6">
          <div className="border-custom-border-100 border-b pb-2">
            <h2 className="text-lg font-medium text-custom-text-100">Engineering & Projects</h2>
            <p className="text-xs text-custom-text-300">Development velocity and KPI performance over the last 90 days.</p>
          </div>

          {overview && (
            <div className="border-custom-border-200 bg-custom-background-100 rounded-xl border overflow-hidden">
              <UnifiedKpiHero unified={overview.unified} />
              <KpiStatBar agg={statAggregates} mixedScale />
            </div>
          )}

          {projectChartData.length > 0 && (
            <CardWrapper title="Project Efficiency" subtitle="Efficiency scores (%) by project">
              <KpiScoreBarChart data={projectChartData} label="Efficiency (%)" />
            </CardWrapper>
          )}
        </div>

      </div>
    </div>
  );
});
