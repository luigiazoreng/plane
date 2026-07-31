/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";
import type { IHelpdeskMacro } from "@plane/types";
import { AtSign, ChevronDown, Send, Smile, Zap } from "lucide-react";
import { Popover } from "@headlessui/react";
import { AttachmentPicker } from "@/components/helpdesk/attachments/attachment-picker";
import { PendingAttachmentChips } from "@/components/helpdesk/attachments/attachment-chips";
import type { useAttachmentUpload } from "@/components/helpdesk/attachments/use-attachment-upload";

export type TComposerMode = "reply" | "note";

type TComposerProps = {
  mode: TComposerMode;
  onModeChange: (mode: TComposerMode) => void;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  attachments: ReturnType<typeof useAttachmentUpload>;
  macros?: IHelpdeskMacro[];
  onSelectMacro?: (macro: IHelpdeskMacro) => void;
};

export function Composer({ mode, onModeChange, value, onChange, onSubmit, isSubmitting, attachments, macros, onSelectMacro }: TComposerProps) {
  const isNote = mode === "note";
  const canSend = value.trim().length > 0 && !isSubmitting;

  return (
    <div className="border-t border-subtle px-5 pt-3 pb-4">
      <div className="mx-auto flex max-w-[760px] flex-col gap-2">
        {/* Mode tabs */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onModeChange("reply")}
            className={cn(
              "h-[26px] text-13 font-medium transition-colors",
              isNote
                ? "text-tertiary hover:text-secondary"
                : "text-primary shadow-[inset_0_-2px_0_0_var(--border-color-accent-strong)]"
            )}
          >
            Reply to customer
          </button>
          <button
            type="button"
            onClick={() => onModeChange("note")}
            className={cn(
              "h-[26px] text-13 font-medium transition-colors",
              isNote
                ? "text-warning-primary shadow-[inset_0_-2px_0_0_var(--border-color-warning-strong)]"
                : "text-tertiary hover:text-secondary"
            )}
          >
            Internal note
          </button>
        </div>

        {/* Box */}
        <div
          className={cn(
            "rounded-lg border transition-colors focus-within:border-strong",
            isNote ? "border-warning-strong bg-warning-subtle" : "border-subtle bg-surface-2"
          )}
        >
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (canSend) onSubmit();
              }
            }}
            placeholder={isNote ? "Contexto interno para o time…" : "Escreva sua resposta…"}
            className="min-h-[72px] w-full resize-none bg-transparent p-3 text-13 leading-relaxed text-primary outline-none placeholder:text-tertiary"
          />

          <PendingAttachmentChips attachments={attachments.pending} onRemove={attachments.remove} />

          <div className="flex items-center justify-between gap-3 px-2.5 pb-2.5">
            <div className="flex items-center gap-1.5">
              <AttachmentPicker onSelect={attachments.upload} disabled={isSubmitting} />

              {/* Emoji, mentions and macros are drawn from the design but have no
                  backing implementation yet — kept visible and disabled rather
                  than silently dropped, so the toolbar matches what ships next. */}
              <button
                type="button"
                disabled
                title="Emojis — em breve"
                className="grid size-6 place-items-center rounded text-tertiary opacity-40"
              >
                <Smile className="size-4" />
              </button>
              <button
                type="button"
                disabled
                title="Menções — em breve"
                className="grid size-6 place-items-center rounded text-tertiary opacity-40"
              >
                <AtSign className="size-4" />
              </button>
              <span className="mx-0.5 h-4 w-px bg-layer-2" />

              <Popover className="relative">
                <Popover.Button
                  type="button"
                  className="flex h-6 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-2 text-12 font-medium text-secondary hover:border-strong transition-colors"
                >
                  <Zap className="size-3 text-warning-primary" />
                  Macros
                  <ChevronDown className="size-3" />
                </Popover.Button>
                <Popover.Panel className="absolute bottom-full left-0 z-20 mb-2.5 w-64 rounded-md border border-subtle bg-surface-1 p-1 shadow-md">
                  {({ close }: { close: () => void }) =>
                    !macros || macros.length === 0 ? (
                      <div className="px-3 py-2 text-12 text-tertiary text-center">Nenhuma macro disponível</div>
                    ) : (
                      <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                        {macros.map((macro) => (
                          <button
                            key={macro.id}
                            type="button"
                            onClick={() => {
                              if (onSelectMacro) onSelectMacro(macro);
                              else onChange(value ? `${value}\n${macro.content}` : macro.content);
                              close();
                            }}
                            className="flex flex-col items-start gap-0.5 rounded px-2.5 py-1.5 text-left text-12 transition-colors hover:bg-layer-2"
                          >
                            <span className="font-medium text-primary flex items-center gap-1">
                              {macro.name}
                              {!macro.is_public && (
                                <span className="text-[10px] text-tertiary bg-layer-2 px-1 rounded">Privada</span>
                              )}
                            </span>
                            {macro.description && <span className="text-11 text-tertiary truncate w-full">{macro.description}</span>}
                          </button>
                        ))}
                      </div>
                    )
                  }
                </Popover.Panel>
              </Popover>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="hidden text-11 text-tertiary sm:block">Ctrl / ⌘ + Enter</span>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSend}
                className={cn(
                  "inline-flex h-[26px] items-center gap-1.5 rounded-md px-2.5 text-13 font-medium transition-colors",
                  canSend
                    ? isNote
                      ? "bg-warning-primary text-white hover:opacity-90"
                      : "bg-accent-primary text-white hover:opacity-90"
                    : "cursor-not-allowed bg-layer-2 text-tertiary"
                )}
              >
                <Send className="size-3.5" />
                {isNote ? "Save note" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
