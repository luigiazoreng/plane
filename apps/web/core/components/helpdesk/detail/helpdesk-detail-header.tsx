"use client";

import React from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Flame,
  History,
  Link2,
  MessageSquare,
  Paperclip,
  SlidersHorizontal,
  Star,
  Users,
} from "lucide-react";
import { cn } from "@plane/utils";
import type { IHelpdeskRequest, IHelpdeskStatus } from "@plane/types";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

type Props = {
  request: IHelpdeskRequest;
  statuses: IHelpdeskStatus[];
  statusMap: Record<string, IHelpdeskStatus>;
  activeTab: "conversa" | "anexos" | "atividades" | "historico";
  onTabChange: (tab: "conversa" | "anexos" | "atividades" | "historico") => void;
  attachmentsCount?: number;
  onUpdateStatus: (statusId: string) => void;
  onUpdatePriority: (priority: string) => void;
  onUpdateAssignees: (assignees: string[]) => void;
  onOpenIssueModal: () => void;
  onOpenForwardModal: () => void;
  wSlug: string;
  onToggleSidebar?: () => void;
};

const PRIORITY_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  urgent: {
    label: "Urgente",
    bg: "bg-rose-500/15",
    text: "text-rose-400",
  },
  high: {
    label: "Alta",
    bg: "bg-rose-500/15",
    text: "text-rose-400",
  },
  medium: {
    label: "Média",
    bg: "bg-amber-500/15",
    text: "text-amber-400",
  },
  low: {
    label: "Baixa",
    bg: "bg-sky-500/15",
    text: "text-sky-400",
  },
  none: {
    label: "Sem prioridade",
    bg: "bg-[#222226]",
    text: "text-custom-text-300",
  },
};

