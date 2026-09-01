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
  THelpdeskDateFilter,
  TKpiPeriod,
} from "@plane/types";

// ── Reporting period ───────────────────────────────────────────────────────

/**
 * Periods this dashboard can offer. Narrower than the KPI panel's own set:
 * every period here has to exist on BOTH sides, and Helpdesk analytics has no
 * unbounded window, so "all" is deliberately absent -- offering it would
 * silently pair all-time KPI data with a 12-month Helpdesk slice.
 */
export const EXECUTIVE_PERIODS = ["7d", "30d", "90d", "180d", "365d", "custom"] as const;

export type TExecutivePeriod = (typeof EXECUTIVE_PERIODS)[number];

const HELPDESK_FILTER_BY_PERIOD: Record<TExecutivePeriod, THelpdeskDateFilter> = {
  "7d": "last_7_days",
  "30d": "last_30_days",
  "90d": "last_3_months",
  "180d": "last_6_months",
  "365d": "last_12_months",
  custom: "custom",
};

/** Translate the shared period into the Helpdesk analytics endpoint's own vocabulary. */
export const helpdeskFilterForPeriod = (period: TExecutivePeriod): THelpdeskDateFilter =>
  HELPDESK_FILTER_BY_PERIOD[period];

export const PERIOD_LABELS: Record<TExecutivePeriod, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "180d": "6 months",
  "365d": "12 months",
  custom: "Custom",
};

/** The executive periods are all valid KPI periods. */
export const kpiPeriodForPeriod = (period: TExecutivePeriod): TKpiPeriod => period;

// ── KPI Settings ───────────────────────────────────────────────────────────

export interface IKpiSettings {
  projectEfficiencyTarget: number;
  deliveryReliabilityTarget: number;
  firstResponseSlaTarget: number;
  resolutionSlaTarget: number;
  minimumProjectSample: number;
  minimumHelpdeskSample: number;
  targetVpMonthly: number;
  projectScoreWeights: {
    efficiency: number;
    throughput: number;
    reliability: number;
  };
  helpdeskScoreWeights: {
    firstResponse: number;
    resolution: number;
  };
  hybridScoreWeights: {
    project: number;
    helpdesk: number;
  };
}

export const DEFAULT_KPI_SETTINGS: IKpiSettings = {
  projectEfficiencyTarget: 95,
  deliveryReliabilityTarget: 95,
  firstResponseSlaTarget: 90,
  resolutionSlaTarget: 90,
  minimumProjectSample: 5,
  minimumHelpdeskSample: 10,
  targetVpMonthly: 800,
  projectScoreWeights: {
    efficiency: 0.5,
    throughput: 0.3,
    reliability: 0.2,
  },
  helpdeskScoreWeights: {
    firstResponse: 0.4,
    resolution: 0.6,
  },
  hybridScoreWeights: {
    project: 0.5,
    helpdesk: 0.5,
  },
};

/**
 * Calculate Target Vp for the selected period proportionally based on the monthly target.
 */
export function getTargetVpForPeriod(
  period: TExecutivePeriod,
  customStart?: string,
  customEnd?: string,
  monthlyTargetVp: number = 800
): number {
  let days = 30;
  if (period === "7d") days = 7;
  else if (period === "30d") days = 30;
  else if (period === "90d") days = 90;
  else if (period === "180d") days = 180;
  else if (period === "365d") days = 365;
  else if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart).getTime();
    const end = new Date(customEnd).getTime();
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
    }
  }
  return Math.round((monthlyTargetVp / 30) * days * 100) / 100;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type TMemberProfile = "helpdesk" | "development" | "hybrid";
