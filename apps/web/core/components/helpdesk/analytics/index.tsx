"use client";

import { observer } from "mobx-react";
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

const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="border-custom-border-200 bg-custom-background-100 flex flex-col gap-4 rounded-xl border p-5">
    <h3 className="text-sm text-custom-text-200 font-semibold">{title}</h3>
    {children}
  </div>
);

export const HelpdeskAnalyticsView = observer(function HelpdeskAnalyticsView({ analytics, isLoading }: Props) {
  return (
    <div className="flex flex-col gap-5 p-6">
      {/* KPI Cards */}
      <KpiCards kpis={analytics?.kpis} isLoading={isLoading} />

      {/* Row: SLA + Requests over time */}
      <div className="grid grid-cols-3 gap-5">
        <SLAComplianceCard sla={analytics?.sla} isLoading={isLoading} />
        <div className="col-span-2">
          <SectionCard title="Requests over time">
            <RequestsOverTimeChart data={analytics?.charts.requests_over_time} isLoading={isLoading} />
          </SectionCard>
        </div>
      </div>

      {/* Row: By status + By source */}
      <div className="grid grid-cols-2 gap-5">
        <SectionCard title="By status">
          <RequestsByStatusChart data={analytics?.charts.by_status} isLoading={isLoading} />
        </SectionCard>
        <SectionCard title="By source">
          <RequestsBySourceChart data={analytics?.charts.by_source} isLoading={isLoading} />
        </SectionCard>
      </div>

      {/* Row: Resolution trend + Top agents */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2">
          <SectionCard title="Avg resolution time trend">
            <ResolutionTimeTrendChart data={analytics?.charts.resolution_time_trend} isLoading={isLoading} />
          </SectionCard>
        </div>
        <SectionCard title="Top agents (resolved)">
          <TopAgentsChart data={analytics?.charts.top_agents} isLoading={isLoading} />
        </SectionCard>
      </div>
    </div>
  );
});
