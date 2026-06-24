"use client";

import { useMemo } from "react";
import { observer } from "mobx-react";
import { PieChart } from "@plane/propel/charts/pie-chart";
import type { IHelpdeskSourceChartPoint } from "@plane/types";

type Props = {
  data: IHelpdeskSourceChartPoint[] | undefined;
  isLoading: boolean;
};

const SOURCE_COLORS: Record<string, string> = {
  public_form: "#1192E8",
  internal_form: "#F97316",
  unknown: "#64748B",
};

const SOURCE_LABELS: Record<string, string> = {
  public_form: "Public form",
  internal_form: "Internal form",
  unknown: "Sem origem",
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
    return <div className="bg-custom-background-80 h-[260px] w-full animate-pulse rounded-lg" />;
  }

  if (!chartData.length) {
    return (
      <div className="border-custom-border-100 bg-custom-background-90 flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border">
        <span className="text-2xl">🔍</span>
        <p className="text-sm text-custom-text-400">No source data for this period</p>
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
