/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Spinner } from "@plane/ui";
import type { IHelpdeskAnalyticsFilters } from "@plane/types";
// hooks
import { useHelpdeskAnalytics } from "@/hooks/store/use-helpdesk-analytics";
import { useKpi } from "@/hooks/store/use-kpi";
// Helpdesk analytics components
import { KpiCards as HelpdeskKpiCards } from "@/components/helpdesk/analytics/kpi-cards";
import { SLAComplianceCard } from "@/components/helpdesk/analytics/sla-compliance-card";
import { RequestsOverTimeChart } from "@/components/helpdesk/analytics/requests-over-time-chart";
import { ResolutionTimeTrendChart } from "@/components/helpdesk/analytics/resolution-time-trend-chart";
// KPI components
import { KpiScoreBarChart } from "@/components/kpi/score-bar-chart";
// Executive components
import { ITGeneralIndex } from "./it-general-index";
import { SectorHealth } from "./sector-health";
import { ExecutiveMemberTable } from "./executive-member-table";
import {
  computeITGeneralIndex,
  buildExecutiveMembers,
  helpdeskFilterForPeriod,
  kpiPeriodForPeriod,
  PERIOD_LABELS,
  type TExecutivePeriod,
} from "./helpers";
import { useExecutiveExport } from "./export-context";

type Props = {
  workspaceSlug: string;
};

const SectionHeader = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle bg-surface-1 px-page-x">
    <h3 className="text-13 font-medium text-primary">{title}</h3>
    {hint && <span className="truncate text-12 text-tertiary">{hint}</span>}
  </div>
);

const CardWrapper = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col justify-between gap-4 rounded-md border border-subtle bg-surface-1 p-4">
    <div className="flex items-center justify-between border-b border-subtle pb-3">
      <h3 className="text-12 font-medium tracking-wide text-primary uppercase">{title}</h3>
      {subtitle && <span className="text-11 text-tertiary">{subtitle}</span>}
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
  const [period, setPeriod] = useState<TExecutivePeriod>("30d");

  const hdFilters: IHelpdeskAnalyticsFilters = useMemo(
    () => ({ date_filter: helpdeskFilterForPeriod(period) }),
    [period]
  );

  // ── Derived data ─────────────────────────────────────────────
  const overview = workspaceOverview[workspaceSlug];
  const helpdeskData = getAnalytics(workspaceSlug, hdFilters);
  const hdLoading = isHelpdeskLoading(workspaceSlug, hdFilters);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      fetchWorkspaceOverview(workspaceSlug, { period: kpiPeriodForPeriod(period) }),
      fetchAnalytics(workspaceSlug, hdFilters),
    ]).finally(
      () => {
        if (mounted) setLoading(false);
      }
    );

    return () => {
      mounted = false;
    };
  }, [workspaceSlug, period, hdFilters, fetchWorkspaceOverview, fetchAnalytics]);

  // ── Computed values ──────────────────────────────────────────
  const itIndex = useMemo(() => computeITGeneralIndex(helpdeskData, overview), [helpdeskData, overview]);

  const executiveMembers = useMemo(
    () => buildExecutiveMembers(overview?.members ?? [], helpdeskData?.charts.top_agents ?? []),
    [overview, helpdeskData]
  );

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

  // Publish everything the header's "Export to Excel" action needs; it renders
  // outside this component, in the route layout.
  const { setPayload } = useExecutiveExport();
  useEffect(() => {
    setPayload({ workspaceSlug, period, itIndex, members: executiveMembers, kpi: overview, helpdesk: helpdeskData });
    return () => setPayload(null);
  }, [setPayload, workspaceSlug, period, itIndex, executiveMembers, overview, helpdeskData]);

  // ── Loading state ────────────────────────────────────────────
  if (loading && (!overview || !helpdeskData)) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const periodDaysLabel = PERIOD_LABELS[period];

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="executive-dashboard-print vertical-scrollbar flex scrollbar-lg h-full w-full flex-col overflow-y-auto bg-surface-1">
      {/* ─── Section 1: IT General Index Hero ─────────────────── */}
      <ITGeneralIndex data={itIndex} period={period} onPeriodChange={setPeriod} />

      {/* ─── Section 2: Sector Health ─────────────────────────── */}
      <div>
        <SectionHeader
          title="Sector Health"
          hint={`Operational stability & feature delivery velocity over the last ${periodDaysLabel}`}
        />
        <div className="px-page-x py-4">
          <SectorHealth helpdeskData={helpdeskData} kpiOverview={overview} />
        </div>
      </div>

      {/* ─── Section 3: Team Performance ──────────────────────── */}
      <div>
        <SectionHeader
          title="Team Performance"
          hint="Scores evaluated by profile: Helpdesk SLA compliance, Engineering efficiency, or a volume-weighted Hybrid blend"
        />
        <div className="px-page-x py-4">
          <ExecutiveMemberTable members={executiveMembers} />
        </div>
      </div>

      {/* ─── Section 4: Operational & Delivery Trends ──────────── */}
      <div>
        <SectionHeader
          title="Operational & Delivery Trends"
          hint={`Trend breakdown over the last ${periodDaysLabel}`}
        />
        <div className="flex flex-col gap-6 px-page-x py-4">
          {/* Row 1: 5 KPI Summary Cards */}
          <HelpdeskKpiCards kpis={helpdeskData?.kpis} isLoading={hdLoading} />

          {/* Row 2: SLA Compliance & Project Efficiency side-by-side */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SLAComplianceCard sla={helpdeskData?.sla} isLoading={hdLoading} />
            {projectChartData.length > 0 && (
              <CardWrapper title="Project Efficiency" subtitle="Efficiency scores (%) by project">
                <KpiScoreBarChart data={projectChartData} label="Efficiency (%)" />
              </CardWrapper>
            )}
          </div>

          {/* Row 3: Requests Volume Over Time & Resolution Time Trend side-by-side */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <CardWrapper title="Requests Volume Over Time" subtitle="Trend analysis">
              <RequestsOverTimeChart data={helpdeskData?.charts.requests_over_time} isLoading={hdLoading} />
            </CardWrapper>
            <CardWrapper title="Resolution Time Trend" subtitle="Average time to resolve in hours">
              <ResolutionTimeTrendChart data={helpdeskData?.charts.resolution_time_trend} isLoading={hdLoading} />
            </CardWrapper>
          </div>
        </div>
      </div>
    </div>
  );
});
