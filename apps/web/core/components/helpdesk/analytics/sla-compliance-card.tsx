"use client";

import { observer } from "mobx-react";
import type { IHelpdeskSLACompliance } from "@plane/types";

type Props = {
  sla: IHelpdeskSLACompliance | undefined;
  isLoading: boolean;
};

const SLABar = ({ pct, label, target }: { pct: number | null; label: string; target: string | null }) => {
  const isGood = pct !== null && pct !== undefined && pct >= 80;
  const color = isGood ? "#10B981" : "#F97316";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-custom-text-200 font-medium">{label}</span>
        {target && <span className="text-xs text-custom-text-400">{target}</span>}
      </div>
      <div className="bg-custom-background-80 h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{
            width: pct !== null && pct !== undefined ? `${Math.min(pct, 100)}%` : "0%",
            backgroundColor: color,
          }}
        />
      </div>
      <span className="text-xl font-bold" style={{ color }}>
        {pct !== null && pct !== undefined ? `${pct}%` : "—"}
      </span>
    </div>
  );
};

export const SLAComplianceCard = observer(function SLAComplianceCard({ sla, isLoading }: Props) {
  if (isLoading || !sla) {
    return (
      <div className="border-custom-border-200 bg-custom-background-100 flex animate-pulse flex-col gap-4 rounded-xl border p-5">
        <div className="bg-custom-background-80 h-3 w-28 rounded" />
        <div className="bg-custom-background-80 h-12 rounded" />
        <div className="bg-custom-background-80 h-12 rounded" />
      </div>
    );
  }

  if (!sla.sla_first_response_hours && !sla.sla_resolution_hours) {
    return (
      <div className="border-custom-border-200 bg-custom-background-100 flex flex-col gap-3 rounded-xl border p-5">
        <span className="text-xs tracking-widest text-custom-text-400 font-semibold uppercase">SLA Compliance</span>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-4 text-center">
          <span className="text-2xl">📋</span>
          <p className="text-sm text-custom-text-300">No SLA targets configured.</p>
          <p className="text-xs text-custom-text-400">Set them in Portal settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-custom-border-200 bg-custom-background-100 flex flex-col gap-5 rounded-xl border p-5">
      <span className="text-xs tracking-widest text-custom-text-400 font-semibold uppercase">SLA Compliance</span>
      {sla.sla_first_response_hours && (
        <SLABar
          pct={sla.first_response_pct}
          label="First response"
          target={`within ${sla.sla_first_response_hours}h`}
        />
      )}
      {sla.sla_resolution_hours && (
        <SLABar pct={sla.resolution_pct} label="Resolution" target={`within ${sla.sla_resolution_hours}h`} />
      )}
      {sla.historical_note && (
        <p className="text-xs text-custom-text-400 border-custom-border-100 border-t pt-3">{sla.historical_note}</p>
      )}
    </div>
  );
});
