/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { IKpiAggregates, TKpiPeriod } from "@plane/types";
import { Spinner } from "@plane/ui";
// components
import { PageHead } from "@/components/core/page-title";
import { KpiMemberList } from "@/components/kpi/member-list";
import { KpiPeriodSelector } from "@/components/kpi/period-selector";
import { KpiProjectList } from "@/components/kpi/project-list";
import { KpiScoreBarChart } from "@/components/kpi/score-bar-chart";
import { KpiStatBar } from "@/components/kpi/stat-bar";
import { UnifiedKpiHero } from "@/components/kpi/unified-kpi-hero";
import { KpiMathHelpModal } from "@/components/kpi/math-help-modal";
import { HelpCircle } from "lucide-react";
// hooks
import { useKpi } from "@/hooks/store/use-kpi";

const SectionHeader = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle px-page-x">
    <h3 className="text-13 font-medium text-primary">{title}</h3>
    {hint && <span className="truncate text-12 text-tertiary">{hint}</span>}
  </div>
);

function WorkspaceKpiPage() {
  const { workspaceSlug } = useParams() as { workspaceSlug: string };
  const { workspaceOverview, fetchWorkspaceOverview } = useKpi();

  const [period, setPeriod] = useState<TKpiPeriod>("90d");
  const [customStartDate, setCustomStartDate] = useState<string | undefined>();
  const [customEndDate, setCustomEndDate] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const overview = workspaceOverview[workspaceSlug];

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchWorkspaceOverview(workspaceSlug, {
      period,
      start: period === "custom" ? customStartDate : undefined,
      end: period === "custom" ? customEndDate : undefined,
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [workspaceSlug, period, customStartDate, customEndDate, fetchWorkspaceOverview]);

  // The StatBar speaks IKpiAggregates; the unified summary carries the same
  // figures under workspace-wide names, so adapt instead of duplicating the bar.
  const statAggregates: IKpiAggregates | undefined = useMemo(() => {
    if (!overview) return undefined;
    const { unified } = overview;
    return {
      sum_vp: unified.sum_vp_raw,
      sum_vf: unified.sum_vf_raw,
      efficiency: unified.kpi,
      counts: unified.counts,
      total: unified.scored_items,
    };
  }, [overview]);

  const projectChartData = useMemo(
    () =>
      (overview?.projects ?? [])
        .filter((row) => row.efficiency != null)
        .map((row) => ({ name: row.identifier, value: Number(((row.efficiency ?? 0) * 100).toFixed(1)) })),
    [overview]
  );

  const memberChartData = useMemo(
    () => (overview?.members ?? []).map((row) => ({ name: row.display_name, value: row.sum_vf })),
    [overview]
  );

  const handlePeriodChange = useCallback((next: TKpiPeriod, start?: string, end?: string) => {
    setPeriod(next);
    setCustomStartDate(start);
    setCustomEndDate(end);
  }, []);

  if (loading && !overview) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <PageHead title="Workspace KPI" />
      <div className="vertical-scrollbar flex scrollbar-lg h-full w-full flex-col overflow-y-auto bg-surface-1">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-subtle px-page-x">
          <div className="flex items-baseline gap-2 truncate">
            <h3 className="text-13 font-medium text-primary">Active KPIs</h3>
            <span className="truncate text-12 text-tertiary">
              Consolidated across every project with the KPI panel enabled
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              className="flex items-center gap-1.5 text-12 font-medium text-tertiary transition-colors hover:text-secondary"
            >
              <HelpCircle className="size-3.5" />
              How it works
            </button>
            <KpiPeriodSelector
              value={period}
              customStartDate={customStartDate}
              customEndDate={customEndDate}
              onChange={handlePeriodChange}
              disabled={loading}
            />
          </div>
        </div>

        {overview && <UnifiedKpiHero unified={overview.unified} />}

        {/* Raw point totals mix each project's own scale — labelled as such so
            they are never mistaken for the comparable figure above. */}
        <KpiStatBar agg={statAggregates} mixedScale />

        <SectionHeader title="By project" hint="Efficiency is comparable across projects; Σ Vp / Σ Vf are not" />
        <KpiProjectList workspaceSlug={workspaceSlug} results={overview?.projects ?? []} />

        {projectChartData.length > 0 && (
          <div className="border-t border-subtle pt-4 pb-6">
            <h4 className="px-page-x text-13 font-medium text-primary">Efficiency by project (%)</h4>
            <KpiScoreBarChart data={projectChartData} label="Efficiency (%)" />
          </div>
        )}

        <SectionHeader
          title="By member"
          hint="Scores split equally between assignees · Efficiency is comparable between members; Σ Vp / Σ Vf are not"
        />
        <div className="flex flex-col lg:flex-row">
          <div className="horizontal-scrollbar scrollbar-lg min-w-0 flex-1 overflow-x-auto">
            <KpiMemberList results={overview?.members ?? []} unassignedCount={overview?.unassigned_count ?? 0} />
          </div>
          {memberChartData.length > 0 && (
            <div className="shrink-0 border-t border-subtle py-4 lg:w-105 lg:border-t-0 lg:border-l">
              <h4 className="px-page-x text-13 font-medium text-primary">Final score by member</h4>
              <KpiScoreBarChart data={memberChartData} label="Final score (Vf)" />
            </div>
          )}
        </div>
      </div>
      <KpiMathHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}

export default observer(WorkspaceKpiPage);
