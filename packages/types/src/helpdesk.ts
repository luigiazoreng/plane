/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type IHelpdeskAutoAssignmentType = "load_balance" | "round_robin" | "capacity";

export interface IHelpdeskAutoAssignmentConfig {
  version: number;
  member_ids: string[];
  active_status_ids: string[];
  capacity_limit?: number | null;
  round_robin_last_assignee_id?: string | null;
}

export interface IHelpdeskPortal {
  id: string;
  workspace: string;
  public_slug: string;
  is_public: boolean;
  require_login: boolean;
  enable_chat: boolean;
  auto_assignment_enabled: boolean;
  auto_assignment_type: IHelpdeskAutoAssignmentType;
  auto_assignment_config: IHelpdeskAutoAssignmentConfig;
  sla_first_response_hours: number | null;
  sla_resolution_hours: number | null;
  no_reply_email_address: string | null;
  default_agent_email_address: string | null;
  created_at: string;
  updated_at: string;
}

export type IHelpdeskFormVisibility = "public" | "private";
export type IHelpdeskFieldType =
  | "system_title"
  | "system_description"
  | "short_text"
  | "long_text"
  | "select"
  | "checkbox"
  | "date"
  | "cascade_select";

export interface IHelpdeskFormFieldOption {
  label: string;
  value: string;
}

export interface IHelpdeskFormField {
  id: string;
  workspace: string;
  form: string;
  key: string;
  label: string;
  description: string;
  field_type: IHelpdeskFieldType;
  placeholder: string;
  help_text: string;
  required: boolean;
  sequence: number;
  options: IHelpdeskFormFieldOption[];
  /** { [parentValue]: childValue[] } — only used for cascade_select child fields */
  parent_mapping: Record<string, string[]>;
  validation: Record<string, unknown>;
  ui_props: Record<string, unknown>;
  is_system: boolean;
  parent_field_key: string;
  created_at: string;
  updated_at: string;
}

export interface IHelpdeskForm {
  id: string;
  workspace: string;
  portal: string;
  name: string;
  description: string;
  slug: string;
  visibility: IHelpdeskFormVisibility;
  is_active: boolean;
  sequence: number;
  success_message: string;
  ticket_id_pattern: string;
  fields_detail: IHelpdeskFormField[];
  created_at: string;
  updated_at: string;
}

export interface IHelpdeskCustomer {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  workspace: string;
  created_at: string;
  updated_at: string;
}

export type THelpdeskRequestSource = "public_form" | "internal_form";
export type THelpdeskAgentLayout = "list" | "kanban";

export interface IHelpdeskStatus {
  id: string;
  workspace: string;
  name: string;
  color: string;
  sequence: number;
  is_default: boolean;
  is_terminal: boolean;
  created_at: string;
  updated_at: string;
}

