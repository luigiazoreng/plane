/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowLeft } from "lucide-react";
import { EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EUserProjectRoles } from "@plane/types";
import type { IKpiConfig } from "@plane/types";
import { Spinner } from "@plane/ui";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// assets
import darkEmptyState from "@/app/assets/empty-state/disabled-feature/views-dark.webp?url";
import lightEmptyState from "@/app/assets/empty-state/disabled-feature/views-light.webp?url";
// components
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
import { PageHead } from "@/components/core/page-title";
import { KpiConfigEditor } from "@/components/kpi/config-editor";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useKpi } from "@/hooks/store/use-kpi";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";

function ProjectKpiSettingsPage() {
  const { workspaceSlug, projectId } = useParams() as { workspaceSlug: string; projectId: string };
  const { projectConfig, fetchProjectConfig, updateProjectConfig, resetProjectConfig } = useKpi();
  const { getProjectEstimates, estimateIdsByProjectId, estimateById } = useProjectEstimates();
  const { currentProjectDetails } = useProject();
  const { allowPermissions } = useUserPermissions();
  const router = useAppRouter();
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const config = projectConfig[projectId];

  const estimateIds = useMemo(() => estimateIdsByProjectId(projectId) ?? [], [estimateIdsByProjectId, projectId]);
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
          const points =
            estimate?.estimatePointIds
              ?.map((pointId) => {
                const point = estimate.estimatePointById(pointId);
                if (!point?.id || typeof point.value !== "string") return undefined;
                return { id: point.id, value: point.value };
              })
              .filter((point): point is { id: string; value: string } => !!point) ?? [];
          return [id, points];
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

  // No access to KPI
  if (currentProjectDetails?.kpi_view === false) {
    const resolvedEmptyState = resolvedTheme === "light" ? lightEmptyState : darkEmptyState;
    const hasAdminLevelPermission = allowPermissions([EUserProjectRoles.ADMIN], EUserPermissionsLevel.PROJECT);
    return (
      <div className="flex h-full w-full items-center justify-center">
        <DetailedEmptyState
          title={t("disabled_project.empty_state.kpi.title")}
          description={t("disabled_project.empty_state.kpi.description")}
          assetPath={resolvedEmptyState}
          primaryButton={{
            text: t("disabled_project.empty_state.kpi.primary_button.text"),
            onClick: () => {
              router.push(`/${workspaceSlug}/settings/projects/${projectId}/features/kpi`);
            },
            disabled: !hasAdminLevelPermission,
          }}
        />
      </div>
    );
  }

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
      <div className="flex h-full w-full flex-col overflow-hidden bg-surface-1">
        <div className="shrink-0 border-b border-subtle px-page-x py-4">
          <Link
            href={`/${workspaceSlug}/projects/${projectId}/kpi`}
            className="mb-3 inline-flex items-center gap-1 text-13 text-secondary transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-3.5" />
            Back to KPI
          </Link>
          <SettingsHeading
            title="KPI configuration"
            description="Edit the point tables, priority factors and global parameters. Changes apply immediately to scoring."
          />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
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
      </div>
    </>
  );
}

export default observer(ProjectKpiSettingsPage);
