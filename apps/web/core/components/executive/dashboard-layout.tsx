/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Sliders, Award, Target, CheckCircle, HelpCircle, AlertTriangle } from "lucide-react";
import { Spinner } from "@plane/ui";
import { Button } from "@plane/propel/button";
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
import { KpiSettingsModal } from "./kpi-settings-modal";
import {
  computeITGeneralIndex,
  buildExecutiveMembers,
  helpdeskFilterForPeriod,
  kpiPeriodForPeriod,
  PERIOD_LABELS,
  DEFAULT_KPI_SETTINGS,
  type IKpiSettings,
  type TExecutivePeriod,
} from "./helpers";
import { useExecutiveExport } from "./export-context";

type Props = {
  workspaceSlug: string;
};

const SectionHeader = ({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) => (
  <div className="flex h-11 shrink-0 items-center justify-between border-b border-subtle bg-surface-1 px-page-x">
    <div className="flex items-center gap-2">
      <h3 className="text-13 font-medium text-primary">{title}</h3>
      {hint && <span className="truncate text-12 text-tertiary">{hint}</span>}
    </div>
    {action && <div>{action}</div>}
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
  const [customStartDate, setCustomStartDate] = useState<string | undefined>();
  const [customEndDate, setCustomEndDate] = useState<string | undefined>();
  const [settings, setSettings] = useState<IKpiSettings>(DEFAULT_KPI_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handlePeriodChange = (nextPeriod: TExecutivePeriod, start?: string, end?: string) => {
    setPeriod(nextPeriod);
    setCustomStartDate(start);
    setCustomEndDate(end);
  };

  const hdFilters: IHelpdeskAnalyticsFilters = useMemo(
    () =>
      period === "custom"
        ? { date_filter: "custom", start_date: customStartDate, end_date: customEndDate }
        : { date_filter: helpdeskFilterForPeriod(period) },
    [period, customStartDate, customEndDate]
  );

  // ── Derived data ─────────────────────────────────────────────
  const overview = workspaceOverview[workspaceSlug];
  const helpdeskData = getAnalytics(workspaceSlug, hdFilters);
  const hdLoading = isHelpdeskLoading(workspaceSlug, hdFilters);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      fetchWorkspaceOverview(workspaceSlug, {
        period: kpiPeriodForPeriod(period),
        start: period === "custom" ? customStartDate : undefined,
        end: period === "custom" ? customEndDate : undefined,
      }),
      fetchAnalytics(workspaceSlug, hdFilters),
    ]).finally(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [workspaceSlug, period, customStartDate, customEndDate, hdFilters, fetchWorkspaceOverview, fetchAnalytics]);

  // ── Computed values ──────────────────────────────────────────
  const itIndex = useMemo(() => computeITGeneralIndex(helpdeskData, overview), [helpdeskData, overview]);

  const executiveMembers = useMemo(
    () =>
      buildExecutiveMembers(
        overview?.members ?? [],
        helpdeskData?.charts.top_agents ?? [],
        settings,
        period,
        customStartDate,
        customEndDate
      ),
    [overview, helpdeskData, settings, period, customStartDate, customEndDate]
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

  // Workspace-level executive KPI summary cards
  const executiveKpiSummary = useMemo(() => {
    const totalVp = overview?.members?.reduce((acc, m) => acc + (m.sum_vp ?? 0), 0) ?? 0;
    const totalVf = overview?.members?.reduce((acc, m) => acc + (m.sum_vf ?? 0), 0) ?? 0;

    let totalEarly = 0;
    let totalOnTime = 0;
    let totalScored = 0;
    overview?.members?.forEach((m) => {
      const e = m.counts.early ?? 0;
      const o = m.counts.on_time ?? 0;
      const l = m.counts.late ?? 0;
      totalEarly += e;
      totalOnTime += o;
      totalScored += e + o + l;
    });

    const deliveryReliability = totalScored > 0 ? ((totalEarly + totalOnTime) / totalScored) * 100 : null;
    const overallEfficiency = overview?.unified.kpi != null ? overview.unified.kpi * 100 : null;

    const belowTargetCount = executiveMembers.filter(
      (m) => m.sampleStatus === "sufficient" && m.finalScore < 70
    ).length;

    return {
      totalVp,
      totalVf,
      deliveryReliability,
      overallEfficiency,
      belowTargetCount,
    };
  }, [overview, executiveMembers]);

  // Publish payload to Excel export context
  const { setPayload } = useExecutiveExport();
  useEffect(() => {
    setPayload({
      workspaceSlug,
      period,
      customStartDate,
      customEndDate,
      itIndex,
      members: executiveMembers,
      kpi: overview,
      helpdesk: helpdeskData,
    });
    return () => setPayload(null);
  }, [
    setPayload,
    workspaceSlug,
    period,
    customStartDate,
    customEndDate,
    itIndex,
    executiveMembers,
    overview,
    helpdeskData,
  ]);

  // ── Loading state ────────────────────────────────────────────
  if (loading && (!overview || !helpdeskData)) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const periodDaysLabel =
    period === "custom" && customStartDate && customEndDate
      ? `${customStartDate} ~ ${customEndDate}`
      : PERIOD_LABELS[period];

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="executive-dashboard-print vertical-scrollbar flex scrollbar-lg h-full w-full flex-col overflow-y-auto bg-surface-1">
      {/* ─── Section 1: IT General Index Hero ─────────────────── */}
      <ITGeneralIndex
        data={itIndex}
        period={period}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onPeriodChange={handlePeriodChange}
      />

      {/* ─── Executive Summary KPI Cards ─────────────────────── */}
      <div className="grid grid-cols-2 gap-4 px-page-x py-4 md:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-md border border-subtle bg-surface-1 p-3">
          <div className="flex items-center gap-1.5 text-11 text-tertiary">
            <Award className="size-3.5 text-accent-primary" />
            <span>Overall Efficiency</span>
          </div>
          <p className="mt-1 text-20 font-semibold text-primary">
            {executiveKpiSummary.overallEfficiency != null
              ? `${executiveKpiSummary.overallEfficiency.toFixed(1)}%`
              : "—"}
          </p>
        </div>

        <div className="rounded-md border border-subtle bg-surface-1 p-3">
          <div className="flex items-center gap-1.5 text-11 text-tertiary">
            <Target className="text-label-purple-text size-3.5" />
            <span>Weighted Throughput</span>
          </div>
          <p className="mt-1 text-20 font-semibold text-primary">
            {executiveKpiSummary.totalVp.toFixed(1)} <span className="font-normal text-12 text-tertiary">Vp</span>
          </p>
        </div>

        <div className="rounded-md border border-subtle bg-surface-1 p-3">
          <div className="flex items-center gap-1.5 text-11 text-tertiary">
            <CheckCircle className="size-3.5 text-success-primary" />
            <span>Delivery Reliability</span>
          </div>
          <p className="mt-1 text-20 font-semibold text-primary">
            {executiveKpiSummary.deliveryReliability != null
              ? `${executiveKpiSummary.deliveryReliability.toFixed(1)}%`
              : "—"}
          </p>
        </div>

        <div className="rounded-md border border-subtle bg-surface-1 p-3">
          <div className="flex items-center gap-1.5 text-11 text-tertiary">
            <HelpCircle className="size-3.5 text-accent-primary" />
            <span>Helpdesk FR SLA</span>
          </div>
          <p className="mt-1 text-20 font-semibold text-primary">
            {helpdeskData?.sla.first_response_pct != null ? `${helpdeskData.sla.first_response_pct.toFixed(1)}%` : "—"}
          </p>
        </div>

        <div className="rounded-md border border-subtle bg-surface-1 p-3">
          <div className="flex items-center gap-1.5 text-11 text-tertiary">
            <AlertTriangle className="size-3.5 text-warning-primary" />
            <span>Members Below Target</span>
          </div>
          <p className="mt-1 text-20 font-semibold text-primary">{executiveKpiSummary.belowTargetCount}</p>
        </div>
      </div>

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
          hint="Fair & audited individual performance scores based on efficiency, throughput, delivery reliability, and minimum sample limits"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-1.5 text-12"
            >
              <Sliders className="size-3.5" />
              <span>KPI Settings</span>
            </Button>
          }
        />
        <div className="px-page-x py-4">
          <ExecutiveMemberTable members={executiveMembers} settings={settings} />
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

      {/* Settings Modal */}
      <KpiSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={(newSettings) => setSettings(newSettings)}
      />
    </div>
  );
});
