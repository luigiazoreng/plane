/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef } from "react";
import { RichTextEditorWithRef } from "@plane/editor";
import type { EditorRefApi, TFileHandler } from "@plane/editor";
import { generateFileUploadPayload, getFileMetaDataForUpload } from "@plane/services";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { MAX_FILE_SIZE } from "@plane/constants";
import { FileUploadService } from "@/services/file-upload.service";
import type { TAttachmentTransport } from "./attachments/use-attachment-upload";

const fileUploadService = new FileUploadService();

/** Max files accepted per single paste/drop operation inside the editor —
 * mirrors the cap already used by AttachmentFieldInput, and stays well under
 * the server-side HELPDESK_MAX_ATTACHMENTS_PER_COMMENT ceiling (10). */
const MAX_FILES_PER_OPERATION = 5;

type Props = {
  value: string;
  onChange: (html: string) => void;
  attachmentTransport: TAttachmentTransport;
  /** Reports the running list of asset ids collected from paste/drop, so the
   * parent form can merge them into asset_ids at submit time. */
  onAdditionalAttachmentIds?: (assetIds: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Rich text editor for the Helpdesk ticket description field.
 *
 * Modeled on apps/space/components/editor/rich-text-editor.tsx: this surface
 * has no authenticated workspace member session (public portal, or an agent
 * composing without full editor config), so it must NOT use
 * apps/web/core/components/editor/rich-text/editor.tsx's hooks
 * (useEditorConfig/useMember/useEditorFlagging) -- those assume a logged-in
 * workspace member and will break here.
 *
 * Pasted/dropped files (including images) never get embedded in the HTML
 * body -- they always become ticket attachments, routed through the same
 * attachmentTransport the dedicated attachment field uses.
 */
export const HelpdeskDescriptionEditor = ({
  value,
  onChange,
  attachmentTransport,
  onAdditionalAttachmentIds,
  disabled = false,
  placeholder,
}: Props) => {
  const editorRef = useRef<EditorRefApi>(null);
  // Ids collected from paste/drop across the life of this editor instance.
  const collectedAssetIdsRef = useRef<string[]>([]);
  // How many files are mid-upload from a single paste/drop batch, to enforce
  // the per-operation cap even while uploads are still in flight.
  const inFlightCountRef = useRef(0);
  const lastEmittedValueRef = useRef(value);

  const handleChange = useCallback(
    (_json: object, html: string) => {
      lastEmittedValueRef.current = html;
      onChange(html);
    },
    [onChange]
  );

  // Only pass value if changed externally (e.g. form reset), avoiding setContent on every keystroke
  const isExternalChange = value !== lastEmittedValueRef.current;
  const syncValue = isExternalChange ? value : null;
  if (isExternalChange) {
    lastEmittedValueRef.current = value;
  }

  const uploadFile: TFileHandler["upload"] = useCallback(
    async (_blockId, file) => {
      const meta = await getFileMetaDataForUpload(file);
      const credentials = await attachmentTransport.getCredentials({
        name: meta.name,
        type: meta.type,
        size: meta.size,
      });
      await fileUploadService.uploadFile(
        credentials.upload_data.url,
        generateFileUploadPayload(credentials as never, file)
      );
      await attachmentTransport.markUploaded(credentials.asset_id);
      return credentials.asset_id;
    },
    [attachmentTransport]
  );

  const handleAttachmentFile = useCallback(
    (file: File) => {
      if (inFlightCountRef.current >= MAX_FILES_PER_OPERATION) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "File limit exceeded",
          message: `Maximum of ${MAX_FILES_PER_OPERATION} files per paste/drop operation.`,
        });
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "File size too large",
          message: `${file.name} exceeds the maximum allowed size.`,
        });
        return;
      }

      inFlightCountRef.current += 1;
      const blockId = `${Date.now()}-${file.name}`;

      uploadFile(blockId, file)
        .then((assetId) => {
          collectedAssetIdsRef.current = [...collectedAssetIdsRef.current, assetId];
          onAdditionalAttachmentIds?.(collectedAssetIdsRef.current);
          return assetId;
        })
        .catch((error) => {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Upload failed",
            message: `Could not upload ${file.name}.`,
          });
          return error;
        })
        .finally(() => {
          inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
        });
    },
    [uploadFile, onAdditionalAttachmentIds]
  );

  return (
    <RichTextEditorWithRef
      ref={editorRef}
      id="helpdesk-request-description"
      initialValue={value || "<p></p>"}
      value={syncValue}
      onChange={handleChange}
      editable={!disabled}
      disabledExtensions={[]}
      flaggedExtensions={[]}
      dragDropEnabled
      placeholder={placeholder}
      containerClassName="rounded-md border border-subtle bg-surface-1 min-h-[140px] px-3"
      editorClassName="min-h-[110px] py-2"
      onAttachmentFile={handleAttachmentFile}
      treatImagesAsAttachments
      fileHandler={{
        checkIfAssetExists: async () => true,
        assetsUploadStatus: {},
        getAssetDownloadSrc: async () => "",
        getAssetSrc: async () => "",
        upload: uploadFile,
        delete: async () => {
          // Attachments here are never embedded inline, so the editor never
          // needs to delete an asset by itself -- removal happens through the
          // ticket's attachment list, same as the dedicated attachment field.
        },
        cancel: () => {},
        restore: async () => {},
        duplicate: async (assetId: string) => assetId,
        validation: {
          maxFileSize: MAX_FILE_SIZE,
        },
      }}
      mentionHandler={{
        renderComponent: () => null,
      }}
      getEditorMetaData={() => ({ file_assets: [], user_mentions: [] })}
      extendedEditorProps={{}}
    />
  );
};

HelpdeskDescriptionEditor.displayName = "HelpdeskDescriptionEditor";
