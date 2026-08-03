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
          <span className="bg-layer-2 text-tertiary rounded px-1.5 py-0.5 text-[11px] font-medium">{target}</span>
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
            pct === null && "text-tertiary"
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
      <div className="flex animate-pulse flex-col justify-between gap-4 rounded-md border border-subtle bg-layer-1 p-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 rounded bg-layer-2" />
          <div className="size-6 rounded-full bg-layer-2" />
        </div>
        <div className="space-y-4 pt-2">
          <div className="h-10 rounded-md bg-layer-2" />
          <div className="h-10 rounded-md bg-layer-2" />
        </div>
      </div>
    );
  }

  if (!sla.sla_first_response_hours && !sla.sla_resolution_hours) {
    return (
      <div className="flex min-h-[160px] flex-col justify-between rounded-md border border-subtle bg-layer-1 p-4">
        <div className="flex items-center justify-between border-b border-subtle pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-tertiary" />
            <span className="text-12 font-medium tracking-wide text-primary uppercase">SLA Compliance</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <ShieldAlert className="size-6 text-tertiary" />
          <div>
            <p className="text-13 font-medium text-secondary">No SLA targets configured</p>
            <p className="mt-0.5 text-11 text-tertiary">Configure SLA targets in portal settings</p>
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
    <div className="flex flex-col justify-between gap-4 rounded-md border border-subtle bg-layer-1 p-4">
      <div className="flex items-center justify-between border-b border-subtle pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-success-primary" />
          <span className="text-12 font-medium tracking-wide text-primary uppercase">SLA Compliance</span>
        </div>
        {overallScore !== null && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-11 font-medium",
              overallScore >= 80
                ? "bg-success-primary/10 text-success-primary"
                : "bg-warning-primary/10 text-warning-primary"
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
        <div className="flex items-start gap-2 border-t border-subtle pt-3 text-11 text-tertiary">
          <Info className="mt-0.5 size-3.5 shrink-0 text-tertiary" />
          <p>{sla.historical_note}</p>
        </div>
      )}
    </div>
  );
});
