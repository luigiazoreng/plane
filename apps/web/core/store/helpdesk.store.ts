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
  requests: Record<string, IHelpdeskRequest[]>; // workspaceSlug -> requests
  comments: Record<string, IHelpdeskRequestComment[]>; // requestId -> comments
  requestIssues: Record<string, IHelpdeskRequestIssue[]>; // requestId -> issues
  requestIntakeIssues: Record<string, IHelpdeskRequestIntakeIssue[]>; // requestId -> intake issue links
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
  getWorkspaceRequests: (workspaceSlug: string) => IHelpdeskRequest[];
  getRequestComments: (requestId: string) => IHelpdeskRequestComment[];
  getRequestIssues: (requestId: string) => IHelpdeskRequestIssue[];
  getRequestIntakeIssues: (requestId: string) => IHelpdeskRequestIntakeIssue[];
  getRequestsGroupedByStatus: (workspaceSlug: string) => Record<string, IHelpdeskRequest[]>;
  getCollectionState: (key: string) => { isLoading: boolean; error: string | null };
}

export class HelpdeskStore implements IHelpdeskStore {
  statuses: Record<string, IHelpdeskStatus[]> = {};
  portals: Record<string, IHelpdeskPortal[]> = {};
  requests: Record<string, IHelpdeskRequest[]> = {};
  comments: Record<string, IHelpdeskRequestComment[]> = {};
  requestIssues: Record<string, IHelpdeskRequestIssue[]> = {};
  requestIntakeIssues: Record<string, IHelpdeskRequestIntakeIssue[]> = {};
  loadingState: Record<string, boolean> = {};
  errorState: Record<string, string | null> = {};

  helpdeskService;
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      statuses: observable,
      portals: observable,
      requests: observable,
      comments: observable,
      requestIssues: observable,
      requestIntakeIssues: observable,
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

  // --- Statuses ---

  fetchStatuses = async (workspaceSlug: string): Promise<IHelpdeskStatus[]> => {
    const key = `statuses:${workspaceSlug}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getStatuses(workspaceSlug);
      runInAction(() => {
        set(this.statuses, [workspaceSlug], response);
      });
      this.stopLoading(key);
      return response;
    } catch (error) {
      this.stopLoading(key, error);
      throw error;
    }
  };

  createStatus = async (workspaceSlug: string, data: Partial<IHelpdeskStatus>): Promise<IHelpdeskStatus> => {
    const response = await this.helpdeskService.createStatus(workspaceSlug, data);
    runInAction(() => {
      const current = this.statuses[workspaceSlug] || [];
      set(this.statuses, [workspaceSlug], [...current, response].sort((a, b) => a.sequence - b.sequence));
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
        current.map((s) => (seqMap[s.id] !== undefined ? { ...s, sequence: seqMap[s.id] } : s))
          .sort((a, b) => a.sequence - b.sequence)
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
        current.map((s) => ({ ...s, is_default: s.id === statusId }))
      );
    });
  };

  // --- Portals ---

  fetchPortals = async (workspaceSlug: string): Promise<IHelpdeskPortal[]> => {
    const key = `portals:${workspaceSlug}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getPortals(workspaceSlug);
      runInAction(() => {
        set(this.portals, [workspaceSlug], response);
      });
      this.stopLoading(key);
      return response;
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

  // --- Requests ---

  fetchRequests = async (workspaceSlug: string): Promise<IHelpdeskRequest[]> => {
    const key = `requests:${workspaceSlug}`;
    this.startLoading(key);
    try {
      const response = await this.helpdeskService.getRequests(workspaceSlug);
      runInAction(() => {
        set(this.requests, [workspaceSlug], response);
      });
      this.stopLoading(key);
      return response;
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

    const missing = linkedIssueIds.filter((id) => !this.rootStore.issue.issues.getIssueById(id));
    if (missing.length === 0) return;

    // hydrateLinkedIssues needs a projectId for the issues API — fetch individually via workspace-level
    // For now we fetch per project by grouping missing ids — the issue store handles this
    await Promise.all(
      missing.map((issueId) => {
        const issue = this.rootStore.issue.issues.getIssueById(issueId);
        if (!issue) {
          // Issue not in store — attempt fetch (project is unknown here, skip silently)
        }
        return Promise.resolve();
      })
    );
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
