"use client";

import { observer } from "mobx-react";
import { Calendar, ChevronDown, Globe } from "lucide-react";
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
      {/* Date Filter */}
      <div className="relative flex items-center">
        <div className="text-tertiary pointer-events-none absolute left-2.5 flex items-center">
          <Calendar className="size-3.5" />
        </div>
        <select
          value={filters.date_filter}
          onChange={(e) => onChange({ ...filters, date_filter: e.target.value as THelpdeskDateFilter })}
          className="border-subtle bg-surface-1 text-primary hover:bg-layer-1 hover:border-strong focus:ring-strong text-xs h-7 cursor-pointer appearance-none rounded-md border pr-7 pl-8 font-medium transition-colors focus:ring-1 focus:outline-none"
        >
          {DATE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="text-tertiary pointer-events-none absolute right-2 flex items-center">
          <ChevronDown className="size-3" />
        </div>
      </div>

      {/* Portal Filter */}
      {portals.length > 1 && (
        <div className="relative flex items-center">
          <div className="text-tertiary pointer-events-none absolute left-2.5 flex items-center">
            <Globe className="size-3.5" />
          </div>
          <select
            value={filters.portal_id ?? ""}
            onChange={(e) => onChange({ ...filters, portal_id: e.target.value || undefined })}
            className="border-subtle bg-surface-1 text-primary hover:bg-layer-1 hover:border-strong focus:ring-strong text-xs h-7 cursor-pointer appearance-none rounded-md border pr-7 pl-8 font-medium transition-colors focus:ring-1 focus:outline-none"
          >
            <option value="">All portals</option>
            {portals.map((portal) => (
              <option key={portal.id} value={portal.id}>
                {portal.public_slug}
              </option>
            ))}
          </select>
          <div className="text-tertiary pointer-events-none absolute right-2 flex items-center">
            <ChevronDown className="size-3" />
          </div>
        </div>
      )}
    </div>
  );
});
