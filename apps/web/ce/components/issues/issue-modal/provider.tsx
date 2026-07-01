/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { ISearchIssueResponse, TIssue } from "@plane/types";
// components
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import type { TCreateUpdateKpiAttributesProps, TIssueModalContext } from "@/components/issues/issue-modal/context";
// hooks
import { useKpi } from "@/hooks/store/use-kpi";
import { useUser } from "@/hooks/store/user/user-user";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds } = props;
  // states
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  const [kpiDifficultyEstimatePoint, setKpiDifficultyEstimatePoint] = useState<string | null | undefined>(undefined);
  const [kpiRepetitiveEstimatePoint, setKpiRepetitiveEstimatePoint] = useState<string | null | undefined>(undefined);
  // store hooks
  const { projectsWithCreatePermissions } = useUser();
  const { updateIssueDifficultyEstimate, updateIssueRepetitiveEstimate } = useKpi();
  // derived values
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  const handleCreateUpdateKpiAttributes = useCallback(
    async (createUpdateProps: TCreateUpdateKpiAttributesProps) => {
      const { issueId, projectId, workspaceSlug } = createUpdateProps;
      const calls: Promise<void>[] = [];
      if (kpiDifficultyEstimatePoint !== undefined) {
        calls.push(updateIssueDifficultyEstimate(workspaceSlug, projectId, issueId, kpiDifficultyEstimatePoint));
      }
      if (kpiRepetitiveEstimatePoint !== undefined) {
        calls.push(updateIssueRepetitiveEstimate(workspaceSlug, projectId, issueId, kpiRepetitiveEstimatePoint));
      }
      if (calls.length === 0) return;
      await Promise.all(calls);
      setKpiDifficultyEstimatePoint(undefined);
      setKpiRepetitiveEstimatePoint(undefined);
    },
    [
      kpiDifficultyEstimatePoint,
      kpiRepetitiveEstimatePoint,
      updateIssueDifficultyEstimate,
      updateIssueRepetitiveEstimate,
    ]
  );

  const contextValue = useMemo<TIssueModalContext>(
    () => ({
      allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
      workItemTemplateId: null,
      setWorkItemTemplateId: () => {},
      isApplyingTemplate: false,
      setIsApplyingTemplate: () => {},
      selectedParentIssue,
      setSelectedParentIssue,
      issuePropertyValues: {},
      setIssuePropertyValues: () => {},
      issuePropertyValueErrors: {},
      setIssuePropertyValueErrors: () => {},
      kpiDifficultyEstimatePoint,
      setKpiDifficultyEstimatePoint,
      kpiRepetitiveEstimatePoint,
      setKpiRepetitiveEstimatePoint,
      handleCreateUpdateKpiAttributes,
      getIssueTypeIdOnProjectChange: () => null,
      getActiveAdditionalPropertiesLength: () => 0,
      handlePropertyValuesValidation: () => true,
      handleCreateUpdatePropertyValues: () => Promise.resolve(),
      handleProjectEntitiesFetch: () => Promise.resolve(),
      handleTemplateChange: () => Promise.resolve(),
      handleConvert: () => Promise.resolve(),
      handleCreateSubWorkItem: () => Promise.resolve(),
    }),
    [
      allowedProjectIds,
      projectIdsWithCreatePermissions,
      selectedParentIssue,
      kpiDifficultyEstimatePoint,
      kpiRepetitiveEstimatePoint,
      handleCreateUpdateKpiAttributes,
    ]
  );

  return <IssueModalContext.Provider value={contextValue}>{children}</IssueModalContext.Provider>;
});
