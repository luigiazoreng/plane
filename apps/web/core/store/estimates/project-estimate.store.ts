/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { unset, orderBy, set } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type {
  IEstimate as IEstimateType,
  IEstimateFormData,
  IEstimatePoint as IEstimatePointType,
  IEstimateProperty,
  IIssueEstimatePropertyValue,
  TEstimatePropertyKpiRole,
  TEstimateSystemKeys,
} from "@plane/types";
// plane web services
import estimateService from "@/services/estimate.service";
import estimatePropertyService from "@/services/estimate-property.service";
// plane web store
import type { IEstimate } from "@/plane-web/store/estimates/estimate";
import { Estimate } from "@/plane-web/store/estimates/estimate";
// store
import type { CoreRootStore } from "../root.store";

type TEstimateLoader = "init-loader" | "mutation-loader" | undefined;
type TErrorCodes = {
  status: string;
  message?: string;
};

export interface IProjectEstimateStore {
  // observables
  loader: TEstimateLoader;
  estimates: Record<string, IEstimate>;
  error: TErrorCodes | undefined;
  // F1/F2 (B1/I3): per-issue "has this issue's values been resolved this
  // session" guard, separate from `issueEstimatePropertyValues` itself --
  // an issue with zero values set leaves no key in that map, so it can't be
  // used to distinguish "never fetched" from "fetched, nothing there".
  issueValuesFetchState: Record<string, "in-flight" | "done">;
  // per-project "have this project's estimate properties been loaded this
  // session" guard, used by `ensureProjectEstimateProperties`.
  projectPropertiesFetchState: Record<string, "in-flight" | "done">;
  // computed
  currentActiveEstimateId: string | undefined;
  currentActiveEstimate: IEstimate | undefined;
  archivedEstimateIds: string[] | undefined;
  currentProjectEstimateType: TEstimateSystemKeys | undefined;
  areEstimateEnabledByProjectId: (projectId: string) => boolean;
  estimateIdsByProjectId: (projectId: string) => string[] | undefined;
  activeEstimateIdsByProjectId: (projectId: string) => string[] | undefined;
  currentActiveEstimateIdByProjectId: (projectId: string) => string | undefined;
  estimateById: (estimateId: string) => IEstimate | undefined;
  estimatePointById: (estimatePointId: string, projectId?: string) => IEstimatePointType | undefined;
  estimateByEstimatePointId: (estimatePointId: string, projectId?: string) => IEstimate | undefined;
  estimatePropertyIdsByProjectId: (projectId: string) => string[] | undefined;
  activeEstimatePropertyIdsByProjectId: (projectId: string) => string[] | undefined;
  estimateSystemPropertyIdsByProjectId: (projectId: string) => string[] | undefined;
  estimatePropertyById: (propertyId: string) => IEstimateProperty | undefined;
  issueEstimatePropertyValueFor: (issueId: string, propertyId: string) => IIssueEstimatePropertyValue | undefined;
  // actions
  getWorkspaceEstimates: (workspaceSlug: string, loader?: TEstimateLoader) => Promise<IEstimateType[] | undefined>;
  getProjectEstimates: (
    workspaceSlug: string,
    projectId: string,
    loader?: TEstimateLoader
  ) => Promise<IEstimateType[] | undefined>;
  getEstimateById: (estimateId: string) => IEstimate | undefined;
  createEstimate: (
    workspaceSlug: string,
    projectId: string,
    data: IEstimateFormData
  ) => Promise<IEstimateType | undefined>;
  updateEstimate: (
    workspaceSlug: string,
    projectId: string,
    estimateId: string,
    data: IEstimateFormData
  ) => Promise<IEstimateType | undefined>;
  deleteEstimate: (workspaceSlug: string, projectId: string, estimateId: string) => Promise<void>;
  // estimate properties
  getProjectEstimateProperties: (workspaceSlug: string, projectId: string) => Promise<IEstimateProperty[] | undefined>;
  // F2: guarded fetch of a project's estimate properties, so list contexts
  // (workspace-views, spreadsheet, workspace-draft) can populate the store
  // for the projects of the issues they render without refetching on every
  // remount/scroll -- mirrors `getIssueEstimatePropertyValues`'s coalescer.
  ensureProjectEstimateProperties: (workspaceSlug: string, projectId: string) => Promise<void>;
  createEstimateProperty: (
    workspaceSlug: string,
    projectId: string,
    payload: { name: string; estimate: string }
  ) => Promise<IEstimateProperty | undefined>;
  updateEstimateProperty: (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    payload: Partial<Pick<IEstimateProperty, "name" | "estimate" | "is_active" | "sort_order">>
  ) => Promise<IEstimateProperty | undefined>;
  deleteEstimateProperty: (workspaceSlug: string, projectId: string, propertyId: string) => Promise<void>;
  upsertKpiRoleEstimateProperty: (
    workspaceSlug: string,
    projectId: string,
    role: TEstimatePropertyKpiRole,
    estimateId: string | null
  ) => Promise<IEstimateProperty | undefined>;
  getIssueEstimatePropertyValues: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    force?: boolean
  ) => Promise<IIssueEstimatePropertyValue[] | undefined>;
  updateIssueEstimatePropertyValue: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyId: string,
    estimatePointId: string | null
  ) => Promise<IIssueEstimatePropertyValue | undefined>;
}

