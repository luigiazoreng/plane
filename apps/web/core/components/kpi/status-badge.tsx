/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TKpiIssueStatus } from "@plane/types";
import { cn } from "@plane/utils";

export const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  on_time: { className: "bg-success-subtle text-success-primary", label: "On time" },
  early: { className: "bg-accent-subtle text-accent-primary", label: "Early" },
  late: { className: "bg-danger-subtle text-danger-primary", label: "Late" },
  pending: { className: "bg-layer-1 text-tertiary", label: "Pending" },
};

export const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
  return (
    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-11 font-medium", s.className)}>
      {s.label}
    </span>
  );
};

// Worst-first, so a late count is the first thing read in a dense table row.
const STATUS_ORDER: TKpiIssueStatus[] = ["late", "pending", "early", "on_time"];

/** Compact "<n> Late / <n> Pending / ..." chips; zero-count statuses are dropped. */
export const CountChips = ({ counts }: { counts: Record<TKpiIssueStatus, number> }) => {
  const visible = STATUS_ORDER.filter((key) => counts[key] > 0);
  if (visible.length === 0) return <span className="text-tertiary">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((key) => {
        const s = STATUS_BADGE[key];
        return (
          <span
            key={key}
            className={cn("inline-flex items-center rounded px-2 py-0.5 text-11 font-medium", s.className)}
          >
            {counts[key]} {s.label}
          </span>
        );
      })}
    </div>
  );
};
