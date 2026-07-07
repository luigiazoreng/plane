import React from "react";
import { observer } from "mobx-react-lite";

interface ContextualTriggersProps {
  entityType: string;
  entityId: string;
}

export const ContextualTriggers = observer(({ entityType }: ContextualTriggersProps) => {
  return (
    <div className="mb-4 flex gap-2">
      <button className="text-sm bg-blue-50 text-blue-600 border-blue-200 rounded border px-2 py-1">
        ✨ Generate Summary
      </button>
      {entityType === "project" && (
        <button className="text-sm bg-blue-50 text-blue-600 border-blue-200 rounded border px-2 py-1">
          ✨ Suggest Triage Actions
        </button>
      )}
    </div>
  );
});
