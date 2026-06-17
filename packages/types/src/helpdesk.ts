/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export interface IHelpdeskPortal {
  id: string;
  workspace: string;
  public_slug: string;
  is_public: boolean;
  require_login: boolean;
  enable_chat: boolean;
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
  | "date";

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
  validation: Record<string, unknown>;
  ui_props: Record<string, unknown>;
  is_system: boolean;
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
  status: string | null; // FK UUID to IHelpdeskStatus
  status_detail: IHelpdeskStatus | null;
  form_detail: IHelpdeskForm | null;
  source: THelpdeskRequestSource;
  form_responses: Record<string, unknown>;
  assignees: string[];
  created_at: string;
  updated_at: string;
}

export interface IHelpdeskRequestComment {
  id: string;
  request: string;
  actor?: string | null;
  customer?: string | null;
  content: string;
  is_internal: boolean;
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
