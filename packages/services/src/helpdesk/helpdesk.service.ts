/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "../api.service";
import type { IHelpdeskPortal, IHelpdeskRequest, IHelpdeskRequestComment, IHelpdeskRequestIssue } from "@plane/types";

export class HelpdeskService extends APIService {
  constructor(BASE_URL?: string) {
    super((BASE_URL || API_BASE_URL) + "/api/workspaces/");
  }

  // --- Portal Management (Agent) ---

  async getPortals(workspaceSlug: string, projectId: string): Promise<IHelpdeskPortal[]> {
    return this.get(`${workspaceSlug}/projects/${projectId}/helpdesk/portals/`).then((res) => res?.data);
  }

  async createPortal(
    workspaceSlug: string,
    projectId: string,
    data: Partial<IHelpdeskPortal>
  ): Promise<IHelpdeskPortal> {
    return this.post(`${workspaceSlug}/projects/${projectId}/helpdesk/portals/`, data).then((res) => res?.data);
  }

  async updatePortal(
    workspaceSlug: string,
    projectId: string,
    portalId: string,
    data: Partial<IHelpdeskPortal>
  ): Promise<IHelpdeskPortal> {
    return this.patch(`${workspaceSlug}/projects/${projectId}/helpdesk/portals/${portalId}/`, data).then(
      (res) => res?.data
    );
  }

  async deletePortal(workspaceSlug: string, projectId: string, portalId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/projects/${projectId}/helpdesk/portals/${portalId}/`).then((res) => res?.data);
  }

  // --- Requests Management (Agent) ---

  async getRequests(workspaceSlug: string, projectId: string): Promise<IHelpdeskRequest[]> {
    return this.get(`${workspaceSlug}/projects/${projectId}/helpdesk/requests/`).then((res) => res?.data);
  }

  async getRequestById(workspaceSlug: string, projectId: string, requestId: string): Promise<IHelpdeskRequest> {
    return this.get(`${workspaceSlug}/projects/${projectId}/helpdesk/requests/${requestId}/`).then((res) => res?.data);
  }

  async updateRequest(
    workspaceSlug: string,
    projectId: string,
    requestId: string,
    data: Partial<IHelpdeskRequest>
  ): Promise<IHelpdeskRequest> {
    return this.patch(`${workspaceSlug}/projects/${projectId}/helpdesk/requests/${requestId}/`, data).then(
      (res) => res?.data
    );
  }

  // --- Comments Management (Agent) ---

  async getRequestComments(
    workspaceSlug: string,
    projectId: string,
    requestId: string
  ): Promise<IHelpdeskRequestComment[]> {
    return this.get(`${workspaceSlug}/projects/${projectId}/helpdesk/requests/${requestId}/comments/`).then(
      (res) => res?.data
    );
  }

  async createRequestComment(
    workspaceSlug: string,
    projectId: string,
    requestId: string,
    data: Partial<IHelpdeskRequestComment>
  ): Promise<IHelpdeskRequestComment> {
    return this.post(`${workspaceSlug}/projects/${projectId}/helpdesk/requests/${requestId}/comments/`, data).then(
      (res) => res?.data
    );
  }

  // --- Issues Linking Management (Agent) ---

  async getRequestIssues(workspaceSlug: string, projectId: string): Promise<IHelpdeskRequestIssue[]> {
    return this.get(`${workspaceSlug}/projects/${projectId}/helpdesk/request-issues/`).then((res) => res?.data);
  }

  async createRequestIssue(
    workspaceSlug: string,
    projectId: string,
    data: Partial<IHelpdeskRequestIssue>
  ): Promise<IHelpdeskRequestIssue> {
    return this.post(`${workspaceSlug}/projects/${projectId}/helpdesk/request-issues/`, data).then((res) => res?.data);
  }

  async deleteRequestIssue(workspaceSlug: string, projectId: string, requestIssueId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/projects/${projectId}/helpdesk/request-issues/${requestIssueId}/`).then(
      (res) => res?.data
    );
  }
}

export class PublicHelpdeskService extends APIService {
  constructor(BASE_URL?: string) {
    super((BASE_URL || API_BASE_URL) + "/api/helpdesk/public/");
  }

  // --- Customer Authentication (Public) ---

  async loginCustomer(publicSlug: string, data: any): Promise<{ token: string; customer: any }> {
    return this.post(`portals/${publicSlug}/auth/login/`, data).then((res) => res?.data);
  }

  async registerCustomer(publicSlug: string, data: any): Promise<{ token: string; customer: any }> {
    return this.post(`portals/${publicSlug}/auth/register/`, data).then((res) => res?.data);
  }

  // --- Customer Portal (Public) ---

  async getPublicRequests(publicSlug: string, token?: string): Promise<IHelpdeskRequest[]> {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return this.get(`portals/${publicSlug}/requests/`, config).then((res) => res?.data);
  }

  async getPublicPortal(publicSlug: string): Promise<IHelpdeskPortal> {
    return this.get(`portals/${publicSlug}/`).then((res) => res?.data);
  }

  async createPublicRequest(
    publicSlug: string,
    data: Partial<IHelpdeskRequest>,
    token?: string
  ): Promise<IHelpdeskRequest> {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return this.post(`portals/${publicSlug}/requests/`, data, config).then((res) => res?.data);
  }

  async getPublicRequestById(publicSlug: string, requestId: string, token?: string): Promise<IHelpdeskRequest> {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return this.get(`portals/${publicSlug}/requests/${requestId}/`, config).then((res) => res?.data);
  }

  async getPublicRequestComments(
    publicSlug: string,
    requestId: string,
    token?: string
  ): Promise<IHelpdeskRequestComment[]> {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return this.get(`portals/${publicSlug}/requests/${requestId}/comments/`, config).then((res) => res?.data);
  }

  async createPublicRequestComment(
    publicSlug: string,
    requestId: string,
    data: Partial<IHelpdeskRequestComment>,
    token?: string
  ): Promise<IHelpdeskRequestComment> {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return this.post(`portals/${publicSlug}/requests/${requestId}/comments/`, data, config).then((res) => res?.data);
  }
}
