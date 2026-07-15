/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import set from "lodash-es/set";
// types
import type {
  IKpiAggregates,
  IKpiConfig,
  IKpiIssueAttribute,
  IKpiIssueRow,
  IKpiMemberAggregate,
  IKpiMemberAggregateResponse,
  IKpiPreviewResponse,
  IKpiTaskInput,
} from "@plane/types";
// services
import { KpiService } from "@plane/services";
// plane web store
import type { CoreRootStore } from "./root.store";

export interface IKpiStore {
  // observables
  workspaceConfig: Record<string, IKpiConfig>; // workspaceSlug -> config
  projectConfig: Record<string, IKpiConfig>; // projectId -> resolved config
  issues: Record<string, IKpiIssueRow[]>; // projectId -> rows
  aggregates: Record<string, IKpiAggregates>; // projectId -> aggregates
  memberAggregates: Record<string, IKpiMemberAggregateResponse>; // projectId -> per-member breakdown
  workspaceMemberAggregates: Record<string, IKpiMemberAggregateResponse>; // workspaceSlug -> per-member breakdown
  issueAttributes: Record<string, IKpiIssueAttribute>; // issueId -> KPI attributes
  loadingState: Record<string, boolean>;
  errorState: Record<string, string | null>;
  // config actions
  fetchWorkspaceConfig: (workspaceSlug: string) => Promise<IKpiConfig>;
  updateWorkspaceConfig: (workspaceSlug: string, data: Partial<IKpiConfig>) => Promise<IKpiConfig>;
  fetchProjectConfig: (workspaceSlug: string, projectId: string) => Promise<IKpiConfig>;
  updateProjectConfig: (workspaceSlug: string, projectId: string, data: Partial<IKpiConfig>) => Promise<IKpiConfig>;
  resetProjectConfig: (workspaceSlug: string, projectId: string) => Promise<void>;
  // issue actions
  fetchProjectIssues: (workspaceSlug: string, projectId: string) => Promise<IKpiIssueRow[]>;
  fetchProjectMemberAggregates: (workspaceSlug: string, projectId: string) => Promise<IKpiMemberAggregate[]>;
  fetchWorkspaceMemberAggregates: (workspaceSlug: string) => Promise<IKpiMemberAggregate[]>;
  fetchIssueAttributes: (workspaceSlug: string, projectId: string, issueId: string) => Promise<IKpiIssueAttribute>;
  updateIssueAttributes: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<IKpiIssueAttribute>
  ) => Promise<IKpiIssueAttribute>;
  updateIssuePriority: (workspaceSlug: string, projectId: string, issueId: string, priority: string) => Promise<void>;
  preview: (
    workspaceSlug: string,
    projectId: string,
    payload: { task: IKpiTaskInput; config?: Partial<IKpiConfig>; d_min?: number; d_max?: number }
  ) => Promise<IKpiPreviewResponse>;
}

export class KpiStore implements IKpiStore {
  workspaceConfig: Record<string, IKpiConfig> = {};
  projectConfig: Record<string, IKpiConfig> = {};
  issues: Record<string, IKpiIssueRow[]> = {};
  aggregates: Record<string, IKpiAggregates> = {};
  memberAggregates: Record<string, IKpiMemberAggregateResponse> = {};
  workspaceMemberAggregates: Record<string, IKpiMemberAggregateResponse> = {};
  issueAttributes: Record<string, IKpiIssueAttribute> = {};
  loadingState: Record<string, boolean> = {};
  errorState: Record<string, string | null> = {};

  kpiService: KpiService;

  constructor(public store: CoreRootStore) {
    makeObservable(this, {
      workspaceConfig: observable,
      projectConfig: observable,
      issues: observable,
      aggregates: observable,
      memberAggregates: observable,
      issueAttributes: observable,
      loadingState: observable,
      errorState: observable,
      fetchWorkspaceConfig: action,
      updateWorkspaceConfig: action,
      fetchProjectConfig: action,
      updateProjectConfig: action,
      resetProjectConfig: action,
      fetchProjectIssues: action,
      fetchProjectMemberAggregates: action,
      fetchWorkspaceMemberAggregates: action,
      fetchIssueAttributes: action,
      updateIssueAttributes: action,
      updateIssuePriority: action,
      preview: action,
    });
    this.kpiService = new KpiService();
  }

  private _setLoading(key: string, value: boolean) {
    runInAction(() => set(this.loadingState, [key], value));
  }

