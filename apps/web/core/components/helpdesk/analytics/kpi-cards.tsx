"use client";

import React from "react";
import { observer } from "mobx-react";
import { CheckCircle2, Clock, Inbox, Timer, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { cn } from "@plane/utils";
import type { IHelpdeskKPIs } from "@plane/types";

type Props = {
  kpis: IHelpdeskKPIs | undefined;
  isLoading: boolean;
};

type KPICardProps = {
  title: string;
  value: number | null | undefined;
  icon: React.ElementType;
  iconBgColor: string;
  iconTextColor: string;
  pctChange?: number | null;
  suffix?: string;
};

const KPICard = ({ title, value, icon: Icon, iconBgColor, iconTextColor, pctChange, suffix }: KPICardProps) => (
  <div className="flex flex-col justify-between gap-3 rounded-md border border-subtle bg-layer-1 p-4 transition-all duration-200">
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className={cn("flex size-7 items-center justify-center rounded-md", iconBgColor, iconTextColor)}>
          <Icon className="size-3.5" />
        </div>
        <span className="text-11 font-medium text-tertiary">{title}</span>
      </div>
      {pctChange !== null && pctChange !== undefined && (
        <span
          className={cn(
            "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-11 font-medium",
            pctChange >= 0 ? "bg-success-primary/10 text-success-primary" : "bg-danger-primary/10 text-danger-primary"
          )}
        >
          {pctChange >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {Math.abs(pctChange)}%
        </span>
      )}
    </div>

    <div className="flex items-baseline gap-1.5 pt-1">
      <span className="text-20 font-semibold text-primary tabular-nums">
        {value === null || value === undefined ? "—" : value}
      </span>
      {suffix && value !== null && value !== undefined && <span className="text-11 text-tertiary">{suffix}</span>}
    </div>
  </div>
);

const KPICardSkeleton = () => (
  <div className="flex animate-pulse flex-col justify-between gap-3 rounded-md border border-subtle bg-layer-1 p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="size-7 rounded-md bg-layer-2" />
        <div className="h-3 w-16 rounded bg-layer-2" />
      </div>
    </div>
    <div className="h-6 w-12 rounded-md bg-layer-2" />
  </div>
);

export const KpiCards = observer(function KpiCards({ kpis, isLoading }: Props) {
  if (isLoading || !kpis) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {(["total", "open", "resolved", "response", "resolution"] as const).map((k) => (
          <KPICardSkeleton key={k} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <KPICard
        title="Total requests"
        value={kpis.total_requests.current}
        pctChange={kpis.total_requests.pct_change}
        icon={Inbox}
        iconBgColor="bg-accent-primary/10"
        iconTextColor="text-accent-primary"
      />
      <KPICard
        title="Open"
        value={kpis.open_requests.current}
        icon={Clock}
        iconBgColor="bg-warning-primary/10"
        iconTextColor="text-warning-primary"
      />
      <KPICard
        title="Resolved"
        value={kpis.resolved_requests.current}
        icon={CheckCircle2}
        iconBgColor="bg-success-primary/10"
        iconTextColor="text-success-primary"
      />
      <KPICard
        title="Avg first response"
        value={
          kpis.avg_first_response_hours.current !== null && kpis.avg_first_response_hours.current !== undefined
            ? Math.round(kpis.avg_first_response_hours.current * 10) / 10
            : null
        }
        suffix="hours"
        icon={Zap}
        iconBgColor="bg-label-yellow-bg"
        iconTextColor="text-label-yellow-icon"
      />
      <KPICard
        title="Avg resolution"
        value={
          kpis.avg_resolution_hours.current !== null && kpis.avg_resolution_hours.current !== undefined
            ? Math.round(kpis.avg_resolution_hours.current * 10) / 10
            : null
        }
        suffix="hours"
        icon={Timer}
        iconBgColor="bg-label-indigo-bg"
        iconTextColor="text-label-indigo-icon"
      />
    </div>
  );
});
