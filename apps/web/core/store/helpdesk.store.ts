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
  IHelpdeskForm,
  IHelpdeskFormField,
  IHelpdeskLinkedIssueLookupResult,
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

  // request actions
  fetchRequests: (workspaceSlug: string) => Promise<IHelpdeskRequest[]>;
  fetchRequestById: (workspaceSlug: string, requestId: string) => Promise<IHelpdeskRequest>;
  createRequest: (workspaceSlug: string, data: Partial<IHelpdeskRequest>) => Promise<IHelpdeskRequest>;
  updateRequest: (
    workspaceSlug: string,
    requestId: string,
    data: Partial<IHelpdeskRequest>
  ) => Promise<IHelpdeskRequest>;

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
}

export class HelpdeskStore implements IHelpdeskStore {
  statuses: Record<string, IHelpdeskStatus[]> = {};
  portals: Record<string, IHelpdeskPortal[]> = {};
  forms: Record<string, IHelpdeskForm[]> = {};
  formFields: Record<string, IHelpdeskFormField[]> = {};
  requests: Record<string, IHelpdeskRequest[]> = {};
  comments: Record<string, IHelpdeskRequestComment[]> = {};
  requestIssues: Record<string, IHelpdeskRequestIssue[]> = {};
  requestIntakeIssues: Record<string, IHelpdeskRequestIntakeIssue[]> = {};
  linkedIssueProjectMap: Record<string, string> = {};
  unresolvedLinkedIssues: Record<string, string[]> = {};
  loadingState: Record<string, boolean> = {};
  errorState: Record<string, string | null> = {};

  helpdeskService;
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      statuses: observable,
      portals: observable,
      forms: observable,
      formFields: observable,
      requests: observable,
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
      fetchRequestById: action,
      createRequest: action,
      updateRequest: action,
      fetchRequestComments: action,
      createRequestComment: action,
      fetchRequestIssues: action,
      createRequestIssue: action,
      deleteRequestIssue: action,
      hydrateLinkedIssues: action,
      fetchRequestIntakeIssues: action,
      createRequestIntakeIssue: action,
      deleteRequestIntakeIssue: action,
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
      set(
        this.statuses,
        [workspaceSlug],
        [...current, response].slice().toSorted((a, b) => a.sequence - b.sequence)
      );
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
        current
          .map((s) => (seqMap[s.id] !== undefined ? Object.assign({}, s, { sequence: seqMap[s.id] }) : s))
          .slice()
          .toSorted((a, b) => a.sequence - b.sequence)
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
      set(
        this.forms,
        [portalId],
        [...current, response].slice().toSorted((a, b) => a.sequence - b.sequence)
      );
      set(this.formFields, [response.id], response.fields_detail || []);
    });
    return response;
  };

  updateForm = async (workspaceSlug: string, formId: string, data: Partial<IHelpdeskForm>): Promise<IHelpdeskForm> => {
    const response = await this.helpdeskService.updateForm(workspaceSlug, formId, data);
    runInAction(() => {
      const portalId = response.portal;
      const current = this.forms[portalId] || [];
      set(
        this.forms,
        [portalId],
        current
          .map((form) => (form.id === formId ? response : form))
          .slice()
          .toSorted((a, b) => a.sequence - b.sequence)
      );
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
        current
          .map((form) =>
            seqMap[form.id] !== undefined ? Object.assign({}, form, { sequence: seqMap[form.id] }) : form
          )
          .slice()
          .toSorted((a, b) => a.sequence - b.sequence)
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
      set(
        this.formFields,
        [response.form],
        [...current, response].slice().toSorted((a, b) => a.sequence - b.sequence)
      );
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
        current
          .map((field) => (field.id === fieldId ? response : field))
          .slice()
          .toSorted((a, b) => a.sequence - b.sequence)
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
        current
          .map((field) =>
            seqMap[field.id] !== undefined ? Object.assign({}, field, { sequence: seqMap[field.id] }) : field
          )
          .slice()
          .toSorted((a, b) => a.sequence - b.sequence)
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

  fetchRequests = async (workspaceSlug: string): Promise<IHelpdeskRequest[]> => {
    const key = `requests:${workspaceSlug}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getRequests(workspaceSlug);
      if (Array.isArray(response)) {
        runInAction(() => {
          set(this.requests, [workspaceSlug], response);
        });
      }
      this.stopLoading(key);
      return response ?? [];
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
          list[idx] = response;
        } else {
          list.push(response);
        }
        set(this.requests, [workspaceSlug], [...list]);
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
}
