export const KpiSettingsDocs = () => {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="vertical-scrollbar scrollbar-lg min-h-0 flex-1 overflow-y-auto px-page-x py-6">
        <div className="mx-auto max-w-3xl space-y-8">
          <section>
            <h2 className="text-xl mb-4 border-b border-subtle pb-3 font-semibold text-primary">
              Understanding the KPI Engine
            </h2>
            <p className="mb-4 text-14 leading-relaxed text-secondary">
              The KPI engine scores team performance based on two main factors: the inherent value of the work (
              <strong>Planned Value</strong>) and their timeliness (<strong>Delay Penalty</strong>).
            </p>
            <div className="rounded-md border border-subtle bg-layer-1 p-4">
              <code className="font-mono mb-2 block text-14 text-primary">Vf = Vp × p</code>
              <ul className="space-y-1 text-13 text-secondary">
                <li>
                  <strong>Vf</strong>: Final Score awarded to the team
                </li>
                <li>
                  <strong>Vp</strong>: Planned Value (Base score of the work item)
                </li>
                <li>
                  <strong>p</strong>: Penalty Multiplier (Based on how late the item was)
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-16 font-medium text-primary">1. Planned Value (Vp)</h3>
            <p className="mb-3 text-14 leading-relaxed text-secondary">
              The base score is the sum of points mapped from the item's properties.
            </p>
            <code className="font-mono mb-3 inline-block rounded border border-subtle bg-layer-1 px-2 py-1 text-13 text-secondary">
              Vp = Difficulty + Repetitive + Importance + Type
            </code>
            <ul className="list-disc space-y-2 pl-5 text-14 text-secondary">
              <li>
                <strong>Difficulty (D) & Repetitive (R):</strong> Choose which estimate system represents each
                dimension, and map each estimate point to a KPI point value.
              </li>
              <li>
                <strong>Importance (I):</strong> Derived from the <em>Priority</em> of the issue. You can configure how
                many points each priority level grants.
              </li>
              <li>
                <strong>Type (T):</strong> Derived from the issue type (e.g., Feature, Bug). By default, these
                contribute 0 points.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-3 text-16 font-medium text-primary">2. Delay Penalty and Priority (b)</h3>
            <p className="mb-3 text-14 leading-relaxed text-secondary">
              If an item is delivered late (<code>d &gt; 0</code>), its multiplier <strong>p</strong> drops below 1.0.
              The speed of this drop is controlled by the <strong>Priority Factor (b)</strong>.
            </p>
            <div className="font-mono mb-3 rounded-md border border-subtle bg-layer-1 p-3 text-13 text-secondary">
              Base Term (t) = 1 - (b × d)
            </div>
            <ul className="list-disc space-y-2 pl-5 text-14 text-secondary">
              <li>
                <strong>d</strong> is the delay in days (negative if early, positive if late).
              </li>
              <li>
                A high <strong>b</strong> (e.g., 0.30 for Urgent) means the multiplier drops 30% for every day late. The
                score reaches 0 very fast.
              </li>
              <li>
                A low <strong>b</strong> (e.g., 0.10 for Low) means the multiplier drops only 10% for every day late.
                The penalty is more forgiving.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-3 text-16 font-medium text-primary">3. Smoothing (k) and Penalty Modes</h3>
            <p className="mb-3 text-14 leading-relaxed text-secondary">
              When a work item is extremely late, the multiplier crosses zero and becomes negative. The engine allows
              you to control what happens next using the <strong>Smoothing factor (k)</strong> and the{" "}
              <strong>Penalty mode</strong>.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded border border-subtle bg-layer-1 p-4">
                <h4 className="mb-2 text-14 font-medium text-primary">Continuous Mode</h4>
                <code className="font-mono mb-3 block rounded bg-surface-1 p-2 text-12 text-primary">
                  p = max(0, t) + k × min(0, t)
                </code>
                <p className="text-13 leading-relaxed text-secondary">
                  The multiplier continues dropping below zero, but its slope is multiplied by <strong>k</strong>. For
                  example, if <code>k = 0.5</code>, the penalty slope is cut in half, making it less punishing for
                  extremely late tasks.
                </p>
              </div>
              <div className="rounded border border-subtle bg-layer-1 p-4">
                <h4 className="mb-2 text-14 font-medium text-primary">Dead Zone Mode</h4>
                <code className="font-mono mb-3 block rounded bg-surface-1 p-2 text-12 text-primary">
                  p = max(0, 1 - b×d) + min(0, 1 - k×b×d)
                </code>
                <p className="text-13 leading-relaxed text-secondary">
                  When the multiplier hits zero, it enters a "plateau" (dead zone) where it stays at exactly 0. It only
                  becomes negative if it exceeds the dead zone boundary (which is controlled by <strong>k</strong>).
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-16 font-medium text-primary">4. Day Count & Rounding</h3>
            <ul className="list-disc space-y-2 pl-5 text-14 text-secondary">
              <li>
                <strong>Calendar Days</strong> vs <strong>Business Days</strong>: Choose whether to count weekends as
                part of the delay.
              </li>
              <li>
                <strong>Rounding</strong>: How fractional delays are converted to integer days (Truncate, Round, or
                Ceil).
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};
