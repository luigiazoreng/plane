"use client";

import React, { useState } from "react";
import { AIChatPanel } from "../ai/ai-chat-panel";
import { SidebarNavItem } from "./sidebar-navigation";

export interface AIAgentSidebarButtonProps {
  workspaceSlug: string;
  projectId?: string;
}

export const AIAgentSidebarButton: React.FC<AIAgentSidebarButtonProps> = ({ workspaceSlug, projectId }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full text-left">
        <SidebarNavItem className="text-amber-500 hover:bg-amber-500/10 transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-base">✨</span>
            <span className="text-xs font-semibold">AI Agent</span>
          </div>
          <span className="tracking-wider bg-amber-500/20 text-amber-600 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase">
            Beta
          </span>
        </SidebarNavItem>
      </button>

      {/* Floating AI Panel Drawer */}
      {isOpen && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg justify-end bg-black/40 backdrop-blur-sm">
          <div className="bg-custom-sidebar-background-100 shadow-2xl relative flex h-full w-full max-w-md flex-col">
            <div className="border-custom-border-200 bg-custom-sidebar-background-200 flex items-center justify-between border-b p-3">
              <span className="text-sm text-custom-sidebar-text-100 font-semibold">AI Native Assistant</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-custom-sidebar-text-200 hover:text-custom-sidebar-text-100 text-sm p-1 font-bold"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-2">
              <AIChatPanel workspaceSlug={workspaceSlug} projectId={projectId} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
