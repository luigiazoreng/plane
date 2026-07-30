"use client";

import { observer } from "mobx-react";
import { Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@plane/utils";
import type { IHelpdeskSLACompliance } from "@plane/types";

type Props = {
  sla: IHelpdeskSLACompliance | undefined;
  isLoading: boolean;
};

const SLABar = ({ pct, label, target }: { pct: number | null; label: string; target: string | null }) => {
  const isHealthy = pct !== null && pct !== undefined && pct >= 80;
  const isWarning = pct !== null && pct !== undefined && pct >= 50 && pct < 80;
  const isCritical = pct !== null && pct !== undefined && pct < 50;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-secondary font-medium">{label}</span>
        {target && (
          <span className="bg-layer-2 text-tertiary rounded px-1.5 py-0.5 text-[11px] font-medium">
            {target}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="bg-layer-2 h-2 w-full overflow-hidden rounded-full">
          <div
            className={cn(
              "h-2 rounded-full transition-all duration-500",
              isHealthy && "bg-success-primary",
              isWarning && "bg-warning-primary",
              isCritical && "bg-danger-primary",
              pct === null && "bg-layer-2"
            )}
            style={{
              width: pct !== null && pct !== undefined ? `${Math.min(pct, 100)}%` : "0%",
            }}
          />
        </div>
        <span
          className={cn(
            "text-base min-w-[44px] text-right font-bold",
            isHealthy && "text-success-primary",
            isWarning && "text-warning-primary",
            isCritical && "text-danger-primary",
            pct === null && "text-placeholder"
          )}
        >
          {pct !== null && pct !== undefined ? `${pct}%` : "—"}
        </span>
      </div>
    </div>
  );
};

export const SLAComplianceCard = observer(function SLAComplianceCard({ sla, isLoading }: Props) {
  if (isLoading || !sla) {
    return (
      <div className="border-subtle bg-surface-1 flex animate-pulse flex-col justify-between gap-4 rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <div className="bg-layer-2 h-4 w-32 rounded" />
          <div className="bg-layer-2 size-6 rounded-full" />
        </div>
        <div className="space-y-4 pt-2">
          <div className="bg-layer-2 h-10 rounded-lg" />
          <div className="bg-layer-2 h-10 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!sla.sla_first_response_hours && !sla.sla_resolution_hours) {
    return (
      <div className="border-subtle bg-surface-1 flex flex-col justify-between rounded-xl border p-5">
        <div className="border-subtle flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-tertiary size-4" />
            <span className="text-xs text-primary tracking-wider font-semibold uppercase">SLA Compliance</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-6 text-center">
          <div className="bg-layer-2 text-tertiary flex size-10 items-center justify-center rounded-full">
            <ShieldAlert className="size-5" />
          </div>
          <div>
            <p className="text-xs text-secondary font-medium">No SLA targets configured</p>
            <p className="text-placeholder mt-0.5 text-[11px]">Configure SLA targets in portal settings</p>
          </div>
        </div>
      </div>
    );
  }

  const overallScore =
    sla.first_response_pct !== null && sla.resolution_pct !== null
      ? Math.round((sla.first_response_pct + sla.resolution_pct) / 2)
      : (sla.first_response_pct ?? sla.resolution_pct ?? null);

  return (
    <div className="border-subtle bg-surface-1 flex flex-col justify-between gap-5 rounded-xl border p-5">
      <div className="border-subtle flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-success-primary size-4" />
          <span className="text-xs text-primary tracking-wider font-semibold uppercase">SLA Performance</span>
        </div>
        {overallScore !== null && (
          <span
            className={cn(
              "text-xs rounded-full px-2 py-0.5 font-semibold",
              overallScore >= 80
                ? "bg-success-subtle text-success-primary"
                : "bg-warning-subtle text-warning-primary"
            )}
          >
            {overallScore}% Overall
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {sla.sla_first_response_hours && (
          <SLABar
            pct={sla.first_response_pct}
            label="First Response Compliance"
            target={`within ${sla.sla_first_response_hours}h`}
          />
        )}
        {sla.sla_resolution_hours && (
          <SLABar
            pct={sla.resolution_pct}
            label="Resolution Compliance"
            target={`within ${sla.sla_resolution_hours}h`}
          />
        )}
      </div>

      {sla.historical_note && (
        <div className="border-subtle text-placeholder flex items-start gap-2 border-t pt-3 text-[11px]">
          <Info className="text-tertiary mt-0.5 size-3.5 shrink-0" />
          <p>{sla.historical_note}</p>
        </div>
      )}
    </div>
  );
});
