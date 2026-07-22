/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import set from "lodash-es/set";
// types
import type {
  EHelpdeskMemberRole,
  IHelpdeskCustomer,
  IHelpdeskForm,
  IHelpdeskFormField,
  IHelpdeskLinkedIssueLookupResult,
  IHelpdeskMember,
  IHelpdeskPaginatedResponse,
  IHelpdeskPortal,
  IHelpdeskRequest,
  IHelpdeskRequestComment,
  IHelpdeskRequestIntakeIssue,
  IHelpdeskRequestIssue,
  IHelpdeskStatus,
} from "@plane/types";
// services
import { HelpdeskService } from "@plane/services";
// plane web store
import type { CoreRootStore } from "./root.store";

export interface IHelpdeskStore {
  // The service instance, exposed for calls that are pure passthrough and do
  // not belong in observable state -- attachment uploads and email logs.
  helpdeskService: HelpdeskService;
  // observables
  statuses: Record<string, IHelpdeskStatus[]>; // workspaceSlug -> statuses (ordered by sequence)
  portals: Record<string, IHelpdeskPortal[]>; // workspaceSlug -> portals
  forms: Record<string, IHelpdeskForm[]>; // portalId -> forms
  formFields: Record<string, IHelpdeskFormField[]>; // formId -> fields
  requests: Record<string, IHelpdeskRequest[]>; // workspaceSlug -> requests
  comments: Record<string, IHelpdeskRequestComment[]>; // requestId -> comments
  requestIssues: Record<string, IHelpdeskRequestIssue[]>; // requestId -> issues
  requestIntakeIssues: Record<string, IHelpdeskRequestIntakeIssue[]>; // requestId -> intake issue links
  linkedIssueProjectMap: Record<string, string>; // issueId -> projectId
  unresolvedLinkedIssues: Record<string, string[]>; // requestId -> unresolved issue ids
  members: Record<string, IHelpdeskMember[]>; // workspaceSlug -> helpdesk members
  customers: Record<string, IHelpdeskCustomer[]>; // workspaceSlug -> helpdesk customers
  loadingState: Record<string, boolean>;
  errorState: Record<string, string | null>;

  // status actions
  fetchStatuses: (workspaceSlug: string) => Promise<IHelpdeskStatus[]>;
  createStatus: (workspaceSlug: string, data: Partial<IHelpdeskStatus>) => Promise<IHelpdeskStatus>;
  updateStatus: (workspaceSlug: string, statusId: string, data: Partial<IHelpdeskStatus>) => Promise<IHelpdeskStatus>;
  deleteStatus: (workspaceSlug: string, statusId: string) => Promise<void>;
  reorderStatuses: (workspaceSlug: string, items: { id: string; sequence: number }[]) => Promise<void>;
  setDefaultStatus: (workspaceSlug: string, statusId: string) => Promise<void>;

  // portal actions
  fetchPortals: (workspaceSlug: string) => Promise<IHelpdeskPortal[]>;
  createPortal: (workspaceSlug: string, data: Partial<IHelpdeskPortal>) => Promise<IHelpdeskPortal>;
  updatePortal: (workspaceSlug: string, portalId: string, data: Partial<IHelpdeskPortal>) => Promise<IHelpdeskPortal>;
  deletePortal: (workspaceSlug: string, portalId: string) => Promise<void>;

  // form actions
  fetchForms: (workspaceSlug: string, portalId: string) => Promise<IHelpdeskForm[]>;
  createForm: (workspaceSlug: string, data: Partial<IHelpdeskForm>) => Promise<IHelpdeskForm>;
  updateForm: (workspaceSlug: string, formId: string, data: Partial<IHelpdeskForm>) => Promise<IHelpdeskForm>;
  deleteForm: (workspaceSlug: string, formId: string, portalId: string) => Promise<void>;
  reorderForms: (workspaceSlug: string, portalId: string, items: { id: string; sequence: number }[]) => Promise<void>;
  setFormActive: (workspaceSlug: string, formId: string, portalId: string, isActive: boolean) => Promise<IHelpdeskForm>;
  fetchFormFields: (workspaceSlug: string, formId: string) => Promise<IHelpdeskFormField[]>;
  createFormField: (workspaceSlug: string, data: Partial<IHelpdeskFormField>) => Promise<IHelpdeskFormField>;
  updateFormField: (
    workspaceSlug: string,
    fieldId: string,
    data: Partial<IHelpdeskFormField>
  ) => Promise<IHelpdeskFormField>;
  deleteFormField: (workspaceSlug: string, fieldId: string, formId: string) => Promise<void>;
  reorderFormFields: (
    workspaceSlug: string,
    formId: string,
    items: { id: string; sequence: number }[]
  ) => Promise<void>;

  // pagination state (per workspaceSlug)
  requestPagination: Record<string, { nextCursor: string | null; nextPageResults: boolean; totalCount: number }>;
  // pagination state per (workspaceSlug, statusId) — used by kanban per-column infinite scroll
  requestPaginationByStatus: Record<
    string,
    Record<string, { nextCursor: string | null; nextPageResults: boolean; totalCount: number }>
  >;

