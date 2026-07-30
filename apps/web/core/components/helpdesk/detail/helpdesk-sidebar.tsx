"use client";

import React, { useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  ExternalLink,
  FolderTree,
  Headset,
  Link2,
  Plus,
  ShieldCheck,
  Tag,
  User,
  X,
} from "lucide-react";
import { Button } from "@plane/propel/button";
import type {
  IHelpdeskRequest,
  IHelpdeskRequestIntakeIssue,
  IHelpdeskRequestIssue,
  IHelpdeskStatus,
} from "@plane/types";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { generateWorkItemLink } from "@plane/utils";

type Props = {
  request: IHelpdeskRequest;
  statuses: IHelpdeskStatus[];
  statusMap: Record<string, IHelpdeskStatus>;
  linkedIssues: IHelpdeskRequestIssue[];
  intakeLinks: IHelpdeskRequestIntakeIssue[];
  unresolvedLinkedIssues: string[];
  issueMap: Record<string, any>;
  wSlug: string;
  rId: string;
  onUpdateStatus: (statusId: string) => void;
  onUpdatePriority: (priority: string) => void;
  onUpdateAssignees: (assignees: string[]) => void;
  onOpenIssueModal: () => void;
  onOpenForwardModal: () => void;
  onUnlinkIssue: (requestIssueId: string) => void;
  onUnlinkIntakeIssue: (requestIntakeIssueId: string) => void;
  getProjectById: (projectId: string) => any;
  getProjectIdentifierById: (projectId: string) => any;
  updateRequestField: (data: Partial<IHelpdeskRequest>) => void;
  onCloseMobile?: () => void;
};

