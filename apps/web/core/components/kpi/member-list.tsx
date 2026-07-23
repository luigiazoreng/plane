/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Users } from "lucide-react";
import type { IKpiMemberAggregate } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { CountChips } from "./status-badge";

type Props = {
  results: IKpiMemberAggregate[];
  unassignedCount: number;
};

const fmt = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(2);

const HEAD = "h-11 bg-layer-1 px-page-x text-11 font-medium text-tertiary";

export const KpiMemberList = (props: Props) => {
  const { results, unassignedCount } = props;

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-page-x py-16 text-center">
        <Users className="size-8 text-placeholder" strokeWidth={1.5} />
        <p className="text-13 font-medium text-secondary">No scored work items with assignees yet</p>
        <p className="text-12 text-tertiary">
          Once work items are assigned and scored, each member&apos;s totals will show up here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <table className="w-full border-collapse bg-surface-1 text-13">
        <thead>
          <tr className="border-b border-subtle">
            <th className={cn(HEAD, "sticky left-0 z-10 text-left")}>Member</th>
            <th className={cn(HEAD, "text-right")}>Σ Vp</th>
            <th className={cn(HEAD, "text-right")}>Σ Vf</th>
            <th className={cn(HEAD, "text-right")}>Efficiency</th>
            <th className={cn(HEAD, "text-left")}>Status</th>
          </tr>
        </thead>
        <tbody>
          {results.map((row) => {
            const effNum = row.efficiency != null ? row.efficiency * 100 : null;
            return (
              <tr key={row.user_id} className="h-11 border-b-[0.5px] border-subtle">
                <td className="sticky left-0 z-10 max-w-[240px] truncate bg-surface-1 px-page-x">
                  <div className="flex items-center gap-2">
                    <Avatar src={getFileURL(row.avatar_url ?? "")} name={row.display_name} size="sm" />
                    <span className="truncate text-primary">{row.display_name}</span>
                  </div>
                </td>
                <td className="px-page-x text-right text-secondary tabular-nums">{fmt(row.sum_vp)}</td>
                <td className="px-page-x text-right font-medium text-primary tabular-nums">{fmt(row.sum_vf)}</td>
                <td
                  className={cn(
                    "px-page-x text-right tabular-nums",
                    effNum != null && effNum >= 100 ? "text-success-primary" : "text-warning-primary"
                  )}
                >
                  {effNum != null ? `${effNum.toFixed(1)}%` : "—"}
                </td>
                <td className="px-page-x py-1.5">
                  <CountChips counts={row.counts} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {unassignedCount > 0 && (
        <p className="px-page-x py-3 text-12 text-tertiary">
          {unassignedCount} work item{unassignedCount === 1 ? "" : "s"} without an assignee{" "}
          {unassignedCount === 1 ? "is" : "are"} not shown here.
        </p>
      )}
    </div>
  );
};
