/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { cn } from "@plane/utils";

type Props = {
  issueId?: string;
  projectId?: string;
  workspaceSlug?: string;
  selected?: boolean;
};

export function IssueEmbedUpgradeCard(props: Props) {
  const { issueId, projectId, workspaceSlug } = props;
  const issueLabel = issueId || "Work item";
  const href =
    workspaceSlug && projectId && issueId ? `/${workspaceSlug}/projects/${projectId}/issues/${issueId}` : undefined;

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-5 rounded-md border-[0.5px] border-subtle bg-layer-1 px-5 py-2 shadow-raised-100 max-md:flex-wrap",
        {
          "border-2": props.selected,
        }
      )}
    >
      <div className="flex items-center gap-4">
        <div className="size-2 rounded-full bg-accent-primary" />
        <p className="!text-14 text-secondary">
          Embedded work item: <span className="font-medium text-primary">{issueLabel}</span>
        </p>
      </div>
      {href ? (
        <Link href={href} className="text-13 font-medium text-accent-primary hover:underline">
          Open
        </Link>
      ) : null}
    </div>
  );
}
