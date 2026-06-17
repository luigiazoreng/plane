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

export interface IHelpdeskCustomer {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  workspace: string;
  created_at: string;
  updated_at: string;
}

export type THelpdeskRequestStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
export type THelpdeskRequestSource = "public_form" | "internal_form";
export type THelpdeskAgentLayout = "list" | "kanban";

export interface IHelpdeskRequest {
  id: string;
  portal: string;
  workspace: string;
  customer?: string | null;
  contact_email?: string | null;
  title: string;
  description: string;
  status: THelpdeskRequestStatus;
  source: THelpdeskRequestSource;
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
