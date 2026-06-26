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
// components
import { KpiCurveChart } from "@/components/kpi/curve-chart";
import { KpiIssuesTable } from "@/components/kpi/issues-table";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useKpi } from "@/hooks/store/use-kpi";
import { useUserPermissions } from "@/hooks/store/user";

// ── Stat cards ─────────────────────────────────────────────────────────────
// Each card is written explicitly (not via a shared dynamic-class component)
// so that all Tailwind class strings are present in the source and included
// by the JIT scanner. Accent color uses inline style to guarantee rendering.

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString());

function StatCards({ agg }: { agg: IKpiAggregates | undefined }) {
  const onTime = agg ? agg.counts.on_time + agg.counts.early : null;
  const effNum = agg?.efficiency != null ? agg.efficiency * 100 : null;
  const effStr = effNum != null ? `${effNum.toFixed(1)}%` : "—";
  const isLate = agg != null && agg.counts.late > 0;
  const effHigh = effNum != null && effNum >= 100;

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {/* Σ Vp */}
      <div className="border-custom-border-200 bg-custom-background-100 relative flex overflow-hidden rounded-xl border">
        <div
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: "var(--color-border-300, #374151)" }}
        />
        <div className="flex flex-1 items-center gap-3 py-4 pr-4 pl-5">
          <div className="bg-custom-background-80 shrink-0 rounded-lg p-2.5">
            <Layers className="text-custom-text-400 size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl text-custom-text-100 leading-none font-bold tabular-nums">{fmt(agg?.sum_vp)}</p>
            <p className="text-xs text-custom-text-400 mt-1 truncate">Raw points</p>
          </div>
        </div>
      </div>

      {/* Σ Vf */}
      <div className="border-custom-border-200 bg-custom-background-100 relative flex overflow-hidden rounded-xl border">
        <div className="bg-custom-primary-100 absolute inset-y-0 left-0 w-1" />
        <div className="flex flex-1 items-center gap-3 py-4 pr-4 pl-5">
          <div className="bg-custom-primary-100/10 shrink-0 rounded-lg p-2.5">
            <Award className="text-custom-primary-100 size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl text-custom-primary-100 leading-none font-bold tabular-nums">{fmt(agg?.sum_vf)}</p>
            <p className="text-xs text-custom-text-400 mt-1 truncate">Final score</p>
          </div>
        </div>
      </div>

      {/* Efficiency */}
      <div className="border-custom-border-200 bg-custom-background-100 relative flex overflow-hidden rounded-xl border">
        <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: effHigh ? "#22c55e" : "#eab308" }} />
        <div className="flex flex-1 items-center gap-3 py-4 pr-4 pl-5">
          <div
            className="shrink-0 rounded-lg p-2.5"
            style={{ backgroundColor: effHigh ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)" }}
          >
            <TrendingUp className="size-4" style={{ color: effHigh ? "#22c55e" : "#eab308" }} />
          </div>
          <div className="min-w-0">
            <p
              className="text-2xl leading-none font-bold tabular-nums"
              style={{ color: effHigh ? "#22c55e" : "#eab308" }}
            >
              {effStr}
            </p>
            <p className="text-xs text-custom-text-400 mt-1 truncate">Efficiency</p>
          </div>
        </div>
      </div>

      {/* On time */}
      <div className="border-custom-border-200 bg-custom-background-100 relative flex overflow-hidden rounded-xl border">
        <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: "#22c55e" }} />
        <div className="flex flex-1 items-center gap-3 py-4 pr-4 pl-5">
          <div className="shrink-0 rounded-lg p-2.5" style={{ backgroundColor: "rgba(34,197,94,0.1)" }}>
            <CheckCircle2 className="size-4" style={{ color: "#22c55e" }} />
          </div>
          <div className="min-w-0">
            <p className="text-2xl leading-none font-bold tabular-nums" style={{ color: "#22c55e" }}>
              {onTime !== null ? String(onTime) : "—"}
            </p>
            <p className="text-xs text-custom-text-400 mt-1 truncate">On time / Early</p>
          </div>
        </div>
      </div>

      {/* Late */}
      <div className="border-custom-border-200 bg-custom-background-100 relative flex overflow-hidden rounded-xl border">
        <div
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: isLate ? "#ef4444" : "var(--color-border-300, #374151)" }}
        />
        <div className="flex flex-1 items-center gap-3 py-4 pr-4 pl-5">
          <div
            className="shrink-0 rounded-lg p-2.5"
            style={{ backgroundColor: isLate ? "rgba(239,68,68,0.1)" : undefined }}
          >
            <AlertCircle
              className={`size-4 ${isLate ? "" : "text-custom-text-400"}`}
              style={isLate ? { color: "#ef4444" } : undefined}
            />
          </div>
          <div className="min-w-0">
            <p
              className={`text-2xl leading-none font-bold tabular-nums ${isLate ? "" : "text-custom-text-300"}`}
              style={isLate ? { color: "#ef4444" } : undefined}
            >
              {fmt(agg?.counts.late)}
            </p>
            <p className="text-xs text-custom-text-400 mt-1 truncate">Late</p>
          </div>
        </div>
      </div>

      {/* Pending */}
      <div className="border-custom-border-200 bg-custom-background-100 relative flex overflow-hidden rounded-xl border">
        <div
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: "var(--color-border-300, #374151)" }}
        />
        <div className="flex flex-1 items-center gap-3 py-4 pr-4 pl-5">
          <div className="bg-custom-background-80 shrink-0 rounded-lg p-2.5">
            <Clock className="text-custom-text-400 size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl text-custom-text-300 leading-none font-bold tabular-nums">
              {fmt(agg?.counts.pending)}
            </p>
            <p className="text-xs text-custom-text-400 mt-1 truncate">Pending</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

