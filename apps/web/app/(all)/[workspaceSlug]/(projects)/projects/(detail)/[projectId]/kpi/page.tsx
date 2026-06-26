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
  iconClass: string;
  valueClass: string;
  accentClass: string;
  sublabel?: string;
};

const StatCard = ({ label, value, icon: Icon, iconClass, valueClass, accentClass, sublabel }: StatCardProps) => (
  <div className="border-custom-border-200 bg-custom-background-100 relative overflow-hidden rounded-xl border">
    {/* colored top accent bar */}
    <div className={`absolute inset-x-0 top-0 h-[3px] ${accentClass}`} />
    <div className="px-4 pt-5 pb-4">
      <div className="flex items-start justify-between gap-2">
        <div className={`bg-custom-background-90 ring-custom-border-200 rounded-lg p-2 ring-1`}>
          <Icon className={`size-3.5 ${iconClass}`} />
        </div>
        {sublabel && <span className="text-custom-text-400 text-10 font-medium">{sublabel}</span>}
      </div>
      <p className={`text-2xl mt-3 leading-none font-bold tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-xs text-custom-text-400 mt-1 font-medium">{label}</p>
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
  const isLate = agg && agg.counts.late > 0;
  const efficiencyHigh = agg?.efficiency != null && agg.efficiency >= 1;

  return (
    <>
      <PageHead title="KPI" />
      <div className="h-full w-full overflow-y-auto p-6">
        {/* Stat cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Raw points"
            value={agg ? String(agg.sum_vp) : "—"}
            icon={Layers}
            iconClass="text-custom-text-300"
            valueClass="text-custom-text-100"
            accentClass="bg-custom-border-300"
            sublabel="Σ Vp"
          />
          <StatCard
            label="Final score"
            value={agg ? String(agg.sum_vf) : "—"}
            icon={Award}
            iconClass="text-custom-primary-100"
            valueClass="text-custom-primary-100"
            accentClass="bg-custom-primary-100"
            sublabel="Σ Vf"
          />
          <StatCard
            label="Efficiency"
            value={efficiencyPct}
            icon={TrendingUp}
            iconClass={efficiencyHigh ? "text-green-500" : "text-yellow-500"}
            valueClass={efficiencyHigh ? "text-green-500" : "text-yellow-500"}
            accentClass={efficiencyHigh ? "bg-green-500" : "bg-yellow-400"}
          />
          <StatCard
            label="On time / Early"
            value={agg ? String(onTimeCount) : "—"}
            icon={CheckCircle2}
            iconClass="text-green-500"
            valueClass="text-green-500"
            accentClass="bg-green-500"
          />
          <StatCard
            label="Late"
            value={agg ? String(agg.counts.late) : "—"}
            icon={AlertCircle}
            iconClass={isLate ? "text-red-500" : "text-custom-text-400"}
            valueClass={isLate ? "text-red-500" : "text-custom-text-300"}
            accentClass={isLate ? "bg-red-500" : "bg-custom-border-300"}
          />
          <StatCard
            label="Pending"
            value={agg ? String(agg.counts.pending) : "—"}
            icon={Clock}
            iconClass="text-custom-text-400"
            valueClass="text-custom-text-300"
            accentClass="bg-custom-border-300"
          />
        </div>

        {/* Section header */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm text-custom-text-100 font-semibold">Work item scoring</h3>
            <p className="text-xs text-custom-text-400">
              <span className="capitalize">{config.penalty_mode.replace("_", " ")}</span>
              {" · "}k = {config.k}
              {config.inherited && " · inherited config"}
            </p>
          </div>
          <Link
            href={`/${workspaceSlug}/projects/${projectId}/kpi/settings`}
            className="border-custom-border-200 bg-custom-background-100 text-xs text-custom-text-300 hover:bg-custom-background-90 hover:text-custom-text-100 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium transition-colors"
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

          <div className="border-custom-border-200 bg-custom-background-100 flex flex-col rounded-xl border">
            <div className="border-custom-border-200 border-b px-4 py-3">
              <h4 className="text-sm text-custom-text-100 font-semibold">Penalty curve p(d)</h4>
              <p className="text-xs text-custom-text-400 mt-0.5 truncate">
                {selectedRow ? `${selectedRow.name} · b=${selectedB}` : "Click a row to mark its position on the curve"}
              </p>
            </div>
            <div className="flex-1 p-3">
              <KpiCurveChart config={config} b={selectedB || 0.25} markerD={selectedRow?.d ?? null} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default observer(ProjectKpiPage);
