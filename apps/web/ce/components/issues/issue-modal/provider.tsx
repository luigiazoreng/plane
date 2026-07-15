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
import type {
  TCreateUpdateEstimatePropertyValuesProps,
  TIssueModalContext,
} from "@/components/issues/issue-modal/context";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
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
  const [estimatePropertyValues, setEstimatePropertyValues] = useState<Record<string, string | null>>({});
  // store hooks
  const { projectsWithCreatePermissions } = useUser();
  const { updateIssueEstimatePropertyValue } = useProjectEstimates();
  // derived values
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  const setEstimatePropertyValue = useCallback((propertyId: string, value: string | null) => {
    setEstimatePropertyValues((prev) => ({ ...prev, [propertyId]: value }));
  }, []);

  const handleCreateUpdateEstimatePropertyValues = useCallback(
    async (createUpdateProps: TCreateUpdateEstimatePropertyValuesProps) => {
      const { issueId, projectId, workspaceSlug } = createUpdateProps;
      const entries = Object.entries(estimatePropertyValues);
      if (entries.length === 0) return;
      await Promise.all(
        entries.map(([propertyId, value]) =>
          updateIssueEstimatePropertyValue(workspaceSlug, projectId, issueId, propertyId, value)
        )
      );
      setEstimatePropertyValues({});
    },
    [estimatePropertyValues, updateIssueEstimatePropertyValue]
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
      estimatePropertyValues,
      setEstimatePropertyValue,
      handleCreateUpdateEstimatePropertyValues,
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
      estimatePropertyValues,
      setEstimatePropertyValue,
      handleCreateUpdateEstimatePropertyValues,
    ]
  );

  return <IssueModalContext.Provider value={contextValue}>{children}</IssueModalContext.Provider>;
});
