/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { Gauge } from "lucide-react";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { ProjectIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { IKpiWorkspaceProjectRow } from "@plane/types";
import { cn } from "@plane/utils";
import { CountChips } from "./status-badge";

type Props = {
  workspaceSlug: string;
  results: IKpiWorkspaceProjectRow[];
};

const fmt = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(2);

const pct = (value: number | null) => (value != null ? `${(value * 100).toFixed(1)}%` : "—");

const HEAD = "h-11 bg-layer-1 px-page-x text-11 font-medium text-tertiary";

export const KpiProjectList = (props: Props) => {
  const { workspaceSlug, results } = props;

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-page-x py-16 text-center">
        <Gauge className="size-8 text-placeholder" strokeWidth={1.5} />
        <p className="text-13 font-medium text-secondary">No project has the KPI panel enabled</p>
        <p className="text-12 text-tertiary">
          Turn KPI on under Settings &rsaquo; Projects &rsaquo; Features to include a project here.
        </p>
      </div>
    );
  }

  return (
    <table className="w-full border-collapse bg-surface-1 text-13">
      <thead>
        <tr className="border-b border-subtle">
          <th className={cn(HEAD, "sticky left-0 z-10 text-left")}>Project</th>
          <th className={cn(HEAD, "text-right")}>Efficiency</th>
          <th className={cn(HEAD, "text-right")}>
            <Tooltip tooltipContent="This project's share of the unified KPI: efficiency × items ÷ total items.">
              <span>Contribution</span>
            </Tooltip>
          </th>
          <th className={cn(HEAD, "text-right")}>Scored</th>
          <th className={cn(HEAD, "text-right")}>Σ Vp</th>
          <th className={cn(HEAD, "text-right")}>Σ Vf</th>
          <th className={cn(HEAD, "text-left")}>Status</th>
        </tr>
      </thead>
      <tbody>
        {results.map((row) => {
          const effNum = row.efficiency != null ? row.efficiency * 100 : null;
          return (
            <tr key={row.project_id} className="group h-11 border-b-[0.5px] border-subtle hover:bg-layer-1">
              <td className="sticky left-0 z-10 max-w-70 truncate bg-surface-1 px-page-x group-hover:bg-layer-1">
                <Link
                  href={`/${workspaceSlug}/projects/${row.project_id}/kpi`}
                  className="flex items-center gap-2 text-primary hover:text-accent-primary"
                >
                  <span className="grid size-4 shrink-0 place-items-center">
                    {row.logo_props ? <Logo logo={row.logo_props} size={16} /> : <ProjectIcon className="size-4" />}
                  </span>
                  <span className="truncate">{row.name}</span>
                  <span className="shrink-0 text-11 text-tertiary">{row.identifier}</span>
                  {row.inherited_config && (
                    <Tooltip tooltipContent="Uses the workspace default KPI configuration.">
                      <span className="shrink-0 rounded bg-layer-1 px-1.5 py-0.5 text-10 text-tertiary">inherited</span>
                    </Tooltip>
                  )}
                </Link>
              </td>
              <td
                className={cn(
                  "px-page-x text-right font-medium tabular-nums",
                  effNum == null
                    ? "text-tertiary"
                    : effNum >= 100
                      ? "text-success-primary"
                      : "text-warning-primary"
                )}
              >
                {pct(row.efficiency)}
              </td>
              <td className="px-page-x text-right text-secondary tabular-nums">{pct(row.contribution)}</td>
              <td className="px-page-x text-right text-secondary tabular-nums">{row.scored_items}</td>
              <td className="px-page-x text-right text-secondary tabular-nums">{fmt(row.sum_vp)}</td>
              <td className="px-page-x text-right text-primary tabular-nums">{fmt(row.sum_vf)}</td>
              <td className="px-page-x py-1.5">
                <CountChips counts={row.counts} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
