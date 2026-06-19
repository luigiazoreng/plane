/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { Input } from "@plane/propel/input";
import type { IHelpdeskFormField } from "@plane/types";

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
};

function FieldInput({ field, value, onChange, fieldMap, values, disabled }: FieldRendererProps) {
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
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="text-sm text-text-100 placeholder:text-text-400 focus:border-primary min-h-[140px] w-full rounded-md border border-subtle bg-surface-1 p-3 outline-none disabled:opacity-60"
          disabled={disabled}
        />
      );
    case "select": {
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm text-text-100 focus:border-primary w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 outline-none disabled:opacity-60"
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
      const placeholder = isBlocked
        ? `Select ${parentField?.label ?? "parent"} first`
        : "Select an option";

      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm text-text-100 focus:border-primary w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 outline-none disabled:opacity-60"
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
        <label className="text-sm text-text-200 flex items-center gap-3">
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
    default:
      return null;
  }
}

type HelpdeskFormRendererProps = {
  fields: IHelpdeskFormField[];
  values?: Record<string, unknown>;
  onValueChange?: (key: string, value: unknown) => void;
  isPreview?: boolean;
};

export function HelpdeskFormRenderer({
  fields,
  values = {},
  onValueChange,
  isPreview = false,
}: HelpdeskFormRendererProps) {
  const ordered = fields.slice().sort((a, b) => a.sequence - b.sequence);
  const fieldMap: Record<string, IHelpdeskFormField> = {};
  for (const f of ordered) fieldMap[f.key] = f;

  return (
    <div className="space-y-6">
      {ordered.map((field) => (
        <div key={field.id}>
          <label className="text-sm text-text-200 mb-1.5 block font-medium">
            {field.label}{" "}
            {field.required ? <span className="text-red-500">*</span> : null}
          </label>
          <FieldInput
            field={field}
            value={values[field.key]}
            onChange={(val) => onValueChange?.(field.key, val)}
            fieldMap={fieldMap}
            values={values}
            disabled={isPreview}
          />
          {field.field_type !== "checkbox" && field.help_text ? (
            <p className="text-xs text-text-400 mt-1">{field.help_text}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
