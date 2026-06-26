/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { ClipboardList } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IKpiConfig, IKpiIssueRow, TIssuePriorities } from "@plane/types";
import { cn } from "@plane/utils";
import { EstimateDropdown } from "@/components/dropdowns/estimate";
import { PriorityDropdown } from "@/components/dropdowns/priority";
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

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  on_time: { className: "bg-success-subtle text-success-primary", label: "On time" },
  early: { className: "bg-accent-subtle text-accent-primary", label: "Early" },
  late: { className: "bg-danger-subtle text-danger-primary", label: "Late" },
  pending: { className: "bg-layer-1 text-tertiary", label: "Pending" },
};

const fmt = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(2);

const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
  return (
    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-11 font-medium", s.className)}>
      {s.label}
    </span>
  );
};

const HEAD = "h-11 bg-layer-1 px-page-x text-11 font-medium text-tertiary";

export const KpiIssuesTable = observer((props: Props) => {
  const { workspaceSlug, projectId, rows, config, canEdit, onSelectRow, selectedRowId } = props;
  const { updateIssueDifficultyEstimate, updateIssueRepetitiveEstimate, updateIssuePriority } = useKpi();
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleDifficultyEstimate = async (issueId: string, estimatePointId: string | null) => {
    setSavingId(issueId);
    try {
      await updateIssueDifficultyEstimate(workspaceSlug, projectId, issueId, estimatePointId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not update difficulty." });
    } finally {
      setSavingId(null);
    }
  };

  const handleRepetitiveEstimate = async (issueId: string, estimatePointId: string | null) => {
    setSavingId(issueId);
    try {
      await updateIssueRepetitiveEstimate(workspaceSlug, projectId, issueId, estimatePointId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not update repetitive estimate." });
    } finally {
      setSavingId(null);
    }
  };

  const handlePriority = async (issueId: string, priority: TIssuePriorities) => {
    setSavingId(issueId);
    try {
      await updateIssuePriority(workspaceSlug, projectId, issueId, priority);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not update priority." });
    } finally {
      setSavingId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-page-x py-16 text-center">
        <ClipboardList className="size-8 text-placeholder" strokeWidth={1.5} />
        <p className="text-13 font-medium text-secondary">No work items to score yet</p>
        <p className="text-12 text-tertiary">Add work items to this project to see them scored here.</p>
      </div>
    );
  }

  return (
    <table className="w-full border-collapse bg-surface-1 text-13">
      <thead>
        <tr className="border-b border-subtle">
          <th className={cn(HEAD, "sticky left-0 z-10 text-left")}>Work item</th>
          <th className={cn(HEAD, "w-36 text-left")}>Priority</th>
          <th className={cn(HEAD, "w-32 text-left")}>Difficulty</th>
          <th className={cn(HEAD, "w-32 text-left")}>Repetitive</th>
          <th className={cn(HEAD, "text-right")}>Vp</th>
          <th className={cn(HEAD, "text-right")}>d</th>
          <th className={cn(HEAD, "text-right")}>p</th>
          <th className={cn(HEAD, "text-right")}>Vf</th>
          <th className={cn(HEAD, "text-left")}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            onClick={() => onSelectRow?.(row)}
            className={cn(
              "group h-11 cursor-pointer border-b-[0.5px] border-subtle transition-colors",
              selectedRowId === row.id ? "bg-accent-primary/5 hover:bg-accent-primary/10" : "hover:bg-layer-1"
            )}
          >
            <td
              className={cn(
                "sticky left-0 z-10 max-w-[260px] truncate px-page-x text-13 text-primary transition-colors",
                selectedRowId === row.id
                  ? "bg-accent-primary/5 group-hover:bg-accent-primary/10"
                  : "bg-surface-1 group-hover:bg-layer-1"
              )}
            >
              {row.name}
            </td>
            <td className="p-0" onClick={(e) => e.stopPropagation()}>
              <PriorityDropdown
                value={row.priority as TIssuePriorities}
                disabled={!canEdit || savingId === row.id}
                onChange={(val) => handlePriority(row.id, val)}
                buttonVariant="transparent-with-text"
                buttonClassName="w-full rounded-none px-page-x text-left text-13"
                buttonContainerClassName="w-full"
              />
            </td>
            <td className="p-0" onClick={(e) => e.stopPropagation()}>
              <EstimateDropdown
                value={row.difficulty_estimate_point || undefined}
                estimateId={config.difficulty_estimate ?? undefined}
                projectId={projectId}
                placeholder="—"
                disabled={!canEdit || savingId === row.id || !config.difficulty_estimate}
                onChange={(val) => handleDifficultyEstimate(row.id, val ?? null)}
                buttonVariant="transparent-with-text"
                buttonClassName="w-full rounded-none px-page-x text-left text-13"
                buttonContainerClassName="w-full"
              />
            </td>
            <td className="p-0" onClick={(e) => e.stopPropagation()}>
              <EstimateDropdown
                value={row.repetitive_estimate_point || undefined}
                estimateId={config.repetitive_estimate ?? undefined}
                projectId={projectId}
                placeholder="—"
                disabled={!canEdit || savingId === row.id || !config.repetitive_estimate}
                onChange={(val) => handleRepetitiveEstimate(row.id, val ?? null)}
                buttonVariant="transparent-with-text"
                buttonClassName="w-full rounded-none px-page-x text-left text-13"
                buttonContainerClassName="w-full"
              />
            </td>
            <td className="px-page-x text-right text-secondary tabular-nums">{fmt(row.vp)}</td>
            <td
              className={cn(
                "px-page-x text-right tabular-nums",
                row.d !== null && row.d !== undefined
                  ? row.d > 0
                    ? "text-danger-primary"
                    : row.d < 0
                      ? "text-accent-primary"
                      : "text-success-primary"
                  : "text-placeholder"
              )}
            >
              {fmt(row.d)}
            </td>
            <td className="px-page-x text-right text-tertiary tabular-nums">{fmt(row.p)}</td>
            <td className="px-page-x text-right font-medium text-primary tabular-nums">{fmt(row.vf)}</td>
            <td className="px-page-x">
              <StatusBadge status={row.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});
