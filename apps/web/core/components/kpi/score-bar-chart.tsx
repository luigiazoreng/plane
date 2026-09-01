/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { BarChart } from "@plane/propel/charts/bar-chart";
import type { TBarItem } from "@plane/types";

export type TKpiScoreDatum = {
  name: string;
  value: number;
};

type Props = {
  data: TKpiScoreDatum[];
  /** Series label shown in the tooltip, e.g. "Final score (Vf)". */
  label: string;
  /** Bars beyond this are summarised as a "+N more" note. */
  maxBars?: number;
};

const DEFAULT_MAX_BARS = 10;

/** Single-series bar chart shared by the member and project KPI breakdowns. */
export const KpiScoreBarChart = (props: Props) => {
  const { data, label, maxBars = DEFAULT_MAX_BARS } = props;

  const visible = useMemo(() => data.slice(0, maxBars), [data, maxBars]);

  const bars: TBarItem<string>[] = useMemo(
    () => [
      {
        key: "value",
        label,
        stackId: "bar-one",
        fill: "var(--text-color-accent-primary)",
        textClassName: "",
        showPercentage: false,
        showTopBorderRadius: () => true,
        showBottomBorderRadius: () => true,
      },
    ],
    [label]
  );

  if (visible.length === 0) return null;

  return (
    <div>
      <BarChart
        className="h-[220px] w-full"
        data={visible}
        bars={bars}
        margin={{ bottom: 24, left: 0 }}
        xAxis={{ key: "name", label: "" }}
        yAxis={{ key: "value", label: "" }}
      />
      {data.length > maxBars && <p className="px-page-x text-12 text-tertiary">+{data.length - maxBars} more</p>}
    </div>
  );
};
