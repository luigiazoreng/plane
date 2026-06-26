/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EUserPermissionsLevel } from "@plane/constants";
import { EUserProjectRoles } from "@plane/types";
import type { IKpiConfig } from "@plane/types";
import { Spinner } from "@plane/ui";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { KpiConfigEditor } from "@/components/kpi/config-editor";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useKpi } from "@/hooks/store/use-kpi";
import { useUserPermissions } from "@/hooks/store/user";

function ProjectKpiSettingsPage() {
  const { workspaceSlug, projectId } = useParams() as { workspaceSlug: string; projectId: string };
  const { projectConfig, fetchProjectConfig, updateProjectConfig, resetProjectConfig } = useKpi();
  const { getProjectEstimates, estimateIdsByProjectId, estimateById } = useProjectEstimates();
  const { allowPermissions } = useUserPermissions();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const config = projectConfig[projectId];

  const estimateIds = estimateIdsByProjectId(projectId) ?? [];
  const estimateOptions = useMemo(
    () =>
      estimateIds
        .map((id) => {
          const estimate = estimateById(id);
          if (!estimate) return undefined;
          return { id, name: estimate.name ?? "Untitled estimate" };
        })
        .filter((estimate): estimate is { id: string; name: string } => !!estimate),
    [estimateIds, estimateById]
  );
  const estimateValuesById = useMemo(
    () =>
      Object.fromEntries(
        estimateIds.map((id) => {
          const estimate = estimateById(id);
          const values =
            estimate?.estimatePointIds
              ?.map((pointId) => estimate.estimatePointById(pointId)?.value)
              .filter((value): value is string => typeof value === "string") ?? [];
          return [id, values];
        })
      ),
    [estimateIds, estimateById]
  );
  const canEdit = allowPermissions(
    [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getProjectEstimates(workspaceSlug, projectId).catch(() => {});
    fetchProjectConfig(workspaceSlug, projectId).finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [workspaceSlug, projectId, fetchProjectConfig, getProjectEstimates]);

  const handleSave = async (data: Partial<IKpiConfig>) => {
    setSaving(true);
    try {
      await updateProjectConfig(workspaceSlug, projectId, data);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Saved", message: "KPI configuration updated." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not save configuration." });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await resetProjectConfig(workspaceSlug, projectId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Reset", message: "Reverted to workspace default." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not reset configuration." });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <PageHead title="KPI Settings" />
      <div className="mx-auto h-full w-full max-w-4xl overflow-y-auto p-6">
        <div className="mb-6 flex items-center gap-2">
          <Link
            href={`/${workspaceSlug}/projects/${projectId}/kpi`}
            className="text-sm text-custom-text-300 hover:text-custom-text-100 flex items-center gap-1"
          >
            <ArrowLeft className="size-4" />
            Back to KPI
          </Link>
        </div>
        <h2 className="text-lg text-custom-text-100 mb-1 font-semibold">KPI configuration</h2>
        <p className="text-sm text-custom-text-400 mb-6">
          Edit the point tables, priority factors and global parameters. Changes apply immediately to scoring.
        </p>
        <KpiConfigEditor
          config={config}
          canEdit={canEdit}
          saving={saving}
          onSave={handleSave}
          onReset={handleReset}
          estimateOptions={estimateOptions}
          estimateValuesById={estimateValuesById}
        />
      </div>
    </>
  );
}

export default observer(ProjectKpiSettingsPage);
