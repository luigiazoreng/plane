import React from "react";
import { observer } from "mobx-react-lite";

export const AIChat = observer(() => {
    // const { aiStore } = useMobxStore();
    
    // For scaffolding purposes, we just render a placeholder structure
    const chatOpen = true; // aiStore.chatOpen

    if (!chatOpen) return null;

    return (
        <div className="fixed right-0 top-0 h-full w-96 bg-white border-l shadow-lg z-50 flex flex-col">
            <div className="p-4 border-b font-bold text-lg">Plane AI Agent</div>
            <div className="flex-1 p-4 overflow-y-auto">
                <div className="text-gray-500 text-sm mb-4">Ask Mode: Ask questions about your workspace.</div>
                {/* aiStore.messages.map(...) */}
            </div>
            <div className="p-4 border-t">
                <input 
                    type="text" 
                    className="w-full border rounded p-2" 
                    placeholder="Ask AI..."
                />
            </div>
        </div>
    );
});
