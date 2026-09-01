/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Loader2, Paperclip, X } from "lucide-react";
import type { IHelpdeskAttachment } from "@plane/types";
import { convertBytesToSize, getFileURL } from "@plane/utils";
import type { TPendingAttachment } from "./use-attachment-upload";

type PendingProps = {
  attachments: TPendingAttachment[];
  onRemove: (tempId: string) => void;
};

/** Files staged in the composer, before the message is sent. */
export const PendingAttachmentChips = ({ attachments, onRemove }: PendingProps) => {
  if (!attachments.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.tempId}
          className={`text-11 flex items-center gap-1.5 rounded-md border px-2 py-1 ${
            attachment.status === "error"
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-subtle bg-surface-2 text-secondary"
          }`}
        >
          {attachment.status === "uploading" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Paperclip className="size-3" />
          )}
          <span className="max-w-40 truncate">{attachment.name}</span>
          <span className="text-placeholder">{convertBytesToSize(attachment.size)}</span>
          <button
            type="button"
            onClick={() => onRemove(attachment.tempId)}
            className="hover:text-primary"
            aria-label={`Remover ${attachment.name}`}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
};

type SentProps = {
  attachments?: IHelpdeskAttachment[];
};

/** Files already delivered with a message, rendered inside its bubble. */
export const CommentAttachments = ({ attachments }: SentProps) => {
  if (!attachments?.length) return null;

  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-subtle pt-2">
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          href={attachment.asset_url ? getFileURL(attachment.asset_url) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="text-11 text-secondary hover:text-primary flex items-center gap-1.5 hover:underline"
        >
          <Paperclip className="size-3 shrink-0" />
          <span className="max-w-52 truncate">{attachment.name}</span>
          <span className="text-placeholder shrink-0">{convertBytesToSize(attachment.size)}</span>
        </a>
      ))}
    </div>
  );
};
