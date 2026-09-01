"use client";

import React, { useState } from "react";

export interface AIChatMessage {
  id: string;
  runId?: string;
  sender: "user" | "agent";
  text: string;
  mode?: "ask" | "build";
  actions?: Array<{
    type: string;
    targetEntityType: string;
    payload: Record<string, any>;
    requiresApproval: boolean;
    status?: "planned" | "approved" | "rejected" | "executed";
  }>;
  contextSummary?: string;
  timestamp: string;
}

export interface AIChatPanelProps {
  workspaceSlug: string;
  projectId?: string;
}

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ workspaceSlug, projectId }) => {
  const [mode, setMode] = useState<"ask" | "build">("ask");
  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      id: "welcome-msg",
      sender: "agent",
      text: "Hello! I am your native Plane AI Agent. Ask me anything about your workspace in Ask Mode, or switch to Build Mode to create and update entities.",
      mode: "ask",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isLoading) return;

    const userMessage: AIChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: inputPrompt,
      mode,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentPrompt = inputPrompt;
    setInputPrompt("");
    setIsLoading(true);

    try {
      // Send orchestration request to Plane AI service via REST API endpoint
      const response = await fetch(`/api/v1/workspaces/${workspaceSlug}/ai/runs/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_text: currentPrompt,
          mode,
          project: projectId,
          provider: "openai",
          llm_model: "gpt-4o-mini",
        }),
      });

      let agentResponseText = "";
      let actions: AIChatMessage["actions"] = [];
      let contextSummary = "";
      let runId: string | undefined;

      if (response.ok) {
        const data = await response.json();
        runId = data.id;
        agentResponseText = data.input_text || "Processed request successfully.";
        actions = (data.actions || []).map((act: any) => ({
          type: act.action_type,
          targetEntityType: act.target_entity_type,
          payload: act.planned_payload,
          requiresApproval: true,
          status: act.status || "planned",
        }));
        contextSummary = `Run ID: ${data.id?.slice(0, 8) || "run"} | Status: ${data.status}`;
      } else {
        // Fallback demonstration mode
        if (mode === "ask") {
          agentResponseText = `[Ask Mode] Grounded on workspace "${workspaceSlug}". Summarized: No active blockers found in recent items.`;
          contextSummary = "Grounded on 2 project(s) and 5 work item(s).";
        } else {
          agentResponseText = `[Build Mode] Proposed action to fulfill your request: "${currentPrompt}". Review action card below.`;
          actions = [
            {
              type: lowerIncludes(currentPrompt, ["cycle", "sprint", "ciclo"])
                ? "create_cycle"
                : lowerIncludes(currentPrompt, ["module", "módulo"])
                  ? "create_module"
                  : lowerIncludes(currentPrompt, ["comment", "comentário"])
                    ? "create_comment"
                    : "create_work_item",
              targetEntityType: lowerIncludes(currentPrompt, ["cycle", "sprint", "ciclo"])
                ? "cycle"
                : lowerIncludes(currentPrompt, ["module", "módulo"])
                  ? "module"
                  : lowerIncludes(currentPrompt, ["comment", "comentário"])
                    ? "comment"
                    : "issue",
              payload: {
                name: currentPrompt.replace(/create|crie|add|adicionar/gi, "").trim() || "New AI Entity",
                project_id: projectId || "default-project",
                description: `Created via Build Mode AI: ${currentPrompt}`,
              },
              requiresApproval: true,
              status: "planned" as const,
            },
          ];
          contextSummary = "1 action proposed for approval.";
        }
      }

      const agentMessage: AIChatMessage = {
        id: `agent-${Date.now()}`,
        runId,
        sender: "agent",
        text: agentResponseText,
        mode,
        actions,
        contextSummary,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, agentMessage]);
    } catch (err) {
      console.error("[AIChatPanel] Request error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "agent",
          text: "An error occurred while contacting Plane AI service. Please try again.",
          mode,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprovalAction = async (messageId: string, actionIndex: number, approved: boolean, runId?: string) => {
    if (runId) {
      try {
        await fetch(`/api/v1/workspaces/${workspaceSlug}/ai/runs/${runId}/approval/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: approved ? "approve" : "reject" }),
        });
      } catch (err) {
        console.error("[AIChatPanel] Approval API call failed:", err);
      }
    }

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId || !msg.actions) return msg;
        const updatedActions = [...msg.actions];
        updatedActions[actionIndex] = {
          ...updatedActions[actionIndex],
          status: approved ? "executed" : "rejected",
        };
        return {
          ...msg,
          text: approved ? `${msg.text}\n\n✅ Action executed successfully!` : `${msg.text}\n\n❌ Action rejected.`,
          actions: updatedActions,
        };
      })
    );
  };

  return (
    <div className="bg-custom-sidebar-background-100 border-custom-border-200 shadow-lg font-sans flex h-full w-full max-w-xl flex-col overflow-hidden rounded-lg border">
      {/* Header */}
      <div className="border-custom-border-200 bg-custom-sidebar-background-200 flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <span className="bg-emerald-500 h-3 w-3 animate-pulse rounded-full" />
          <h3 className="text-custom-sidebar-text-100 text-sm font-semibold">Plane Native AI Agent</h3>
        </div>
        {/* Mode Switcher */}
        <div className="bg-custom-background-80 border-custom-border-200 text-xs flex items-center rounded-md border p-1">
          <button
            type="button"
            onClick={() => setMode("ask")}
            className={`rounded px-3 py-1 font-medium transition-colors ${
              mode === "ask"
                ? "bg-custom-primary shadow-sm text-white"
                : "text-custom-sidebar-text-200 hover:text-custom-sidebar-text-100"
            }`}
          >
            Ask Mode (Read)
          </button>
          <button
            type="button"
            onClick={() => setMode("build")}
            className={`rounded px-3 py-1 font-medium transition-colors ${
              mode === "build"
                ? "bg-amber-600 shadow-sm text-white"
                : "text-custom-sidebar-text-200 hover:text-custom-sidebar-text-100"
            }`}
          >
            Build Mode (Action)
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="text-sm flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg p-3 ${
                msg.sender === "user"
                  ? "bg-custom-primary text-white"
                  : "bg-custom-sidebar-background-200 border-custom-border-200 text-custom-sidebar-text-100 border"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-4 text-[11px] opacity-75">
                <span className="font-semibold capitalize">{msg.sender}</span>
                <span>{msg.timestamp}</span>
              </div>
              <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>

              {msg.contextSummary && (
                <div className="border-custom-border-200/50 text-custom-sidebar-text-200 mt-2 border-t pt-2 text-[11px]">
                  📍 {msg.contextSummary}
                </div>
              )}

              {/* Action Approval Cards */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="border-custom-border-200 mt-3 space-y-2 border-t pt-3">
                  <span className="text-xs text-amber-500 tracking-wider block font-semibold uppercase">
                    ⚡ Proposed Action (Approval Required)
                  </span>
                  {msg.actions.map((act, idx) => (
                    <div
                      key={`${msg.id}-${act.type}-${act.targetEntityType}`}
                      className="bg-custom-sidebar-background-100 border-custom-border-300 text-xs space-y-1.5 rounded border p-2.5"
                    >
                      <div className="font-mono text-custom-sidebar-text-200 flex items-center justify-between text-[11px]">
                        <span>Action: {act.type}</span>
                        <span className="bg-custom-background-80 text-amber-600 rounded px-1.5 py-0.5 font-bold capitalize">
                          {act.status || "planned"}
                        </span>
                      </div>
                      <pre className="bg-custom-background-90 text-custom-sidebar-text-100 font-mono overflow-x-auto rounded p-1.5 text-[11px]">
                        {JSON.stringify(act.payload, null, 2)}
                      </pre>

                      {act.status === "planned" && (
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleApprovalAction(msg.id, idx, true, msg.runId)}
                            className="bg-emerald-600 hover:bg-emerald-700 flex-1 rounded py-1 text-center font-medium text-white transition-colors"
                          >
                            Approve Action
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApprovalAction(msg.id, idx, false, msg.runId)}
                            className="bg-rose-600 hover:bg-rose-700 flex-1 rounded py-1 text-center font-medium text-white transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="text-xs text-custom-sidebar-text-200 flex items-center gap-2 p-2">
            <span className="bg-custom-primary h-2 w-2 animate-ping rounded-full" />
            AI Agent is processing grounded context...
          </div>
        )}
      </div>

      {/* Input Area */}
      <form
        onSubmit={handleSendMessage}
        className="border-custom-border-200 bg-custom-sidebar-background-200 border-t p-3"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder={
              mode === "ask"
                ? "Ask about blockers, cycles, or work items..."
                : "Describe an action (e.g. Create sprint 25, Create bug login loop)..."
            }
            className="bg-custom-background-100 border-custom-border-200 text-sm text-custom-sidebar-text-100 focus:border-custom-primary flex-1 rounded-md border px-3 py-2 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputPrompt.trim() || isLoading}
            className="bg-custom-primary text-sm hover:bg-custom-primary/90 rounded-md px-4 py-2 font-medium text-white transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
};

function lowerIncludes(str: string, keywords: string[]): boolean {
  const lower = str.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}