export type TSampleStatus = "sufficient" | "insufficient";

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
  /** Official rank among members with sufficient sample (1-indexed), or null if sample is insufficient. */
  rank: number | null;
  /** Indicates whether the member cleared minimum sample thresholds for their profile. */
  sampleStatus: TSampleStatus;
  /** Helpdesk SLA-compliance score 0-100, or null if not applicable/no SLA configured. */
  hdScore: number | null;
  /** Multi-factor KPI efficiency score 0-100, or null if not applicable. */
  kpiScore: number | null;
  /** Final composite score. */
  finalScore: number;
  /** Raw ticket count from Helpdesk. */
  hdTickets: number | null;
  /** Raw KPI efficiency ratio (0-1). */
  kpiEfficiency: number | null;
  /** Delivery Reliability percentage (0-100), or null if no delivered items. */
  deliveryReliability: number | null;
  /** Throughput Score (0-100) based on Target Vp. */
  throughputScore: number | null;
  /** Raw sum of planned value across this member's delivered work items. */
  sumVp: number | null;
  /** Raw sum of final value (after delay penalties) across the same items. */
  sumVf: number | null;
  /** Total items this member is carrying: delivered + pending KPI work items, plus Helpdesk tickets. */
  workload: number;
  /** Delivered KPI work items. */
  kpiScoredItems: number;
  /** Still-open KPI work items. */
  kpiPendingItems: number;
  /** Item delivery breakdown. */
  onTimeItems: number;
  earlyItems: number;
  lateItems: number;
  /** The two raw SLA percentages hdScore averages. */
  hdSlaFirstResponse: number | null;
  hdSlaResolution: number | null;
}

// ── Default weights for IT General Index ────────────────────────────────────

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
 */
export function computeITGeneralIndex(
  hd: IHelpdeskAnalyticsResponse | undefined,
  kpi: IKpiOverviewResponse | undefined
): IITGeneralIndex {
  const rawValues: Record<string, number | null> = {
    project_efficiency: kpi?.unified.kpi != null ? kpi.unified.kpi * 100 : null,
    sla_response: hd?.sla.first_response_pct ?? null,
    sla_resolution: hd?.sla.resolution_pct ?? null,
    backlog: normalizeBacklog(hd),
    resolution_time: normalizeResolutionTime(hd),
  };

  const missing: string[] = [];
  let availableWeightSum = 0;

  for (const [key, config] of Object.entries(DEFAULT_WEIGHTS)) {
    if (rawValues[key] == null) {
      missing.push(config.label);
    } else {
      availableWeightSum += config.weight;
    }
  }

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
  return Math.max(0, Math.min(100, Math.round((1 - open / total) * 1000) / 10));
}

function normalizeResolutionTime(hd: IHelpdeskAnalyticsResponse | undefined): number | null {
  if (!hd) return null;
  const avgHours = hd.kpis.avg_resolution_hours.current;
  if (avgHours == null) return null;
  const MAX_HOURS = 48;
  return Math.max(0, Math.min(100, Math.round((1 - avgHours / MAX_HOURS) * 1000) / 10));
}

// ── Member profile detection ───────────────────────────────────────────────

const MIN_HELPDESK_TICKETS_FOR_PROFILE = 3;

/**
 * Helpdesk quality score per agent: weighted average of SLA first response & resolution SLAs.
 */
export function computeHelpdeskQualityScores(
  agents: IHelpdeskAgentChartPoint[],
  weights: IKpiSettings["helpdeskScoreWeights"] = DEFAULT_KPI_SETTINGS.helpdeskScoreWeights
): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const agent of agents) {
    const fr = agent.sla_first_response_pct;
    const res = agent.sla_resolution_pct;
    if (fr == null && res == null) {
      map.set(agent.agent_id, null);
    } else if (fr == null) {
      map.set(agent.agent_id, Math.round(res! * 10) / 10);
    } else if (res == null) {
      map.set(agent.agent_id, Math.round(fr * 10) / 10);
    } else {
      const score = fr * weights.firstResponse + res * weights.resolution;
      map.set(agent.agent_id, Math.round(score * 10) / 10);
    }
  }
  return map;
}

function kpiScoredItemCount(member: IKpiMemberAggregate | undefined): number {
  if (!member) return 0;
  return (member.counts.on_time ?? 0) + (member.counts.early ?? 0) + (member.counts.late ?? 0);
}

