/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertCircle, Award, CheckCircle2, Clock, Layers, TrendingUp } from "lucide-react";
import type { IKpiAggregates } from "@plane/types";
import { cn } from "@plane/utils";

// Flat, bordered strip that mirrors the spreadsheet header chrome: no rounded
// cards, no shadows — just dividers and semantic tokens.

export type TKpiStatTone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONE_TEXT: Record<TKpiStatTone, string> = {
  neutral: "text-primary",
  accent: "text-accent-primary",
  success: "text-success-primary",
  warning: "text-warning-primary",
  danger: "text-danger-primary",
};

export const fmtStat = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString();

export function KpiStat({
  icon: Icon,
  value,
  label,
  tone = "neutral",
}: {
  icon: typeof Layers;
  value: string;
  label: string;
  tone?: TKpiStatTone;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-page-x py-4">
      <Icon className={cn("size-4 shrink-0", tone === "neutral" ? "text-tertiary" : TONE_TEXT[tone])} />
      <div className="min-w-0">
        <p className={cn("text-20 leading-none font-semibold tabular-nums", TONE_TEXT[tone])}>{value}</p>
        <p className="mt-1.5 truncate text-12 text-tertiary">{label}</p>
      </div>
    </div>
  );
}

type Props = {
  agg: IKpiAggregates | undefined;
  /** Labels the point totals as mixed-scale — set on the workspace panel, where
   * Vp/Vf come from projects with independent point tables. */
  mixedScale?: boolean;
};

export function KpiStatBar(props: Props) {
  const { agg, mixedScale = false } = props;
  const onTime = agg ? agg.counts.on_time + agg.counts.early : null;
  const effNum = agg?.efficiency != null ? agg.efficiency * 100 : null;
  const effStr = effNum != null ? `${effNum.toFixed(1)}%` : "—";
  const isLate = agg != null && agg.counts.late > 0;
  const effHigh = effNum != null && effNum >= 100;

  return (
    <div className="flex flex-wrap divide-x divide-subtle border-b border-subtle bg-surface-1">
      <KpiStat icon={Layers} value={fmtStat(agg?.sum_vp)} label={mixedScale ? "Raw points (mixed scales)" : "Raw points"} />
      <KpiStat
        icon={Award}
        value={fmtStat(agg?.sum_vf)}
        label={mixedScale ? "Final score (mixed scales)" : "Final score"}
        tone="accent"
      />
      <KpiStat icon={TrendingUp} value={effStr} label="Efficiency" tone={effHigh ? "success" : "warning"} />
      <KpiStat
        icon={CheckCircle2}
        value={onTime !== null ? String(onTime) : "—"}
        label="On time / Early"
        tone="success"
      />
      <KpiStat icon={AlertCircle} value={fmtStat(agg?.counts.late)} label="Late" tone={isLate ? "danger" : "neutral"} />
      <KpiStat icon={Clock} value={fmtStat(agg?.counts.pending)} label="Pending" />
    </div>
  );
}
