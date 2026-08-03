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
import type { IExecutiveMember, IITGeneralIndex } from "./helpers";
import { PROFILE_CONFIG } from "./helpers";

// ── Payload ────────────────────────────────────────────────────────────────

export interface IExecutiveExportPayload {
  workspaceSlug: string;
  period: "30d" | "90d";
  itIndex: IITGeneralIndex;
  members: IExecutiveMember[];
  kpi: IKpiOverviewResponse | undefined;
  helpdesk: IHelpdeskAnalyticsResponse | undefined;
}

// ── Formats ────────────────────────────────────────────────────────────────

/** Percentages here are already on a 0-100 scale, so a literal "%" suffix is
 *  used instead of Excel's `0.0%` format (which would multiply by 100 again). */
const PCT_FORMAT = '0.0"%"';
const POINTS_FORMAT = "0.00";
/** Weights ARE stored as fractions, so the real percent format applies. */
const WEIGHT_FORMAT = "0%";

// ── Cell helpers ───────────────────────────────────────────────────────────

const title = (value: string): Cell => ({ value, type: String, fontWeight: "bold", fontSize: 14 });
const section = (value: string): Cell => ({ value, type: String, fontWeight: "bold", fontSize: 12 });
const th = (value: string): Cell => ({
  value,
  type: String,
  fontWeight: "bold",
  backgroundColor: "#EEF2F7",
  borderColor: "#CBD5E1",
  wrap: true,
  alignVertical: "bottom",
});
const str = (value: string | null | undefined): Cell => (value == null ? null : { value, type: String });
const note = (value: string): Cell => ({ value, type: String, wrap: true, alignVertical: "top", textColor: "#475569" });
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

const widths = (...values: number[]) => values.map((width) => ({ width }));

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
const countHeaders = (): Row => COUNT_KEYS.map((key) => th(COUNT_LABELS[key]));
const countCells = (counts: Record<TKpiIssueStatus, number>): Row => COUNT_KEYS.map((key) => num(counts[key]));

const periodLabel = (period: "30d" | "90d") => (period === "30d" ? "Last 30 days" : "Last 90 days");

/** Legend block appended under every sheet, so each one explains itself. */
const legend = (entries: [string, string][]): Row[] => [
  blank,
  [section("How to read this sheet")],
  [th("Column / figure"), th("Meaning — and, where it is computed, the live formula in that cell")],
  ...entries.map(([label, meaning]): Row => [str(label), note(meaning)]),
];

// ── Sheet 1: Overview (IT General Index) ───────────────────────────────────

function buildOverviewSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const { itIndex, kpi, period, workspaceSlug } = payload;

  // Rows are 1-indexed in Excel. Track where the component block lands so the
  // formulas below can reference it.
  const header: Row[] = [
    [title("Executive Dashboard — IT General Index")],
    [str("Workspace"), str(workspaceSlug)],
    [str("Period"), str(periodLabel(period))],
    [str("KPI window"), str(kpi ? `${kpi.period.start ?? "—"} → ${kpi.period.end ?? "—"}` : "—")],
    [str("Generated at"), { value: new Date(), type: Date, format: "yyyy-mm-dd hh:mm" }],
    [
      str("Missing indicators"),
      str(itIndex.missing.length > 0 ? `${itIndex.missing.join(", ")} (weights redistributed)` : "None"),
    ],
    blank,
    [section("Index components")],
    [
      th("Indicator"),
      th("Value (%)"),
      th("Default weight"),
      th("Effective weight"),
      th("Contribution (%)"),
      th("Source of the value"),
    ],
  ];

  const firstRow = header.length + 1;
  const lastRow = firstRow + itIndex.components.length - 1;
  // Sum of the default weights of the indicators that actually have a value.
  const availableRow = lastRow + 1;
  const indexRow = availableRow + 1;

  const sources: Record<string, string> = {
    project_efficiency: "Sector Health → Engineering Efficiency (Σ Vf / Σ Vp, item-weighted)",
    sla_response: "Helpdesk Summary → SLA first response %",
    sla_resolution: "Helpdesk Summary → SLA resolution %",
    backlog: "Sector Health → computed from Total tickets and Open (backlog)",
    resolution_time: "Sector Health → computed from Avg resolution (h)",
  };

  const componentRows = itIndex.components.map((component, idx): Row => {
    const r = firstRow + idx;
    return [
      str(component.label),
      pct(component.value),
      num(component.weight, WEIGHT_FORMAT),
      // Missing indicators get 0 weight; the rest share the available total.
      fx(`IF(B${r}="",0,C${r}/$C$${availableRow})`, WEIGHT_FORMAT),
      fxPct(`IF(B${r}="",0,B${r}*D${r})`),
      str(sources[component.key]),
    ];
  });

  const data: Row[] = [
    ...header,
    ...componentRows,
    [
      str("Available weight (Σ of weights that have a value)"),
      null,
      fx(`SUMIF(B${firstRow}:B${lastRow},"<>",C${firstRow}:C${lastRow})`, WEIGHT_FORMAT),
      fx(`SUM(D${firstRow}:D${lastRow})`, WEIGHT_FORMAT),
      null,
      str("Redistribution base — effective weights always sum back to 100%"),
    ],
    [
      { value: "IT GENERAL INDEX", type: String, fontWeight: "bold" },
      null,
      null,
      null,
      fx(`SUM(E${firstRow}:E${lastRow})`, PCT_FORMAT),
      str("= Σ (value × effective weight)"),
    ],
    ...legend([
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
    ]),
  ];

  return { sheet: sheetName("Overview"), data, columns: widths(46, 14, 15, 16, 17, 70) };
}

// ── Sheet 2: Sector Health ─────────────────────────────────────────────────

function buildSectorHealthSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const { helpdesk, kpi } = payload;
  const unified = kpi?.unified;

  const head: Row[] = [
    [title("Sector Health")],
    [str("Period"), str(periodLabel(payload.period))],
    blank,
    [section("Helpdesk & Support")],
    [th("Metric"), th("Value"), th("Definition")],
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

  const engHead: Row[] = [blank, [section("Engineering & Projects")], [th("Metric"), th("Value"), th("Definition")]];
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

  const data: Row[] = [
    ...head,
    ...helpdeskRows,
    ...engHead,
    ...engineeringRows,
    ...legend([
      ["Plain values", "Raw figures returned by the API — these are the inputs you can edit."],
      ["Formula cells", "Resolved, Backlog Health, Resolution Speed, Scored items and both badges are computed live."],
      [
        "Why two efficiency numbers",
        "'Efficiency' is the item-weighted mean of per-project efficiencies (each project scored on its own point scale, then averaged by item count). 'Raw Σ Vf / Σ Vp' pools every project's points into one ratio, which mixes incompatible scales. The dashboard and the index always use the first.",
      ],
    ]),
  ];

  return { sheet: sheetName("Sector Health"), data, columns: widths(34, 14, 96) };
}

// ── Sheet 3: Team Performance ──────────────────────────────────────────────

function buildTeamPerformanceSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const head: Row[] = [
    [title("Team Performance")],
    [str("Period"), str(periodLabel(payload.period))],
    [
      str("Note"),
      str("Grey columns are raw inputs from the API. Every other column is a live formula — click a cell to see it."),
    ],
    blank,
    [
      th("Rank"),
      th("Member"),
      th("Profile"),
      th("Σ Vf"),
      th("Σ Vp"),
      th("Projects Efficiency (%)"),
      th("Delivered items"),
      th("Pending items"),
      th("Helpdesk tickets"),
      th("SLA first response (%)"),
      th("SLA resolution (%)"),
      th("Helpdesk Efficiency (%)"),
      th("Workload"),
      th("Score"),
      th("Score formula for this row"),
    ],
  ];

  const firstRow = head.length + 1;

  const memberRows = payload.members.map((member, idx): Row => {
    const r = firstRow + idx;
    // Column map: D=ΣVf E=ΣVp F=ProjEff G=delivered H=pending I=tickets
    //             J=slaFR K=slaRes L=HdEff M=workload N=score
    const projEff = `IF(E${r}=0,"",D${r}/E${r}*100)`;
    const hdEff = `IF(COUNT(J${r}:K${r})=0,"",AVERAGE(J${r}:K${r}))`;
    const workload = `G${r}+H${r}+I${r}`;

    let score: string;
    let explanation: string;
    if (member.profile === "development") {
      score = `IF(F${r}="",0,F${r})`;
      explanation = `=F${r} — Development profile is scored purely on Projects Efficiency.`;
    } else if (member.profile === "helpdesk") {
      score = `IF(L${r}="",0,L${r})`;
      explanation = `=L${r} — Helpdesk profile is scored purely on Helpdesk Efficiency.`;
    } else if (member.hdScore == null) {
      score = `IF(F${r}="",0,F${r})`;
      explanation = `=F${r} — Hybrid, but no Helpdesk SLA score is available, so all weight goes to Projects instead of scoring the missing side as zero.`;
    } else if (member.kpiScore == null) {
      score = `IF(L${r}="",0,L${r})`;
      explanation = `=L${r} — Hybrid, but no Projects efficiency is available, so all weight goes to Helpdesk.`;
    } else {
      score = `IF(I${r}+G${r}=0,AVERAGE(L${r},F${r}),L${r}*(I${r}/(I${r}+G${r}))+F${r}*(G${r}/(I${r}+G${r})))`;
      explanation = `=Helpdesk×(tickets÷(tickets+delivered)) + Projects×(delivered÷(tickets+delivered)) — the blend follows actual work volume, so the side where this person does more work counts more.`;
    }

    return [
      num(idx + 1),
      str(member.displayName),
      str(PROFILE_CONFIG[member.profile].label),
      pts(member.sumVf),
      pts(member.sumVp),
      fxPct(projEff),
      num(member.kpiScoredItems),
      num(member.kpiPendingItems),
      num(member.hdTickets),
      pct(member.hdSlaFirstResponse),
      pct(member.hdSlaResolution),
      fxPct(hdEff),
      fx(workload),
      fxPct(score),
      str(explanation),
    ];
  });

  const data: Row[] = [
    ...head,
    ...memberRows,
    ...legend([
      ["Σ Vf, Σ Vp", "Raw point totals over this member's delivered work items. They scale with volume — see below."],
      [
        "Projects Efficiency (%)",
        `=IF(E${firstRow}=0,"",D${firstRow}/E${firstRow}*100) — Σ Vf ÷ Σ Vp. Independent of volume, which is why this, and not the totals, is comparable between people.`,
      ],
      [
        "Helpdesk Efficiency (%)",
        `=IF(COUNT(J${firstRow}:K${firstRow})=0,"",AVERAGE(J${firstRow}:K${firstRow})) — the average of the member's two SLA percentages. A quality measure: 1 ticket within SLA scores the same as 20 within SLA, and extra late tickets never raise it.`,
      ],
      [
        "Workload",
        `=G${firstRow}+H${firstRow}+I${firstRow} — delivered + pending work items + Helpdesk tickets. Context only; it is deliberately absent from the Score formula so that carrying more work can never lower a ranking.`,
      ],
      [
        "Profile",
        "Hybrid = KPI work AND at least 3 resolved tickets. Helpdesk = 3+ tickets and no KPI work. Development = KPI work with fewer than 3 tickets. The 3-ticket floor stops incidental support work from reclassifying an engineer.",
      ],
      ["Score", "Depends on the profile — the exact formula used for each row is spelled out in the last column."],
      [
        "Why Σ Vf isn't the ranking",
        "Σ Vf is a raw total: delivering 100 items beats delivering 15 on that number even if the second person was never late. The per-item delay penalty is real, but it is applied per item and then summed, so volume still dominates the total. Efficiency removes the volume effect.",
      ],
    ]),
  ];

  return {
    sheet: sheetName("Team Performance"),
    data,
    columns: widths(7, 24, 13, 11, 11, 20, 15, 14, 16, 20, 18, 21, 12, 11, 96),
  };
}

