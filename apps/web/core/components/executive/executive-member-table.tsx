/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useState } from "react";
import { Users, AlertCircle, CheckCircle2 } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import type { IExecutiveMember, IKpiSettings } from "./helpers";
import { PROFILE_CONFIG, DEFAULT_KPI_SETTINGS } from "./helpers";

type Props = {
  members: IExecutiveMember[];
  settings?: IKpiSettings;
};

const fmt = (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}%`);

const fmtPoints = (value: number | null) =>
  value == null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(2);

const HEAD = "h-11 bg-layer-1 px-3 text-11 font-medium text-tertiary";

export const ExecutiveMemberTable: React.FC<Props> = ({ members, settings = DEFAULT_KPI_SETTINGS }) => {
  const [tab, setTab] = useState<"all" | "ranked" | "insufficient">("all");

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

  const rankedMembers = members.filter((m) => m.sampleStatus === "sufficient");
  const insufficientMembers = members.filter((m) => m.sampleStatus === "insufficient");

  const displayedMembers = tab === "ranked" ? rankedMembers : tab === "insufficient" ? insufficientMembers : members;

  return (
    <div className="flex flex-col gap-4">
      {/* Tab Filter Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-md bg-surface-2 p-1 text-12">
          <button
            onClick={() => setTab("all")}
            className={cn(
              "rounded px-3 py-1 font-medium transition-colors",
              tab === "all" ? "shadow-sm bg-surface-1 text-primary" : "text-tertiary hover:text-primary"
            )}
          >
            All Members ({members.length})
          </button>
          <button
            onClick={() => setTab("ranked")}
            className={cn(
              "rounded px-3 py-1 font-medium transition-colors",
              tab === "ranked" ? "shadow-sm bg-surface-1 text-primary" : "text-tertiary hover:text-primary"
            )}
          >
            Official Ranking ({rankedMembers.length})
          </button>
          <button
            onClick={() => setTab("insufficient")}
            className={cn(
              "flex items-center gap-1 rounded px-3 py-1 font-medium transition-colors",
              tab === "insufficient" ? "shadow-sm bg-surface-1 text-primary" : "text-tertiary hover:text-primary"
            )}
          >
            <AlertCircle className="size-3.5 text-warning-primary" />
            <span>Insufficient Sample ({insufficientMembers.length})</span>
          </button>
        </div>

        <div className="text-11 text-tertiary">
          Min. Project Sample:{" "}
          <span className="font-semibold text-secondary">{settings.minimumProjectSample} items</span> | Min. Helpdesk
          Sample: <span className="font-semibold text-secondary">{settings.minimumHelpdeskSample} tickets</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto rounded-md border border-subtle bg-surface-1">
        <table className="w-full border-collapse text-12">
          <thead>
            <tr className="border-b border-subtle">
              <th className={cn(HEAD, "w-10 text-center")}>#</th>
              <th className={cn(HEAD, "sticky left-0 z-10 min-w-[160px] text-left")}>Member</th>
              <th className={cn(HEAD, "text-center")}>Profile</th>
              <th className={cn(HEAD, "text-right")}>
                <Tooltip tooltipContent="Project Efficiency = Σ Vf / Σ Vp × 100. Target >= 95%">
                  <span>Proj. Eff.</span>
                </Tooltip>
              </th>
              <th className={cn(HEAD, "text-right")}>Delivered</th>
              <th className={cn(HEAD, "text-right")}>
                <Tooltip tooltipContent="Σ Vp: Total planned value delivered">
                  <span>Σ Vp</span>
                </Tooltip>
              </th>
              <th className={cn(HEAD, "text-right")}>
                <Tooltip tooltipContent="Σ Vf: Final preserved value after delay penalties">
                  <span>Σ Vf</span>
                </Tooltip>
              </th>
              <th className={cn(HEAD, "text-right")}>
                <Tooltip tooltipContent="Delivery Reliability = (Early + On time) / Delivered × 100. Target >= 95%">
                  <span>On-time %</span>
                </Tooltip>
              </th>
              <th className={cn(HEAD, "text-right")}>Tickets</th>
              <th className={cn(HEAD, "text-right")}>
                <Tooltip tooltipContent="Helpdesk First Response SLA compliance. Target >= 90%">
                  <span>FR SLA</span>
                </Tooltip>
              </th>
              <th className={cn(HEAD, "text-right")}>
                <Tooltip tooltipContent="Helpdesk Resolution SLA compliance. Target >= 90%">
                  <span>Res SLA</span>
                </Tooltip>
              </th>
              <th className={cn(HEAD, "text-right")}>
                <Tooltip tooltipContent="Multi-factor Project Score (50% Efficiency + 30% Throughput + 20% Reliability)">
                  <span>Proj Score</span>
                </Tooltip>
              </th>
              <th className={cn(HEAD, "text-right")}>
                <Tooltip tooltipContent="Helpdesk Quality Score (40% FR SLA + 60% Res SLA)">
                  <span>HD Score</span>
                </Tooltip>
              </th>
              <th className={cn(HEAD, "text-right")}>
                <Tooltip tooltipContent="Final Composite Performance Score">
                  <span>Final Score</span>
                </Tooltip>
              </th>
              <th className={cn(HEAD, "text-center")}>Sample Status</th>
            </tr>
          </thead>
          <tbody>
            {displayedMembers.map((member) => {
              const profileCfg = PROFILE_CONFIG[member.profile];
              const isSufficient = member.sampleStatus === "sufficient";

              // Traffic light coloring for Project Efficiency
              const effVal = member.kpiEfficiency != null ? member.kpiEfficiency * 100 : null;
              const effColor =
                effVal == null
                  ? "text-tertiary"
                  : effVal >= settings.projectEfficiencyTarget
                    ? "text-success-primary font-medium"
                    : effVal >= settings.projectEfficiencyTarget - 5
                      ? "text-warning-primary font-medium"
                      : "text-danger-primary font-medium";

              // Traffic light coloring for Delivery Reliability
              const relVal = member.deliveryReliability;
              const relColor =
                relVal == null
                  ? "text-tertiary"
                  : relVal >= settings.deliveryReliabilityTarget
                    ? "text-success-primary font-medium"
                    : relVal >= settings.deliveryReliabilityTarget - 5
                      ? "text-warning-primary font-medium"
                      : "text-danger-primary font-medium";

              // Traffic light coloring for SLAs
              const frVal = member.hdSlaFirstResponse;
              const frColor =
                frVal == null
                  ? "text-tertiary"
                  : frVal >= settings.firstResponseSlaTarget
                    ? "text-success-primary"
                    : "text-danger-primary";

              const resVal = member.hdSlaResolution;
              const resColor =
                resVal == null
                  ? "text-tertiary"
                  : resVal >= settings.resolutionSlaTarget
                    ? "text-success-primary"
                    : "text-danger-primary";

              const scoreNum = member.finalScore;

              return (
                <tr
                  key={member.userId}
                  className={cn(
                    "h-11 border-b-[0.5px] border-subtle transition-colors hover:bg-surface-2",
                    !isSufficient && "bg-surface-2/40 opacity-85"
                  )}
                >
                  {/* Rank */}
                  <td className="w-10 text-center text-11 font-semibold text-tertiary tabular-nums">
                    {member.rank != null ? `#${member.rank}` : "—"}
                  </td>

                  {/* Member avatar + name */}
                  <td className="sticky left-0 z-10 max-w-[200px] truncate bg-surface-1 px-3">
                    <div className="flex items-center gap-2">
                      <Avatar src={getFileURL(member.avatarUrl ?? "")} name={member.displayName} size="sm" />
                      <span className="truncate font-medium text-primary">{member.displayName}</span>
                    </div>
                  </td>

                  {/* Profile tag */}
                  <td className="px-3 text-center">
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

                  {/* Project Efficiency */}
                  <td className={cn("px-3 text-right tabular-nums", effColor)}>{fmt(effVal)}</td>

                  {/* Delivered Items */}
                  <td className="px-3 text-right font-medium text-secondary tabular-nums">{member.kpiScoredItems}</td>

                  {/* Σ Vp */}
                  <td className="px-3 text-right text-tertiary tabular-nums">{fmtPoints(member.sumVp)}</td>

                  {/* Σ Vf */}
                  <td className="px-3 text-right font-medium text-secondary tabular-nums">{fmtPoints(member.sumVf)}</td>

                  {/* Delivery Reliability % */}
                  <td className={cn("px-3 text-right tabular-nums", relColor)}>{fmt(member.deliveryReliability)}</td>

                  {/* Helpdesk Tickets */}
                  <td className="px-3 text-right font-medium text-secondary tabular-nums">{member.hdTickets ?? 0}</td>

                  {/* FR SLA */}
                  <td className={cn("px-3 text-right tabular-nums", frColor)}>{fmt(member.hdSlaFirstResponse)}</td>

                  {/* Res SLA */}
                  <td className={cn("px-3 text-right tabular-nums", resColor)}>{fmt(member.hdSlaResolution)}</td>

                  {/* Project Score */}
                  <td className="px-3 text-right font-medium text-secondary tabular-nums">{fmt(member.kpiScore)}</td>

                  {/* HD Score */}
                  <td className="px-3 text-right font-medium text-secondary tabular-nums">{fmt(member.hdScore)}</td>

                  {/* Final Score */}
                  <td
                    className={cn(
                      "px-3 text-right text-13 font-semibold tabular-nums",
                      scoreNum >= 90
                        ? "text-success-primary"
                        : scoreNum >= 70
                          ? "text-warning-primary"
                          : "text-danger-primary"
                    )}
                  >
                    {scoreNum.toFixed(1)}
                  </td>

                  {/* Sample Status Badge */}
                  <td className="px-3 text-center">
                    {isSufficient ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-primary/10 px-2 py-0.5 text-11 font-medium text-success-primary">
                        <CheckCircle2 className="size-3" />
                        <span>Sufficient</span>
                      </span>
                    ) : (
                      <Tooltip
                        tooltipContent={`Delivered ${member.kpiScoredItems}/${settings.minimumProjectSample} project items, ${member.hdTickets ?? 0}/${settings.minimumHelpdeskSample} tickets. Sample size below threshold for official ranking.`}
                      >
                        <span className="inline-flex cursor-help items-center gap-1 rounded-full bg-warning-primary/10 px-2 py-0.5 text-11 font-medium text-warning-primary">
                          <AlertCircle className="size-3" />
                          <span>Insufficient sample</span>
                        </span>
                      </Tooltip>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
