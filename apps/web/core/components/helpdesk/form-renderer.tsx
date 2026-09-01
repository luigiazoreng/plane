/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { Input } from "@plane/propel/input";
import type { IHelpdeskFormField } from "@plane/types";
import { AttachmentPicker } from "./attachments/attachment-picker";
import { PendingAttachmentChips } from "./attachments/attachment-chips";
import { useAttachmentUpload, type TAttachmentTransport } from "./attachments/use-attachment-upload";
import { HelpdeskDescriptionEditor } from "./description-editor";

function resolveCascadeOptions(
  field: IHelpdeskFormField,
  fieldMap: Record<string, IHelpdeskFormField>,
  values: Record<string, unknown>
): IHelpdeskFormField["options"] {
  if (!field.parent_field_key) {
    return field.options;
  }

  const parentValue = values[field.parent_field_key];
  if (!parentValue || typeof parentValue !== "string") return [];

  const allowed = new Set(field.parent_mapping[parentValue] ?? []);
  if (allowed.size === 0) return [];
  return field.options.filter((opt) => allowed.has(opt.value));
}

type FieldRendererProps = {
  field: IHelpdeskFormField;
  value: unknown;
  onChange: (value: unknown) => void;
  /** All fields from the same form, keyed by field key — needed for cascade resolution */
  fieldMap: Record<string, IHelpdeskFormField>;
  /** Full values map — needed for cascade parent resolution */
  values: Record<string, unknown>;
  disabled?: boolean;
  attachmentTransport?: TAttachmentTransport;
  /** Reports asset ids collected from paste/drop inside the description
   * editor, so the parent form can merge them into asset_ids at submit. */
  onAdditionalAttachmentIds?: (assetIds: string[]) => void;
};

function FieldInput({
  field,
  value,
  onChange,
  fieldMap,
  values,
  disabled,
  attachmentTransport,
  onAdditionalAttachmentIds,
}: FieldRendererProps) {
  switch (field.field_type) {
    case "system_title":
    case "short_text":
      return (
        <Input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full"
          disabled={disabled}
        />
      );
    case "system_description":
    case "long_text":
      return attachmentTransport ? (
        <HelpdeskDescriptionEditor
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          attachmentTransport={attachmentTransport}
          onAdditionalAttachmentIds={onAdditionalAttachmentIds}
          disabled={disabled}
          placeholder={field.placeholder}
        />
      ) : (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="text-sm text-primary placeholder:text-placeholder focus:border-accent-subtle min-h-[140px] w-full rounded-md border border-subtle bg-surface-1 p-3 outline-none disabled:opacity-60"
          disabled={disabled}
        />
      );
    case "select": {
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm text-primary focus:border-accent-subtle w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 outline-none disabled:opacity-60"
          disabled={disabled}
        >
          <option value="">Select an option</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    case "cascade_select": {
      const options = resolveCascadeOptions(field, fieldMap, values);
      const parentKey = field.parent_field_key;
      const parentValue = parentKey ? values[parentKey] : undefined;
      const isBlocked = !!parentKey && !parentValue;

      // Find parent label for placeholder
      const parentField = parentKey ? fieldMap[parentKey] : null;
      const placeholder = isBlocked ? `Select ${parentField?.label ?? "parent"} first` : "Select an option";

      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm text-primary focus:border-accent-subtle w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 outline-none disabled:opacity-60"
          disabled={disabled || isBlocked || options.length === 0}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    case "checkbox":
      return (
        <label className="text-sm text-secondary flex items-center gap-3">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-subtle"
            disabled={disabled}
          />
          <span>{field.help_text || field.label}</span>
        </label>
      );
    case "date":
      return (
        <Input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          className="w-full"
          disabled={disabled}
        />
      );
    case "attachment":
      return (
        <AttachmentFieldInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          transport={disabled ? undefined : attachmentTransport}
        />
      );
    default:
      return null;
  }
}

function AttachmentFieldInput({
  field,
  value,
  onChange,
  disabled,
  transport,
}: {
  field: IHelpdeskFormField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  transport?: TAttachmentTransport;
}) {
  const { pending, upload, remove } = useAttachmentUpload(
    transport || {
      getCredentials: async () => {
        throw new Error("No transport available");
      },
      markUploaded: async () => {},
    }
  );

  // Sync uploaded asset ids to the form state
  React.useEffect(() => {
    const assetIds = pending.filter((p) => p.status === "done" && p.assetId).map((p) => p.assetId as string);
    // Only update if it changed
    const current = Array.isArray(value) ? value : value ? [value] : [];
    if (JSON.stringify(current) !== JSON.stringify(assetIds)) {
      onChange(assetIds);
    }
  }, [pending, value, onChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AttachmentPicker
          onSelect={upload}
          disabled={disabled || !transport || pending.length >= 5} // Limit to 5 per field
          title="Anexar arquivo (Max 5)"
        />
        <span className="text-sm text-placeholder">
          {!transport
            ? "Attachments not available in preview"
            : pending.length >= 5
              ? "Maximum attachments reached"
              : "Anexar arquivo"}
        </span>
      </div>
      <PendingAttachmentChips attachments={pending} onRemove={remove} />
    </div>
  );
}

type HelpdeskFormRendererProps = {
  fields: IHelpdeskFormField[];
  values?: Record<string, unknown>;
  onValueChange?: (key: string, value: unknown) => void;
  isPreview?: boolean;
  attachmentTransport?: TAttachmentTransport;
  /** Reports asset ids collected from paste/drop inside the description
   * editor, so the parent form can merge them into asset_ids at submit. */
  onAdditionalAttachmentIds?: (assetIds: string[]) => void;
};

export function HelpdeskFormRenderer({
  fields,
  values = {},
  onValueChange,
  isPreview = false,
  attachmentTransport,
  onAdditionalAttachmentIds,
}: HelpdeskFormRendererProps) {
  const ordered = fields.slice().sort((a, b) => a.sequence - b.sequence);
  const fieldMap: Record<string, IHelpdeskFormField> = {};
  for (const f of ordered) fieldMap[f.key] = f;

  return (
    <div className="space-y-6">
      {ordered.map((field) => (
        <div key={field.id}>
          <label className="text-sm text-secondary mb-1.5 block font-medium">
            {field.label} {field.required ? <span className="text-danger-primary">*</span> : null}
          </label>
          <FieldInput
            field={field}
            value={values[field.key]}
            onChange={(val) => onValueChange?.(field.key, val)}
            fieldMap={fieldMap}
            values={values}
            disabled={isPreview}
            attachmentTransport={attachmentTransport}
            onAdditionalAttachmentIds={onAdditionalAttachmentIds}
          />
          {field.field_type !== "checkbox" && field.help_text ? (
            <p className="text-xs text-placeholder mt-1">{field.help_text}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