  // request actions
  fetchRequests: (workspaceSlug: string, params?: Record<string, string | string[]>) => Promise<IHelpdeskRequest[]>;
  fetchMoreRequests: (workspaceSlug: string, params?: Record<string, string | string[]>) => Promise<IHelpdeskRequest[]>;
  fetchMoreRequestsForStatus: (
    workspaceSlug: string,
    statusId: string,
    params?: Record<string, string | string[]>
  ) => Promise<IHelpdeskRequest[]>;
  fetchRequestById: (workspaceSlug: string, requestId: string) => Promise<IHelpdeskRequest>;
  createRequest: (workspaceSlug: string, data: Partial<IHelpdeskRequest>) => Promise<IHelpdeskRequest>;
  updateRequest: (
    workspaceSlug: string,
    requestId: string,
    data: Partial<IHelpdeskRequest>
  ) => Promise<IHelpdeskRequest>;
  archiveRequest: (workspaceSlug: string, requestId: string) => Promise<void>;
  unarchiveRequest: (workspaceSlug: string, requestId: string) => Promise<void>;

  // comment actions
  fetchRequestComments: (workspaceSlug: string, requestId: string) => Promise<IHelpdeskRequestComment[]>;
  createRequestComment: (
    workspaceSlug: string,
    requestId: string,
    data: Partial<IHelpdeskRequestComment>
  ) => Promise<IHelpdeskRequestComment>;

  // issue link actions
  fetchRequestIssues: (workspaceSlug: string, requestId: string) => Promise<IHelpdeskRequestIssue[]>;
  createRequestIssue: (
    workspaceSlug: string,
    requestId: string,
    data: Partial<IHelpdeskRequestIssue>
  ) => Promise<IHelpdeskRequestIssue>;
  deleteRequest: (workspaceSlug: string, requestId: string) => Promise<void>;
  deleteRequestIssue: (workspaceSlug: string, requestIssueId: string, requestId: string) => Promise<void>;
  hydrateLinkedIssues: (workspaceSlug: string, requestId: string) => Promise<void>;

  // intake link actions
  fetchRequestIntakeIssues: (workspaceSlug: string, requestId: string) => Promise<IHelpdeskRequestIntakeIssue[]>;
  createRequestIntakeIssue: (
    workspaceSlug: string,
    requestId: string,
    data: { project: string; title: string; description?: string }
  ) => Promise<IHelpdeskRequestIntakeIssue>;
  deleteRequestIntakeIssue: (workspaceSlug: string, requestIntakeIssueId: string, requestId: string) => Promise<void>;

  // member actions
  fetchMembers: (workspaceSlug: string) => Promise<IHelpdeskMember[]>;
  addMembers: (
    workspaceSlug: string,
    members: { member_id: string; role: EHelpdeskMemberRole }[]
  ) => Promise<IHelpdeskMember[]>;
  updateMember: (
    workspaceSlug: string,
    memberId: string,
    data: { role: EHelpdeskMemberRole }
  ) => Promise<IHelpdeskMember>;
  removeMember: (workspaceSlug: string, memberId: string) => Promise<void>;

  // computed getters
  getWorkspaceStatuses: (workspaceSlug: string) => IHelpdeskStatus[];
  getDefaultStatus: (workspaceSlug: string) => IHelpdeskStatus | undefined;
  getWorkspacePortals: (workspaceSlug: string) => IHelpdeskPortal[];
  getPortalForms: (portalId: string) => IHelpdeskForm[];
  getFormFields: (formId: string) => IHelpdeskFormField[];
  getWorkspaceRequests: (workspaceSlug: string) => IHelpdeskRequest[];
  getRequestComments: (requestId: string) => IHelpdeskRequestComment[];
  getRequestIssues: (requestId: string) => IHelpdeskRequestIssue[];
  getRequestIntakeIssues: (requestId: string) => IHelpdeskRequestIntakeIssue[];
  getUnresolvedLinkedIssues: (requestId: string) => string[];
  getRequestsGroupedByStatus: (workspaceSlug: string) => Record<string, IHelpdeskRequest[]>;
  getCollectionState: (key: string) => { isLoading: boolean; error: string | null };
  getStatusPagination: (
    workspaceSlug: string,
    statusId: string
  ) => { nextCursor: string | null; nextPageResults: boolean; totalCount: number } | undefined;
  getWorkspaceMembers: (workspaceSlug: string) => IHelpdeskMember[];
  // customer actions
  fetchCustomers: (workspaceSlug: string) => Promise<IHelpdeskCustomer[]>;
  updateCustomer: (
    workspaceSlug: string,
    customerId: string,
    data: Partial<Pick<IHelpdeskCustomer, "name" | "is_active">>
  ) => Promise<IHelpdeskCustomer>;
  deleteCustomer: (workspaceSlug: string, customerId: string) => Promise<void>;
  getWorkspaceCustomers: (workspaceSlug: string) => IHelpdeskCustomer[];
}

export class HelpdeskStore implements IHelpdeskStore {
  statuses: Record<string, IHelpdeskStatus[]> = {};
  portals: Record<string, IHelpdeskPortal[]> = {};
  forms: Record<string, IHelpdeskForm[]> = {};
  formFields: Record<string, IHelpdeskFormField[]> = {};
  requests: Record<string, IHelpdeskRequest[]> = {};
  requestPagination: Record<string, { nextCursor: string | null; nextPageResults: boolean; totalCount: number }> = {};
  requestPaginationByStatus: Record<
    string,
    Record<string, { nextCursor: string | null; nextPageResults: boolean; totalCount: number }>
  > = {};
  comments: Record<string, IHelpdeskRequestComment[]> = {};
  requestIssues: Record<string, IHelpdeskRequestIssue[]> = {};
  requestIntakeIssues: Record<string, IHelpdeskRequestIntakeIssue[]> = {};
  linkedIssueProjectMap: Record<string, string> = {};
  unresolvedLinkedIssues: Record<string, string[]> = {};
  members: Record<string, IHelpdeskMember[]> = {};
  customers: Record<string, IHelpdeskCustomer[]> = {};
  loadingState: Record<string, boolean> = {};
  errorState: Record<string, string | null> = {};

