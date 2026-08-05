/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
// constants
import { ACCEPTED_ATTACHMENT_MIME_TYPES, ACCEPTED_IMAGE_MIME_TYPES } from "@/constants/config";
// types
import type { TEditorCommands, TExtensions } from "@/types";

type Props = {
  disabledExtensions?: TExtensions[];
  flaggedExtensions?: TExtensions[];
  editor: Editor;
  onAttachmentFile?: (file: File) => void;
  treatImagesAsAttachments?: boolean;
};

export const DropHandlerPlugin = (props: Props): Plugin => {
  const { disabledExtensions, flaggedExtensions, editor, onAttachmentFile, treatImagesAsAttachments } = props;

  return new Plugin({
    key: new PluginKey("drop-handler-plugin"),
    props: {
      handlePaste: (view, event) => {
        if (
          editor.isEditable &&
          event.clipboardData &&
          event.clipboardData.files &&
          event.clipboardData.files.length > 0
        ) {
          event.preventDefault();
          const files = Array.from(event.clipboardData.files);
          const acceptedFiles = files.filter(
            (f) => ACCEPTED_IMAGE_MIME_TYPES.includes(f.type) || ACCEPTED_ATTACHMENT_MIME_TYPES.includes(f.type)
          );

          if (acceptedFiles.length) {
            const pos = view.state.selection.from;
            insertFilesSafely({
              disabledExtensions,
              flaggedExtensions,
              editor,
              files: acceptedFiles,
              initialPos: pos,
              event: "drop",
              onAttachmentFile,
              treatImagesAsAttachments,
            });
          }
          return true;
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (
          editor.isEditable &&
          !moved &&
          event.dataTransfer &&
          event.dataTransfer.files &&
          event.dataTransfer.files.length > 0
        ) {
          event.preventDefault();
          const files = Array.from(event.dataTransfer.files);
          const acceptedFiles = files.filter(
            (f) => ACCEPTED_IMAGE_MIME_TYPES.includes(f.type) || ACCEPTED_ATTACHMENT_MIME_TYPES.includes(f.type)
          );

          if (acceptedFiles.length) {
            const coordinates = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });

            if (coordinates) {
              const pos = coordinates.pos;
              insertFilesSafely({
                disabledExtensions,
                editor,
                files: acceptedFiles,
                initialPos: pos,
                event: "drop",
                onAttachmentFile,
                treatImagesAsAttachments,
              });
            }
            return true;
          }
        }
        return false;
      },
    },
  });
};

type InsertFilesSafelyArgs = {
  disabledExtensions?: TExtensions[];
  flaggedExtensions?: TExtensions[];
  editor: Editor;
  event: "insert" | "drop";
  files: File[];
  initialPos: number;
  type?: Extract<TEditorCommands, "attachment" | "image">;
  /** Called for every file (or every image, when treatImagesAsAttachments is set)
   * that should become a ticket/comment attachment instead of being inserted
   * into the document body. */
  onAttachmentFile?: (file: File) => void;
  /** When true, images are routed to onAttachmentFile instead of being
   * inserted inline via insertImageComponent -- used by surfaces (e.g. the
   * Helpdesk description editor) where pasted/dropped images must always
   * become attachments, never embedded content. */
  treatImagesAsAttachments?: boolean;
};

export const insertFilesSafely = async (args: InsertFilesSafelyArgs) => {
  const { disabledExtensions, editor, event, files, initialPos, type, onAttachmentFile, treatImagesAsAttachments } =
    args;
  let pos = initialPos;

  for (const file of files) {
    // safe insertion
    const docSize = editor.state.doc.content.size;
    pos = Math.min(pos, docSize);

    let fileType: "image" | "attachment" | null = null;

    try {
      if (type) {
        if (["image", "attachment"].includes(type)) fileType = type;
        else throw new Error("Wrong file type passed");
      } else {
        if (ACCEPTED_IMAGE_MIME_TYPES.includes(file.type)) fileType = "image";
        else if (ACCEPTED_ATTACHMENT_MIME_TYPES.includes(file.type)) fileType = "attachment";
      }
      // insert file depending on the type at the current position
      if (fileType === "image" && treatImagesAsAttachments) {
        onAttachmentFile?.(file);
      } else if (fileType === "image" && !disabledExtensions?.includes("image")) {
        editor.commands.insertImageComponent({
          file,
          pos,
          event,
        });
      } else if (fileType === "attachment") {
        onAttachmentFile?.(file);
      }
    } catch (error) {
      console.error(`Error while ${event}ing file:`, error);
    }

    // Move to the next position
    pos += 1;
  }
};
