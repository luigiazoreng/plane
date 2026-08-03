import { X } from "lucide-react";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export const KpiMathHelpModal = (props: Props) => {
  const { isOpen, onClose } = props;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-4 rounded-md bg-surface-1 p-6">
        <div className="flex items-center justify-between border-b border-subtle pb-4">
          <h2 className="text-xl font-semibold text-primary">How KPI is Calculated</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-tertiary hover:bg-layer-1 hover:text-secondary"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="vertical-scrollbar scrollbar-lg max-h-[60vh] space-y-6 overflow-y-auto pr-2">
          <section>
            <h3 className="text-15 mb-2 font-medium text-primary">1. Planned Value (Vp)</h3>
            <p className="text-13 leading-relaxed text-secondary">
              Every work item has a base score called the <strong>Planned Value (Vp)</strong>. It is the sum of points
              assigned to its characteristics:
            </p>
            <div className="font-mono mt-3 rounded-md border border-subtle bg-layer-1 p-3 text-13 text-secondary">
              Vp = Difficulty + Repetitive + Importance + Type
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-13 text-secondary">
              <li>
                <strong>Difficulty & Repetitive</strong>: Points mapped from the project's estimate systems.
              </li>
              <li>
                <strong>Importance</strong>: Points derived from the work item's priority level.
              </li>
              <li>
                <strong>Type</strong>: Points derived from the work item's type (Feature, Bug, etc.).
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-15 mb-2 font-medium text-primary">2. Delay Penalty (p)</h3>
            <p className="text-13 leading-relaxed text-secondary">
              When a work item is delivered, the system calculates the delay <strong>d</strong> (in days) between the{" "}
              <strong>Target Date</strong> and the <strong>Completed Date</strong>.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-13 text-secondary">
              <li>
                <strong className="text-success-primary">d &lt; 0</strong>: Delivered early (grants a bonus &gt; 1.0).
              </li>
              <li>
                <strong className="text-primary">d = 0</strong>: Delivered exactly on time (multiplier is 1.0).
              </li>
              <li>
                <strong className="text-danger-primary">d &gt; 0</strong>: Delivered late (multiplier drops below 1.0).
              </li>
            </ul>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              The priority level dictates how fast the multiplier drops (a parameter called <strong>b</strong>). A
              high-priority item will be penalized much faster for being late than a low-priority item.
            </p>
            <div className="font-mono mt-3 rounded-md border border-subtle bg-layer-1 p-3 text-13 text-secondary">
              Base Term (t) = 1 - (b × d)
              <br />
              <br />
              Continuous Mode: p = max(0, t) + k × min(0, t)
              <br />
              Dead Zone Mode: p = max(0, 1 - b × d) + min(0, 1 - k × b × d)
            </div>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              The <strong>Smoothing factor (k)</strong> controls what happens when the penalty goes below zero
              (extremely late). The <strong>Penalty Mode</strong> defines if the score continues dropping immediately or
              if it enters a "plateau" (dead zone) at 0 before dropping further.
            </p>
          </section>

          <section>
            <h3 className="text-15 mb-2 font-medium text-primary">3. Final Score (Vf)</h3>
            <p className="text-13 leading-relaxed text-secondary">
              The final score awarded to the team is the Planned Value multiplied by the delay penalty.
            </p>
            <div className="font-mono mt-3 rounded-md border border-subtle bg-layer-1 p-3 text-13 text-secondary">
              Vf = Vp × p
            </div>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              If a work item has multiple assignees, this final score is divided equally among them in the member
              rankings.
            </p>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              Only <strong>delivered</strong> work items (marked done) contribute Vp/Vf at all. A work item that is
              still open — even if overdue — never lowers a project's or a member's score. It only shows up in the{" "}
              <strong>Pending</strong> count, so open workload stays visible without affecting the numbers above it.
            </p>
          </section>

          <section>
            <h3 className="text-15 mb-2 font-medium text-primary">4. Project, Workspace & Member Efficiency</h3>
            <p className="text-13 leading-relaxed text-secondary">
              Efficiency measures how well a project team — or an individual member — is meeting their estimates and
              deadlines. It is independent of the point scale, making it the one figure that's comparable across
              different projects and different people.
            </p>
            <div className="font-mono mt-3 rounded-md border border-subtle bg-layer-1 p-3 text-13 text-secondary">
              Efficiency = Σ Vf / Σ Vp
            </div>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              The <strong>Unified Workspace KPI</strong> is the average of all active project efficiencies, weighted by
              the number of scored work items each project contributed.
            </p>
          </section>

          <section>
            <h3 className="text-15 mb-2 font-medium text-primary">5. Why Σ Vp / Σ Vf aren't comparable</h3>
            <p className="text-13 leading-relaxed text-secondary">
              Σ Vp and Σ Vf are <strong>raw totals</strong> — they add up every delivered work item's contribution, so
              they scale with how much a project or a member delivered, not with how well. Someone who delivers 100
              work items will naturally have a bigger Σ Vf than someone who delivered 15, even if the second person's
              work was flawless and the first person's was frequently late.
            </p>
            <p className="mt-3 text-13 leading-relaxed text-secondary">
              The penalty is still real — a late item's Vf is discounted relative to its own Vp by the delay
              multiplier <strong>p</strong> above — but that discount is applied per item, then summed. A large enough
              volume of discounted items can still add up to a bigger raw total than a small volume of full-value
              ones. <strong>Efficiency</strong> is what removes the volume effect: it is the one number meant to be
              compared between two projects or two people. Use Σ Vp / Σ Vf only to gauge magnitude of work, never as a
              head-to-head comparison.
            </p>
          </section>
        </div>
      </div>
    </ModalCore>
  );
};
