import { X } from "lucide-react";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export const KpiMathHelpModal = (props: Props) => {
  const { isOpen, onClose } = props;

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXL}
    >
      <div className="flex flex-col gap-4 p-6 bg-surface-1 rounded-md">
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

        <div className="vertical-scrollbar scrollbar-lg max-h-[60vh] overflow-y-auto pr-2 space-y-6">
          <section>
            <h3 className="text-15 font-medium text-primary mb-2">1. Planned Value (Vp)</h3>
            <p className="text-13 text-secondary leading-relaxed">
              Every work item has a base score called the <strong>Planned Value (Vp)</strong>. It is the sum of points assigned to its characteristics:
            </p>
            <div className="mt-3 bg-layer-1 p-3 rounded-md border border-subtle text-13 text-secondary font-mono">
              Vp = Difficulty + Repetitive + Importance + Type
            </div>
            <ul className="list-disc pl-5 mt-3 text-13 text-secondary space-y-1">
              <li><strong>Difficulty & Repetitive</strong>: Points mapped from the project's estimate systems.</li>
              <li><strong>Importance</strong>: Points derived from the work item's priority level.</li>
              <li><strong>Type</strong>: Points derived from the work item's type (Feature, Bug, etc.).</li>
            </ul>
          </section>

          <section>
            <h3 className="text-15 font-medium text-primary mb-2">2. Delay Penalty (p)</h3>
            <p className="text-13 text-secondary leading-relaxed">
              When a work item is delivered, the system calculates the delay <strong>d</strong> (in days) between the <strong>Target Date</strong> and the <strong>Completed Date</strong>.
            </p>
            <ul className="list-disc pl-5 mt-3 text-13 text-secondary space-y-1">
              <li><strong className="text-success-primary">d &lt; 0</strong>: Delivered early (grants a bonus &gt; 1.0).</li>
              <li><strong className="text-primary">d = 0</strong>: Delivered exactly on time (multiplier is 1.0).</li>
              <li><strong className="text-danger-primary">d &gt; 0</strong>: Delivered late (multiplier drops below 1.0).</li>
            </ul>
            <p className="text-13 text-secondary leading-relaxed mt-3">
              The priority level dictates how fast the multiplier drops (a parameter called <strong>b</strong>). A high-priority item will be penalized much faster for being late than a low-priority item.
            </p>
          </section>

          <section>
            <h3 className="text-15 font-medium text-primary mb-2">3. Final Score (Vf)</h3>
            <p className="text-13 text-secondary leading-relaxed">
              The final score awarded to the team is the Planned Value multiplied by the delay penalty.
            </p>
            <div className="mt-3 bg-layer-1 p-3 rounded-md border border-subtle text-13 text-secondary font-mono">
              Vf = Vp × p
            </div>
            <p className="text-13 text-secondary leading-relaxed mt-3">
              If a work item has multiple assignees, this final score is divided equally among them in the member rankings.
            </p>
          </section>

          <section>
            <h3 className="text-15 font-medium text-primary mb-2">4. Project & Workspace Efficiency</h3>
            <p className="text-13 text-secondary leading-relaxed">
              Efficiency measures how well a project team is meeting their estimates and deadlines. It is independent of the project's point scale, making it comparable across different projects.
            </p>
            <div className="mt-3 bg-layer-1 p-3 rounded-md border border-subtle text-13 text-secondary font-mono">
              Project Efficiency = Σ Vf / Σ Vp
            </div>
            <p className="text-13 text-secondary leading-relaxed mt-3">
              The <strong>Unified Workspace KPI</strong> is the average of all active project efficiencies, weighted by the number of scored work items each project contributed.
            </p>
          </section>
        </div>
      </div>
    </ModalCore>
  );
};
