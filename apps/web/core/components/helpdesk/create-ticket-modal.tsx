/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type {
  IHelpdeskCustomer,
  IHelpdeskForm,
  IHelpdeskPortal,
  IHelpdeskStatus,
  IHelpdeskTeam,
  TIssuePriorities,
} from "@plane/types";
import { Button } from "@plane/propel/button";
import { UserPlus } from "lucide-react";

type TCreateTicketModalProps = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  portals: IHelpdeskPortal[];
  forms: IHelpdeskForm[];
  statuses: IHelpdeskStatus[];
  teams?: IHelpdeskTeam[];
  customers: IHelpdeskCustomer[];
  onFetchCustomers: () => Promise<IHelpdeskCustomer[]>;
  onCreateCustomer: (customer: { name: string; email: string }) => Promise<IHelpdeskCustomer>;
  onSubmit: (payload: {
    title: string;
    description: string;
    portal: string;
    form?: string;
    status?: string;
    priority?: TIssuePriorities;
    team?: string;
    customer?: string;
    contact_email?: string;
  }) => Promise<void>;
};

export function CreateTicketModal({
  isOpen,
  onClose,
  workspaceSlug: _workspaceSlug,
  portals,
  forms,
  statuses,
  teams = [],
  customers,
  onFetchCustomers,
  onCreateCustomer,
  onSubmit,
}: TCreateTicketModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [portalId, setPortalId] = useState("");
  const [formId, setFormId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [priority, setPriority] = useState<TIssuePriorities>("none");
  const [teamId, setTeamId] = useState("");

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [isCreatingNewCustomer, setIsCreatingNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setDescription("");
    const defaultPortal = portals[0]?.id || "";
    setPortalId(defaultPortal);
    setFormId("");
    const defaultStatus = statuses.find((s) => s.is_default)?.id || statuses[0]?.id || "";
    setStatusId(defaultStatus);
    setPriority("none");
    setTeamId("");
    setSelectedCustomerId("");
    setIsCreatingNewCustomer(false);
    setNewCustomerName("");
    setNewCustomerEmail("");
    void onFetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !portalId) return;

    setIsSubmitting(true);
    try {
      let finalCustomerId = selectedCustomerId;
      let contactEmail: string | undefined = undefined;

      if (isCreatingNewCustomer) {
        if (newCustomerEmail.trim()) {
          const created = await onCreateCustomer({
            name: newCustomerName.trim() || newCustomerEmail.trim(),
            email: newCustomerEmail.trim(),
          });
          if (created?.id) {
            finalCustomerId = created.id;
            contactEmail = created.email;
          }
        }
      } else if (selectedCustomerId) {
        const found = customers.find((c) => c.id === selectedCustomerId);
        if (found) {
          contactEmail = found.email;
        }
      }

      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        portal: portalId,
        form: formId || undefined,
        status: statusId || undefined,
        priority,
        team: teamId || undefined,
        customer: finalCustomerId || undefined,
        contact_email: contactEmail,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredForms = forms.filter((f) => !portalId || f.portal === portalId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="shadow-2xl flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-subtle bg-surface-1">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-primary">Criar Novo Ticket de Helpdesk</h2>
            <p className="text-12 text-tertiary">
              Criado por você como Agente do Helpdesk. Opcionalmente vincule a um cliente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-tertiary transition-colors hover:bg-layer-2 hover:text-primary"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-6">
          {/* Title */}
          <div>
            <label htmlFor="ticket-title" className="mb-1.5 block text-12 font-medium text-secondary">
              Título do Ticket <span className="text-danger-primary">*</span>
            </label>
            <input
              id="ticket-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Descreva o problema ou solicitação..."
              className="w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary transition-colors outline-none focus:border-strong"
            />
          </div>

          {/* Customer Selection */}
          <div className="space-y-3 rounded-lg border border-subtle bg-layer-1 p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-12 font-semibold text-primary">
                <UserPlus className="size-3.5 text-accent-primary" />
                Cliente Vinculado (Solicitante)
              </span>
              <button
                type="button"
                onClick={() => setIsCreatingNewCustomer(!isCreatingNewCustomer)}
                className="text-12 font-medium text-accent-primary hover:underline"
              >
                {isCreatingNewCustomer ? "← Selecionar da lista" : "+ Cadastrar Novo Cliente"}
              </button>
            </div>

            {isCreatingNewCustomer ? (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label htmlFor="new-customer-name" className="mb-1 block text-11 text-tertiary">
                    Nome do Cliente
                  </label>
                  <input
                    id="new-customer-name"
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Nome completo"
                    className="w-full rounded border border-subtle bg-surface-1 px-2.5 py-1.5 text-12 text-primary outline-none focus:border-strong"
                  />
                </div>
                <div>
                  <label htmlFor="new-customer-email" className="mb-1 block text-11 text-tertiary">
                    E-mail do Cliente <span className="text-danger-primary">*</span>
                  </label>
                  <input
                    id="new-customer-email"
                    type="email"
                    required={isCreatingNewCustomer}
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    placeholder="cliente@exemplo.com"
                    className="w-full rounded border border-subtle bg-surface-1 px-2.5 py-1.5 text-12 text-primary outline-none focus:border-strong"
                  />
                </div>
              </div>
            ) : (
              <div>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 text-13 text-primary transition-colors outline-none focus:border-strong"
                >
                  <option value="">Nenhum cliente (Ticket interno de agente)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ? `${c.name} (${c.email})` : c.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="ticket-description" className="mb-1.5 block text-12 font-medium text-secondary">
              Descrição do Problema
            </label>
            <textarea
              id="ticket-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes adicionais sobre o atendimento..."
              className="w-full resize-y rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary transition-colors outline-none focus:border-strong"
            />
          </div>

          {/* Grid of properties */}
          <div className="grid grid-cols-2 gap-4">
            {/* Portal */}
            <div>
              <label htmlFor="ticket-portal" className="mb-1.5 block text-12 font-medium text-secondary">
                Portal <span className="text-danger-primary">*</span>
              </label>
              <select
                id="ticket-portal"
                required
                value={portalId}
                onChange={(e) => {
                  setPortalId(e.target.value);
                  setFormId("");
                }}
                className="w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none focus:border-strong"
              >
                {portals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.public_slug}
                  </option>
                ))}
              </select>
            </div>

            {/* Form */}
            <div>
              <label htmlFor="ticket-form" className="mb-1.5 block text-12 font-medium text-secondary">
                Formulário
              </label>
              <select
                id="ticket-form"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                className="w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none focus:border-strong"
              >
                <option value="">Formulário padrão</option>
                {filteredForms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name || f.slug}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label htmlFor="ticket-status" className="mb-1.5 block text-12 font-medium text-secondary">
                Status
              </label>
              <select
                id="ticket-status"
                value={statusId}
                onChange={(e) => setStatusId(e.target.value)}
                className="w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none focus:border-strong"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label htmlFor="ticket-priority" className="mb-1.5 block text-12 font-medium text-secondary">
                Prioridade
              </label>
              <select
                id="ticket-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TIssuePriorities)}
                className="w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none focus:border-strong"
              >
                <option value="none">Nenhuma (None)</option>
                <option value="low">Baixa (Low)</option>
                <option value="medium">Média (Medium)</option>
                <option value="high">Alta (High)</option>
                <option value="urgent">Urgente (Urgent)</option>
              </select>
            </div>
          </div>

          {/* Team */}
          {teams.length > 0 && (
            <div>
              <label htmlFor="ticket-team" className="mb-1.5 block text-12 font-medium text-secondary">
                Time Responsável
              </label>
              <select
                id="ticket-team"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none focus:border-strong"
              >
                <option value="">Sem time</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-subtle pt-4">
            <Button variant="secondary" size="sm" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" type="submit" loading={isSubmitting}>
              Criar Ticket
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
