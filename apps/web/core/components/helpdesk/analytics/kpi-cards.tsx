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
  <div className="border-custom-border-200 bg-custom-background-100 hover:border-custom-border-300 group hover:shadow-sm flex flex-col justify-between gap-4 rounded-xl border p-4.5 transition-all duration-200">
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105",
            iconBgColor,
            iconTextColor
          )}
        >
          <Icon className="size-4" />
        </div>
        <span className="text-xs text-custom-text-300 font-medium">{title}</span>
      </div>
      {pctChange !== null && pctChange !== undefined && (
        <span
          className={cn(
            "text-xs flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition-colors",
            pctChange >= 0
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          )}
        >
          {pctChange >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {Math.abs(pctChange)}%
        </span>
      )}
    </div>

    <div className="flex items-baseline gap-1.5 pt-1">
      <span className="text-2xl text-custom-text-100 font-bold tracking-tight">
        {value === null || value === undefined ? "—" : value}
      </span>
      {suffix && value !== null && value !== undefined && (
        <span className="text-xs text-custom-text-300 font-medium">{suffix}</span>
      )}
    </div>
  </div>
);

const KPICardSkeleton = () => (
  <div className="border-custom-border-200 bg-custom-background-100 flex animate-pulse flex-col justify-between gap-4 rounded-xl border p-4.5">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="bg-custom-background-80 size-8 rounded-lg" />
        <div className="bg-custom-background-80 h-3 w-20 rounded" />
      </div>
    </div>
    <div className="bg-custom-background-80 h-7 w-16 rounded-md" />
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
        iconBgColor="bg-blue-500/10"
        iconTextColor="text-blue-600 dark:text-blue-400"
      />
      <KPICard
        title="Open"
        value={kpis.open_requests.current}
        icon={Clock}
        iconBgColor="bg-orange-500/10"
        iconTextColor="text-orange-600 dark:text-orange-400"
      />
      <KPICard
        title="Resolved"
        value={kpis.resolved_requests.current}
        icon={CheckCircle2}
        iconBgColor="bg-emerald-500/10"
        iconTextColor="text-emerald-600 dark:text-emerald-400"
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
        iconBgColor="bg-amber-500/10"
        iconTextColor="text-amber-600 dark:text-amber-400"
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
        iconBgColor="bg-purple-500/10"
        iconTextColor="text-purple-600 dark:text-purple-400"
      />
    </div>
  );
});