export const HelpdeskDetailHeader = observer(function HelpdeskDetailHeader({
  request,
  statuses,
  statusMap,
  activeTab,
  onTabChange,
  attachmentsCount = 0,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateAssignees,
  onOpenIssueModal,
  onOpenForwardModal,
  wSlug,
  onToggleSidebar,
}: Props) {
  const [isStarred, setIsStarred] = React.useState(false);
  const currentPriority = request.priority || "none";
  const priorityMeta = PRIORITY_CONFIG[currentPriority] ?? PRIORITY_CONFIG.none;
  const currentStatus = request.status && statusMap[request.status] ? statusMap[request.status] : null;

  return (
    <header className="flex w-full flex-col border-0 border-b border-white/5 bg-[#141417] shrink-0">
      {/* Row 1: Back Button, Ticket ID badge, Title, Priority Select & Action Buttons */}
      <div className="flex items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            to={`/${wSlug}/helpdesk`}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border-0 bg-[#222226] text-custom-text-300 hover:bg-[#28282d] hover:text-custom-text-100 transition-colors"
            title="Voltar para a lista de tickets"
          >
            <ArrowLeft className="size-4" />
          </Link>

          <div className="flex min-w-0 items-center gap-2.5">
            {request.display_id && (
              <span className="font-mono shrink-0 rounded-md border-0 bg-sky-500/15 px-2 py-0.5 text-xs font-bold text-sky-400">
                #{request.display_id}
              </span>
            )}

            <h1 className="truncate text-base font-bold text-custom-text-100 tracking-tight">
              {request.title}
            </h1>

            {/* Interactive Priority Selector */}
            <div className="relative shrink-0">
              <select
                value={currentPriority}
                onChange={(e) => onUpdatePriority(e.target.value)}
                className={cn(
                  "cursor-pointer rounded-full border-0 px-3 py-0.5 text-xs font-semibold outline-none transition-all appearance-none pr-6",
                  priorityMeta.bg,
                  priorityMeta.text
                )}
              >
                <option value="urgent" className="bg-[#18181b] text-custom-text-100">🔴 Urgente</option>
                <option value="high" className="bg-[#18181b] text-custom-text-100">🟠 Alta</option>
                <option value="medium" className="bg-[#18181b] text-custom-text-100">🟡 Média</option>
                <option value="low" className="bg-[#18181b] text-custom-text-100">🔵 Baixa</option>
                <option value="none" className="bg-[#18181b] text-custom-text-100">⚪ Sem prioridade</option>
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-70">
                ▼
              </span>
            </div>
          </div>
        </div>

        {/* Top Header Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsStarred(!isStarred)}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg border-0 bg-[#222226] transition-colors cursor-pointer",
              isStarred
                ? "bg-amber-500/20 text-amber-400"
                : "text-custom-text-300 hover:bg-[#28282d] hover:text-custom-text-100"
            )}
            title="Favoritar ticket"
          >
            <Star className="size-4" fill={isStarred ? "currentColor" : "none"} />
          </button>

          <button
            type="button"
            onClick={onOpenIssueModal}
            className="flex items-center gap-1.5 rounded-lg border-0 bg-[#222226] px-3 py-1.5 text-xs font-semibold text-custom-text-200 hover:bg-[#28282d] hover:text-custom-text-100 transition-all cursor-pointer"
          >
            <Link2 className="size-3.5 text-sky-400" />
            <span className="hidden sm:inline">Vincular Issue</span>
          </button>

          <button
            type="button"
            onClick={onOpenForwardModal}
            className="flex items-center gap-1.5 rounded-lg border-0 bg-[#222226] px-3 py-1.5 text-xs font-semibold text-custom-text-200 hover:bg-[#28282d] hover:text-custom-text-100 transition-all cursor-pointer"
          >
            <ArrowUpRight className="size-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Forward</span>
          </button>

          {/* Toggle Sidebar Button for smaller screens */}
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="flex items-center gap-1.5 rounded-lg border-0 bg-[#222226] px-3 py-1.5 text-xs font-semibold text-custom-text-200 hover:bg-[#28282d] hover:text-custom-text-100 transition-all cursor-pointer xl:hidden"
              title="Alternar detalhes do ticket"
            >
              <SlidersHorizontal className="size-3.5 text-sky-400" />
              <span className="hidden sm:inline">Detalhes</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Quick Properties Bar */}
      <div className="flex items-center gap-4 border-0 border-t border-b border-white/5 bg-[#18181b] px-6 py-2">
        {/* Status Dropdown Pill */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-custom-text-300">Status:</span>
          <select
            value={request.status ?? ""}
            onChange={(e) => onUpdateStatus(e.target.value)}
            className="cursor-pointer rounded-lg border border-amber-500/30 px-2.5 py-1 text-xs font-semibold outline-none transition-colors"
            style={
              currentStatus
                ? {
                    backgroundColor: `${currentStatus.color}20`,
                    color: currentStatus.color,
                  }
                : {
                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                    color: "#fbbf24",
                  }
            }
          >
            <option value="">Selecione status</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id} className="bg-[#18181b] text-custom-text-100">
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="h-4 w-px bg-white/10" />

        {/* Assignee Pill */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-custom-text-300">Atribuído a:</span>
          <MemberDropdown
            value={request.assignees}
            onChange={(assignees: string[]) => onUpdateAssignees(assignees)}
            multiple
            buttonVariant={request.assignees.length > 0 ? "transparent-without-text" : "border-without-text"}
            buttonClassName={
              request.assignees.length > 0
                ? "hover:bg-transparent px-1 py-0.5 text-xs font-medium"
                : "text-xs rounded-lg border-0 bg-[#222226] px-2 py-1"
            }
            placeholder="Ninguém"
          />
        </div>

        <div className="h-4 w-px bg-white/10" />

        {/* Team Pill */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-custom-text-300">Equipe:</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border-0 bg-[#222226] px-2.5 py-1 text-xs font-semibold text-custom-text-100">
            <Users className="size-3 text-sky-400" />
            Suporte N1
          </span>
        </div>
      </div>

      {/* Row 3: Sub-tabs Navigation - Orange active underline matching Reference Image 2 */}
      <div className="flex items-center gap-1 px-6 pt-1">
        <button
          type="button"
          onClick={() => onTabChange("conversa")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors border-0 border-b-2 -mb-px cursor-pointer",
            activeTab === "conversa"
              ? "border-b-orange-500 text-orange-400"
              : "border-b-transparent text-custom-text-300 hover:text-custom-text-100 hover:bg-[#222226] rounded-t-md"
          )}
        >
          <MessageSquare className="size-3.5" />
          Conversa
        </button>

        <button
          type="button"
          onClick={() => onTabChange("anexos")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors border-0 border-b-2 -mb-px cursor-pointer",
            activeTab === "anexos"
              ? "border-b-orange-500 text-orange-400"
              : "border-b-transparent text-custom-text-300 hover:text-custom-text-100 hover:bg-[#222226] rounded-t-md"
          )}
        >
          <Paperclip className="size-3.5" />
          Anexos
          {attachmentsCount > 0 && (
            <span className="rounded-full bg-orange-500/20 border-0 px-1.5 py-0.2 text-[10px] font-bold text-orange-300">
              {attachmentsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onTabChange("atividades")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors border-0 border-b-2 -mb-px cursor-pointer",
            activeTab === "atividades"
              ? "border-b-orange-500 text-orange-400"
              : "border-b-transparent text-custom-text-300 hover:text-custom-text-100 hover:bg-[#222226] rounded-t-md"
          )}
        >
          <Flame className="size-3.5" />
          Atividades
        </button>

        <button
          type="button"
          onClick={() => onTabChange("historico")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors border-0 border-b-2 -mb-px cursor-pointer",
            activeTab === "historico"
              ? "border-b-orange-500 text-orange-400"
              : "border-b-transparent text-custom-text-300 hover:text-custom-text-100 hover:bg-[#222226] rounded-t-md"
          )}
        >
          <History className="size-3.5" />
          Histórico
        </button>
      </div>
    </header>
  );
});
