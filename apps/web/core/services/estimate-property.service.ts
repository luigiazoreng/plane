/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// types
import { API_BASE_URL } from "@plane/constants";
import type { IEstimateProperty, IIssueEstimatePropertyValue, TEstimatePropertyKpiRole } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class EstimatePropertyService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchProjectEstimateProperties(workspaceSlug: string, projectId: string): Promise<IEstimateProperty[]> {
    try {
      const { data } = await this.get(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/estimate-properties/`
      );
      return data || [];
    } catch (error) {
      throw error;
    }
  }

  async createEstimateProperty(
    workspaceSlug: string,
    projectId: string,
    payload: { name: string; estimate: string }
  ): Promise<IEstimateProperty> {
    try {
      const { data } = await this.post(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/estimate-properties/`,
        payload
      );
      return data;
    } catch (error) {
      throw error;
    }
  }

  async updateEstimateProperty(
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    payload: Partial<Pick<IEstimateProperty, "name" | "estimate" | "is_active" | "sort_order">>
  ): Promise<IEstimateProperty> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/estimate-properties/${propertyId}/`,
        payload
      );
      return data;
    } catch (error) {
      throw error;
    }
  }

  async deleteEstimateProperty(workspaceSlug: string, projectId: string, propertyId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/estimate-properties/${propertyId}/`);
    } catch (error) {
      throw error;
    }
  }

  async fetchIssueEstimatePropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<IIssueEstimatePropertyValue[]> {
    try {
      const { data } = await this.get(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/estimate-properties/`
      );
      return data || [];
    } catch (error) {
      throw error;
    }
  }

  /** Upsert the single reserved property for a KPI role (Difficulty/Repetitive).
   * Passing `estimateId: null` clears/removes the role's property. */
  async upsertKpiRoleEstimateProperty(
    workspaceSlug: string,
    projectId: string,
    role: TEstimatePropertyKpiRole,
    estimateId: string | null
  ): Promise<IEstimateProperty | undefined> {
    try {
      const { data } = await this.put(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/estimate-properties/kpi-role/${role}/`,
        { estimate: estimateId }
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async updateIssueEstimatePropertyValue(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyId: string,
    estimatePointId: string | null
  ): Promise<IIssueEstimatePropertyValue> {
    try {
      const { data } = await this.put(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/estimate-properties/${propertyId}/`,
        { estimate_point: estimatePointId }
      );
      return data;
    } catch (error) {
      throw error;
    }
  }
}

const estimatePropertyService = new EstimatePropertyService();

export default estimatePropertyService;
