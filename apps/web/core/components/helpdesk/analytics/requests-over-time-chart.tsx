"use client";

import { useMemo } from "react";
import { observer } from "mobx-react";
import { CalendarX } from "lucide-react";
import { AreaChart } from "@plane/propel/charts/area-chart";
import type { IHelpdeskTimeSeriesPoint } from "@plane/types";

type Props = {
  data: IHelpdeskTimeSeriesPoint[] | undefined;
  isLoading: boolean;
};

const AREAS = [
  {
    key: "count",
    label: "Requests",
    fill: "#3B82F626",
    fillOpacity: 1,
    stackId: "bar-one",
    showDot: false,
    smoothCurves: true,
    strokeColor: "#3B82F6",
    strokeOpacity: 1,
  },
];

export const RequestsOverTimeChart = observer(function RequestsOverTimeChart({ data, isLoading }: Props) {
  const chartData = useMemo(
    () =>
      (data ?? []).map((point) => ({
        name: point.date,
        count: point.count,
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
          <CalendarX className="size-5" />
        </div>
        <p className="text-xs text-secondary font-medium">No request data for this period</p>
      </div>
    );
  }

  return (
    <AreaChart
      className="h-[260px] w-full"
      data={chartData}
      areas={AREAS}
      xAxis={{ key: "name", label: "Date" }}
      yAxis={{ key: "count", label: "Requests", offset: -50, dx: -20 }}
    />
  );
});
