/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, Award, CheckCircle2, Clock, Layers, Settings, TrendingUp } from "lucide-react";
import { EUserPermissionsLevel } from "@plane/constants";
import { EUserProjectRoles } from "@plane/types";
import type { IKpiAggregates, IKpiIssueRow } from "@plane/types";
import { Spinner } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { KpiCurveChart } from "@/components/kpi/curve-chart";
import { KpiIssuesTable } from "@/components/kpi/issues-table";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useKpi } from "@/hooks/store/use-kpi";
import { useUserPermissions } from "@/hooks/store/user";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString());

// ── Stat bar ─────────────────────────────────────────────────────────────────
// Flat, bordered strip that mirrors the spreadsheet header chrome: no rounded
// cards, no shadows — just dividers and semantic tokens.

type StatTone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONE_TEXT: Record<StatTone, string> = {
  neutral: "text-primary",
  accent: "text-accent-primary",
  success: "text-success-primary",
  warning: "text-warning-primary",
  danger: "text-danger-primary",
};

function Stat({
  icon: Icon,
  value,
  label,
  tone = "neutral",
}: {
  icon: typeof Layers;
  value: string;
  label: string;
  tone?: StatTone;
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

function StatBar({ agg }: { agg: IKpiAggregates | undefined }) {
  const onTime = agg ? agg.counts.on_time + agg.counts.early : null;
  const effNum = agg?.efficiency != null ? agg.efficiency * 100 : null;
  const effStr = effNum != null ? `${effNum.toFixed(1)}%` : "—";
  const isLate = agg != null && agg.counts.late > 0;
  const effHigh = effNum != null && effNum >= 100;

  return (
    <div className="flex flex-wrap divide-x divide-subtle border-b border-subtle bg-surface-1">
      <Stat icon={Layers} value={fmt(agg?.sum_vp)} label="Raw points" />
      <Stat icon={Award} value={fmt(agg?.sum_vf)} label="Final score" tone="accent" />
      <Stat icon={TrendingUp} value={effStr} label="Efficiency" tone={effHigh ? "success" : "warning"} />
      <Stat icon={CheckCircle2} value={onTime !== null ? String(onTime) : "—"} label="On time / Early" tone="success" />
      <Stat icon={AlertCircle} value={fmt(agg?.counts.late)} label="Late" tone={isLate ? "danger" : "neutral"} />
      <Stat icon={Clock} value={fmt(agg?.counts.pending)} label="Pending" />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

function ProjectKpiPage() {
  const { workspaceSlug, projectId } = useParams() as { workspaceSlug: string; projectId: string };
  const { projectConfig, issues, aggregates, fetchProjectConfig, fetchProjectIssues } = useKpi();
  const { getProjectEstimates } = useProjectEstimates();
  const { allowPermissions } = useUserPermissions();

  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<IKpiIssueRow | null>(null);

  const config = projectConfig[projectId];
  const rows = issues[projectId] ?? [];
  const agg = aggregates[projectId];

  const canEdit = allowPermissions(
    [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    // Difficulty is the issue's native estimate -> preload so the dropdown can
    // resolve and display the currently selected estimate value.
    getProjectEstimates(workspaceSlug, projectId).catch(() => {});
    Promise.all([fetchProjectConfig(workspaceSlug, projectId), fetchProjectIssues(workspaceSlug, projectId)]).finally(
      () => mounted && setLoading(false)
    );
    return () => {
      mounted = false;
    };
  }, [workspaceSlug, projectId, fetchProjectConfig, fetchProjectIssues, getProjectEstimates]);

  const selectedB = useMemo(() => {
    if (!config || !selectedRow) return 0;
    return config.tables.priority?.[selectedRow.priority]?.b ?? 0;
  }, [config, selectedRow]);

  if (loading || !config) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <PageHead title="KPI" />
      <div className="flex h-full w-full flex-col overflow-hidden bg-surface-1">
        <StatBar agg={agg} />

        {/* Section header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-subtle px-page-x">
          <div className="flex items-baseline gap-2 truncate">
            <h3 className="text-13 font-medium text-primary">Work item scoring</h3>
            <span className="truncate text-12 text-tertiary">
              <span className="capitalize">{config.penalty_mode.replace("_", " ")}</span>
              {" · "}k = {config.k}
              {config.inherited && " · inherited config"}
            </span>
          </div>
          <Link
            href={`/${workspaceSlug}/projects/${projectId}/kpi/settings`}
            className="flex items-center gap-1.5 rounded text-12 font-medium text-secondary transition-colors hover:text-primary"
          >
            <Settings className="size-3.5" />
            Settings
          </Link>
        </div>

        {/* Table + curve */}
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="vertical-scrollbar horizontal-scrollbar scrollbar-lg min-h-0 flex-1 overflow-auto">
            <KpiIssuesTable
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              rows={rows}
              config={config}
              canEdit={canEdit}
              onSelectRow={setSelectedRow}
              selectedRowId={selectedRow?.id ?? null}
            />
          </div>

          {/* Penalty curve */}
          <div className="flex shrink-0 flex-col border-t border-subtle bg-surface-1 lg:w-[360px] lg:border-t-0 lg:border-l">
            <div className="flex h-11 shrink-0 flex-col justify-center border-b border-subtle px-page-x">
              <h4 className="text-13 font-medium text-primary">Penalty curve p(d)</h4>
              <p className="truncate text-12 text-tertiary">
                {selectedRow ? `${selectedRow.name} · b = ${selectedB}` : "Click a row to mark its position"}
              </p>
            </div>
            <div className="p-page-x">
              <KpiCurveChart config={config} b={selectedB || 0.25} markerD={selectedRow?.d ?? null} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default observer(ProjectKpiPage);
