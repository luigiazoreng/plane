/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  IKpiConfig,
  IKpiIssueAttribute,
  IKpiIssuePriority,
  IKpiIssueListResponse,
  IKpiMemberAggregateResponse,
  IKpiOverviewResponse,
  IKpiPreviewResponse,
  IKpiTaskInput,
  IWorkspaceKpiAccess,
  TKpiPeriod,
} from "@plane/types";
import { APIService } from "../api.service";

export class KpiService extends APIService {
  constructor(BASE_URL?: string) {
    super((BASE_URL || API_BASE_URL) + "/api/workspaces/");
  }

  // --- Access grants ---

  /** Who, besides workspace admins, may open the workspace KPI panels. Admin-only. */
  async getAccessGrants(workspaceSlug: string): Promise<IWorkspaceKpiAccess[]> {
    return this.get(`${workspaceSlug}/kpi/access/`).then((res) => res?.data);
  }

  async grantAccess(workspaceSlug: string, memberIds: string[]): Promise<IWorkspaceKpiAccess[]> {
    return this.post(`${workspaceSlug}/kpi/access/`, { members: memberIds }).then((res) => res?.data);
  }

  async revokeAccess(workspaceSlug: string, grantId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/kpi/access/${grantId}/`).then((res) => res?.data);
  }

  // --- Configuration ---

  async getWorkspaceConfig(workspaceSlug: string): Promise<IKpiConfig> {
    return this.get(`${workspaceSlug}/kpi/config/`).then((res) => res?.data);
  }

  async updateWorkspaceConfig(workspaceSlug: string, data: Partial<IKpiConfig>): Promise<IKpiConfig> {
    return this.put(`${workspaceSlug}/kpi/config/`, data).then((res) => res?.data);
  }

  async getProjectConfig(workspaceSlug: string, projectId: string): Promise<IKpiConfig> {
    return this.get(`${workspaceSlug}/projects/${projectId}/kpi/config/`).then((res) => res?.data);
  }

  async updateProjectConfig(workspaceSlug: string, projectId: string, data: Partial<IKpiConfig>): Promise<IKpiConfig> {
    return this.put(`${workspaceSlug}/projects/${projectId}/kpi/config/`, data).then((res) => res?.data);
  }

  async resetProjectConfig(workspaceSlug: string, projectId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/projects/${projectId}/kpi/config/`).then((res) => res?.data);
  }

  // --- Issues scoring ---

  /** Omitting `period` keeps the endpoint's default, which is the whole project history. */
  async getProjectIssues(
    workspaceSlug: string,
    projectId: string,
    params?: { aggregates_only?: boolean; period?: TKpiPeriod; start?: string; end?: string }
  ): Promise<IKpiIssueListResponse> {
    return this.get(`${workspaceSlug}/projects/${projectId}/kpi/issues/`, { params }).then((res) => res?.data);
  }

  async getProjectMemberAggregates(
    workspaceSlug: string,
    projectId: string,
    params?: { period?: TKpiPeriod; start?: string; end?: string }
  ): Promise<IKpiMemberAggregateResponse> {
    return this.get(`${workspaceSlug}/projects/${projectId}/kpi/members/`, { params }).then((res) => res?.data);
  }

  async getWorkspaceMemberAggregates(workspaceSlug: string): Promise<IKpiMemberAggregateResponse> {
    return this.get(`${workspaceSlug}/kpi/members/`).then((res) => res?.data);
  }

  /**
   * Consolidated workspace panel: unified KPI + per-project + per-member.
   * Pass either `period` or an explicit `start`/`end` range (YYYY-MM-DD).
   */
  async getWorkspaceOverview(
    workspaceSlug: string,
    params?: { period?: TKpiPeriod; start?: string; end?: string }
  ): Promise<IKpiOverviewResponse> {
    return this.get(`${workspaceSlug}/kpi/overview/`, { params }).then((res) => res?.data);
  }

  async getIssueAttributes(workspaceSlug: string, projectId: string, issueId: string): Promise<IKpiIssueAttribute> {
    return this.get(`${workspaceSlug}/projects/${projectId}/kpi/issues/${issueId}/attributes/`).then(
      (res) => res?.data
    );
  }

  async updateIssueAttributes(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<IKpiIssueAttribute>
  ): Promise<IKpiIssueAttribute> {
    return this.put(`${workspaceSlug}/projects/${projectId}/kpi/issues/${issueId}/attributes/`, data).then(
      (res) => res?.data
    );
  }

  // --- Importance (native priority) ---

  async updateIssuePriority(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    priority: string
  ): Promise<IKpiIssuePriority> {
    return this.put(`${workspaceSlug}/projects/${projectId}/kpi/issues/${issueId}/priority/`, {
      priority,
    }).then((res) => res?.data);
  }

  // --- Preview / curve ---

  async preview(
    workspaceSlug: string,
    projectId: string,
    payload: { task: IKpiTaskInput; config?: Partial<IKpiConfig>; d_min?: number; d_max?: number }
  ): Promise<IKpiPreviewResponse> {
    return this.post(`${workspaceSlug}/projects/${projectId}/kpi/preview/`, payload).then((res) => res?.data);
  }
}
