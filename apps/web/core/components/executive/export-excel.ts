/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Builds the Executive Dashboard's Excel workbook.
 *
 * Design rule: every cell that the dashboard *derives* is written as a live
 * Excel formula referencing its inputs, never as a baked-in number. Efficiency
 * cells point at their own Σ Vf / Σ Vp, scores point at the columns they blend,
 * the index points at its components. The workbook therefore recalculates when
 * a reader edits an input, and every figure can be audited in the formula bar.
 * Only genuinely raw data (counts, point totals, SLA percentages coming from
 * the API) is written as a plain value.
 */

import writeXlsxFile from "write-excel-file/browser";
import type { Cell, Row, Sheet } from "write-excel-file/browser";
import type { IHelpdeskAnalyticsResponse, IKpiOverviewResponse, TKpiIssueStatus } from "@plane/types";
import type { IExecutiveMember, IITGeneralIndex, TExecutivePeriod } from "./helpers";
import { PERIOD_LABELS, PROFILE_CONFIG } from "./helpers";

// ── Payload ────────────────────────────────────────────────────────────────

export interface IExecutiveExportPayload {
  workspaceSlug: string;
  period: TExecutivePeriod;
  customStartDate?: string;
  customEndDate?: string;
  itIndex: IITGeneralIndex;
  members: IExecutiveMember[];
  kpi: IKpiOverviewResponse | undefined;
  helpdesk: IHelpdeskAnalyticsResponse | undefined;
}

/**
 * Drop the given members from every sheet that lists people by name, before
 * the workbook is built. `userId` is the common key across `members` (the
 * Team Performance sheet), `kpi.members` (KPI by Member) and
 * `helpdesk.charts.top_agents` (Helpdesk Agents) -- see IExecutiveMember and
 * buildExecutiveMembers() in helpers.ts. Workspace/project totals are left as
 * returned by the API, since excluding a person for reporting purposes
 * shouldn't silently rewrite the underlying figures they still contributed to.
 */
export function excludeMembersFromExport(
  payload: IExecutiveExportPayload,
  excludedIds: Set<string>
): IExecutiveExportPayload {
  if (excludedIds.size === 0) return payload;
  return {
    ...payload,
    members: payload.members.filter((member) => !excludedIds.has(member.userId)),
    kpi: payload.kpi
      ? { ...payload.kpi, members: payload.kpi.members.filter((member) => !excludedIds.has(member.user_id)) }
      : payload.kpi,
    helpdesk: payload.helpdesk
      ? {
          ...payload.helpdesk,
          charts: {
            ...payload.helpdesk.charts,
            top_agents: payload.helpdesk.charts.top_agents.filter((agent) => !excludedIds.has(agent.agent_id)),
          },
        }
      : payload.helpdesk,
  };
}

// ── Formats ────────────────────────────────────────────────────────────────

/** Percentages here are already on a 0-100 scale, so a literal "%" suffix is
 *  used instead of Excel's `0.0%` format (which would multiply by 100 again). */
const PCT_FORMAT = '0.0"%"';
const POINTS_FORMAT = "0.00";
/** Weights ARE stored as fractions, so the real percent format applies. */
const WEIGHT_FORMAT = "0%";

// ── Theme ──────────────────────────────────────────────────────────────────

const COLOR = {
  title: "#0F172A",
  headerBg: "#1E293B",
  headerText: "#FFFFFF",
  sectionBg: "#E2E8F0",
  band: "#F6F8FB",
  totalBg: "#FEF3C7",
  legendLabelBg: "#F1F5F9",
  border: "#CBD5E1",
  muted: "#475569",
  subtle: "#64748B",
};

const HEIGHT = { title: 24, subtitle: 15, section: 22, header: 34 };

// ── Cell helpers ───────────────────────────────────────────────────────────

const title = (value: string): Cell => ({
  value,
  type: String,
  fontWeight: "bold",
  fontSize: 15,
  textColor: COLOR.title,
  height: HEIGHT.title,
  alignVertical: "center",
});
const section = (value: string): Cell => ({
  value,
  type: String,
  fontWeight: "bold",
  fontSize: 12,
  textColor: COLOR.title,
  backgroundColor: COLOR.sectionBg,
  height: HEIGHT.section,
  alignVertical: "center",
});
/** Table header cell. Numeric columns get `align: "right"` to sit over their values. */
const th = (value: string, align: "left" | "right" = "left"): Cell => ({
  value,
  type: String,
  fontWeight: "bold",
  textColor: COLOR.headerText,
  backgroundColor: COLOR.headerBg,
  borderColor: COLOR.border,
  wrap: true,
  align,
  alignVertical: "bottom",
  height: HEIGHT.header,
});
const thNum = (value: string): Cell => th(value, "right");
/** Row label in a key/value table. */
const key = (value: string): Cell => ({ value, type: String, fontWeight: "bold", textColor: COLOR.title });
const str = (value: string | null | undefined): Cell => (value == null ? null : { value, type: String });
const dim = (value: string | null | undefined): Cell =>
  value == null ? null : { value, type: String, textColor: COLOR.muted };
const num = (value: number | null | undefined, format?: string): Cell =>
  value == null ? null : { value, type: Number, format };
const pct = (value: number | null | undefined): Cell => num(value, PCT_FORMAT);
const pts = (value: number | null | undefined): Cell => num(value, POINTS_FORMAT);

/** A live Excel formula. `expr` is written without the leading "=". */
const fx = (expr: string, format?: string): Cell => ({ value: expr, type: "Formula", format });
const fxPct = (expr: string): Cell => fx(expr, PCT_FORMAT);

const blank: Row = [];

/** Excel caps sheet names at 31 chars and rejects : \ / ? * [ ] */
const sheetName = (name: string) => name.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);

const widths = (values: number[]) => values.map((width) => ({ width }));

/** Copy a cell with extra style properties merged in. `null` becomes a styled empty cell. */
const styled = (cell: Cell, extra: Record<string, unknown>): Cell => {
  const base = cell !== null && cell !== undefined && typeof cell === "object" ? cell : { value: cell ?? null };
  return { ...base, ...extra } as Cell;
};

/** Shade alternating data rows so wide tables stay readable across the page. */
const band = (row: Row, index: number): Row =>
  index % 2 === 0 ? row : row.map((cell) => styled(cell, { backgroundColor: COLOR.band }));

