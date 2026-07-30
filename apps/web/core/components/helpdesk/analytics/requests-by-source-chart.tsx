"use client";

import { useMemo } from "react";
import { observer } from "mobx-react";
import { PieChart as PieIcon } from "lucide-react";
import { PieChart } from "@plane/propel/charts/pie-chart";
import type { IHelpdeskSourceChartPoint } from "@plane/types";

type Props = {
  data: IHelpdeskSourceChartPoint[] | undefined;
  isLoading: boolean;
};

const SOURCE_COLORS: Record<string, string> = {
  public_form: "#3B82F6",
  internal_form: "#8B5CF6",
  unknown: "#64748B",
};

const SOURCE_LABELS: Record<string, string> = {
  public_form: "Public form",
  internal_form: "Internal form",
  unknown: "Direct / Other",
};

export const RequestsBySourceChart = observer(function RequestsBySourceChart({ data, isLoading }: Props) {
  const chartData = useMemo(
    () =>
      (data ?? []).map((point) => {
        const key = point.source ?? "unknown";
        return {
          key,
          name: SOURCE_LABELS[key] ?? key,
          value: point.count,
        };
      }),
    [data]
  );

  const cells = useMemo(
    () =>
      chartData.map((point) => ({
        key: point.key,
        label: point.name,
        fill: SOURCE_COLORS[point.key] ?? "#64748B",
      })),
    [chartData]
  );

  if (isLoading) {
    return <div className="bg-layer-2 h-[260px] w-full animate-pulse rounded-lg" />;
  }

  if (!chartData.length) {
    return (
      <div className="border-subtle bg-layer-1 flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border">
        <div className="bg-layer-2 text-placeholder flex size-10 items-center justify-center rounded-full">
          <PieIcon className="size-5" />
        </div>
        <p className="text-xs text-tertiary font-medium">No source data for this period</p>
      </div>
    );
  }

  return (
    <PieChart
      className="h-[260px] w-full"
      data={chartData}
      dataKey="value"
      cells={cells}
      showLabel={false}
      innerRadius={65}
      outerRadius={105}
      paddingAngle={2}
      legend={{
        align: "right",
        verticalAlign: "middle",
        layout: "vertical",
      }}
    />
  );
});
