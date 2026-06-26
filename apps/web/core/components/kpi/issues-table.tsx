/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { ClipboardList } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IKpiConfig, IKpiIssueRow } from "@plane/types";
import { useKpi } from "@/hooks/store/use-kpi";

type Props = {
  workspaceSlug: string;
  projectId: string;
  rows: IKpiIssueRow[];
  config: IKpiConfig;
  canEdit: boolean;
  onSelectRow?: (row: IKpiIssueRow) => void;
  selectedRowId?: string | null;
};

const ROW_BORDER: Record<string, string> = {
  on_time: "border-l-green-500",
  early: "border-l-blue-500",
  late: "border-l-red-500",
  pending: "border-l-transparent",
};

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  on_time: {
    bg: "bg-green-500/10 border border-green-500/25",
    text: "text-green-600 dark:text-green-400",
    label: "On time",
  },
  early: { bg: "bg-blue-500/10 border border-blue-500/25", text: "text-blue-600 dark:text-blue-400", label: "Early" },
  late: { bg: "bg-red-500/10 border border-red-500/25", text: "text-red-600 dark:text-red-400", label: "Late" },
  pending: {
    bg: "bg-custom-background-80 border border-custom-border-200",
    text: "text-custom-text-400",
    label: "Pending",
  },
};

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-400",
  low: "bg-blue-500",
  none: "bg-custom-border-300",
};

const fmt = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(2);

const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
  return (
    <span className={`text-xs inline-flex items-center rounded-full px-2 py-0.5 font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
};

const PriorityCell = ({ priority }: { priority: string }) => (
  <div className="flex items-center gap-1.5">
    <span className={`size-1.5 shrink-0 rounded-full ${PRIORITY_DOT[priority] ?? PRIORITY_DOT.none}`} />
    <span className="text-custom-text-300 capitalize">{priority}</span>
  </div>
);

const LevelSelect = (props: {
  value: string | null;
  options: string[];
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) => (
  <select
    className="border-custom-border-200 bg-custom-background-90 text-xs text-custom-text-200 hover:border-custom-border-300 focus:border-custom-primary-100 w-full rounded-md border px-2 py-1 transition-colors focus:outline-none disabled:opacity-50"
    value={props.value ?? ""}
    disabled={props.disabled}
    onChange={(e) => props.onChange(e.target.value || null)}
    onClick={(e) => e.stopPropagation()}
  >
    <option value="">—</option>
    {props.options.map((opt) => (
      <option key={opt} value={opt}>
        {opt}
      </option>
    ))}
  </select>
);

export const KpiIssuesTable = observer((props: Props) => {
  const { workspaceSlug, projectId, rows, config, canEdit, onSelectRow, selectedRowId } = props;
  const { updateIssueAttributes } = useKpi();
  const [savingId, setSavingId] = useState<string | null>(null);

  const difficultyLevels = Object.keys(config.tables.difficulty ?? {});
  const repetitiveLevels = Object.keys(config.tables.repetitive ?? {});
  const importanceLevels = Object.keys(config.tables.importance ?? {});

  const handleAttr = async (issueId: string, field: string, value: string | null) => {
    setSavingId(issueId);
    try {
      await updateIssueAttributes(workspaceSlug, projectId, issueId, { [field]: value });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not update attribute." });
    } finally {
      setSavingId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
        <ClipboardList className="text-custom-text-400 size-8" strokeWidth={1.5} />
        <p className="text-sm text-custom-text-300 font-medium">No work items to score yet</p>
        <p className="text-xs text-custom-text-400">Add issues to this project to see them scored here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-sm w-full border-collapse">
        <thead>
          <tr className="border-custom-border-200 bg-custom-background-90/50 border-b">
            <th className="text-xs text-custom-text-400 px-3 py-2.5 text-left font-semibold">Work item</th>
            <th className="text-xs text-custom-text-400 px-3 py-2.5 text-left font-semibold">Priority</th>
            <th className="text-xs text-custom-text-400 w-28 px-3 py-2.5 text-left font-semibold">Difficulty</th>
            <th className="text-xs text-custom-text-400 w-28 px-3 py-2.5 text-left font-semibold">Repetitive</th>
            <th className="text-xs text-custom-text-400 w-28 px-3 py-2.5 text-left font-semibold">Importance</th>
            <th className="text-xs text-custom-text-400 px-3 py-2.5 text-right font-semibold">Vp</th>
            <th className="text-xs text-custom-text-400 px-3 py-2.5 text-right font-semibold">d</th>
            <th className="text-xs text-custom-text-400 px-3 py-2.5 text-right font-semibold">p</th>
            <th className="text-xs text-custom-text-400 px-3 py-2.5 text-right font-semibold">Vf</th>
            <th className="text-xs text-custom-text-400 px-3 py-2.5 text-left font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-custom-border-100 divide-y">
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelectRow?.(row)}
              className={`hover:bg-custom-background-90 cursor-pointer border-l-2 transition-colors ${
                ROW_BORDER[row.status] ?? "border-l-transparent"
              } ${selectedRowId === row.id ? "bg-custom-primary-100/5" : ""}`}
            >
              <td className="text-sm text-custom-text-200 max-w-[200px] truncate px-3 py-2.5">{row.name}</td>
              <td className="text-xs px-3 py-2.5">
                <PriorityCell priority={row.priority} />
              </td>
              <td className="px-3 py-2.5">
                <LevelSelect
                  value={row.difficulty}
                  options={difficultyLevels}
                  disabled={!canEdit || savingId === row.id}
                  onChange={(v) => handleAttr(row.id, "difficulty", v)}
                />
              </td>
              <td className="px-3 py-2.5">
                <LevelSelect
                  value={row.repetitive}
                  options={repetitiveLevels}
                  disabled={!canEdit || savingId === row.id}
                  onChange={(v) => handleAttr(row.id, "repetitive", v)}
                />
              </td>
              <td className="px-3 py-2.5">
                <LevelSelect
                  value={row.importance}
                  options={importanceLevels}
                  disabled={!canEdit || savingId === row.id}
                  onChange={(v) => handleAttr(row.id, "importance", v)}
                />
              </td>
              <td className="text-custom-text-200 px-3 py-2.5 text-right tabular-nums">{fmt(row.vp)}</td>
              <td
                className={`text-xs px-3 py-2.5 text-right tabular-nums ${
                  row.d !== null && row.d !== undefined
                    ? row.d > 0
                      ? "text-red-500"
                      : row.d < 0
                        ? "text-blue-500"
                        : "text-green-500"
                    : "text-custom-text-400"
                }`}
              >
                {fmt(row.d)}
              </td>
              <td className="text-xs text-custom-text-300 px-3 py-2.5 text-right tabular-nums">{fmt(row.p)}</td>
              <td className="text-custom-text-100 px-3 py-2.5 text-right font-semibold tabular-nums">{fmt(row.vf)}</td>
              <td className="px-3 py-2.5">
                <StatusBadge status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
