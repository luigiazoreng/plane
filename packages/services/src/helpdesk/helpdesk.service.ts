/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "../api.service";
import type {
  EHelpdeskMemberRole,
  IHelpdeskAnalyticsFilters,
  IHelpdeskAnalyticsResponse,
  IHelpdeskCustomer,
  IHelpdeskForm,
  IHelpdeskFormField,
  IHelpdeskLinkedIssueLookupResponse,
  IHelpdeskMember,
  IHelpdeskPaginatedResponse,
  IHelpdeskPortal,
  IHelpdeskRequest,
  IHelpdeskRequestComment,
  IHelpdeskRequestIntakeIssue,
  IHelpdeskRequestIssue,
  IHelpdeskStatus,
} from "@plane/types";

export class HelpdeskService extends APIService {
  constructor(BASE_URL?: string) {
    super((BASE_URL || API_BASE_URL) + "/api/workspaces/");
  }

  // --- Status Management ---

  async getStatuses(workspaceSlug: string): Promise<IHelpdeskStatus[]> {
    return this.get(`${workspaceSlug}/helpdesk/statuses/`).then((res) => res?.data);
  }

  async createStatus(workspaceSlug: string, data: Partial<IHelpdeskStatus>): Promise<IHelpdeskStatus> {
    return this.post(`${workspaceSlug}/helpdesk/statuses/`, data).then((res) => res?.data);
  }

  async updateStatus(
    workspaceSlug: string,
    statusId: string,
    data: Partial<IHelpdeskStatus>
  ): Promise<IHelpdeskStatus> {
    return this.patch(`${workspaceSlug}/helpdesk/statuses/${statusId}/`, data).then((res) => res?.data);
  }