export class ProjectEstimateStore implements IProjectEstimateStore {
  // observables
  loader: TEstimateLoader = undefined;
  estimates: Record<string, IEstimate> = {}; // estimate_id -> estimate
  error: TErrorCodes | undefined = undefined;
  estimateProperties: Record<string, IEstimateProperty> = {}; // property_id -> property
  issueEstimatePropertyValues: Record<string, Record<string, IIssueEstimatePropertyValue>> = {}; // issue_id -> property_id -> value
  issueValuesFetchState: Record<string, "in-flight" | "done"> = {}; // issue_id -> state (B1)
  projectPropertiesFetchState: Record<string, "in-flight" | "done"> = {}; // project_id -> state

  // Not observable -- plain in-memory bookkeeping for the values coalescer
  // (B1/I3), scoped per project. `pendingIssueValueFetches` holds the ids
  // queued for the batch that hasn't fired its network request yet;
  // `pendingIssueValueFetchPromises` lets a same-tick second caller attach
  // to that in-flight batch instead of opening a new one. Both entries for
  // a projectId are deleted together, synchronously, the moment a batch is
  // "claimed" for its network request -- so ids that arrive afterwards
  // (a later tick) correctly start a brand new batch instead of racing the
  // old one (see drainIssueValueFetchQueue).
  private pendingIssueValueFetches: Map<string, Set<string>> = new Map();
  private pendingIssueValueFetchPromises: Map<string, Promise<void>> = new Map();
  // Same pattern, for `ensureProjectEstimateProperties`.
  private pendingProjectPropertiesFetches: Map<string, Promise<void>> = new Map();

