/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import { Users } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import type { IExecutiveMember } from "./helpers";
import { PROFILE_CONFIG } from "./helpers";

type Props = {
  members: IExecutiveMember[];
};

const fmt = (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}%`);

/** Raw KPI point totals, rendered as "Vf / Vp" -- integers stay bare, fractions get 2 decimals. */
const fmtPoints = (value: number | null) =>
  value == null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(2);

const HEAD = "h-11 bg-layer-1 px-page-x text-11 font-medium text-tertiary";

export const ExecutiveMemberTable: React.FC<Props> = ({ members }) => {
  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 bg-surface-1 px-page-x py-16 text-center">
        <Users className="size-8 text-placeholder" strokeWidth={1.5} />
        <p className="text-13 font-medium text-secondary">No team performance data available</p>
        <p className="text-12 text-tertiary">
          Team performance scores will appear once Helpdesk and KPI data is generated.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-subtle bg-surface-1">
      <table className="w-full border-collapse text-13">
        <thead>
          <tr className="border-b border-subtle">
            <th className={cn(HEAD, "w-12 text-center")}>#</th>
            <th className={cn(HEAD, "sticky left-0 z-10 text-left")}>Member</th>
            <th className={cn(HEAD, "text-right")}>
              <Tooltip tooltipContent="Total items this member is carrying: delivered + pending KPI work items, plus Helpdesk tickets. Informational only -- it never affects the Score column.">
                <span>Workload</span>
              </Tooltip>
            </th>
            <th className={cn(HEAD, "text-center")}>Profile</th>
            <th className={cn(HEAD, "text-right")}>
              <Tooltip tooltipContent="Raw KPI point totals behind the Projects Efficiency %: final value (after delay penalties) over planned value. Both scale with delivered volume, so compare the % — not these totals — between members.">
                <span>Σ Vf / Σ Vp</span>
              </Tooltip>
            </th>
            <th className={cn(HEAD, "text-right")}>Helpdesk Efficiency</th>
            <th className={cn(HEAD, "text-right")}>Projects Efficiency</th>
            <th className={cn(HEAD, "text-right")}>Score</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member, idx) => {
            const profileCfg = PROFILE_CONFIG[member.profile];
            const scoreNum = member.finalScore;
            return (
              <tr
                key={member.userId}
                className="h-11 border-b-[0.5px] border-subtle transition-colors hover:bg-surface-2"
              >
                {/* Rank */}
                <td className="w-12 text-center text-12 text-tertiary tabular-nums">{idx + 1}</td>

                {/* Member avatar + name */}
                <td className="sticky left-0 z-10 max-w-[240px] truncate bg-surface-1 px-page-x">
                  <div className="flex items-center gap-2">
                    <Avatar src={getFileURL(member.avatarUrl ?? "")} name={member.displayName} size="sm" />
                    <span className="truncate font-medium text-primary">{member.displayName}</span>
                  </div>
                </td>

                {/* Workload */}
                <td className="px-page-x text-right text-secondary tabular-nums">{member.workload}</td>

                {/* Profile tag */}
                <td className="px-page-x text-center">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-11 font-medium",
                      profileCfg.bg,
                      profileCfg.color
                    )}
                  >
                    {profileCfg.label}
                  </span>
                </td>

                {/* Raw KPI point totals behind the Projects Efficiency % */}
                <td className="px-page-x text-right text-tertiary tabular-nums">
                  {member.sumVp == null && member.sumVf == null ? (
                    "—"
                  ) : (
                    <>
                      <span className="text-secondary">{fmtPoints(member.sumVf)}</span>
                      {" / "}
                      {fmtPoints(member.sumVp)}
                    </>
                  )}
                </td>

                {/* HD Score */}
                <td className="px-page-x text-right text-secondary tabular-nums">
                  {member.hdScore != null ? (
                    <div>
                      <span>{fmt(member.hdScore)}</span>
                      {member.hdTickets != null && (
                        <span className="ml-1 text-11 text-tertiary">({member.hdTickets} tkts)</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-tertiary">—</span>
                  )}
                </td>

                {/* KPI Score */}
                <td className="px-page-x text-right text-secondary tabular-nums">{fmt(member.kpiScore)}</td>

                {/* Final Score */}
                <td
                  className={cn(
                    "px-page-x text-right font-semibold tabular-nums",
                    scoreNum >= 90
                      ? "text-success-primary"
                      : scoreNum >= 70
                        ? "text-warning-primary"
                        : "text-danger-primary"
                  )}
                >
                  {scoreNum.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
