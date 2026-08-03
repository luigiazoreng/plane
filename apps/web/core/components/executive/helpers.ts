/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  IHelpdeskAnalyticsResponse,
  IHelpdeskAgentChartPoint,
  IKpiOverviewResponse,
  IKpiMemberAggregate,
} from "@plane/types";

// ── Types ──────────────────────────────────────────────────────────────────

export type TMemberProfile = "helpdesk" | "development" | "hybrid";

export interface IITIndexComponent {
  key: string;
  label: string;
  /** Normalized 0-100 value, or null when unavailable. */
  value: number | null;
  /** Default weight (sums to 1.0). */
  weight: number;
  /** Effective weight after redistribution of missing indicators. */
  effectiveWeight: number;
  /** Weighted contribution to the final index. */
  contribution: number;
}

export interface IITGeneralIndex {
  /** Final composite index 0-100, or null when no data. */
  index: number | null;
  components: IITIndexComponent[];
  missing: string[];
}

export interface IExecutiveMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  profile: TMemberProfile;
  /** Helpdesk SLA-compliance score 0-100, or null if not applicable/no SLA configured. */
  hdScore: number | null;
  /** KPI efficiency score 0-100, or null if not applicable. */
  kpiScore: number | null;
  /** Final composite score. */
  finalScore: number;
  /** Raw ticket count from Helpdesk. */
  hdTickets: number | null;
  /** Raw KPI efficiency ratio (0-1). */
  kpiEfficiency: number | null;
}

// ── Default weights ────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: Record<string, { label: string; weight: number }> = {
  project_efficiency: { label: "Project Efficiency", weight: 0.35 },
  sla_response: { label: "SLA First Response", weight: 0.25 },
  sla_resolution: { label: "SLA Resolution", weight: 0.2 },
  backlog: { label: "Backlog Health", weight: 0.1 },
  resolution_time: { label: "Resolution Speed", weight: 0.1 },
};

// ── IT General Index ───────────────────────────────────────────────────────

/**
 * Compute the IT General Index from Helpdesk analytics and KPI overview.
 *
 * When an indicator is unavailable (`null`), its weight is redistributed
 * proportionally across the remaining indicators. If no indicators are
 * available the index is `null`.
 */
export function computeITGeneralIndex(
  hd: IHelpdeskAnalyticsResponse | undefined,
  kpi: IKpiOverviewResponse | undefined
): IITGeneralIndex {
  // Normalize each indicator to a 0-100 scale.
  const rawValues: Record<string, number | null> = {
    project_efficiency: kpi?.unified.kpi != null ? kpi.unified.kpi * 100 : null,
    sla_response: hd?.sla.first_response_pct ?? null,
    sla_resolution: hd?.sla.resolution_pct ?? null,
    // Backlog health: lower is better. Express as percentage of non-backlog.
    backlog: normalizeBacklog(hd),
    // Resolution speed: lower is better. Cap at 48h = 0%, 0h = 100%.
    resolution_time: normalizeResolutionTime(hd),
  };

  const missing: string[] = [];
  let availableWeightSum = 0;

  // First pass: find available weight sum.
  for (const [key, config] of Object.entries(DEFAULT_WEIGHTS)) {
    if (rawValues[key] == null) {
      missing.push(config.label);
    } else {
      availableWeightSum += config.weight;
    }
  }

  // Build components with redistributed weights.
  const components: IITIndexComponent[] = [];
  let index = 0;

  for (const [key, config] of Object.entries(DEFAULT_WEIGHTS)) {
    const value = rawValues[key] ?? null;
    const effectiveWeight = value != null && availableWeightSum > 0 ? config.weight / availableWeightSum : 0;
    const contribution = value != null ? value * effectiveWeight : 0;
    index += contribution;

    components.push({
      key,
      label: config.label,
      value,
      weight: config.weight,
      effectiveWeight,
      contribution,
    });
  }

  return {
    index: availableWeightSum > 0 ? Math.round(index * 10) / 10 : null,
    components,
    missing,
  };
}

