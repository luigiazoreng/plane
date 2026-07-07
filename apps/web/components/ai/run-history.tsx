import React from "react";
import { observer } from "mobx-react-lite";

export const AIRunHistory = observer(() => {
    // This component would fetch and display AIAgentRun and AIAgentAction logs
    return (
        <div className="p-6 bg-white rounded shadow-sm border">
            <h2 className="text-xl font-bold mb-4">AI Agent Audit Log</h2>
            <div className="text-gray-500 text-sm">
                <p>No recent AI actions executed in this workspace.</p>
                {/* Table rendering logs goes here */}
            </div>
        </div>
    );
});