function kpiTotalItemCount(member: IKpiMemberAggregate | undefined): number {
  if (!member) return 0;
  return kpiScoredItemCount(member) + (member.counts.pending ?? 0);
}

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
 * Compute final score for a member based on profile and configurable hybrid weights.
 */
export function computeMemberScore(
  profile: TMemberProfile,
  hdScore: number | null,
  kpiScore: number | null,
  hybridWeights: IKpiSettings["hybridScoreWeights"] = DEFAULT_KPI_SETTINGS.hybridScoreWeights
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

      const score = kpiScore * hybridWeights.project + hdScore * hybridWeights.helpdesk;
      return Math.round(score * 10) / 10;
    }
  }
}

/**
 * Build unified executive member list with multi-factor scoring, sample size evaluation, and ranking.
 */
export function buildExecutiveMembers(
  kpiMembers: IKpiMemberAggregate[],
  hdAgents: IHelpdeskAgentChartPoint[],
  settings: IKpiSettings = DEFAULT_KPI_SETTINGS,
  period: TExecutivePeriod = "30d",
  customStartDate?: string,
  customEndDate?: string
): IExecutiveMember[] {
  const hdQualityMap = computeHelpdeskQualityScores(hdAgents, settings.helpdeskScoreWeights);
  const kpiMemberIds = new Set(kpiMembers.map((m) => m.user_id));
  const hdTicketCounts = new Map(hdAgents.map((a) => [a.agent_id, a.count]));
  const hdAgentIds = new Set(hdAgents.map((a) => a.agent_id));

  const allUserIds = new Set([...kpiMemberIds, ...hdAgentIds]);

  const kpiMap = new Map<string, IKpiMemberAggregate>();
  for (const m of kpiMembers) {
    kpiMap.set(m.user_id, m);
  }

  const hdMap = new Map<string, IHelpdeskAgentChartPoint>();
  for (const a of hdAgents) {
    hdMap.set(a.agent_id, a);
  }

  const targetVp = getTargetVpForPeriod(period, customStartDate, customEndDate, settings.targetVpMonthly);

  const rawResults: Omit<IExecutiveMember, "rank">[] = [];

  for (const userId of allUserIds) {
    const profile = detectMemberProfile(userId, kpiMemberIds, hdTicketCounts);
    const kpiMember = kpiMap.get(userId);
    const hdAgent = hdMap.get(userId);

    const onTimeItems = kpiMember?.counts.on_time ?? 0;
    const earlyItems = kpiMember?.counts.early ?? 0;
    const lateItems = kpiMember?.counts.late ?? 0;
    const scoredItems = earlyItems + onTimeItems + lateItems;
    const hdTickets = hdAgent?.count ?? 0;

    // Delivery Reliability % = (Early + On time) / Scored Items * 100
    const deliveryReliability =
      scoredItems > 0 ? Math.round(((earlyItems + onTimeItems) / scoredItems) * 1000) / 10 : null;

    // Throughput Score % = MIN(Σ Vp / Target Vp, 1) * 100
    const sumVp = kpiMember?.sum_vp ?? null;
    const sumVf = kpiMember?.sum_vf ?? null;
    const throughputScore =
      sumVp != null && targetVp > 0 ? Math.round(Math.min((sumVp / targetVp) * 100, 100) * 10) / 10 : null;

    // Multi-factor Project Score = 50% Project Eff + 30% Throughput + 20% Delivery Reliability
    let kpiScore: number | null = null;
    if (kpiMember?.efficiency != null) {
      const effPct = Math.round(kpiMember.efficiency * 1000) / 10;
      const tpPct = throughputScore ?? 0;
      const relPct = deliveryReliability ?? effPct;
      const w = settings.projectScoreWeights;
      kpiScore = Math.round((effPct * w.efficiency + tpPct * w.throughput + relPct * w.reliability) * 10) / 10;
    }

    const hdScore = hdQualityMap.get(userId) ?? null;

    // Sample size evaluation
    const isProjectSufficient = scoredItems >= settings.minimumProjectSample;
    const isHdSufficient = hdTickets >= settings.minimumHelpdeskSample;

    let sampleStatus: TSampleStatus = "insufficient";
    if (profile === "development" && isProjectSufficient) sampleStatus = "sufficient";
    else if (profile === "helpdesk" && isHdSufficient) sampleStatus = "sufficient";
    else if (profile === "hybrid" && (isProjectSufficient || isHdSufficient)) sampleStatus = "sufficient";

    const finalScore = computeMemberScore(profile, hdScore, kpiScore, settings.hybridScoreWeights);

    rawResults.push({
      userId,
      displayName: kpiMember?.display_name ?? hdAgent?.display_name ?? "Unknown",
      avatarUrl: kpiMember?.avatar_url ?? null,
      profile,
      sampleStatus,
      hdScore,
      kpiScore,
      finalScore,
      hdTickets: hdAgent?.count ?? null,
      kpiEfficiency: kpiMember?.efficiency ?? null,
      deliveryReliability,
      throughputScore,
      sumVp,
      sumVf,
      workload: kpiTotalItemCount(kpiMember) + hdTickets,
      kpiScoredItems: scoredItems,
      kpiPendingItems: kpiMember?.counts.pending ?? 0,
      onTimeItems,
      earlyItems,
      lateItems,
      hdSlaFirstResponse: hdAgent?.sla_first_response_pct ?? null,
      hdSlaResolution: hdAgent?.sla_resolution_pct ?? null,
    });
  }

  // Sort: sufficient members first (by finalScore desc), then insufficient members (by finalScore desc)
  rawResults.sort((a, b) => {
    if (a.sampleStatus !== b.sampleStatus) {
      return a.sampleStatus === "sufficient" ? -1 : 1;
    }
    return b.finalScore - a.finalScore;
  });

  // Assign 1-indexed ranks to sufficient sample members only
  let currentRank = 1;
  const results: IExecutiveMember[] = rawResults.map((member) => {
    const rank = member.sampleStatus === "sufficient" ? currentRank++ : null;
    return Object.assign(member, { rank });
  });

  return results;
}

