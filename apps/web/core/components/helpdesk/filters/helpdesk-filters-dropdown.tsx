/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { ListFilter } from "lucide-react";
import type {
  IHelpdeskForm,
  IHelpdeskPortal,
  IHelpdeskRequestFilters,
  IHelpdeskStatus,
  THelpdeskRequestSource,
} from "@plane/types";
import { Avatar } from "@plane/ui";
import { PriorityIcon } from "@plane/propel/icons";
import { FiltersDropdown } from "@/components/issues/issue-layouts/filters/header/helpers/dropdown";
import { FilterHeader } from "@/components/issues/issue-layouts/filters/header/helpers/filter-header";
import { FilterOption } from "@/components/issues/issue-layouts/filters/header/helpers/filter-option";
import { HELPDESK_PRIORITIES, hasActiveHelpdeskFilters } from "@/helpers/helpdesk/filters";
import { useMember } from "@/hooks/store/use-member";

type Props = {
  filters: IHelpdeskRequestFilters;
  statuses: IHelpdeskStatus[];
  portals: IHelpdeskPortal[];
  forms: IHelpdeskForm[];
  onChange: (key: keyof IHelpdeskRequestFilters, values: string[]) => void;
};

const SOURCE_OPTIONS: { value: THelpdeskRequestSource; label: string }[] = [
  { value: "public_form", label: "Public form" },
  { value: "internal_form", label: "Internal form" },
];

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export const HelpdeskFiltersDropdown = observer(function HelpdeskFiltersDropdown(props: Props) {
  const { filters, statuses, portals, forms, onChange } = props;
  const {
    workspace: { workspaceMemberIds },
    getUserDetails,
  } = useMember();

  const [previews, setPreviews] = useState({
    status: true,
    assignees: true,
    portal: false,
    form: false,
    source: false,
    priority: true,
    created_at: false,
  });
  const togglePreview = (key: keyof typeof previews) => setPreviews((p) => ({ ...p, [key]: !p[key] }));

  const memberIds = workspaceMemberIds ?? [];

  const dateAfter = filters.created_at.find((t) => t.startsWith("after:"))?.slice("after:".length) ?? "";
  const dateBefore = filters.created_at.find((t) => t.startsWith("before:"))?.slice("before:".length) ?? "";
  const handleDateChange = (bound: "after" | "before", value: string) => {
    const others = filters.created_at.filter((t) => !t.startsWith(`${bound}:`));
    onChange("created_at", value ? [...others, `${bound}:${value}`] : others);
  };

  return (
    <FiltersDropdown
      title="Filters"
      placement="bottom-end"
      icon={<ListFilter className="size-3.5" />}
      isFiltersApplied={hasActiveHelpdeskFilters(filters)}
    >
      <div className="flex h-full w-full flex-col overflow-hidden p-2.5">
        <div className="vertical-scrollbar flex scrollbar-sm flex-col gap-2 overflow-y-auto">
          {/* Status */}
          <div>
            <FilterHeader
              title={`Status${filters.status.length ? ` (${filters.status.length})` : ""}`}
              isPreviewEnabled={previews.status}
              handleIsPreviewEnabled={() => togglePreview("status")}
            />
            {previews.status &&
              statuses.map((s) => (
                <FilterOption
                  key={s.id}
                  isChecked={filters.status.includes(s.id)}
                  onClick={() => onChange("status", toggle(filters.status, s.id))}
                  title={s.name}
                  icon={<span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />}
                  multiple
                />
              ))}
          </div>

          {/* Assignees */}
          <div>
            <FilterHeader
              title={`Assignee${filters.assignees.length ? ` (${filters.assignees.length})` : ""}`}
              isPreviewEnabled={previews.assignees}
              handleIsPreviewEnabled={() => togglePreview("assignees")}
            />
            {previews.assignees &&
              memberIds.map((id) => {
                const user = getUserDetails(id);
                if (!user) return null;
                return (
                  <FilterOption
                    key={id}
                    isChecked={filters.assignees.includes(id)}
                    onClick={() => onChange("assignees", toggle(filters.assignees, id))}
                    title={user.display_name}
                    icon={<Avatar name={user.display_name} src={user.avatar_url} size="md" showTooltip={false} />}
                    multiple
                  />
                );
              })}
          </div>

          {/* Portal */}
          {portals.length > 1 && (
            <div>
              <FilterHeader
                title={`Portal${filters.portal.length ? ` (${filters.portal.length})` : ""}`}
                isPreviewEnabled={previews.portal}
                handleIsPreviewEnabled={() => togglePreview("portal")}
              />
              {previews.portal &&
                portals.map((p) => (
                  <FilterOption
                    key={p.id}
                    isChecked={filters.portal.includes(p.id)}
                    onClick={() => onChange("portal", toggle(filters.portal, p.id))}
                    title={p.public_slug}
                    multiple
                  />
                ))}
            </div>
          )}

          {/* Form */}
          {forms.length > 0 && (
            <div>
              <FilterHeader
                title={`Form${filters.form.length ? ` (${filters.form.length})` : ""}`}
                isPreviewEnabled={previews.form}
                handleIsPreviewEnabled={() => togglePreview("form")}
              />
              {previews.form &&
                forms.map((f) => (
                  <FilterOption
                    key={f.id}
                    isChecked={filters.form.includes(f.id)}
                    onClick={() => onChange("form", toggle(filters.form, f.id))}
                    title={f.name}
                    multiple
                  />
                ))}
            </div>
          )}

          {/* Source */}
          <div>
            <FilterHeader
              title={`Source${filters.source.length ? ` (${filters.source.length})` : ""}`}
              isPreviewEnabled={previews.source}
              handleIsPreviewEnabled={() => togglePreview("source")}
            />
            {previews.source &&
              SOURCE_OPTIONS.map((opt) => (
                <FilterOption
                  key={opt.value}
                  isChecked={filters.source.includes(opt.value)}
                  onClick={() => onChange("source", toggle(filters.source, opt.value))}
                  title={opt.label}
                  multiple
                />
              ))}
          </div>

          {/* Priority */}
          <div>
            <FilterHeader
              title={`Priority${filters.priority.length ? ` (${filters.priority.length})` : ""}`}
              isPreviewEnabled={previews.priority}
              handleIsPreviewEnabled={() => togglePreview("priority")}
            />
            {previews.priority &&
              HELPDESK_PRIORITIES.map((opt) => (
                <FilterOption
                  key={opt.id}
                  isChecked={filters.priority.includes(opt.id)}
                  onClick={() => onChange("priority", toggle(filters.priority, opt.id))}
                  icon={<PriorityIcon priority={opt.id} size={12} withContainer />}
                  title={opt.name}
                  multiple
                />
              ))}
          </div>

          {/* Created at */}
          <div>
            <FilterHeader
              title={`Created at${filters.created_at.length ? ` (${filters.created_at.length})` : ""}`}
              isPreviewEnabled={previews.created_at}
              handleIsPreviewEnabled={() => togglePreview("created_at")}
            />
            {previews.created_at && (
              <div className="flex flex-col gap-2 p-1.5">
                <label className="flex items-center justify-between gap-2 text-caption-sm-regular text-secondary">
                  After
                  <input
                    type="date"
                    value={dateAfter}
                    onChange={(e) => handleDateChange("after", e.target.value)}
                    className="rounded-sm border border-subtle bg-surface-1 px-2 py-1 text-caption-sm-regular text-primary"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-caption-sm-regular text-secondary">
                  Before
                  <input
                    type="date"
                    value={dateBefore}
                    onChange={(e) => handleDateChange("before", e.target.value)}
                    className="rounded-sm border border-subtle bg-surface-1 px-2 py-1 text-caption-sm-regular text-primary"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </FiltersDropdown>
  );
});
