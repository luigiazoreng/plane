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
import type { IKpiIssueRow } from "@plane/types";
import { Spinner } from "@plane/ui";
// components
import { KpiCurveChart } from "@/components/kpi/curve-chart";
import { KpiIssuesTable } from "@/components/kpi/issues-table";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useKpi } from "@/hooks/store/use-kpi";
import { useUserPermissions } from "@/hooks/store/user";

type StatCardProps = {
  label: string;
  value: string;
  icon: React.ElementType;
  iconClass?: string;
  valueClass?: string;
  sublabel?: string;
};

const StatCard = ({ label, value, icon: Icon, iconClass, valueClass, sublabel }: StatCardProps) => (
  <div className="border-custom-border-200 bg-custom-background-100 flex items-center gap-3 rounded-xl border px-4 py-3.5">
    <div className="bg-custom-background-90 shrink-0 rounded-lg p-2.5">
      <Icon className={`size-4 ${iconClass ?? "text-custom-text-400"}`} />
    </div>
    <div className="min-w-0">
      <p className="text-xs text-custom-text-400 truncate">{label}</p>
      <p className={`text-xl mt-0.5 font-bold tabular-nums ${valueClass ?? "text-custom-text-100"}`}>{value}</p>
      {sublabel && <p className="text-custom-text-400 text-10">{sublabel}</p>}
    </div>
  </div>
);

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

  const onTimeCount = agg ? agg.counts.on_time + agg.counts.early : 0;
  const efficiencyPct = agg?.efficiency != null ? `${(agg.efficiency * 100).toFixed(1)}%` : "—";

  return (
    <>
      <PageHead title="KPI" />
      <div className="h-full w-full overflow-y-auto p-6">
        {/* Aggregate stat cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Σ Vp" value={agg ? String(agg.sum_vp) : "—"} icon={Layers} sublabel="raw points" />
          <StatCard
            label="Σ Vf"
            value={agg ? String(agg.sum_vf) : "—"}
            icon={Award}
            iconClass="text-custom-primary-100"
            valueClass="text-custom-primary-100"
            sublabel="final score"
          />
          <StatCard
            label="Efficiency"
            value={efficiencyPct}
            icon={TrendingUp}
            iconClass="text-green-500"
            valueClass={agg?.efficiency != null && agg.efficiency >= 1 ? "text-green-600" : "text-yellow-500"}
          />
          <StatCard
            label="On time"
            value={agg ? String(onTimeCount) : "—"}
            icon={CheckCircle2}
            iconClass="text-green-500"
            valueClass="text-green-600"
          />
          <StatCard
            label="Late"
            value={agg ? String(agg.counts.late) : "—"}
            icon={AlertCircle}
            iconClass="text-red-500"
            valueClass={agg && agg.counts.late > 0 ? "text-red-600" : "text-custom-text-100"}
          />
          <StatCard label="Pending" value={agg ? String(agg.counts.pending) : "—"} icon={Clock} />
        </div>

        {/* Section header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base text-custom-text-100 font-semibold">Work item scoring</h3>
            <p className="text-xs text-custom-text-400">
              Mode: <span className="capitalize">{config.penalty_mode.replace("_", " ")}</span>
              {" · "}k = {config.k}
              {config.inherited && <span className="text-custom-text-400 ml-1">· inherited config</span>}
            </p>
          </div>
          <Link
            href={`/${workspaceSlug}/projects/${projectId}/kpi/settings`}
            className="border-custom-border-200 bg-custom-background-100 text-sm text-custom-text-200 hover:bg-custom-background-90 hover:text-custom-text-100 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition-colors"
          >
            <Settings className="size-3.5" />
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

          <div className="border-custom-border-200 bg-custom-background-100 flex flex-col rounded-xl border p-4">
            <h4 className="text-sm text-custom-text-100 mb-0.5 font-semibold">Penalty curve p(d)</h4>
            <p className="text-xs text-custom-text-400 mb-4">
              {selectedRow
                ? `${selectedRow.name} · priority ${selectedRow.priority} · b=${selectedB}`
                : "Click a row to pin it on the curve."}
            </p>
            <div className="flex-1">
              <KpiCurveChart config={config} b={selectedB || 0.25} markerD={selectedRow?.d ?? null} />
            </div>
            {!selectedRow && (
              <p className="text-custom-text-400 mt-3 text-center text-10">
                Left of d=0 is early (bonus). Right is late (penalty).
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default observer(ProjectKpiPage);