function getInitials(name?: string | null): string {
  if (!name) return "?";
  const cleanName = name.replace(/\s*\([^)]*\)/g, "").trim();
  const parts = cleanName.split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const HelpdeskSidebar = observer(function HelpdeskSidebar({
  request,
  statuses,
  statusMap,
  linkedIssues,
  intakeLinks,
  unresolvedLinkedIssues,
  issueMap,
  wSlug,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateAssignees,
  onOpenIssueModal,
  onOpenForwardModal,
  getProjectIdentifierById,
  onCloseMobile,
}: Props) {
  // Collapsible Accordion sections state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    atendimento: true,
    cliente: true,
    classificacao: true,
    desenvolvimento: true,
    tecnica: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const [tags, setTags] = useState<string[]>(["api", "erro"]);
  const [newTagInput, setNewTagInput] = useState("");
  const [showAddTag, setShowAddTag] = useState(false);

  const addTag = () => {
    if (newTagInput.trim() && !tags.includes(newTagInput.trim().toLowerCase())) {
      setTags([...tags, newTagInput.trim().toLowerCase()]);
      setNewTagInput("");
      setShowAddTag(false);
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const currentPriority = request.priority || "none";
  const customerEmail = request.contact_email || "cliente@empresa.com";
  const customerName = customerEmail.split("@")[0].replace(".", " ");

  return (
    <aside className="w-full h-full shrink-0 overflow-y-auto border-0 border-l border-white/10 bg-[#121214] p-4 space-y-3.5 select-none">
      {/* Mobile Drawer Header */}
      {onCloseMobile && (
        <div className="flex items-center justify-between pb-2 border-0 border-b border-white/5 xl:hidden">
          <h3 className="text-xs font-bold text-custom-text-100 uppercase tracking-wider">
            Detalhes do Ticket
          </h3>
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1 text-custom-text-300 hover:text-custom-text-100 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* SECTION 1: Atendimento */}
      <div className="rounded-xl border-0 bg-[#18181b] shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("atendimento")}
          className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-custom-text-100 bg-[#141417] hover:bg-[#1a1a1e] transition-colors border-0 border-b border-white/5 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Headset className="size-4 text-sky-400" />
            <span>Atendimento</span>
          </div>
          {openSections.atendimento ? <ChevronUp className="size-3.5 text-custom-text-400" /> : <ChevronDown className="size-3.5 text-custom-text-400" />}
        </button>

        {openSections.atendimento && (
          <div className="p-3.5 space-y-3 text-xs">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-custom-text-400 font-medium">Status</span>
              <select
                value={request.status ?? ""}
                onChange={(e) => onUpdateStatus(e.target.value)}
                className="text-xs cursor-pointer rounded-lg border-0 px-2.5 py-1 font-semibold outline-none transition-colors"
                style={
                  request.status && statusMap[request.status]
                    ? {
                        backgroundColor: `${statusMap[request.status].color}20`,
                        color: statusMap[request.status].color,
                      }
                    : undefined
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

            {/* Prioridade */}
            <div className="flex items-center justify-between">
              <span className="text-custom-text-400 font-medium">Prioridade</span>
              <select
                value={currentPriority}
                onChange={(e) => onUpdatePriority(e.target.value)}
                className="text-xs font-semibold rounded-lg border-0 bg-[#222226] px-2.5 py-1 outline-none text-custom-text-100 cursor-pointer"
              >
                <option value="urgent" className="bg-[#18181b]">🔴 Urgente</option>
                <option value="high" className="bg-[#18181b]">🟠 Alta</option>
                <option value="medium" className="bg-[#18181b]">🟡 Média</option>
                <option value="low" className="bg-[#18181b]">🔵 Baixa</option>
                <option value="none" className="bg-[#18181b]">⚪ Sem prioridade</option>
              </select>
            </div>

            {/* Responsável */}
            <div className="flex items-center justify-between">
              <span className="text-custom-text-400 font-medium">Responsável</span>
              <MemberDropdown
                value={request.assignees}
                onChange={(assignees: string[]) => onUpdateAssignees(assignees)}
                multiple
                buttonVariant={request.assignees.length > 0 ? "transparent-without-text" : "border-without-text"}
                buttonClassName={request.assignees.length > 0 ? "hover:bg-transparent px-0 text-xs font-medium" : "text-xs rounded-lg border-0 bg-[#222226] px-2 py-1"}
                placeholder="Ninguém"
              />
            </div>

            {/* Equipe */}
            <div className="flex items-center justify-between">
              <span className="text-custom-text-400 font-medium">Equipe</span>
              <span className="text-custom-text-100 font-semibold bg-[#222226] border-0 px-2 py-0.5 rounded-md">
                Suporte N1
              </span>
            </div>

            {/* SLA Progress Bar */}
            <div className="pt-2.5 border-0 border-t border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-custom-text-400 font-medium flex items-center gap-1">
                  <ShieldCheck className="size-3.5 text-emerald-400" />
                  SLA
                </span>
                <span className="text-xs font-bold text-sky-400 flex items-center gap-1">
                  <Clock className="size-3 text-sky-400" />
                  02h 14m restantes
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#222226] overflow-hidden border-0">
                <div className="h-full rounded-full bg-sky-500 w-[65%]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: Cliente */}
      <div className="rounded-xl border-0 bg-[#18181b] shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("cliente")}
          className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-custom-text-100 bg-[#141417] hover:bg-[#1a1a1e] transition-colors border-0 border-b border-white/5 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <User className="size-4 text-purple-400" />
            <span>Cliente</span>
          </div>
          {openSections.cliente ? <ChevronUp className="size-3.5 text-custom-text-400" /> : <ChevronDown className="size-3.5 text-custom-text-400" />}
        </button>

        {openSections.cliente && (
          <div className="p-3.5 space-y-3.5 text-xs">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-purple-400 font-bold text-sm border-0 shadow-xs">
                {getInitials(customerName)}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-custom-text-100 capitalize truncate">
                  {customerName}
                </h4>
                <p className="text-xs text-custom-text-400 truncate">{customerEmail}</p>
                <button
                  type="button"
                  className="text-[11px] text-sky-400 hover:underline flex items-center gap-0.5 mt-0.5 font-semibold cursor-pointer"
                >
                  <span>Ver perfil completo</span>
                  <ExternalLink className="size-2.5" />
                </button>
              </div>
            </div>

            {/* Stats Grid: 3 columns */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-[#222226] p-2.5 shadow-xs border-0">
                <span className="block text-base font-bold text-custom-text-100">5</span>
                <span className="text-[10px] text-custom-text-400 font-medium leading-tight">Tickets anteriores</span>
              </div>
              <div className="rounded-lg bg-sky-500/15 p-2.5 shadow-xs border-0">
                <span className="block text-base font-bold text-sky-400">3</span>
                <span className="text-[10px] text-sky-300/80 font-medium leading-tight">Tickets abertos</span>
              </div>
              <div className="rounded-lg bg-emerald-500/15 p-2.5 shadow-xs border-0">
                <span className="block text-base font-bold text-emerald-400">2</span>
                <span className="text-[10px] text-emerald-300/80 font-medium leading-tight">Resolvidos</span>
              </div>
            </div>

            {/* Client History Details */}
            <div className="space-y-2 pt-1 border-0 border-t border-white/5">
              <div className="flex justify-between">
                <span className="text-custom-text-400">Última atividade</span>
                <span className="text-custom-text-100 font-medium">Agora</span>
              </div>
              <div className="flex justify-between">
                <span className="text-custom-text-400">Primeiro contato</span>
                <span className="text-custom-text-100 font-medium">15/03/2026</span>
              </div>
              <div className="flex justify-between">
                <span className="text-custom-text-400">Canal</span>
                <span className="text-custom-text-100 font-medium">
                  {request.source === "public_form" ? "Formulário público" : "E-mail"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: Classificação */}
      <div className="rounded-xl border-0 bg-[#18181b] shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("classificacao")}
          className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-custom-text-100 bg-[#141417] hover:bg-[#1a1a1e] transition-colors border-0 border-b border-white/5 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <FolderTree className="size-4 text-blue-400" />
            <span>Classificação</span>
          </div>
          {openSections.classificacao ? <ChevronUp className="size-3.5 text-custom-text-400" /> : <ChevronDown className="size-3.5 text-custom-text-400" />}
        </button>

        {openSections.classificacao && (
          <div className="p-3.5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-custom-text-400">Categoria</span>
              <select className="text-xs rounded-lg border-0 bg-[#222226] px-2.5 py-1 text-custom-text-100 font-medium outline-none cursor-pointer">
                <option value="sistema">Sistema</option>
                <option value="financeiro">Financeiro</option>
                <option value="duvida">Dúvida</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-custom-text-400">Subcategoria</span>
              <select className="text-xs rounded-lg border-0 bg-[#222226] px-2.5 py-1 text-custom-text-100 font-medium outline-none cursor-pointer">
                <option value="api">API</option>
                <option value="autenticacao">Autenticação</option>
                <option value="relatorio">Relatórios</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-custom-text-400">Tipo</span>
              <select className="text-xs rounded-lg border-0 bg-[#222226] px-2.5 py-1 text-custom-text-100 font-medium outline-none cursor-pointer">
                <option value="erro">Erro / Bug</option>
                <option value="melhoria">Melhoria</option>
                <option value="duvida">Dúvida</option>
              </select>
            </div>

            {/* Tags */}
            <div className="pt-2.5 border-0 border-t border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-custom-text-400 font-medium flex items-center gap-1">
                  <Tag className="size-3 text-custom-text-400" />
                  Tags
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-500/15 border-0 px-2.5 py-0.5 text-xs text-sky-400 font-semibold"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="text-sky-400/70 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {showAddTag ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addTag()}
                      placeholder="Tag..."
                      className="w-16 rounded border-0 bg-[#222226] px-1.5 py-0.5 text-xs outline-none"
                    />
                    <button type="button" onClick={addTag} className="text-xs text-sky-400 font-bold cursor-pointer">
                      ✓
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddTag(true)}
                    className="inline-flex items-center justify-center size-6 rounded-md border-0 bg-[#222226] text-custom-text-300 hover:text-custom-text-100 transition-colors cursor-pointer"
                    title="Adicionar tag"
                  >
                    <Plus className="size-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: Desenvolvimento */}
      <div className="rounded-xl border-0 bg-[#18181b] shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("desenvolvimento")}
          className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-custom-text-100 bg-[#141417] hover:bg-[#1a1a1e] transition-colors border-0 border-b border-white/5 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Code2 className="size-4 text-emerald-400" />
            <span>Desenvolvimento</span>
          </div>
          {openSections.desenvolvimento ? <ChevronUp className="size-3.5 text-custom-text-400" /> : <ChevronDown className="size-3.5 text-custom-text-400" />}
        </button>

        {openSections.desenvolvimento && (
          <div className="p-3.5 space-y-3.5 text-xs">
            {/* Forward to Pipeline */}
            <div className="flex items-center justify-between">
              <span className="text-custom-text-400 font-medium">Pipeline</span>
              <Button variant="secondary" size="sm" onClick={onOpenForwardModal}>
                <span className="flex items-center gap-1.5">
                  Forward
                  <ArrowUpRight className="size-3.5 text-emerald-400" />
                </span>
              </Button>
            </div>

            {/* Linked Issue Card */}
            <div className="pt-2 border-0 border-t border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-custom-text-400 font-medium flex items-center gap-1">
                  <Link2 className="size-3" />
                  Issue vinculada
                </span>
                <button
                  type="button"
                  onClick={onOpenIssueModal}
                  className="text-xs text-sky-400 hover:underline font-semibold cursor-pointer"
                >
                  + Vincular
                </button>
              </div>

              {linkedIssues.length === 0 ? (
                <p className="text-xs text-custom-text-400 italic">Nenhuma issue vinculada.</p>
              ) : (
                linkedIssues.map((requestIssue) => {
                  const issue = issueMap[requestIssue.issue];
                  const projectIdentifier = getProjectIdentifierById(issue?.project_id);
                  const workItemLink =
                    issue && issue.project_id && projectIdentifier
                      ? generateWorkItemLink({
                          workspaceSlug: wSlug,
                          projectId: issue.project_id,
                          issueId: requestIssue.issue,
                          projectIdentifier,
                          sequenceId: issue.sequence_id,
                        })
                      : undefined;

                  return (
                    <div
                      key={requestIssue.id}
                      className="rounded-lg border-0 bg-[#222226] p-2.5 flex items-center justify-between gap-2 hover:bg-[#28282d] transition-all shadow-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-bold text-sky-400 bg-sky-500/10 border-0 px-1.5 py-0.5 rounded">
                          {projectIdentifier ? `${projectIdentifier}-${issue?.sequence_id}` : "GRO-123"}
                        </span>
                        <span className="text-xs font-semibold text-custom-text-100 truncate">
                          {issue?.name || "Issue de desenvolvimento"}
                        </span>
                      </div>
                      {workItemLink && (
                        <Link to={workItemLink} className="text-custom-text-300 hover:text-sky-400" title="Ver issue">
                          <ExternalLink className="size-3.5" />
                        </Link>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 5: Informações técnicas */}
      {Object.keys(request.form_responses || {}).length > 0 && (
        <div className="rounded-xl border-0 bg-[#18181b] shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("tecnica")}
            className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-custom-text-100 bg-[#141417] hover:bg-[#1a1a1e] transition-colors border-0 border-b border-white/5 cursor-pointer"
          >
            <span>Informações técnicas</span>
            {openSections.tecnica ? <ChevronUp className="size-3.5 text-custom-text-400" /> : <ChevronDown className="size-3.5 text-custom-text-400" />}
          </button>

          {openSections.tecnica && (
            <div className="p-3.5 space-y-2 text-xs">
              {Object.entries(request.form_responses || {}).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-2">
                  <span className="text-custom-text-400 capitalize">{key.replace(/_/g, " ")}</span>
                  <span className="text-custom-text-100 font-medium truncate max-w-[60%]">{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
});
