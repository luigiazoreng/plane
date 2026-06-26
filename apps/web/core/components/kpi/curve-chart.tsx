/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import type { IKpiConfig } from "@plane/types";
import { sampleCurve } from "@/helpers/kpi/engine";

type Props = {
  config: IKpiConfig;
  b: number;
  markerD?: number | null;
  dMin?: number;
  dMax?: number;
};

const W = 480;
const H = 200;
const PL = 34;
const PR = 10;
const PT = 12;
const PB = 24;

export const KpiCurveChart = (props: Props) => {
  const { config, b, markerD = null, dMin = -3, dMax = 20 } = props;

  const points = useMemo(() => sampleCurve(b, config, dMin, dMax), [b, config, dMin, dMax]);

  const { pMin, pMax } = useMemo(() => {
    const ps = points.map((pt) => pt.p);
    return { pMin: Math.min(0, ...ps), pMax: Math.max(1, ...ps) };
  }, [points]);

  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  const xFor = (d: number) => PL + ((d - dMin) / (dMax - dMin)) * chartW;
  const yFor = (p: number) => H - PB - ((p - pMin) / (pMax - pMin || 1)) * chartH;

  const zeroY = yFor(0);
  const oneY = yFor(1);
  const x0 = xFor(0);
  const xEnd = xFor(dMax);

  const curvePath = points
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${xFor(pt.d).toFixed(1)} ${yFor(pt.p).toFixed(1)}`)
    .join(" ");

  // Closed fill path down to p=0 line
  const fillPath = `${curvePath} L ${xEnd.toFixed(1)} ${zeroY.toFixed(1)} L ${xFor(dMin).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const markerPoint = useMemo(() => {
    if (markerD === null || markerD === undefined) return null;
    const match = points.find((pt) => pt.d === markerD);
    if (!match) return null;
    return { x: xFor(match.d), y: yFor(match.p), p: match.p };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerD, points]);

  const earlyW = Math.max(0, x0 - PL);

  // Horizontal grid at p = 0.25, 0.5, 0.75 (and 1.0 handled separately)
  const gridPs = [0.25, 0.5, 0.75].filter((p) => p > pMin && p < pMax);
  // Vertical grid at d = 5, 10, 15 (skip 0 which has its own guide)
  const gridDs = [5, 10, 15].filter((d) => d > dMin && d < dMax);

  return (
    // Flat aesthetic to match the spreadsheet design: semantic tokens via
    // stroke="currentColor" + text-* classes, no glow/halo layers.
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible select-none">
      {/* ── Plot area background ── */}
      <rect
        x={PL}
        y={PT}
        width={chartW}
        height={chartH}
        fill="currentColor"
        fillOpacity={0.04}
        className="text-tertiary"
        rx={2}
      />

      {/* ── Early zone ── */}
      {earlyW > 0 && (
        <rect
          x={PL}
          y={PT}
          width={earlyW}
          height={chartH}
          fill="currentColor"
          fillOpacity={0.07}
          className="text-success-primary"
          rx={2}
        />
      )}

      {/* ── Horizontal grid lines ── */}
      {gridPs.map((p) => (
        <line
          key={p}
          x1={PL}
          y1={yFor(p)}
          x2={PL + chartW}
          y2={yFor(p)}
          stroke="currentColor"
          strokeWidth={0.5}
          strokeDasharray="3 4"
          className="text-placeholder"
        />
      ))}

      {/* ── Vertical grid lines ── */}
      {gridDs.map((d) => (
        <line
          key={d}
          x1={xFor(d)}
          y1={PT}
          x2={xFor(d)}
          y2={H - PB}
          stroke="currentColor"
          strokeWidth={0.5}
          strokeDasharray="3 4"
          className="text-placeholder"
        />
      ))}

      {/* ── p=1 guide (dashed, stronger) ── */}
      <line
        x1={PL}
        y1={oneY}
        x2={PL + chartW}
        y2={oneY}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="4 5"
        className="text-tertiary"
      />
      {/* ── p=0 guide ── */}
      <line
        x1={PL}
        y1={zeroY}
        x2={PL + chartW}
        y2={zeroY}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="4 5"
        className="text-tertiary"
      />
      {/* ── d=0 vertical (deadline) ── */}
      <line
        x1={x0}
        y1={PT}
        x2={x0}
        y2={H - PB}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="3 4"
        className="text-tertiary"
      />

      {/* ── Axes ── */}
      <line
        x1={PL}
        y1={H - PB}
        x2={PL + chartW}
        y2={H - PB}
        stroke="currentColor"
        strokeWidth={1}
        className="text-secondary"
      />
      <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="currentColor" strokeWidth={1} className="text-secondary" />

      {/* ── Area fill under curve ── */}
      <path d={fillPath} fill="currentColor" fillOpacity={0.1} className="text-accent-primary" />

      {/* ── Curve: main line ── */}
      <path
        d={curvePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-accent-primary"
      />

      {/* ── Y axis labels ── */}
      <text x={PL - 5} y={zeroY + 3} textAnchor="end" fontSize={8} fill="currentColor" className="text-tertiary">
        0
      </text>
      <text x={PL - 5} y={oneY + 3} textAnchor="end" fontSize={8} fill="currentColor" className="text-tertiary">
        1
      </text>
      {pMax > 1.05 && (
        <text x={PL - 5} y={yFor(pMax) + 3} textAnchor="end" fontSize={8} fill="currentColor" className="text-tertiary">
          {pMax.toFixed(1)}
        </text>
      )}
      {gridPs.map((p) => (
        <text
          key={p}
          x={PL - 5}
          y={yFor(p) + 3}
          textAnchor="end"
          fontSize={7}
          fill="currentColor"
          className="text-placeholder"
        >
          {p}
        </text>
      ))}

      {/* ── X axis labels ── */}
      <text x={x0} y={H - PB + 11} textAnchor="middle" fontSize={8} fill="currentColor" className="text-secondary">
        0
      </text>
      {gridDs.map((d) => (
        <text
          key={d}
          x={xFor(d)}
          y={H - PB + 11}
          textAnchor="middle"
          fontSize={7}
          fill="currentColor"
          className="text-placeholder"
        >
          {d}d
        </text>
      ))}
      <text x={PL + chartW} y={H - PB + 11} textAnchor="end" fontSize={8} fill="currentColor" className="text-tertiary">
        {dMax}d
      </text>
      <text x={PL + 2} y={H - PB + 11} textAnchor="start" fontSize={8} fill="currentColor" className="text-tertiary">
        {dMin}d
      </text>

      {/* ── Zone label ── */}
      {earlyW > 20 && (
        <text
          x={PL + earlyW / 2}
          y={PT + 9}
          textAnchor="middle"
          fontSize={7}
          fill="currentColor"
          className="text-success-primary"
        >
          early
        </text>
      )}

      {/* ── Marker ── */}
      {markerPoint && (
        <>
          {/* drop line */}
          <line
            x1={markerPoint.x}
            y1={markerPoint.y}
            x2={markerPoint.x}
            y2={zeroY}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="2 3"
            className="text-accent-primary"
            strokeOpacity={0.5}
          />
          {/* solid dot */}
          <circle cx={markerPoint.x} cy={markerPoint.y} r={3.5} fill="currentColor" className="text-accent-primary" />
          {/* inner contrast core */}
          <circle cx={markerPoint.x} cy={markerPoint.y} r={1.25} fill="currentColor" className="text-on-color" />
          {/* label */}
          <text
            x={markerPoint.x + 8}
            y={markerPoint.y + 3}
            fontSize={9}
            fill="currentColor"
            className="text-primary"
            fontWeight={600}
          >
            {markerPoint.p.toFixed(2)}
          </text>
        </>
      )}
    </svg>
  );
};