  fetchWorkspaceConfig = async (workspaceSlug: string): Promise<IKpiConfig> => {
    this._setLoading(`ws-config-${workspaceSlug}`, true);
    try {
      const config = await this.kpiService.getWorkspaceConfig(workspaceSlug);
      runInAction(() => set(this.workspaceConfig, [workspaceSlug], config));
      return config;
    } finally {
      this._setLoading(`ws-config-${workspaceSlug}`, false);
    }
  };

  updateWorkspaceConfig = async (workspaceSlug: string, data: Partial<IKpiConfig>): Promise<IKpiConfig> => {
    const config = await this.kpiService.updateWorkspaceConfig(workspaceSlug, data);
    runInAction(() => set(this.workspaceConfig, [workspaceSlug], config));
    return config;
  };

  fetchProjectConfig = async (workspaceSlug: string, projectId: string): Promise<IKpiConfig> => {
    this._setLoading(`project-config-${projectId}`, true);
    try {
      const config = await this.kpiService.getProjectConfig(workspaceSlug, projectId);
      runInAction(() => set(this.projectConfig, [projectId], config));
      return config;
    } finally {
      this._setLoading(`project-config-${projectId}`, false);
    }
  };

  updateProjectConfig = async (
    workspaceSlug: string,
    projectId: string,
    data: Partial<IKpiConfig>
  ): Promise<IKpiConfig> => {
    const config = await this.kpiService.updateProjectConfig(workspaceSlug, projectId, data);
    runInAction(() => set(this.projectConfig, [projectId], config));
    return config;
  };

  resetProjectConfig = async (workspaceSlug: string, projectId: string): Promise<void> => {
    await this.kpiService.resetProjectConfig(workspaceSlug, projectId);
    // Re-fetch to pick up the inherited workspace default.
    await this.fetchProjectConfig(workspaceSlug, projectId);
  };

  fetchProjectIssues = async (workspaceSlug: string, projectId: string): Promise<IKpiIssueRow[]> => {
    this._setLoading(`issues-${projectId}`, true);
    try {
      const response = await this.kpiService.getProjectIssues(workspaceSlug, projectId);
      runInAction(() => {
        set(this.issues, [projectId], response.results);
        set(this.aggregates, [projectId], response.aggregates);
      });
      return response.results;
    } finally {
      this._setLoading(`issues-${projectId}`, false);
    }
  };

  fetchProjectMemberAggregates = async (workspaceSlug: string, projectId: string): Promise<IKpiMemberAggregate[]> => {
    this._setLoading(`member-aggregates-${projectId}`, true);
    try {
      const response = await this.kpiService.getProjectMemberAggregates(workspaceSlug, projectId);
      runInAction(() => set(this.memberAggregates, [projectId], response));
      return response.results;
    } finally {
      this._setLoading(`member-aggregates-${projectId}`, false);
    }
  };

  fetchWorkspaceMemberAggregates = async (workspaceSlug: string): Promise<IKpiMemberAggregate[]> => {
    this._setLoading(`ws-member-aggregates-${workspaceSlug}`, true);
    try {
      const response = await this.kpiService.getWorkspaceMemberAggregates(workspaceSlug);
      runInAction(() => set(this.workspaceMemberAggregates, [workspaceSlug], response));
      return response.results;
    } finally {
      this._setLoading(`ws-member-aggregates-${workspaceSlug}`, false);
    }
  };

  fetchIssueAttributes = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<IKpiIssueAttribute> => {
    const attribute = await this.kpiService.getIssueAttributes(workspaceSlug, projectId, issueId);
    runInAction(() => set(this.issueAttributes, [issueId], attribute));
    return attribute;
  };

  updateIssueAttributes = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<IKpiIssueAttribute>
  ): Promise<IKpiIssueAttribute> => {
    const attribute = await this.kpiService.updateIssueAttributes(workspaceSlug, projectId, issueId, data);
    // Refresh the scored list so Vp/Vf reflect the new attributes.
    await this.fetchProjectIssues(workspaceSlug, projectId);
    return attribute;
  };

  updateIssuePriority = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    priority: string
  ): Promise<void> => {
    await this.kpiService.updateIssuePriority(workspaceSlug, projectId, issueId, priority);
    // Importance is derived from priority -> refresh so Vp/Vf update.
    await this.fetchProjectIssues(workspaceSlug, projectId);
  };

  preview = async (
    workspaceSlug: string,
    projectId: string,
    payload: { task: IKpiTaskInput; config?: Partial<IKpiConfig>; d_min?: number; d_max?: number }
  ): Promise<IKpiPreviewResponse> => this.kpiService.preview(workspaceSlug, projectId, payload);
}