// ── Sheet 4: KPI by project ────────────────────────────────────────────────

function buildKpiProjectSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const projects = payload.kpi?.projects ?? [];

  const head: Row[] = [
    [title("KPI by Project")],
    [str("Period"), str(periodLabel(payload.period))],
    blank,
    ([
      th("Project"),
      th("Identifier"),
      th("Σ Vp"),
      th("Σ Vf"),
      th("Efficiency (%)"),
      th("Scored items"),
      th("Contribution (%)"),
    ] as Row).concat(countHeaders(), [th("Penalty mode"), th("k"), th("Config")]),
  ];

  const firstRow = head.length + 1;
  const lastRow = firstRow + Math.max(projects.length - 1, 0);
  const totalRow = lastRow + 1;

  const projectRows = projects.map((project, idx): Row => {
    const r = firstRow + idx;
    // C=ΣVp D=ΣVf E=efficiency F=scored G=contribution
    return ([
      str(project.name),
      str(project.identifier),
      pts(project.sum_vp),
      pts(project.sum_vf),
      fxPct(`IF(C${r}=0,"",D${r}/C${r}*100)`),
      num(project.scored_items),
      fxPct(`IF(OR(E${r}="",$F$${totalRow}=0),"",E${r}*F${r}/$F$${totalRow})`),
    ] as Row).concat(countCells(project.counts), [
      str(project.penalty_mode),
      num(project.k),
      str(project.inherited_config ? "Inherited from workspace" : "Project-specific"),
    ]);
  });

  // With no projects there is nothing to total, and a TOTAL row would land on
  // `firstRow` and sum itself into a circular reference.
  const totalRows: Row[] =
    projects.length === 0
      ? []
      : [
          ([
            { value: "TOTAL / UNIFIED KPI", type: String, fontWeight: "bold" } as Cell,
            null,
            fx(`SUM(C${firstRow}:C${lastRow})`, POINTS_FORMAT),
            fx(`SUM(D${firstRow}:D${lastRow})`, POINTS_FORMAT),
            fxPct(`SUM(G${firstRow}:G${lastRow})`),
            fx(`SUM(F${firstRow}:F${lastRow})`),
            fxPct(`SUM(G${firstRow}:G${lastRow})`),
          ] as Row).concat(
            COUNT_KEYS.map((_, i) => fx(`SUM(${colLetter(7 + i)}${firstRow}:${colLetter(7 + i)}${lastRow})`)),
            [null, null, null]
          ),
        ];

  const data: Row[] = [
    ...head,
    ...projectRows,
    ...totalRows,
    ...legend([
      [
        "Efficiency (%)",
        `=IF(C${firstRow}=0,"",D${firstRow}/C${firstRow}*100) — the project's own Σ Vf ÷ Σ Vp.`,
      ],
      [
        "Contribution (%)",
        `=E${firstRow}*F${firstRow}/$F$${totalRow} — the project's efficiency weighted by its share of all scored items. The contributions add up to the Unified Workspace KPI in the TOTAL row, which is what 'Project Efficiency' on the Overview sheet uses.`,
      ],
      [
        "Σ Vp / Σ Vf in the TOTAL row",
        "Summed for reference only. Projects can use different point scales, so this pooled ratio is NOT the workspace KPI — the item-weighted contribution total is.",
      ],
      ["Penalty mode / k", "The project's KPI configuration: how fast a late item loses value, and the smoothing factor."],
      ["Config", "Whether the project uses its own KPI configuration or inherits the workspace default."],
    ]),
  ];

  return {
    sheet: sheetName("KPI by Project"),
    data,
    columns: widths(30, 12, 11, 11, 16, 13, 18, 10, 9, 8, 10, 15, 8, 24),
  };
}

