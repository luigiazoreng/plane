/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { generateFileUploadPayload, getFileMetaDataForUpload } from "@plane/services";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { convertBytesToSize } from "@plane/utils";
import { FileUploadService } from "@/services/file-upload.service";
import { useFileSize } from "@/plane-web/hooks/use-file-size";

const fileUploadService = new FileUploadService();

export type TPendingAttachment = {
  /** Local id while uploading; replaced by the server asset id on success. */
  tempId: string;
  assetId: string | null;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
};

/**
 * Credential/confirm pair, so the same hook drives both the agent panel and the
 * public portal -- they hit different endpoints and authenticate differently,
 * but the three-step flow is identical.
 */
export type TAttachmentTransport = {
  getCredentials: (data: { name: string; type: string; size: number }) => Promise<{
    asset_id: string;
    upload_data: { url: string; fields: Record<string, string> };
  }>;
  markUploaded: (assetId: string) => Promise<void>;
  remove?: (assetId: string) => Promise<void>;
};

export const useAttachmentUpload = (transport: TAttachmentTransport) => {
  const [pending, setPending] = useState<TPendingAttachment[]>([]);
  const { maxFileSize } = useFileSize();

  const upload = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        if (file.size > maxFileSize) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Arquivo muito grande",
            message: `${file.name} excede o limite de ${convertBytesToSize(maxFileSize)}.`,
          });
          continue;
        }

        const tempId = `${Date.now()}-${file.name}`;
        setPending((prev) => [...prev, { tempId, assetId: null, name: file.name, size: file.size, status: "uploading" }]);

        try {
          // Sniffs the real MIME type from the file signature and rejects
          // dangerous extensions -- do not trust file.type, which is
          // attacker-controlled on a public portal.
          const meta = await getFileMetaDataForUpload(file);
          const credentials = await transport.getCredentials({
            name: meta.name,
            type: meta.type,
            size: meta.size,
          });
          await fileUploadService.uploadFile(
            credentials.upload_data.url,
            generateFileUploadPayload(credentials as never, file)
          );
          await transport.markUploaded(credentials.asset_id);

          setPending((prev) =>
            prev.map((p) => (p.tempId === tempId ? { ...p, assetId: credentials.asset_id, status: "done" } : p))
          );
        } catch {
          setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, status: "error" } : p)));
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Falha no upload",
            message: `Não foi possível enviar ${file.name}.`,
          });
        }
      }
    },
    [maxFileSize, transport]
  );

  const remove = useCallback(
    async (tempId: string) => {
      const target = pending.find((p) => p.tempId === tempId);
      setPending((prev) => prev.filter((p) => p.tempId !== tempId));
      // Best effort: the asset is unbound, so the daily sweep collects it even
      // if this fails or the endpoint is not available on this surface.
      if (target?.assetId && transport.remove) {
        await transport.remove(target.assetId).catch(() => null);
      }
    },
    [pending, transport]
  );

  const clear = useCallback(() => setPending([]), []);

  /** Ids to send with the comment. Files still uploading are excluded. */
  const assetIds = pending.filter((p) => p.status === "done" && p.assetId).map((p) => p.assetId as string);
  const isUploading = pending.some((p) => p.status === "uploading");

  return { pending, upload, remove, clear, assetIds, isUploading };
};
