/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import set from "lodash-es/set";
// types
import type { IHelpdeskPortal, IHelpdeskRequest, IHelpdeskRequestComment, IHelpdeskRequestIssue } from "@plane/types";
// services
import { HelpdeskService } from "@plane/services";
// plane web store
import type { CoreRootStore } from "./root.store";

export interface IHelpdeskStore {
  // observables
  portals: Record<string, IHelpdeskPortal[]>; // workspaceSlug_projectId -> portals
  requests: Record<string, IHelpdeskRequest[]>; // workspaceSlug_projectId -> requests
  comments: Record<string, IHelpdeskRequestComment[]>; // requestId -> comments
  requestIssues: Record<string, IHelpdeskRequestIssue[]>; // requestId -> issues
  loadingState: Record<string, boolean>;
  errorState: Record<string, string | null>;

  // actions
  fetchPortals: (workspaceSlug: string, projectId: string) => Promise<IHelpdeskPortal[]>;
  fetchRequests: (workspaceSlug: string, projectId: string) => Promise<IHelpdeskRequest[]>;
  fetchRequestById: (workspaceSlug: string, projectId: string, requestId: string) => Promise<IHelpdeskRequest>;
  updateRequest: (
    workspaceSlug: string,
    projectId: string,
    requestId: string,
    data: Partial<IHelpdeskRequest>
  ) => Promise<IHelpdeskRequest>;
  createPortal: (workspaceSlug: string, projectId: string, data: Partial<IHelpdeskPortal>) => Promise<IHelpdeskPortal>;
  updatePortal: (
    workspaceSlug: string,
    projectId: string,
    portalId: string,
    data: Partial<IHelpdeskPortal>
  ) => Promise<IHelpdeskPortal>;

  fetchRequestComments: (
    workspaceSlug: string,
    projectId: string,
    requestId: string
  ) => Promise<IHelpdeskRequestComment[]>;
  createRequestComment: (
    workspaceSlug: string,
    projectId: string,
    requestId: string,
    data: Partial<IHelpdeskRequestComment>
  ) => Promise<IHelpdeskRequestComment>;

  fetchRequestIssues: (workspaceSlug: string, projectId: string, requestId: string) => Promise<IHelpdeskRequestIssue[]>;
  createRequestIssue: (
    workspaceSlug: string,
    projectId: string,
    requestId: string,
    data: Partial<IHelpdeskRequestIssue>
  ) => Promise<IHelpdeskRequestIssue>;
  hydrateLinkedIssues: (workspaceSlug: string, projectId: string, requestId: string) => Promise<void>;
  getProjectPortals: (workspaceSlug: string, projectId: string) => IHelpdeskPortal[];
  getProjectRequests: (workspaceSlug: string, projectId: string) => IHelpdeskRequest[];
  getRequestComments: (requestId: string) => IHelpdeskRequestComment[];
  getRequestIssues: (requestId: string) => IHelpdeskRequestIssue[];
  getRequestsGroupedByStatus: (
    workspaceSlug: string,
    projectId: string
  ) => Record<IHelpdeskRequest["status"], IHelpdeskRequest[]>;
  getCollectionState: (key: string) => { isLoading: boolean; error: string | null };
}

export class HelpdeskStore implements IHelpdeskStore {
  // observables
  portals: Record<string, IHelpdeskPortal[]> = {};
  requests: Record<string, IHelpdeskRequest[]> = {};
  comments: Record<string, IHelpdeskRequestComment[]> = {};
  requestIssues: Record<string, IHelpdeskRequestIssue[]> = {};
  loadingState: Record<string, boolean> = {};
  errorState: Record<string, string | null> = {};

