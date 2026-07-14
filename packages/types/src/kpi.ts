/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TKpiPenaltyMode = "continuous" | "dead_zone";
export type TKpiDayCount = "calendar" | "business";
export type TKpiDayRounding = "truncate" | "round" | "ceil";
export type TKpiIssueStatus = "on_time" | "early" | "late" | "pending";

export interface IKpiPriorityRow {
  points: number;
  b: number;
  label?: string;
}

export interface IKpiTables {
  difficulty: Record<string, number>;
  repetitive: Record<string, number>;
  type: Record<string, number>;
  // Importance (I) = native priority: `points` is the Importance contribution, `b` the penalty factor.
  priority: Record<string, IKpiPriorityRow>;
}

export interface IKpiConfig {
  id: string | null;
  name: string;
  tables: IKpiTables;
  penalty_mode: TKpiPenaltyMode;
  k: number;
  day_count: TKpiDayCount;
  day_rounding: TKpiDayRounding;
  allow_negative: boolean;
  max_multiplier: number | null;
  vf_decimals: number;
  is_active: boolean;
  project?: string | null;
  // Resolution metadata returned by the API
  is_default_seed?: boolean;
  inherited?: boolean;
}

export interface IKpiCalcResult {
  Vp: number;
  d: number | null;
  p: number | null;
  Vf: number | null;
}

export interface IKpiIssueRow {
  id: string;
  name: string;
  sequence_id: number;
  priority: string;
  target_date: string | null;
  completed_at: string | null;
  state_group: string | null;
  estimate_point: string | null;
  difficulty_estimate_point: string | null;
  repetitive_estimate_point: string | null;
  difficulty: string | null;
  repetitive: string | null;
  type: string | null;
  vp: number;
  d: number | null;
  p: number | null;
  vf: number | null;
  status: TKpiIssueStatus;
}

export interface IKpiAggregates {
  sum_vp: number;
  sum_vf: number;
  efficiency: number | null;
  counts: Record<TKpiIssueStatus, number>;
  total: number;
}

export interface IKpiIssueListResponse {
  results: IKpiIssueRow[];
  aggregates: IKpiAggregates;
}

export interface IKpiMemberAggregate {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  sum_vp: number;
  sum_vf: number;
  efficiency: number | null;
  counts: Record<TKpiIssueStatus, number>;
}

export interface IKpiMemberAggregateResponse {
  results: IKpiMemberAggregate[];
  unassigned_count: number;
}

export interface IKpiIssueAttribute {
  id?: string;
  issue?: string;
  repetitive: string | null;
  type_override: string | null;
}

export interface IKpiIssuePriority {
  issue: string;
  priority: string;
}

export interface IKpiCurvePoint {
  d: number;
  p: number;
}

export interface IKpiTaskInput {
  priority?: string;
  difficulty?: string | null;
  repetitive?: string | null;
  type?: string | null;
  due_date?: string | null;
  delivered_date?: string | null;
}

export interface IKpiPreviewResponse {
  result: IKpiCalcResult;
  curve: IKpiCurvePoint[];
  b: number;
}
