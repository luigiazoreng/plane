"use client";

import { useMemo } from "react";
import { observer } from "mobx-react";
import { Clock } from "lucide-react";
import { AreaChart } from "@plane/propel/charts/area-chart";
import type { IHelpdeskResolutionTrendPoint } from "@plane/types";

type Props = {
  data: IHelpdeskResolutionTrendPoint[] | undefined;
  isLoading: boolean;
};

const AREAS = [
  {
    key: "avg_hours",
    label: "Avg resolution (hours)",
    fill: "#8B5CF626",
    fillOpacity: 1,
    stackId: "bar-one",
    showDot: false,
    smoothCurves: true,
    strokeColor: "#8B5CF6",
    strokeOpacity: 1,
  },
];

export const ResolutionTimeTrendChart = observer(function ResolutionTimeTrendChart({ data, isLoading }: Props) {
  const chartData = useMemo(
    () =>
      (data ?? [])
        .filter((point) => point.avg_hours !== null)
        .map((point) => ({
          name: point.date,
          avg_hours: point.avg_hours as number,
        })),
    [data]
  );

  if (isLoading) {
    return <div className="bg-layer-2 h-[260px] w-full animate-pulse rounded-lg" />;
  }

  if (!chartData.length) {
    return (
      <div className="border-subtle bg-layer-2 flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border">
        <div className="bg-layer-3 text-tertiary flex size-10 items-center justify-center rounded-full">
          <Clock className="size-5" />
        </div>
        <p className="text-xs text-secondary font-medium">No resolution time data for this period</p>
      </div>
    );
  }

  return (
    <AreaChart
      className="h-[260px] w-full"
      data={chartData}
      areas={AREAS}
      xAxis={{ key: "name", label: "Date" }}
      yAxis={{ key: "avg_hours", label: "Avg hours", offset: -50, dx: -20 }}
    />
  );
});
