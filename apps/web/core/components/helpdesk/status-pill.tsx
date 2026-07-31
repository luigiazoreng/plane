/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IHelpdeskStatus } from "@plane/types";
import { cn } from "@plane/utils";

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

export function HelpdeskStatusDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block shrink-0 rounded-full", className)} style={{ backgroundColor: color }} />;
}

type THelpdeskStatusPillProps = {
  status: IHelpdeskStatus;
  showDot?: boolean;
  onClick?: () => void;
  className?: string;
};

/**
 * Status badge tinted from the status' own colour. Renders as a button only
 * when an onClick is supplied, so it stays inert in read-only contexts.
 */
export function HelpdeskStatusPill({ status, showDot = false, onClick, className }: THelpdeskStatusPillProps) {
  const { r, g, b } = hexToRgb(status.color);
  const Tag = onClick ? "button" : "span";

  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-11 font-medium",
        onClick && "transition-opacity hover:opacity-90",
        className
      )}
      style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`, color: status.color }}
    >
      {showDot && <HelpdeskStatusDot color={status.color} className="size-1.5" />}
      {status.name}
    </Tag>
  );
}
