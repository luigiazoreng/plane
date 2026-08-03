/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { X } from "lucide-react";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export const ExecutiveHelpModal = (props: Props) => {
  const { isOpen, onClose } = props;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-4 rounded-md bg-surface-1 p-6">
        <div className="flex items-center justify-between border-b border-subtle pb-4">
          <h2 className="text-xl font-semibold text-primary">How the Executive Dashboard is Calculated</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-tertiary hover:bg-layer-1 hover:text-secondary"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="vertical-scrollbar scrollbar-lg max-h-[70vh] space-y-6 overflow-y-auto pr-2">
          <section>
            <h3 className="text-15 mb-2 font-medium text-primary">1. IT General Index</h3>
            <p className="text-13 leading-relaxed text-secondary">
              A single composite score (0-100%) blending Helpdesk SLAs and Engineering KPIs, each normalized to a 0-100
              scale and combined with fixed weights:
            </p>
            <div className="font-mono mt-3 rounded-md border border-subtle bg-layer-1 p-3 text-13 text-secondary">
              Project Efficiency — 35%
              <br />
              SLA First Response — 25%
              <br />
              SLA Resolution — 20%
              <br />
              Backlog Health — 10%
              <br />
              Resolution Speed — 10%
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-13 text-secondary">
              <li>
                <strong>Project Efficiency</strong>: the workspace&apos;s unified KPI efficiency (Σ Vf / Σ Vp across
                active projects) × 100.
              </li>
              <li>
                <strong>SLA First Response / SLA Resolution</strong>: Helpdesk % of tickets whose first response /
                resolution landed within the configured SLA threshold, for the selected period.
              </li>
              <li>
                <strong>Backlog Health</strong>:{" "}
                <code className="text-12">(1 − open tickets / total tickets) × 100</code> — 100% means no open backlog,
                0% means every ticket is still open.
              </li>
              <li>
                <strong>Resolution Speed</strong>: average resolution time, mapped linearly so 0h = 100% and 48h+ = 0%.
              </li>
            </ul>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              <strong>Index = Σ (value × effective weight)</strong>. If an indicator has no data (e.g. no SLA
              configured), its weight is redistributed proportionally across the remaining indicators instead of
              counting as zero — so a missing metric never silently drags the index down. If every indicator is missing,
              the index shows &ldquo;—&rdquo;.
            </p>
          </section>

          <section>
            <h3 className="text-15 mb-2 font-medium text-primary">2. Sector Health</h3>
            <p className="text-13 leading-relaxed text-secondary">
              Two independent cards, each with its own health badge (
              <span className="font-medium text-success-primary">Healthy</span> ≥ 90%,{" "}
              <span className="font-medium text-warning-primary">Attention</span> ≥ 70%,{" "}
              <span className="font-medium text-danger-primary">Critical</span> below 70%, or &ldquo;No data&rdquo;).
            </p>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              <strong>Helpdesk &amp; Support</strong> — health badge is the average of SLA Response % and SLA Resolution
              % (or whichever one is available).
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-13 text-secondary">
              <li>
                <strong>SLA Response / SLA Resolution</strong>: same definitions as in the Index above.
              </li>
              <li>
                <strong>Avg Resolution</strong>: average hours between a ticket being created and resolved, for the
                selected period.
              </li>
              <li>
                <strong>Total Tickets / Open (Backlog) / Resolved</strong>: raw counts for the selected period.
              </li>
            </ul>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              <strong>Engineering &amp; Projects</strong> — health badge is the workspace KPI efficiency (same figure
              feeding the Index above).
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-13 text-secondary">
              <li>
                <strong>Efficiency</strong>: Σ Vf / Σ Vp across every active project — comparable across the workspace,
                unlike raw point totals.
              </li>
              <li>
                <strong>Scored Items</strong>: delivered work items that count toward Efficiency (pending/open items
                don&apos;t).
              </li>
              <li>
                <strong>On Time / Early, Late, Pending</strong>: counts by delivery status, workspace-wide.
              </li>
              <li>
                <strong>Active KPIs</strong>: number of projects with the KPI panel enabled.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-15 mb-2 font-medium text-primary">3. Team Performance table</h3>
            <p className="text-13 leading-relaxed text-secondary">
              Every member who shows up in either KPI data or Helpdesk ticket data is classified into a{" "}
              <strong>Profile</strong>, then scored accordingly:
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-13 text-secondary">
              <li>
                <strong>Development</strong>: member has KPI-scored work but fewer than 3 resolved Helpdesk tickets in
                the period (a couple of incidental tickets don&apos;t make someone &ldquo;Hybrid&rdquo;). Score = 100%
                their KPI Efficiency.
              </li>
              <li>
                <strong>Helpdesk</strong>: member has 3+ resolved tickets in the period and no KPI-scored work. Score =
                100% their Helpdesk quality score.
              </li>
              <li>
                <strong>Hybrid</strong>: member has both KPI-scored work and 3+ resolved tickets. Score is a blend,
                weighted by each side&apos;s actual work volume, not a flat 50/50 (see formula below).
              </li>
            </ul>
            <p className="mt-4 text-13 leading-relaxed text-secondary">
              <strong>Workload column</strong> — the member&apos;s total item count: delivered + pending KPI work items,
              plus Helpdesk tickets, for the selected period. It is purely informational context, shown so a 95% score
              over 60 items and a 100% score over 3 items aren&apos;t read as equivalent — it never feeds into the Score
              column, so carrying more work never lowers anyone&apos;s ranking.
            </p>
            <p className="mt-4 text-13 leading-relaxed text-secondary">
              <strong>Helpdesk column</strong> — this is a quality score, not a volume score: the average of the
              agent&apos;s own SLA First Response % and SLA Resolution % (whichever are available). Resolving 1 ticket
              within SLA scores the same as resolving 20 within SLA; resolving more tickets late doesn&apos;t score
              higher just because there are more of them. The number in parentheses is the raw ticket count, shown for
              context only — it does not affect this score.
            </p>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              <strong>Projects column</strong> — the member&apos;s KPI Efficiency (Σ Vf / Σ Vp of their own delivered
              work items), identical to the Efficiency figure on the KPI page.
            </p>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              <strong>Score column</strong> (final, sortable rank):
            </p>
            <div className="font-mono mt-3 rounded-md border border-subtle bg-layer-1 p-3 text-13 text-secondary">
              Development: Score = KPI Efficiency
              <br />
              Helpdesk: Score = Helpdesk quality score
              <br />
              Hybrid: hdWeight = hdTickets / (hdTickets + kpiScoredItems)
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;Score = Helpdesk × hdWeight + Projects × (1 − hdWeight)
            </div>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              The Hybrid weighting uses actual work volume — resolved tickets vs. delivered/scored KPI items — so
              someone whose measured work is mostly Projects with a few Helpdesk tickets on the side is scored mostly on
              Projects, not punished equally on both sides. If one side has no score at all (e.g. no SLA configured),
              all the weight goes to the other side instead of treating the missing side as a zero.
            </p>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              <strong>Export to CSV</strong> (next to the section title) downloads exactly this table — Rank, Member,
              Profile, Helpdesk score, Helpdesk tickets, Projects efficiency, and Final score — for the currently
              selected period.
            </p>
          </section>
        </div>
      </div>
    </ModalCore>
  );
};
