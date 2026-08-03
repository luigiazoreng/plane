/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TKpiPeriod } from "@plane/types";
import { cn } from "@plane/utils";

// "custom" is reachable through the API's start/end params, not this control.
const OPTIONS: { key: Exclude<TKpiPeriod, "custom">; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "180d", label: "6m" },
  { key: "365d", label: "1y" },
  { key: "all", label: "All" },
];

type Props = {
  value: TKpiPeriod;
  onChange: (period: Exclude<TKpiPeriod, "custom">) => void;
  disabled?: boolean;
  /** Restrict the offered presets, e.g. where a paired data source can't span "all". */
  options?: readonly Exclude<TKpiPeriod, "custom">[];
};

export const KpiPeriodSelector = (props: Props) => {
  const { value, onChange, disabled = false, options } = props;
  const visibleOptions = options ? OPTIONS.filter((option) => options.includes(option.key)) : OPTIONS;

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Reporting period">
      {visibleOptions.map((option) => (
        <button
          key={option.key}
          type="button"
          disabled={disabled}
          aria-pressed={option.key === value}
          onClick={() => onChange(option.key)}
          className={cn(
            "rounded px-2 py-1 text-11 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            option.key === value
              ? "bg-accent-primary/10 text-accent-primary"
              : "text-tertiary hover:bg-layer-1 hover:text-secondary"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};