function normalizeBacklog(hd: IHelpdeskAnalyticsResponse | undefined): number | null {
  if (!hd) return null;
  const total = hd.kpis.total_requests.current;
  const open = hd.kpis.open_requests.current;
  if (total == null || open == null || total === 0) return null;
  // 100% = no backlog, 0% = all tickets are backlog
  return Math.max(0, Math.min(100, Math.round((1 - open / total) * 1000) / 10));
}

function normalizeResolutionTime(hd: IHelpdeskAnalyticsResponse | undefined): number | null {
  if (!hd) return null;
  const avgHours = hd.kpis.avg_resolution_hours.current;
  if (avgHours == null) return null;
  // 0h → 100, 48h+ → 0. Linear interpolation.
  const MAX_HOURS = 48;
  return Math.max(0, Math.min(100, Math.round((1 - avgHours / MAX_HOURS) * 1000) / 10));
}

// ── Member profile detection ───────────────────────────────────────────────

/**
 * Minimum resolved tickets in the period for Helpdesk work to count toward a
 * member's profile/score at all. Below this, one or two incidental tickets
 * would otherwise tag someone "hybrid" and let a tiny, noisy sample drag down
 * an otherwise-solid KPI score (see computeMemberScore's volume weighting --
 * this threshold keeps genuinely incidental helpdesk work out of the blend
 * entirely, rather than relying on the weighting alone to dilute it).
 */
const MIN_HELPDESK_TICKETS_FOR_PROFILE = 3;

/**
 * Helpdesk quality score per agent: their own SLA compliance (average of
 * first-response and resolution SLA %, whichever are available), NOT ticket
 * volume. Resolving 1 ticket within SLA is a perfect score; resolving 24
 * tickets late is not "better" just because there are more of them.
 */
export function computeHelpdeskQualityScores(agents: IHelpdeskAgentChartPoint[]): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const agent of agents) {
    const parts = [agent.sla_first_response_pct, agent.sla_resolution_pct].filter((v): v is number => v != null);
    map.set(
      agent.agent_id,
      parts.length > 0 ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10 : null
    );
  }
  return map;
}

/** Scored KPI work items for a member: delivered items only (matches the KPI engine's Vp/Vf rule -- pending work isn't "scored"). */
function kpiScoredItemCount(member: IKpiMemberAggregate | undefined): number {
  if (!member) return 0;
  return (member.counts.on_time ?? 0) + (member.counts.early ?? 0) + (member.counts.late ?? 0);
}

/**
 * Detect whether a user works on Helpdesk, Development, or both.
 * Helpdesk only counts once ticket volume clears MIN_HELPDESK_TICKETS_FOR_PROFILE
 * -- a couple of incidental tickets don't make someone "Hybrid".
 */
export function detectMemberProfile(
  userId: string,
  kpiMemberIds: Set<string>,
  hdTicketCounts: Map<string, number>
): TMemberProfile {
  const inKpi = kpiMemberIds.has(userId);
  const hasMeaningfulHelpdeskVolume = (hdTicketCounts.get(userId) ?? 0) >= MIN_HELPDESK_TICKETS_FOR_PROFILE;
  if (inKpi && hasMeaningfulHelpdeskVolume) return "hybrid";
  if (hasMeaningfulHelpdeskVolume) return "helpdesk";
  return "development";
}

/**
 * Compute the final score for a member based on their profile.
 *
 * - Helpdesk-only: 100% HD score
 * - Development-only: 100% KPI score
 * - Hybrid: blended, weighted by each side's actual work volume (resolved
 *   tickets vs scored KPI items) rather than a flat 50/50 -- someone whose
 *   measured work is mostly Projects with a handful of Helpdesk tickets on
 *   the side gets scored mostly on Projects, not punished equally on both.
 *   When one side's score is unavailable (e.g. no SLA configured), all
 *   weight goes to the other side instead of defaulting the missing side to 0.
 */
