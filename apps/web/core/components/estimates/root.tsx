/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { PlusIcon } from "@plane/propel/icons";
// components
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useProject } from "@/hooks/store/use-project";
// plane web components
import { UpdateEstimateModal } from "@/plane-web/components/estimates";
// local imports
import { CreateEstimateModal } from "./create/modal";
import { DeleteEstimateModal } from "./delete/modal";
import { EstimateDisableSwitch } from "./estimate-disable-switch";
import { EstimateList } from "./estimate-list";
import { EstimateLoaderScreen } from "./loader-screen";

type TEstimateRoot = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

export const EstimateRoot = observer(function EstimateRoot(props: TEstimateRoot) {
  const { workspaceSlug, projectId, isAdmin } = props;
  // hooks
  const { currentProjectDetails, updateProject } = useProject();
  const {
    loader,
    activeEstimateIdsByProjectId,
    currentActiveEstimateId,
    estimateById,
    estimateIdsByProjectId,
    getProjectEstimates,
    updateEstimate,
  } = useProjectEstimates();
  // states
  const [isEstimateCreateModalOpen, setIsEstimateCreateModalOpen] = useState(false);
  const [estimateToUpdate, setEstimateToUpdate] = useState<string | undefined>();
  const [estimateToDelete, setEstimateToDelete] = useState<string | undefined>();

  const { t } = useTranslation();
  const estimateIds = estimateIdsByProjectId(projectId);
  const activeEstimateIds = activeEstimateIdsByProjectId(projectId) ?? [];

  const { isLoading: isSWRLoading } = useSWR(
    workspaceSlug && projectId ? `PROJECT_ESTIMATES_${workspaceSlug}_${projectId}` : null,
    async () => workspaceSlug && projectId && getProjectEstimates(workspaceSlug, projectId)
  );

  if (loader === "init-loader" || isSWRLoading) {
    return <EstimateLoaderScreen />;
  }

  const handleSetDefaultEstimate = async (estimateId: string) => {
    const estimate = estimateById(estimateId);
    if (!estimate?.last_used) {
      await updateEstimate(workspaceSlug, projectId, estimateId, {
        estimate: {
          last_used: true,
        },
      });
    }
    await updateProject(workspaceSlug, projectId, { estimate: estimateId });
  };

  const handleToggleEstimateActive = async (estimateId: string, isActive: boolean) => {
    await updateEstimate(workspaceSlug, projectId, estimateId, {
      estimate: {
        last_used: isActive,
      },
    });

    if (isActive && !currentProjectDetails?.estimate) {
      await updateProject(workspaceSlug, projectId, { estimate: estimateId });
      return;
    }

    if (!isActive && currentProjectDetails?.estimate === estimateId) {
      const replacementEstimateId = activeEstimateIds.find((id) => id !== estimateId) ?? null;
      await updateProject(workspaceSlug, projectId, { estimate: replacementEstimateId });
    }
  };

  return (
    <>
      <div>
        {/* header */}
        <SettingsHeading
          title={t("project_settings.estimates.heading")}
          description={t("project_settings.estimates.description")}
        />
        <div className="mt-6">
          {estimateIds && estimateIds.length > 0 ? (
            <>
              <SettingsBoxedControlItem
                title={t("project_settings.estimates.title")}
                description={t("project_settings.estimates.enable_description")}
                control={
                  <EstimateDisableSwitch workspaceSlug={workspaceSlug} projectId={projectId} isAdmin={isAdmin} />
                }
              />
              {/* active estimates section */}
              <div className="mt-12 flex flex-col gap-y-4">
                <SettingsHeading
                  title="Estimates list"
                  variant="h6"
                  control={
                    isAdmin ? (
                      <Button variant="secondary" onClick={() => setIsEstimateCreateModalOpen(true)}>
                        <PlusIcon className="h-3.5 w-3.5" />
                        {t("project_settings.estimates.new")}
                      </Button>
                    ) : undefined
                  }
                />
                <EstimateList
                  estimateIds={estimateIds}
                  activeEstimateId={currentActiveEstimateId}
                  isAdmin={isAdmin}
                  isEstimateEnabled={Boolean(currentProjectDetails?.estimate)}
                  isEditable
                  onEditClick={(estimateId: string) => setEstimateToUpdate(estimateId)}
                  onDeleteClick={(estimateId: string) => setEstimateToDelete(estimateId)}
                  onSetActiveClick={handleSetDefaultEstimate}
                  onToggleActiveClick={handleToggleEstimateActive}
                />
              </div>
            </>
          ) : (
            <EmptyStateCompact
              assetKey="estimate"
              assetClassName="size-20"
              title={t("settings_empty_state.estimates.title")}
              description={t("settings_empty_state.estimates.description")}
              actions={[
                {
                  label: t("settings_empty_state.estimates.cta_primary"),
                  onClick: () => setIsEstimateCreateModalOpen(true),
                },
              ]}
              align="start"
              rootClassName="py-20"
            />
          )}
        </div>
      </div>
      {/* CRUD modals */}
      <CreateEstimateModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={isEstimateCreateModalOpen}
        handleClose={() => setIsEstimateCreateModalOpen(false)}
      />
      <UpdateEstimateModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        estimateId={estimateToUpdate ? estimateToUpdate : undefined}
        isOpen={estimateToUpdate ? true : false}
        handleClose={() => setEstimateToUpdate(undefined)}
      />
      <DeleteEstimateModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        estimateId={estimateToDelete ? estimateToDelete : undefined}
        isOpen={estimateToDelete ? true : false}
        handleClose={() => setEstimateToDelete(undefined)}
      />
    </>
  );
});
