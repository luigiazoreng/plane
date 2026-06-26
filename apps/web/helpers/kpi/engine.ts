/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Client-side mirror of plane/kpi/engine.py. Kept 1:1 with the backend so the
 * curve and live preview can be recomputed without a round-trip. Validated
 * against the same six spec cases (see engine.spec.ts).
 */

import type { IKpiCalcResult, IKpiConfig, IKpiCurvePoint, IKpiTaskInput } from "@plane/types";

const toDate = (value?: string | null): Date | null => {
  if (value === undefined || value === null || value === "") return null;
  // Use date-only to avoid timezone drift when diffing days.
  const iso = value.length > 10 ? value.slice(0, 10) : value;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
};

const applyRounding = (value: number, mode: string): number => {
  if (mode === "ceil") return Math.ceil(value);
  if (mode === "round") return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
  return Math.trunc(value); // truncate (default)
};

const businessDaysBetween = (start: Date, end: Date): number => {
  if (end.getTime() === start.getTime()) return 0;
  const sign = end > start ? 1 : -1;
  const lo = (end > start ? start : end).getTime();
  const hi = (end > start ? end : start).getTime();
  const DAY_MS = 86400000;
  const totalDays = Math.round((hi - lo) / DAY_MS);
  let count = 0;
  for (let i = 1; i <= totalDays; i += 1) {
    const day = new Date(lo + i * DAY_MS).getUTCDay(); // 0=Sun .. 6=Sat
    if (day >= 1 && day <= 5) count += 1;
  }
  return count * sign;
};

export const calcularDias = (
  deliveredDate: string | null | undefined,
  dueDate: string | null | undefined,
  config: IKpiConfig
): number | null => {
  const delivered = toDate(deliveredDate);
  const due = toDate(dueDate);
  if (!delivered || !due) return null;

  let dBruto: number;
  if (config.day_count === "business") {
    dBruto = businessDaysBetween(due, delivered);
  } else {
    dBruto = Math.round((delivered.getTime() - due.getTime()) / 86400000);
  }
  return applyRounding(dBruto, config.day_rounding);
};

const multiplier = (b: number, k: number, d: number, mode: string): number => {
  if (mode === "dead_zone") {
    return Math.max(0, 1 - b * d) + Math.min(0, 1 - k * b * d);
  }
  const t = 1 - b * d;
  return Math.max(0, t) + k * Math.min(0, t);
};

export const calcular = (task: IKpiTaskInput, config: IKpiConfig): IKpiCalcResult => {
  const tables = config.tables;
  const priorityRows = tables.priority || {};
  const priorityRow = (task.priority && priorityRows[task.priority]) ||
    Object.values(priorityRows)[0] || { points: 0, b: 0 };

  const vp =
    (tables.difficulty?.[task.difficulty ?? ""] ?? 0) +
    (tables.repetitive?.[task.repetitive ?? ""] ?? 0) +
    (priorityRow.points ?? 0) + // Importance (I) = native priority points
    (tables.type?.[task.type ?? ""] ?? 0);

  const d = calcularDias(task.delivered_date, task.due_date, config);
  if (d === null) return { Vp: vp, d: null, p: null, Vf: null };

  const b = priorityRow.b ?? 0;
  let p = multiplier(b, config.k, d, config.penalty_mode);

  if (config.max_multiplier !== null && config.max_multiplier !== undefined) {
    p = Math.min(p, config.max_multiplier);
  }

  let vf = vp * p;
  if (!config.allow_negative) vf = Math.max(0, vf);
  const factor = 10 ** (config.vf_decimals ?? 2);
  vf = Math.round(vf * factor) / factor;

  return { Vp: vp, d, p, Vf: vf };
};

export const sampleCurve = (b: number, config: IKpiConfig, dMin = -3, dMax = 20): IKpiCurvePoint[] => {
  const series: IKpiCurvePoint[] = [];
  for (let d = dMin; d <= dMax; d += 1) {
    let p = multiplier(b, config.k, d, config.penalty_mode);
    if (config.max_multiplier !== null && config.max_multiplier !== undefined) {
      p = Math.min(p, config.max_multiplier);
    }
    series.push({ d, p });
  }
  return series;
};

export const priorityFactor = (config: IKpiConfig, priority?: string): number => {
  const row = priority ? config.tables.priority?.[priority] : undefined;
  return row?.b ?? 0;
};