// ── Sheet 5: KPI by member ─────────────────────────────────────────────────

function buildKpiMemberSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const members = payload.kpi?.members ?? [];

  const head: Row[] = [
    [title("KPI by Member")],
    [str("Period"), str(periodLabel(payload.period))],
    [str("Note"), str("A work item's Vp and Vf are split equally between its assignees, so totals can be fractional.")],
    blank,
    ([th("Member"), th("Σ Vp"), th("Σ Vf"), th("Efficiency (%)")] as Row).concat(countHeaders(), [
      th("Delivered items"),
      th("Total items"),
    ]),
  ];

  const firstRow = head.length + 1;

  const memberRows = members.map((member, idx): Row => {
    const r = firstRow + idx;
    // B=ΣVp C=ΣVf D=eff E=on_time F=early G=late H=pending I=delivered J=total
    return ([
      str(member.display_name),
      pts(member.sum_vp),
      pts(member.sum_vf),
      fxPct(`IF(B${r}=0,"",C${r}/B${r}*100)`),
    ] as Row).concat(countCells(member.counts), [fx(`E${r}+F${r}+G${r}`), fx(`I${r}+H${r}`)]);
  });

  const data: Row[] = [
    ...head,
    ...memberRows,
    blank,
    [str("Unassigned scored items"), num(payload.kpi?.unassigned_count)],
    ...legend([
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
    ]),
  ];

  return { sheet: sheetName("KPI by Member"), data, columns: widths(26, 11, 11, 16, 10, 9, 8, 10, 16, 12) };
}

// ── Sheet 6: Helpdesk summary ──────────────────────────────────────────────

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
    [title("Helpdesk Analytics — Summary")],
    [str("Period"), str(periodLabel(payload.period))],
    blank,
    [section("Key metrics vs. the previous period of the same length")],
    [th("Metric"), th("Current"), th("Previous"), th("Change (%)")],
  ];

  const firstMetricRow = head.length + 1;

  const data: Row[] = [
    ...head,
    ...metricRows.map(({ label, key, format }, idx): Row => {
      const r = firstMetricRow + idx;
      const metric = kpis?.[key];
      return [
        str(label),
        num(metric?.current, format),
        num(metric?.previous, format),
        fxPct(`IF(OR(C${r}="",C${r}=0),"",(B${r}-C${r})/C${r}*100)`),
      ];
    }),
    blank,
    [section("SLA compliance")],
    [th("Metric"), th("Value"), th("Notes")],
    [str("First response (%)"), pct(hd?.sla.first_response_pct), str("Share of tickets meeting the response SLA")],
    [str("Resolution (%)"), pct(hd?.sla.resolution_pct), str("Share of tickets meeting the resolution SLA")],
    [str("First response target (h)"), num(hd?.sla.sla_first_response_hours), str("The threshold being measured against")],
    [str("Resolution target (h)"), num(hd?.sla.sla_resolution_hours), str("The threshold being measured against")],
    [str("Scope"), str(hd?.sla.scope), str("portal / workspace_default / ambiguous — which configuration was applied")],
    [str("Historical cutoff"), str(hd?.sla.historical_cutoff), str(hd?.sla.historical_note)],
    blank,
    [section("Requests by status")],
    [th("Status"), th("Count")],
    ...(hd?.charts.by_status ?? []).map((point): Row => [str(point.status_name), num(point.count)]),
    blank,
    [section("Requests by source")],
    [th("Source"), th("Count")],
    ...(hd?.charts.by_source ?? []).map((point): Row => [str(point.source), num(point.count)]),
    ...legend([
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
    ]),
  ];

  return { sheet: sheetName("Helpdesk Summary"), data, columns: widths(30, 14, 14, 92) };
}

