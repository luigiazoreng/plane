"use client";

import React, { useState } from "react";
import { observer } from "mobx-react";
import {
  AtSign,
  ChevronDown,
  Lock,
  MessageSquare,
  Send,
  Smile,
  Sparkles,
} from "lucide-react";
import { cn } from "@plane/utils";
import type { TPendingAttachment } from "@/components/helpdesk/attachments/use-attachment-upload";
import { AttachmentPicker } from "@/components/helpdesk/attachments/attachment-picker";
import { PendingAttachmentChips } from "@/components/helpdesk/attachments/attachment-chips";

type Props = {
  onAddComment: (content: string, isInternal: boolean) => Promise<void>;
  submitting: boolean;
  attachments: {
    pending: TPendingAttachment[];
    upload: (files: File[]) => void;
    remove: (id: string) => void;
  };
};

export const HelpdeskChatComposer = observer(function HelpdeskChatComposer({
  onAddComment,
  submitting,
  attachments,
}: Props) {
  const [isInternal, setIsInternal] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [showMacrosMenu, setShowMacrosMenu] = useState(false);

  const handleSubmit = async () => {
    if (!commentText.trim() || submitting) return;
    await onAddComment(commentText.trim(), isInternal);
    setCommentText("");
  };

  const applyMacro = (macroText: string) => {
    setCommentText((prev) => (prev ? `${prev}\n${macroText}` : macroText));
    setShowMacrosMenu(false);
  };

  return (
    <div className="border-0 border-t border-white/5 bg-[#141417] px-6 py-4">
      <div className="mx-auto max-w-4xl flex flex-col gap-3">
        {/* Top Mode Selector Tabs - Orange active underline as in Image 2 */}
        <div className="flex items-center gap-2 border-0 border-b border-white/5 pb-1">
          <button
            type="button"
            onClick={() => setIsInternal(false)}
            className={cn(
              "text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 transition-all border-b-2 -mb-1 cursor-pointer",
              !isInternal
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-custom-text-300 hover:text-custom-text-100"
            )}
          >
            <MessageSquare className="size-3.5" />
            Responder ao cliente
          </button>

          <button
            type="button"
            onClick={() => setIsInternal(true)}
            className={cn(
              "text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 transition-all border-b-2 -mb-1 cursor-pointer",
              isInternal
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-custom-text-300 hover:text-custom-text-100"
            )}
          >
            <Lock className="size-3.5" />
            Nota interna
          </button>
        </div>

        {/* Textarea Container Box */}
        <div
          className={cn(
            "rounded-xl border transition-all shadow-xs overflow-hidden",
            isInternal
              ? "border-amber-500/40 bg-[#251d14] focus-within:border-amber-500/60"
              : "border-white/10 bg-[#18181b] focus-within:border-orange-500/50"
          )}
        >
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={
              isInternal
                ? "Escreva uma nota interna..."
                : "Escreva sua resposta..."
            }
            className="text-sm text-custom-text-100 min-h-[80px] w-full resize-none bg-transparent p-4 outline-none placeholder:text-custom-text-400"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />

          <PendingAttachmentChips attachments={attachments.pending} onRemove={attachments.remove} />

          {/* Bottom Toolbar */}
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-2 border-0 border-t border-white/5 bg-[#141417]/80">
            {/* Tool Icons */}
            <div className="flex items-center gap-1.5">
              <AttachmentPicker onSelect={attachments.upload} disabled={submitting} />

              <button
                type="button"
                className="text-custom-text-300 hover:text-custom-text-100 p-1.5 rounded-lg hover:bg-[#202024] transition-colors cursor-pointer"
                title="Inserir emoji"
              >
                <Smile className="size-4" />
              </button>

              <button
                type="button"
                className="text-custom-text-300 hover:text-custom-text-100 p-1.5 rounded-lg hover:bg-[#202024] transition-colors cursor-pointer"
                title="Mencionar agente"
              >
                <AtSign className="size-4" />
              </button>

              {/* Macros Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMacrosMenu(!showMacrosMenu)}
                  className="text-xs text-custom-text-300 hover:text-custom-text-100 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-[#202024] transition-colors font-semibold cursor-pointer"
                >
                  Macros
                  <ChevronDown className="size-3" />
                </button>

                {showMacrosMenu && (
                  <div className="absolute bottom-full left-0 mb-1 w-64 rounded-xl border border-white/10 bg-[#1c1c20] p-2 shadow-xl z-20 space-y-1">
                    <button
                      type="button"
                      onClick={() => applyMacro("Olá! Recebemos sua solicitação e já estamos analisando.")}
                      className="w-full text-left text-xs text-custom-text-100 hover:bg-[#242428] rounded-lg p-2 transition-colors font-medium cursor-pointer"
                    >
                      Confirmação de recebimento
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMacro("Aguardando informações adicionais para prosseguir com o atendimento.")}
                      className="w-full text-left text-xs text-custom-text-100 hover:bg-[#242428] rounded-lg p-2 transition-colors font-medium cursor-pointer"
                    >
                      Solicitação de mais detalhes
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMacro("Sua solicitação foi resolvida. Por favor, confirme se está tudo correto.")}
                      className="w-full text-left text-xs text-custom-text-100 hover:bg-[#242428] rounded-lg p-2 transition-colors font-medium cursor-pointer"
                    >
                      Encerramento de ticket
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Action: Shortcut Hint + Primary Vibrant Orange Button */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-custom-text-400 font-medium hidden sm:inline">
                Ctrl / ⌘ + Enter para enviar
              </span>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !commentText.trim()}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-lg transition-all disabled:opacity-50 cursor-pointer shadow-sm",
                  isInternal
                    ? "bg-amber-600 hover:bg-amber-500"
                    : "bg-[#f97316] hover:bg-[#ea580c]"
                )}
              >
                <Send className="size-3.5" />
                {isInternal ? "Salvar nota" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
