/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";

export const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  on_time: { className: "bg-success-subtle text-success-primary", label: "On time" },
  early: { className: "bg-accent-subtle text-accent-primary", label: "Early" },
  late: { className: "bg-danger-subtle text-danger-primary", label: "Late" },
  pending: { className: "bg-layer-1 text-tertiary", label: "Pending" },
};

export const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
  return (
    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-11 font-medium", s.className)}>
      {s.label}
    </span>
  );
};
