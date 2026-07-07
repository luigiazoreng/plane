import React from "react";
import { observer } from "mobx-react-lite";

export const ContextualTriggers = observer(({ entityType, _entityId }: any) => {
    return (
        <div className="flex gap-2 mb-4">
            <button className="text-sm px-2 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200">
                ✨ Generate Summary
            </button>
            {entityType === "project" && (
                <button className="text-sm px-2 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200">
                    ✨ Suggest Triage Actions
                </button>
            )}
        </div>
    );
});
