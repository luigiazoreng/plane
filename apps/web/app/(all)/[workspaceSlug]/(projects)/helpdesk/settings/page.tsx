/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { Badge } from "@plane/propel/badge";
import { Button } from "@plane/propel/button";
import { Switch } from "@plane/propel/switch";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IHelpdeskFieldType, IHelpdeskFormField, IHelpdeskPortal, IHelpdeskStatus } from "@plane/types";
import { cn } from "@plane/utils";
import { Sortable } from "@plane/ui";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ExternalLink,
  GripVertical,
  Globe,
  Headset,
  Pencil,
  Plus,
  RectangleHorizontal,
  SquareCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/core/app-header";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";

// Simple hex color palette for status creation
const COLOR_PALETTE = [
  "#F97316",
  "#EF4444",
  "#F59E0B",
  "#EAB308",
  "#84CC16",
  "#22C55E",
  "#10B981",
  "#14B8A6",
  "#06B6D4",
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#A855F7",
  "#EC4899",
  "#64748B",
  "#78716C",
];

const CUSTOM_FIELD_TYPES: { type: IHelpdeskFieldType; label: string; icon: typeof RectangleHorizontal }[] = [
  { type: "short_text", label: "Short text", icon: RectangleHorizontal },
  { type: "long_text", label: "Long text", icon: RectangleHorizontal },
  { type: "select", label: "Dropdown", icon: RectangleHorizontal },
  { type: "checkbox", label: "Checkbox", icon: SquareCheck },
  { type: "date", label: "Date", icon: RectangleHorizontal },
];

