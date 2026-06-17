"use client";

import { observer } from "mobx-react";
import type { IHelpdeskAnalyticsFilters, IHelpdeskPortal, THelpdeskDateFilter } from "@plane/types";

type Props = {
  filters: IHelpdeskAnalyticsFilters;
  portals: IHelpdeskPortal[];
  onChange: (filters: IHelpdeskAnalyticsFilters) => void;
};

const DATE_FILTER_OPTIONS: { label: string; value: THelpdeskDateFilter }[] = [
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last_7_days" },
  { label: "Last 30 days", value: "last_30_days" },
  { label: "Last 3 months", value: "last_3_months" },
];

export const AnalyticsFilters = observer(function AnalyticsFilters({ filters, portals, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={filters.date_filter}
        onChange={(e) => onChange({ ...filters, date_filter: e.target.value as THelpdeskDateFilter })}
        className="border-custom-border-200 bg-custom-background-100 text-xs text-custom-text-200 focus:ring-custom-border-300 h-7 rounded-md border px-2.5 font-medium focus:ring-1 focus:outline-none"
      >
        {DATE_FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {portals.length > 1 && (
        <select
          value={filters.portal_id ?? ""}
          onChange={(e) => onChange({ ...filters, portal_id: e.target.value || undefined })}
          className="border-custom-border-200 bg-custom-background-100 text-xs text-custom-text-200 focus:ring-custom-border-300 h-7 rounded-md border px-2.5 font-medium focus:ring-1 focus:outline-none"
        >
          <option value="">All portals</option>
          {portals.map((portal) => (
            <option key={portal.id} value={portal.id}>
              {portal.public_slug}
            </option>
          ))}
        </select>
      )}
    </div>
  );
});
