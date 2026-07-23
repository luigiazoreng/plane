/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { IKpiConfig, IKpiPriorityRow, IKpiTables, TKpiDayCount, TKpiDayRounding, IIssueLabel } from "@plane/types";
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
  estimateValuesById?: Record<string, { id: string; value: string }[]>;
  projectLabels?: IIssueLabel[];
  // Difficulty/Repetitive are EstimateProperty rows (kpi_role-tagged), not
  // KpiConfig fields -- saved immediately on change, independent of the
  // draft+Save flow the rest of this form uses.
  difficultyEstimateId?: string | null;
  repetitiveEstimateId?: string | null;
  onDifficultyEstimateChange?: (estimateId: string | null) => void;
  onRepetitiveEstimateChange?: (estimateId: string | null) => void;
};

type SimpleTableKey = "type";

const CARD = "rounded-lg border border-subtle bg-layer-2 p-4";

const LabelMappingEditor = (props: {
  title: string;
  description: string;
  table: Record<string, number>;
  projectLabels: IIssueLabel[];
  disabled: boolean;
  onChange: (table: Record<string, number>) => void;
}) => {
  const { title, description, table, projectLabels, disabled, onChange } = props;

  const setPoints = (labelId: string, points: number) => onChange({ ...table, [labelId]: points });
  const removeKey = (labelId: string) => {
    const next = { ...table };
    delete next[labelId];
    onChange(next);
  };

  const projectLabelIds = new Set(projectLabels.map((l) => l.id));
  const orphanKeys = Object.keys(table).filter((k) => !projectLabelIds.has(k));

  return (
    <div className={CARD}>
      <h4 className="mb-1 text-body-sm-medium text-primary">{title}</h4>
      <p className="mb-3 text-caption-md-regular text-tertiary">{description}</p>
      
      {projectLabels.length === 0 && orphanKeys.length === 0 ? (
        <p className="text-12 text-tertiary italic">
          No labels exist in this project yet.
        </p>
      ) : (
        <div className="space-y-2">
          {projectLabels.map((label) => (
            <div key={label.id} className="flex items-center gap-2">
              <span className="flex-1 truncate text-13 text-secondary flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: label.color ?? "#000" }} />
                {label.name}
              </span>
              <Input
                type="number"
                inputSize="xs"
                className="w-20"
                value={table[label.id] ?? 0}
                disabled={disabled}
                onChange={(e) => setPoints(label.id, Number(e.target.value))}
              />
            </div>
          ))}
          {orphanKeys.map((labelId) => (
            <div key={labelId} className="flex items-center gap-2 opacity-70">
              <span className="flex-1 truncate text-13 text-tertiary">
                Deleted label/type <span className="text-12 italic">({labelId})</span>
              </span>
              <Input
                type="number"
                inputSize="xs"
                className="w-20"
                value={table[labelId] ?? 0}
                disabled={disabled}
                onChange={(e) => setPoints(labelId, Number(e.target.value))}
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeKey(labelId)}
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
  estimateValues: { id: string; value: string }[];
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

  // table is keyed by EstimatePoint id (not value), so renaming a point's value
  // doesn't silently zero its configured contribution to Vp.
  const setPoints = (pointId: string, points: number) => onChange({ ...table, [pointId]: points });
  const removeKey = (pointId: string) => {
    const next = { ...table };
    delete next[pointId];
    onChange(next);
  };

  const estimatePointIds = new Set(estimateValues.map((point) => point.id));
  // Keys present in the mapping but no longer in the active estimate (point deleted).
  const orphanKeys = Object.keys(table).filter((k) => !estimatePointIds.has(k));
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
          {estimateValues.map((point) => (
            <div key={point.id} className="flex items-center gap-2">
              <span className="flex-1 truncate text-13 text-secondary">{point.value}</span>
              <Input
                type="number"
                inputSize="xs"
                className="w-20"
                value={table[point.id] ?? 0}
                disabled={disabled}
                onChange={(e) => setPoints(point.id, Number(e.target.value))}
              />
            </div>
          ))}
          {orphanKeys.map((pointId) => (
            <div key={pointId} className="flex items-center gap-2 opacity-70">
              <span className="flex-1 truncate text-13 text-tertiary">
                Deleted point <span className="text-12 italic">(not in current estimate)</span>
              </span>
              <Input
                type="number"
                inputSize="xs"
                className="w-20"
                value={table[pointId] ?? 0}
                disabled={disabled}
                onChange={(e) => setPoints(pointId, Number(e.target.value))}
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeKey(pointId)}
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
  const {
    config,
    canEdit,
    saving,
    onSave,
    onReset,
    estimateOptions = [],
    estimateValuesById = {},
    projectLabels = [],
    difficultyEstimateId = null,
    repetitiveEstimateId = null,
    onDifficultyEstimateChange,
    onRepetitiveEstimateChange,
  } = props;
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
    });
  };

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
                  estimateId={difficultyEstimateId}
                  estimateOptions={estimateOptions}
                  estimateValues={difficultyEstimateId ? (estimateValuesById[difficultyEstimateId] ?? []) : []}
                  disabled={!canEdit}
                  onEstimateChange={(estimateId) => onDifficultyEstimateChange?.(estimateId)}
                  onChange={(table) => patchTable("difficulty", table)}
                />

                <EstimateMappingEditor
                  title="Repetitive (R)"
                  description="Choose which project estimate system represents repetition, then map each point to the value it adds to Vp."
                  table={draft.tables.repetitive ?? {}}
                  estimateId={repetitiveEstimateId}
                  estimateOptions={estimateOptions}
                  estimateValues={repetitiveEstimateId ? (estimateValuesById[repetitiveEstimateId] ?? []) : []}
                  disabled={!canEdit}
                  onEstimateChange={(estimateId) => onRepetitiveEstimateChange?.(estimateId)}
                  onChange={(table) => patchTable("repetitive", table)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <LabelMappingEditor
                  title="Labels (L)"
                  description="Assign points to specific labels. Work items with multiple labels will sum the points."
                  table={draft.tables.type ?? {}}
                  projectLabels={projectLabels}
                  disabled={!canEdit}
                  onChange={(table) => patchTable("type", table)}
                />
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
