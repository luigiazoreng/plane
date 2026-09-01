"use client";

import { useMemo } from "react";
import { observer } from "mobx-react";
import { Users } from "lucide-react";
import type { IHelpdeskAgentChartPoint } from "@plane/types";

type Props = {
  data: IHelpdeskAgentChartPoint[] | undefined;
  isLoading: boolean;
};

const TopAgentsSkeleton = () => (
  <div className="flex h-[260px] flex-col justify-center gap-4">
    {Array.from({ length: 5 }).map((_, index) => (
      <div key={index} className="flex animate-pulse items-center gap-3">
        <div className="h-3 w-14 shrink-0 rounded bg-layer-2" />
        <div className="h-2 flex-1 rounded-full bg-layer-2" />
        <div className="h-3 w-6 shrink-0 rounded bg-layer-2" />
      </div>
    ))}
  </div>
);

export const TopAgentsChart = observer(function TopAgentsChart({ data, isLoading }: Props) {
  const chartData = useMemo(
    () =>
      (data ?? []).map((point) => ({
        name: point.display_name || "Unknown",
        count: point.count,
      })),
    [data]
  );

  const maxCount = useMemo(() => Math.max(...chartData.map((point) => point.count), 0), [chartData]);

  if (isLoading) {
    return <TopAgentsSkeleton />;
  }

  if (!chartData.length) {
    return (
      <div className="border-subtle bg-layer-2 flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border">
        <div className="bg-layer-3 text-tertiary flex size-10 items-center justify-center rounded-full">
          <Users className="size-5" />
        </div>
        <p className="text-xs text-secondary font-medium">No agent data for this period</p>
      </div>
    );
  }

  return (
    <div className="flex h-[260px] flex-col justify-center gap-4">
      {chartData.map((agent) => (
        <div key={agent.name} className="flex items-center gap-3">
          <span className="w-16 shrink-0 truncate text-xs font-medium text-secondary" title={agent.name}>
            {agent.name}
          </span>
          <div className="bg-layer-2 h-2 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-success-primary h-2 rounded-full transition-all duration-500"
              style={{ width: maxCount > 0 ? `${(agent.count / maxCount) * 100}%` : "0%" }}
            />
          </div>
          <span className="w-6 shrink-0 text-right text-xs font-semibold text-primary tabular-nums">
            {agent.count}
          </span>
        </div>
      ))}
    </div>
  );
});