type TSettingsTab = "statuses" | "portal-settings" | "forms";

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
  const [newFormByPortal, setNewFormByPortal] = useState<Record<string, { name: string; slug: string }>>({});
  const [selectedPortalId, setSelectedPortalId] = useState<string | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<{ formId: string; portalId: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TSettingsTab>("portal-settings");

  useEffect(() => {
    if (!wSlug) return;
    helpdeskStore.fetchStatuses(wSlug);
    helpdeskStore.fetchPortals(wSlug);
  }, [wSlug, helpdeskStore]);

  const statuses = helpdeskStore.getWorkspaceStatuses(wSlug);
  const portals = helpdeskStore.getWorkspacePortals(wSlug);
  const portalsState = helpdeskStore.getCollectionState(`portals:${wSlug}`);
  const statusesState = helpdeskStore.getCollectionState(`statuses:${wSlug}`);

  useEffect(() => {
    if (portals.length === 0) return;
    portals.forEach((portal) => {
      helpdeskStore.fetchForms(wSlug, portal.id);
    });
    if (!selectedPortalId) {
      setSelectedPortalId(portals[0]?.id ?? null);
    }
  }, [helpdeskStore, portals, selectedPortalId, wSlug]);

  const selectedPortal = portals.find((portal) => portal.id === selectedPortalId) || portals[0] || null;
  const selectedPortalForms = useMemo(
    () => (selectedPortal ? helpdeskStore.getPortalForms(selectedPortal.id) : []),
    [helpdeskStore, selectedPortal]
  );
  const selectedForm =
    (selectedFormId ? selectedPortalForms.find((form) => form.id === selectedFormId) : null) ||
    selectedPortalForms[0] ||
    null;
  const selectedFormFields = selectedForm ? helpdeskStore.getFormFields(selectedForm.id) : [];

  useEffect(() => {
    if (selectedPortal && selectedPortalForms.length > 0 && !selectedFormId) {
      setSelectedFormId(selectedPortalForms[0].id);
    }
  }, [selectedPortal, selectedPortalForms, selectedFormId]);

  useEffect(() => {
    if (selectedForm) {
      helpdeskStore.fetchFormFields(wSlug, selectedForm.id);
    }
  }, [helpdeskStore, selectedForm, wSlug]);

  const selectedField =
    (selectedFieldId ? selectedFormFields.find((field) => field.id === selectedFieldId) : null) ||
    selectedFormFields[0] ||
    null;

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

  const handleCreateForm = async (portalId: string) => {
    const draft = newFormByPortal[portalId];
    if (!draft?.name.trim() || !draft?.slug.trim()) return;
    try {
      const form = await helpdeskStore.createForm(wSlug, {
        portal: portalId,
        name: draft.name.trim(),
        slug: draft.slug.trim(),
        visibility: "public",
        is_active: true,
        sequence: (helpdeskStore.getPortalForms(portalId).at(-1)?.sequence ?? 0) + 10000,
        description: "",
        success_message: "Your request has been submitted successfully.",
      });
      setNewFormByPortal((prev) => ({ ...prev, [portalId]: { name: "", slug: "" } }));
      setSelectedPortalId(portalId);
      setSelectedFormId(form.id);
      setSelectedFieldId(null);
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to create form" });
    }
  };

  const handleAddField = async (fieldType: IHelpdeskFieldType) => {
    if (!selectedForm) return;
    try {
      const nextIndex = selectedFormFields.length + 1;
      const field = await helpdeskStore.createFormField(wSlug, {
        form: selectedForm.id,
        key: `${fieldType}-${nextIndex}`.replace(/_/g, "-"),
        label: `New ${fieldType.replace("_", " ")}`,
        field_type: fieldType,
        sequence: (selectedFormFields.at(-1)?.sequence ?? 0) + 10000,
        required: false,
        options: fieldType === "select" ? [{ label: "Option 1", value: "option-1" }] : [],
        validation: {},
        ui_props: {},
        is_system: false,
      });
      setSelectedFieldId(field.id);
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to add field" });
    }
  };

  const handleFormFieldChange = async (fieldId: string, patch: Partial<IHelpdeskFormField>) => {
    try {
      await helpdeskStore.updateFormField(wSlug, fieldId, patch);
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update field" });
    }
  };

  const handleDropdownOptionChange = (
    field: IHelpdeskFormField,
    index: number,
    patch: Partial<{ label: string; value: string }>
  ) => {
    const nextOptions = field.options.map((option, optionIndex) =>
      optionIndex === index ? { ...option, ...patch } : option
    );
    handleFormFieldChange(field.id, { options: nextOptions });
  };

  const handleAddDropdownOption = (field: IHelpdeskFormField) => {
    const nextIndex = field.options.length + 1;
    handleFormFieldChange(field.id, {
      options: [...field.options, { label: `Option ${nextIndex}`, value: `option-${nextIndex}` }],
    });
  };

  const handleRemoveDropdownOption = (field: IHelpdeskFormField, index: number) => {
    handleFormFieldChange(field.id, {
      options: field.options.filter((_, optionIndex) => optionIndex !== index),
    });
  };

  const handleDeleteForm = async (formId: string, portalId: string) => {
    try {
      await helpdeskStore.deleteForm(wSlug, formId, portalId);
      setDeletingFormId(null);
      if (selectedFormId === formId) {
        setSelectedFormId(helpdeskStore.getPortalForms(portalId)[0]?.id ?? null);
        setSelectedFieldId(null);
      }
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to delete form" });
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
            <div className="bg-custom-sidebar-accent/15 text-custom-sidebar-accent flex size-6 shrink-0 items-center justify-center rounded-md">
              <Headset className="size-3.5" />
            </div>
            <span className="text-sm font-semibold text-primary">Helpdesk Settings</span>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className={cn("mx-auto space-y-8 p-6", activeTab === "forms" ? "max-w-[1560px]" : "max-w-5xl")}>
          <div className="flex flex-wrap gap-2">
            <SettingsTabButton
              label="Portal settings"
              isActive={activeTab === "portal-settings"}
              onClick={() => setActiveTab("portal-settings")}
            />
            <SettingsTabButton
              label="Form builder"
              isActive={activeTab === "forms"}
              onClick={() => setActiveTab("forms")}
            />
            <SettingsTabButton
              label="Statuses"
              isActive={activeTab === "statuses"}
              onClick={() => setActiveTab("statuses")}
            />
          </div>

          {/* ── Statuses ── */}
          {activeTab === "statuses" && (
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
                <div className="divide-y divide-subtle overflow-hidden rounded-xl border border-subtle bg-layer-2">
                  {statuses.map((status, index) => (
                    <StatusRow
                      key={status.id}
                      status={status}
                      index={index}
                      total={statuses.length}
                      isEditing={editingStatus?.id === status.id}
                      editValue={editingStatus?.id === status.id ? editingStatus : null}
                      onEdit={() => setEditingStatus({ id: status.id, name: status.name, color: status.color })}
                      onEditChange={(patch) => setEditingStatus((prev) => (prev ? { ...prev, ...patch } : prev))}
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
                          value={newStatusName}
                          onChange={(e) => setNewStatusName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateStatus();
                            if (e.key === "Escape") {
                              setIsAddingStatus(false);
                              setNewStatusName("");
                            }
                          }}
                          placeholder="Status name..."
                          className="min-w-0 flex-1 rounded-md border border-subtle bg-layer-1 px-3 py-1.5 text-13 text-primary outline-none placeholder:text-tertiary focus:border-accent-strong"
                        />
                        <button
                          type="button"
                          onClick={handleCreateStatus}
                          disabled={!newStatusName.trim()}
                          className="bg-accent-strong rounded-md px-3 py-1.5 text-13 font-medium text-white transition-opacity disabled:opacity-40"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingStatus(false);
                            setNewStatusName("");
                          }}
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
          )}

          {/* ── Portals ── */}
          {activeTab === "portal-settings" && (
            <section>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-primary">Portals</h2>
                <p className="mt-0.5 text-13 text-tertiary">
                  Each portal gets a public URL where customers can submit tickets.
                </p>
              </div>

              {/* Create portal */}
              <div className="mb-4 rounded-xl border border-dashed border-subtle bg-layer-2 p-4">
                <p className="tracking-wider mb-2 text-12 font-medium text-tertiary uppercase">New portal</p>
                <div className="flex gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 focus-within:border-accent-strong">
                    <span className="shrink-0 text-tertiary">/helpdesk/p/</span>
                    <input
                      value={newPortalSlug}
                      onChange={(e) => setNewPortalSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="support-acme"
                      className="min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-tertiary"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreatePortal();
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCreatePortal}
                    disabled={!newPortalSlug.trim() || isCreatingPortal}
                    className="bg-accent-strong flex items-center gap-1.5 rounded-md px-3 py-1.5 text-13 font-medium text-white transition-opacity disabled:opacity-40"
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
                                  value={editingSlug.value}
                                  onChange={(e) =>
                                    setEditingSlug({
                                      ...editingSlug,
                                      value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                                    })
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
                                className="bg-accent-strong rounded-md px-2.5 py-1 text-12 font-medium text-white"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingSlug(null)}
                                className="text-tertiary hover:text-primary"
                              >
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
                            className="hover:text-red-500 text-tertiary transition-colors"
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
                          control={
                            <Switch value={portal.is_public} onChange={() => handleToggle(portal, "is_public")} />
                          }
                        />
                        <SettingRow
                          label="Require login"
                          description="Customers must create an account to submit and track their requests."
                          control={
                            <Switch
                              value={portal.require_login}
                              onChange={() => handleToggle(portal, "require_login")}
                            />
                          }
                        />
                        <SettingRow
                          label="Customer chat"
                          description="Allow customers to reply to their tickets from the public portal."
                          control={
                            <Switch value={portal.enable_chat} onChange={() => handleToggle(portal, "enable_chat")} />
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "forms" && (
            <section>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-primary">Forms</h2>
                <p className="mt-0.5 text-13 text-tertiary">
                  Create public or private request forms and arrange the fields customers will see in the portal.
                </p>
              </div>

              {selectedPortal ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2">
                    {portals.map((portal) => (
                      <button
                        key={portal.id}
                        type="button"
                        onClick={() => {
                          setSelectedPortalId(portal.id);
                          setSelectedFormId(null);
                          setSelectedFieldId(null);
                        }}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-13 transition-colors",
                          selectedPortal.id === portal.id
                            ? "bg-accent-strong/10 border-accent-strong text-primary"
                            : "border-subtle bg-layer-2 text-secondary hover:text-primary"
                        )}
                      >
                        {portal.public_slug}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-xl border border-subtle bg-layer-2 p-4">
                    <p className="tracking-wider mb-2 text-12 font-medium text-tertiary uppercase">New form</p>
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <input
                        value={newFormByPortal[selectedPortal.id]?.name ?? ""}
                        onChange={(e) =>
                          setNewFormByPortal((prev) => ({
                            ...prev,
                            [selectedPortal.id]: {
                              name: e.target.value,
                              slug: prev[selectedPortal.id]?.slug ?? "",
                            },
                          }))
                        }
                        placeholder="Billing support"
                        className="rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                      />
                      <input
                        value={newFormByPortal[selectedPortal.id]?.slug ?? ""}
                        onChange={(e) =>
                          setNewFormByPortal((prev) => ({
                            ...prev,
                            [selectedPortal.id]: {
                              name: prev[selectedPortal.id]?.name ?? "",
                              slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                            },
                          }))
                        }
                        placeholder="billing-support"
                        className="rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleCreateForm(selectedPortal.id)}
                        className="bg-accent-strong rounded-md px-3 py-2 text-13 font-medium text-white"
                      >
                        Create form
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_340px] 2xl:grid-cols-[320px_minmax(560px,1fr)_360px]">
                    <div className="rounded-xl border border-subtle bg-layer-2 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-13 font-medium text-primary">Portal forms</p>
                        <Badge size="sm" variant="neutral">
                          {selectedPortalForms.length}
                        </Badge>
                      </div>
                      <div className="space-y-2 xl:max-h-[820px] xl:overflow-y-auto">
                        {selectedPortalForms.map((form) => (
                          <div
                            key={form.id}
                            className={cn(
                              "rounded-lg border p-3",
                              selectedForm?.id === form.id
                                ? "border-accent-strong bg-layer-1"
                                : "border-subtle bg-layer-1"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedFormId(form.id);
                                setSelectedFieldId(null);
                              }}
                              className="w-full text-left"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-13 font-medium text-primary">{form.name}</p>
                                  <p className="mt-1 text-12 text-tertiary">/{form.slug}</p>
                                </div>
                                <Badge size="sm" variant={form.visibility === "private" ? "warning" : "success"}>
                                  {form.visibility}
                                </Badge>
                              </div>
                            </button>
                            <div className="mt-3 space-y-2">
                              <input
                                value={form.name}
                                onChange={(e) => helpdeskStore.updateForm(wSlug, form.id, { name: e.target.value })}
                                className="w-full rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-12 text-primary outline-none"
                              />
                              <select
                                value={form.visibility}
                                onChange={(e) =>
                                  helpdeskStore.updateForm(wSlug, form.id, {
                                    visibility: e.target.value as "public" | "private",
                                  })
                                }
                                className="w-full rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-12 text-primary outline-none"
                              >
                                <option value="public">Public</option>
                                <option value="private">Private</option>
                              </select>
                              <div className="flex items-center justify-between gap-3 text-12 text-secondary">
                                <span>Active</span>
                                <Switch
                                  value={form.is_active}
                                  onChange={() =>
                                    helpdeskStore.setFormActive(wSlug, form.id, selectedPortal.id, !form.is_active)
                                  }
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => setDeletingFormId({ formId: form.id, portalId: selectedPortal.id })}
                                className="text-red-500 text-12"
                              >
                                Delete form
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-subtle bg-layer-2 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-primary">
                            {selectedForm?.name || "Select a form"}
                          </h3>
                          <p className="mt-0.5 text-12 text-tertiary">Drag fields to reorder the portal form.</p>
                        </div>
                      </div>

                      {selectedForm ? (
                        <>
                          <div className="mb-4 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                            {CUSTOM_FIELD_TYPES.map(({ type, label, icon: Icon }) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => handleAddField(type)}
                                className="flex items-center gap-2 rounded-md border border-dashed border-subtle bg-layer-1 px-3 py-2 text-12 text-secondary transition-colors hover:text-primary"
                              >
                                <Icon className="size-3.5" />
                                <span className="truncate">Add {label}</span>
                              </button>
                            ))}
                          </div>

                          <div className="space-y-2 xl:max-h-[760px] xl:overflow-y-auto xl:pr-1">
                            <Sortable
                              data={selectedFormFields}
                              keyExtractor={(field) => field.id}
                              onChange={(items) => {
                                const reordered = items.map((item, index) => ({
                                  id: item.id,
                                  sequence: (index + 1) * 10000,
                                }));
                                helpdeskStore.reorderFormFields(wSlug, selectedForm.id, reordered);
                              }}
                              render={(field) => (
                                <button
                                  type="button"
                                  onClick={() => setSelectedFieldId(field.id)}
                                  className={cn(
                                    "flex w-full items-center gap-3 rounded-lg border bg-layer-1 p-3 text-left",
                                    selectedField?.id === field.id ? "border-accent-strong" : "border-subtle"
                                  )}
                                >
                                  <GripVertical className="size-4 text-tertiary" />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-13 font-medium text-primary">{field.label}</p>
                                    <p className="mt-0.5 text-12 text-tertiary">
                                      {field.field_type} · {field.required ? "Required" : "Optional"}
                                    </p>
                                  </div>
                                  {field.is_system ? (
                                    <Badge size="sm" variant="neutral">
                                      System
                                    </Badge>
                                  ) : null}
                                </button>
                              )}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="py-10 text-center text-13 text-tertiary">
                          Create or select a form to start building.
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-subtle bg-layer-2 p-4 xl:sticky xl:top-6 xl:max-h-[820px] xl:overflow-y-auto">
                      {selectedForm ? (
                        <>
                          <h3 className="text-sm font-semibold text-primary">Form settings</h3>
                          <div className="mt-4 space-y-3">
                            <input
                              value={selectedForm.name}
                              onChange={(e) =>
                                helpdeskStore.updateForm(wSlug, selectedForm.id, { name: e.target.value })
                              }
                              placeholder="Form name"
                              className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                            />
                            <textarea
                              value={selectedForm.description}
                              onChange={(e) =>
                                helpdeskStore.updateForm(wSlug, selectedForm.id, { description: e.target.value })
                              }
                              placeholder="Describe when customers should use this form"
                              className="min-h-20 w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                            />
                            <textarea
                              value={selectedForm.success_message}
                              onChange={(e) =>
                                helpdeskStore.updateForm(wSlug, selectedForm.id, { success_message: e.target.value })
                              }
                              placeholder="Success message shown after submission"
                              className="min-h-20 w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                            />
                          </div>

                          {selectedField ? (
                            <div className="mt-6 border-t border-subtle pt-4">
                              <h4 className="text-13 font-medium text-primary">Field settings</h4>
                              <div className="mt-3 space-y-3">
                                <input
                                  value={selectedField.label}
                                  onChange={(e) => handleFormFieldChange(selectedField.id, { label: e.target.value })}
                                  className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                />
                                {!selectedField.is_system ? (
                                  <input
                                    value={selectedField.key}
                                    onChange={(e) =>
                                      handleFormFieldChange(selectedField.id, {
                                        key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                                      })
                                    }
                                    className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                  />
                                ) : null}
                                <input
                                  value={selectedField.placeholder}
                                  onChange={(e) =>
                                    handleFormFieldChange(selectedField.id, { placeholder: e.target.value })
                                  }
                                  placeholder="Placeholder"
                                  className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                />
                                <textarea
                                  value={selectedField.help_text}
                                  onChange={(e) =>
                                    handleFormFieldChange(selectedField.id, { help_text: e.target.value })
                                  }
                                  placeholder="Help text"
                                  className="min-h-20 w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                />
                                {selectedField.field_type === "select" ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-12 font-medium text-secondary">Dropdown options</p>
                                      <button
                                        type="button"
                                        onClick={() => handleAddDropdownOption(selectedField)}
                                        className="rounded-md border border-subtle bg-layer-1 px-2.5 py-1 text-12 text-secondary transition-colors hover:text-primary"
                                      >
                                        Add option
                                      </button>
                                    </div>
                                    <div className="space-y-2">
                                      {selectedField.options.map((option) => (
                                        <div
                                          key={`${selectedField.id}-${option.value || option.label}`}
                                          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2"
                                        >
                                          <input
                                            value={option.label}
                                            onChange={(e) =>
                                              handleDropdownOptionChange(selectedField, index, {
                                                label: e.target.value,
                                              })
                                            }
                                            placeholder="Label"
                                            className="min-w-0 rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                          />
                                          <input
                                            value={option.value}
                                            onChange={(e) =>
                                              handleDropdownOptionChange(selectedField, index, {
                                                value: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                                              })
                                            }
                                            placeholder="value"
                                            className="min-w-0 rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveDropdownOption(selectedField, index)}
                                            className="text-red-500 rounded-md px-2 text-12"
                                            disabled={selectedField.options.length <= 1}
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                                <div className="flex items-center justify-between text-12 text-secondary">
                                  <span>Required</span>
                                  <Switch
                                    value={selectedField.required}
                                    onChange={() =>
                                      handleFormFieldChange(selectedField.id, { required: !selectedField.required })
                                    }
                                  />
                                </div>
                                {!selectedField.is_system ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      helpdeskStore.deleteFormField(wSlug, selectedField.id, selectedForm.id)
                                    }
                                    className="text-red-500 text-12"
                                  >
                                    Remove field
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="py-10 text-center text-13 text-tertiary">
                          Select a form to edit its settings.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-subtle py-10 text-center text-13 text-tertiary">
                  Create a portal first to start building forms.
                </div>
              )}
            </section>
          )}
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

      {deletingFormId && (
        <ConfirmModal
          title="Delete form?"
          body="This will delete the form definition. Existing requests already submitted through it are kept."
          confirmLabel="Delete form"
          onConfirm={() => handleDeleteForm(deletingFormId.formId, deletingFormId.portalId)}
          onCancel={() => setDeletingFormId(null)}
        />
      )}
    </div>
  );
});

// ── Sub-components ──────────────────────────────────────────────────────────

function SettingsTabButton({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 text-13 font-medium transition-colors",
        isActive
          ? "bg-accent-strong/10 border-accent-strong text-primary"
          : "border-subtle bg-layer-2 text-secondary hover:bg-layer-1 hover:text-primary"
      )}
    >
      {label}
    </button>
  );
}

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
      <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="text-tertiary hover:text-primary disabled:cursor-not-allowed disabled:opacity-20"
        >
          <ArrowUp className="size-3" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="text-tertiary hover:text-primary disabled:cursor-not-allowed disabled:opacity-20"
        >
          <ArrowDown className="size-3" />
        </button>
      </div>

      {isEditing && editValue ? (
        <>
          <ColorPicker value={editValue.color} onChange={(c) => onEditChange({ color: c })} />
          <input
            value={editValue.name}
            onChange={(e) => onEditChange({ name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="min-w-0 flex-1 rounded-md border border-accent-strong bg-layer-1 px-3 py-1.5 text-13 text-primary outline-none"
          />
          <button type="button" onClick={onSave} className="shrink-0 text-tertiary hover:text-primary">
            <Check className="size-4" />
          </button>
          <button type="button" onClick={onCancelEdit} className="shrink-0 text-tertiary hover:text-primary">
            <X className="size-4" />
          </button>
        </>
      ) : (
        <>
          {/* Color swatch */}
          <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
          <span className="flex-1 text-13 font-medium text-primary">{status.name}</span>

          {status.is_default && (
            <span className="bg-accent-strong/10 text-accent-strong rounded-full px-2 py-0.5 text-11 font-medium">
              Default
            </span>
          )}

          {/* Actions — show on hover */}
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
              className="hover:text-red-500 rounded p-1 text-tertiary hover:bg-layer-transparent-hover"
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
        className="shadow-sm h-6 w-6 rounded-md border border-subtle transition-transform hover:scale-110"
        style={{ backgroundColor: value }}
        title="Pick color"
      />
      {open && (
        <div className="shadow-lg absolute top-8 left-0 z-20 grid grid-cols-4 gap-1.5 rounded-lg border border-subtle bg-layer-1 p-2">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
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
      <div className="shadow-xl w-full max-w-sm rounded-xl border border-subtle bg-layer-1 p-6">
        <h3 className="text-base font-semibold text-primary">{title}</h3>
        <p className="mt-2 text-13 text-tertiary">{body}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" size="base" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="error-fill" size="base" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default HelpdeskSettingsPage;
