/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { X } from "lucide-react";
import type { IHelpdeskForm, IHelpdeskPortal, IHelpdeskRequestFilters, IHelpdeskStatus } from "@plane/types";
import { hasActiveHelpdeskFilters } from "@/helpers/helpdesk/filters";
import { useMember } from "@/hooks/store/use-member";

type Props = {
  filters: IHelpdeskRequestFilters;
  statuses: IHelpdeskStatus[];
  portals: IHelpdeskPortal[];
  forms: IHelpdeskForm[];
  onRemove: (key: keyof IHelpdeskRequestFilters, value: string) => void;
  onClear: () => void;
};

const SOURCE_LABELS: Record<string, string> = {
  public_form: "Public form",
  internal_form: "Internal form",
};

const GROUP_TITLES: Record<keyof IHelpdeskRequestFilters, string> = {
  status: "Status",
  assignees: "Assignee",
  portal: "Portal",
  form: "Form",
  source: "Source",
  created_at: "Created at",
};

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded-sm bg-layer-1 px-1.5 py-0.5 text-11 text-secondary">
      <span className="max-w-[160px] truncate">{label}</span>
      <button type="button" onClick={onRemove} className="grid place-items-center rounded-sm hover:bg-layer-2">
        <X className="size-3" />
      </button>
    </div>
  );
}

export const HelpdeskAppliedFilters = observer(function HelpdeskAppliedFilters(props: Props) {
  const { filters, statuses, portals, forms, onRemove, onClear } = props;
  const { getUserDetails } = useMember();

  if (!hasActiveHelpdeskFilters(filters)) return null;

  const statusMap = Object.fromEntries(statuses.map((s) => [s.id, s.name]));
  const portalMap = Object.fromEntries(portals.map((p) => [p.id, p.public_slug]));
  const formMap = Object.fromEntries(forms.map((f) => [f.id, f.name]));

  const labelFor = (key: keyof IHelpdeskRequestFilters, value: string): string => {
    switch (key) {
      case "status":
        return statusMap[value] ?? value;
      case "assignees":
        return getUserDetails(value)?.display_name ?? value;
      case "portal":
        return portalMap[value] ?? value;
      case "form":
        return formMap[value] ?? value;
      case "source":
        return SOURCE_LABELS[value] ?? value;
      case "created_at":
        return value.replace("after:", "After ").replace("before:", "Before ");
      default:
        return value;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-subtle bg-surface-1 px-4 py-2">
      {(Object.keys(filters) as (keyof IHelpdeskRequestFilters)[]).map((key) => {
        const values = filters[key];
        if (!values?.length) return null;
        return (
          <div key={key} className="flex items-center gap-1.5 rounded-sm border border-subtle px-2 py-1">
            <span className="text-11 font-medium text-tertiary">{GROUP_TITLES[key]}</span>
            <div className="flex flex-wrap items-center gap-1">
              {values.map((value) => (
                <Chip key={value} label={labelFor(key, value)} onRemove={() => onRemove(key, value)} />
              ))}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onClear}
        className="flex items-center gap-1 rounded-sm px-2 py-1 text-11 text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
      >
        <X className="size-3" />
        Clear all
      </button>
    </div>
  );
});
