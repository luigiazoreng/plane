/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { Paperclip } from "lucide-react";

type Props = {
  onSelect: (files: File[]) => void;
  disabled?: boolean;
  title?: string;
};

/**
 * The paperclip button in a message composer.
 *
 * A plain hidden input rather than react-dropzone: this sits inline in the
 * action bar next to the send button, so there is no drop surface to manage.
 */
export const AttachmentPicker = ({ onSelect, disabled = false, title = "Anexar arquivos" }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onSelect(files);
          // Reset so picking the same file twice in a row still fires onChange.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        title={title}
        aria-label={title}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="text-text-300 hover:bg-layer-1 hover:text-text-100 flex size-7 items-center justify-center rounded-md border border-subtle bg-surface-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Paperclip className="size-3.5" />
      </button>
    </>
  );
};
