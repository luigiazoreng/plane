/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState } from "react";
import { Popover, Transition } from "@headlessui/react";
import { Calendar } from "lucide-react";
import type { TKpiPeriod } from "@plane/types";
import { cn } from "@plane/utils";

const OPTIONS: { key: TKpiPeriod; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "180d", label: "6m" },
  { key: "365d", label: "1y" },
  { key: "all", label: "All" },
  { key: "custom", label: "Custom" },
];

type Props = {
  value: TKpiPeriod;
  customStartDate?: string;
  customEndDate?: string;
  onChange: (period: TKpiPeriod, startDate?: string, endDate?: string) => void;
  disabled?: boolean;
  /** Restrict the offered presets, e.g. where a paired data source can't span "all". */
  options?: readonly TKpiPeriod[];
};

export const KpiPeriodSelector = (props: Props) => {
  const { value, customStartDate = "", customEndDate = "", onChange, disabled = false, options } = props;

  const [startDate, setStartDate] = useState(customStartDate);
  const [endDate, setEndDate] = useState(customEndDate);

  useEffect(() => {
    setStartDate(customStartDate);
    setEndDate(customEndDate);
  }, [customStartDate, customEndDate]);

  const visibleOptions = options ? OPTIONS.filter((option) => options.includes(option.key)) : OPTIONS;

  const handleApplyCustom = (closePopover?: () => void) => {
    if (startDate && endDate && startDate <= endDate) {
      onChange("custom", startDate, endDate);
      if (closePopover) closePopover();
    }
  };

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Reporting period">
      {visibleOptions.map((option) => {
        if (option.key === "custom") {
          const isCustomActive = value === "custom";
          const labelText =
            isCustomActive && customStartDate && customEndDate ? `${customStartDate} ~ ${customEndDate}` : option.label;

          return (
            <Popover key={option.key} className="relative inline-block">
              {({ close }) => (
                <>
                  <Popover.Button
                    type="button"
                    disabled={disabled}
                    aria-pressed={isCustomActive}
                    onClick={() => {
                      if (!isCustomActive && startDate && endDate && startDate <= endDate) {
                        onChange("custom", startDate, endDate);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-1 rounded px-2 py-1 text-11 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      isCustomActive
                        ? "bg-accent-primary/10 text-accent-primary"
                        : "text-tertiary hover:bg-layer-1 hover:text-secondary"
                    )}
                  >
                    <Calendar className="size-3 shrink-0" />
                    <span>{labelText}</span>
                  </Popover.Button>

                  <Transition
                    as={React.Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <Popover.Panel className="shadow-lg absolute right-0 z-30 mt-1 w-64 rounded-md border border-subtle bg-surface-1 p-3">
                      <div className="flex flex-col gap-3">
                        <span className="text-12 font-medium text-primary">Custom Period</span>
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor="kpi-start-date" className="text-11 font-medium text-tertiary">
                            Start Date
                          </label>
                          <input
                            id="kpi-start-date"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="focus:border-accent-primary w-full rounded border border-subtle bg-surface-2 px-2 py-1 text-12 text-primary focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor="kpi-end-date" className="text-11 font-medium text-tertiary">
                            End Date
                          </label>
                          <input
                            id="kpi-end-date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="focus:border-accent-primary w-full rounded border border-subtle bg-surface-2 px-2 py-1 text-12 text-primary focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            disabled={!startDate || !endDate || startDate > endDate}
                            onClick={() => handleApplyCustom(close)}
                            className="rounded bg-accent-primary px-3 py-1 text-11 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </Popover.Panel>
                  </Transition>
                </>
              )}
            </Popover>
          );
        }

        return (
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
        );
      })}
    </div>
  );
};