/**
 * Build a row from [cell, columnSpan] pairs. write-excel-file requires the
 * positions a merged cell covers to be present and null, so they are padded in.
 */
const spanned = (parts: [Cell, number][]): Row => {
  const row: Row = [];
  for (const [cell, span] of parts) {
    row.push(span > 1 ? styled(cell, { columnSpan: span }) : cell);
    for (let i = 1; i < span; i += 1) row.push(null);
  }
  return row;
};

/**
 * Merged cells do NOT auto-fit their row height in Excel, so wrapped prose in a
 * merged cell would be clipped. Estimate the height from the text length and the
 * merged width instead (Excel width units are roughly one character each).
 */
const wrappedHeight = (text: string, widthInChars: number): number => {
  const perLine = Math.max(20, widthInChars * 0.98);
  const lines = Math.max(1, Math.ceil(text.length / perLine));
  return Math.min(150, 15 + (lines - 1) * 12.5);
};

/** 0 -> "A", 25 -> "Z", 26 -> "AA" */
function colLetter(index: number): string {
  let letters = "";
  let n = index;
  while (n >= 0) {
    letters = String.fromCharCode((n % 26) + 65) + letters;
    n = Math.floor(n / 26) - 1;
  }
  return letters;
}

const COUNT_KEYS: TKpiIssueStatus[] = ["on_time", "early", "late", "pending"];
const COUNT_LABELS: Record<TKpiIssueStatus, string> = {
  on_time: "On time",
  early: "Early",
  late: "Late",
  pending: "Pending",
};
const countHeaders = (): Row => COUNT_KEYS.map((k) => thNum(COUNT_LABELS[k]));
const countCells = (counts: Record<TKpiIssueStatus, number>): Row => COUNT_KEYS.map((k) => num(counts[k]));

const periodLabel = (period: TExecutivePeriod, start?: string, end?: string) =>
  period === "custom" && start && end ? `Custom (${start} ~ ${end})` : `Last ${PERIOD_LABELS[period]}`;

/** A sheet's title block: heading plus the period it covers. */
const titleBlock = (heading: string, subtitle: string, cols: number[]): Row[] => {
  const totalWidth = cols.reduce((a, b) => a + b, 0);
  return [
    spanned([[title(heading), cols.length]]),
    spanned([
      [
        styled(dim(subtitle), {
          // Merged cells never auto-fit their height, so a long subtitle has to
          // be measured here or Excel would clip it to a single line.
          height: Math.max(HEIGHT.subtitle, wrappedHeight(subtitle, totalWidth)),
          fontStyle: "italic",
          wrap: true,
          alignVertical: "top",
        }),
        cols.length,
      ],
    ]),
    blank,
  ];
};

/**
 * Legend block appended to every sheet, so each one explains itself.
 *
 * The prose is merged across the full sheet width -- otherwise it lands in a
 * column sized for numbers and wraps into a comically tall row.
 */
const legend = (entries: [string, string][], cols: number[]): Row[] => {
  const labelSpan = Math.min(2, Math.max(1, cols.length - 1));
  const labelWidth = cols.slice(0, labelSpan).reduce((a, b) => a + b, 0);

  // Merge across just enough columns for a readable line, rather than the whole
  // sheet -- on the wide sheets that would stretch prose over 240 characters.
  const TARGET_TEXT_WIDTH = 100;
  let textSpan = 0;
  let textWidth = 0;
  while (labelSpan + textSpan < cols.length && textWidth < TARGET_TEXT_WIDTH) {
    textWidth += cols[labelSpan + textSpan];
    textSpan += 1;
  }

  return [
    blank,
    spanned([[section("How to read this sheet"), cols.length]]),
    spanned([
      [th("Column / figure"), labelSpan],
      [th("What it means — and the live formula, where the cell computes one"), textSpan],
    ]),
    ...entries.map(([label, meaning]): Row => {
      const height = Math.max(wrappedHeight(meaning, textWidth), wrappedHeight(label, labelWidth));
      return spanned([
        [
          {
            value: label,
            type: String,
            fontWeight: "bold",
            textColor: COLOR.title,
            backgroundColor: COLOR.legendLabelBg,
            wrap: true,
            alignVertical: "top",
            borderColor: COLOR.border,
            height,
          },
          labelSpan,
        ],
        [
          {
            value: meaning,
            type: String,
            textColor: COLOR.muted,
            wrap: true,
            alignVertical: "top",
            borderColor: COLOR.border,
            height,
          },
          textSpan,
        ],
      ]);
    }),
  ];
};

// ── Sheet 1: Overview (IT General Index) ───────────────────────────────────

const OVERVIEW_COLS = [40, 13, 15, 16, 16, 62];

function buildOverviewSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const { itIndex, kpi, period, workspaceSlug } = payload;

  // Rows are 1-indexed in Excel. Track where the component block lands so the
  // formulas below can reference it.
  const header: Row[] = [
    ...titleBlock(
      "Executive Dashboard — IT General Index",
      `${workspaceSlug} · ${periodLabel(period, payload.customStartDate, payload.customEndDate)}`,
      OVERVIEW_COLS
    ),
    [key("KPI window"), dim(kpi ? `${kpi.period.start ?? "—"} → ${kpi.period.end ?? "—"}` : "—")],
    [key("Generated at"), { value: new Date(), type: Date, format: "yyyy-mm-dd hh:mm", textColor: COLOR.muted }],
    [
      key("Missing indicators"),
      dim(itIndex.missing.length > 0 ? `${itIndex.missing.join(", ")} (weights redistributed)` : "None"),
    ],
    blank,
    spanned([[section("Index components"), OVERVIEW_COLS.length]]),
    [
      th("Indicator"),
      thNum("Value (%)"),
      thNum("Default weight"),
      thNum("Effective weight"),
      thNum("Contribution (%)"),
      th("Source of the value"),
    ],
  ];

  const firstRow = header.length + 1;
  const lastRow = firstRow + itIndex.components.length - 1;
  // Sum of the default weights of the indicators that actually have a value.
  const availableRow = lastRow + 1;

  const sources: Record<string, string> = {
    project_efficiency: "Sector Health → Engineering Efficiency (Σ Vf / Σ Vp, item-weighted)",
    sla_response: "Helpdesk Summary → SLA first response %",
    sla_resolution: "Helpdesk Summary → SLA resolution %",
    backlog: "Sector Health → computed from Total tickets and Open (backlog)",
    resolution_time: "Sector Health → computed from Avg resolution (h)",
  };

  const componentRows = itIndex.components.map((component, idx): Row => {
    const r = firstRow + idx;
    return band(
      [
        key(component.label),
        pct(component.value),
        num(component.weight, WEIGHT_FORMAT),
        // Missing indicators get 0 weight; the rest share the available total.
        fx(`IF(B${r}="",0,C${r}/$C$${availableRow})`, WEIGHT_FORMAT),
        fxPct(`IF(B${r}="",0,B${r}*D${r})`),
        dim(sources[component.key]),
      ],
      idx
    );
  });

  const data: Row[] = [
    ...header,
    ...componentRows,
    [
      dim("Available weight (Σ of weights that have a value)"),
      null,
      fx(`SUMIF(B${firstRow}:B${lastRow},"<>",C${firstRow}:C${lastRow})`, WEIGHT_FORMAT),
      fx(`SUM(D${firstRow}:D${lastRow})`, WEIGHT_FORMAT),
      null,
      dim("Redistribution base — effective weights always sum back to 100%"),
    ],
    [
      { value: "IT GENERAL INDEX", type: String, fontWeight: "bold", backgroundColor: COLOR.totalBg, height: 22 },
      styled(null, { backgroundColor: COLOR.totalBg }),
      styled(null, { backgroundColor: COLOR.totalBg }),
      styled(null, { backgroundColor: COLOR.totalBg }),
      styled(fx(`SUM(E${firstRow}:E${lastRow})`, PCT_FORMAT), {
        backgroundColor: COLOR.totalBg,
        fontWeight: "bold",
        fontSize: 12,
      }),
      styled(dim("= Σ (value × effective weight)"), { backgroundColor: COLOR.totalBg }),
    ],
    ...legend(
      [
        ["Value (%)", "Raw indicator, normalized to 0-100. Edit one and the whole index below recalculates."],
        ["Default weight", "The indicator's designed share of the index. The five sum to 100%."],
        [
          "Effective weight",
          `=IF(B${firstRow}="",0,C${firstRow}/$C$${availableRow}) — an indicator with no data drops to 0 and its share is redistributed across the others, so a missing metric never counts as a zero score.`,
        ],
        ["Contribution (%)", `=IF(B${firstRow}="",0,B${firstRow}*D${firstRow}) — value × effective weight.`],
        ["IT General Index", `=SUM(E${firstRow}:E${lastRow}) — the sum of all contributions.`],
        [
          "Backlog Health",
          "(1 − open tickets ÷ total tickets) × 100. 100% means no open backlog. Computed on the Sector Health sheet.",
        ],
        [
          "Resolution Speed",
          "Average resolution time mapped linearly: 0h = 100%, 48h or more = 0%. Computed on the Sector Health sheet.",
        ],
      ],
      OVERVIEW_COLS
    ),
  ];

  return {
    sheet: sheetName("Overview"),
    data,
    columns: widths(OVERVIEW_COLS),
    stickyRowsCount: header.length,
  };
}

// ── Sheet 2: Sector Health ─────────────────────────────────────────────────

const SECTOR_COLS = [32, 14, 96];

function buildSectorHealthSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const { helpdesk, kpi } = payload;
  const unified = kpi?.unified;

  const head: Row[] = [
    ...titleBlock(
      "Sector Health",
      periodLabel(payload.period, payload.customStartDate, payload.customEndDate),
      SECTOR_COLS
    ),
    spanned([[section("Helpdesk & Support"), SECTOR_COLS.length]]),
    [th("Metric"), thNum("Value"), th("Definition")],
  ];

  // Track the rows the derived Helpdesk metrics depend on.
  const hdFirst = head.length + 1;
  const rowOf = (offset: number) => hdFirst + offset;
  const totalTicketsRow = rowOf(6);
  const openTicketsRow = rowOf(7);
  const avgResolutionRow = rowOf(5);

  const helpdeskRows: Row[] = [
    [
      str("SLA Response (%)"),
      pct(helpdesk?.sla.first_response_pct),
      str("% of tickets first answered within the configured first-response SLA"),
    ],
    [
      str("SLA Resolution (%)"),
      pct(helpdesk?.sla.resolution_pct),
      str("% of tickets resolved within the configured resolution SLA"),
    ],
    [
      str("SLA first-response target (h)"),
      num(helpdesk?.sla.sla_first_response_hours),
      str("Configured threshold, from the portal or the workspace default"),
    ],
    [
      str("SLA resolution target (h)"),
      num(helpdesk?.sla.sla_resolution_hours),
      str("Configured threshold, from the portal or the workspace default"),
    ],
    [
      str("Avg first response (h)"),
      num(helpdesk?.kpis.avg_first_response_hours.current, POINTS_FORMAT),
      str("Mean hours from ticket creation to first agent response"),
    ],
    [
      str("Avg resolution (h)"),
      num(helpdesk?.kpis.avg_resolution_hours.current, POINTS_FORMAT),
      str("Mean hours from ticket creation to resolution"),
    ],
    [str("Total tickets"), num(helpdesk?.kpis.total_requests.current), str("Tickets created in the period")],
    [str("Open (backlog)"), num(helpdesk?.kpis.open_requests.current), str("Tickets still unresolved")],
    [
      str("Resolved"),
      fx(`B${totalTicketsRow}-B${openTicketsRow}`),
      str(`=B${totalTicketsRow}-B${openTicketsRow} — total minus still-open`),
    ],
    [
      str("Backlog Health (%)"),
      fxPct(`IF(B${totalTicketsRow}=0,"",MAX(0,MIN(100,(1-B${openTicketsRow}/B${totalTicketsRow})*100)))`),
      str(`=(1-B${openTicketsRow}/B${totalTicketsRow})*100, clamped to 0-100 — feeds the IT General Index`),
    ],
    [
      str("Resolution Speed (%)"),
      fxPct(`IF(B${avgResolutionRow}="","",MAX(0,MIN(100,(1-B${avgResolutionRow}/48)*100)))`),
      str(`=(1-B${avgResolutionRow}/48)*100, clamped to 0-100 — 0h scores 100%, 48h or worse scores 0%`),
    ],
    [
      str("Helpdesk health badge"),
      fx(
        `IF(AND(B${hdFirst}="",B${hdFirst + 1}=""),"No data",IF(AVERAGE(B${hdFirst}:B${hdFirst + 1})>=90,"Healthy",IF(AVERAGE(B${hdFirst}:B${hdFirst + 1})>=70,"Attention","Critical")))`
      ),
      str("Average of the two SLA percentages: Healthy ≥ 90%, Attention ≥ 70%, Critical below 70%"),
    ],
  ];

  const engHead: Row[] = [
    blank,
    spanned([[section("Engineering & Projects"), SECTOR_COLS.length]]),
    [th("Metric"), thNum("Value"), th("Definition")],
  ];
  const engFirst = hdFirst + helpdeskRows.length + engHead.length;
  const sumVpRow = engFirst + 7;
  const sumVfRow = engFirst + 8;
  const onTimeRow = engFirst + 2;
  const lateRow = engFirst + 3;
  const efficiencyRow = engFirst;

  const engineeringRows: Row[] = [
    [
      str("Efficiency (%)"),
      pct(unified?.kpi != null ? unified.kpi * 100 : null),
      str("Item-weighted mean of project efficiencies — see 'KPI by Project' for the per-project math"),
    ],
    [
      str("Scored items"),
      fx(`B${onTimeRow}+B${lateRow}`),
      str(`=B${onTimeRow}+B${lateRow} — delivered items only; pending items carry no Vp/Vf`),
    ],
    [
      str("On time / Early"),
      num(unified ? unified.counts.on_time + unified.counts.early : null),
      str("Items delivered on or before their target date"),
    ],
    [str("Late"), num(unified?.counts.late), str("Items delivered after their target date")],
    [str("Pending"), num(unified?.counts.pending), str("Open items — counted here, but never in Vp/Vf")],
    [str("Active KPIs"), num(unified?.project_count), str("Projects with the KPI panel enabled")],
    [
      str("Projects in average"),
      num(unified?.projects_in_average),
      str("Projects that actually had scored items in the period"),
    ],
    [
      str("Σ Vp (raw)"),
      pts(unified?.sum_vp_raw),
      str("Mixed point scales across projects — informative only, never the KPI"),
    ],
    [str("Σ Vf (raw)"), pts(unified?.sum_vf_raw), str("Same caveat as Σ Vp — compare Efficiency instead")],
    [
      str("Raw Σ Vf / Σ Vp (%)"),
      fxPct(`IF(B${sumVpRow}=0,"",B${sumVfRow}/B${sumVpRow}*100)`),
      str(
        `=B${sumVfRow}/B${sumVpRow}*100 — shown for reference only. It differs from Efficiency above because that one weights each project equally per item instead of pooling mixed point scales.`
      ),
    ],
    [str("Unassigned items"), num(kpi?.unassigned_count), str("Scored items with no assignee, excluded from members")],
    [
      str("Engineering health badge"),
      fx(
        `IF(B${efficiencyRow}="","No data",IF(B${efficiencyRow}>=90,"Healthy",IF(B${efficiencyRow}>=70,"Attention","Critical")))`
      ),
      str("Same thresholds as the Helpdesk badge, applied to Efficiency"),
    ],
  ];

  // Bold the metric name, mute the definition, and band alternating rows.
  const styleKv = (rows: Row[]): Row[] =>
    rows.map((row, idx) =>
      band(
        row.map((cell, col) => {
          if (col === 0) return styled(cell, { fontWeight: "bold", textColor: COLOR.title });
          if (col === 2) return styled(cell, { textColor: COLOR.muted });
          return cell;
        }),
        idx
      )
    );

  const data: Row[] = [
    ...head,
    ...styleKv(helpdeskRows),
    ...engHead,
    ...styleKv(engineeringRows),
    ...legend(
      [
        ["Plain values", "Raw figures returned by the API — these are the inputs you can edit."],
        [
          "Formula cells",
          "Resolved, Backlog Health, Resolution Speed, Scored items and both badges are computed live.",
        ],
        [
          "Why two efficiency numbers",
          "'Efficiency' is the item-weighted mean of per-project efficiencies (each project scored on its own point scale, then averaged by item count). 'Raw Σ Vf / Σ Vp' pools every project's points into one ratio, which mixes incompatible scales. The dashboard and the index always use the first.",
        ],
      ],
      SECTOR_COLS
    ),
  ];

  return {
    sheet: sheetName("Sector Health"),
    data,
    columns: widths(SECTOR_COLS),
    stickyRowsCount: head.length,
  };
}

// ── Sheet 3: Team Performance ──────────────────────────────────────────────

const TEAM_COLS = [7, 22, 13, 10, 10, 15, 14, 12, 12, 13, 15, 14, 16, 14, 12, 18, 90];

function buildTeamPerformanceSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const head: Row[] = [
    ...titleBlock(
      "Team Performance",
      `${periodLabel(payload.period, payload.customStartDate, payload.customEndDate)} · plain cells are raw API inputs, every other column is a live formula`,
      TEAM_COLS
    ),
    [
      thNum("Rank"),
      th("Member"),
      th("Profile"),
      thNum("Σ Vf"),
      thNum("Σ Vp"),
      thNum("Projects Efficiency (%)"),
      thNum("Delivery Reliability (%)"),
      thNum("Delivered items"),
      thNum("Pending items"),
      thNum("Helpdesk tickets"),
      thNum("SLA first response (%)"),
      thNum("SLA resolution (%)"),
      thNum("Helpdesk Quality (%)"),
      thNum("Project Score (%)"),
      thNum("Final Score"),
      th("Sample Status"),
      th("Score formula for this row"),
    ],
  ];

  const firstRow = head.length + 1;

  const memberRows = payload.members.map((member, idx): Row => {
    const r = firstRow + idx;
    // Column map: D=ΣVf E=ΣVp F=ProjEff G=DeliveryRel H=delivered I=pending J=tickets
    //             K=slaFR L=slaRes M=HdEff N=ProjScore O=FinalScore P=SampleStatus Q=Explanation
    const projEff = `IF(E${r}=0,"",D${r}/E${r}*100)`;
    const hdEff = `IF(COUNT(K${r}:L${r})=0,"",AVERAGE(K${r}:L${r}))`;

    let score: string;
    let explanation: string;
    if (member.profile === "development") {
      score = `IF(N${r}="",0,N${r})`;
      explanation = `=N${r} — Development profile is scored on multi-factor Project Score (Efficiency, Throughput, and Delivery Reliability).`;
    } else if (member.profile === "helpdesk") {
      score = `IF(M${r}="",0,M${r})`;
      explanation = `=M${r} — Helpdesk profile is scored on Helpdesk Quality SLA compliance.`;
    } else if (member.hdScore == null) {
      score = `IF(N${r}="",0,N${r})`;
      explanation = `=N${r} — Hybrid, but no Helpdesk SLA score is available, so all weight goes to Projects.`;
    } else if (member.kpiScore == null) {
      score = `IF(M${r}="",0,M${r})`;
      explanation = `=M${r} — Hybrid, but no Projects score is available, so all weight goes to Helpdesk.`;
    } else {
      score = `AVERAGE(N${r},M${r})`;
      explanation = `=50%×Project Score + 50%×Helpdesk Quality — Hybrid score blend using fixed 50/50 balance.`;
    }

    const sampleStatusText = member.sampleStatus === "sufficient" ? "Sufficient" : "Insufficient sample";

    return band(
      [
        member.rank != null ? num(member.rank) : str("—"),
        key(member.displayName),
        dim(PROFILE_CONFIG[member.profile].label),
        pts(member.sumVf),
        pts(member.sumVp),
        fxPct(projEff),
        pct(member.deliveryReliability),
        num(member.kpiScoredItems),
        num(member.kpiPendingItems),
        num(member.hdTickets),
        pct(member.hdSlaFirstResponse),
        pct(member.hdSlaResolution),
        fxPct(hdEff),
        pct(member.kpiScore),
        styled(fxPct(score), { fontWeight: "bold" }),
        str(sampleStatusText),
        dim(explanation),
      ],
      idx
    );
  });

  const data: Row[] = [
    ...head,
    ...memberRows,
    ...legend(
      [
        ["Σ Vf, Σ Vp", "Raw point totals over this member's delivered work items."],
        [
          "Projects Efficiency (%)",
          `=IF(E${firstRow}=0,"",D${firstRow}/E${firstRow}*100) — Σ Vf ÷ Σ Vp. Independent of volume, measuring overall delay penalties.`,
        ],
        ["Delivery Reliability (%)", "Percentage of delivered items completed on time or early."],
        [
          "Helpdesk Quality (%)",
          `=IF(COUNT(K${firstRow}:L${firstRow})=0,"",AVERAGE(K${firstRow}:L${firstRow})) — weighted average of SLA compliance percentages.`,
        ],
        [
          "Sample Status",
          "Sufficient = cleared minimum sample threshold (default: 5 delivered project items or 10 Helpdesk tickets). Insufficient sample = sample too small for official ranking.",
        ],
        ["Final Score", "Composite score based on member profile and configurable KPI settings."],
      ],
      TEAM_COLS
    ),
  ];

  return {
    sheet: sheetName("Team Performance"),
    data,
    columns: widths(TEAM_COLS),
    stickyRowsCount: head.length,
    stickyColumnsCount: 2,
  };
}

// ── Sheet 4: KPI by project ────────────────────────────────────────────────

const PROJECT_COLS = [28, 12, 10, 10, 14, 12, 16, 10, 9, 8, 10, 14, 8, 22];

function buildKpiProjectSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const projects = payload.kpi?.projects ?? [];

  const head: Row[] = [
    ...titleBlock(
      "KPI by Project",
      periodLabel(payload.period, payload.customStartDate, payload.customEndDate),
      PROJECT_COLS
    ),
    (
      [
        th("Project"),
        th("Identifier"),
        thNum("Σ Vp"),
        thNum("Σ Vf"),
        thNum("Efficiency (%)"),
        thNum("Scored items"),
        thNum("Contribution (%)"),
      ] as Row
    ).concat(countHeaders(), [th("Penalty mode"), thNum("k"), th("Config")]),
  ];

  const firstRow = head.length + 1;
  const lastRow = firstRow + Math.max(projects.length - 1, 0);
  const totalRow = lastRow + 1;

  const projectRows = projects.map((project, idx): Row => {
    const r = firstRow + idx;
    // C=ΣVp D=ΣVf E=efficiency F=scored G=contribution
    return band(
      (
        [
          key(project.name),
          dim(project.identifier),
          pts(project.sum_vp),
          pts(project.sum_vf),
          fxPct(`IF(C${r}=0,"",D${r}/C${r}*100)`),
          num(project.scored_items),
          fxPct(`IF(OR(E${r}="",$F$${totalRow}=0),"",E${r}*F${r}/$F$${totalRow})`),
        ] as Row
      ).concat(countCells(project.counts), [
        dim(project.penalty_mode),
        num(project.k),
        dim(project.inherited_config ? "Inherited from workspace" : "Project-specific"),
      ]),
      idx
    );
  });

  // With no projects there is nothing to total, and a TOTAL row would land on
  // `firstRow` and sum itself into a circular reference.
  const totalRows: Row[] =
    projects.length === 0
      ? []
      : [
          (
            [
              { value: "TOTAL / UNIFIED KPI", type: String, fontWeight: "bold" } as Cell,
              null,
              fx(`SUM(C${firstRow}:C${lastRow})`, POINTS_FORMAT),
              fx(`SUM(D${firstRow}:D${lastRow})`, POINTS_FORMAT),
              fxPct(`SUM(G${firstRow}:G${lastRow})`),
              fx(`SUM(F${firstRow}:F${lastRow})`),
              fxPct(`SUM(G${firstRow}:G${lastRow})`),
            ] as Row
          )
            .concat(
              COUNT_KEYS.map((_, i) => fx(`SUM(${colLetter(7 + i)}${firstRow}:${colLetter(7 + i)}${lastRow})`)),
              [null, null, null]
            )
            .map((cell) => styled(cell, { backgroundColor: COLOR.totalBg, fontWeight: "bold" })),
        ];

  const data: Row[] = [
    ...head,
    ...projectRows,
    ...totalRows,
    ...legend(
      [
        ["Efficiency (%)", `=IF(C${firstRow}=0,"",D${firstRow}/C${firstRow}*100) — the project's own Σ Vf ÷ Σ Vp.`],
        [
          "Contribution (%)",
          `=E${firstRow}*F${firstRow}/$F$${totalRow} — the project's efficiency weighted by its share of all scored items. The contributions add up to the Unified Workspace KPI in the TOTAL row, which is what 'Project Efficiency' on the Overview sheet uses.`,
        ],
        [
          "Σ Vp / Σ Vf in the TOTAL row",
          "Summed for reference only. Projects can use different point scales, so this pooled ratio is NOT the workspace KPI — the item-weighted contribution total is.",
        ],
        [
          "Penalty mode / k",
          "The project's KPI configuration: how fast a late item loses value, and the smoothing factor.",
        ],
        ["Config", "Whether the project uses its own KPI configuration or inherits the workspace default."],
      ],
      PROJECT_COLS
    ),
  ];

  return {
    sheet: sheetName("KPI by Project"),
    data,
    columns: widths(PROJECT_COLS),
    stickyRowsCount: head.length,
    stickyColumnsCount: 2,
  };
}

