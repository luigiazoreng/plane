/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import { Info } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import type { IITGeneralIndex } from "./helpers";

type Props = {
  data: IITGeneralIndex;
  period: "30d" | "90d";
  onPeriodChange: (period: "30d" | "90d") => void;
};

export const ITGeneralIndex: React.FC<Props> = ({ data, period, onPeriodChange }) => {
  const { index, components, missing } = data;

  const tooltipContent = components
    .map((c) =>
      c.value != null
        ? `${c.label}: ${c.value.toFixed(1)}% × ${(c.effectiveWeight * 100).toFixed(0)}% = ${c.contribution.toFixed(1)}%`
        : `${c.label}: N/A (weight redistributed)`
    )
    .join("\n");

  const pct = index;

  return (
    <div className="border-b border-subtle bg-surface-1">
      {/* Hero section */}
      <div className="flex flex-wrap items-end justify-between gap-6 px-page-x py-6">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-12 font-medium tracking-wide text-tertiary uppercase">IT General Index</h2>
            <Tooltip tooltipContent={tooltipContent} position="bottom">
              <Info className="size-3.5 shrink-0 cursor-help text-tertiary" />
            </Tooltip>
          </div>
          <p
            className={cn(
              "mt-2 text-40 leading-none font-semibold tabular-nums",
              pct == null
                ? "text-tertiary"
                : pct >= 90
                  ? "text-success-primary"
                  : pct >= 70
                    ? "text-warning-primary"
                    : "text-danger-primary"
            )}
          >
            {pct != null ? `${pct.toFixed(1)}%` : "—"}
          </p>
          <p className="mt-2 text-12 text-tertiary">
            Composite index derived from Helpdesk SLAs & Engineering KPIs
            {missing.length > 0 &&
              ` · ${missing.length} indicator${missing.length > 1 ? "s" : ""} missing (redistributed)`}
          </p>
        </div>

        {/* Right side: Period selector + Indicators breakdown */}
        <div className="flex flex-col items-end gap-4">
          <div
            className="flex items-center gap-1 rounded-md border border-subtle bg-surface-2 p-0.5"
            role="group"
            aria-label="Reporting period"
          >
            <button
              type="button"
              onClick={() => onPeriodChange("30d")}
              className={cn(
                "rounded px-2.5 py-1 text-11 font-medium transition-colors",
                period === "30d"
                  ? "shadow-xs bg-surface-1 font-semibold text-primary"
                  : "text-tertiary hover:text-secondary"
              )}
            >
              30 days
            </button>
            <button
              type="button"
              onClick={() => onPeriodChange("90d")}
              className={cn(
                "rounded px-2.5 py-1 text-11 font-medium transition-colors",
                period === "90d"
                  ? "shadow-xs bg-surface-1 font-semibold text-primary"
                  : "text-tertiary hover:text-secondary"
              )}
            >
              90 days
            </button>
          </div>

          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {components.map((c) => (
              <div key={c.key}>
                <dt className="text-11 text-tertiary">{c.label}</dt>
                <dd className="mt-1 text-16 font-medium text-primary tabular-nums">
                  {c.value != null ? (
                    <>
                      {c.value.toFixed(1)}%
                      <span className="ml-1 text-11 text-tertiary">({(c.effectiveWeight * 100).toFixed(0)}%)</span>
                    </>
                  ) : (
                    <span className="text-tertiary">—</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Progress / Contribution Bar */}
      {index != null && (
        <div className="flex h-1.5 w-full overflow-hidden border-t border-subtle bg-surface-2">
          {components
            .filter((c) => c.value != null && c.effectiveWeight > 0)
            .map((c, i) => {
              const colors = ["bg-indigo-500", "bg-sky-500", "bg-teal-500", "bg-emerald-500", "bg-amber-500"];
              return (
                <Tooltip key={c.key} tooltipContent={`${c.label}: ${c.contribution.toFixed(1)}%`} position="top">
                  <div
                    className={cn("h-full transition-all duration-300", colors[i % colors.length])}
                    style={{ width: `${(c.contribution / index) * 100}%` }}
                  />
                </Tooltip>
              );
            })}
        </div>
      )}
    </div>
  );
};
