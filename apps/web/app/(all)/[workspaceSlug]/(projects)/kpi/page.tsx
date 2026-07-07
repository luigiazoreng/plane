/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Spinner } from "@plane/ui";
// components
import { KpiMemberBarChart } from "@/components/kpi/member-bar-chart";
import { KpiMemberList } from "@/components/kpi/member-list";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useKpi } from "@/hooks/store/use-kpi";

function WorkspaceKpiPage() {
  const { workspaceSlug } = useParams() as { workspaceSlug: string };
  const { workspaceMemberAggregates, fetchWorkspaceMemberAggregates } = useKpi();

  const [loading, setLoading] = useState(true);

  const memberAgg = workspaceMemberAggregates[workspaceSlug];

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchWorkspaceMemberAggregates(workspaceSlug).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [workspaceSlug, fetchWorkspaceMemberAggregates]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <PageHead title="Workspace KPI" />
      <div className="flex h-full w-full flex-col overflow-hidden bg-surface-1">
        {/* Section header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-subtle px-page-x">
          <div className="flex items-baseline gap-2 truncate">
            <h3 className="text-13 font-medium text-primary">Workspace Team Scoring</h3>
            <span className="truncate text-12 text-tertiary">Aggregated across all projects</span>
          </div>
        </div>

        {/* Member scoring + charts */}
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="vertical-scrollbar horizontal-scrollbar scrollbar-lg min-h-0 flex-1 overflow-auto">
            <KpiMemberList results={memberAgg?.results ?? []} unassignedCount={memberAgg?.unassigned_count ?? 0} />
          </div>

          <div className="flex shrink-0 flex-col gap-6 overflow-y-auto border-t border-subtle bg-surface-1 py-4 lg:w-[420px] lg:border-t-0 lg:border-l">
            <div>
              <h4 className="px-page-x text-13 font-medium text-primary">Final score by member</h4>
              <KpiMemberBarChart results={memberAgg?.results ?? []} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default observer(WorkspaceKpiPage);
