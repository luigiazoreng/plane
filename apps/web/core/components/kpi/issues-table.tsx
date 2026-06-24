/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
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

const STATUS_STYLES: Record<string, string> = {
  on_time: "text-green-600 border-l-green-500",
  early: "text-blue-600 border-l-blue-500",
  late: "text-red-600 border-l-red-500",
  pending: "text-custom-text-400 border-l-custom-border-300",
};

const STATUS_LABEL: Record<string, string> = {
  on_time: "On time",
  early: "Early",
  late: "Late",
  pending: "Pending",
};

const fmt = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(2);

const LevelSelect = (props: {
  value: string | null;
  options: string[];
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) => (
  <select
    className="border-custom-border-200 bg-custom-background-100 text-xs text-custom-text-200 w-full rounded border px-1.5 py-1 disabled:opacity-60"
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

  return (
    <div className="overflow-x-auto">
      <table className="text-sm w-full border-collapse">
        <thead>
          <tr className="border-custom-border-200 text-xs text-custom-text-300 border-b text-left">
            <th className="px-3 py-2 font-medium">Work item</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Difficulty</th>
            <th className="px-3 py-2 font-medium">Repetitive</th>
            <th className="px-3 py-2 font-medium">Importance</th>
            <th className="px-3 py-2 text-right font-medium">Vp</th>
            <th className="px-3 py-2 text-right font-medium">d</th>
            <th className="px-3 py-2 text-right font-medium">p</th>
            <th className="px-3 py-2 text-right font-medium">Vf</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelectRow?.(row)}
              className={`border-custom-border-100 hover:bg-custom-background-90 cursor-pointer border-b border-l-2 transition-colors ${
                STATUS_STYLES[row.status] ?? ""
              } ${selectedRowId === row.id ? "bg-custom-background-80" : ""}`}
            >
              <td className="text-custom-text-200 max-w-[220px] truncate px-3 py-2">{row.name}</td>
              <td className="text-custom-text-300 px-3 py-2 capitalize">{row.priority}</td>
              <td className="px-3 py-2">
                <LevelSelect
                  value={row.difficulty}
                  options={difficultyLevels}
                  disabled={!canEdit || savingId === row.id}
                  onChange={(v) => handleAttr(row.id, "difficulty", v)}
                />
              </td>
              <td className="px-3 py-2">
                <LevelSelect
                  value={row.repetitive}
                  options={repetitiveLevels}
                  disabled={!canEdit || savingId === row.id}
                  onChange={(v) => handleAttr(row.id, "repetitive", v)}
                />
              </td>
              <td className="px-3 py-2">
                <LevelSelect
                  value={row.importance}
                  options={importanceLevels}
                  disabled={!canEdit || savingId === row.id}
                  onChange={(v) => handleAttr(row.id, "importance", v)}
                />
              </td>
              <td className="text-custom-text-200 px-3 py-2 text-right tabular-nums">{fmt(row.vp)}</td>
              <td className="text-custom-text-300 px-3 py-2 text-right tabular-nums">{fmt(row.d)}</td>
              <td className="text-custom-text-300 px-3 py-2 text-right tabular-nums">{fmt(row.p)}</td>
              <td className="text-custom-text-100 px-3 py-2 text-right font-medium tabular-nums">{fmt(row.vf)}</td>
              <td className="px-3 py-2">
                <span className={`text-xs font-medium ${STATUS_STYLES[row.status]?.split(" ")[0] ?? ""}`}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="text-sm text-custom-text-400 px-3 py-8 text-center">
                No work items to score yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});
