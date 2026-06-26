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

const W = 520;
const H = 220;
const PL = 36; // left padding (y-axis labels)
const PR = 12;
const PT = 16;
const PB = 28;

export const KpiCurveChart = (props: Props) => {
  const { config, b, markerD = null, dMin = -3, dMax = 20 } = props;

  const points = useMemo(() => sampleCurve(b, config, dMin, dMax), [b, config, dMin, dMax]);

  const { pMin, pMax } = useMemo(() => {
    const ps = points.map((pt) => pt.p);
    return { pMin: Math.min(0, ...ps), pMax: Math.max(1, ...ps) };
  }, [points]);

  const xFor = (d: number) => PL + ((d - dMin) / (dMax - dMin)) * (W - PL - PR);
  const yFor = (p: number) => H - PB - ((p - pMin) / (pMax - pMin || 1)) * (H - PT - PB);

  const zeroY = yFor(0);
  const oneY = yFor(1);
  const x0 = xFor(0);

  const curvePath = points
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${xFor(pt.d).toFixed(1)} ${yFor(pt.p).toFixed(1)}`)
    .join(" ");

  // area fill closed to zero-line
  const fillPath = `${curvePath} L ${xFor(dMax).toFixed(1)} ${zeroY.toFixed(1)} L ${xFor(dMin).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const markerPoint = useMemo(() => {
    if (markerD === null || markerD === undefined) return null;
    const match = points.find((pt) => pt.d === markerD);
    if (!match) return null;
    return { x: xFor(match.d), y: yFor(match.p), p: match.p };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerD, points]);

  const earlyW = Math.max(0, x0 - PL);

  return (
    // SVG stroke via Tailwind classes requires stroke="currentColor" + className="text-*"
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible select-none">
      {/* Early bonus zone */}
      {earlyW > 0 && (
        <rect
          x={PL}
          y={PT}
          width={earlyW}
          height={H - PT - PB}
          fill="currentColor"
          fillOpacity={0.05}
          className="text-green-500"
        />
      )}

      {/* Area under curve */}
      <path d={fillPath} fill="currentColor" fillOpacity={0.08} className="text-custom-primary-100" />

      {/* Guide: p=1 */}
      <line
        x1={PL}
        y1={oneY}
        x2={W - PR}
        y2={oneY}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="3 5"
        className="text-custom-border-200"
      />
      {/* Guide: p=0 */}
      <line
        x1={PL}
        y1={zeroY}
        x2={W - PR}
        y2={zeroY}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="3 5"
        className="text-custom-border-300"
      />
      {/* Guide: d=0 */}
      <line
        x1={x0}
        y1={PT}
        x2={x0}
        y2={H - PB}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="2 4"
        className="text-custom-border-300"
      />

      {/* Axes */}
      <line
        x1={PL}
        y1={H - PB}
        x2={W - PR}
        y2={H - PB}
        stroke="currentColor"
        strokeWidth={1}
        className="text-custom-border-200"
      />
      <line
        x1={PL}
        y1={PT}
        x2={PL}
        y2={H - PB}
        stroke="currentColor"
        strokeWidth={1}
        className="text-custom-border-200"
      />

      {/* Curve */}
      <path
        d={curvePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-custom-primary-100"
      />

      {/* Y labels */}
      <text x={PL - 6} y={zeroY + 3} textAnchor="end" fontSize={9} fill="currentColor" className="text-custom-text-400">
        0
      </text>
      <text x={PL - 6} y={oneY + 3} textAnchor="end" fontSize={9} fill="currentColor" className="text-custom-text-400">
        1
      </text>
      {pMax > 1.05 && (
        <text
          x={PL - 6}
          y={yFor(pMax) + 3}
          textAnchor="end"
          fontSize={9}
          fill="currentColor"
          className="text-custom-text-400"
        >
          {pMax.toFixed(1)}
        </text>
      )}

      {/* X labels */}
      <text
        x={x0}
        y={H - PB + 12}
        textAnchor="middle"
        fontSize={9}
        fill="currentColor"
        className="text-custom-text-300"
      >
        0
      </text>
      <text
        x={W - PR}
        y={H - PB + 12}
        textAnchor="end"
        fontSize={9}
        fill="currentColor"
        className="text-custom-text-400"
      >
        {dMax}d
      </text>
      <text
        x={PL + 2}
        y={H - PB + 12}
        textAnchor="start"
        fontSize={9}
        fill="currentColor"
        className="text-custom-text-400"
      >
        {dMin}d
      </text>

      {/* Y axis label */}
      <text
        x={PL - 28}
        y={H / 2}
        textAnchor="middle"
        fontSize={8}
        fill="currentColor"
        className="text-custom-text-400"
        transform={`rotate(-90, ${PL - 24}, ${H / 2})`}
      >
        p
      </text>

      {/* Marker */}
      {markerPoint && (
        <>
          <line
            x1={markerPoint.x}
            y1={zeroY}
            x2={markerPoint.x}
            y2={markerPoint.y}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="2 3"
            className="text-custom-primary-100"
          />
          <circle cx={markerPoint.x} cy={markerPoint.y} r={5} fill="currentColor" className="text-custom-primary-100" />
          <circle cx={markerPoint.x} cy={markerPoint.y} r={2.5} fill="white" />
          <text
            x={markerPoint.x + 8}
            y={markerPoint.y - 4}
            fontSize={9}
            fill="currentColor"
            className="text-custom-text-200"
          >
            p={markerPoint.p.toFixed(2)}
          </text>
        </>
      )}

      {/* Zone labels */}
      {earlyW > 24 && (
        <text
          x={PL + earlyW / 2}
          y={PT + 10}
          textAnchor="middle"
          fontSize={8}
          fill="currentColor"
          className="text-green-500"
          fillOpacity={0.7}
        >
          early
        </text>
      )}
    </svg>
  );
};