  constructor(private store: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      estimates: observable,
      error: observable,
      estimateProperties: observable,
      issueEstimatePropertyValues: observable,
      issueValuesFetchState: observable,
      projectPropertiesFetchState: observable,
      // computed
      currentActiveEstimateId: computed,
      currentActiveEstimate: computed,
      archivedEstimateIds: computed,
      currentProjectEstimateType: computed,
      // actions
      getWorkspaceEstimates: action,
      getProjectEstimates: action,
      getEstimateById: action,
      createEstimate: action,
      updateEstimate: action,
      deleteEstimate: action,
      getProjectEstimateProperties: action,
      ensureProjectEstimateProperties: action,
      createEstimateProperty: action,
      updateEstimateProperty: action,
      deleteEstimateProperty: action,
      upsertKpiRoleEstimateProperty: action,
      getIssueEstimatePropertyValues: action,
      updateIssueEstimatePropertyValue: action,
    });
  }

  // computed

  get currentProjectEstimateType(): TEstimateSystemKeys | undefined {
    return this.currentActiveEstimateId ? this.estimates[this.currentActiveEstimateId]?.type : undefined;
  }

  /**
   * @description get current active estimate id for a project
   * @returns { string | undefined }
   */
  get currentActiveEstimateId(): string | undefined {
    const { projectId } = this.store.router;
    if (!projectId) return undefined;
    const projectDetails = this.store.projectRoot.project.getProjectById(projectId);
    return projectDetails?.estimate ?? undefined;
  }

  // computed
  /**
   * @description get current active estimate for a project
   * @returns { string | undefined }
   */
  get currentActiveEstimate(): IEstimate | undefined {
    return this.currentActiveEstimateId ? this.estimates[this.currentActiveEstimateId] : undefined;
  }

  /**
   * @description get all archived estimate ids for a project
   * @returns { string[] | undefined }
   */
  get archivedEstimateIds(): string[] | undefined {
    const { projectId } = this.store.router;
    if (!projectId) return undefined;
    const activeEstimateId = this.currentActiveEstimateId;
    const archivedEstimates = orderBy(
      Object.values(this.estimates || {}).filter((p) => p.project === projectId && p.id !== activeEstimateId),
      ["created_at"],
      "desc"
    );
    const archivedEstimateIds = archivedEstimates.map((p) => p.id) as string[];
    return archivedEstimateIds ?? undefined;
  }

  /**
   * @description get estimates are enabled in the project or not
   * @returns { boolean }
   */
  areEstimateEnabledByProjectId = computedFn((projectId: string) => {
    if (!projectId) return false;
    const projectDetails = this.store.projectRoot.project.getProjectById(projectId);
    if (!projectDetails) return false;
    return Boolean(projectDetails.estimate) || false;
  });

  /**
   * @description get all estimate ids for a project
   * @returns { string[] | undefined }
   */
  estimateIdsByProjectId = computedFn((projectId: string) => {
    if (!projectId) return undefined;
    const projectEstimatesIds = orderBy(
      Object.values(this.estimates || {}).filter((p) => p.project === projectId),
      ["created_at"],
      "desc"
    ).map((p) => p.id) as string[];
    return projectEstimatesIds ?? undefined;
  });

  /**
   * @description get active estimate ids for a project
   * @returns { string[] | undefined }
   */
  activeEstimateIdsByProjectId = computedFn((projectId: string) => {
    if (!projectId) return undefined;
    const activeEstimateIds = orderBy(
      Object.values(this.estimates || {}).filter((p) => p.project === projectId && p.last_used),
      ["created_at"],
      "desc"
    ).map((p) => p.id) as string[];
    return activeEstimateIds ?? undefined;
  });

  /**
   * @description get current active estimate id for a project
   * @returns { string | undefined }
   */
  currentActiveEstimateIdByProjectId = computedFn((projectId: string): string | undefined => {
    if (!projectId) return undefined;
    const projectDetails = this.store.projectRoot.project.getProjectById(projectId);
    return projectDetails?.estimate ?? undefined;
  });

  /**
   * @description get estimate by id
   * @returns { IEstimate | undefined }
   */
  estimateById = computedFn((estimateId: string) => {
    if (!estimateId) return undefined;
    return this.estimates[estimateId] ?? undefined;
  });

  estimatePointById = computedFn((estimatePointId: string, projectId?: string) => {
    if (!estimatePointId) return undefined;
    const estimates = Object.values(this.estimates || {}).filter(
      (estimate) => !projectId || estimate.project === projectId
    );
    for (const estimate of estimates) {
      const estimatePoint = estimate.estimatePointById(estimatePointId);
      if (estimatePoint) return estimatePoint;
    }
    return undefined;
  });

  estimateByEstimatePointId = computedFn((estimatePointId: string, projectId?: string) => {
    if (!estimatePointId) return undefined;
    const estimates = Object.values(this.estimates || {}).filter(
      (estimate) => !projectId || estimate.project === projectId
    );
    return estimates.find((estimate) => !!estimate.estimatePointById(estimatePointId));
  });

  /**
   * @description get all estimate property ids for a project, ordered by sort_order
   * @returns { string[] | undefined }
   */
  estimatePropertyIdsByProjectId = computedFn((projectId: string) => {
    if (!projectId) return undefined;
    return orderBy(
      Object.values(this.estimateProperties || {}).filter((p) => p.project === projectId),
      ["sort_order"],
      "asc"
    ).map((p) => p.id);
  });

  /**
   * @description get active (is_active + estimate configured) estimate property ids for a project,
   * excluding the system-default rows (those are surfaced separately via
   * `estimateSystemPropertyIdsByProjectId`) so KPI/custom-property call sites don't double-render
   * the per-system "Estimates" group.
   * @returns { string[] | undefined }
   */
  activeEstimatePropertyIdsByProjectId = computedFn((projectId: string) => {
    if (!projectId) return undefined;
    return orderBy(
      Object.values(this.estimateProperties || {}).filter(
        (p) => p.project === projectId && p.is_active && !!p.estimate && !p.is_estimate_default
      ),
      ["sort_order"],
      "asc"
    ).map((p) => p.id);
  });

  /**
   * @description get the system-default estimate property ids for a project (one per active
   * Estimate system), ordered to match `activeEstimateIdsByProjectId`'s estimate ordering
   * (by the backing estimate's created_at desc) so system rows appear in a stable, predictable
   * order in the "Estimates" group.
   * @returns { string[] | undefined }
   */
  estimateSystemPropertyIdsByProjectId = computedFn((projectId: string) => {
    if (!projectId) return undefined;
    return orderBy(
      Object.values(this.estimateProperties || {}).filter(
        (p) => p.project === projectId && p.is_active && p.is_estimate_default
      ),
      [(p) => this.getEstimateById(p.estimate)?.created_at],
      "desc"
    ).map((p) => p.id);
  });

  estimatePropertyById = computedFn((propertyId: string) => {
    if (!propertyId) return undefined;
    return this.estimateProperties[propertyId] ?? undefined;
  });

  issueEstimatePropertyValueFor = computedFn((issueId: string, propertyId: string) => {
    if (!issueId || !propertyId) return undefined;
    return this.issueEstimatePropertyValues[issueId]?.[propertyId] ?? undefined;
  });

  // actions
  /**
   * @description fetch all estimates for a workspace
   * @param { string } workspaceSlug
   * @returns { IEstimateType[] | undefined }
   */
  getWorkspaceEstimates = async (
    workspaceSlug: string,
    loader: TEstimateLoader = "mutation-loader"
  ): Promise<IEstimateType[] | undefined> => {
    try {
      this.error = undefined;
      if (Object.keys(this.estimates || {}).length <= 0) this.loader = loader ? loader : "init-loader";

      const estimates = await estimateService.fetchWorkspaceEstimates(workspaceSlug);
      if (estimates && estimates.length > 0) {
        runInAction(() => {
          estimates.forEach((estimate) => {
            if (estimate.id)
              set(
                this.estimates,
                [estimate.id],
                new Estimate(this.store, { ...estimate, type: estimate.type?.toLowerCase() as TEstimateSystemKeys })
              );
          });
        });
      }

      return estimates;
    } catch (error) {
      this.loader = undefined;
      this.error = {
        status: "error",
        message: "Error fetching estimates",
      };
      throw error;
    }
  };

  /**
   * @description fetch all estimates for a project
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { IEstimateType[] | undefined }
   */
  getProjectEstimates = async (
    workspaceSlug: string,
    projectId: string,
    loader: TEstimateLoader = "mutation-loader"
  ): Promise<IEstimateType[] | undefined> => {
    try {
      this.error = undefined;
      if (!this.estimateIdsByProjectId(projectId)) this.loader = loader ? loader : "init-loader";

      const estimates = await estimateService.fetchProjectEstimates(workspaceSlug, projectId);
      if (estimates && estimates.length > 0) {
        runInAction(() => {
          estimates.forEach((estimate) => {
            if (estimate.id)
              set(
                this.estimates,
                [estimate.id],
                new Estimate(this.store, { ...estimate, type: estimate.type?.toLowerCase() as TEstimateSystemKeys })
              );
          });
        });
      }

      return estimates;
    } catch (error) {
      this.loader = undefined;
      this.error = {
        status: "error",
        message: "Error fetching estimates",
      };
      throw error;
    }
  };

  /**
   * @param { string } estimateId
   * @returns IEstimateType | undefined
   */
  getEstimateById = (estimateId: string): IEstimate | undefined => this.estimates[estimateId];

  /**
   * @description create an estimate for a project
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @param { Partial<IEstimateFormData> } payload
   * @returns
   */
  createEstimate = async (
    workspaceSlug: string,
    projectId: string,
    payload: IEstimateFormData
  ): Promise<IEstimateType | undefined> => {
    try {
      this.error = undefined;

      const estimate = await estimateService.createEstimate(workspaceSlug, projectId, payload);
      if (estimate) {
        runInAction(() => {
          if (estimate.id)
            set(
              this.estimates,
              [estimate.id],
              new Estimate(this.store, { ...estimate, type: estimate.type?.toLowerCase() as TEstimateSystemKeys })
            );
        });
        const projectDetails = this.store.projectRoot.project.getProjectById(projectId);
        if (estimate.id && !projectDetails?.estimate) {
          await this.store.projectRoot.project.updateProject(workspaceSlug, projectId, {
            estimate: estimate.id,
          });
        }
      }

      return estimate;
    } catch (error) {
      this.error = {
        status: "error",
        message: "Error creating estimate",
      };
      throw error;
    }
  };

  /**
   * @description update an estimate for a project
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @param { string } estimateId
   * @param { IEstimateFormData } payload
   * @returns
   */
  updateEstimate = async (
    workspaceSlug: string,
    projectId: string,
    estimateId: string,
    payload: IEstimateFormData
  ): Promise<IEstimateType | undefined> => {
    try {
      this.error = undefined;

      const estimate = await estimateService.updateEstimate(workspaceSlug, projectId, estimateId, payload);
      if (estimate?.id) {
        const updatedEstimateId = estimate.id;
        runInAction(() => {
          set(
            this.estimates,
            [updatedEstimateId],
            new Estimate(this.store, { ...estimate, type: estimate.type?.toLowerCase() as TEstimateSystemKeys })
          );
        });
        // I5/F4a: activating/deactivating an estimate (last_used toggle) can
        // auto-create its system-default EstimateProperty server-side
        // (_ensure_estimate_default_property) -- the store doesn't know
        // about that write-through, so invalidate defensively.
        this.invalidateEstimatePropertiesCache(projectId);
      }

      return estimate;
    } catch (error) {
      this.error = {
        status: "error",
        message: "Error updating estimate",
      };
      throw error;
    }
  };

  /**
   * @description delete the estimate for a project
   * @param workspaceSlug
   * @param projectId
   * @param estimateId
   */
  deleteEstimate = async (workspaceSlug: string, projectId: string, estimateId: string) => {
    try {
      await estimateService.deleteEstimate(workspaceSlug, projectId, estimateId);
      runInAction(() => {
        if (!estimateId) return;
        unset(this.estimates, [estimateId]);
        // F4b: the backend soft-deletes every EstimateProperty that
        // belonged to this estimate (EstimateProperty.estimate is
        // non-nullable, so a property can't be re-pointed after its
        // estimate is gone) -- drop them here too, or their rows keep
        // rendering as orphans in the Properties panel until a reload.
        Object.values(this.estimateProperties)
          .filter((property) => property.estimate === estimateId)
          .forEach((property) => unset(this.estimateProperties, [property.id]));
      });
      this.invalidateEstimatePropertiesCache(projectId);
    } catch (error) {
      this.error = {
        status: "error",
        message: "Error deleting estimate",
      };
      throw error;
    }
  };

  // estimate properties

  /**
   * @description fetch every estimate property for a project (active + inactive)
   */
  getProjectEstimateProperties = async (
    workspaceSlug: string,
    projectId: string
  ): Promise<IEstimateProperty[] | undefined> => {
    const properties = await estimatePropertyService.fetchProjectEstimateProperties(workspaceSlug, projectId);
    runInAction(() => {
      properties.forEach((property) => set(this.estimateProperties, [property.id], property));
    });
    return properties;
  };

  /**
   * @description F2/B1: guarded version of `getProjectEstimateProperties` --
   * "ausente" -> fetches and marks "in-flight" immediately (before the
   * network call resolves, so a same-tick second caller for the same
   * project attaches to this fetch instead of starting a duplicate one);
   * "in-flight" -> attaches to the in-flight fetch; "done" -> resolves
   * immediately, 0 requests. On error, the guard is removed (back to
   * "ausente") so a transient failure doesn't permanently block this
   * project's properties from ever loading.
   *
   * List contexts (workspace-views, spreadsheet, workspace-draft) call
   * this instead of `getProjectEstimateProperties` directly, once per
   * distinct project among the issues they render, before reading
   * `activeEstimatePropertyIdsByProjectId`/`estimateSystemPropertyIdsByProjectId`.
   */
  ensureProjectEstimateProperties = async (workspaceSlug: string, projectId: string): Promise<void> => {
    const state = this.projectPropertiesFetchState[projectId];
    if (state === "done") return;
    if (state === "in-flight") {
      const inFlight = this.pendingProjectPropertiesFetches.get(projectId);
      if (inFlight) await inFlight;
      return;
    }

    runInAction(() => set(this.projectPropertiesFetchState, [projectId], "in-flight"));
    const fetchPromise = (async () => {
      try {
        await this.getProjectEstimateProperties(workspaceSlug, projectId);
        runInAction(() => set(this.projectPropertiesFetchState, [projectId], "done"));
      } catch (error) {
        runInAction(() => unset(this.projectPropertiesFetchState, [projectId]));
        throw error;
      } finally {
        this.pendingProjectPropertiesFetches.delete(projectId);
      }
    })();
    this.pendingProjectPropertiesFetches.set(projectId, fetchPromise);
    await fetchPromise;
  };

  createEstimateProperty = async (
    workspaceSlug: string,
    projectId: string,
    payload: { name: string; estimate: string }
  ): Promise<IEstimateProperty | undefined> => {
    const property = await estimatePropertyService.createEstimateProperty(workspaceSlug, projectId, payload);
    runInAction(() => set(this.estimateProperties, [property.id], property));
    this.invalidateEstimatePropertiesCache(projectId);
    return property;
  };

  updateEstimateProperty = async (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    payload: Partial<Pick<IEstimateProperty, "name" | "estimate" | "is_active" | "sort_order">>
  ): Promise<IEstimateProperty | undefined> => {
    const property = await estimatePropertyService.updateEstimateProperty(
      workspaceSlug,
      projectId,
      propertyId,
      payload
    );
    runInAction(() => set(this.estimateProperties, [property.id], property));
    this.invalidateEstimatePropertiesCache(projectId);
    return property;
  };

  deleteEstimateProperty = async (workspaceSlug: string, projectId: string, propertyId: string): Promise<void> => {
    await estimatePropertyService.deleteEstimateProperty(workspaceSlug, projectId, propertyId);
    runInAction(() => unset(this.estimateProperties, [propertyId]));
    this.invalidateEstimatePropertiesCache(projectId);
  };

  /** Upsert (or clear, if estimateId is null) the reserved property for a KPI role. */
  upsertKpiRoleEstimateProperty = async (
    workspaceSlug: string,
    projectId: string,
    role: TEstimatePropertyKpiRole,
    estimateId: string | null
  ): Promise<IEstimateProperty | undefined> => {
    const previousPropertyId = this.estimatePropertyIdsByProjectId(projectId)?.find(
      (id) => this.estimateProperties[id]?.kpi_role === role
    );
    const property = await estimatePropertyService.upsertKpiRoleEstimateProperty(
      workspaceSlug,
      projectId,
      role,
      estimateId
    );
    runInAction(() => {
      if (previousPropertyId) unset(this.estimateProperties, [previousPropertyId]);
      if (property) set(this.estimateProperties, [property.id], property);
    });
    this.invalidateEstimatePropertiesCache(projectId);
    return property;
  };

  /**
   * I5 + C1 (Stage B2 review, condition of execution): every mutator that
   * can change a project's estimate properties must invalidate BOTH guards
   * -- `projectPropertiesFetchState` (so `ensureProjectEstimateProperties`
   * refetches) AND `issueValuesFetchState` (so list views refetch values
   * too). Skipping the second one reintroduces F4 in list contexts: the I3
   * guard in the values coalescer marks issues "done" without ever
   * fetching when a project has zero estimate properties; if properties
   * appear later (estimate activated, property created) without also
   * clearing `issueValuesFetchState`, those issues stay "done" forever and
   * the new estimate column renders with permanently empty dropdowns until
   * a hard reload.
   *
   * No projectId -> issueId reverse index exists (building one would be
   * over-engineering here), so the values guard is cleared in full,
   * workspace-wide, rather than only for this `projectId`'s issues. Cost:
   * at most one extra bulk batch per project on the next list render --
   * these are all admin-only settings actions, low traffic. Simple > fine
   * -grained, same trade-off the write-through properties above already
   * make.
   */
  private invalidateEstimatePropertiesCache = (projectId: string) => {
    runInAction(() => {
      unset(this.projectPropertiesFetchState, [projectId]);
      this.issueValuesFetchState = {};
    });
  };

  /**
   * @description F1/B1: fetch estimate property values for one issue.
   *
   * `force` (default false) selects between two entirely different paths:
   * - `force: true` -- the 4 issue-single call sites (peek-overview,
   *   issue-detail sidebar, issue-modal, power-k). Always hits the
   *   per-issue endpoint directly and refreshes the store -- a user opening
   *   one work item expects current data, not a value cached earlier this
   *   session.
   * - `force: false` (default) -- the 3 list call sites (all-properties,
   *   spreadsheet estimate-column, workspace-draft). Goes through the
   *   coalescer below: batches same-project issue ids queued in the same
   *   tick into ONE bulk request, and once an issue is resolved ("done",
   *   whether or not it had any values), never refetches it again this
   *   session. See B1 in fix-plan.md for why a 2-state cache (derived from
   *   `issueEstimatePropertyValues` itself) doesn't work: an issue with no
   *   values set leaves no key in that map, so "check cache" always misses
   *   for it -- exactly the majority case in a real list.
   */
  getIssueEstimatePropertyValues = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    force = false
  ): Promise<IIssueEstimatePropertyValue[] | undefined> => {
    if (force) {
      const values = await estimatePropertyService.fetchIssueEstimatePropertyValues(
        workspaceSlug,
        projectId,
        issueId
      );
      runInAction(() => {
        values.forEach((value) => set(this.issueEstimatePropertyValues, [issueId, value.property], value));
        set(this.issueValuesFetchState, [issueId], "done");
      });
      return values;
    }

    const state = this.issueValuesFetchState[issueId];
    if (state === "done") return undefined;
    if (state === "in-flight") {
      const inFlight = this.pendingIssueValueFetchPromises.get(projectId);
      if (inFlight) await inFlight;
      return undefined;
    }

    // "Ausente": enqueue and mark in-flight IMMEDIATELY, before any await --
    // otherwise two layouts mounting in DIFFERENT ticks (not the same
    // microtask) would both see "ausente" and each fire its own request.
    runInAction(() => set(this.issueValuesFetchState, [issueId], "in-flight"));
    let queue = this.pendingIssueValueFetches.get(projectId);
    if (!queue) {
      queue = new Set();
      this.pendingIssueValueFetches.set(projectId, queue);
    }
    queue.add(issueId);

    let batchPromise = this.pendingIssueValueFetchPromises.get(projectId);
    if (!batchPromise) {
      batchPromise = this.drainIssueValueFetchQueue(workspaceSlug, projectId);
      this.pendingIssueValueFetchPromises.set(projectId, batchPromise);
    }
    await batchPromise;
    return undefined;
  };

  /**
   * @description B1/I3: drains the queued issue ids for one project into a
   * single bulk request (or zero requests, per I3 below), and resolves the
   * shared batch promise other same-tick callers are awaiting.
   */
  private drainIssueValueFetchQueue = async (workspaceSlug: string, projectId: string): Promise<void> => {
    try {
      // I3: the "does this project have any estimate property at all" guard
      // below is only reliable once the project's properties are loaded --
      // must resolve BEFORE reading it, and (deliberately) before this
      // batch is detached from the shared maps, so same-tick callers still
      // attach correctly even when this call has to hit the network first.
      await this.ensureProjectEstimateProperties(workspaceSlug, projectId);
    } catch (error) {
      this.failIssueValueFetchBatch(projectId);
      throw error;
    }

    // Detach this batch from the shared maps NOW, synchronously, with no
    // further await before this point -- any issueId enqueued by a caller
    // in a LATER tick must find both maps empty and start its own new
    // batch, not race this one (R7: "issues novas chegando enquanto um
    // batch está em voo abrem um segundo batch. Correto e esperado").
    const queued = this.pendingIssueValueFetches.get(projectId);
    this.pendingIssueValueFetches.delete(projectId);
    this.pendingIssueValueFetchPromises.delete(projectId);
    const issueIds = queued ? Array.from(queued) : [];
    if (issueIds.length === 0) return;

    try {
      // I3: a project with zero active/system estimate properties never
      // has anything to fetch -- skip the bulk request entirely and just
      // mark every queued id "done", so the list doesn't keep retrying it
      // on every scroll/remount for a project that isn't using estimates.
      const hasAnyEstimateProperty =
        (this.estimateSystemPropertyIdsByProjectId(projectId)?.length ?? 0) > 0 ||
        (this.activeEstimatePropertyIdsByProjectId(projectId)?.length ?? 0) > 0;

      if (!hasAnyEstimateProperty) {
        runInAction(() => {
          issueIds.forEach((issueId) => set(this.issueValuesFetchState, [issueId], "done"));
        });
        return;
      }

      const grouped = await estimatePropertyService.fetchIssueEstimatePropertyValuesBulk(
        workspaceSlug,
        projectId,
        issueIds
      );
      runInAction(() => {
        issueIds.forEach((issueId) => {
          const values = grouped[issueId] ?? [];
          values.forEach((value) => set(this.issueEstimatePropertyValues, [issueId, value.property], value));
          // Mark "done" for EVERY queued id, including issues that came
          // back with no values at all -- this is B1's whole point: without
          // it, an issue with no values set is indistinguishable from one
          // never fetched, and gets rebulk-fetched forever.
          set(this.issueValuesFetchState, [issueId], "done");
        });
      });
    } catch (error) {
      // On error, remove the entries entirely (back to "ausente"), not
      // "done" and not left "in-flight" -- otherwise a transient failure
      // freezes these issues without values for the rest of the session.
      runInAction(() => {
        issueIds.forEach((issueId) => unset(this.issueValuesFetchState, [issueId]));
      });
      throw error;
    }
  };

  private failIssueValueFetchBatch = (projectId: string) => {
    const queued = this.pendingIssueValueFetches.get(projectId);
    this.pendingIssueValueFetches.delete(projectId);
    this.pendingIssueValueFetchPromises.delete(projectId);
    if (queued) {
      runInAction(() => {
        queued.forEach((issueId) => unset(this.issueValuesFetchState, [issueId]));
      });
    }
  };

  updateIssueEstimatePropertyValue = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyId: string,
    estimatePointId: string | null
  ): Promise<IIssueEstimatePropertyValue | undefined> => {
    const value = await estimatePropertyService.updateIssueEstimatePropertyValue(
      workspaceSlug,
      projectId,
      issueId,
      propertyId,
      estimatePointId
    );
    runInAction(() => set(this.issueEstimatePropertyValues, [issueId, propertyId], value));
    return value;
  };
}
