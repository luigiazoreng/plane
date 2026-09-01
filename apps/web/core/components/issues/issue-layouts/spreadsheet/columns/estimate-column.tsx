/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
// types
import type { TIssue } from "@plane/types";
// components
import { EstimateDropdown } from "@/components/dropdowns/estimate";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  issue: TIssue;
  onClose: () => void;
  onChange: (issue: TIssue, data: Partial<TIssue>, updates: any) => void;
  disabled: boolean;
};

export const SpreadsheetEstimateColumn = observer(function SpreadsheetEstimateColumn(props: Props) {
  const { issue, disabled, onClose } = props;
  const { workspaceSlug } = useParams();
  const { getProjectById } = useProject();
  const { t } = useTranslation();

  const {
    activeEstimatePropertyIdsByProjectId,
    estimateSystemPropertyIdsByProjectId,
    estimatePropertyById,
    estimateById,
    issueEstimatePropertyValueFor,
    ensureProjectEstimateProperties,
    getIssueEstimatePropertyValues,
    updateIssueEstimatePropertyValue,
  } = useProjectEstimates();

  useEffect(() => {
    if (!workspaceSlug || !issue.project_id || !issue.id) return;
    ensureProjectEstimateProperties(workspaceSlug.toString(), issue.project_id).catch(() => {});
    getIssueEstimatePropertyValues(workspaceSlug.toString(), issue.project_id, issue.id).catch(() => {});
  }, [workspaceSlug, issue.project_id, issue.id, ensureProjectEstimateProperties, getIssueEstimatePropertyValues]);

  const estimateSystemPropertyIds =
    (issue.project_id && estimateSystemPropertyIdsByProjectId(issue.project_id)) || [];
  const estimatePropertyIds = (issue.project_id && activeEstimatePropertyIdsByProjectId(issue.project_id)) || [];

  if (estimateSystemPropertyIds.length === 0 && estimatePropertyIds.length === 0) {
    return <div className="h-11 border-b-[0.5px] border-subtle" />;
  }

  const projectDetails = issue.project_id ? getProjectById(issue.project_id) : undefined;

  return (
    <div className="flex h-11 border-b-[0.5px] border-subtle items-center overflow-x-auto">
      {estimateSystemPropertyIds.map((propertyId) => {
        const property = estimatePropertyById(propertyId);
        if (!property) return null;
        const value = issueEstimatePropertyValueFor(issue.id, propertyId);
        const systemName = estimateById(property.estimate)?.name ?? t("common.estimate");
        return (
          <EstimateDropdown
            key={propertyId}
            value={value?.estimate_point ?? undefined}
            estimateId={property.estimate}
            onChange={async (val) => {
              if (workspaceSlug && issue.project_id) {
                await updateIssueEstimatePropertyValue(
                  workspaceSlug.toString(),
                  issue.project_id,
                  issue.id,
                  propertyId,
                  val ?? null
                );
              }
            }}
            placeholder={systemName}
            projectId={issue.project_id ?? undefined}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            buttonClassName="text-left rounded-none group-[.selected-issue-row]:bg-accent-primary/5 group-[.selected-issue-row]:hover:bg-accent-primary/10 px-page-x min-w-max"
            buttonContainerClassName="w-auto flex-shrink-0"
            onClose={onClose}
          />
        );
      })}
      {estimatePropertyIds.map((propertyId) => {
        const property = estimatePropertyById(propertyId);
        if (!property) return null;
        // KPI-reserved properties (Difficulty/Repetitive) only show while the project's KPI feature is on;
        // custom properties are independent of that toggle.
        if (property.kpi_role && !projectDetails?.kpi_view) return null;
        const value = issueEstimatePropertyValueFor(issue.id, propertyId);
        return (
          <EstimateDropdown
            key={propertyId}
            value={value?.estimate_point ?? undefined}
            estimateId={property.estimate}
            onChange={async (val) => {
              if (workspaceSlug && issue.project_id) {
                await updateIssueEstimatePropertyValue(
                  workspaceSlug.toString(),
                  issue.project_id,
                  issue.id,
                  propertyId,
                  val ?? null
                );
              }
            }}
            placeholder={property.name}
            projectId={issue.project_id ?? undefined}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            buttonClassName="text-left rounded-none group-[.selected-issue-row]:bg-accent-primary/5 group-[.selected-issue-row]:hover:bg-accent-primary/10 px-page-x min-w-max"
            buttonContainerClassName="w-auto flex-shrink-0"
            onClose={onClose}
          />
        );
      })}
    </div>
  );
});
