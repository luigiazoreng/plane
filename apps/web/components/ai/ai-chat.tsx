import React from "react";
import { observer } from "mobx-react-lite";

export const AIChat = observer(() => {
  const chatOpen = true;

  if (!chatOpen) return null;

  return (
    <div className="shadow-lg fixed top-0 right-0 z-50 flex h-full w-96 flex-col border-l bg-white">
      <div className="text-lg border-b p-4 font-bold">Plane AI Agent</div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-gray-500 text-sm mb-4">Ask Mode: Ask questions about your workspace.</div>
      </div>
      <div className="border-t p-4">
        <input type="text" className="w-full rounded border p-2" placeholder="Ask AI..." />
      </div>
    </div>
  );
});