// ── Profile display helpers ────────────────────────────────────────────────

export const PROFILE_CONFIG: Record<TMemberProfile, { label: string; color: string; bg: string }> = {
  helpdesk: {
    label: "Helpdesk",
    color: "text-accent-primary",
    bg: "bg-accent-primary/10",
  },
  development: {
    label: "Development",
    color: "text-label-purple-text",
    bg: "bg-label-purple-bg",
  },
  hybrid: {
    label: "Hybrid",
    color: "text-label-emerald-text",
    bg: "bg-label-emerald-bg",
  },
};

// ── Health status helpers ──────────────────────────────────────────────────

export type THealthStatus = "healthy" | "warning" | "critical" | "unknown";

export function getHealthStatus(value: number | null, target: number = 90, warningDelta: number = 10): THealthStatus {
  if (value == null) return "unknown";
  if (value >= target) return "healthy";
  if (value >= target - warningDelta) return "warning";
  return "critical";
}

export const HEALTH_CONFIG: Record<THealthStatus, { label: string; color: string; bg: string; dot: string }> = {
  healthy: {
    label: "Healthy",
    color: "text-success-primary",
    bg: "bg-success-primary/10",
    dot: "bg-success-primary",
  },
  warning: {
    label: "Attention",
    color: "text-warning-primary",
    bg: "bg-warning-primary/10",
    dot: "bg-warning-primary",
  },
  critical: {
    label: "Critical",
    color: "text-danger-primary",
    bg: "bg-danger-primary/10",
    dot: "bg-danger-primary",
  },
  unknown: {
    label: "No data",
    color: "text-placeholder",
    bg: "bg-layer-2",
    dot: "bg-layer-3",
  },
};