  async deleteStatus(workspaceSlug: string, statusId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/helpdesk/statuses/${statusId}/`).then((res) => res?.data);
  }

  async reorderStatuses(workspaceSlug: string, items: { id: string; sequence: number }[]): Promise<IHelpdeskStatus[]> {
    return this.post(`${workspaceSlug}/helpdesk/statuses/reorder/`, items).then((res) => res?.data);
  }

  async setDefaultStatus(workspaceSlug: string, statusId: string): Promise<IHelpdeskStatus> {
    return this.post(`${workspaceSlug}/helpdesk/statuses/${statusId}/set-default/`, {}).then((res) => res?.data);
  }

  // --- Portal Management ---

  async getPortals(workspaceSlug: string): Promise<IHelpdeskPortal[]> {
    return this.get(`${workspaceSlug}/helpdesk/portals/`).then((res) => res?.data);
  }

  async createPortal(workspaceSlug: string, data: Partial<IHelpdeskPortal>): Promise<IHelpdeskPortal> {
    return this.post(`${workspaceSlug}/helpdesk/portals/`, data).then((res) => res?.data);
  }

  async updatePortal(
    workspaceSlug: string,
    portalId: string,
    data: Partial<IHelpdeskPortal>
  ): Promise<IHelpdeskPortal> {
    return this.patch(`${workspaceSlug}/helpdesk/portals/${portalId}/`, data).then((res) => res?.data);
  }

  async deletePortal(workspaceSlug: string, portalId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/helpdesk/portals/${portalId}/`).then((res) => res?.data);
  }

  // --- Form Management ---

  async getForms(workspaceSlug: string, portalId?: string): Promise<IHelpdeskForm[]> {
    return this.get(`${workspaceSlug}/helpdesk/forms/`, {
      params: portalId ? { portal: portalId } : undefined,
    }).then((res) => res?.data);
  }

  async createForm(workspaceSlug: string, data: Partial<IHelpdeskForm>): Promise<IHelpdeskForm> {
    return this.post(`${workspaceSlug}/helpdesk/forms/`, data).then((res) => res?.data);
  }

  async updateForm(workspaceSlug: string, formId: string, data: Partial<IHelpdeskForm>): Promise<IHelpdeskForm> {
    return this.patch(`${workspaceSlug}/helpdesk/forms/${formId}/`, data).then((res) => res?.data);
  }

  async deleteForm(workspaceSlug: string, formId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/helpdesk/forms/${formId}/`).then((res) => res?.data);
  }

  async reorderForms(workspaceSlug: string, items: { id: string; sequence: number }[]): Promise<IHelpdeskForm[]> {
    return this.post(`${workspaceSlug}/helpdesk/forms/reorder/`, items).then((res) => res?.data);
  }

  async setFormActive(workspaceSlug: string, formId: string, is_active: boolean): Promise<IHelpdeskForm> {
    return this.post(`${workspaceSlug}/helpdesk/forms/${formId}/set-active/`, { is_active }).then((res) => res?.data);
  }

  async getFormFields(workspaceSlug: string, formId?: string): Promise<IHelpdeskFormField[]> {
    return this.get(`${workspaceSlug}/helpdesk/form-fields/`, {
      params: formId ? { form: formId } : undefined,
    }).then((res) => res?.data);
  }

  async createFormField(workspaceSlug: string, data: Partial<IHelpdeskFormField>): Promise<IHelpdeskFormField> {
    return this.post(`${workspaceSlug}/helpdesk/form-fields/`, data).then((res) => res?.data);
  }

  async updateFormField(
    workspaceSlug: string,
    fieldId: string,
    data: Partial<IHelpdeskFormField>
  ): Promise<IHelpdeskFormField> {
    return this.patch(`${workspaceSlug}/helpdesk/form-fields/${fieldId}/`, data).then((res) => res?.data);
  }

  async deleteFormField(workspaceSlug: string, fieldId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/helpdesk/form-fields/${fieldId}/`).then((res) => res?.data);
  }

  async reorderFormFields(
    workspaceSlug: string,
    items: { id: string; sequence: number }[]
  ): Promise<IHelpdeskFormField[]> {
    return this.post(`${workspaceSlug}/helpdesk/form-fields/reorder/`, items).then((res) => res?.data);
  }

  // --- Requests Management ---

  async getRequests(
    workspaceSlug: string,
    params?: Record<string, string | string[]>
  ): Promise<IHelpdeskPaginatedResponse> {
    return this.get(`${workspaceSlug}/helpdesk/requests/`, { params }).then((res) => res?.data);
  }

  async getRequestById(workspaceSlug: string, requestId: string): Promise<IHelpdeskRequest> {
    return this.get(`${workspaceSlug}/helpdesk/requests/${requestId}/`).then((res) => res?.data);
  }

  async createRequest(workspaceSlug: string, data: Partial<IHelpdeskRequest>): Promise<IHelpdeskRequest> {
    return this.post(`${workspaceSlug}/helpdesk/requests/`, data).then((res) => res?.data);
  }

  async updateRequest(
    workspaceSlug: string,
    requestId: string,
    data: Partial<IHelpdeskRequest>
  ): Promise<IHelpdeskRequest> {
    return this.patch(`${workspaceSlug}/helpdesk/requests/${requestId}/`, data).then((res) => res?.data);
  }

  async deleteRequest(workspaceSlug: string, requestId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/helpdesk/requests/${requestId}/`).then((res) => res?.data);
  }

  async archiveRequest(workspaceSlug: string, requestId: string): Promise<{ archived_at: string }> {
    return this.post(`${workspaceSlug}/helpdesk/requests/${requestId}/archive/`, {}).then((res) => res?.data);
  }

  async unarchiveRequest(workspaceSlug: string, requestId: string): Promise<{ archived_at: null }> {
    return this.delete(`${workspaceSlug}/helpdesk/requests/${requestId}/archive/`).then((res) => res?.data);
  }

  // --- Comments Management ---

  async getRequestComments(workspaceSlug: string, requestId: string): Promise<IHelpdeskRequestComment[]> {
    return this.get(`${workspaceSlug}/helpdesk/requests/${requestId}/comments/`).then((res) => res?.data);
  }

  async createRequestComment(
    workspaceSlug: string,
    requestId: string,
    data: Partial<IHelpdeskRequestComment>
  ): Promise<IHelpdeskRequestComment> {
    return this.post(`${workspaceSlug}/helpdesk/requests/${requestId}/comments/`, data).then((res) => res?.data);
  }

  // --- Issue Links ---

  async getRequestIssues(workspaceSlug: string, requestId: string): Promise<IHelpdeskRequestIssue[]> {
    return this.get(`${workspaceSlug}/helpdesk/request-issues/`, { params: { request: requestId } }).then(
      (res) => res?.data
    );
  }

  async createRequestIssue(
    workspaceSlug: string,
    data: Partial<IHelpdeskRequestIssue>
  ): Promise<IHelpdeskRequestIssue> {
    return this.post(`${workspaceSlug}/helpdesk/request-issues/`, data).then((res) => res?.data);
  }

  async deleteRequestIssue(workspaceSlug: string, requestIssueId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/helpdesk/request-issues/${requestIssueId}/`).then((res) => res?.data);
  }

  async lookupLinkedIssues(workspaceSlug: string, issueIds: string[]): Promise<IHelpdeskLinkedIssueLookupResponse> {
    return this.get(`${workspaceSlug}/helpdesk/linked-issues/lookup/`, {
      params: { issue_ids: issueIds },
      paramsSerializer: {
        indexes: null,
      },
    }).then((res) => res?.data);
  }

  // --- Intake Issue Links (forwarding to dev) ---

  async getRequestIntakeIssues(workspaceSlug: string, requestId: string): Promise<IHelpdeskRequestIntakeIssue[]> {
    return this.get(`${workspaceSlug}/helpdesk/request-intake-issues/`, { params: { request: requestId } }).then(
      (res) => res?.data
    );
  }

  async createRequestIntakeIssue(
    workspaceSlug: string,
    data: { request: string; project: string; title: string; description?: string }
  ): Promise<IHelpdeskRequestIntakeIssue> {
    return this.post(`${workspaceSlug}/helpdesk/request-intake-issues/`, data).then((res) => res?.data);
  }

  async deleteRequestIntakeIssue(workspaceSlug: string, requestIntakeIssueId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/helpdesk/request-intake-issues/${requestIntakeIssueId}/`).then(
      (res) => res?.data
    );
  }

  // --- Analytics ---

  async getAnalytics(workspaceSlug: string, filters: IHelpdeskAnalyticsFilters): Promise<IHelpdeskAnalyticsResponse> {
    return this.get(`${workspaceSlug}/helpdesk/analytics/`, { params: filters }).then((res) => res?.data);
  }

  // --- Member Management ---

  async getMembers(workspaceSlug: string): Promise<IHelpdeskMember[]> {
    return this.get(`${workspaceSlug}/helpdesk/members/`).then((res) => res?.data);
  }

  async addMembers(
    workspaceSlug: string,
    members: { member_id: string; role: EHelpdeskMemberRole }[]
  ): Promise<IHelpdeskMember[]> {
    return this.post(`${workspaceSlug}/helpdesk/members/`, { members }).then((res) => res?.data);
  }

  async updateMember(
    workspaceSlug: string,
    memberId: string,
    data: { role: EHelpdeskMemberRole }
  ): Promise<IHelpdeskMember> {
    return this.patch(`${workspaceSlug}/helpdesk/members/${memberId}/`, data).then((res) => res?.data);
  }

  async removeMember(workspaceSlug: string, memberId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/helpdesk/members/${memberId}/`).then((res) => res?.data);
  }

  // --- Customer Management (admin) ---

  async getCustomers(workspaceSlug: string): Promise<IHelpdeskCustomer[]> {
    return this.get(`${workspaceSlug}/helpdesk/customers/`).then((res) => res?.data);
  }

  async updateCustomer(
    workspaceSlug: string,
    customerId: string,
    data: Partial<Pick<IHelpdeskCustomer, "name" | "is_active">>
  ): Promise<IHelpdeskCustomer> {
    return this.patch(`${workspaceSlug}/helpdesk/customers/${customerId}/`, data).then((res) => res?.data);
  }

  async deleteCustomer(workspaceSlug: string, customerId: string): Promise<void> {
    return this.delete(`${workspaceSlug}/helpdesk/customers/${customerId}/`).then((res) => res?.data);
  }
}