function ProjectKpiPage() {
  const { workspaceSlug, projectId } = useParams() as { workspaceSlug: string; projectId: string };
  const { projectConfig, issues, aggregates, fetchProjectConfig, fetchProjectIssues } = useKpi();
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
    Promise.all([fetchProjectConfig(workspaceSlug, projectId), fetchProjectIssues(workspaceSlug, projectId)]).finally(
      () => mounted && setLoading(false)
    );
    return () => {
      mounted = false;
    };
  }, [workspaceSlug, projectId, fetchProjectConfig, fetchProjectIssues]);

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
      <div className="h-full w-full overflow-y-auto p-6">
        <StatCards agg={agg} />

        {/* Section header */}
        <div className="border-custom-border-200 mb-3 flex items-center justify-between border-t pt-4">
          <div>
            <h3 className="text-sm text-custom-text-100 font-semibold">Work item scoring</h3>
            <p className="text-xs text-custom-text-400 mt-0.5">
              <span className="capitalize">{config.penalty_mode.replace("_", " ")}</span>
              {" · "}k = {config.k}
              {config.inherited && " · inherited config"}
            </p>
          </div>
          <Link
            href={`/${workspaceSlug}/projects/${projectId}/kpi/settings`}
            className="border-custom-border-200 bg-custom-background-90 text-xs text-custom-text-300 hover:bg-custom-background-80 hover:text-custom-text-100 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium transition-colors"
          >
            <Settings className="size-3" />
            Settings
          </Link>
        </div>

        {/* Table + Curve */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="border-custom-border-200 bg-custom-background-100 overflow-hidden rounded-xl border">
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

          <div className="border-custom-border-200 bg-custom-background-100 flex flex-col overflow-hidden rounded-xl border">
            <div className="border-custom-border-200 bg-custom-background-90 border-b px-4 py-3">
              <h4 className="text-sm text-custom-text-100 font-semibold">Penalty curve p(d)</h4>
              <p className="text-xs text-custom-text-400 mt-0.5 truncate">
                {selectedRow ? `${selectedRow.name} · b = ${selectedB}` : "Click a row to mark its position"}
              </p>
            </div>
            <div className="flex-1 p-4">
              <KpiCurveChart config={config} b={selectedB || 0.25} markerD={selectedRow?.d ?? null} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default observer(ProjectKpiPage);
