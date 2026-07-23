export const KpiSettingsDocs = () => {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="vertical-scrollbar scrollbar-lg min-h-0 flex-1 overflow-y-auto px-page-x py-6">
        <div className="mx-auto max-w-3xl space-y-8">
          
          <section>
            <h2 className="text-xl font-semibold text-primary border-b border-subtle pb-3 mb-4">
              Understanding the KPI Engine
            </h2>
            <p className="text-14 text-secondary leading-relaxed mb-4">
              The KPI engine scores team performance based on two main factors: the inherent value of the work (<strong>Planned Value</strong>) and their timeliness (<strong>Delay Penalty</strong>).
            </p>
            <div className="bg-layer-1 p-4 rounded-md border border-subtle">
              <code className="text-14 text-primary font-mono block mb-2">Vf = Vp × p</code>
              <ul className="text-13 text-secondary space-y-1">
                <li><strong>Vf</strong>: Final Score awarded to the team</li>
                <li><strong>Vp</strong>: Planned Value (Base score of the work item)</li>
                <li><strong>p</strong>: Penalty Multiplier (Based on how late the item was)</li>
              </ul>
            </div>
          </section>

          <section>
            <h3 className="text-16 font-medium text-primary mb-3">1. Planned Value (Vp)</h3>
            <p className="text-14 text-secondary leading-relaxed mb-3">
              The base score is the sum of points mapped from the item's properties.
            </p>
            <code className="text-13 text-secondary font-mono bg-layer-1 px-2 py-1 rounded border border-subtle inline-block mb-3">
              Vp = Difficulty + Repetitive + Importance + Type
            </code>
            <ul className="list-disc pl-5 text-14 text-secondary space-y-2">
              <li><strong>Difficulty (D) & Repetitive (R):</strong> Choose which estimate system represents each dimension, and map each estimate point to a KPI point value.</li>
              <li><strong>Importance (I):</strong> Derived from the <em>Priority</em> of the issue. You can configure how many points each priority level grants.</li>
              <li><strong>Type (T):</strong> Derived from the issue type (e.g., Feature, Bug). By default, these contribute 0 points.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-16 font-medium text-primary mb-3">2. Delay Penalty and Priority (b)</h3>
            <p className="text-14 text-secondary leading-relaxed mb-3">
              If an item is delivered late (<code>d &gt; 0</code>), its multiplier <strong>p</strong> drops below 1.0. The speed of this drop is controlled by the <strong>Priority Factor (b)</strong>.
            </p>
            <ul className="list-disc pl-5 text-14 text-secondary space-y-2">
              <li>A high <strong>b</strong> (e.g., 0.30 for Urgent) means the multiplier drops 30% for every day late. The score reaches 0 very fast.</li>
              <li>A low <strong>b</strong> (e.g., 0.10 for Low) means the multiplier drops only 10% for every day late. The penalty is more forgiving.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-16 font-medium text-primary mb-3">3. Smoothing (k) and Penalty Modes</h3>
            <p className="text-14 text-secondary leading-relaxed mb-3">
              When a work item is extremely late, the multiplier crosses zero and becomes negative. The engine allows you to control what happens next using the <strong>Smoothing factor (k)</strong> and the <strong>Penalty mode</strong>.
            </p>
            
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <div className="bg-layer-1 p-4 rounded border border-subtle">
                <h4 className="text-14 font-medium text-primary mb-2">Continuous Mode</h4>
                <p className="text-13 text-secondary leading-relaxed">
                  The multiplier continues dropping below zero, but its slope is multiplied by <strong>k</strong>. For example, if <code>k = 0.5</code>, the penalty slope is cut in half, making it less punishing for extremely late tasks.
                </p>
              </div>
              <div className="bg-layer-1 p-4 rounded border border-subtle">
                <h4 className="text-14 font-medium text-primary mb-2">Dead Zone Mode</h4>
                <p className="text-13 text-secondary leading-relaxed">
                  When the multiplier hits zero, it enters a "plateau" (dead zone) where it stays at exactly 0. It only becomes negative if it exceeds the dead zone boundary (which is controlled by <strong>k</strong>).
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-16 font-medium text-primary mb-3">4. Day Count & Rounding</h3>
            <ul className="list-disc pl-5 text-14 text-secondary space-y-2">
              <li><strong>Calendar Days</strong> vs <strong>Business Days</strong>: Choose whether to count weekends as part of the delay.</li>
              <li><strong>Rounding</strong>: How fractional delays are converted to integer days (Truncate, Round, or Ceil).</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};
