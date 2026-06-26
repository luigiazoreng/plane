/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Button, ToggleSwitch, Input } from "@plane/ui";
import type { IKpiConfig, IKpiPriorityRow, IKpiTables, TKpiDayCount, TKpiDayRounding } from "@plane/types";

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
    <div className="border-custom-border-200 rounded-lg border p-4">
      <h4 className="text-sm text-custom-text-100 mb-3 font-semibold">{title}</h4>
      <div className="space-y-2">
        {Object.entries(table).map(([level, points]) => (
          <div key={level} className="flex items-center gap-2">
            <span className="text-sm text-custom-text-200 flex-1 truncate">{level}</span>
            <input
              type="number"
              className="border-custom-border-200 bg-custom-background-100 text-sm w-20 rounded border px-2 py-1"
              value={points}
              disabled={disabled}
              onChange={(e) => setPoints(level, Number(e.target.value))}
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => removeLevel(level)}
                className="text-custom-text-400 hover:text-red-500"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!disabled && (
        <div className="mt-3 flex items-center gap-2">
          <input
            className="border-custom-border-200 bg-custom-background-100 text-sm flex-1 rounded border px-2 py-1"
            placeholder="New level name"
            value={newLevel}
            onChange={(e) => setNewLevel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLevel()}
          />
          <button type="button" onClick={addLevel} className="text-xs text-custom-primary-100 flex items-center gap-1">
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

  return (
    <div className="border-custom-border-200 rounded-lg border p-4">
      <h4 className="text-sm text-custom-text-100 mb-1 font-semibold">{title}</h4>
      <p className="text-xs text-custom-text-400 mb-3">{description}</p>

      <div className="mb-3">
        <p className="text-xs text-custom-text-300 mb-1">Estimate system</p>
        <select
          className="border-custom-border-200 bg-custom-background-100 text-sm w-full rounded border px-2 py-1.5"
          value={estimateId ?? ""}
          disabled={disabled}
          onChange={(e) => onEstimateChange(e.target.value || null)}
        >
          <option value="">Not configured</option>
          {estimateOptions.map((estimate) => (
            <option key={estimate.id} value={estimate.id}>
              {estimate.name}
            </option>
          ))}
        </select>
      </div>

      {estimateValues.length === 0 && orphanKeys.length === 0 ? (
        <p className="text-xs text-custom-text-400 italic">
          Select an estimate system in this project to score this dimension.
        </p>
      ) : (
        <div className="space-y-2">
          {estimateValues.map((val) => (
            <div key={val} className="flex items-center gap-2">
              <span className="text-sm text-custom-text-200 flex-1 truncate">{val}</span>
              <input
                type="number"
                className="border-custom-border-200 bg-custom-background-100 text-sm w-20 rounded border px-2 py-1"
                value={table[val] ?? 0}
                disabled={disabled}
                onChange={(e) => setPoints(val, Number(e.target.value))}
              />
            </div>
          ))}
          {orphanKeys.map((val) => (
            <div key={val} className="flex items-center gap-2 opacity-70">
              <span className="text-sm text-custom-text-300 flex-1 truncate">
                {val} <span className="text-xs text-custom-text-400 italic">(not in current estimate)</span>
              </span>
              <input
                type="number"
                className="border-custom-border-200 bg-custom-background-100 text-sm w-20 rounded border px-2 py-1"
                value={table[val] ?? 0}
                disabled={disabled}
                onChange={(e) => setPoints(val, Number(e.target.value))}
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeKey(val)}
                  className="text-custom-text-400 hover:text-red-500"
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
    <div className="border-custom-border-200 rounded-lg border p-4">
      <h4 className="text-sm text-custom-text-100 mb-1 font-semibold">Priority / Importance (I)</h4>
      <p className="text-xs text-custom-text-400 mb-3">
        Importance is the work item&apos;s <strong>priority</strong>. <code>points</code> are the Importance (I)
        contribution to Vp; <code>b</code> sets how fast the delay penalty grows.
      </p>
      <div className="space-y-2">
        <div className="text-xs text-custom-text-300 grid grid-cols-[1fr_5rem_5rem_1fr] gap-2">
          <span>Key</span>
          <span>Points</span>
          <span>b</span>
          <span>Label</span>
        </div>
        {Object.entries(table).map(([level, row]) => (
          <div key={level} className="grid grid-cols-[1fr_5rem_5rem_1fr] items-center gap-2">
            <span className="text-sm text-custom-text-200 truncate capitalize">{level}</span>
            <input
              type="number"
              className="border-custom-border-200 bg-custom-background-100 text-sm rounded border px-2 py-1"
              value={row.points}
              disabled={disabled}
              onChange={(e) => setRow(level, { points: Number(e.target.value) })}
            />
            <input
              type="number"
              step="0.01"
              className="border-custom-border-200 bg-custom-background-100 text-sm rounded border px-2 py-1"
              value={row.b}
              disabled={disabled}
              onChange={(e) => setRow(level, { b: Number(e.target.value) })}
            />
            <input
              className="border-custom-border-200 bg-custom-background-100 text-sm rounded border px-2 py-1"
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

  return (
    <div className="space-y-6">
      {config.inherited && (
        <div className="border-custom-border-200 bg-custom-background-90 text-xs text-custom-text-300 rounded-md border px-4 py-2">
          This project is using the inherited workspace default. Saving creates a project-specific override.
        </div>
      )}

      {/* Global params */}
      <div className="border-custom-border-200 rounded-lg border p-4">
        <h4 className="text-sm text-custom-text-100 mb-4 font-semibold">Global parameters</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-custom-text-200">Penalty mode</p>
              <p className="text-xs text-custom-text-400">Dead zone (plateau) vs. continuous</p>
            </div>
            <div className="text-xs flex items-center gap-2">
              <span
                className={draft.penalty_mode === "continuous" ? "text-custom-primary-100" : "text-custom-text-400"}
              >
                Continuous
              </span>
              <ToggleSwitch
                value={draft.penalty_mode === "dead_zone"}
                onChange={(v) => patch({ penalty_mode: v ? "dead_zone" : "continuous" })}
                disabled={!canEdit}
              />
              <span className={draft.penalty_mode === "dead_zone" ? "text-custom-primary-100" : "text-custom-text-400"}>
                Dead zone
              </span>
            </div>
          </div>

          <div>
            <p className="text-sm text-custom-text-200 mb-1">k (smoothing): {draft.k.toFixed(2)}</p>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.k}
              disabled={!canEdit}
              onChange={(e) => patch({ k: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          <div>
            <p className="text-sm text-custom-text-200 mb-1">Day count</p>
            <select
              className="border-custom-border-200 bg-custom-background-100 text-sm w-full rounded border px-2 py-1.5"
              value={draft.day_count}
              disabled={!canEdit}
              onChange={(e) => patch({ day_count: e.target.value as TKpiDayCount })}
            >
              <option value="calendar">Calendar days</option>
              <option value="business">Business days</option>
            </select>
          </div>

          <div>
            <p className="text-sm text-custom-text-200 mb-1">Day rounding</p>
            <select
              className="border-custom-border-200 bg-custom-background-100 text-sm w-full rounded border px-2 py-1.5"
              value={draft.day_rounding}
              disabled={!canEdit}
              onChange={(e) => patch({ day_rounding: e.target.value as TKpiDayRounding })}
            >
              <option value="truncate">Truncate</option>
              <option value="round">Round</option>
              <option value="ceil">Ceil</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-custom-text-200">Allow negative Vf</p>
            <ToggleSwitch
              value={draft.allow_negative}
              onChange={(v) => patch({ allow_negative: v })}
              disabled={!canEdit}
            />
          </div>

          <div>
            <p className="text-sm text-custom-text-200 mb-1">Max multiplier (cap)</p>
            <Input
              type="number"
              step="0.1"
              placeholder="No cap"
              value={draft.max_multiplier ?? ""}
              disabled={!canEdit}
              onChange={(e) => patch({ max_multiplier: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>

          <div>
            <p className="text-sm text-custom-text-200 mb-1">Vf decimals</p>
            <Input
              type="number"
              min={0}
              max={6}
              value={draft.vf_decimals}
              disabled={!canEdit}
              onChange={(e) => patch({ vf_decimals: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <EstimateMappingEditor
        title="Difficulty (D)"
        description="Choose which project estimate system represents difficulty, then map each point to the value it adds to Vp."
        table={draft.tables.difficulty ?? {}}
        estimateId={draft.difficulty_estimate}
        estimateOptions={estimateOptions}
        estimateValues={draft.difficulty_estimate ? (estimateValuesById[draft.difficulty_estimate] ?? []) : []}
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
        estimateValues={draft.repetitive_estimate ? (estimateValuesById[draft.repetitive_estimate] ?? []) : []}
        disabled={!canEdit}
        onEstimateChange={(estimateId) => patch({ repetitive_estimate: estimateId })}
        onChange={(table) => patchTable("repetitive", table)}
      />

      {/* Point tables */}
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

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Save configuration
          </Button>
          {onReset && !config.inherited && config.id && (
            <Button variant="neutral-primary" onClick={onReset} disabled={saving}>
              Reset to workspace default
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
