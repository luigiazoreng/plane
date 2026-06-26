/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  IKpiConfig,
  IKpiIssueAttribute,
  IKpiIssueEstimate,
  IKpiIssuePriority,
  IKpiIssueListResponse,
  IKpiPreviewResponse,
  IKpiTaskInput,
} from "@plane/types";
import { APIService } from "../api.service";

export class KpiService extends APIService {
  constructor(BASE_URL?: string) {
    super((BASE_URL || API_BASE_URL) + "/api/workspaces/");
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

  async getProjectIssues(workspaceSlug: string, projectId: string): Promise<IKpiIssueListResponse> {
    return this.get(`${workspaceSlug}/projects/${projectId}/kpi/issues/`).then((res) => res?.data);
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

  // --- Difficulty / Repetitive (KPI estimate points) ---

  async updateIssueDifficultyEstimate(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    estimatePointId: string | null
  ): Promise<IKpiIssueEstimate> {
    return this.put(`${workspaceSlug}/projects/${projectId}/kpi/issues/${issueId}/estimate/`, {
      estimate_point: estimatePointId,
    }).then((res) => res?.data);
  }

  async updateIssueEstimate(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    estimatePointId: string | null
  ): Promise<IKpiIssueEstimate> {
    return this.updateIssueDifficultyEstimate(workspaceSlug, projectId, issueId, estimatePointId);
  }

  async updateIssueRepetitiveEstimate(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    estimatePointId: string | null
  ): Promise<IKpiIssueEstimate> {
    return this.put(`${workspaceSlug}/projects/${projectId}/kpi/issues/${issueId}/repetitive-estimate/`, {
      estimate_point: estimatePointId,
    }).then((res) => res?.data);
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
