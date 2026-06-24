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

const WIDTH = 520;
const HEIGHT = 220;
const PAD = 32;

export const KpiCurveChart = (props: Props) => {
  const { config, b, markerD = null, dMin = -3, dMax = 20 } = props;

  const points = useMemo(() => sampleCurve(b, config, dMin, dMax), [b, config, dMin, dMax]);

  const { pMin, pMax } = useMemo(() => {
    const ps = points.map((pt) => pt.p);
    return { pMin: Math.min(0, ...ps), pMax: Math.max(1, ...ps) };
  }, [points]);

  const xFor = (d: number) => PAD + ((d - dMin) / (dMax - dMin)) * (WIDTH - 2 * PAD);
  const yFor = (p: number) => HEIGHT - PAD - ((p - pMin) / (pMax - pMin || 1)) * (HEIGHT - 2 * PAD);

  const path = points
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${xFor(pt.d).toFixed(1)} ${yFor(pt.p).toFixed(1)}`)
    .join(" ");
  const zeroY = yFor(0);
  const oneY = yFor(1);

  const markerPoint = useMemo(() => {
    if (markerD === null || markerD === undefined) return null;
    const match = points.find((pt) => pt.d === markerD);
    if (!match) return null;
    return { x: xFor(match.d), y: yFor(match.p), p: match.p };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerD, points]);

  return (
    <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="select-none">
      {/* axes */}
      <line
        x1={PAD}
        y1={HEIGHT - PAD}
        x2={WIDTH - PAD}
        y2={HEIGHT - PAD}
        className="stroke-custom-border-200"
        strokeWidth={1}
      />
      <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} className="stroke-custom-border-200" strokeWidth={1} />
      {/* p=0 and p=1 guides */}
      <line
        x1={PAD}
        y1={zeroY}
        x2={WIDTH - PAD}
        y2={zeroY}
        className="stroke-custom-border-300"
        strokeDasharray="4 4"
        strokeWidth={1}
      />
      <line
        x1={PAD}
        y1={oneY}
        x2={WIDTH - PAD}
        y2={oneY}
        className="stroke-custom-border-300"
        strokeDasharray="2 4"
        strokeWidth={1}
      />
      <text x={PAD - 6} y={zeroY + 3} textAnchor="end" className="fill-custom-text-300 text-[9px]">
        0
      </text>
      <text x={PAD - 6} y={oneY + 3} textAnchor="end" className="fill-custom-text-300 text-[9px]">
        1
      </text>
      {/* d=0 vertical guide */}
      <line
        x1={xFor(0)}
        y1={PAD}
        x2={xFor(0)}
        y2={HEIGHT - PAD}
        className="stroke-custom-border-300"
        strokeDasharray="2 4"
        strokeWidth={1}
      />
      <text x={xFor(0)} y={HEIGHT - PAD + 12} textAnchor="middle" className="fill-custom-text-300 text-[9px]">
        d=0
      </text>
      <text x={WIDTH - PAD} y={HEIGHT - PAD + 12} textAnchor="end" className="fill-custom-text-300 text-[9px]">
        d={dMax}
      </text>
      {/* curve */}
      <path d={path} fill="none" className="stroke-custom-primary-100" strokeWidth={2} />
      {/* marker */}
      {markerPoint && (
        <>
          <circle cx={markerPoint.x} cy={markerPoint.y} r={4} className="fill-custom-primary-100" />
          <text
            x={markerPoint.x}
            y={markerPoint.y - 8}
            textAnchor="middle"
            className="fill-custom-text-200 text-[10px]"
          >
            p={markerPoint.p.toFixed(2)}
          </text>
        </>
      )}
    </svg>
  );
};