// ── Sheet 5: KPI by member ─────────────────────────────────────────────────

const MEMBER_COLS = [24, 10, 10, 14, 10, 9, 8, 10, 14, 11];

function buildKpiMemberSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const members = payload.kpi?.members ?? [];

  const head: Row[] = [
    ...titleBlock(
      "KPI by Member",
      `${periodLabel(payload.period, payload.customStartDate, payload.customEndDate)} · Vp and Vf are split equally between a work item's assignees, so totals can be fractional`,
      MEMBER_COLS
    ),
    ([th("Member"), thNum("Σ Vp"), thNum("Σ Vf"), thNum("Efficiency (%)")] as Row).concat(countHeaders(), [
      thNum("Delivered items"),
      thNum("Total items"),
    ]),
  ];

  const firstRow = head.length + 1;

  const memberRows = members.map((member, idx): Row => {
    const r = firstRow + idx;
    // B=ΣVp C=ΣVf D=eff E=on_time F=early G=late H=pending I=delivered J=total
    return band(
      (
        [
          key(member.display_name),
          pts(member.sum_vp),
          pts(member.sum_vf),
          fxPct(`IF(B${r}=0,"",C${r}/B${r}*100)`),
        ] as Row
      ).concat(countCells(member.counts), [fx(`E${r}+F${r}+G${r}`), fx(`I${r}+H${r}`)]),
      idx
    );
  });

  const data: Row[] = [
    ...head,
    ...memberRows,
    blank,
    [key("Unassigned scored items"), num(payload.kpi?.unassigned_count)],
    ...legend(
      [
        [
          "Efficiency (%)",
          `=IF(B${firstRow}=0,"",C${firstRow}/B${firstRow}*100) — Σ Vf ÷ Σ Vp. The one figure comparable between members.`,
        ],
        ["Delivered items", `=E${firstRow}+F${firstRow}+G${firstRow} — on time + early + late.`],
        [
          "Total items",
          `=I${firstRow}+H${firstRow} — delivered plus pending. Pending items are shown for visibility but contribute no Vp and no Vf, so an open backlog cannot lower Efficiency.`,
        ],
        [
          "Unassigned scored items",
          "Delivered work items with no assignee. They count toward the project and workspace figures but appear against no member.",
        ],
      ],
      MEMBER_COLS
    ),
  ];

  return {
    sheet: sheetName("KPI by Member"),
    data,
    columns: widths(MEMBER_COLS),
    stickyRowsCount: head.length,
    stickyColumnsCount: 1,
  };
}

// ── Sheet 6: Helpdesk summary ──────────────────────────────────────────────

const HD_SUMMARY_COLS = [30, 13, 13, 88];

function buildHelpdeskSummarySheet(payload: IExecutiveExportPayload): Sheet<never> {
  const hd = payload.helpdesk;
  const kpis = hd?.kpis;

  const metricRows: { label: string; key: keyof NonNullable<typeof kpis>; format?: string }[] = [
    { label: "Total requests", key: "total_requests" },
    { label: "Open requests", key: "open_requests" },
    { label: "Resolved requests", key: "resolved_requests" },
    { label: "Avg first response (h)", key: "avg_first_response_hours", format: POINTS_FORMAT },
    { label: "Avg resolution (h)", key: "avg_resolution_hours", format: POINTS_FORMAT },
  ];

  const head: Row[] = [
    ...titleBlock(
      "Helpdesk Analytics — Summary",
      periodLabel(payload.period, payload.customStartDate, payload.customEndDate),
      HD_SUMMARY_COLS
    ),
    spanned([[section("Key metrics vs. the previous period of the same length"), HD_SUMMARY_COLS.length]]),
    [th("Metric"), thNum("Current"), thNum("Previous"), thNum("Change (%)")],
  ];

  const firstMetricRow = head.length + 1;

  const data: Row[] = [
    ...head,
    ...metricRows.map(({ label, key: metricKey, format }, idx): Row => {
      const r = firstMetricRow + idx;
      const metric = kpis?.[metricKey];
      return band(
        [
          key(label),
          num(metric?.current, format),
          num(metric?.previous, format),
          fxPct(`IF(OR(C${r}="",C${r}=0),"",(B${r}-C${r})/C${r}*100)`),
        ],
        idx
      );
    }),
    blank,
    spanned([[section("SLA compliance"), HD_SUMMARY_COLS.length]]),
    [th("Metric"), thNum("Value"), th("Notes")],
    ...[
      [key("First response (%)"), pct(hd?.sla.first_response_pct), dim("Share of tickets meeting the response SLA")],
      [key("Resolution (%)"), pct(hd?.sla.resolution_pct), dim("Share of tickets meeting the resolution SLA")],
      [
        key("First response target (h)"),
        num(hd?.sla.sla_first_response_hours),
        dim("The threshold being measured against"),
      ],
      [key("Resolution target (h)"), num(hd?.sla.sla_resolution_hours), dim("The threshold being measured against")],
      [
        key("Scope"),
        dim(hd?.sla.scope),
        dim("portal / workspace_default / ambiguous — which configuration was applied"),
      ],
      [key("Historical cutoff"), dim(hd?.sla.historical_cutoff), dim(hd?.sla.historical_note)],
    ].map((row, idx) => band(row, idx)),
    blank,
    spanned([[section("Requests by status"), HD_SUMMARY_COLS.length]]),
    [th("Status"), thNum("Count")],
    ...(hd?.charts.by_status ?? []).map((point, idx): Row => band([key(point.status_name), num(point.count)], idx)),
    blank,
    spanned([[section("Requests by source"), HD_SUMMARY_COLS.length]]),
    [th("Source"), thNum("Count")],
    ...(hd?.charts.by_source ?? []).map((point, idx): Row => band([key(point.source), num(point.count)], idx)),
    ...legend(
      [
        [
          "Change (%)",
          `=(B${firstMetricRow}-C${firstMetricRow})/C${firstMetricRow}*100 — current vs. the immediately preceding window of the same length. Blank when there is no previous value to compare against.`,
        ],
        [
          "SLA percentages",
          "Share of tickets whose first response / resolution landed inside the configured threshold, measured from ticket creation.",
        ],
        [
          "Scope",
          "'portal' means a portal-specific SLA was used; 'workspace_default' the workspace fallback; 'ambiguous' means tickets spanned portals with differing SLAs.",
        ],
        [
          "Historical cutoff",
          "Tickets created before this date predate SLA tracking and are excluded from the percentages.",
        ],
      ],
      HD_SUMMARY_COLS
    ),
  ];

  return {
    sheet: sheetName("Helpdesk Summary"),
    data,
    columns: widths(HD_SUMMARY_COLS),
    stickyRowsCount: head.length,
  };
}

