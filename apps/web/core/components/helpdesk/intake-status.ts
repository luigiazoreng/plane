/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIntakeIssueStatus } from "@plane/types";

export const INTAKE_STATUS_META: Record<
  TIntakeIssueStatus,
  { label: string; variant: "warning" | "brand" | "success" | "neutral" | "danger" }
> = {
  [-2]: { label: "Pending", variant: "warning" },
  [-1]: { label: "Rejected", variant: "danger" },
  [1]: { label: "Accepted", variant: "success" },
  [2]: { label: "Duplicate", variant: "neutral" },
};