// ── Sheet 7: Helpdesk agents ───────────────────────────────────────────────

function buildHelpdeskAgentsSheet(payload: IExecutiveExportPayload): Sheet<never> {
  const agents = payload.helpdesk?.charts.top_agents ?? [];

  const head: Row[] = [
    [title("Helpdesk — Agent Performance")],
    [str("Period"), str(periodLabel(payload.period))],
    blank,
    [th("Agent"), th("Tickets"), th("SLA first response (%)"), th("SLA resolution (%)"), th("Helpdesk Efficiency (%)")],
  ];

  const firstRow = head.length + 1;

  const data: Row[] = [
    ...head,
    ...agents.map((agent, idx): Row => {
      const r = firstRow + idx;
      return [
        str(agent.display_name),
        num(agent.count),
        pct(agent.sla_first_response_pct),
        pct(agent.sla_resolution_pct),
        fxPct(`IF(COUNT(C${r}:D${r})=0,"",AVERAGE(C${r}:D${r}))`),
      ];
    }),
    ...legend([
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
    ]),
  ];

  return { sheet: sheetName("Helpdesk Agents"), data, columns: widths(26, 10, 22, 20, 24) };
}

// ── Sheet 8: Helpdesk trends ───────────────────────────────────────────────

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
    [title("Helpdesk — Trends")],
    [str("Period"), str(periodLabel(payload.period))],
    blank,
    [th("Date"), th("Requests created"), th("Avg resolution (h)")],
  ];

  const firstRow = head.length + 1;
  const entries = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  const lastRow = firstRow + Math.max(entries.length - 1, 0);

  const data: Row[] = [
    ...head,
    ...entries.map(([date, point]): Row => [str(date), num(point.count), num(point.avgHours, POINTS_FORMAT)]),
    // Skipped when there is no data, so the totals never reference themselves.
    ...(entries.length === 0
      ? []
      : [
          blank,
          [
            { value: "TOTAL / AVERAGE", type: String, fontWeight: "bold" } as Cell,
            fx(`SUM(B${firstRow}:B${lastRow})`),
            fx(`IF(COUNT(C${firstRow}:C${lastRow})=0,"",AVERAGE(C${firstRow}:C${lastRow}))`, POINTS_FORMAT),
          ],
        ]),
    ...legend([
      ["Requests created", "Tickets opened on that date. The TOTAL row sums the column."],
      [
        "Avg resolution (h)",
        "Mean hours to resolve, for tickets resolved on that date. Blank days had no resolutions, and are excluded from the average rather than counted as zero.",
      ],
      [
        "Using this sheet",
        "Select the two columns and insert a line chart to reproduce the two trend charts on the dashboard.",
      ],
    ]),
  ];

  return { sheet: sheetName("Helpdesk Trends"), data, columns: widths(16, 18, 20) };
}

// ── Sheet 9: Methodology ───────────────────────────────────────────────────

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

  const data: Row[] = [
    [title("Methodology — every formula used in this workbook")],
    [
      note(
        "Cells in the other sheets are live Excel formulas wherever a figure is derived. Edit an input and the dependent figures recalculate; click any derived cell to read its formula in the formula bar."
      ),
    ],
    blank,
    [th("Concept"), th("Formula"), th("What it means and why")],
    ...rows.map(([concept, formula, meaning]): Row => [str(concept), note(formula), note(meaning)]),
  ];

  return { sheet: sheetName("Methodology"), data, columns: widths(24, 62, 96) };
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
  await writeXlsxFile(buildExecutiveSheets(payload)).toFile(
    `${payload.workspaceSlug}-executive-dashboard-${payload.period}-${stamp}.xlsx`
  );
}
