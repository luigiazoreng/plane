/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
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

  // actions
  fetchPortals: (workspaceSlug: string, projectId: string) => Promise<IHelpdeskPortal[]>;
  fetchRequests: (workspaceSlug: string, projectId: string) => Promise<IHelpdeskRequest[]>;
  fetchRequestById: (workspaceSlug: string, projectId: string, requestId: string) => Promise<IHelpdeskRequest>;
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
}

export class HelpdeskStore implements IHelpdeskStore {
  // observables
  portals: Record<string, IHelpdeskPortal[]> = {};
  requests: Record<string, IHelpdeskRequest[]> = {};
  comments: Record<string, IHelpdeskRequestComment[]> = {};
  requestIssues: Record<string, IHelpdeskRequestIssue[]> = {};

  // services
  helpdeskService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      portals: observable,
      requests: observable,
      comments: observable,
      requestIssues: observable,
      fetchPortals: action,
      fetchRequests: action,
      fetchRequestById: action,
      createPortal: action,
      updatePortal: action,
      fetchRequestComments: action,
      createRequestComment: action,
      fetchRequestIssues: action,
      createRequestIssue: action,
    });

    this.helpdeskService = new HelpdeskService();
  }

  fetchPortals = async (workspaceSlug: string, projectId: string): Promise<IHelpdeskPortal[]> => {
    const response = await this.helpdeskService.getPortals(workspaceSlug, projectId);
    runInAction(() => {
      set(this.portals, [`${workspaceSlug}_${projectId}`], response);
    });
    return response;
  };

  fetchRequests = async (workspaceSlug: string, projectId: string): Promise<IHelpdeskRequest[]> => {
    const response = await this.helpdeskService.getRequests(workspaceSlug, projectId);
    runInAction(() => {
      set(this.requests, [`${workspaceSlug}_${projectId}`], response);
    });
    return response;
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
    const response = await this.helpdeskService.getRequestById(workspaceSlug, projectId, requestId);
    runInAction(() => {
      const list = this.requests[`${workspaceSlug}_${projectId}`] || [];
      const idx = list.findIndex((r) => r.id === requestId);
      if (idx !== -1) {
        list[idx] = response;
      } else {
        list.push(response);
      }
      set(this.requests, [`${workspaceSlug}_${projectId}`], [...list]);
    });
    return response;
  };

  fetchRequestComments = async (
    workspaceSlug: string,
    projectId: string,
    requestId: string
  ): Promise<IHelpdeskRequestComment[]> => {
    const response = await this.helpdeskService.getRequestComments(workspaceSlug, projectId, requestId);
    runInAction(() => {
      set(this.comments, [requestId], response);
    });
    return response;
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
    _requestId: string
  ): Promise<IHelpdeskRequestIssue[]> => {
    // Assuming getRequestIssues fetches issues across all requests. Wait, the endpoint is getRequestIssues for the project.
    const response = await this.helpdeskService.getRequestIssues(workspaceSlug, projectId);
    runInAction(() => {
      // Group by requestId
      const grouped = response.reduce(
        (acc, curr) => {
          if (!acc[curr.request]) acc[curr.request] = [];
          acc[curr.request].push(curr);
          return acc;
        },
        {} as Record<string, IHelpdeskRequestIssue[]>
      );

      // Only override the ones returned
      Object.keys(grouped).forEach((reqId) => {
        set(this.requestIssues, [reqId], grouped[reqId]);
      });
    });
    return response;
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
}