  helpdeskService: HelpdeskService;
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      statuses: observable,
      portals: observable,
      forms: observable,
      formFields: observable,
      requests: observable,
      requestPagination: observable,
      requestPaginationByStatus: observable,
      comments: observable,
      requestIssues: observable,
      requestIntakeIssues: observable,
      linkedIssueProjectMap: observable,
      unresolvedLinkedIssues: observable,
      loadingState: observable,
      errorState: observable,
      fetchStatuses: action,
      createStatus: action,
      updateStatus: action,
      deleteStatus: action,
      reorderStatuses: action,
      setDefaultStatus: action,
      fetchPortals: action,
      createPortal: action,
      updatePortal: action,
      deletePortal: action,
      fetchForms: action,
      createForm: action,
      updateForm: action,
      deleteForm: action,
      reorderForms: action,
      setFormActive: action,
      fetchFormFields: action,
      createFormField: action,
      updateFormField: action,
      deleteFormField: action,
      reorderFormFields: action,
      fetchRequests: action,
      fetchMoreRequests: action,
      fetchMoreRequestsForStatus: action,
      fetchRequestById: action,
      createRequest: action,
      updateRequest: action,
      fetchRequestComments: action,
      createRequestComment: action,
      fetchRequestIssues: action,
      createRequestIssue: action,
      deleteRequest: action,
      deleteRequestIssue: action,
      hydrateLinkedIssues: action,
      fetchRequestIntakeIssues: action,
      createRequestIntakeIssue: action,
      deleteRequestIntakeIssue: action,
      members: observable,
      fetchMembers: action,
      addMembers: action,
      updateMember: action,
      removeMember: action,
      customers: observable,
      fetchCustomers: action,
      updateCustomer: action,
      deleteCustomer: action,
    });

    this.rootStore = _rootStore;
    this.helpdeskService = new HelpdeskService();
  }

  private startLoading = (key: string) => {
    runInAction(() => {
      set(this.loadingState, [key], true);
      set(this.errorState, [key], null);
    });
  };

  private stopLoading = (key: string, error?: unknown) => {
    runInAction(() => {
      set(this.loadingState, [key], false);
      set(this.errorState, [key], error instanceof Error ? error.message : error ? String(error) : null);
    });
  };

  private setLinkedIssueProjects = (mappings: IHelpdeskLinkedIssueLookupResult[]) => {
    runInAction(() => {
      mappings.forEach(({ id, project_id }) => {
        if (id && project_id) set(this.linkedIssueProjectMap, [id], project_id);
      });
    });
  };

  private groupIssueIdsByProject = (issueIds: string[]): Record<string, string[]> =>
    issueIds.reduce(
      (acc, issueId) => {
        const projectId = this.linkedIssueProjectMap[issueId];
        if (!projectId) return acc;
        if (!acc[projectId]) acc[projectId] = [];
        acc[projectId].push(issueId);
        return acc;
      },
      {} as Record<string, string[]>
    );

  private sortBySequence = <T extends { sequence: number }>(items: T[]): T[] =>
    // eslint-disable-next-line unicorn/no-array-sort -- ES2022 target does not include Array.prototype.toSorted.
    [...items].sort((a: T, b: T) => a.sequence - b.sequence);

  // --- Statuses ---

  fetchStatuses = async (workspaceSlug: string): Promise<IHelpdeskStatus[]> => {
    const key = `statuses:${workspaceSlug}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getStatuses(workspaceSlug);
      if (Array.isArray(response)) {
        runInAction(() => {
          set(this.statuses, [workspaceSlug], response);
        });
      }
      this.stopLoading(key);
      return response ?? [];
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  createStatus = async (workspaceSlug: string, data: Partial<IHelpdeskStatus>): Promise<IHelpdeskStatus> => {
    const response = await this.helpdeskService.createStatus(workspaceSlug, data);
    runInAction(() => {
      const current = this.statuses[workspaceSlug] || [];
      set(this.statuses, [workspaceSlug], this.sortBySequence([...current, response]));
    });
    return response;
  };

  updateStatus = async (
    workspaceSlug: string,
    statusId: string,
    data: Partial<IHelpdeskStatus>
  ): Promise<IHelpdeskStatus> => {
    const response = await this.helpdeskService.updateStatus(workspaceSlug, statusId, data);
    runInAction(() => {
      const current = this.statuses[workspaceSlug] || [];
      set(
        this.statuses,
        [workspaceSlug],
        current.map((s) => (s.id === statusId ? response : s))
      );
    });
    return response;
  };

  deleteStatus = async (workspaceSlug: string, statusId: string): Promise<void> => {
    await this.helpdeskService.deleteStatus(workspaceSlug, statusId);
    runInAction(() => {
      const current = this.statuses[workspaceSlug] || [];
      set(
        this.statuses,
        [workspaceSlug],
        current.filter((s) => s.id !== statusId)
      );
    });
  };

  reorderStatuses = async (workspaceSlug: string, items: { id: string; sequence: number }[]): Promise<void> => {
    // Optimistic update
    runInAction(() => {
      const current = this.statuses[workspaceSlug] || [];
      const seqMap = Object.fromEntries(items.map((i) => [i.id, i.sequence]));
      set(
        this.statuses,
        [workspaceSlug],
        this.sortBySequence(
          current.map((s) => (seqMap[s.id] !== undefined ? Object.assign({}, s, { sequence: seqMap[s.id] }) : s))
        )
      );
    });
    await this.helpdeskService.reorderStatuses(workspaceSlug, items);
  };

  setDefaultStatus = async (workspaceSlug: string, statusId: string): Promise<void> => {
    await this.helpdeskService.setDefaultStatus(workspaceSlug, statusId);
    runInAction(() => {
      const current = this.statuses[workspaceSlug] || [];
      set(
        this.statuses,
        [workspaceSlug],
        current.map((s) => Object.assign({}, s, { is_default: s.id === statusId }))
      );
    });
  };

  // --- Portals ---

  fetchPortals = async (workspaceSlug: string): Promise<IHelpdeskPortal[]> => {
    const key = `portals:${workspaceSlug}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getPortals(workspaceSlug);
      if (Array.isArray(response)) {
        runInAction(() => {
          set(this.portals, [workspaceSlug], response);
        });
      }
      this.stopLoading(key);
      return response ?? [];
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  createPortal = async (workspaceSlug: string, data: Partial<IHelpdeskPortal>): Promise<IHelpdeskPortal> => {
    const response = await this.helpdeskService.createPortal(workspaceSlug, data);
    runInAction(() => {
      const current = this.portals[workspaceSlug] || [];
      set(this.portals, [workspaceSlug], [...current, response]);
    });
    return response;
  };

  updatePortal = async (
    workspaceSlug: string,
    portalId: string,
    data: Partial<IHelpdeskPortal>
  ): Promise<IHelpdeskPortal> => {
    const response = await this.helpdeskService.updatePortal(workspaceSlug, portalId, data);
    runInAction(() => {
      const current = this.portals[workspaceSlug] || [];
      set(
        this.portals,
        [workspaceSlug],
        current.map((p) => (p.id === portalId ? response : p))
      );
    });
    return response;
  };

  deletePortal = async (workspaceSlug: string, portalId: string): Promise<void> => {
    await this.helpdeskService.deletePortal(workspaceSlug, portalId);
    runInAction(() => {
      const current = this.portals[workspaceSlug] || [];
      set(
        this.portals,
        [workspaceSlug],
        current.filter((p) => p.id !== portalId)
      );
    });
  };

  // --- Forms ---

  fetchForms = async (workspaceSlug: string, portalId: string): Promise<IHelpdeskForm[]> => {
    const key = `forms:${portalId}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getForms(workspaceSlug, portalId);
      runInAction(() => {
        set(this.forms, [portalId], response);
      });
      this.stopLoading(key);
      return response;
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  createForm = async (workspaceSlug: string, data: Partial<IHelpdeskForm>): Promise<IHelpdeskForm> => {
    const response = await this.helpdeskService.createForm(workspaceSlug, data);
    runInAction(() => {
      const portalId = response.portal;
      const current = this.forms[portalId] || [];
      set(this.forms, [portalId], this.sortBySequence([...current, response]));
      set(this.formFields, [response.id], response.fields_detail || []);
    });
    return response;
  };

  updateForm = async (workspaceSlug: string, formId: string, data: Partial<IHelpdeskForm>): Promise<IHelpdeskForm> => {
    const response = await this.helpdeskService.updateForm(workspaceSlug, formId, data);
    runInAction(() => {
      const portalId = response.portal;
      const current = this.forms[portalId] || [];
      set(this.forms, [portalId], this.sortBySequence(current.map((form) => (form.id === formId ? response : form))));
      set(this.formFields, [response.id], response.fields_detail || this.formFields[response.id] || []);
    });
    return response;
  };

  deleteForm = async (workspaceSlug: string, formId: string, portalId: string): Promise<void> => {
    await this.helpdeskService.deleteForm(workspaceSlug, formId);
    runInAction(() => {
      const current = this.forms[portalId] || [];
      set(
        this.forms,
        [portalId],
        current.filter((form) => form.id !== formId)
      );
      set(this.formFields, [formId], []);
    });
  };

  reorderForms = async (
    workspaceSlug: string,
    portalId: string,
    items: { id: string; sequence: number }[]
  ): Promise<void> => {
    runInAction(() => {
      const current = this.forms[portalId] || [];
      const seqMap = Object.fromEntries(items.map((item) => [item.id, item.sequence]));
      set(
        this.forms,
        [portalId],
        this.sortBySequence(
          current.map((form) =>
            seqMap[form.id] !== undefined ? Object.assign({}, form, { sequence: seqMap[form.id] }) : form
          )
        )
      );
    });
    const response = await this.helpdeskService.reorderForms(workspaceSlug, items);
    runInAction(() => {
      set(
        this.forms,
        [portalId],
        response.filter((form) => form.portal === portalId)
      );
    });
  };

  setFormActive = async (
    workspaceSlug: string,
    formId: string,
    portalId: string,
    isActive: boolean
  ): Promise<IHelpdeskForm> => {
    const response = await this.helpdeskService.setFormActive(workspaceSlug, formId, isActive);
    runInAction(() => {
      const current = this.forms[portalId] || [];
      set(
        this.forms,
        [portalId],
        current.map((form) => (form.id === formId ? response : form))
      );
    });
    return response;
  };

  fetchFormFields = async (workspaceSlug: string, formId: string): Promise<IHelpdeskFormField[]> => {
    const key = `form-fields:${formId}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getFormFields(workspaceSlug, formId);
      runInAction(() => {
        set(this.formFields, [formId], response);
      });
      this.stopLoading(key);
      return response;
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  createFormField = async (workspaceSlug: string, data: Partial<IHelpdeskFormField>): Promise<IHelpdeskFormField> => {
    const response = await this.helpdeskService.createFormField(workspaceSlug, data);
    runInAction(() => {
      const current = this.formFields[response.form] || [];
      set(this.formFields, [response.form], this.sortBySequence([...current, response]));
    });
    return response;
  };

  updateFormField = async (
    workspaceSlug: string,
    fieldId: string,
    data: Partial<IHelpdeskFormField>
  ): Promise<IHelpdeskFormField> => {
    const response = await this.helpdeskService.updateFormField(workspaceSlug, fieldId, data);
    runInAction(() => {
      const current = this.formFields[response.form] || [];
      set(
        this.formFields,
        [response.form],
        this.sortBySequence(current.map((field) => (field.id === fieldId ? response : field)))
      );
    });
    return response;
  };

  deleteFormField = async (workspaceSlug: string, fieldId: string, formId: string): Promise<void> => {
    await this.helpdeskService.deleteFormField(workspaceSlug, fieldId);
    runInAction(() => {
      const current = this.formFields[formId] || [];
      set(
        this.formFields,
        [formId],
        current.filter((field) => field.id !== fieldId)
      );
    });
  };

  reorderFormFields = async (
    workspaceSlug: string,
    formId: string,
    items: { id: string; sequence: number }[]
  ): Promise<void> => {
    runInAction(() => {
      const current = this.formFields[formId] || [];
      const seqMap = Object.fromEntries(items.map((item) => [item.id, item.sequence]));
      set(
        this.formFields,
        [formId],
        this.sortBySequence(
          current.map((field) =>
            seqMap[field.id] !== undefined ? Object.assign({}, field, { sequence: seqMap[field.id] }) : field
          )
        )
      );
    });
    const response = await this.helpdeskService.reorderFormFields(workspaceSlug, items);
    runInAction(() => {
      set(
        this.formFields,
        [formId],
        response.filter((field) => field.form === formId)
      );
    });
  };

  // --- Requests ---

  private _applyPaginatedResponse = (workspaceSlug: string, response: IHelpdeskPaginatedResponse, append: boolean) => {
    runInAction(() => {
      const incoming = Array.isArray(response?.results) ? response.results : [];
      const existing = append ? this.requests[workspaceSlug] || [] : [];
      let merged: IHelpdeskRequest[];
      if (append && existing.length > 0) {
        const existingIds = new Set(existing.map((r) => r.id));
        const newItems = incoming.filter((r) => !existingIds.has(r.id));
        merged = [...existing, ...newItems];
      } else {
        merged = [...existing, ...incoming];
      }
      set(this.requests, [workspaceSlug], merged);
      set(this.requestPagination, [workspaceSlug], {
        nextCursor: response?.next_page_results ? (response.next_cursor ?? null) : null,
        nextPageResults: response?.next_page_results ?? false,
        totalCount: response?.total_count ?? response?.total_results ?? existing.length + incoming.length,
      });
    });
  };

  private _applyPaginatedResponseForStatus = (
    workspaceSlug: string,
    statusId: string,
    response: IHelpdeskPaginatedResponse
  ) => {
    runInAction(() => {
      const incoming = Array.isArray(response?.results) ? response.results : [];
      const existing = this.requests[workspaceSlug] || [];
      const existingIds = new Set(existing.map((r) => r.id));
      const newItems = incoming.filter((r) => !existingIds.has(r.id));
      set(this.requests, [workspaceSlug], [...existing, ...newItems]);
      set(this.requestPaginationByStatus, [workspaceSlug, statusId], {
        nextCursor: response?.next_page_results ? (response.next_cursor ?? null) : null,
        nextPageResults: response?.next_page_results ?? false,
        totalCount: response?.total_count ?? response?.total_results ?? 0,
      });
    });
  };

  fetchRequests = async (
    workspaceSlug: string,
    params?: Record<string, string | string[]>
  ): Promise<IHelpdeskRequest[]> => {
    const key = `requests:${workspaceSlug}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getRequests(workspaceSlug, params);
      this._applyPaginatedResponse(workspaceSlug, response, false);
      // Reset per-status cursors so filter/search changes cause fresh per-column fetches
      runInAction(() => {
        set(this.requestPaginationByStatus, [workspaceSlug], {});
      });
      this.stopLoading(key);
      return this.requests[workspaceSlug] ?? [];
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  fetchMoreRequests = async (
    workspaceSlug: string,
    params?: Record<string, string | string[]>
  ): Promise<IHelpdeskRequest[]> => {
    const key = `requests-more:${workspaceSlug}`;
    const pagination = this.requestPagination[workspaceSlug];
    if (!pagination?.nextPageResults || !pagination.nextCursor) return this.requests[workspaceSlug] ?? [];
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getRequests(workspaceSlug, {
        ...params,
        cursor: pagination.nextCursor,
      });
      this._applyPaginatedResponse(workspaceSlug, response, true);
      this.stopLoading(key);
      return this.requests[workspaceSlug] ?? [];
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  fetchMoreRequestsForStatus = async (
    workspaceSlug: string,
    statusId: string,
    params?: Record<string, string | string[]>
  ): Promise<IHelpdeskRequest[]> => {
    const key = `requests-more:${workspaceSlug}:${statusId}`;
    const pagination = this.requestPaginationByStatus[workspaceSlug]?.[statusId];

    // If we know there are no more pages for this status, bail out
    if (pagination !== undefined && (!pagination.nextPageResults || !pagination.nextCursor)) {
      return this.requests[workspaceSlug] ?? [];
    }
    // Guard against concurrent fetch for the same status column
    if (this.loadingState[key]) return this.requests[workspaceSlug] ?? [];

    this.startLoading(key);
    try {
      const requestParams: Record<string, string | string[]> = {
        ...params,
        status: statusId,
      };
      // cold start (pagination === undefined) → no cursor → fetches page 1 for this status
      if (pagination?.nextCursor) requestParams.cursor = pagination.nextCursor;

      const response = await this.helpdeskService.getRequests(workspaceSlug, requestParams);
      this._applyPaginatedResponseForStatus(workspaceSlug, statusId, response);
      this.stopLoading(key);
      return this.requests[workspaceSlug] ?? [];
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  fetchRequestById = async (workspaceSlug: string, requestId: string): Promise<IHelpdeskRequest> => {
    const key = `request:${requestId}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getRequestById(workspaceSlug, requestId);
      runInAction(() => {
        const list = this.requests[workspaceSlug] || [];
        const idx = list.findIndex((r) => r.id === requestId);
        if (idx !== -1) {
          // update in-place (covers request.updated events)
          list[idx] = response;
          set(this.requests, [workspaceSlug], [...list]);
        } else {
          // request.created: prepend to the visible list and bump totalCount so
          // the header counter stays accurate. Do NOT push to the end — that
          // would place the new item behind a "Load more" boundary.
          set(this.requests, [workspaceSlug], [response, ...list]);
          const pagination = this.requestPagination[workspaceSlug];
          if (pagination) {
            set(this.requestPagination, [workspaceSlug], {
              ...pagination,
              totalCount: pagination.totalCount + 1,
            });
          }
        }
      });
      this.stopLoading(key);
      return response;
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  createRequest = async (workspaceSlug: string, data: Partial<IHelpdeskRequest>): Promise<IHelpdeskRequest> => {
    const response = await this.helpdeskService.createRequest(workspaceSlug, data);
    runInAction(() => {
      const current = this.requests[workspaceSlug] || [];
      set(this.requests, [workspaceSlug], [...current, response]);
    });
    return response;
  };

  updateRequest = async (
    workspaceSlug: string,
    requestId: string,
    data: Partial<IHelpdeskRequest>
  ): Promise<IHelpdeskRequest> => {
    const response = await this.helpdeskService.updateRequest(workspaceSlug, requestId, data);
    runInAction(() => {
      const list = this.requests[workspaceSlug] || [];
      set(
        this.requests,
        [workspaceSlug],
        list.map((r) => (r.id === requestId ? response : r))
      );
    });
    return response;
  };

  deleteRequest = async (workspaceSlug: string, requestId: string): Promise<void> => {
    await this.helpdeskService.deleteRequest(workspaceSlug, requestId);
    runInAction(() => {
      const current = this.requests[workspaceSlug] || [];
      set(
        this.requests,
        [workspaceSlug],
        current.filter((request) => request.id !== requestId)
      );
      set(this.comments, [requestId], []);
      set(this.requestIssues, [requestId], []);
      set(this.requestIntakeIssues, [requestId], []);
      set(this.unresolvedLinkedIssues, [requestId], []);
      const pagination = this.requestPagination[workspaceSlug];
      if (pagination) {
        set(this.requestPagination, [workspaceSlug], {
          ...pagination,
          totalCount: Math.max(0, pagination.totalCount - 1),
        });
      }
    });
  };

  archiveRequest = async (workspaceSlug: string, requestId: string): Promise<void> => {
    await this.helpdeskService.archiveRequest(workspaceSlug, requestId);
    runInAction(() => {
      const current = this.requests[workspaceSlug] || [];
      set(
        this.requests,
        [workspaceSlug],
        current.filter((request) => request.id !== requestId)
      );
      const pagination = this.requestPagination[workspaceSlug];
      if (pagination) {
        set(this.requestPagination, [workspaceSlug], {
          ...pagination,
          totalCount: Math.max(0, pagination.totalCount - 1),
        });
      }
    });
  };

  unarchiveRequest = async (workspaceSlug: string, requestId: string): Promise<void> => {
    await this.helpdeskService.unarchiveRequest(workspaceSlug, requestId);
    runInAction(() => {
      const list = this.requests[workspaceSlug] || [];
      const next = list.slice();
      const index = next.findIndex((request) => request.id === requestId);
      if (index >= 0) next[index].archived_at = null;
      set(this.requests, [workspaceSlug], next);
    });
  };

  // --- Comments ---

  fetchRequestComments = async (workspaceSlug: string, requestId: string): Promise<IHelpdeskRequestComment[]> => {
    const key = `comments:${requestId}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getRequestComments(workspaceSlug, requestId);
      runInAction(() => {
        set(this.comments, [requestId], response);
      });
      this.stopLoading(key);
      return response;
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  createRequestComment = async (
    workspaceSlug: string,
    requestId: string,
    data: Partial<IHelpdeskRequestComment>
  ): Promise<IHelpdeskRequestComment> => {
    const response = await this.helpdeskService.createRequestComment(workspaceSlug, requestId, data);
    runInAction(() => {
      const current = this.comments[requestId] || [];
      set(this.comments, [requestId], [...current, response]);
    });
    return response;
  };

  // --- Issue Links ---

  fetchRequestIssues = async (workspaceSlug: string, requestId: string): Promise<IHelpdeskRequestIssue[]> => {
    const key = `request-issues:${requestId}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getRequestIssues(workspaceSlug, requestId);
      runInAction(() => {
        set(this.requestIssues, [requestId], response);
        set(this.unresolvedLinkedIssues, [requestId], []);
      });
      this.stopLoading(key);
      return response;
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  createRequestIssue = async (
    workspaceSlug: string,
    requestId: string,
    data: Partial<IHelpdeskRequestIssue>
  ): Promise<IHelpdeskRequestIssue> => {
    const response = await this.helpdeskService.createRequestIssue(workspaceSlug, { ...data, request: requestId });
    runInAction(() => {
      const current = this.requestIssues[requestId] || [];
      set(this.requestIssues, [requestId], [...current, response]);
    });
    return response;
  };

  deleteRequestIssue = async (workspaceSlug: string, requestIssueId: string, requestId: string): Promise<void> => {
    await this.helpdeskService.deleteRequestIssue(workspaceSlug, requestIssueId);
    runInAction(() => {
      const current = this.requestIssues[requestId] || [];
      set(
        this.requestIssues,
        [requestId],
        current.filter((ri) => ri.id !== requestIssueId)
      );
    });
  };

  hydrateLinkedIssues = async (workspaceSlug: string, requestId: string): Promise<void> => {
    const issues = this.requestIssues[requestId] || [];
    const linkedIssueIds = issues.map((i) => i.issue).filter(Boolean);
    if (linkedIssueIds.length === 0) return;

    const intakeLinks = this.requestIntakeIssues[requestId] || [];
    const intakeMappings = intakeLinks
      .filter((link) => link.issue_id && link.forwarded_to_project)
      .map((link) => ({ id: link.issue_id as string, project_id: link.forwarded_to_project }));

    this.setLinkedIssueProjects(intakeMappings);

    let missing = linkedIssueIds.filter((id) => !this.rootStore.issue.issues.getIssueById(id));
    if (missing.length === 0) {
      runInAction(() => {
        set(this.unresolvedLinkedIssues, [requestId], []);
      });
      return;
    }

    const hydrateKnownIssues = async (issueIds: string[]) => {
      const grouped = this.groupIssueIdsByProject(issueIds);
      await Promise.all(
        Object.entries(grouped).map(([projectId, projectIssueIds]) =>
          this.rootStore.issue.issues.getIssues(workspaceSlug, projectId, projectIssueIds)
        )
      );
    };

    await hydrateKnownIssues(missing);
    missing = linkedIssueIds.filter((id) => !this.rootStore.issue.issues.getIssueById(id));
    if (missing.length === 0) {
      runInAction(() => {
        set(this.unresolvedLinkedIssues, [requestId], []);
      });
      return;
    }

    const lookupResponse = await this.helpdeskService.lookupLinkedIssues(workspaceSlug, missing);
    this.setLinkedIssueProjects(lookupResponse.results);
    await hydrateKnownIssues(missing);

    const unresolved = linkedIssueIds.filter((id) => !this.rootStore.issue.issues.getIssueById(id));
    runInAction(() => {
      set(this.unresolvedLinkedIssues, [requestId], unresolved);
    });
  };

  // --- Intake Issue Links ---

  fetchRequestIntakeIssues = async (
    workspaceSlug: string,
    requestId: string
  ): Promise<IHelpdeskRequestIntakeIssue[]> => {
    const key = `request-intake-issues:${requestId}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getRequestIntakeIssues(workspaceSlug, requestId);
      runInAction(() => {
        set(this.requestIntakeIssues, [requestId], response);
      });
      this.stopLoading(key);
      return response;
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  createRequestIntakeIssue = async (
    workspaceSlug: string,
    requestId: string,
    data: { project: string; title: string; description?: string }
  ): Promise<IHelpdeskRequestIntakeIssue> => {
    const response = await this.helpdeskService.createRequestIntakeIssue(workspaceSlug, {
      ...data,
      request: requestId,
    });
    runInAction(() => {
      const current = this.requestIntakeIssues[requestId] || [];
      set(this.requestIntakeIssues, [requestId], [...current, response]);
    });
    return response;
  };

  deleteRequestIntakeIssue = async (
    workspaceSlug: string,
    requestIntakeIssueId: string,
    requestId: string
  ): Promise<void> => {
    await this.helpdeskService.deleteRequestIntakeIssue(workspaceSlug, requestIntakeIssueId);
    runInAction(() => {
      const current = this.requestIntakeIssues[requestId] || [];
      set(
        this.requestIntakeIssues,
        [requestId],
        current.filter((ri) => ri.id !== requestIntakeIssueId)
      );
    });
  };

  // --- Computed getters ---

  getWorkspaceStatuses = computedFn((workspaceSlug: string) => {
    return this.statuses[workspaceSlug] || [];
  });

  getDefaultStatus = computedFn((workspaceSlug: string) => {
    return (this.statuses[workspaceSlug] || []).find((s) => s.is_default);
  });

  getWorkspacePortals = computedFn((workspaceSlug: string) => {
    return this.portals[workspaceSlug] || [];
  });

  getPortalForms = computedFn((portalId: string) => {
    return this.forms[portalId] || [];
  });

  getFormFields = computedFn((formId: string) => {
    return this.formFields[formId] || [];
  });

  getWorkspaceRequests = computedFn((workspaceSlug: string) => {
    return this.requests[workspaceSlug] || [];
  });

  getRequestComments = computedFn((requestId: string) => {
    return this.comments[requestId] || [];
  });

  getRequestIssues = computedFn((requestId: string) => {
    return this.requestIssues[requestId] || [];
  });

  getRequestIntakeIssues = computedFn((requestId: string) => {
    return this.requestIntakeIssues[requestId] || [];
  });

  getUnresolvedLinkedIssues = computedFn((requestId: string) => {
    return this.unresolvedLinkedIssues[requestId] || [];
  });

  getRequestsGroupedByStatus = computedFn((workspaceSlug: string) => {
    const grouped: Record<string, IHelpdeskRequest[]> = {};
    const statuses = this.getWorkspaceStatuses(workspaceSlug);

    // Init empty arrays for every known status
    statuses.forEach((s) => {
      grouped[s.id] = [];
    });
    // Bucket "no status" fallback
    grouped["__none__"] = [];

    this.getWorkspaceRequests(workspaceSlug).forEach((request) => {
      const key = request.status ?? "__none__";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(request);
    });

    return grouped;
  });

  getCollectionState = computedFn((key: string) => {
    return {
      isLoading: this.loadingState[key] ?? false,
      error: this.errorState[key] ?? null,
    };
  });

  getStatusPagination = computedFn((workspaceSlug: string, statusId: string) => {
    return this.requestPaginationByStatus[workspaceSlug]?.[statusId];
  });

  getWorkspaceMembers = computedFn((workspaceSlug: string) => {
    return this.members[workspaceSlug] || [];
  });

  // --- Members ---

  fetchMembers = async (workspaceSlug: string): Promise<IHelpdeskMember[]> => {
    const key = `members:${workspaceSlug}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getMembers(workspaceSlug);
      runInAction(() => {
        if (Array.isArray(response)) set(this.members, [workspaceSlug], response);
      });
      this.stopLoading(key);
      return response ?? [];
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  addMembers = async (
    workspaceSlug: string,
    members: { member_id: string; role: EHelpdeskMemberRole }[]
  ): Promise<IHelpdeskMember[]> => {
    const response = await this.helpdeskService.addMembers(workspaceSlug, members);
    runInAction(() => {
      if (!Array.isArray(response)) return;
      const current = this.members[workspaceSlug] || [];
      const existingIds = new Set(current.map((m) => m.id));
      const newItems = response.filter((m) => !existingIds.has(m.id));
      const updated = current.map((m) => response.find((r) => r.id === m.id) ?? m);
      set(this.members, [workspaceSlug], [...updated, ...newItems]);
    });
    return response;
  };

  updateMember = async (
    workspaceSlug: string,
    memberId: string,
    data: { role: EHelpdeskMemberRole }
  ): Promise<IHelpdeskMember> => {
    const response = await this.helpdeskService.updateMember(workspaceSlug, memberId, data);
    runInAction(() => {
      const current = this.members[workspaceSlug] || [];
      set(
        this.members,
        [workspaceSlug],
        current.map((m) => (m.id === memberId ? response : m))
      );
    });
    return response;
  };

  removeMember = async (workspaceSlug: string, memberId: string): Promise<void> => {
    await this.helpdeskService.removeMember(workspaceSlug, memberId);
    runInAction(() => {
      const current = this.members[workspaceSlug] || [];
      set(
        this.members,
        [workspaceSlug],
        current.filter((m) => m.id !== memberId)
      );
    });
  };

  // --- Customer management ---

  getWorkspaceCustomers = computedFn((workspaceSlug: string): IHelpdeskCustomer[] => {
    return this.customers[workspaceSlug] || [];
  });

  fetchCustomers = async (workspaceSlug: string): Promise<IHelpdeskCustomer[]> => {
    const key = `customers:${workspaceSlug}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getCustomers(workspaceSlug);
      runInAction(() => {
        if (Array.isArray(response)) set(this.customers, [workspaceSlug], response);
      });
      this.stopLoading(key);
      return response;
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  updateCustomer = async (
    workspaceSlug: string,
    customerId: string,
    data: Partial<Pick<IHelpdeskCustomer, "name" | "is_active">>
  ): Promise<IHelpdeskCustomer> => {
    const response = await this.helpdeskService.updateCustomer(workspaceSlug, customerId, data);
    runInAction(() => {
      const current = this.customers[workspaceSlug] || [];
      set(
        this.customers,
        [workspaceSlug],
        current.map((c) => (c.id === customerId ? response : c))
      );
    });
    return response;
  };

  deleteCustomer = async (workspaceSlug: string, customerId: string): Promise<void> => {
    await this.helpdeskService.deleteCustomer(workspaceSlug, customerId);
    runInAction(() => {
      const current = this.customers[workspaceSlug] || [];
      set(
        this.customers,
        [workspaceSlug],
        current.filter((c) => c.id !== customerId)
      );
    });
  };
}