export interface IHelpdeskRequest {
  id: string;
  portal: string;
  form?: string | null;
  workspace: string;
  customer?: string | null;
  contact_email?: string | null;
  title: string;
  description: string;
  display_id: string;
  first_responded_at: string | null;
  resolved_at: string | null;
  archived_at: string | null;
  status: string | null; // FK UUID to IHelpdeskStatus
  status_detail: IHelpdeskStatus | null;
  form_detail: IHelpdeskForm | null;
  source: THelpdeskRequestSource;
  form_responses: Record<string, unknown>;
  assignees: string[];
  start_date: string | null;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

// --- List filters & display ---

export type THelpdeskGroupBy = "status" | "assignee" | "portal" | "form" | "source" | "none";
export type THelpdeskOrderBy = "-created_at" | "created_at" | "-updated_at" | "updated_at" | "title";

export interface IHelpdeskRequestFilters {
  status: string[];
  assignees: string[];
  portal: string[];
  form: string[];
  source: THelpdeskRequestSource[];
  /** ["after:YYYY-MM-DD", "before:YYYY-MM-DD"] — same date filter shape used by work items */
  created_at: string[];
}

export interface IHelpdeskDisplayFilters {
  group_by: THelpdeskGroupBy;
  order_by: THelpdeskOrderBy;
}

export interface IHelpdeskRequestComment {
  id: string;
  request: string;
  actor?: string | null;
  customer?: string | null;
  content: string;
  is_internal: boolean;
  delivery_channels?: string[];
  email_status?: "not_sent" | "pending" | "sent" | "failed";
  email_sent_at?: string | null;
  email_message_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IHelpdeskRequestIssue {
  id: string;
  request: string;
  issue: string;
  created_at: string;
  updated_at: string;
}

export interface IHelpdeskLinkedIssueLookupResult {
  id: string;
  project_id: string;
}

export interface IHelpdeskLinkedIssueLookupResponse {
  results: IHelpdeskLinkedIssueLookupResult[];
  missing_issue_ids: string[];
}

// -2 = pending, -1 = rejected, 1 = accepted, 2 = duplicate
export type TIntakeIssueStatus = -2 | -1 | 1 | 2;

export interface IHelpdeskRequestIntakeIssue {
  id: string;
  request: string;
  intake_issue: string;
  forwarded_to_project: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // computed by serializer
  intake_status: TIntakeIssueStatus | null;
  issue_id: string | null;
  project_identifier: string | null;
}

export interface IHelpdeskTokenResponse {
  token: string;
}

export interface IHelpdeskFormSubmission {
  contact_email?: string;
  form: string;
  responses: Record<string, unknown>;
}

// --- Analytics ---

export type THelpdeskDateFilter = "yesterday" | "last_7_days" | "last_30_days" | "last_3_months";

export interface IHelpdeskKPIMetric {
  current: number | null;
  previous?: number | null;
  pct_change?: number | null;
}

export interface IHelpdeskKPIs {
  total_requests: IHelpdeskKPIMetric;
  open_requests: IHelpdeskKPIMetric;
  resolved_requests: IHelpdeskKPIMetric;
  avg_first_response_hours: IHelpdeskKPIMetric;
  avg_resolution_hours: IHelpdeskKPIMetric;
}

export interface IHelpdeskSLACompliance {
  first_response_pct: number | null;
  resolution_pct: number | null;
  sla_first_response_hours: number | null;
  sla_resolution_hours: number | null;
  scope: "portal" | "workspace_default" | "ambiguous";
  historical_cutoff: string | null;
  historical_note: string | null;
}

export interface IHelpdeskTimeSeriesPoint {
  date: string;
  count: number;
}

export interface IHelpdeskResolutionTrendPoint {
  date: string;
  avg_hours: number | null;
}

export interface IHelpdeskStatusChartPoint {
  status_id: string;
  status_name: string;
  color: string;
  count: number;
}

export interface IHelpdeskSourceChartPoint {
  source: string;
  count: number;
}

export interface IHelpdeskAgentChartPoint {
  agent_id: string;
  display_name: string;
  count: number;
}

export interface IHelpdeskCharts {
  requests_over_time: IHelpdeskTimeSeriesPoint[];
  by_status: IHelpdeskStatusChartPoint[];
  by_source: IHelpdeskSourceChartPoint[];
  resolution_time_trend: IHelpdeskResolutionTrendPoint[];
  top_agents: IHelpdeskAgentChartPoint[];
}

export interface IHelpdeskAnalyticsResponse {
  kpis: IHelpdeskKPIs;
  sla: IHelpdeskSLACompliance;
  charts: IHelpdeskCharts;
}

export interface IHelpdeskAnalyticsFilters {
  date_filter: THelpdeskDateFilter;
  portal_id?: string;
}

export enum EHelpdeskMemberRole {
  ADMIN = 20,
  MEMBER = 15,
  GUEST = 5,
}

export interface IHelpdeskMember {
  id: string;
  workspace: string;
  member: string;
  member_detail: {
    id: string;
    first_name: string;
    last_name: string;
    display_name: string;
    avatar: string | null;
    avatar_url: string | null;
    is_bot: boolean;
  };
  role: EHelpdeskMemberRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IHelpdeskCustomer {
  id: string;
  workspace: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IHelpdeskPaginatedResponse {
  results: IHelpdeskRequest[];
  next_cursor: string | null;
  prev_cursor: string | null;
  next_page_results: boolean;
  prev_page_results: boolean;
  total_count: number;
  total_results: number;
  count: number;
  total_pages: number;
}