export function computeMemberScore(
  profile: TMemberProfile,
  hdScore: number | null,
  kpiScore: number | null,
  hdVolume = 0,
  kpiVolume = 0
): number {
  switch (profile) {
    case "helpdesk":
      return hdScore ?? 0;
    case "development":
      return kpiScore ?? 0;
    case "hybrid": {
      if (hdScore == null && kpiScore == null) return 0;
      if (hdScore == null) return Math.round(kpiScore! * 10) / 10;
      if (kpiScore == null) return Math.round(hdScore * 10) / 10;

      const totalVolume = hdVolume + kpiVolume;
      const hdWeight = totalVolume > 0 ? hdVolume / totalVolume : 0.5;
      const kpiWeight = 1 - hdWeight;
      return Math.round((hdScore * hdWeight + kpiScore * kpiWeight) * 10) / 10;
    }
  }
}

/**
 * Build the unified member list by cross-referencing KPI members and
 * Helpdesk top agents.
 */
export function buildExecutiveMembers(
  kpiMembers: IKpiMemberAggregate[],
  hdAgents: IHelpdeskAgentChartPoint[]
): IExecutiveMember[] {
  const hdQualityMap = computeHelpdeskQualityScores(hdAgents);
  const kpiMemberIds = new Set(kpiMembers.map((m) => m.user_id));
  const hdTicketCounts = new Map(hdAgents.map((a) => [a.agent_id, a.count]));
  const hdAgentIds = new Set(hdAgents.map((a) => a.agent_id));

  // Collect all unique user IDs.
  const allUserIds = new Set([...kpiMemberIds, ...hdAgentIds]);

  // Build KPI lookup.
  const kpiMap = new Map<string, IKpiMemberAggregate>();
  for (const m of kpiMembers) {
    kpiMap.set(m.user_id, m);
  }

  // Build HD lookup.
  const hdMap = new Map<string, IHelpdeskAgentChartPoint>();
  for (const a of hdAgents) {
    hdMap.set(a.agent_id, a);
  }

  const results: IExecutiveMember[] = [];

  for (const userId of allUserIds) {
    const profile = detectMemberProfile(userId, kpiMemberIds, hdTicketCounts);
    const kpiMember = kpiMap.get(userId);
    const hdAgent = hdMap.get(userId);

    const kpiScore = kpiMember?.efficiency != null ? Math.round(kpiMember.efficiency * 1000) / 10 : null;
    const hdScore = hdQualityMap.get(userId) ?? null;

    results.push({
      userId,
      displayName: kpiMember?.display_name ?? hdAgent?.display_name ?? "Unknown",
      avatarUrl: kpiMember?.avatar_url ?? null,
      profile,
      hdScore,
      kpiScore,
      finalScore: computeMemberScore(profile, hdScore, kpiScore, hdAgent?.count ?? 0, kpiScoredItemCount(kpiMember)),
      hdTickets: hdAgent?.count ?? null,
      kpiEfficiency: kpiMember?.efficiency ?? null,
    });
  }

  // Sort by final score descending.
  results.sort((a, b) => b.finalScore - a.finalScore);

  return results;
}

// ── Profile display helpers ────────────────────────────────────────────────

export const PROFILE_CONFIG: Record<TMemberProfile, { label: string; color: string; bg: string }> = {
  helpdesk: {
    label: "Helpdesk",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
  },
  development: {
    label: "Development",
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-500/10",
  },
  hybrid: {
    label: "Hybrid",
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-500/10",
  },
};

// ── Health status helpers ──────────────────────────────────────────────────

export type THealthStatus = "healthy" | "warning" | "critical" | "unknown";

export function getHealthStatus(value: number | null): THealthStatus {
  if (value == null) return "unknown";
  if (value >= 90) return "healthy";
  if (value >= 70) return "warning";
  return "critical";
}

export const HEALTH_CONFIG: Record<THealthStatus, { label: string; color: string; bg: string; dot: string }> = {
  healthy: {
    label: "Healthy",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    dot: "bg-emerald-500",
  },
  warning: {
    label: "Attention",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    dot: "bg-amber-500",
  },
  critical: {
    label: "Critical",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10",
    dot: "bg-rose-500",
  },
  unknown: {
    label: "No data",
    color: "text-custom-text-400",
    bg: "bg-custom-background-80",
    dot: "bg-custom-text-400",
  },
};
