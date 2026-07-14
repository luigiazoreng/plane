/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { EEstimateSystem, EEstimateUpdateStages } from "./enums";

export interface IEstimatePoint {
  id: string | undefined;
  key: number | undefined;
  value: string | undefined;
  description: string | undefined;
  workspace: string | undefined;
  project: string | undefined;
  estimate: string | undefined;
  created_at: Date | undefined;
  updated_at: Date | undefined;
  created_by: string | undefined;
  updated_by: string | undefined;
}

export type TEstimateSystemKeys = EEstimateSystem.POINTS | EEstimateSystem.CATEGORIES | EEstimateSystem.TIME;

export interface IEstimate {
  id: string | undefined;
  name: string | undefined;
  description: string | undefined;
  type: TEstimateSystemKeys | undefined; // categories, points, time
  points: IEstimatePoint[] | undefined;
  workspace: string | undefined;
  project: string | undefined;
  last_used: boolean | undefined;
  created_at: Date | undefined;
  updated_at: Date | undefined;
  created_by: string | undefined;
  updated_by: string | undefined;
}

export interface IEstimateFormData {
  estimate?: {
    name?: string;
    type?: string;
    last_used?: boolean;
  };
  estimate_points?: {
    id?: string | undefined;
    key: number;
    value: string;
  }[];
}

export type TEstimatePointsObject = {
  id?: string | undefined;
  key: number;
  value: string;
};

export type TTemplateValues = {
  title: string;
  i18n_title: string;
  values: TEstimatePointsObject[];
  hide?: boolean;
};

export type TEstimateSystem = {
  name: string;
  i18n_name: string;
  templates: Record<string, TTemplateValues>;
  is_available: boolean;
  is_ee: boolean;
};

export type TEstimateSystems = {
  [K in TEstimateSystemKeys]: TEstimateSystem;
};

// update estimates
export type TEstimateUpdateStageKeys =
  | EEstimateUpdateStages.CREATE
  | EEstimateUpdateStages.EDIT
  | EEstimateUpdateStages.SWITCH;

export type TEstimateTypeErrorObject = {
  oldValue: string;
  newValue: string;
  message: string | undefined;
};

export type TEstimateTypeError = Record<number, TEstimateTypeErrorObject> | undefined;

// Estimate Properties -- dynamic, named work-item estimate rows. Difficulty and
// Repetitive are the two KPI-reserved ones (kpi_role set); any further rows are
// free-form, admin-defined properties unrelated to KPI.
export type TEstimatePropertyKpiRole = "difficulty" | "repetitive";

export interface IEstimateProperty {
  id: string;
  name: string;
  estimate: string;
  project: string;
  workspace: string;
  is_active: boolean;
  sort_order: number;
  kpi_role: TEstimatePropertyKpiRole | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface IIssueEstimatePropertyValue {
  id: string;
  issue: string;
  property: string;
  estimate_point: string | null;
}
