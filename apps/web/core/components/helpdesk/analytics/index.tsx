"use client";

import React from "react";
import { observer } from "mobx-react";
import { BarChart3, Clock, PieChart, TrendingUp, Trophy } from "lucide-react";
import type { IHelpdeskAnalyticsFilters, IHelpdeskAnalyticsResponse, IHelpdeskPortal } from "@plane/types";
import { KpiCards } from "./kpi-cards";
import { SLAComplianceCard } from "./sla-compliance-card";
import { RequestsOverTimeChart } from "./requests-over-time-chart";
import { RequestsByStatusChart } from "./requests-by-status-chart";
import { RequestsBySourceChart } from "./requests-by-source-chart";
import { ResolutionTimeTrendChart } from "./resolution-time-trend-chart";
import { TopAgentsChart } from "./top-agents-chart";

type Props = {
  filters: IHelpdeskAnalyticsFilters;
  portals: IHelpdeskPortal[];
  analytics: IHelpdeskAnalyticsResponse | undefined;
  isLoading: boolean;
  onFiltersChange: (filters: IHelpdeskAnalyticsFilters) => void;
};

const AnalyticsCardWrapper = ({
  title,
  icon: Icon,
  subtitle,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <div className="border-custom-border-200 bg-custom-background-100 flex flex-col justify-between gap-4 rounded-xl border p-5 transition-all duration-200">
    <div className="border-custom-border-100 flex items-center justify-between border-b pb-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="text-custom-text-300 size-4" />}
        <h3 className="text-xs text-custom-text-100 tracking-wider font-semibold uppercase">{title}</h3>
      </div>
      {subtitle && <span className="text-custom-text-400 text-[11px] font-medium">{subtitle}</span>}
    </div>
    <div className="flex-1">{children}</div>
  </div>
);

export const HelpdeskAnalyticsView = observer(function HelpdeskAnalyticsView({ analytics, isLoading }: Props) {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* KPI Cards */}
      <KpiCards kpis={analytics?.kpis} isLoading={isLoading} />

      {/* Row 1: SLA + Requests over time */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SLAComplianceCard sla={analytics?.sla} isLoading={isLoading} />
        <div className="lg:col-span-2">
          <AnalyticsCardWrapper title="Requests Volume Over Time" icon={TrendingUp} subtitle="Daily / Monthly trend">
            <RequestsOverTimeChart data={analytics?.charts.requests_over_time} isLoading={isLoading} />
          </AnalyticsCardWrapper>
        </div>
      </div>

      {/* Row 2: By status + By source */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <AnalyticsCardWrapper title="Requests by Status" icon={BarChart3} subtitle="Current breakdown">
          <RequestsByStatusChart data={analytics?.charts.by_status} isLoading={isLoading} />
        </AnalyticsCardWrapper>

        <AnalyticsCardWrapper title="Requests by Channel Source" icon={PieChart} subtitle="Inbound origin">
          <RequestsBySourceChart data={analytics?.charts.by_source} isLoading={isLoading} />
        </AnalyticsCardWrapper>
      </div>

      {/* Row 3: Resolution trend + Top agents */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AnalyticsCardWrapper title="Average Resolution Time Trend" icon={Clock} subtitle="In hours">
            <ResolutionTimeTrendChart data={analytics?.charts.resolution_time_trend} isLoading={isLoading} />
          </AnalyticsCardWrapper>
        </div>

        <AnalyticsCardWrapper title="Top Performing Agents" icon={Trophy} subtitle="Resolved requests count">
          <TopAgentsChart data={analytics?.charts.top_agents} isLoading={isLoading} />
        </AnalyticsCardWrapper>
      </div>
    </div>
  );
});
