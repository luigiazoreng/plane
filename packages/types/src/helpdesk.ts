/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export interface IHelpdeskPortal {
  id: string;
  project: string;
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

export interface IHelpdeskRequest {
  id: string;
  portal: string;
  project: string;
  workspace: string;
  customer?: string | null;
  contact_email?: string | null;
  title: string;
  description: string;
  status: THelpdeskRequestStatus;
  source: THelpdeskRequestSource;
  assignees: string[]; // List of user IDs
  created_at: string;
  updated_at: string;
}

export interface IHelpdeskRequestComment {
  id: string;
  request: string;
  actor?: string | null; // internal user id
  customer?: string | null; // customer id
  content: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
}

export interface IHelpdeskRequestIssue {
  id: string;
  request: string;
  issue: string; // Issue id
  created_at: string;
  updated_at: string;
}

export interface IHelpdeskTokenResponse {
  token: string;
}
