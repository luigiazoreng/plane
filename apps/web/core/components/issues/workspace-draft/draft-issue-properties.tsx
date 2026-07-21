/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// icons
import { DueDatePropertyIcon, StartDatePropertyIcon } from "@plane/propel/icons";
// types
import type { TIssuePriorities, TWorkspaceDraftIssue } from "@plane/types";
import { getDate, renderFormattedPayloadDate, shouldHighlightIssueDueDate } from "@plane/utils";
// components
import { CycleDropdown } from "@/components/dropdowns/cycle";
import { DateDropdown } from "@/components/dropdowns/date";
import { EstimateDropdown } from "@/components/dropdowns/estimate";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ModuleDropdown } from "@/components/dropdowns/module/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
// helpers
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useWorkspaceDraftIssues } from "@/hooks/store/workspace-draft";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { IssuePropertyLabels } from "../issue-layouts/properties";
// local components

export interface IIssueProperties {
  issue: TWorkspaceDraftIssue;
  updateIssue:
    | ((projectId: string | null, issueId: string, data: Partial<TWorkspaceDraftIssue>) => Promise<void>)
    | undefined;
  className: string;
}

export const DraftIssueProperties = observer(function DraftIssueProperties(props: IIssueProperties) {
  const { issue, updateIssue, className } = props;
  // store hooks
  const { getProjectById } = useProject();
  const { labelMap } = useLabel();
  const { addCycleToIssue, addModulesToIssue } = useWorkspaceDraftIssues();
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
  const { getStateById } = useProjectState();
  const { isMobile } = usePlatformOS();
  const projectDetails = getProjectById(issue.project_id);

  // router
  const { workspaceSlug } = useParams();
  // derived values
  const stateDetails = getStateById(issue.state_id);
  const estimateSystemPropertyIds = (issue.project_id && estimateSystemPropertyIdsByProjectId(issue.project_id)) || [];
  const estimatePropertyIds = (issue.project_id && activeEstimatePropertyIdsByProjectId(issue.project_id)) || [];

  useEffect(() => {
    if (!workspaceSlug || !issue.project_id || !issue.id) return;
    ensureProjectEstimateProperties(workspaceSlug.toString(), issue.project_id).catch(() => {});
    getIssueEstimatePropertyValues(workspaceSlug.toString(), issue.project_id, issue.id).catch(() => {});
  }, [workspaceSlug, issue.project_id, issue.id, ensureProjectEstimateProperties, getIssueEstimatePropertyValues]);

  const issueOperations = useMemo(
    () => ({
      updateIssueModules: async (moduleIds: string[]) => {
        if (!workspaceSlug || !issue.id) return;
        await addModulesToIssue(workspaceSlug.toString(), issue.id, moduleIds);
      },
      addIssueToCycle: async (cycleId: string) => {
        if (!workspaceSlug || !issue.id) return;
        await addCycleToIssue(workspaceSlug.toString(), issue.id, cycleId);
      },
      removeIssueFromCycle: async () => {
        if (!workspaceSlug || !issue.id) return;
        // TODO: To be checked
        await addCycleToIssue(workspaceSlug.toString(), issue.id, "");
      },
    }),
    [workspaceSlug, issue, addCycleToIssue, addModulesToIssue]
  );

  const handleState = (stateId: string) =>
    issue?.project_id && updateIssue && updateIssue(issue.project_id, issue.id, { state_id: stateId });

  const handlePriority = (value: TIssuePriorities) =>
    issue?.project_id && updateIssue && updateIssue(issue.project_id, issue.id, { priority: value });

  const handleLabel = (ids: string[]) =>
    issue?.project_id && updateIssue && updateIssue(issue.project_id, issue.id, { label_ids: ids });

  const handleAssignee = (ids: string[]) =>
    issue?.project_id && updateIssue && updateIssue(issue.project_id, issue.id, { assignee_ids: ids });

  const handleModule = useCallback(
    (moduleIds: string[] | null) => {
      if (!issue || !issue.module_ids || !moduleIds) return;
      issueOperations.updateIssueModules(moduleIds);
    },
    [issueOperations, issue]
  );

  const handleCycle = useCallback(
    (cycleId: string | null) => {
      if (!issue || issue.cycle_id === cycleId) return;
      if (cycleId) issueOperations.addIssueToCycle?.(cycleId);
      else issueOperations.removeIssueFromCycle?.();
    },
    [issue, issueOperations]
  );

  const handleStartDate = (date: Date | null) =>
    issue?.project_id &&
    updateIssue &&
    updateIssue(issue.project_id, issue.id, {
      start_date: date ? (renderFormattedPayloadDate(date) ?? undefined) : undefined,
    });

  const handleTargetDate = (date: Date | null) =>
    issue?.project_id &&
    updateIssue &&
    updateIssue(issue.project_id, issue.id, {
      target_date: date ? (renderFormattedPayloadDate(date) ?? undefined) : undefined,
    });

  if (!issue.project_id) return null;

  const defaultLabelOptions = issue?.label_ids?.map((id) => labelMap[id]) || [];

  const minDate = getDate(issue.start_date);
  minDate?.setDate(minDate.getDate());

  const maxDate = getDate(issue.target_date);
  maxDate?.setDate(maxDate.getDate());

  const handleEventPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div className={className}>
      {/* basic properties */}
      {/* state */}
      <div className="h-5" onClick={handleEventPropagation}>
        <StateDropdown
          buttonContainerClassName="truncate max-w-40"
          value={issue.state_id}
          onChange={handleState}
          projectId={issue.project_id}
          buttonVariant="border-with-text"
          renderByDefault={isMobile}
          showTooltip
        />
      </div>

      {/* priority */}
      <div className="h-5" onClick={handleEventPropagation}>
        <PriorityDropdown
          value={issue?.priority}
          onChange={handlePriority}
          buttonVariant="border-without-text"
          buttonClassName="border"
          renderByDefault={isMobile}
          showTooltip
        />
      </div>

      {/* label */}

      <IssuePropertyLabels
        projectId={issue?.project_id || null}
        value={issue?.label_ids || null}
        defaultOptions={defaultLabelOptions}
        onChange={handleLabel}
        renderByDefault={isMobile}
        hideDropdownArrow
      />

      {/* start date */}
      <div className="h-5" onClick={handleEventPropagation}>
        <DateDropdown
          value={issue.start_date ?? null}
          onChange={handleStartDate}
          maxDate={maxDate}
          placeholder="Start date"
          icon={<StartDatePropertyIcon className="h-3 w-3 flex-shrink-0" />}
          buttonVariant={issue.start_date ? "border-with-text" : "border-without-text"}
          optionsClassName="z-10"
          renderByDefault={isMobile}
          showTooltip
        />
      </div>

      {/* target/due date */}
      <div className="h-5" onClick={handleEventPropagation}>
        <DateDropdown
          value={issue?.target_date ?? null}
          onChange={handleTargetDate}
          minDate={minDate}
          placeholder="Due date"
          icon={<DueDatePropertyIcon className="h-3 w-3 flex-shrink-0" />}
          buttonVariant={issue.target_date ? "border-with-text" : "border-without-text"}
          buttonClassName={
            shouldHighlightIssueDueDate(issue?.target_date || null, stateDetails?.group) ? "text-danger-primary" : ""
          }
          clearIconClassName="!text-primary"
          optionsClassName="z-10"
          renderByDefault={isMobile}
          showTooltip
        />
      </div>

      {/* assignee */}
      <div className="h-5" onClick={handleEventPropagation}>
        <MemberDropdown
          projectId={issue?.project_id}
          value={issue?.assignee_ids}
          onChange={handleAssignee}
          multiple
          buttonVariant={issue.assignee_ids?.length > 0 ? "transparent-without-text" : "border-without-text"}
          buttonClassName={issue.assignee_ids?.length > 0 ? "hover:bg-transparent px-0" : ""}
          showTooltip={issue?.assignee_ids?.length === 0}
          placeholder="Assignees"
          optionsClassName="z-10"
          tooltipContent=""
          renderByDefault={isMobile}
        />
      </div>

      {/* modules */}
      {projectDetails?.module_view && (
        <div className="h-5" onClick={handleEventPropagation}>
          <ModuleDropdown
            buttonContainerClassName="truncate max-w-40"
            projectId={issue?.project_id}
            value={issue?.module_ids ?? []}
            onChange={handleModule}
            renderByDefault={isMobile}
            multiple
            buttonVariant="border-with-text"
            showCount
            showTooltip
          />
        </div>
      )}

      {/* cycles */}
      {projectDetails?.cycle_view && (
        <div className="h-5" onClick={handleEventPropagation}>
          <CycleDropdown
            buttonContainerClassName="truncate max-w-40"
            projectId={issue?.project_id}
            value={issue?.cycle_id || null}
            onChange={handleCycle}
            buttonVariant="border-with-text"
            renderByDefault={isMobile}
            showTooltip
          />
        </div>
      )}

      {/* estimates */}
      {estimateSystemPropertyIds.map((propertyId) => {
        const property = estimatePropertyById(propertyId);
        if (!property || !issue.project_id) return null;
        const systemName = estimateById(property.estimate)?.name;
        const value = issueEstimatePropertyValueFor(issue.id, propertyId);
        return (
          <div key={propertyId} className="h-5" onClick={handleEventPropagation}>
            <EstimateDropdown
              value={value?.estimate_point ?? undefined}
              estimateId={property.estimate}
              onChange={(val) =>
                updateIssueEstimatePropertyValue(
                  workspaceSlug?.toString() ?? "",
                  issue.project_id as string,
                  issue.id,
                  propertyId,
                  val ?? null
                )
              }
              projectId={issue.project_id}
              buttonVariant="border-with-text"
              renderByDefault={isMobile}
              showTooltip
              placeholder={systemName}
            />
          </div>
        );
      })}
      {/* custom estimate properties */}
      {estimatePropertyIds.map((propertyId) => {
        const property = estimatePropertyById(propertyId);
        if (!property || !issue.project_id) return null;
        if (property.kpi_role && !projectDetails?.kpi_view) return null;
        const value = issueEstimatePropertyValueFor(issue.id, propertyId);
        return (
          <div key={propertyId} className="h-5" onClick={handleEventPropagation}>
            <EstimateDropdown
              value={value?.estimate_point ?? undefined}
              estimateId={property.estimate}
              onChange={(val) =>
                updateIssueEstimatePropertyValue(
                  workspaceSlug?.toString() ?? "",
                  issue.project_id as string,
                  issue.id,
                  propertyId,
                  val ?? null
                )
              }
              projectId={issue.project_id}
              buttonVariant="border-with-text"
              renderByDefault={isMobile}
              showTooltip
              placeholder={property.name}
            />
          </div>
        );
      })}
    </div>
  );
});