// ── Sheet 7: Helpdesk agents ───────────────────────────────────────────────

const HD_AGENT_COLS = [24, 10, 20, 18, 22];

function buildHelpdeskAgentsSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const agents = payload.helpdesk?.charts.top_agents ?? [];

  const head: Row[] = [
    ...titleBlock(
      "Helpdesk — Agent Performance",
      periodLabel(payload.period, payload.customStartDate, payload.customEndDate),
      HD_AGENT_COLS
    ),
    [
      th("Agent"),
      thNum("Tickets"),
      thNum("SLA first response (%)"),
      thNum("SLA resolution (%)"),
      thNum("Helpdesk Efficiency (%)"),
    ],
  ];

  const firstRow = head.length + 1;

  const data: Row[] = [
    ...head,
    ...agents.map((agent, idx): Row => {
      const r = firstRow + idx;
      return band(
        [
          key(agent.display_name),
          num(agent.count),
          pct(agent.sla_first_response_pct),
          pct(agent.sla_resolution_pct),
          styled(fxPct(`IF(COUNT(C${r}:D${r})=0,"",AVERAGE(C${r}:D${r}))`), { fontWeight: "bold" }),
        ],
        idx
      );
    }),
    ...legend(
      [
        [
          "Helpdesk Efficiency (%)",
          `=IF(COUNT(C${firstRow}:D${firstRow})=0,"",AVERAGE(C${firstRow}:D${firstRow})) — the average of the two SLA percentages, and nothing else.`,
        ],
        [
          "Tickets",
          "Volume, shown as context only. It never enters the efficiency formula: resolving 1 ticket within SLA scores the same as resolving 20 within SLA, and resolving many late tickets does not score higher for being many.",
        ],
        [
          "Where volume does matter",
          "Only in the Hybrid blend on the Team Performance sheet, where ticket count decides how much of a person's score comes from Helpdesk versus Projects — not how good that score is.",
        ],
      ],
      HD_AGENT_COLS
    ),
  ];

  return {
    sheet: sheetName("Helpdesk Agents"),
    data,
    columns: widths(HD_AGENT_COLS),
    stickyRowsCount: head.length,
  };
}

// ── Sheet 8: Helpdesk trends ───────────────────────────────────────────────

const TRENDS_COLS = [16, 18, 20];

function buildHelpdeskTrendsSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const charts = payload.helpdesk?.charts;

  // The two series share a date axis but are emitted independently, so they are
  // keyed by date rather than zipped positionally.
  const byDate = new Map<string, { count: number | null; avgHours: number | null }>();
  for (const point of charts?.requests_over_time ?? []) {
    byDate.set(point.date, { count: point.count, avgHours: null });
  }
  for (const point of charts?.resolution_time_trend ?? []) {
    const existing = byDate.get(point.date);
    if (existing) existing.avgHours = point.avg_hours;
    else byDate.set(point.date, { count: null, avgHours: point.avg_hours });
  }

  const head: Row[] = [
    ...titleBlock(
      "Helpdesk — Trends",
      periodLabel(payload.period, payload.customStartDate, payload.customEndDate),
      TRENDS_COLS
    ),
    [th("Date"), thNum("Requests created"), thNum("Avg resolution (h)")],
  ];

  const firstRow = head.length + 1;
  const sortedDates: string[] = Array.from(byDate.keys());
  sortedDates.sort((a: string, b: string) => a.localeCompare(b));
  const entries: [string, { count: number | null; avgHours: number | null }][] = sortedDates.map((d: string) => [
    d,
    byDate.get(d)!,
  ]);
  const lastRow = firstRow + Math.max(entries.length - 1, 0);

  const data: Row[] = [
    ...head,
    ...entries.map(
      ([date, point], idx): Row => band([key(date), num(point.count), num(point.avgHours, POINTS_FORMAT)], idx)
    ),
    // Skipped when there is no data, so the totals never reference themselves.
    ...(entries.length === 0
      ? []
      : [
          [
            { value: "TOTAL / AVERAGE", type: String, fontWeight: "bold", backgroundColor: COLOR.totalBg } as Cell,
            styled(fx(`SUM(B${firstRow}:B${lastRow})`), { backgroundColor: COLOR.totalBg, fontWeight: "bold" }),
            styled(fx(`IF(COUNT(C${firstRow}:C${lastRow})=0,"",AVERAGE(C${firstRow}:C${lastRow}))`, POINTS_FORMAT), {
              backgroundColor: COLOR.totalBg,
              fontWeight: "bold",
            }),
          ],
        ]),
    ...legend(
      [
        ["Requests created", "Tickets opened on that date. The TOTAL row sums the column."],
        [
          "Avg resolution (h)",
          "Mean hours to resolve, for tickets resolved on that date. Blank days had no resolutions, and are excluded from the average rather than counted as zero.",
        ],
        [
          "Using this sheet",
          "Select the two columns and insert a line chart to reproduce the two trend charts on the dashboard.",
        ],
      ],
      TRENDS_COLS
    ),
  ];

  return {
    sheet: sheetName("Helpdesk Trends"),
    data,
    columns: widths(TRENDS_COLS),
    stickyRowsCount: head.length,
  };
}

// ── Sheet 9: Methodology ───────────────────────────────────────────────────

const METHOD_COLS = [24, 58, 92];

