/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { Badge } from "@plane/propel/badge";
import { Button } from "@plane/propel/button";
import { Switch } from "@plane/propel/switch";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IHelpdeskPortal, IHelpdeskStatus } from "@plane/types";
import { cn } from "@plane/utils";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ExternalLink,
  Globe,
  Headset,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/core/app-header";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";

// Simple hex color palette for status creation
const COLOR_PALETTE = [
  "#F97316", "#EF4444", "#F59E0B", "#EAB308",
  "#84CC16", "#22C55E", "#10B981", "#14B8A6",
  "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6",
  "#A855F7", "#EC4899", "#64748B", "#78716C",
];

const HelpdeskSettingsPage = observer(() => {
  const { workspaceSlug } = useParams();
  const navigate = useNavigate();
  const helpdeskStore = useHelpdesk();

  const wSlug = workspaceSlug?.toString() || "";

  // ---- Status state ----
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState(COLOR_PALETTE[0]);
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  const [editingStatus, setEditingStatus] = useState<{ id: string; name: string; color: string } | null>(null);
  const [deletingStatusId, setDeletingStatusId] = useState<string | null>(null);

  // ---- Portal state ----
  const [newPortalSlug, setNewPortalSlug] = useState("");
  const [isCreatingPortal, setIsCreatingPortal] = useState(false);
  const [editingSlug, setEditingSlug] = useState<{ id: string; value: string } | null>(null);
  const [deletingPortalId, setDeletingPortalId] = useState<string | null>(null);

  useEffect(() => {
    if (!wSlug) return;
    helpdeskStore.fetchStatuses(wSlug);
    helpdeskStore.fetchPortals(wSlug);
  }, [wSlug, helpdeskStore]);

  const statuses = helpdeskStore.getWorkspaceStatuses(wSlug);
  const portals = helpdeskStore.getWorkspacePortals(wSlug);
  const portalsState = helpdeskStore.getCollectionState(`portals:${wSlug}`);
  const statusesState = helpdeskStore.getCollectionState(`statuses:${wSlug}`);

  // ---- Status handlers ----

  const handleCreateStatus = async () => {
    if (!newStatusName.trim()) return;
    try {
      await helpdeskStore.createStatus(wSlug, {
        name: newStatusName.trim(),
        color: newStatusColor,
        sequence: (statuses[statuses.length - 1]?.sequence ?? 0) + 10000,
        is_default: statuses.length === 0,
      });
      setNewStatusName("");
      setNewStatusColor(COLOR_PALETTE[0]);
      setIsAddingStatus(false);
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to create status" });
    }
  };

  const handleSaveStatus = async () => {
    if (!editingStatus || !editingStatus.name.trim()) return;
    try {
      await helpdeskStore.updateStatus(wSlug, editingStatus.id, {
        name: editingStatus.name.trim(),
        color: editingStatus.color,
      });
      setEditingStatus(null);
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update status" });
    }
  };

  const handleDeleteStatus = async (statusId: string) => {
    try {
      await helpdeskStore.deleteStatus(wSlug, statusId);
      setDeletingStatusId(null);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Status deleted" });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to delete status" });
    }
  };

  const handleSetDefault = async (statusId: string) => {
    try {
      await helpdeskStore.setDefaultStatus(wSlug, statusId);
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to set default status" });
    }
  };

  const handleMoveStatus = async (index: number, direction: "up" | "down") => {
    const newStatuses = [...statuses];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newStatuses.length) return;

    // Swap sequences
    const a = newStatuses[index];
    const b = newStatuses[targetIndex];
    const items = [
      { id: a.id, sequence: b.sequence },
      { id: b.id, sequence: a.sequence },
    ];
    try {
      await helpdeskStore.reorderStatuses(wSlug, items);
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to reorder statuses" });
    }
  };

  // ---- Portal handlers ----

  const handleCreatePortal = async () => {
    if (!newPortalSlug.trim()) return;
    setIsCreatingPortal(true);
    try {
      await helpdeskStore.createPortal(wSlug, {
        public_slug: newPortalSlug.trim(),
        require_login: false,
        is_public: true,
        enable_chat: false,
      });
      setNewPortalSlug("");
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Portal created", message: `/${newPortalSlug.trim()} is live` });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to create portal" });
    } finally {
      setIsCreatingPortal(false);
    }
  };

  const handleToggle = async (portal: IHelpdeskPortal, field: keyof IHelpdeskPortal) => {
    try {
      await helpdeskStore.updatePortal(wSlug, portal.id, { [field]: !portal[field] });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update portal" });
    }
  };

  const handleSaveSlug = async () => {
    if (!editingSlug || !editingSlug.value.trim()) return;
    try {
      await helpdeskStore.updatePortal(wSlug, editingSlug.id, { public_slug: editingSlug.value.trim() });
      setEditingSlug(null);
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update slug" });
    }
  };

  const handleDeletePortal = async (portalId: string) => {
    try {
      await helpdeskStore.deletePortal(wSlug, portalId);
      setDeletingPortalId(null);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Portal deleted" });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to delete portal" });
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      <AppHeader
        header={
          <div className="flex w-full items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/${wSlug}/helpdesk`)}
              className="text-tertiary transition-colors hover:text-primary"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-custom-sidebar-accent/15 text-custom-sidebar-accent">
              <Headset className="size-3.5" />
            </div>
            <span className="text-sm font-semibold text-primary">Helpdesk Settings</span>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-10 p-6">

          {/* ── Statuses ── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-primary">Statuses</h2>
                <p className="mt-0.5 text-13 text-tertiary">
                  Customise the statuses for your helpdesk tickets. Drag to reorder.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingStatus(true)}
                className="flex items-center gap-1.5 rounded-md border border-subtle bg-layer-2 px-3 py-1.5 text-13 font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
              >
                <Plus className="size-3.5" />
                Add status
              </button>
            </div>

            {statusesState.isLoading && statuses.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-accent-strong" />
              </div>
            ) : (
              <div className="rounded-xl border border-subtle bg-layer-2 divide-y divide-subtle overflow-hidden">
                {statuses.map((status, index) => (
                  <StatusRow
                    key={status.id}
                    status={status}
                    index={index}
                    total={statuses.length}
                    isEditing={editingStatus?.id === status.id}
                    editValue={editingStatus?.id === status.id ? editingStatus : null}
                    onEdit={() => setEditingStatus({ id: status.id, name: status.name, color: status.color })}
                    onEditChange={(patch) => setEditingStatus((prev) => prev ? { ...prev, ...patch } : prev)}
                    onSave={handleSaveStatus}
                    onCancelEdit={() => setEditingStatus(null)}
                    onDelete={() => setDeletingStatusId(status.id)}
                    onSetDefault={() => handleSetDefault(status.id)}
                    onMoveUp={() => handleMoveStatus(index, "up")}
                    onMoveDown={() => handleMoveStatus(index, "down")}
                  />
                ))}

                {/* Inline add form */}
                {isAddingStatus && (
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex items-center gap-3">
                      {/* Color picker */}
                      <ColorPicker value={newStatusColor} onChange={setNewStatusColor} />
                      <input
                        autoFocus
                        value={newStatusName}
                        onChange={(e) => setNewStatusName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateStatus();
                          if (e.key === "Escape") { setIsAddingStatus(false); setNewStatusName(""); }
                        }}
                        placeholder="Status name..."
                        className="min-w-0 flex-1 rounded-md border border-subtle bg-layer-1 px-3 py-1.5 text-13 text-primary outline-none focus:border-accent-strong placeholder:text-tertiary"
                      />
                      <button
                        type="button"
                        onClick={handleCreateStatus}
                        disabled={!newStatusName.trim()}
                        className="rounded-md bg-accent-strong px-3 py-1.5 text-13 font-medium text-white disabled:opacity-40 transition-opacity"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsAddingStatus(false); setNewStatusName(""); }}
                        className="text-tertiary hover:text-primary"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                )}

                {statuses.length === 0 && !isAddingStatus && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <p className="text-13 font-medium text-primary">No statuses yet</p>
                    <p className="mt-1 text-13 text-tertiary">Add your first status above.</p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Portals ── */}
          <section>
            <div className="mb-4">
              <h2 className="text-base font-semibold text-primary">Portals</h2>
              <p className="mt-0.5 text-13 text-tertiary">
                Each portal gets a public URL where customers can submit tickets.
              </p>
            </div>

            {/* Create portal */}
            <div className="mb-4 rounded-xl border border-dashed border-subtle bg-layer-2 p-4">
              <p className="mb-2 text-12 font-medium uppercase tracking-wider text-tertiary">New portal</p>
              <div className="flex gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 focus-within:border-accent-strong">
                  <span className="shrink-0 text-tertiary">/helpdesk/p/</span>
                  <input
                    value={newPortalSlug}
                    onChange={(e) => setNewPortalSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="support-acme"
                    className="min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-tertiary"
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreatePortal(); }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreatePortal}
                  disabled={!newPortalSlug.trim() || isCreatingPortal}
                  className="flex items-center gap-1.5 rounded-md bg-accent-strong px-3 py-1.5 text-13 font-medium text-white disabled:opacity-40 transition-opacity"
                >
                  <Plus className="size-3.5" />
                  Create
                </button>
              </div>
            </div>

            {/* Portal list */}
            {portalsState.isLoading && portals.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-accent-strong" />
              </div>
            ) : portals.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-subtle py-10 text-center">
                <Globe className="mb-3 size-7 text-tertiary" />
                <p className="text-13 font-medium text-primary">No portals yet</p>
                <p className="mt-1 text-13 text-tertiary">Create one above to start receiving requests.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {portals.map((portal) => (
                  <div key={portal.id} className="rounded-xl border border-subtle bg-layer-2">
                    <div className="flex items-center justify-between gap-4 border-b border-subtle px-4 py-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {editingSlug?.id === portal.id ? (
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-accent-strong bg-layer-1 px-2 py-1 text-13">
                              <span className="shrink-0 text-tertiary">/helpdesk/p/</span>
                              <input
                                autoFocus
                                value={editingSlug.value}
                                onChange={(e) =>
                                  setEditingSlug({ ...editingSlug, value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })
                                }
                                className="min-w-0 flex-1 bg-transparent text-primary outline-none"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveSlug();
                                  if (e.key === "Escape") setEditingSlug(null);
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleSaveSlug}
                              className="rounded-md bg-accent-strong px-2.5 py-1 text-12 font-medium text-white"
                            >
                              Save
                            </button>
                            <button type="button" onClick={() => setEditingSlug(null)} className="text-tertiary hover:text-primary">
                              <X className="size-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="truncate text-13 font-medium text-primary">
                              /helpdesk/p/{portal.public_slug}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingSlug({ id: portal.id, value: portal.public_slug })}
                              className="shrink-0 text-tertiary transition-colors hover:text-primary"
                              title="Edit slug"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant={portal.is_public ? "success" : "neutral"} size="sm">
                          {portal.is_public ? "Public" : "Private"}
                        </Badge>
                        <a
                          href={`/helpdesk/p/${portal.public_slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-tertiary transition-colors hover:text-primary"
                          title="Open portal"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => setDeletingPortalId(portal.id)}
                          className="text-tertiary transition-colors hover:text-red-500"
                          title="Delete portal"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-subtle">
                      <SettingRow
                        label="Public access"
                        description="Anyone with the link can view and submit requests without logging in."
                        control={<Switch value={portal.is_public} onChange={() => handleToggle(portal, "is_public")} />}
                      />
                      <SettingRow
                        label="Require login"
                        description="Customers must create an account to submit and track their requests."
                        control={<Switch value={portal.require_login} onChange={() => handleToggle(portal, "require_login")} />}
                      />
                      <SettingRow
                        label="Customer chat"
                        description="Allow customers to reply to their tickets from the public portal."
                        control={<Switch value={portal.enable_chat} onChange={() => handleToggle(portal, "enable_chat")} />}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Delete status modal */}
      {deletingStatusId && (
        <ConfirmModal
          title="Delete status?"
          body="Tickets using this status will have their status cleared. This cannot be undone."
          confirmLabel="Delete status"
          onConfirm={() => handleDeleteStatus(deletingStatusId)}
          onCancel={() => setDeletingStatusId(null)}
        />
      )}

      {/* Delete portal modal */}
      {deletingPortalId && (
        <ConfirmModal
          title="Delete portal?"
          body="This will permanently delete the portal and all its configuration. Existing tickets are not affected."
          confirmLabel="Delete portal"
          onConfirm={() => handleDeletePortal(deletingPortalId)}
          onCancel={() => setDeletingPortalId(null)}
        />
      )}
    </div>
  );
});

// ── Sub-components ──────────────────────────────────────────────────────────

function StatusRow({
  status,
  index,
  total,
  isEditing,
  editValue,
  onEdit,
  onEditChange,
  onSave,
  onCancelEdit,
  onDelete,
  onSetDefault,
  onMoveUp,
  onMoveDown,
}: {
  status: IHelpdeskStatus;
  index: number;
  total: number;
  isEditing: boolean;
  editValue: { id: string; name: string; color: string } | null;
  onEdit: () => void;
  onEditChange: (patch: Partial<{ name: string; color: string }>) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 px-4 py-3">
      {/* Reorder arrows */}
      <div className="flex shrink-0 flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="text-tertiary hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ArrowUp className="size-3" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="text-tertiary hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ArrowDown className="size-3" />
        </button>
      </div>

      {isEditing && editValue ? (
        <>
          <ColorPicker value={editValue.color} onChange={(c) => onEditChange({ color: c })} />
          <input
            autoFocus
            value={editValue.name}
            onChange={(e) => onEditChange({ name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="min-w-0 flex-1 rounded-md border border-accent-strong bg-layer-1 px-3 py-1.5 text-13 text-primary outline-none"
          />
          <button
            type="button"
            onClick={onSave}
            className="shrink-0 text-tertiary hover:text-primary"
          >
            <Check className="size-4" />
          </button>
          <button type="button" onClick={onCancelEdit} className="shrink-0 text-tertiary hover:text-primary">
            <X className="size-4" />
          </button>
        </>
      ) : (
        <>
          {/* Color swatch */}
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full"
            style={{ backgroundColor: status.color }}
          />
          <span className="flex-1 text-13 font-medium text-primary">{status.name}</span>

          {status.is_default && (
            <span className="rounded-full bg-accent-strong/10 px-2 py-0.5 text-11 font-medium text-accent-strong">
              Default
            </span>
          )}

          {/* Actions — show on hover */}
          <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!status.is_default && (
              <button
                type="button"
                onClick={onSetDefault}
                title="Set as default"
                className="rounded p-1 text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
              >
                <Star className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onEdit}
              title="Edit"
              className="rounded p-1 text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Delete"
              className="rounded p-1 text-tertiary hover:bg-layer-transparent-hover hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-6 w-6 rounded-md border border-subtle shadow-sm transition-transform hover:scale-110"
        style={{ backgroundColor: value }}
        title="Pick color"
      />
      {open && (
        <div className="absolute left-0 top-8 z-20 grid grid-cols-4 gap-1.5 rounded-lg border border-subtle bg-layer-1 p-2 shadow-lg">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false); }}
              className={cn(
                "h-5 w-5 rounded-md border-2 transition-transform hover:scale-110",
                c === value ? "border-primary" : "border-transparent"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SettingRow({ label, description, control }: { label: string; description: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div>
        <p className="text-13 font-medium text-primary">{label}</p>
        <p className="mt-0.5 text-12 text-tertiary">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-subtle bg-layer-1 p-6 shadow-xl">
        <h3 className="text-base font-semibold text-primary">{title}</h3>
        <p className="mt-2 text-13 text-tertiary">{body}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" size="base" onClick={onCancel}>Cancel</Button>
          <Button variant="error-fill" size="base" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export default HelpdeskSettingsPage;
