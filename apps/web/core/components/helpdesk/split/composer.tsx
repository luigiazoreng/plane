/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { AtSign, ChevronDown, Send, Smile, Zap } from "lucide-react";
import { Popover } from "@headlessui/react";
import { EmojiReactionPicker } from "@plane/propel/emoji-reaction";
import { stringToEmoji } from "@plane/propel/emoji-icon-picker";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import type { IHelpdeskMacro, IUserLite } from "@plane/types";
import { AttachmentPicker } from "@/components/helpdesk/attachments/attachment-picker";
import { PendingAttachmentChips } from "@/components/helpdesk/attachments/attachment-chips";
import type { useAttachmentUpload } from "@/components/helpdesk/attachments/use-attachment-upload";
import { useMember } from "@/hooks/store/use-member";

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
  workspaceSlug?: string;
};

export const Composer = observer(function Composer({
  mode,
  onModeChange,
  value,
  onChange,
  onSubmit,
  isSubmitting,
  attachments,
  macros,
  onSelectMacro,
  workspaceSlug,
}: TComposerProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isMentionPickerOpen, setIsMentionPickerOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { getUserDetails, workspace } = useMember();

  const isNote = mode === "note";
  const canSend = value.trim().length > 0 && !isSubmitting;

  const memberIds = useMemo(() => {
    if (!workspaceSlug) return [];
    return workspace.getWorkspaceMemberIds(workspaceSlug) ?? [];
  }, [workspaceSlug, workspace]);

  const members = useMemo(() => {
    return memberIds.map((id) => getUserDetails(id)).filter((m): m is IUserLite => Boolean(m));
  }, [memberIds, getUserDetails]);

  const filteredMembers = useMemo(() => {
    if (!mentionQuery.trim()) return members;
    const q = mentionQuery.toLowerCase();
    return members.filter(
      (m) =>
        (m.display_name && m.display_name.toLowerCase().includes(q)) ||
        (m.first_name && m.first_name.toLowerCase().includes(q)) ||
        (m.last_name && m.last_name.toLowerCase().includes(q)) ||
        (m.email && m.email.toLowerCase().includes(q))
    );
  }, [members, mentionQuery]);

  const handleEmojiSelect = (emojiCode: string) => {
    const emoji = stringToEmoji(emojiCode) || emojiCode;
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(value + emoji);
      setIsEmojiPickerOpen(false);
      return;
    }
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const newValue = value.substring(0, start) + emoji + value.substring(end);
    onChange(newValue);
    setIsEmojiPickerOpen(false);
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + emoji.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleInsertMention = (member: IUserLite) => {
    const name =
      member.display_name || `${member.first_name || ""} ${member.last_name || ""}`.trim() || member.email || "user";
    const mentionText = `@${name} `;
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(value + mentionText);
      setIsMentionPickerOpen(false);
      setMentionQuery("");
      return;
    }

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const textBeforeCursor = value.substring(0, start);
    const lastAtPos = textBeforeCursor.lastIndexOf("@");

    let replaceStart = start;
    if (lastAtPos !== -1 && lastAtPos >= start - mentionQuery.length - 1) {
      replaceStart = lastAtPos;
    }

    const newValue = value.substring(0, replaceStart) + mentionText + value.substring(end);
    onChange(newValue);
    setIsMentionPickerOpen(false);
    setMentionQuery("");

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = replaceStart + mentionText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleMentionButtonClick = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setIsMentionPickerOpen((prev) => !prev);
      return;
    }

    const start = textarea.selectionStart ?? value.length;
    const textBeforeCursor = value.substring(0, start);
    if (!textBeforeCursor.endsWith("@")) {
      const newValue = value.substring(0, start) + "@" + value.substring(start);
      onChange(newValue);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + 1, start + 1);
      }, 0);
    } else {
      setTimeout(() => {
        textarea.focus();
      }, 0);
    }
    setIsMentionPickerOpen((prev) => !prev);
    setMentionQuery("");
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const start = e.target.selectionStart ?? newValue.length;
    const textBeforeCursor = newValue.substring(0, start);
    const lastAtPos = textBeforeCursor.lastIndexOf("@");

    if (lastAtPos !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtPos + 1);
      if (
        !textAfterAt.includes("\n") &&
        textAfterAt.length <= 20 &&
        (lastAtPos === 0 || /\s/.test(newValue[lastAtPos - 1]))
      ) {
        setMentionQuery(textAfterAt);
        setIsMentionPickerOpen(true);
        return;
      }
    }
    if (isMentionPickerOpen) {
      setIsMentionPickerOpen(false);
      setMentionQuery("");
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files: File[] = [];
    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      for (let i = 0; i < e.clipboardData.files.length; i++) {
        const file = e.clipboardData.files[i];
        if (file) files.push(file);
      }
    } else if (e.clipboardData?.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      attachments.upload(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      attachments.upload(files);
    }
  };

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
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative rounded-lg border transition-colors focus-within:border-strong",
            isNote ? "border-warning-strong bg-warning-subtle" : "border-subtle bg-surface-2",
            isDragOver && "border-accent-primary border-dashed bg-accent-primary/10"
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleTextareaChange}
            onPaste={handlePaste}
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

              <EmojiReactionPicker
                isOpen={isEmojiPickerOpen}
                handleToggle={(val) => setIsEmojiPickerOpen(val)}
                onChange={handleEmojiSelect}
                disabled={isSubmitting}
                label={
                  <span
                    title="Emojis"
                    className="grid size-6 cursor-pointer place-items-center rounded text-tertiary transition-colors hover:bg-layer-2 hover:text-primary"
                  >
                    <Smile className="size-4" />
                  </span>
                }
              />

              <Popover className="relative">
                <Popover.Button
                  type="button"
                  onClick={handleMentionButtonClick}
                  title="Menções"
                  disabled={isSubmitting}
                  className="grid size-6 cursor-pointer place-items-center rounded text-tertiary transition-colors hover:bg-layer-2 hover:text-primary"
                >
                  <AtSign className="size-4" />
                </Popover.Button>
                {isMentionPickerOpen && (
                  <Popover.Panel
                    static
                    className="shadow-md absolute bottom-full left-0 z-20 mb-2.5 w-64 rounded-md border border-subtle bg-surface-1 p-1"
                  >
                    <div className="tracking-wider px-2 py-1.5 text-[10px] font-semibold text-tertiary uppercase">
                      Mencionar membro
                    </div>
                    {filteredMembers.length === 0 ? (
                      <div className="px-3 py-2 text-center text-12 text-tertiary">Nenhum membro encontrado</div>
                    ) : (
                      <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                        {filteredMembers.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => handleInsertMention(member)}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-12 transition-colors hover:bg-layer-2"
                          >
                            <Avatar src={getFileURL(member.avatar_url ?? "")} name={member.display_name} size="sm" />
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate font-medium text-primary">
                                {member.display_name || `${member.first_name || ""} ${member.last_name || ""}`.trim()}
                              </span>
                              {member.email && <span className="truncate text-11 text-tertiary">{member.email}</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </Popover.Panel>
                )}
              </Popover>

              <span className="mx-0.5 h-4 w-px bg-layer-2" />

              <Popover className="relative">
                <Popover.Button
                  type="button"
                  className="flex h-6 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-2 text-12 font-medium text-secondary transition-colors hover:border-strong"
                >
                  <Zap className="size-3 text-warning-primary" />
                  Macros
                  <ChevronDown className="size-3" />
                </Popover.Button>
                <Popover.Panel className="shadow-md absolute bottom-full left-0 z-20 mb-2.5 w-64 rounded-md border border-subtle bg-surface-1 p-1">
                  {({ close }: { close: () => void }) =>
                    !macros || macros.length === 0 ? (
                      <div className="px-3 py-2 text-center text-12 text-tertiary">Nenhuma macro disponível</div>
                    ) : (
                      <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
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
                            <span className="flex items-center gap-1 font-medium text-primary">
                              {macro.name}
                              {!macro.is_public && (
                                <span className="rounded bg-layer-2 px-1 text-[10px] text-tertiary">Privada</span>
                              )}
                            </span>
                            {macro.description && (
                              <span className="w-full truncate text-11 text-tertiary">{macro.description}</span>
                            )}
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
});
