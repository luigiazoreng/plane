/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Plus, Trash2 } from "lucide-react";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect, Input, ToggleSwitch } from "@plane/ui";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

export const EstimatePropertiesSection = observer(function EstimatePropertiesSection(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  const {
    estimateIdsByProjectId,
    estimateById,
    estimatePropertyIdsByProjectId,
    estimatePropertyById,
    getProjectEstimateProperties,
    createEstimateProperty,
    updateEstimateProperty,
    deleteEstimateProperty,
  } = useProjectEstimates();

  const [newName, setNewName] = useState("");
  const [newEstimateId, setNewEstimateId] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  // F4a: SWR instead of a plain useEffect -- the previous effect's deps
  // ([workspaceSlug, projectId, getProjectEstimateProperties]) never change
  // when an estimate is activated/deactivated or when a property is
  // created elsewhere, so this panel went stale until a full page reload.
  // `estimates/root.tsx` calls `mutate` on this same key after those
  // actions (same key family as its own `PROJECT_ESTIMATES_...` SWR key).
  useSWR(
    workspaceSlug && projectId ? `PROJECT_ESTIMATE_PROPERTIES_${workspaceSlug}_${projectId}` : null,
    async () => workspaceSlug && projectId && getProjectEstimateProperties(workspaceSlug, projectId)
  );

  const estimateIds = estimateIdsByProjectId(projectId) ?? [];
  const estimateOptions = estimateIds
    .map((id) => estimateById(id))
    .filter((estimate): estimate is NonNullable<ReturnType<typeof estimateById>> => !!estimate?.id);

  const propertyIds = estimatePropertyIdsByProjectId(projectId) ?? [];

  const handleEstimateChange = async (propertyId: string, estimateId: string) => {
    try {
      await updateEstimateProperty(workspaceSlug, projectId, propertyId, { estimate: estimateId });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not update the estimate property." });
    }
  };

  const handleToggleActive = async (propertyId: string, value: boolean) => {
    try {
      await updateEstimateProperty(workspaceSlug, projectId, propertyId, { is_active: value });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not update the estimate property." });
    }
  };

  const handleDelete = async (propertyId: string) => {
    try {
      await deleteEstimateProperty(workspaceSlug, projectId, propertyId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not delete the estimate property." });
    }
  };

  const selectedNewEstimateId = newEstimateId ?? estimateOptions[0]?.id;
  const selectedNewEstimateName = estimateOptions.find((e) => e.id === selectedNewEstimateId)?.name;

  const handleCreate = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName || !selectedNewEstimateId) return;
    try {
      setCreating(true);
      await createEstimateProperty(workspaceSlug, projectId, { name: trimmedName, estimate: selectedNewEstimateId });
      setNewName("");
      setNewEstimateId(undefined);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not create the estimate property." });
    } finally {
      setCreating(false);
    }
  };

  if (estimateIds.length === 0) return null;

  return (
    <div className="mt-12 flex flex-col gap-y-4">
      <SettingsHeading
        title="Estimate properties"
        variant="h6"
        description="Add named estimate values to work items. Difficulty and Repetitive power KPI scoring; add more for anything else you want to track."
      />
      <div className="flex flex-col gap-2">
        {propertyIds.map((propertyId) => {
          const property = estimatePropertyById(propertyId);
          if (!property) return null;
          const selectedEstimateName = estimateOptions.find((e) => e.id === property.estimate)?.name;
          return (
            <div
              key={propertyId}
              className="flex items-center gap-3 rounded-md border border-subtle px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-13 font-medium text-primary">{property.name}</span>
                {property.kpi_role && (
                  <span className="shrink-0 rounded bg-layer-1 px-1.5 py-0.5 text-11 text-tertiary">
                    Used by KPI
                  </span>
                )}
              </div>
              <div className="w-56 shrink-0">
                <CustomSelect
                  value={property.estimate}
                  label={selectedEstimateName ?? "Not configured"}
                  onChange={(value: string) => handleEstimateChange(propertyId, value)}
                  input
                  disabled={!isAdmin || property.is_estimate_default}
                  buttonClassName="text-13 w-full"
                  className="w-full"
                >
                  {estimateOptions.map((estimate) => (
                    <CustomSelect.Option key={estimate.id} value={estimate.id ?? ""}>
                      {estimate.name}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              </div>
              <ToggleSwitch
                value={property.is_active}
                onChange={(value) => handleToggleActive(propertyId, value)}
                disabled={!isAdmin}
                size="sm"
              />
              {!property.kpi_role && !property.is_estimate_default && (
                <button
                  type="button"
                  className="shrink-0 text-secondary transition-colors hover:text-danger-primary disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => handleDelete(propertyId)}
                  disabled={!isAdmin}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {isAdmin && (
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New estimate property name"
            className="max-w-64"
          />
          <div className="w-56 shrink-0">
            <CustomSelect
              value={selectedNewEstimateId}
              label={selectedNewEstimateName ?? "Select estimate"}
              onChange={(value: string) => setNewEstimateId(value)}
              input
              disabled={estimateOptions.length === 0}
              buttonClassName="text-13 w-full"
              className="w-full"
            >
              {estimateOptions.map((estimate) => (
                <CustomSelect.Option key={estimate.id} value={estimate.id ?? ""}>
                  {estimate.name}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCreate}
            disabled={creating || !newName.trim() || !selectedNewEstimateId}
          >
            <Plus className="size-3.5" />
            Add estimate property
          </Button>
        </div>
      )}
    </div>
  );
});
