import React from "react";
import { observer } from "mobx-react-lite";

export const ActionPreview = observer(({ plannedAction, onApprove, onReject }: any) => {
    if (!plannedAction) return null;

    return (
        <div className="p-4 border border-yellow-400 bg-yellow-50 rounded mb-4">
            <h4 className="font-bold text-yellow-800">Action Required</h4>
            <p className="text-sm text-yellow-700">The AI wants to execute the following action:</p>
            <pre className="text-xs bg-white p-2 mt-2 border rounded overflow-x-auto">
                {JSON.stringify(plannedAction, null, 2)}
            </pre>
            <div className="mt-4 flex gap-2">
                <button onClick={onReject} className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm">Reject</button>
                <button onClick={onApprove} className="px-3 py-1 bg-green-600 text-white rounded text-sm">Approve</button>
            </div>
        </div>
    );
});
