/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Button } from "@plane/propel/button";
import { ArrowUpRight } from "lucide-react";

type TForwardToIntakeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  projectIds: string[];
  getProjectById: (projectId: string) => { name?: string; identifier?: string } | undefined;
  /** Seeds the form each time the modal opens. */
  defaultTitle: string;
  defaultDescription: string;
  onSubmit: (payload: { project: string; title: string; description?: string }) => Promise<void>;
};

export function ForwardToIntakeModal({
  isOpen,
  onClose,
  projectIds,
  getProjectById,
  defaultTitle,
  defaultDescription,
  onSubmit,
}: TForwardToIntakeModalProps) {
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setProjectId("");
    setTitle(defaultTitle);
    setDescription(defaultDescription);
  }, [isOpen, defaultTitle, defaultDescription]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!projectId || !title.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ project: projectId, title: title.trim(), description: description.trim() || undefined });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="shadow-xl w-full max-w-md rounded-xl border border-subtle bg-surface-1 p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-primary">Forward to Intake</h2>
          <p className="mt-1 text-13 text-tertiary">
            This will create an Intake issue in the selected project for the dev team to review.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="forward-project" className="mb-1.5 block text-11 font-medium text-tertiary">
              Project
            </label>
            <select
              id="forward-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary transition-colors outline-none focus:border-strong"
            >
              <option value="">Select a project…</option>
              {projectIds.map((id) => {
                const project = getProjectById(id);
                if (!project) return null;
                return (
                  <option key={id} value={id}>
                    {project.identifier} — {project.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label htmlFor="forward-title" className="mb-1.5 block text-11 font-medium text-tertiary">
              Title
            </label>
            <input
              id="forward-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title for the dev team"
              className="w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary transition-colors outline-none focus:border-strong"
            />
          </div>

          <div>
            <label htmlFor="forward-description" className="mb-1.5 block text-11 font-medium text-tertiary">
              Description (optional)
            </label>
            <textarea
              id="forward-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional context for the dev team…"
              className="min-h-20 w-full resize-none rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary transition-colors outline-none focus:border-strong"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" size="base" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="base"
            onClick={handleSubmit}
            disabled={isSubmitting || !projectId || !title.trim()}
          >
            <span className="flex items-center gap-2">
              <ArrowUpRight className="size-4" />
              {isSubmitting ? "Forwarding…" : "Forward to Intake"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
