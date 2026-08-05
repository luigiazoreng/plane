/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { IHelpdeskAnalyticsFilters, IHelpdeskAnalyticsResponse } from "@plane/types";
// services
import { HelpdeskService } from "@plane/services";
// plane web store
import type { CoreRootStore } from "./root.store";

export interface IHelpdeskAnalyticsStore {
  analyticsData: Record<string, IHelpdeskAnalyticsResponse>;
  loadingState: Record<string, boolean>;
  errorState: Record<string, string | null>;

  fetchAnalytics: (workspaceSlug: string, filters: IHelpdeskAnalyticsFilters) => Promise<IHelpdeskAnalyticsResponse>;
  getAnalytics: (workspaceSlug: string, filters: IHelpdeskAnalyticsFilters) => IHelpdeskAnalyticsResponse | undefined;
  isLoading: (workspaceSlug: string, filters: IHelpdeskAnalyticsFilters) => boolean;
  getError: (workspaceSlug: string, filters: IHelpdeskAnalyticsFilters) => string | null;
}

const cacheKey = (workspaceSlug: string, filters: IHelpdeskAnalyticsFilters): string =>
  `${workspaceSlug}:${filters.date_filter}:${filters.start_date ?? ""}:${filters.end_date ?? ""}:${filters.portal_id ?? "all"}`;

export class HelpdeskAnalyticsStore implements IHelpdeskAnalyticsStore {
  analyticsData: Record<string, IHelpdeskAnalyticsResponse> = {};
  loadingState: Record<string, boolean> = {};
  errorState: Record<string, string | null> = {};

  private helpdeskService: HelpdeskService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      analyticsData: observable,
      loadingState: observable,
      errorState: observable,
      fetchAnalytics: action,
    });
    this.helpdeskService = new HelpdeskService();
  }

  getAnalytics = computedFn(
    (workspaceSlug: string, filters: IHelpdeskAnalyticsFilters): IHelpdeskAnalyticsResponse | undefined =>
      this.analyticsData[cacheKey(workspaceSlug, filters)]
  );

  isLoading = computedFn(
    (workspaceSlug: string, filters: IHelpdeskAnalyticsFilters): boolean =>
      this.loadingState[cacheKey(workspaceSlug, filters)] ?? false
  );

  getError = computedFn(
    (workspaceSlug: string, filters: IHelpdeskAnalyticsFilters): string | null =>
      this.errorState[cacheKey(workspaceSlug, filters)] ?? null
  );

  fetchAnalytics = async (
    workspaceSlug: string,
    filters: IHelpdeskAnalyticsFilters
  ): Promise<IHelpdeskAnalyticsResponse> => {
    const key = cacheKey(workspaceSlug, filters);
    runInAction(() => {
      this.loadingState[key] = true;
      this.errorState[key] = null;
    });
    try {
      const data = await this.helpdeskService.getAnalytics(workspaceSlug, filters);
      runInAction(() => {
        this.analyticsData[key] = data;
        this.loadingState[key] = false;
      });
      return data;
    } catch (error: any) {
      runInAction(() => {
        this.errorState[key] = error?.message ?? "Failed to load analytics";
        this.loadingState[key] = false;
      });
      throw error;
    }
  };
}
