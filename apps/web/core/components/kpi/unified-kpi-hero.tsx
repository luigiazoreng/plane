/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Info } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import type { IKpiUnifiedSummary } from "@plane/types";
import { cn } from "@plane/utils";

type Props = {
  unified: IKpiUnifiedSummary;
};

const METHOD_EXPLANATION =
  "Each project's efficiency (Vf ÷ Vp) is dimensionless, so it can be compared across projects. " +
  "The workspace KPI is the average of those efficiencies weighted by how many scored work items " +
  "each project contributed. Raw point totals are not summed: every project configures its own " +
  "point tables, so summing them would let the project with the largest scale dominate.";

export const UnifiedKpiHero = (props: Props) => {
  const { unified } = props;

  const pct = unified.kpi != null ? unified.kpi * 100 : null;
  const excluded = unified.project_count - unified.projects_in_average;

  return (
    <div className="flex flex-wrap items-end justify-between gap-6 border-b border-subtle bg-surface-1 px-page-x py-6">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="text-12 font-medium tracking-wide text-tertiary uppercase">Unified workspace KPI</h2>
          <Tooltip tooltipContent={METHOD_EXPLANATION} position="bottom">
            <Info className="size-3.5 shrink-0 text-tertiary" />
          </Tooltip>
        </div>
        <p
          className={cn(
            "mt-2 text-40 leading-none font-semibold tabular-nums",
            pct == null ? "text-tertiary" : pct >= 100 ? "text-success-primary" : "text-accent-primary"
          )}
        >
          {pct != null ? `${pct.toFixed(1)}%` : "—"}
        </p>
        <p className="mt-2 text-12 text-tertiary">
          Item-weighted average of project efficiency · {unified.scored_items} scored work item
          {unified.scored_items === 1 ? "" : "s"}
        </p>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <dt className="text-11 text-tertiary">Active KPIs</dt>
          <dd className="mt-1 text-16 font-medium text-primary tabular-nums">{unified.project_count}</dd>
        </div>
        <div>
          <dt className="text-11 text-tertiary">In the average</dt>
          <dd className="mt-1 text-16 font-medium text-primary tabular-nums">
            {unified.projects_in_average}
            {excluded > 0 && <span className="ml-1.5 text-12 font-normal text-tertiary">({excluded} unscored)</span>}
          </dd>
        </div>
        <div>
          <dt className="text-11 text-tertiary">Late</dt>
          <dd
            className={cn(
              "mt-1 text-16 font-medium tabular-nums",
              unified.counts.late > 0 ? "text-danger-primary" : "text-primary"
            )}
          >
            {unified.counts.late}
          </dd>
        </div>
        <div>
          <dt className="text-11 text-tertiary">Pending</dt>
          <dd className="mt-1 text-16 font-medium text-primary tabular-nums">{unified.counts.pending}</dd>
        </div>
      </dl>
    </div>
  );
};