function buildMethodologySheet(): Sheet<never> {
  const rows: [string, string, string][] = [
    [
      "Planned Value (Vp)",
      "Vp = Difficulty + Repetitive + Importance + Type",
      "The base worth of a work item. Difficulty and Repetitive come from the project's estimate systems, Importance from the item's priority, Type from its work item type.",
    ],
    [
      "Delay (d)",
      "d = completed date − target date, in days",
      "Negative means early, 0 on time, positive late. Counted in calendar or business days depending on the project's KPI configuration.",
    ],
    [
      "Penalty multiplier (p)",
      "t = 1 − (b × d);  continuous: p = MAX(0,t) + k × MIN(0,t);  dead zone: p = MAX(0, 1 − b×d) + MIN(0, 1 − k×b×d)",
      "b is the priority level's penalty factor — higher priority loses value faster when late. k is the smoothing factor that governs how far below zero the score may fall.",
    ],
    [
      "Final Value (Vf)",
      "Vf = Vp × p",
      "Only delivered items produce a Vf. An item that is still open — even if long overdue — contributes neither Vp nor Vf; it appears only in the Pending count.",
    ],
    [
      "Efficiency",
      "Efficiency = Σ Vf ÷ Σ Vp",
      "Independent of point scale and of volume, which is what makes it comparable across projects and across people. Used live on the KPI by Project, KPI by Member and Team Performance sheets.",
    ],
    [
      "Σ Vp and Σ Vf",
      "Raw sums over delivered items",
      "They scale with how much was delivered, not how well. 100 delivered items will out-total 15 even if the second person was never late. Use them for magnitude, never head to head.",
    ],
    [
      "Unified Workspace KPI",
      "Σ (project efficiency × project scored items ÷ total scored items)",
      "The item-weighted mean of project efficiencies. Computed live in the TOTAL row of the KPI by Project sheet.",
    ],
    [
      "Multiple assignees",
      "Vp and Vf are divided equally among a work item's assignees",
      "Which is why per-member point totals can be fractional.",
    ],
    [
      "IT General Index",
      "Index = Σ (indicator value × effective weight)",
      "Default weights: Project Efficiency 35%, SLA First Response 25%, SLA Resolution 20%, Backlog Health 10%, Resolution Speed 10%.",
    ],
    [
      "Weight redistribution",
      "effective weight = default weight ÷ Σ (default weights that have a value)",
      "An indicator with no data drops to zero weight and its share is spread proportionally over the rest, so a missing metric never behaves like a score of zero.",
    ],
    ["Backlog Health", "(1 − open ÷ total) × 100", "100% means no open backlog. Clamped to the 0-100 range."],
    ["Resolution Speed", "(1 − avg resolution hours ÷ 48) × 100", "0h scores 100%, 48h or worse scores 0%. Clamped."],
    [
      "Health badges",
      "≥ 90 Healthy · ≥ 70 Attention · < 70 Critical",
      "Applied to the Helpdesk SLA average and to Engineering Efficiency on the Sector Health sheet.",
    ],
    [
      "Member profile",
      "Hybrid = KPI work AND ≥ 3 tickets · Helpdesk = ≥ 3 tickets, no KPI work · Development = KPI work, < 3 tickets",
      "The 3-ticket floor keeps a couple of incidental support tickets from reclassifying an engineer as a Helpdesk agent.",
    ],
    [
      "Helpdesk Efficiency",
      "AVERAGE(SLA first response %, SLA resolution %)",
      "A quality measure. Ticket volume is deliberately excluded: 1 ticket within SLA scores the same as 20 within SLA.",
    ],
    [
      "Projects Efficiency",
      "Σ Vf ÷ Σ Vp for that member's own items",
      "Identical to the Efficiency column on the KPI page inside Plane.",
    ],
    [
      "Final Score",
      "Development: Projects · Helpdesk: Helpdesk · Hybrid: Helpdesk×(tickets ÷ (tickets+delivered)) + Projects×(delivered ÷ (tickets+delivered))",
      "The Hybrid blend follows real work volume rather than a flat 50/50. If one side has no score at all, the whole weight moves to the other side instead of scoring the missing side as zero.",
    ],
    [
      "Workload",
      "delivered items + pending items + Helpdesk tickets",
      "Context only. It is deliberately absent from every score formula, so carrying a heavier load can never lower a ranking.",
    ],
  ];

  const head: Row[] = [
    ...titleBlock(
      "Methodology — every formula used in this workbook",
      "Figures in the other sheets are live Excel formulas wherever they are derived: edit an input and the dependent cells recalculate, or click any derived cell to read its formula in the formula bar.",
      METHOD_COLS
    ),
    [th("Concept"), th("Formula"), th("What it means and why")],
  ];

  const data: Row[] = [
    ...head,
    ...rows.map(([concept, formula, meaning], idx): Row => {
      // Wrapped prose in a merged-free cell auto-fits, but the two columns can
      // disagree on how many lines they need -- take the taller of the two.
      const height = Math.max(wrappedHeight(formula, METHOD_COLS[1]), wrappedHeight(meaning, METHOD_COLS[2]));
      return band(
        [
          styled(key(concept), { wrap: true, alignVertical: "top", height, borderColor: COLOR.border }),
          styled(dim(formula), {
            wrap: true,
            alignVertical: "top",
            fontFamily: "Consolas",
            borderColor: COLOR.border,
          }),
          styled(dim(meaning), { wrap: true, alignVertical: "top", borderColor: COLOR.border }),
        ],
        idx
      );
    }),
  ];

  return {
    sheet: sheetName("Methodology"),
    data,
    columns: widths(METHOD_COLS),
    stickyRowsCount: head.length,
  };
}

// ── Entry point ────────────────────────────────────────────────────────────

/** Split out from the download so the workbook can be built and inspected in tests. */
export function buildExecutiveSheets(payload: IExecutiveExportPayload): Sheet<never>[] {
  return [
    buildOverviewSheet(payload),
    buildSectorHealthSheet(payload),
    buildTeamPerformanceSheet(payload),
    buildKpiProjectSheet(payload),
    buildKpiMemberSheet(payload),
    buildHelpdeskSummarySheet(payload),
    buildHelpdeskAgentsSheet(payload),
    buildHelpdeskTrendsSheet(payload),
    buildMethodologySheet(),
  ];
}

export async function exportExecutiveExcel(payload: IExecutiveExportPayload): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  await writeXlsxFile(buildExecutiveSheets(payload), { fontFamily: "Calibri", fontSize: 11 }).toFile(
    `${payload.workspaceSlug}-executive-dashboard-${payload.period}-${stamp}.xlsx`
  );
}
