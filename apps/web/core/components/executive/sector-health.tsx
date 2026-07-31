/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import { cn } from "@plane/utils";
import type { IHelpdeskAnalyticsResponse, IKpiOverviewResponse } from "@plane/types";
import { getHealthStatus } from "./helpers";

type Props = {
  helpdeskData: IHelpdeskAnalyticsResponse | undefined;
  kpiOverview: IKpiOverviewResponse | undefined;
};

type MetricCardProps = {
  label: string;
  value: string;
  subtext?: string;
};

const MetricCard: React.FC<MetricCardProps> = ({ label, value, subtext }) => (
  <div className="flex flex-col justify-center rounded-md border border-subtle bg-surface-1 p-3">
    <span className="truncate text-11 font-medium text-tertiary">{label}</span>
    <div className="mt-1 flex items-baseline gap-1.5">
      <span className="text-16 font-medium text-primary tabular-nums">{value}</span>
      {subtext && <span className="text-11 text-tertiary">{subtext}</span>}
    </div>
  </div>
);

const HealthBadge: React.FC<{ status: ReturnType<typeof getHealthStatus> }> = ({ status }) => {
  const labelMap = {
    healthy: "Healthy",
    warning: "Attention",
    critical: "Critical",
    unknown: "No data",
  };
  const colorMap = {
    healthy: "text-success-primary bg-success-primary/10",
    warning: "text-warning-primary bg-warning-primary/10",
    critical: "text-danger-primary bg-danger-primary/10",
    unknown: "text-tertiary bg-surface-2",
  };

  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-11 font-medium", colorMap[status])}>
      {labelMap[status]}
    </span>
  );
};

export const SectorHealth: React.FC<Props> = ({ helpdeskData, kpiOverview }) => {
  // ── Helpdesk health ──
  const slaResponse = helpdeskData?.sla.first_response_pct ?? null;
  const slaResolution = helpdeskData?.sla.resolution_pct ?? null;
  const avgResolution = helpdeskData?.kpis.avg_resolution_hours.current ?? null;
  const totalTickets = helpdeskData?.kpis.total_requests.current ?? null;
  const openTickets = helpdeskData?.kpis.open_requests.current ?? null;
  const resolvedTickets = helpdeskData?.kpis.resolved_requests.current ?? null;

  const hdHealthValue =
    slaResponse != null && slaResolution != null
      ? (slaResponse + slaResolution) / 2
      : (slaResponse ?? slaResolution ?? null);
  const hdHealth = getHealthStatus(hdHealthValue);

  // ── Projects health ──
  const kpiEfficiency = kpiOverview?.unified.kpi != null ? kpiOverview.unified.kpi * 100 : null;
  const scoredItems = kpiOverview?.unified.scored_items ?? null;
  const onTime = kpiOverview ? kpiOverview.unified.counts.on_time + kpiOverview.unified.counts.early : null;
  const late = kpiOverview?.unified.counts.late ?? null;
  const pending = kpiOverview?.unified.counts.pending ?? null;
  const projectHealth = getHealthStatus(kpiEfficiency);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {/* ── Helpdesk & Support ──────────────────────────── */}
      <div className="overflow-hidden rounded-md border border-subtle bg-surface-1">
        <div className="flex h-11 items-center justify-between border-b border-subtle bg-layer-1 px-4">
          <h3 className="text-13 font-medium text-primary">Helpdesk & Support</h3>
          <HealthBadge status={hdHealth} />
        </div>

        {helpdeskData ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            <MetricCard label="SLA Response" value={slaResponse != null ? `${slaResponse}%` : "—"} />
            <MetricCard label="SLA Resolution" value={slaResolution != null ? `${slaResolution}%` : "—"} />
            <MetricCard
              label="Avg Resolution"
              value={avgResolution != null ? `${Math.round(avgResolution * 10) / 10}h` : "—"}
            />
            <MetricCard label="Total Tickets" value={totalTickets != null ? String(totalTickets) : "—"} />
            <MetricCard label="Open (Backlog)" value={openTickets != null ? String(openTickets) : "—"} />
            <MetricCard label="Resolved" value={resolvedTickets != null ? String(resolvedTickets) : "—"} />
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-13 text-tertiary">No Helpdesk data available</p>
          </div>
        )}
      </div>

      {/* ── Engineering & Projects ──────────────────────── */}
      <div className="overflow-hidden rounded-md border border-subtle bg-surface-1">
        <div className="flex h-11 items-center justify-between border-b border-subtle bg-layer-1 px-4">
          <h3 className="text-13 font-medium text-primary">Engineering & Projects</h3>
          <HealthBadge status={projectHealth} />
        </div>

        {kpiOverview ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            <MetricCard label="Efficiency" value={kpiEfficiency != null ? `${kpiEfficiency.toFixed(1)}%` : "—"} />
            <MetricCard label="Scored Items" value={scoredItems != null ? String(scoredItems) : "—"} />
            <MetricCard label="On Time / Early" value={onTime != null ? String(onTime) : "—"} />
            <MetricCard label="Late" value={late != null ? String(late) : "—"} />
            <MetricCard label="Pending" value={pending != null ? String(pending) : "—"} />
            <MetricCard label="Active KPIs" value={String(kpiOverview.unified.project_count)} />
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-13 text-tertiary">No KPI data available</p>
          </div>
        )}
      </div>
    </div>
  );
};
