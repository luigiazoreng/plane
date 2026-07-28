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
        <span className="text-xs text-custom-text-200 font-medium">{label}</span>
        {target && (
          <span className="bg-custom-background-80 text-custom-text-300 rounded px-1.5 py-0.5 text-[11px] font-medium">
            {target}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="bg-custom-background-80 h-2 w-full overflow-hidden rounded-full">
          <div
            className={cn(
              "h-2 rounded-full transition-all duration-500",
              isHealthy && "bg-emerald-500",
              isWarning && "bg-amber-500",
              isCritical && "bg-rose-500",
              pct === null && "bg-custom-background-80"
            )}
            style={{
              width: pct !== null && pct !== undefined ? `${Math.min(pct, 100)}%` : "0%",
            }}
          />
        </div>
        <span
          className={cn(
            "text-base min-w-[44px] text-right font-bold",
            isHealthy && "text-emerald-600 dark:text-emerald-400",
            isWarning && "text-amber-600 dark:text-amber-400",
            isCritical && "text-rose-600 dark:text-rose-400",
            pct === null && "text-custom-text-400"
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
      <div className="border-custom-border-200 bg-custom-background-100 flex animate-pulse flex-col justify-between gap-4 rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <div className="bg-custom-background-80 h-4 w-32 rounded" />
          <div className="bg-custom-background-80 size-6 rounded-full" />
        </div>
        <div className="space-y-4 pt-2">
          <div className="bg-custom-background-80 h-10 rounded-lg" />
          <div className="bg-custom-background-80 h-10 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!sla.sla_first_response_hours && !sla.sla_resolution_hours) {
    return (
      <div className="border-custom-border-200 bg-custom-background-100 flex flex-col justify-between rounded-xl border p-5">
        <div className="border-custom-border-100 flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-custom-text-300 size-4" />
            <span className="text-xs text-custom-text-100 tracking-wider font-semibold uppercase">SLA Compliance</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-6 text-center">
          <div className="bg-custom-background-80 text-custom-text-300 flex size-10 items-center justify-center rounded-full">
            <ShieldAlert className="size-5" />
          </div>
          <div>
            <p className="text-xs text-custom-text-200 font-medium">No SLA targets configured</p>
            <p className="text-custom-text-400 mt-0.5 text-[11px]">Configure SLA targets in portal settings</p>
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
    <div className="border-custom-border-200 bg-custom-background-100 flex flex-col justify-between gap-5 rounded-xl border p-5">
      <div className="border-custom-border-100 flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-emerald-500 size-4" />
          <span className="text-xs text-custom-text-100 tracking-wider font-semibold uppercase">SLA Performance</span>
        </div>
        {overallScore !== null && (
          <span
            className={cn(
              "text-xs rounded-full px-2 py-0.5 font-semibold",
              overallScore >= 80
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
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
        <div className="border-custom-border-100 text-custom-text-400 flex items-start gap-2 border-t pt-3 text-[11px]">
          <Info className="text-custom-text-300 mt-0.5 size-3.5 shrink-0" />
          <p>{sla.historical_note}</p>
        </div>
      )}
    </div>
  );
});
