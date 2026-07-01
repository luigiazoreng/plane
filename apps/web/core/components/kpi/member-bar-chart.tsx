/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { BarChart } from "@plane/propel/charts/bar-chart";
import type { IKpiMemberAggregate, TBarItem } from "@plane/types";

type Props = {
  results: IKpiMemberAggregate[];
};

const MAX_MEMBERS = 10;

export const KpiMemberBarChart = (props: Props) => {
  const { results } = props;

  const data = useMemo(
    () =>
      results.slice(0, MAX_MEMBERS).map((row) => ({
        name: row.display_name,
        sum_vf: row.sum_vf,
      })),
    [results]
  );

  const bars: TBarItem<string>[] = useMemo(
    () => [
      {
        key: "sum_vf",
        label: "Final score (Vf)",
        stackId: "bar-one",
        fill: "var(--text-color-accent-primary)",
        textClassName: "",
        showPercentage: false,
        showTopBorderRadius: () => true,
        showBottomBorderRadius: () => true,
      },
    ],
    []
  );

  if (data.length === 0) return null;

  return (
    <div>
      <BarChart
        className="h-[220px] w-full"
        data={data}
        bars={bars}
        margin={{ bottom: 24, left: 0 }}
        xAxis={{ key: "name", label: "" }}
        yAxis={{ key: "sum_vf", label: "" }}
      />
      {results.length > MAX_MEMBERS && (
        <p className="px-page-x text-12 text-tertiary">+{results.length - MAX_MEMBERS} more</p>
      )}
    </div>
  );
};
