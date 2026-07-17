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
    issueId: string
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

  constructor(private store: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      estimates: observable,
      error: observable,
      estimateProperties: observable,
      issueEstimatePropertyValues: observable,
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
      runInAction(() => estimateId && unset(this.estimates, [estimateId]));
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

  createEstimateProperty = async (
    workspaceSlug: string,
    projectId: string,
    payload: { name: string; estimate: string }
  ): Promise<IEstimateProperty | undefined> => {
    const property = await estimatePropertyService.createEstimateProperty(workspaceSlug, projectId, payload);
    runInAction(() => set(this.estimateProperties, [property.id], property));
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
    return property;
  };

  deleteEstimateProperty = async (workspaceSlug: string, projectId: string, propertyId: string): Promise<void> => {
    await estimatePropertyService.deleteEstimateProperty(workspaceSlug, projectId, propertyId);
    runInAction(() => unset(this.estimateProperties, [propertyId]));
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
    return property;
  };

  getIssueEstimatePropertyValues = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<IIssueEstimatePropertyValue[] | undefined> => {
    const values = await estimatePropertyService.fetchIssueEstimatePropertyValues(workspaceSlug, projectId, issueId);
    runInAction(() => {
      values.forEach((value) => set(this.issueEstimatePropertyValues, [issueId, value.property], value));
    });
    return values;
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
