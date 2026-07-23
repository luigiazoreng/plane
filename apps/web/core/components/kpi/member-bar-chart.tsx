/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import type { IKpiMemberAggregate } from "@plane/types";
import { KpiScoreBarChart } from "./score-bar-chart";

type Props = {
  results: IKpiMemberAggregate[];
};

export const KpiMemberBarChart = (props: Props) => {
  const { results } = props;

  const data = useMemo(
    () => results.map((row) => ({ name: row.display_name, value: row.sum_vf })),
    [results]
  );

  return <KpiScoreBarChart data={data} label="Final score (Vf)" />;
};