  // services
  helpdeskService;
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      portals: observable,
      requests: observable,
      comments: observable,
      requestIssues: observable,
      loadingState: observable,
      errorState: observable,
      fetchPortals: action,
      fetchRequests: action,
      fetchRequestById: action,
      updateRequest: action,
      createPortal: action,
      updatePortal: action,
      fetchRequestComments: action,
      createRequestComment: action,
      fetchRequestIssues: action,
      createRequestIssue: action,
      hydrateLinkedIssues: action,
    });

    this.rootStore = _rootStore;
    this.helpdeskService = new HelpdeskService();
  }

  private getProjectKey = (workspaceSlug: string, projectId: string) => `${workspaceSlug}_${projectId}`;

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

  fetchPortals = async (workspaceSlug: string, projectId: string): Promise<IHelpdeskPortal[]> => {
    const key = `portals:${this.getProjectKey(workspaceSlug, projectId)}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getPortals(workspaceSlug, projectId);
      runInAction(() => {
        set(this.portals, [this.getProjectKey(workspaceSlug, projectId)], response);
      });
      this.stopLoading(key);
      return response;
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  fetchRequests = async (workspaceSlug: string, projectId: string): Promise<IHelpdeskRequest[]> => {
    const key = `requests:${this.getProjectKey(workspaceSlug, projectId)}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getRequests(workspaceSlug, projectId);
      runInAction(() => {
        set(this.requests, [this.getProjectKey(workspaceSlug, projectId)], response);
      });
      this.stopLoading(key);
      return response;
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  createPortal = async (
    workspaceSlug: string,
    projectId: string,
    data: Partial<IHelpdeskPortal>
  ): Promise<IHelpdeskPortal> => {
    const response = await this.helpdeskService.createPortal(workspaceSlug, projectId, data);
    runInAction(() => {
      const currentPortals = this.portals[`${workspaceSlug}_${projectId}`] || [];
      set(this.portals, [`${workspaceSlug}_${projectId}`], [...currentPortals, response]);
    });
    return response;
  };

  updatePortal = async (
    workspaceSlug: string,
    projectId: string,
    portalId: string,
    data: Partial<IHelpdeskPortal>
  ): Promise<IHelpdeskPortal> => {
    const response = await this.helpdeskService.updatePortal(workspaceSlug, projectId, portalId, data);
    runInAction(() => {
      const currentPortals = this.portals[`${workspaceSlug}_${projectId}`] || [];
      set(
        this.portals,
        [`${workspaceSlug}_${projectId}`],
        currentPortals.map((p) => (p.id === portalId ? response : p))
      );
    });
    return response;
  };

  fetchRequestById = async (workspaceSlug: string, projectId: string, requestId: string): Promise<IHelpdeskRequest> => {
    const key = `request:${requestId}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getRequestById(workspaceSlug, projectId, requestId);
      runInAction(() => {
        const list = this.requests[this.getProjectKey(workspaceSlug, projectId)] || [];
        const idx = list.findIndex((r) => r.id === requestId);
        if (idx !== -1) {
          list[idx] = response;
        } else {
          list.push(response);
        }
        set(this.requests, [this.getProjectKey(workspaceSlug, projectId)], [...list]);
      });
      this.stopLoading(key);
      return response;
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  updateRequest = async (
    workspaceSlug: string,
    projectId: string,
    requestId: string,
    data: Partial<IHelpdeskRequest>
  ): Promise<IHelpdeskRequest> => {
    const response = await this.helpdeskService.updateRequest(workspaceSlug, projectId, requestId, data);
    runInAction(() => {
      const requests = this.requests[this.getProjectKey(workspaceSlug, projectId)] || [];
      set(
        this.requests,
        [this.getProjectKey(workspaceSlug, projectId)],
        requests.map((request) => (request.id === requestId ? response : request))
      );
    });
    return response;
  };

  fetchRequestComments = async (
    workspaceSlug: string,
    projectId: string,
    requestId: string
  ): Promise<IHelpdeskRequestComment[]> => {
    const key = `comments:${requestId}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getRequestComments(workspaceSlug, projectId, requestId);
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
    projectId: string,
    requestId: string,
    data: Partial<IHelpdeskRequestComment>
  ): Promise<IHelpdeskRequestComment> => {
    const response = await this.helpdeskService.createRequestComment(workspaceSlug, projectId, requestId, data);
    runInAction(() => {
      const currentComments = this.comments[requestId] || [];
      set(this.comments, [requestId], [...currentComments, response]);
    });
    return response;
  };

  fetchRequestIssues = async (
    workspaceSlug: string,
    projectId: string,
    requestId: string
  ): Promise<IHelpdeskRequestIssue[]> => {
    const key = `request-issues:${requestId}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getRequestIssues(workspaceSlug, projectId);
      runInAction(() => {
        const grouped = response.reduce(
          (acc, curr) => {
            if (!acc[curr.request]) acc[curr.request] = [];
            acc[curr.request].push(curr);
            return acc;
          },
          {} as Record<string, IHelpdeskRequestIssue[]>
        );

        Object.keys(grouped).forEach((reqId) => {
          set(this.requestIssues, [reqId], grouped[reqId]);
        });

        if (!grouped[requestId]) {
          set(this.requestIssues, [requestId], []);
        }
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
    projectId: string,
    requestId: string,
    data: Partial<IHelpdeskRequestIssue>
  ): Promise<IHelpdeskRequestIssue> => {
    const response = await this.helpdeskService.createRequestIssue(workspaceSlug, projectId, {
      ...data,
      request: requestId,
    });
    runInAction(() => {
      const issues = this.requestIssues[requestId] || [];
      set(this.requestIssues, [requestId], [...issues, response]);
    });
    return response;
  };

  hydrateLinkedIssues = async (workspaceSlug: string, projectId: string, requestId: string): Promise<void> => {
    const issues = this.requestIssues[requestId] || [];
    const linkedIssueIds = issues.map((issue) => issue.issue).filter(Boolean);

    if (linkedIssueIds.length === 0) return;

    const missingIssueIds = linkedIssueIds.filter((issueId) => !this.rootStore.issue.issues.getIssueById(issueId));
    if (missingIssueIds.length === 0) return;

    await this.rootStore.issue.issues.getIssues(workspaceSlug, projectId, missingIssueIds);
  };

  getProjectPortals = computedFn((workspaceSlug: string, projectId: string) => {
    return this.portals[this.getProjectKey(workspaceSlug, projectId)] || [];
  });

  getProjectRequests = computedFn((workspaceSlug: string, projectId: string) => {
    return this.requests[this.getProjectKey(workspaceSlug, projectId)] || [];
  });

  getRequestComments = computedFn((requestId: string) => {
    return this.comments[requestId] || [];
  });

  getRequestIssues = computedFn((requestId: string) => {
    return this.requestIssues[requestId] || [];
  });

  getRequestsGroupedByStatus = computedFn((workspaceSlug: string, projectId: string) => {
    const grouped: Record<IHelpdeskRequest["status"], IHelpdeskRequest[]> = {
      open: [],
      in_progress: [],
      waiting: [],
      resolved: [],
      closed: [],
    };

    this.getProjectRequests(workspaceSlug, projectId).forEach((request) => {
      grouped[request.status].push(request);
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
