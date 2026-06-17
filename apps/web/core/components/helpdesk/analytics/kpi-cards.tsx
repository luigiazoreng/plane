"use client";

import { observer } from "mobx-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@plane/utils";
import type { IHelpdeskKPIs } from "@plane/types";

type Props = {
  kpis: IHelpdeskKPIs | undefined;
  isLoading: boolean;
};

const KPICard = ({
  title,
  value,
  pctChange,
  suffix,
  accentColor,
}: {
  title: string;
  value: number | null | undefined;
  pctChange?: number | null;
  suffix?: string;
  accentColor?: string;
}) => (
  <div className="border-custom-border-200 bg-custom-background-100 flex flex-col gap-3 rounded-xl border p-5">
    <div className="flex items-center justify-between">
      <span className="text-xs tracking-widest text-custom-text-400 font-medium uppercase">{title}</span>
      {pctChange !== null && pctChange !== undefined && (
        <span
          className={cn(
            "text-xs flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold",
            pctChange >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
          )}
        >
          {pctChange >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {Math.abs(pctChange)}%
        </span>
      )}
    </div>
    <div className="flex items-baseline gap-1">
      <span
        className="text-3xl text-custom-text-100 font-bold"
        style={accentColor ? { color: accentColor } : undefined}
      >
        {value === null || value === undefined ? "—" : value}
      </span>
      {suffix && value !== null && value !== undefined && (
        <span className="text-sm text-custom-text-300 font-medium">{suffix}</span>
      )}
    </div>
  </div>
);

const KPICardSkeleton = () => (
  <div className="border-custom-border-200 bg-custom-background-100 flex animate-pulse flex-col gap-3 rounded-xl border p-5">
    <div className="bg-custom-background-80 h-3 w-20 rounded" />
    <div className="bg-custom-background-80 h-9 w-14 rounded" />
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
      <KPICard title="Total requests" value={kpis.total_requests.current} pctChange={kpis.total_requests.pct_change} />
      <KPICard title="Open" value={kpis.open_requests.current} accentColor="#F97316" />
      <KPICard title="Resolved" value={kpis.resolved_requests.current} accentColor="#10B981" />
      <KPICard
        title="Avg first response"
        value={
          kpis.avg_first_response_hours.current !== null && kpis.avg_first_response_hours.current !== undefined
            ? Math.round(kpis.avg_first_response_hours.current * 10) / 10
            : null
        }
        suffix="h"
      />
      <KPICard
        title="Avg resolution"
        value={
          kpis.avg_resolution_hours.current !== null && kpis.avg_resolution_hours.current !== undefined
            ? Math.round(kpis.avg_resolution_hours.current * 10) / 10
            : null
        }
        suffix="h"
      />
    </div>
  );
});
