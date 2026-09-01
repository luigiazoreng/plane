"use client";

import { useMemo } from "react";
import { observer } from "mobx-react";
import { BarChart3 } from "lucide-react";
import { BarChart } from "@plane/propel/charts/bar-chart";
import type { IHelpdeskStatusChartPoint } from "@plane/types";

type Props = {
  data: IHelpdeskStatusChartPoint[] | undefined;
  isLoading: boolean;
};

export const RequestsByStatusChart = observer(function RequestsByStatusChart({ data, isLoading }: Props) {
  const chartData = useMemo(
    () =>
      (data ?? []).map((point) => ({
        name: point.status_name,
        count: point.count,
        color: point.color,
      })),
    [data]
  );

  const bars = useMemo(
    () => [
      {
        key: "count",
        label: "Requests",
        fill: (payload: (typeof chartData)[number]) => payload.color ?? "#60646C",
        stackId: "bar-one",
        showTopBorderRadius: () => true,
        showBottomBorderRadius: () => true,
        showPercentage: false,
        textClassName: "",
      },
    ],
    []
  );

  if (isLoading) {
    return <div className="bg-layer-2 h-[260px] w-full animate-pulse rounded-lg" />;
  }

  if (!chartData.length) {
    return (
      <div className="border-subtle bg-layer-2 flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border">
        <div className="bg-layer-3 text-tertiary flex size-10 items-center justify-center rounded-full">
          <BarChart3 className="size-5" />
        </div>
        <p className="text-xs text-secondary font-medium">No status data for this period</p>
      </div>
    );
  }

  return (
    <BarChart
      className="h-[260px] w-full"
      data={chartData}
      bars={bars}
      xAxis={{ key: "name", label: "Status" }}
      yAxis={{ key: "count", label: "Requests", offset: -50, dx: -20 }}
    />
  );
});