export class PublicHelpdeskService extends APIService {
  constructor(BASE_URL?: string) {
    super((BASE_URL || API_BASE_URL) + "/api/helpdesk/public/");
  }

  // --- Customer Authentication ---

  async loginCustomer(publicSlug: string, data: any): Promise<{ token: string; customer: any }> {
    return this.post(`portals/${publicSlug}/auth/login/`, data).then((res) => res?.data);
  }

  async registerCustomer(publicSlug: string, data: any): Promise<{ token: string; customer: any }> {
    return this.post(`portals/${publicSlug}/auth/register/`, data).then((res) => res?.data);
  }

  async forgotPasswordCustomer(publicSlug: string, email: string): Promise<{ message: string }> {
    return this.post(`portals/${publicSlug}/auth/forgot-password/`, { email }).then((res) => res?.data);
  }

  async resetPasswordCustomer(publicSlug: string, token: string, password: string): Promise<{ message: string }> {
    return this.post(`portals/${publicSlug}/auth/reset-password/`, { token, password }).then((res) => res?.data);
  }

  // --- Customer Portal ---

  async getPublicRequests(publicSlug: string, token?: string): Promise<IHelpdeskRequest[]> {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return this.get(`portals/${publicSlug}/requests/`, config).then((res) => res?.data);
  }

  async getPublicPortal(publicSlug: string): Promise<IHelpdeskPortal> {
    return this.get(`portals/${publicSlug}/`).then((res) => res?.data);
  }

  async getPublicForms(publicSlug: string, token?: string): Promise<IHelpdeskForm[]> {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return this.get(`portals/${publicSlug}/forms/`, config).then((res) => res?.data);
  }

  async getPublicForm(publicSlug: string, formSlug: string, token?: string): Promise<IHelpdeskForm> {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return this.get(`portals/${publicSlug}/forms/${formSlug}/`, config).then((res) => res?.data);
  }

  async submitPublicForm(
    publicSlug: string,
    formSlug: string,
    data: Record<string, unknown>,
    token?: string
  ): Promise<IHelpdeskRequest> {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return this.post(`portals/${publicSlug}/forms/${formSlug}/submit/`, data, config).then((res) => res?.data);
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
