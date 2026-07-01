/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { IKpiConfig, IKpiPriorityRow, IKpiTables, TKpiDayCount, TKpiDayRounding } from "@plane/types";
import { CustomSelect, Input, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsHeading } from "@/components/settings/heading";
import { KpiCurveChart } from "./curve-chart";

type Props = {
  config: IKpiConfig;
  canEdit: boolean;
  saving: boolean;
  onSave: (data: Partial<IKpiConfig>) => void;
  onReset?: () => void;
  estimateOptions?: { id: string; name: string; type?: string }[];
  estimateValuesById?: Record<string, string[]>;
};

type SimpleTableKey = "type";

const CARD = "rounded-lg border border-subtle bg-layer-2 p-4";

const SimpleTableEditor = (props: {
  title: string;
  table: Record<string, number>;
  disabled: boolean;
  onChange: (table: Record<string, number>) => void;
}) => {
  const { title, table, disabled, onChange } = props;
  const [newLevel, setNewLevel] = useState("");

  const setPoints = (level: string, points: number) => onChange({ ...table, [level]: points });
  const removeLevel = (level: string) => {
    const next = { ...table };
    delete next[level];
    onChange(next);
  };
  const addLevel = () => {
    const key = newLevel.trim();
    if (!key || table[key] !== undefined) return;
    onChange({ ...table, [key]: 0 });
    setNewLevel("");
  };

  return (
    <div className={CARD}>
      <h4 className="mb-3 text-body-sm-medium text-primary">{title}</h4>
      <div className="space-y-2">
        {Object.entries(table).map(([level, points]) => (
          <div key={level} className="flex items-center gap-2">
            <span className="flex-1 truncate text-13 text-secondary">{level}</span>
            <Input
              type="number"
              inputSize="xs"
              className="w-20"
              value={points}
              disabled={disabled}
              onChange={(e) => setPoints(level, Number(e.target.value))}
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => removeLevel(level)}
                className="text-tertiary transition-colors hover:text-danger-primary"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!disabled && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            inputSize="xs"
            className="flex-1"
            placeholder="New level name"
            value={newLevel}
            onChange={(e) => setNewLevel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLevel()}
          />
          <button
            type="button"
            onClick={addLevel}
            className="flex items-center gap-1 text-12 font-medium whitespace-nowrap text-accent-primary"
          >
            <Plus className="size-3.5" /> Add
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Estimate-backed dimensions use a selected project estimate system. The rows
 * are that estimate's point values; unmapped values add 0.
 */
const EstimateMappingEditor = (props: {
  title: string;
  description: string;
  table: Record<string, number>;
  estimateId: string | null;
  estimateOptions: { id: string; name: string; type?: string }[];
  estimateValues: string[];
  disabled: boolean;
  onEstimateChange: (estimateId: string | null) => void;
  onChange: (table: Record<string, number>) => void;
}) => {
  const {
    title,
    description,
    table,
    estimateId,
    estimateOptions,
    estimateValues,
    disabled,
    onEstimateChange,
    onChange,
  } = props;

  const setPoints = (key: string, points: number) => onChange({ ...table, [key]: points });
  const removeKey = (key: string) => {
    const next = { ...table };
    delete next[key];
    onChange(next);
  };

  // Keys present in the mapping but no longer in the active estimate.
  const orphanKeys = Object.keys(table).filter((k) => !estimateValues.includes(k));
  const selectedEstimateName = estimateId ? (estimateOptions.find((o) => o.id === estimateId)?.name ?? "—") : null;

  return (
    <div className={CARD}>
      <h4 className="mb-1 text-body-sm-medium text-primary">{title}</h4>
      <p className="mb-3 text-caption-md-regular text-tertiary">{description}</p>

      <div className="mb-3">
        <p className="mb-1 text-caption-md-regular text-tertiary">Estimate system</p>
        <CustomSelect
          value={estimateId ?? ""}
          label={selectedEstimateName ?? "Not configured"}
          onChange={(value: string) => onEstimateChange(value || null)}
          input
          disabled={disabled}
          buttonClassName="text-13 w-full"
          className="w-full"
        >
          <CustomSelect.Option value="">Not configured</CustomSelect.Option>
          {estimateOptions.map((estimate) => (
            <CustomSelect.Option key={estimate.id} value={estimate.id}>
              {estimate.name}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      </div>

      {estimateValues.length === 0 && orphanKeys.length === 0 ? (
        <p className="text-12 text-tertiary italic">
          Select an estimate system in this project to score this dimension.
        </p>
      ) : (
        <div className="space-y-2">
          {estimateValues.map((val) => (
            <div key={val} className="flex items-center gap-2">
              <span className="flex-1 truncate text-13 text-secondary">{val}</span>
              <Input
                type="number"
                inputSize="xs"
                className="w-20"
                value={table[val] ?? 0}
                disabled={disabled}
                onChange={(e) => setPoints(val, Number(e.target.value))}
              />
            </div>
          ))}
          {orphanKeys.map((val) => (
            <div key={val} className="flex items-center gap-2 opacity-70">
              <span className="flex-1 truncate text-13 text-tertiary">
                {val} <span className="text-12 italic">(not in current estimate)</span>
              </span>
              <Input
                type="number"
                inputSize="xs"
                className="w-20"
                value={table[val] ?? 0}
                disabled={disabled}
                onChange={(e) => setPoints(val, Number(e.target.value))}
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeKey(val)}
                  className="text-tertiary transition-colors hover:text-danger-primary"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PriorityTableEditor = (props: {
  table: Record<string, IKpiPriorityRow>;
  disabled: boolean;
  onChange: (table: Record<string, IKpiPriorityRow>) => void;
}) => {
  const { table, disabled, onChange } = props;
  const setRow = (level: string, patch: Partial<IKpiPriorityRow>) =>
    onChange({ ...table, [level]: { ...table[level], ...patch } });

  return (
    <div className={CARD}>
      <h4 className="mb-1 text-body-sm-medium text-primary">Priority / Importance (I)</h4>
      <p className="mb-3 text-caption-md-regular text-tertiary">
        Importance is the work item&apos;s <strong>priority</strong>. <code>points</code> are the Importance (I)
        contribution to Vp; <code>b</code> sets how fast the delay penalty grows.
      </p>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_5rem_5rem_1fr] gap-2 text-12 text-tertiary">
          <span>Key</span>
          <span>Points</span>
          <span>b</span>
          <span>Label</span>
        </div>
        {Object.entries(table).map(([level, row]) => (
          <div key={level} className="grid grid-cols-[1fr_5rem_5rem_1fr] items-center gap-2">
            <span className="truncate text-13 text-secondary capitalize">{level}</span>
            <Input
              type="number"
              inputSize="xs"
              value={row.points}
              disabled={disabled}
              onChange={(e) => setRow(level, { points: Number(e.target.value) })}
            />
            <Input
              type="number"
              step="0.01"
              inputSize="xs"
              value={row.b}
              disabled={disabled}
              onChange={(e) => setRow(level, { b: Number(e.target.value) })}
            />
            <Input
              inputSize="xs"
              value={row.label ?? ""}
              disabled={disabled}
              onChange={(e) => setRow(level, { label: e.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export const KpiConfigEditor = (props: Props) => {
  const { config, canEdit, saving, onSave, onReset, estimateOptions = [], estimateValuesById = {} } = props;
  const [draft, setDraft] = useState<IKpiConfig>(config);
  const [selectedPriorityLevel, setSelectedPriorityLevel] = useState<string | null>(null);

  useEffect(() => setDraft(config), [config]);

  const patch = (data: Partial<IKpiConfig>) => setDraft((prev) => ({ ...prev, ...data }));
  const patchTable = (key: keyof IKpiTables, table: any) =>
    setDraft((prev) => ({ ...prev, tables: { ...prev.tables, [key]: table } }));

  const handleSave = () => {
    onSave({
      tables: draft.tables,
      penalty_mode: draft.penalty_mode,
      k: draft.k,
      day_count: draft.day_count,
      day_rounding: draft.day_rounding,
      allow_negative: draft.allow_negative,
      max_multiplier: draft.max_multiplier,
      vf_decimals: draft.vf_decimals,
      difficulty_estimate: draft.difficulty_estimate,
      repetitive_estimate: draft.repetitive_estimate,
    });
  };

  const simpleTables: { key: SimpleTableKey; title: string }[] = [{ key: "type", title: "Type (T)" }];

  // Live preview: recalculates as the draft (b, k, mode, ...) changes.
  const priorityLevels = Object.keys(draft.tables.priority ?? {});
  const activePriorityLevel = selectedPriorityLevel ?? priorityLevels[0] ?? null;
  const activeB = useMemo(() => {
    if (!activePriorityLevel) return 0;
    return draft.tables.priority?.[activePriorityLevel]?.b ?? 0;
  }, [draft, activePriorityLevel]);
  const activeLabel = activePriorityLevel
    ? (draft.tables.priority[activePriorityLevel]?.label ?? activePriorityLevel)
    : "—";

  return (
    <div className="flex h-full flex-col overflow-hidden lg:flex-row">
      <div className="vertical-scrollbar scrollbar-lg min-h-0 flex-1 overflow-y-auto px-page-x py-6">
        <div className="space-y-8">
          {config.inherited && (
            <div className="rounded-md border border-subtle bg-layer-1 px-4 py-2 text-12 text-tertiary">
              This project is using the inherited workspace default. Saving creates a project-specific override.
            </div>
          )}

          {/* Global parameters */}
          <div>
            <SettingsHeading title="Global parameters" variant="h6" />
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <SettingsBoxedControlItem
                title="Penalty mode"
                description="Dead zone (plateau) vs. continuous slope after the delay crosses zero."
                control={
                  <div className="flex items-center gap-2 text-12">
                    <span className={cn(draft.penalty_mode === "continuous" ? "text-accent-primary" : "text-tertiary")}>
                      Continuous
                    </span>
                    <ToggleSwitch
                      value={draft.penalty_mode === "dead_zone"}
                      onChange={(v) => patch({ penalty_mode: v ? "dead_zone" : "continuous" })}
                      disabled={!canEdit}
                    />
                    <span className={cn(draft.penalty_mode === "dead_zone" ? "text-accent-primary" : "text-tertiary")}>
                      Dead zone
                    </span>
                  </div>
                }
              />

              <SettingsBoxedControlItem
                title="Smoothing (k)"
                description="Slope reduction applied after the penalty crosses zero."
                control={
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={draft.k}
                      disabled={!canEdit}
                      onChange={(e) => patch({ k: Number(e.target.value) })}
                      className="accent-accent-primary h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-layer-1 disabled:cursor-not-allowed"
                    />
                    <span className="w-10 text-right text-13 text-secondary tabular-nums">{draft.k.toFixed(2)}</span>
                  </div>
                }
              />

              <SettingsBoxedControlItem
                title="Day count"
                description="How delay days are counted between the due date and delivery."
                control={
                  <CustomSelect
                    value={draft.day_count}
                    label={draft.day_count === "calendar" ? "Calendar days" : "Business days"}
                    onChange={(value: TKpiDayCount) => patch({ day_count: value })}
                    input
                    disabled={!canEdit}
                    buttonClassName="text-13"
                  >
                    <CustomSelect.Option value="calendar">Calendar days</CustomSelect.Option>
                    <CustomSelect.Option value="business">Business days</CustomSelect.Option>
                  </CustomSelect>
                }
              />

              <SettingsBoxedControlItem
                title="Day rounding"
                description="How the fractional day count is rounded to an integer."
                control={
                  <CustomSelect
                    value={draft.day_rounding}
                    label={draft.day_rounding.charAt(0).toUpperCase() + draft.day_rounding.slice(1)}
                    onChange={(value: TKpiDayRounding) => patch({ day_rounding: value })}
                    input
                    disabled={!canEdit}
                    buttonClassName="text-13"
                  >
                    <CustomSelect.Option value="truncate">Truncate</CustomSelect.Option>
                    <CustomSelect.Option value="round">Round</CustomSelect.Option>
                    <CustomSelect.Option value="ceil">Ceil</CustomSelect.Option>
                  </CustomSelect>
                }
              />

              <SettingsBoxedControlItem
                title="Allow negative Vf"
                description="If disabled, a negative final score is floored at 0."
                control={
                  <ToggleSwitch
                    value={draft.allow_negative}
                    onChange={(v) => patch({ allow_negative: v })}
                    disabled={!canEdit}
                  />
                }
              />

              <SettingsBoxedControlItem
                title="Max multiplier (cap)"
                description="Upper bound for the bonus multiplier p. Leave empty for no cap."
                control={
                  <Input
                    type="number"
                    step="0.1"
                    inputSize="sm"
                    className="w-28"
                    placeholder="No cap"
                    value={draft.max_multiplier ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => patch({ max_multiplier: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                }
              />

              <SettingsBoxedControlItem
                title="Vf decimals"
                description="Number of decimal places the final score is rounded to."
                control={
                  <Input
                    type="number"
                    min={0}
                    max={6}
                    inputSize="sm"
                    className="w-20"
                    value={draft.vf_decimals}
                    disabled={!canEdit}
                    onChange={(e) => patch({ vf_decimals: Number(e.target.value) })}
                  />
                }
              />
            </div>
          </div>

          {/* Point tables */}
          <div>
            <SettingsHeading title="Point tables" variant="h6" />
            <div className="mt-4 flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <EstimateMappingEditor
                  title="Difficulty (D)"
                  description="Choose which project estimate system represents difficulty, then map each point to the value it adds to Vp."
                  table={draft.tables.difficulty ?? {}}
                  estimateId={draft.difficulty_estimate}
                  estimateOptions={estimateOptions}
                  estimateValues={
                    draft.difficulty_estimate ? (estimateValuesById[draft.difficulty_estimate] ?? []) : []
                  }
                  disabled={!canEdit}
                  onEstimateChange={(estimateId) => patch({ difficulty_estimate: estimateId })}
                  onChange={(table) => patchTable("difficulty", table)}
                />

                <EstimateMappingEditor
                  title="Repetitive (R)"
                  description="Choose which project estimate system represents repetition, then map each point to the value it adds to Vp."
                  table={draft.tables.repetitive ?? {}}
                  estimateId={draft.repetitive_estimate}
                  estimateOptions={estimateOptions}
                  estimateValues={
                    draft.repetitive_estimate ? (estimateValuesById[draft.repetitive_estimate] ?? []) : []
                  }
                  disabled={!canEdit}
                  onEstimateChange={(estimateId) => patch({ repetitive_estimate: estimateId })}
                  onChange={(table) => patchTable("repetitive", table)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {simpleTables.map((t) => (
                  <SimpleTableEditor
                    key={t.key}
                    title={t.title}
                    table={draft.tables[t.key] ?? {}}
                    disabled={!canEdit}
                    onChange={(table) => patchTable(t.key, table)}
                  />
                ))}
              </div>

              <PriorityTableEditor
                table={draft.tables.priority ?? {}}
                disabled={!canEdit}
                onChange={(table) => patchTable("priority", table)}
              />
            </div>
          </div>

          {canEdit && (
            <div className="flex items-center gap-3 border-t border-subtle pt-6">
              <Button variant="primary" size="lg" onClick={handleSave} loading={saving}>
                Save configuration
              </Button>
              {onReset && !config.inherited && config.id && (
                <Button variant="secondary" size="lg" onClick={onReset} disabled={saving}>
                  Reset to workspace default
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live curve preview */}
      <div className="flex shrink-0 flex-col overflow-y-auto border-t border-subtle bg-surface-1 lg:w-[380px] lg:border-t-0 lg:border-l">
        <div className="flex h-11 shrink-0 flex-col justify-center border-b border-subtle px-page-x">
          <h4 className="text-13 font-medium text-primary">Penalty curve p(d)</h4>
        </div>
        <div className="flex flex-wrap gap-1.5 px-page-x pt-3">
          {priorityLevels.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setSelectedPriorityLevel(level)}
              className={cn(
                "rounded px-2 py-1 text-11 font-medium transition-colors",
                level === activePriorityLevel
                  ? "bg-accent-primary/10 text-accent-primary"
                  : "text-tertiary hover:bg-layer-1 hover:text-secondary"
              )}
            >
              {draft.tables.priority[level]?.label ?? level}
            </button>
          ))}
        </div>
        <p className="px-page-x pt-2 text-12 text-tertiary">
          {activeLabel} priority · b = {activeB}
        </p>
        <div className="px-page-x py-3">
          <KpiCurveChart config={draft} b={activeB || 0.25} markerD={null} />
        </div>
      </div>
    </div>
  );
};
