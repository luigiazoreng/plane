/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useState } from "react";
import { Sliders, RotateCcw } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { DEFAULT_KPI_SETTINGS, type IKpiSettings } from "./helpers";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  settings: IKpiSettings;
  onSave: (newSettings: IKpiSettings) => void;
};

export const KpiSettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSave }) => {
  const [draft, setDraft] = useState<IKpiSettings>(settings);

  React.useEffect(() => {
    if (isOpen) {
      setDraft(settings);
    }
  }, [isOpen, settings]);

  const handleReset = () => {
    setDraft(DEFAULT_KPI_SETTINGS);
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-6 rounded-md bg-surface-1 p-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle pb-4">
          <div className="flex items-center gap-2">
            <Sliders className="size-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-primary">KPI & Ranking Settings</h2>
              <p className="text-12 text-tertiary">
                Configure target benchmarks, minimum sample size requirements, and score weighting formulas.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset} className="flex items-center gap-1">
            <RotateCcw className="size-3.5" />
            <span>Reset to defaults</span>
          </Button>
        </div>

        <div className="vertical-scrollbar scrollbar-lg max-h-[60vh] space-y-6 overflow-y-auto pr-1 text-13">
          {/* Section 1: Target Benchmarks */}
          <div className="space-y-3">
            <h3 className="text-13 font-semibold tracking-wide text-primary uppercase">Target Benchmarks & Volume</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block">
                  <span className="mb-1 block font-medium text-secondary">Project Efficiency Target (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.projectEfficiencyTarget}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        projectEfficiencyTarget: Math.max(0, Math.min(100, Number(e.target.value))),
                      })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="mb-1 block font-medium text-secondary">Delivery Reliability Target (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.deliveryReliabilityTarget}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        deliveryReliabilityTarget: Math.max(0, Math.min(100, Number(e.target.value))),
                      })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="mb-1 block font-medium text-secondary">Helpdesk FR SLA Target (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.firstResponseSlaTarget}
                    onChange={(e) =>
                      setDraft({ ...draft, firstResponseSlaTarget: Math.max(0, Math.min(100, Number(e.target.value))) })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="mb-1 block font-medium text-secondary">Helpdesk Res SLA Target (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.resolutionSlaTarget}
                    onChange={(e) =>
                      setDraft({ ...draft, resolutionSlaTarget: Math.max(0, Math.min(100, Number(e.target.value))) })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
              </div>

              <div className="sm:col-span-2">
                <label className="block">
                  <span className="mb-1 block font-medium text-secondary">Monthly Target Planned Value (Vp)</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.targetVpMonthly}
                    onChange={(e) => setDraft({ ...draft, targetVpMonthly: Math.max(1, Number(e.target.value)) })}
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
                <p className="mt-1 text-11 text-tertiary">
                  Expected monthly planned value throughput per engineer. Automatically scaled based on the selected
                  period.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Minimum Sample Size Controls */}
          <div className="space-y-3 border-t border-subtle pt-4">
            <h3 className="text-13 font-semibold tracking-wide text-primary uppercase">Sample Size Controls</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block">
                  <span className="mb-1 block font-medium text-secondary">Minimum Project Deliveries</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.minimumProjectSample}
                    onChange={(e) =>
                      setDraft({ ...draft, minimumProjectSample: Math.max(1, Math.round(Number(e.target.value))) })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
                <p className="mt-1 text-11 text-tertiary">
                  Minimum delivered items required for an official ranking position in Projects.
                </p>
              </div>

              <div>
                <label className="block">
                  <span className="mb-1 block font-medium text-secondary">Minimum Helpdesk Tickets</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.minimumHelpdeskSample}
                    onChange={(e) =>
                      setDraft({ ...draft, minimumHelpdeskSample: Math.max(1, Math.round(Number(e.target.value))) })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
                <p className="mt-1 text-11 text-tertiary">
                  Minimum handled tickets required for an official ranking position in Helpdesk.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Project Score Weighting */}
          <div className="space-y-3 border-t border-subtle pt-4">
            <h3 className="text-13 font-semibold tracking-wide text-primary uppercase">Project Score Weights</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block">
                  <span className="mb-1 block text-12 font-medium text-secondary">Efficiency Weight</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={draft.projectScoreWeights.efficiency}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        projectScoreWeights: {
                          ...draft.projectScoreWeights,
                          efficiency: Number(e.target.value),
                        },
                      })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="mb-1 block text-12 font-medium text-secondary">Throughput Weight</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={draft.projectScoreWeights.throughput}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        projectScoreWeights: {
                          ...draft.projectScoreWeights,
                          throughput: Number(e.target.value),
                        },
                      })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="mb-1 block text-12 font-medium text-secondary">Reliability Weight</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={draft.projectScoreWeights.reliability}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        projectScoreWeights: {
                          ...draft.projectScoreWeights,
                          reliability: Number(e.target.value),
                        },
                      })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Section 4: Helpdesk & Hybrid Weights */}
          <div className="space-y-3 border-t border-subtle pt-4">
            <h3 className="text-13 font-semibold tracking-wide text-primary uppercase">
              Helpdesk Quality & Hybrid Weights
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className="block">
                  <span className="mb-1 block text-12 font-medium text-secondary">FR SLA Weight</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={draft.helpdeskScoreWeights.firstResponse}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        helpdeskScoreWeights: {
                          ...draft.helpdeskScoreWeights,
                          firstResponse: Number(e.target.value),
                        },
                      })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="mb-1 block text-12 font-medium text-secondary">Res SLA Weight</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={draft.helpdeskScoreWeights.resolution}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        helpdeskScoreWeights: {
                          ...draft.helpdeskScoreWeights,
                          resolution: Number(e.target.value),
                        },
                      })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="mb-1 block text-12 font-medium text-secondary">Hybrid Proj Weight</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={draft.hybridScoreWeights.project}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        hybridScoreWeights: {
                          ...draft.hybridScoreWeights,
                          project: Number(e.target.value),
                        },
                      })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="mb-1 block text-12 font-medium text-secondary">Hybrid HD Weight</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={draft.hybridScoreWeights.helpdesk}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        hybridScoreWeights: {
                          ...draft.hybridScoreWeights,
                          helpdesk: Number(e.target.value),
                        },
                      })
                    }
                    className="focus:ring-accent-primary w-full rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-primary focus:ring-1 focus:outline-none"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-subtle pt-4">
          <Button variant="ghost" size="base" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="base" onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
