"use client";

import { useMemo } from "react";
import { observer } from "mobx-react";
import { Users } from "lucide-react";
import { BarChart } from "@plane/propel/charts/bar-chart";
import type { IHelpdeskAgentChartPoint } from "@plane/types";

type Props = {
  data: IHelpdeskAgentChartPoint[] | undefined;
  isLoading: boolean;
};

const BARS = [
  {
    key: "count",
    label: "Resolved",
    fill: "#10B981",
    stackId: "bar-one",
    showTopBorderRadius: () => true,
    showBottomBorderRadius: () => true,
    showPercentage: false,
    textClassName: "",
  },
];

export const TopAgentsChart = observer(function TopAgentsChart({ data, isLoading }: Props) {
  const chartData = useMemo(
    () =>
      (data ?? []).map((point) => ({
        name: point.display_name || "Unknown",
        count: point.count,
      })),
    [data]
  );

  if (isLoading) {
    return <div className="bg-layer-2 h-[260px] w-full animate-pulse rounded-lg" />;
  }

  if (!chartData.length) {
    return (
      <div className="border-subtle bg-layer-1 flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border">
        <div className="bg-layer-2 text-placeholder flex size-10 items-center justify-center rounded-full">
          <Users className="size-5" />
        </div>
        <p className="text-xs text-tertiary font-medium">No agent data for this period</p>
      </div>
    );
  }

  return (
    <BarChart
      className="h-[260px] w-full"
      data={chartData}
      bars={BARS}
      xAxis={{ key: "name", label: "Agent" }}
      yAxis={{ key: "count", label: "Resolved", offset: -50, dx: -20 }}
    />
  );
});
