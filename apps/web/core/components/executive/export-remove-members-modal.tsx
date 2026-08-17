/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { Users } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Avatar, Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import type { IExecutiveMember } from "./helpers";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  members: IExecutiveMember[];
  /** userIds excluded from the export. Lives in the parent so the selection survives closing and reopening this modal. */
  excludedIds: Set<string>;
  onChangeExcludedIds: (next: Set<string>) => void;
  onConfirm: () => void;
  isExporting: boolean;
};

export const ExportRemoveMembersModal = (props: Props) => {
  const { isOpen, onClose, members, excludedIds, onChangeExcludedIds, onConfirm, isExporting } = props;

  const toggle = (userId: string) => {
    const next = new Set(excludedIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    onChangeExcludedIds(next);
  };

  const includedCount = members.length - excludedIds.size;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="flex flex-col gap-4 rounded-md bg-surface-1 p-6">
        <div className="border-b border-subtle pb-4">
          <h2 className="text-xl font-semibold text-primary">Choose who to include</h2>
          <p className="mt-1 text-13 text-tertiary">
            Uncheck anyone who shouldn&apos;t appear in the exported workbook. This only affects this export — it
            doesn&apos;t change anyone&apos;s dashboard data.
          </p>
        </div>

        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Users className="size-8 text-placeholder" strokeWidth={1.5} />
            <p className="text-13 text-tertiary">No team members to export yet.</p>
          </div>
        ) : (
          <div className="vertical-scrollbar scrollbar-lg max-h-[50vh] space-y-1 overflow-y-auto pr-1">
            {members.map((member) => {
              const checked = !excludedIds.has(member.userId);
              return (
                <label
                  key={member.userId}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-layer-1"
                >
                  <Checkbox checked={checked} onChange={() => toggle(member.userId)} />
                  <Avatar src={getFileURL(member.avatarUrl ?? "")} name={member.displayName} size="sm" />
                  <span className="truncate text-13 text-primary">{member.displayName}</span>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-subtle pt-4">
          <span className="text-12 text-tertiary">
            {includedCount} of {members.length} included
          </span>
          <div className="flex gap-3">
            <Button variant="ghost" size="base" onClick={onClose} disabled={isExporting}>
              Cancel
            </Button>
            <Button variant="primary" size="base" onClick={onConfirm} disabled={isExporting || members.length === 0}>
              {isExporting ? "Exporting..." : "Export to Excel"}
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
};
