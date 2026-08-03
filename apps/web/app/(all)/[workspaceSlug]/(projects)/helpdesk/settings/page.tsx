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
import type {
  EHelpdeskMemberRole,
  IHelpdeskAutoAssignmentConfig,
  IHelpdeskAutoAssignmentType,
  IHelpdeskFieldType,
  IHelpdeskForm,
  IHelpdeskFormField,
  IHelpdeskMember,
  IHelpdeskPortal,
  IHelpdeskRequestComment,
  IHelpdeskStatus,
} from "@plane/types";
import { cn } from "@plane/utils";
import { Sortable } from "@plane/ui";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ExternalLink,
  Eye,
  GripVertical,
  Globe,
  Headset,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/core/app-header";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import {
  createHelpdeskFieldDraft,
  getNormalizedHelpdeskAutoAssignmentConfig,
  HELPDESK_CUSTOM_FIELD_TYPES,
  previewTicketIdPattern,
} from "@/helpers/helpdesk/form-core";
import { useMember } from "@/hooks/store/use-member";
import { useFileSize } from "@/plane-web/hooks/use-file-size";
import { useHelpdesk } from "@/hooks/store/use-helpdesk";
import { HelpdeskFormRenderer } from "@/components/helpdesk/form-renderer";

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

type TSettingsTab = "statuses" | "portal-settings" | "forms" | "members" | "email" | "email-logs" | "imap-logs" | "teams" | "macros";

const validateFormForActivation = (fields: IHelpdeskFormField[]): string[] => {
  const errors: string[] = [];
  const fieldKeys = new Set(fields.map((field) => field.key));

  for (const field of fields) {
    if (!field.label.trim()) {
      errors.push(`Field "${field.key}" has an empty label.`);
    }
    if (field.field_type === "select" && field.options.length === 0) {
      errors.push(`Dropdown field "${field.label || field.key}" has no options.`);
    }
    if (field.field_type === "cascade_select" && field.parent_field_key && !fieldKeys.has(field.parent_field_key)) {
      errors.push(`Cascading field "${field.label || field.key}" references a missing parent field.`);
    }
  }

  return errors;
};

/**
 * The model stores bytes; the field is in MB because that is how an admin
 * thinks about attachment limits. Null (empty input) means "inherit the
 * instance limit".
 */
function attachmentSizeInputValue(portal: IHelpdeskPortal, draft: Partial<IHelpdeskPortal>): string {
  const bytes = draft.max_attachment_size !== undefined ? draft.max_attachment_size : portal.max_attachment_size;
  if (!bytes) return "";
  return String(Math.round((bytes / (1024 * 1024)) * 10) / 10);
}

const HelpdeskSettingsPage = observer(() => {
  const { workspaceSlug } = useParams();
  const navigate = useNavigate();
  const helpdeskStore = useHelpdesk();
  const {
    workspace: { fetchWorkspaceMembers, workspaceMemberIds },
  } = useMember();

  const wSlug = workspaceSlug?.toString() || "";

  // The instance ceiling a portal cannot exceed. Shown as the placeholder and
  // enforced again server-side -- the proxy and the presigned upload conditions
  // apply it regardless of what is saved here.
  const { maxFileSize } = useFileSize();
  const instanceMaxAttachmentMb = Math.round(maxFileSize / (1024 * 1024));

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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activationErrors, setActivationErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Local draft state for the settings panels — written on every keystroke, flushed on Save
  const [fieldsDraft, setFieldsDraft] = useState<IHelpdeskFormField[] | null>(null);
  const [deletedFieldIds, setDeletedFieldIds] = useState<Set<string>>(new Set());
  const [formDraft, setFormDraft] = useState<Partial<IHelpdeskForm>>({});
  const [emailConfigDrafts, setEmailConfigDrafts] = useState<Record<string, Partial<IHelpdeskPortal>>>({});
  const [portalSettingsDrafts, setPortalSettingsDrafts] = useState<Record<string, Partial<IHelpdeskPortal>>>({});

  // ---- Members state ----
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedMemberRole, setSelectedMemberRole] = useState<number>(15);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // ---- Email Logs state ----
  const [emailLogs, setEmailLogs] = useState<Record<string, IHelpdeskRequestComment[]>>({});
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // ---- IMAP Logs state ----
  const [imapLogs, setImapLogs] = useState<Record<string, import("@plane/types").IHelpdeskIMAPSyncLog[]>>({});
  const [isLoadingImapLogs, setIsLoadingImapLogs] = useState(false);
  const [isSyncingImap, setIsSyncingImap] = useState(false);

  // ---- Teams state ----
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [teamColor, setTeamColor] = useState("#3B82F6");

  // ---- Macros state ----
  const [isCreatingMacro, setIsCreatingMacro] = useState(false);
  const [macroName, setMacroName] = useState("");
  const [macroDescription, setMacroDescription] = useState("");
  const [macroContent, setMacroContent] = useState("");
  const [macroIsPublic, setMacroIsPublic] = useState(true);

  useEffect(() => {
    if (!wSlug) return;
    helpdeskStore.fetchStatuses(wSlug);
    helpdeskStore.fetchMembers(wSlug);
    helpdeskStore.fetchTeams(wSlug);
    helpdeskStore.fetchMacros(wSlug);

    void helpdeskStore.fetchPortals(wSlug).then((portals) => {
      if (!portals?.length) return undefined;
      portals.forEach((portal) => {
        helpdeskStore.fetchForms(wSlug, portal.id);
      });
      setSelectedPortalId((prev) => prev ?? portals[0]?.id ?? null);
      return undefined;
    });
  }, [helpdeskStore, wSlug]);

  useEffect(() => {
    if (!wSlug || workspaceMemberIds) return;
    fetchWorkspaceMembers(wSlug);
  }, [fetchWorkspaceMembers, wSlug, workspaceMemberIds]);

  const statuses = helpdeskStore.getWorkspaceStatuses(wSlug);
  const portals = helpdeskStore.getWorkspacePortals(wSlug);
  const portalsState = helpdeskStore.getCollectionState(`portals:${wSlug}`);
  const statusesState = helpdeskStore.getCollectionState(`statuses:${wSlug}`);

  const selectedPortal = portals.find((portal) => portal.id === selectedPortalId) || portals[0] || null;
  // Read straight from the store (no useMemo) so the MobX observer re-renders when
  // fetchForms resolves and populates this.forms[portalId]. Memoizing on selectedPortal
  // alone froze the initial empty array, so forms only appeared after leaving and
  // re-entering the page (when the store cache was already warm).
  const selectedPortalForms = selectedPortal ? helpdeskStore.getPortalForms(selectedPortal.id) : [];
  const firstSelectedPortalFormId = selectedPortalForms[0]?.id ?? null;
  const selectedForm =
    (selectedFormId ? selectedPortalForms.find((form) => form.id === selectedFormId) : null) ||
    selectedPortalForms[0] ||
    null;
  const selectedFormFields = selectedForm ? helpdeskStore.getFormFields(selectedForm.id) : [];

  useEffect(() => {
    if (selectedPortal && firstSelectedPortalFormId && !selectedFormId) {
      setSelectedFormId(firstSelectedPortalFormId);
    }
  }, [firstSelectedPortalFormId, selectedPortal, selectedFormId]);

  useEffect(() => {
    if (selectedForm) {
      helpdeskStore.fetchFormFields(wSlug, selectedForm.id);
    }
  }, [helpdeskStore, selectedForm, wSlug]);

  const selectedField =
    (selectedFieldId ? selectedFormFields.find((field) => field.id === selectedFieldId) : null) ||
    selectedFormFields[0] ||
    null;

  // Reset fields draft whenever the selected form changes
  useEffect(() => {
    setFieldsDraft(null);
    setDeletedFieldIds(new Set());
  }, [selectedForm?.id]);

  useEffect(() => {
    setFormDraft({});
  }, [selectedForm?.id]);

  useEffect(() => {
    if (activeTab === "email-logs" && wSlug) {
      setIsLoadingLogs(true);
      const fetchLogs = async () => {
        const logsByPortal: Record<string, IHelpdeskRequestComment[]> = {};
        for (const portal of portals) {
          try {
            const logs = await helpdeskStore.helpdeskService.getPortalEmailLogs(wSlug, portal.id);
            logsByPortal[portal.id] = logs;
          } catch (e) {
            console.error("Failed to fetch email logs for portal", portal.id, e);
          }
        }
        setEmailLogs(logsByPortal);
        setIsLoadingLogs(false);
      };
      void fetchLogs();
    }
  }, [activeTab, wSlug, portals, helpdeskStore.helpdeskService]);

  useEffect(() => {
    if (activeTab === "imap-logs" && wSlug) {
      setIsLoadingImapLogs(true);
      const fetchImapLogs = async () => {
        const logsByPortal: Record<string, import("@plane/types").IHelpdeskIMAPSyncLog[]> = {};
        for (const portal of portals) {
          try {
            const logs = await helpdeskStore.helpdeskService.getPortalIMAPLogs(wSlug, portal.id);
            logsByPortal[portal.id] = logs;
          } catch (e) {
            console.error("Failed to fetch IMAP logs for portal", portal.id, e);
          }
        }
        setImapLogs(logsByPortal);
        setIsLoadingImapLogs(false);
      };
      void fetchImapLogs();
    }
  }, [activeTab, wSlug, portals, helpdeskStore.helpdeskService]);

  // Merge store data with local drafts for rendering
  const currentFields = fieldsDraft ?? selectedFormFields.map((f) => ({ ...f }));
  const draftField: IHelpdeskFormField | null = selectedFieldId
    ? currentFields.find((f) => f.id === selectedFieldId) || null
    : null;
  const draftForm: IHelpdeskForm | null = selectedForm ? ({ ...selectedForm, ...formDraft } as IHelpdeskForm) : null;

  const isDirtyFields = fieldsDraft !== null || deletedFieldIds.size > 0;
  const isDirty = isDirtyFields || Object.keys(formDraft).length > 0;

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

  const handleAutoAssignmentUpdate = async (
    portal: IHelpdeskPortal,
    patch: Partial<Pick<IHelpdeskPortal, "auto_assignment_enabled" | "auto_assignment_type">> & {
      auto_assignment_config?: Partial<IHelpdeskAutoAssignmentConfig>;
    }
  ) => {
    const currentConfig = getNormalizedHelpdeskAutoAssignmentConfig(portal);
    try {
      await helpdeskStore.updatePortal(wSlug, portal.id, {
        auto_assignment_enabled: patch.auto_assignment_enabled ?? portal.auto_assignment_enabled,
        auto_assignment_type: (patch.auto_assignment_type ??
          portal.auto_assignment_type ??
          "load_balance") as IHelpdeskAutoAssignmentType,
        auto_assignment_config: patch.auto_assignment_config
          ? { ...currentConfig, ...patch.auto_assignment_config }
          : currentConfig,
      });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update automatic assignment" });
    }
  };

  const handlePortalPatch = async (portal: IHelpdeskPortal, patch: Partial<IHelpdeskPortal>) => {
    try {
      await helpdeskStore.updatePortal(wSlug, portal.id, patch);
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update portal settings" });
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

  const handleAddField = (fieldType: IHelpdeskFieldType) => {
    if (!selectedForm) return;
    const current = fieldsDraft ?? selectedFormFields.map((f) => ({ ...f }));
    const newField = {
      id: `temp-${Date.now()}`,
      form: selectedForm.id,
      ...createHelpdeskFieldDraft(fieldType, current),
    } as IHelpdeskFormField;
    setFieldsDraft([...current, newField]);
    setSelectedFieldId(newField.id);
  };

  const handleFormFieldChange = (patch: Partial<IHelpdeskFormField>) => {
    if (!selectedFieldId) return;
    const current = fieldsDraft ?? selectedFormFields.map((f) => ({ ...f }));
    setFieldsDraft(current.map((f) => (f.id === selectedFieldId ? { ...f, ...patch } : f)));
  };

  const handleFormSettingsChange = (patch: Partial<IHelpdeskForm>) => {
    setFormDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleSaveAll = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const saves: Promise<unknown>[] = [];
      if (selectedForm && Object.keys(formDraft).length > 0) {
        saves.push(helpdeskStore.updateForm(wSlug, selectedForm.id, formDraft));
      }

      if (isDirtyFields && selectedForm) {
        // Deletions
        for (const id of deletedFieldIds) {
          saves.push(helpdeskStore.deleteFormField(wSlug, id, selectedForm.id));
        }

        const finalFields = [...(fieldsDraft ?? [])];
        const createdIdMap = new Map<string, string>(); // tempId -> realId

        for (let i = 0; i < finalFields.length; i++) {
          const field = finalFields[i];
          if (field.id.startsWith("temp-")) {
            const created = await helpdeskStore.createFormField(wSlug, field);
            createdIdMap.set(field.id, created.id);
            finalFields[i] = created;
          } else {
            const originalField = selectedFormFields.find((f) => f.id === field.id);
            if (originalField) {
              const patch: Partial<IHelpdeskFormField> = {};
              let hasChanges = false;
              for (const key of Object.keys(field) as (keyof IHelpdeskFormField)[]) {
                if (JSON.stringify(field[key as keyof IHelpdeskFormField]) !== JSON.stringify(originalField[key as keyof IHelpdeskFormField])) {
                  (patch as any)[key] = field[key as keyof IHelpdeskFormField];
                  hasChanges = true;
                }
              }
              if (hasChanges) {
                saves.push(helpdeskStore.updateFormField(wSlug, field.id, patch));
              }
            }
          }
        }

        await Promise.all(saves);

        // Reordering
        const reorderedItems = finalFields.map((f, i) => ({
          id: f.id,
          sequence: (i + 1) * 10000,
        }));
        await helpdeskStore.reorderFormFields(wSlug, selectedForm.id, reorderedItems);
      } else {
        await Promise.all(saves);
      }

      setFieldsDraft(null);
      setDeletedFieldIds(new Set());
      setFormDraft({});
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to save changes" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleFormActive = async (form: IHelpdeskForm, newValue: boolean) => {
    if (newValue) {
      const errors = validateFormForActivation(helpdeskStore.getFormFields(form.id));
      if (errors.length > 0) {
        setActivationErrors(errors);
        return;
      }
    }
    setActivationErrors([]);
    try {
      await helpdeskStore.setFormActive(wSlug, form.id, selectedPortal!.id, newValue);
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update form status" });
    }
  };

  const handleDropdownOptionChange = (index: number, patch: Partial<{ label: string; value: string }>) => {
    const options = draftField?.options ?? [];
    const nextOptions = options.slice();
    const currentOption = nextOptions[index];
    if (!currentOption) return;

    nextOptions[index] = Object.assign({}, currentOption, patch);
    handleFormFieldChange({ options: nextOptions });
  };

  const handleAddDropdownOption = () => {
    const options = draftField?.options ?? [];
    const nextIndex = options.length + 1;
    handleFormFieldChange({
      options: [...options, { label: `Option ${nextIndex}`, value: `option-${nextIndex}` }],
    });
  };

  const handleRemoveDropdownOption = (index: number) => {
    const options = draftField?.options ?? [];
    handleFormFieldChange({
      options: options.filter((_, optionIndex) => optionIndex !== index),
    });
  };

  const handleReorderDropdownOptions = (nextOptions: { label: string; value: string }[]) => {
    handleFormFieldChange({ options: nextOptions });
  };

  const handleAddCascadeOption = () => {
    const options = draftField?.options ?? [];
    const nextIndex = options.length + 1;
    handleFormFieldChange({
      options: [...options, { label: `Option ${nextIndex}`, value: `Option ${nextIndex}` }],
    });
  };

  const handleCascadeOptionLabelChange = (index: number, label: string) => {
    const options = draftField?.options ?? [];
    const oldValue = options[index]?.value ?? "";
    const newOptions = options.map((opt, i) => (i === index ? { label, value: label } : opt));
    const newMapping = { ...draftField?.parent_mapping };
    if (oldValue && oldValue !== label && oldValue in newMapping) {
      newMapping[label] = newMapping[oldValue];
      delete newMapping[oldValue];
    }
    handleFormFieldChange({ options: newOptions, parent_mapping: newMapping });
  };

  const handleRemoveCascadeOption = (index: number) => {
    const options = draftField?.options ?? [];
    const removedValue = options[index]?.value ?? "";
    const newOptions = options.filter((_, i) => i !== index);
    const newMapping = { ...draftField?.parent_mapping };
    if (removedValue in newMapping) delete newMapping[removedValue];
    handleFormFieldChange({ options: newOptions, parent_mapping: newMapping });
  };

  // Reordering only changes option order; values stay the same so parent_mapping is untouched.
  const handleReorderCascadeOptions = (nextOptions: { label: string; value: string }[]) => {
    handleFormFieldChange({ options: nextOptions });
  };

  const handleCascadeMappingToggle = (parentValue: string, childValue: string, checked: boolean) => {
    const mapping = draftField?.parent_mapping ?? {};
    const current = mapping[parentValue] ?? [];
    const next = checked ? [...new Set([...current, childValue])] : current.filter((v) => v !== childValue);
    handleFormFieldChange({ parent_mapping: { ...mapping, [parentValue]: next } });
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

  const handleSyncIMAP = async (portalId: string) => {
    if (!wSlug) return;
    setIsSyncingImap(true);
    try {
      const result = await helpdeskStore.helpdeskService.syncPortalIMAP(wSlug, portalId);
      setToast({
        type: result.status === "success" ? TOAST_TYPE.SUCCESS : TOAST_TYPE.ERROR,
        title: result.status === "success" ? "Sync Successful" : "Sync Failed",
        message: result.error_message || `Fetched ${result.emails_fetched} email(s)`,
      });
      // Optionally reload the imap logs if we are on the imap-logs tab
      if (activeTab === "imap-logs") {
        const logs = await helpdeskStore.helpdeskService.getPortalIMAPLogs(wSlug, portalId);
        setImapLogs((prev) => ({ ...prev, [portalId]: logs }));
      }
    } catch (e: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Sync Failed",
        message: e?.message || "An error occurred during IMAP sync.",
      });
    } finally {
      setIsSyncingImap(false);
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
              label="Email"
              isActive={activeTab === "email"}
              onClick={() => setActiveTab("email")}
            />
            <SettingsTabButton
              label="Email logs"
              isActive={activeTab === "email-logs"}
              onClick={() => setActiveTab("email-logs")}
            />
            <SettingsTabButton
              label="IMAP logs"
              isActive={activeTab === "imap-logs"}
              onClick={() => setActiveTab("imap-logs")}
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
            <SettingsTabButton
              label="Members"
              isActive={activeTab === "members"}
              onClick={() => setActiveTab("members")}
            />
            <SettingsTabButton
              label="Teams"
              isActive={activeTab === "teams"}
              onClick={() => setActiveTab("teams")}
            />
            <SettingsTabButton
              label="Macros"
              isActive={activeTab === "macros"}
              onClick={() => setActiveTab("macros")}
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
                  {portals.map((portal) => {
                    const draft = portalSettingsDrafts[portal.id] || {};
                    const isDirty = Object.keys(draft).length > 0;
                    
                    const handleDraftChange = (field: keyof IHelpdeskPortal, value: any) => {
                      setPortalSettingsDrafts((prev) => ({
                        ...prev,
                        [portal.id]: {
                          ...prev[portal.id],
                          [field]: value,
                        },
                      }));
                    };

                    const handleAutoAssignDraftConfig = (configPatch: Partial<IHelpdeskAutoAssignmentConfig>) => {
                      const currentConfig = getNormalizedHelpdeskAutoAssignmentConfig(portal);
                      const draftConfig = draft.auto_assignment_config as IHelpdeskAutoAssignmentConfig | undefined;
                      const merged = draftConfig ? { ...draftConfig, ...configPatch } : { ...currentConfig, ...configPatch };
                      handleDraftChange("auto_assignment_config", merged);
                    };

                    const handleSave = async () => {
                      if (!isDirty) return;
                      await handlePortalPatch(portal, draft);
                      setPortalSettingsDrafts((prev) => {
                        const next = { ...prev };
                        delete next[portal.id];
                        return next;
                      });
                    };

                    const autoAssignmentConfig = (draft.auto_assignment_config as IHelpdeskAutoAssignmentConfig | undefined) || getNormalizedHelpdeskAutoAssignmentConfig(portal);
                    const isAutoAssignEnabled = draft.auto_assignment_enabled ?? portal.auto_assignment_enabled;
                    const autoAssignType = draft.auto_assignment_type ?? portal.auto_assignment_type ?? "load_balance";

                    return (
                      <div key={portal.id} className="rounded-xl border border-subtle bg-layer-2 shadow-sm">
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
                            <button
                              type="button"
                              onClick={handleSave}
                              disabled={!isDirty}
                              className="bg-accent-strong ml-2 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-13 font-medium text-white transition-opacity disabled:opacity-40"
                            >
                              Save configuration
                            </button>
                          </div>
                        </div>
                        <div className="divide-y divide-subtle">
                          <SettingRow
                            label="Public access"
                            description="Anyone with the link can view and submit requests without logging in."
                            control={
                              <Switch value={draft.is_public ?? portal.is_public} onChange={() => handleDraftChange("is_public", !(draft.is_public ?? portal.is_public))} />
                            }
                          />
                          <SettingRow
                            label="Require login"
                            description="Customers must create an account to submit and track their requests."
                            control={
                              <Switch
                                value={draft.require_login ?? portal.require_login}
                                onChange={() => handleDraftChange("require_login", !(draft.require_login ?? portal.require_login))}
                              />
                            }
                          />
                          <SettingRow
                            label="Customer chat"
                            description="Allow customers to reply to their tickets from the public portal."
                            control={
                              <Switch value={draft.enable_chat ?? portal.enable_chat} onChange={() => handleDraftChange("enable_chat", !(draft.enable_chat ?? portal.enable_chat))} />
                            }
                          />
                          <div className="space-y-5 px-4 py-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-13 font-medium text-primary">Automatic assignment</p>
                                <p className="mt-1 text-13 text-tertiary">
                                  Select how new tickets should be routed and which statuses count as active load.
                                </p>
                              </div>
                              <Switch
                                value={isAutoAssignEnabled}
                                onChange={() => handleDraftChange("auto_assignment_enabled", !isAutoAssignEnabled)}
                              />
                            </div>

                            <div
                              className={cn(
                                "grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]",
                                !isAutoAssignEnabled && "opacity-60"
                              )}
                            >
                              <label className="space-y-1">
                                <span className="text-12 font-medium text-secondary">Assignment type</span>
                                <select
                                  value={autoAssignType}
                                  onChange={(e) => handleDraftChange("auto_assignment_type", e.target.value as IHelpdeskAutoAssignmentType)}
                                  disabled={!isAutoAssignEnabled}
                                  className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none disabled:cursor-not-allowed"
                                >
                                  <option value="load_balance">Load balance</option>
                                  <option value="round_robin">Round robin</option>
                                  <option value="capacity">Capacity-aware</option>
                                </select>
                              </label>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-12 font-medium text-secondary">Eligible agents</span>
                                  {autoAssignmentConfig.member_ids.length > 0 && (
                                    <Badge size="sm" variant="neutral">
                                      {autoAssignmentConfig.member_ids.length}
                                    </Badge>
                                  )}
                                </div>
                                <div className="min-h-10 rounded-md border border-subtle bg-layer-1 px-3 py-2">
                                  <MemberDropdown
                                    value={autoAssignmentConfig.member_ids}
                                    onChange={(memberIds) => handleAutoAssignDraftConfig({ member_ids: memberIds })}
                                    multiple
                                    memberIds={workspaceMemberIds ?? undefined}
                                    buttonVariant={
                                      autoAssignmentConfig.member_ids.length > 0
                                        ? "transparent-without-text"
                                        : "transparent-with-text"
                                    }
                                    buttonClassName="min-h-6 px-0 hover:bg-transparent"
                                    placeholder="Select agents"
                                    disabled={!isAutoAssignEnabled}
                                  />
                                </div>
                                {autoAssignmentConfig.member_ids.length === 0 ? (
                                  <p className="text-amber-500 text-12">
                                    Tickets will remain unassigned until you add agents.
                                  </p>
                                ) : (
                                  <p className="text-12 text-tertiary">
                                    {autoAssignType === "round_robin" &&
                                      "New tickets will rotate through eligible agents in a stable order."}
                                    {autoAssignType === "capacity" &&
                                      "New tickets will prefer the least-loaded agent under the configured capacity."}
                                    {autoAssignType === "load_balance" &&
                                      "New tickets will be assigned to the least-loaded eligible agent."}
                                  </p>
                                )}
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-12 font-medium text-secondary">Active ticket statuses</span>
                                  {autoAssignmentConfig.active_status_ids.length > 0 && (
                                    <Badge size="sm" variant="neutral">
                                      {autoAssignmentConfig.active_status_ids.length}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-2 rounded-md border border-subtle bg-layer-1 p-3">
                                  {statuses.map((status) => {
                                    const isSelected = autoAssignmentConfig.active_status_ids.includes(status.id);

                                    return (
                                      <button
                                        key={status.id}
                                        type="button"
                                        disabled={!isAutoAssignEnabled}
                                        onClick={() => {
                                          const nextStatusIds = isSelected
                                            ? autoAssignmentConfig.active_status_ids.filter(
                                                (statusId) => statusId !== status.id
                                              )
                                            : [...autoAssignmentConfig.active_status_ids, status.id];

                                          handleAutoAssignDraftConfig({ active_status_ids: nextStatusIds });
                                        }}
                                        className={cn(
                                          "rounded-md border px-2.5 py-1.5 text-12 transition-colors disabled:cursor-not-allowed",
                                          isSelected
                                            ? "bg-accent-strong/10 border-accent-strong text-primary"
                                            : "border-subtle bg-layer-2 text-secondary"
                                        )}
                                      >
                                        {status.name}
                                      </button>
                                    );
                                  })}
                                </div>
                                <p className="text-12 text-tertiary">
                                  Leave empty to use the default fallback: every non-resolved and non-closed status.
                                </p>
                              </div>

                              {autoAssignType === "capacity" && (
                                <label className="space-y-1">
                                  <span className="text-12 font-medium text-secondary">Capacity limit per agent</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={autoAssignmentConfig.capacity_limit ?? ""}
                                    onChange={(e) =>
                                      handleAutoAssignDraftConfig({
                                        capacity_limit: e.target.value ? Number(e.target.value) : null,
                                      })
                                    }
                                    disabled={!isAutoAssignEnabled}
                                    placeholder="e.g. 15"
                                    className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none disabled:cursor-not-allowed"
                                  />
                                </label>
                              )}
                            </div>
                          </div>

                          <div className="grid gap-4 border-t border-subtle px-4 py-4 lg:grid-cols-2">
                            <label className="space-y-1">
                              <span className="text-12 font-medium text-secondary">SLA first response (hours)</span>
                              <input
                                type="number"
                                min={1}
                                value={draft.sla_first_response_hours ?? portal.sla_first_response_hours ?? ""}
                                onChange={(e) =>
                                  handleDraftChange("sla_first_response_hours", e.target.value ? Number(e.target.value) : null)
                                }
                                placeholder="e.g. 4"
                                className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-12 font-medium text-secondary">SLA resolution (hours)</span>
                              <input
                                type="number"
                                min={1}
                                value={draft.sla_resolution_hours ?? portal.sla_resolution_hours ?? ""}
                                onChange={(e) =>
                                  handleDraftChange("sla_resolution_hours", e.target.value ? Number(e.target.value) : null)
                                }
                                placeholder="e.g. 24"
                                className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {activeTab === "email" && (
            <section>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-primary">Email configuration</h2>
                <p className="mt-0.5 text-13 text-tertiary">
                  Configure custom SMTP settings and sender addresses for each portal.
                </p>
              </div>

              {portals && portals.length > 0 ? (
                <div className="space-y-6">
                  {portals.map((portal) => {
                    const draft = emailConfigDrafts[portal.id] || {};
                    const isDirty = Object.keys(draft).length > 0;

                    const handleDraftChange = (field: keyof IHelpdeskPortal, value: any) => {
                      setEmailConfigDrafts((prev) => ({
                        ...prev,
                        [portal.id]: {
                          ...prev[portal.id],
                          [field]: value,
                        },
                      }));
                    };

                    const handleSave = async () => {
                      if (!isDirty) return;
                      await handlePortalPatch(portal, draft);
                      setEmailConfigDrafts((prev) => {
                        const next = { ...prev };
                        delete next[portal.id];
                        return next;
                      });
                    };

                    return (
                      <div key={portal.id} className="rounded-xl border border-subtle bg-layer-2 shadow-sm">
                        <div className="px-6 py-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <h3 className="text-14 font-medium text-primary">{portal.public_slug}</h3>
                          </div>
                          <button
                            type="button"
                            onClick={handleSave}
                            disabled={!isDirty}
                            className="bg-accent-strong flex items-center gap-1.5 rounded-md px-3 py-1.5 text-13 font-medium text-white transition-opacity disabled:opacity-40"
                          >
                            Save configuration
                          </button>
                        </div>
                        <div className="divide-y divide-subtle border-t border-subtle">
                          <div className="grid gap-4 px-6 py-4 lg:grid-cols-2">
                            <label className="space-y-1">
                              <span className="text-12 font-medium text-secondary">No-reply email address</span>
                              <input
                                type="email"
                                value={draft.no_reply_email_address ?? portal.no_reply_email_address ?? ""}
                                onChange={(e) => handleDraftChange("no_reply_email_address", e.target.value || null)}
                                placeholder="e.g. no-reply@mycompany.com"
                                className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-12 font-medium text-secondary">Default agent email address</span>
                              <input
                                type="email"
                                value={draft.default_agent_email_address ?? portal.default_agent_email_address ?? ""}
                                onChange={(e) => handleDraftChange("default_agent_email_address", e.target.value || null)}
                                placeholder="e.g. support@mycompany.com"
                                className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                              />
                            </label>
                          </div>
                          <div className="px-6 py-4">
                            <h4 className="mb-4 text-13 font-medium text-primary">SMTP Configuration</h4>
                            <div className="grid gap-4 lg:grid-cols-2">
                              <label className="space-y-1">
                                <span className="text-12 font-medium text-secondary">SMTP Host</span>
                                <input
                                  type="text"
                                  value={draft.smtp_host ?? portal.smtp_host ?? ""}
                                  onChange={(e) => handleDraftChange("smtp_host", e.target.value || null)}
                                  placeholder="smtp.gmail.com"
                                  className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-12 font-medium text-secondary">SMTP Port</span>
                                <input
                                  type="number"
                                  value={draft.smtp_port ?? portal.smtp_port ?? ""}
                                  onChange={(e) => handleDraftChange("smtp_port", e.target.value ? Number(e.target.value) : null)}
                                  placeholder="587"
                                  className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-12 font-medium text-secondary">SMTP Username</span>
                                <input
                                  type="text"
                                  value={draft.smtp_username ?? portal.smtp_username ?? ""}
                                  onChange={(e) => handleDraftChange("smtp_username", e.target.value || null)}
                                  placeholder="Username or email"
                                  className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-12 font-medium text-secondary">SMTP Password</span>
                                <input
                                  type="password"
                                  value={draft.smtp_password ?? portal.smtp_password ?? ""}
                                  onChange={(e) => handleDraftChange("smtp_password", e.target.value || null)}
                                  placeholder="Leave blank to keep existing password"
                                  className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                />
                              </label>
                            </div>
                            <div className="mt-4 flex gap-8">
                              <SettingRow
                                label="Use TLS"
                                description=""
                                className="px-0 py-0"
                                control={
                                  <Switch
                                    value={draft.smtp_use_tls ?? portal.smtp_use_tls}
                                    onChange={() => handleDraftChange("smtp_use_tls", !(draft.smtp_use_tls ?? portal.smtp_use_tls))}
                                  />
                                }
                              />
                              <SettingRow
                                label="Use SSL"
                                description=""
                                className="px-0 py-0"
                                control={
                                  <Switch
                                    value={draft.smtp_use_ssl ?? portal.smtp_use_ssl}
                                    onChange={() => handleDraftChange("smtp_use_ssl", !(draft.smtp_use_ssl ?? portal.smtp_use_ssl))}
                                  />
                                }
                              />
                            </div>

                            <div className="mt-6 border-t border-subtle pt-4">
                              <h4 className="mb-4 text-13 font-medium text-primary flex items-center justify-between">
                                <span className="flex items-center gap-4">
                                  Inbound Email (IMAP) Configuration
                                  {portal.is_imap_enabled && (
                                    <button
                                      type="button"
                                      onClick={() => handleSyncIMAP(portal.id)}
                                      disabled={isSyncingImap}
                                      className="text-12 font-medium text-custom-primary-100 bg-custom-primary-10/10 hover:bg-custom-primary-20/20 px-3 py-1 rounded transition-colors disabled:opacity-50"
                                    >
                                      {isSyncingImap ? "Syncing..." : "Sync Now"}
                                    </button>
                                  )}
                                </span>
                                <Switch
                                  value={draft.is_imap_enabled ?? portal.is_imap_enabled ?? false}
                                  onChange={() => handleDraftChange("is_imap_enabled", !(draft.is_imap_enabled ?? portal.is_imap_enabled))}
                                />
                              </h4>
                              {(draft.is_imap_enabled ?? portal.is_imap_enabled) && (
                                <>
                                  <div className="grid gap-4 lg:grid-cols-2">
                                    <label className="space-y-1">
                                      <span className="text-12 font-medium text-secondary">IMAP Host</span>
                                      <input
                                        type="text"
                                        value={draft.imap_host ?? portal.imap_host ?? ""}
                                        onChange={(e) => handleDraftChange("imap_host", e.target.value || null)}
                                        placeholder="imap.gmail.com"
                                        className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                      />
                                    </label>
                                    <label className="space-y-1">
                                      <span className="text-12 font-medium text-secondary">IMAP Port</span>
                                      <input
                                        type="number"
                                        value={draft.imap_port ?? portal.imap_port ?? ""}
                                        onChange={(e) => handleDraftChange("imap_port", e.target.value ? Number(e.target.value) : null)}
                                        placeholder="993"
                                        className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                      />
                                    </label>
                                    <label className="space-y-1">
                                      <span className="text-12 font-medium text-secondary">IMAP Username</span>
                                      <input
                                        type="text"
                                        value={draft.imap_username ?? portal.imap_username ?? ""}
                                        onChange={(e) => handleDraftChange("imap_username", e.target.value || null)}
                                        placeholder="Username or email"
                                        className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                      />
                                    </label>
                                    <label className="space-y-1">
                                      <span className="text-12 font-medium text-secondary">IMAP Password</span>
                                      <input
                                        type="password"
                                        value={draft.imap_password ?? portal.imap_password ?? ""}
                                        onChange={(e) => handleDraftChange("imap_password", e.target.value || null)}
                                        placeholder="Leave blank to keep existing password"
                                        className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                      />
                                    </label>
                                    <label className="space-y-1">
                                      <span className="text-12 font-medium text-secondary">Archive Folder (Optional)</span>
                                      <input
                                        type="text"
                                        value={draft.imap_archive_folder ?? portal.imap_archive_folder ?? ""}
                                        onChange={(e) => handleDraftChange("imap_archive_folder", e.target.value || null)}
                                        placeholder="e.g. Archive"
                                        className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                      />
                                    </label>
                                  </div>
                                  <div className="mt-4 flex gap-8">
                                    <SettingRow
                                      label="Use TLS"
                                      description=""
                                      className="px-0 py-0"
                                      control={
                                        <Switch
                                          value={draft.imap_use_tls ?? portal.imap_use_tls}
                                          onChange={() => handleDraftChange("imap_use_tls", !(draft.imap_use_tls ?? portal.imap_use_tls))}
                                        />
                                      }
                                    />
                                    <SettingRow
                                      label="Use SSL"
                                      description=""
                                      className="px-0 py-0"
                                      control={
                                        <Switch
                                          value={draft.imap_use_ssl ?? portal.imap_use_ssl}
                                          onChange={() => handleDraftChange("imap_use_ssl", !(draft.imap_use_ssl ?? portal.imap_use_ssl))}
                                        />
                                      }
                                    />
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="mt-6 border-t border-subtle pt-4">
                              <h4 className="text-13 font-medium text-primary">Attachments</h4>
                              <label className="mt-3 block max-w-xs">
                                <span className="text-12 text-tertiary">Maximum file size (MB)</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={instanceMaxAttachmentMb}
                                  value={attachmentSizeInputValue(portal, draft)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    // Empty means "inherit the instance limit",
                                    // which is what null encodes on the model.
                                    handleDraftChange(
                                      "max_attachment_size",
                                      raw === "" ? null : Math.round(Number(raw) * 1024 * 1024)
                                    );
                                  }}
                                  placeholder={`${instanceMaxAttachmentMb} (padrão da instância)`}
                                  className="mt-1 w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                />
                                <span className="text-11 text-tertiary mt-1 block">
                                  Deixe vazio para usar o limite da instância ({instanceMaxAttachmentMb} MB).
                                  Não é possível ultrapassá-lo — o proxy e o storage também o aplicam.
                                </span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-subtle bg-layer-2 px-6 py-12 text-center text-tertiary">
                  Create a portal first to configure email settings.
                </div>
              )}
            </section>
          )}

          {activeTab === "email-logs" && (
            <section>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-primary">Email logs</h2>
                <p className="mt-0.5 text-13 text-tertiary">
                  View the delivery status of outbound emails for your portals.
                </p>
              </div>

              {isLoadingLogs ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-accent-strong" />
                </div>
              ) : portals.length > 0 ? (
                <div className="space-y-6">
                  {portals.map((portal) => {
                    const logs = emailLogs[portal.id] || [];

                    return (
                      <div key={portal.id} className="rounded-xl border border-subtle bg-layer-2 shadow-sm">
                        <div className="border-b border-subtle px-4 py-3">
                          <h3 className="text-14 font-medium text-primary">
                            /helpdesk/p/{portal.public_slug}
                          </h3>
                        </div>
                        <div className="overflow-x-auto">
                          {logs.length === 0 ? (
                            <div className="px-6 py-12 text-center text-13 text-tertiary">
                              No email logs found for this portal.
                            </div>
                          ) : (
                            <table className="w-full text-left text-13">
                              <thead>
                                <tr className="border-b border-subtle text-secondary">
                                  <th className="px-4 py-3 font-medium">Status</th>
                                  <th className="px-4 py-3 font-medium">Message</th>
                                  <th className="px-4 py-3 font-medium">Recipient</th>
                                  <th className="px-4 py-3 font-medium">Sender</th>
                                  <th className="px-4 py-3 font-medium">Time</th>
                                  <th className="px-4 py-3 font-medium">Error (if any)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-subtle">
                                {logs.map((log) => (
                                  <tr key={log.id} className="text-primary hover:bg-layer-1">
                                    <td className="px-4 py-3">
                                      {log.email_status === "sent" && (
                                        <Badge variant="success" size="sm">Sent</Badge>
                                      )}
                                      {log.email_status === "failed" && (
                                        <Badge variant="danger" size="sm">Failed</Badge>
                                      )}
                                      {log.email_status === "pending" && (
                                        <Badge variant="warning" size="sm">Pending</Badge>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 truncate max-w-[200px]" title={log.content}>
                                      {log.content}
                                    </td>
                                    <td className="px-4 py-3">
                                      {log.customer ? "Customer" : "Unknown"}
                                    </td>
                                    {/* Authenticity of an inbound sender.
                                        "Unverified" and "Failed" are kept
                                        apart on purpose: the first means we
                                        had nothing to check (often a broken
                                        integration), the second that we
                                        checked and it was refused (often an
                                        attack). They call for opposite
                                        responses. A run of "Unverified"
                                        across every agent reply is the
                                        signature of a payload format change,
                                        not of an attack. */}
                                    <td className="px-4 py-3">
                                      {log.sender_verification === "pass" && (
                                        <Badge variant="success" size="sm">Verified</Badge>
                                      )}
                                      {log.sender_verification === "fail" && (
                                        <Badge variant="danger" size="sm">Failed</Badge>
                                      )}
                                      {log.sender_verification === "unverified" && (
                                        <Badge variant="warning" size="sm">Unverified</Badge>
                                      )}
                                      {(!log.sender_verification ||
                                        log.sender_verification === "not_applicable") && (
                                        <span className="text-tertiary">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-tertiary">
                                      {new Date(log.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-red-500 max-w-[200px] truncate" title={log.email_error ?? ""}>
                                      {log.email_error || "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-subtle bg-layer-2 px-6 py-12 text-center text-tertiary">
                  Create a portal first to view email logs.
                </div>
              )}
            </section>
          )}
          {activeTab === "imap-logs" && (
            <section>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-primary">IMAP logs</h2>
                <p className="mt-0.5 text-13 text-tertiary">
                  View the synchronization history for inbound emails (IMAP) across your portals.
                </p>
              </div>

              {isLoadingImapLogs ? (
                <div className="flex w-full items-center justify-center p-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-accent-strong" />
                </div>
              ) : portals.length > 0 ? (
                <div className="space-y-6">
                  {portals.map((portal) => {
                    const logs = imapLogs[portal.id] || [];

                    return (
                      <div key={portal.id} className="rounded-xl border border-subtle bg-layer-2 shadow-sm">
                        <div className="border-b border-subtle px-4 py-3">
                          <h3 className="text-14 font-medium text-primary">
                            /helpdesk/p/{portal.public_slug}
                          </h3>
                        </div>
                        <div className="overflow-x-auto">
                          {logs.length === 0 ? (
                            <div className="px-6 py-12 text-center text-13 text-tertiary">
                              No IMAP logs found for this portal.
                            </div>
                          ) : (
                            <table className="w-full text-left text-13">
                              <thead>
                                <tr className="border-b border-subtle text-secondary">
                                  <th className="px-4 py-3 font-medium">Status</th>
                                  <th className="px-4 py-3 font-medium">Emails Fetched</th>
                                  <th className="px-4 py-3 font-medium">Time</th>
                                  <th className="px-4 py-3 font-medium">Error (if any)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-subtle">
                                {logs.map((log) => (
                                  <tr key={log.id} className="text-primary hover:bg-layer-1">
                                    <td className="px-4 py-3">
                                      {log.status === "success" && (
                                        <Badge variant="success" size="sm">Success</Badge>
                                      )}
                                      {log.status === "error" && (
                                        <Badge variant="danger" size="sm">Error</Badge>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      {log.emails_fetched}
                                    </td>
                                    <td className="px-4 py-3 text-tertiary">
                                      {new Date(log.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-red-500 max-w-[200px] truncate" title={log.error_message ?? ""}>
                                      {log.error_message || "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-subtle bg-layer-2 px-6 py-12 text-center text-tertiary">
                  Create a portal first to view IMAP logs.
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
                              <div className="rounded-md border border-subtle bg-surface-1 px-2 py-1.5">
                                <p className="truncate text-12 font-medium text-primary">{form.name}</p>
                                <p className="mt-0.5 text-11 text-tertiary">/{form.slug}</p>
                              </div>
                              <div className="flex items-center justify-between gap-3 text-12 text-secondary">
                                <span>Visibility</span>
                                <Badge size="sm" variant={form.visibility === "private" ? "warning" : "success"}>
                                  {form.visibility}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between gap-3 text-12 text-secondary">
                                <span>Active</span>
                                <Switch
                                  value={form.is_active}
                                  onChange={() => void handleToggleFormActive(form, !form.is_active)}
                                />
                              </div>
                              {activationErrors.length > 0 && selectedForm?.id === form.id && (
                                <div className="border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/20 rounded-md border p-2">
                                  <div className="flex items-start gap-1.5">
                                    <AlertCircle className="text-red-500 mt-0.5 size-3.5 shrink-0" />
                                    <div className="space-y-0.5">
                                      {activationErrors.map((err) => (
                                        <p key={err} className="text-red-600 dark:text-red-400 text-11">
                                          {err}
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
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
                        {selectedForm && (
                          <div className="flex shrink-0 items-center gap-2">
                            {isDirty && (
                              <Badge size="sm" variant="warning">
                                Unsaved changes
                              </Badge>
                            )}
                            <button
                              type="button"
                              onClick={() => setIsPreviewOpen(true)}
                              className="flex items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-2.5 py-1.5 text-12 text-secondary transition-colors hover:text-primary"
                            >
                              <Eye className="size-3.5" />
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveAll}
                              disabled={!isDirty || isSaving}
                              className="bg-accent-strong flex items-center gap-1.5 rounded-md px-3 py-1.5 text-12 font-medium text-white transition-opacity disabled:opacity-40"
                            >
                              {isSaving ? "Saving…" : "Save"}
                            </button>
                          </div>
                        )}
                      </div>

                      {selectedForm ? (
                        <>
                          <div className="mb-4 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                            {HELPDESK_CUSTOM_FIELD_TYPES.map(({ type, label, icon: Icon }) => (
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
                              data={currentFields}
                              keyExtractor={(field) => field.id}
                              onChange={(items) => {
                                const reordered = items.map((item, index) => ({
                                  ...item,
                                  sequence: (index + 1) * 10000,
                                }));
                                setFieldsDraft(reordered);
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
                              value={draftForm?.name ?? ""}
                              onChange={(e) => handleFormSettingsChange({ name: e.target.value })}
                              placeholder="Form name"
                              className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                            />
                            <div className="space-y-1.5">
                              <label htmlFor="form-slug" className="text-12 font-medium text-secondary">
                                Form slug / endpoint
                              </label>
                              <input
                                id="form-slug"
                                value={draftForm?.slug ?? ""}
                                onChange={(e) =>
                                  handleFormSettingsChange({
                                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                                  })
                                }
                                placeholder="billing-support"
                                className="font-mono w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                              />
                              <p className="text-11 text-tertiary">
                                Public URL:{" "}
                                {selectedPortal?.public_slug
                                  ? `/helpdesk/p/${selectedPortal.public_slug}/forms/${draftForm?.slug ?? selectedForm.slug}`
                                  : "—"}
                              </p>
                            </div>
                            <div className="space-y-1.5">
                              <label htmlFor="form-visibility" className="text-12 font-medium text-secondary">
                                Visibility
                              </label>
                              <select
                                id="form-visibility"
                                value={draftForm?.visibility ?? "public"}
                                onChange={(e) =>
                                  handleFormSettingsChange({
                                    visibility: e.target.value as "public" | "private",
                                  })
                                }
                                className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                              >
                                <option value="public">Public</option>
                                <option value="private">Private</option>
                              </select>
                            </div>
                            <textarea
                              value={draftForm?.description ?? ""}
                              onChange={(e) => handleFormSettingsChange({ description: e.target.value })}
                              placeholder="Describe when customers should use this form"
                              className="min-h-20 w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                            />
                            <textarea
                              value={draftForm?.success_message ?? ""}
                              onChange={(e) => handleFormSettingsChange({ success_message: e.target.value })}
                              placeholder="Success message shown after submission"
                              className="min-h-20 w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                            />
                            <div className="space-y-1.5">
                              <label htmlFor="ticket-id-pattern" className="text-12 font-medium text-secondary">
                                Ticket ID pattern
                              </label>
                              <input
                                id="ticket-id-pattern"
                                value={draftForm?.ticket_id_pattern ?? ""}
                                onChange={(e) => handleFormSettingsChange({ ticket_id_pattern: e.target.value })}
                                placeholder="ITR-.YYYY.-.#####"
                                className="font-mono w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                              />
                              {draftForm?.ticket_id_pattern && (
                                <p className="text-12 text-tertiary">
                                  Preview:{" "}
                                  <span className="font-mono text-primary">
                                    {previewTicketIdPattern(draftForm.ticket_id_pattern)}
                                  </span>
                                </p>
                              )}
                              <p className="text-11 text-tertiary">Tokens: YYYY, YY, MM, DD, ##### (any number of #)</p>
                            </div>
                          </div>

                          {draftField ? (
                            <div className="mt-6 border-t border-subtle pt-4">
                              <h4 className="text-13 font-medium text-primary">Field settings</h4>
                              <div className="mt-3 space-y-3">
                                <input
                                  value={draftField.label}
                                  onChange={(e) => handleFormFieldChange({ label: e.target.value })}
                                  className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                />
                                {!draftField.is_system ? (
                                  <input
                                    value={draftField.key}
                                    onChange={(e) =>
                                      handleFormFieldChange({
                                        key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                                      })
                                    }
                                    className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                  />
                                ) : null}
                                <input
                                  value={draftField.placeholder}
                                  onChange={(e) => handleFormFieldChange({ placeholder: e.target.value })}
                                  placeholder="Placeholder"
                                  className="w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                />
                                <textarea
                                  value={draftField.help_text}
                                  onChange={(e) => handleFormFieldChange({ help_text: e.target.value })}
                                  placeholder="Help text"
                                  className="min-h-20 w-full rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                />
                                {draftField.field_type === "select" ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-12 font-medium text-secondary">Dropdown options</p>
                                      <button
                                        type="button"
                                        onClick={handleAddDropdownOption}
                                        className="rounded-md border border-subtle bg-layer-1 px-2.5 py-1 text-12 text-secondary transition-colors hover:text-primary"
                                      >
                                        Add option
                                      </button>
                                    </div>
                                    <div className="space-y-2">
                                      <Sortable
                                        data={draftField.options}
                                        keyExtractor={(option) => `${option.value}|${option.label}`}
                                        onChange={handleReorderDropdownOptions}
                                        render={(option, index) => (
                                          <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 pb-2">
                                            <span
                                              className="cursor-grab text-tertiary transition-colors hover:text-primary active:cursor-grabbing"
                                              title="Drag to reorder"
                                            >
                                              <GripVertical className="size-4" />
                                            </span>
                                            <input
                                              value={option.label}
                                              onChange={(e) =>
                                                handleDropdownOptionChange(index, { label: e.target.value })
                                              }
                                              placeholder="Label"
                                              className="min-w-0 rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                            />
                                            <input
                                              value={option.value}
                                              onChange={(e) =>
                                                handleDropdownOptionChange(index, {
                                                  value: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                                                })
                                              }
                                              placeholder="value"
                                              className="min-w-0 rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveDropdownOption(index)}
                                              className="text-red-500 rounded-md px-2 text-12"
                                              disabled={draftField.options.length <= 1}
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        )}
                                      />
                                    </div>
                                  </div>
                                ) : null}
                                {draftField.field_type === "cascade_select" ? (
                                  <div className="space-y-3">
                                    {/* Parent field selector */}
                                    <div className="space-y-1.5">
                                      <p className="text-12 font-medium text-secondary">Parent field</p>
                                      <select
                                        value={draftField.parent_field_key ?? ""}
                                        onChange={(e) =>
                                          handleFormFieldChange({
                                            parent_field_key: e.target.value,
                                            parent_mapping: {},
                                          })
                                        }
                                        className="w-full rounded-md border border-subtle bg-layer-1 px-2 py-1.5 text-12 text-primary outline-none"
                                      >
                                        <option value="">None (root level)</option>
                                        {selectedFormFields
                                          .filter((f) => f.id !== draftField.id && f.field_type === "cascade_select")
                                          .map((f) => (
                                            <option key={f.id} value={f.key}>
                                              {f.label}
                                            </option>
                                          ))}
                                      </select>
                                    </div>

                                    {/* Own options list (flat) */}
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="text-12 font-medium text-secondary">Options</p>
                                        <button
                                          type="button"
                                          onClick={handleAddCascadeOption}
                                          className="rounded-md border border-subtle bg-layer-1 px-2.5 py-1 text-12 text-secondary transition-colors hover:text-primary"
                                        >
                                          Add option
                                        </button>
                                      </div>
                                      <div className="space-y-1.5">
                                        <Sortable
                                          data={draftField.options}
                                          keyExtractor={(opt) => `${opt.value}|${opt.label}`}
                                          onChange={handleReorderCascadeOptions}
                                          render={(opt, idx) => (
                                            <div className="flex items-center gap-2 pb-1.5">
                                              <span
                                                className="cursor-grab text-tertiary transition-colors hover:text-primary active:cursor-grabbing"
                                                title="Drag to reorder"
                                              >
                                                <GripVertical className="size-4" />
                                              </span>
                                              <input
                                                value={opt.label}
                                                onChange={(e) => handleCascadeOptionLabelChange(idx, e.target.value)}
                                                placeholder="Option label"
                                                className="min-w-0 flex-1 rounded-md border border-subtle bg-layer-1 px-2 py-1.5 text-12 text-primary outline-none"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => handleRemoveCascadeOption(idx)}
                                                className="text-red-400 hover:text-red-500 shrink-0 rounded p-1"
                                              >
                                                <X className="size-3" />
                                              </button>
                                            </div>
                                          )}
                                        />
                                        {draftField.options.length === 0 && (
                                          <p className="text-11 text-tertiary">No options yet. Add some above.</p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Mapping editor — only for child fields */}
                                    {draftField.parent_field_key &&
                                      (() => {
                                        const parentField = selectedFormFields.find(
                                          (f) => f.key === draftField.parent_field_key
                                        );
                                        if (!parentField || parentField.options.length === 0) {
                                          return (
                                            <p className="text-11 text-tertiary">
                                              Add options to the parent field first to configure the mapping.
                                            </p>
                                          );
                                        }
                                        return (
                                          <div className="space-y-1.5">
                                            <p className="text-12 font-medium text-secondary">
                                              Mapping — which options appear per parent value
                                            </p>
                                            <div className="divide-y divide-subtle rounded-md border border-subtle bg-layer-1">
                                              {parentField.options.map((parentOpt) => {
                                                const checkedValues = new Set(
                                                  draftField.parent_mapping[parentOpt.value] ?? []
                                                );
                                                return (
                                                  <div key={parentOpt.value} className="px-3 py-2">
                                                    <p className="mb-1.5 text-11 font-medium text-secondary">
                                                      {parentOpt.label}
                                                    </p>
                                                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                                                      {draftField.options.length === 0 ? (
                                                        <span className="text-11 text-tertiary italic">
                                                          No options in this field yet
                                                        </span>
                                                      ) : (
                                                        draftField.options.map((childOpt) => (
                                                          <label
                                                            key={childOpt.value}
                                                            className="flex cursor-pointer items-center gap-1.5 text-12 text-secondary"
                                                          >
                                                            <input
                                                              type="checkbox"
                                                              checked={checkedValues.has(childOpt.value)}
                                                              onChange={(e) =>
                                                                handleCascadeMappingToggle(
                                                                  parentOpt.value,
                                                                  childOpt.value,
                                                                  e.target.checked
                                                                )
                                                              }
                                                              className="accent-accent-strong h-3.5 w-3.5 rounded border-subtle"
                                                            />
                                                            {childOpt.label}
                                                          </label>
                                                        ))
                                                      )}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                  </div>
                                ) : null}
                                <div className="flex items-center justify-between text-12 text-secondary">
                                  <span>Required</span>
                                  <Switch
                                    value={draftField.required}
                                    onChange={() => handleFormFieldChange({ required: !draftField.required })}
                                  />
                                </div>
                                {!draftField.is_system ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (selectedField) {
                                        if (!selectedField.id.startsWith("temp-")) {
                                          setDeletedFieldIds((prev) => new Set(prev).add(selectedField.id));
                                        }
                                        const current = fieldsDraft ?? selectedFormFields.map((f) => ({ ...f }));
                                        setFieldsDraft(current.filter((f) => f.id !== selectedField.id));
                                        setSelectedFieldId(null);
                                      }
                                    }}
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

          {/* ── Members ── */}
          {activeTab === "members" && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-primary">Members</h2>
                  <p className="mt-0.5 text-13 text-tertiary">
                    Control who can access and manage the Helpdesk module. Workspace admins always have full access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingMember(true)}
                  className="flex items-center gap-1.5 rounded-md border border-subtle bg-layer-2 px-3 py-1.5 text-13 font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                >
                  <Plus className="size-3.5" />
                  Add members
                </button>
              </div>

              {isAddingMember && (
                <div className="mb-4 space-y-3 rounded-xl border border-dashed border-subtle bg-layer-2 p-4">
                  <p className="tracking-wider text-12 font-medium text-tertiary uppercase">Add workspace members</p>
                  <MemberDropdown
                    value={selectedMemberIds}
                    onChange={(ids: string[]) => setSelectedMemberIds(ids)}
                    multiple
                    buttonVariant="transparent-with-text"
                    placeholder="Select members..."
                  />
                  <div className="flex items-center gap-3">
                    <select
                      value={selectedMemberRole}
                      onChange={(e) => setSelectedMemberRole(Number(e.target.value))}
                      className="rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                    >
                      <option value={20}>Admin</option>
                      <option value={15}>Member</option>
                      <option value={5}>Guest</option>
                    </select>
                    <button
                      type="button"
                      disabled={selectedMemberIds.length === 0}
                      onClick={async () => {
                        if (!selectedMemberIds.length) return;
                        try {
                          await helpdeskStore.addMembers(
                            wSlug,
                            selectedMemberIds.map((id) => ({
                              member_id: id,
                              role: selectedMemberRole as EHelpdeskMemberRole,
                            }))
                          );
                          setSelectedMemberIds([]);
                          setIsAddingMember(false);
                          setToast({ type: TOAST_TYPE.SUCCESS, title: "Members added" });
                        } catch {
                          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to add members" });
                        }
                      }}
                      className="bg-accent-strong rounded-md px-3 py-2 text-13 font-medium text-white disabled:opacity-50"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingMember(false);
                        setSelectedMemberIds([]);
                      }}
                      className="text-tertiary transition-colors hover:text-primary"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-subtle overflow-hidden rounded-xl border border-subtle bg-layer-2">
                {helpdeskStore.getWorkspaceMembers(wSlug).map((hm) => (
                  <HelpdeskMemberRow
                    key={hm.id}
                    helpdeskMember={hm}
                    onRoleChange={async (role) => {
                      try {
                        await helpdeskStore.updateMember(wSlug, hm.id, { role });
                      } catch {
                        setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update role" });
                      }
                    }}
                    onRemove={() => setRemovingMemberId(hm.id)}
                  />
                ))}
                {helpdeskStore.getWorkspaceMembers(wSlug).length === 0 && (
                  <div className="py-10 text-center text-13 text-tertiary">
                    No members added yet. Add workspace members above to give them access.
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Teams ── */}
          {activeTab === "teams" && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-primary">Teams</h2>
                  <p className="mt-0.5 text-13 text-tertiary">
                    Create teams and agent groups to organize ticket routing and assignments.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreatingTeam(true)}
                  className="flex items-center gap-1.5 rounded-md border border-subtle bg-layer-2 px-3 py-1.5 text-13 font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                >
                  <Plus className="size-3.5" />
                  Create team
                </button>
              </div>

              {isCreatingTeam && (
                <div className="mb-4 space-y-3 rounded-xl border border-dashed border-subtle bg-layer-2 p-4">
                  <p className="tracking-wider text-12 font-medium text-tertiary uppercase">New Team</p>
                  <div className="flex flex-col gap-3">
                    <input
                      type="text"
                      placeholder="Team name (e.g. Suporte N2, Financeiro)"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      className="rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={teamDescription}
                      onChange={(e) => setTeamDescription(e.target.value)}
                      className="rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-12 text-tertiary">Color:</span>
                      <div className="flex items-center gap-1">
                        {COLOR_PALETTE.slice(0, 8).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setTeamColor(c)}
                            style={{ backgroundColor: c }}
                            className={cn(
                              "size-5 rounded-full border border-black/20 transition-transform",
                              teamColor === c && "scale-125 ring-2 ring-white"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        disabled={!teamName.trim()}
                        onClick={async () => {
                          if (!teamName.trim()) return;
                          try {
                            await helpdeskStore.createTeam(wSlug, {
                              name: teamName.trim(),
                              description: teamDescription.trim(),
                              color: teamColor,
                            });
                            setTeamName("");
                            setTeamDescription("");
                            setIsCreatingTeam(false);
                            setToast({ type: TOAST_TYPE.SUCCESS, title: "Team created" });
                          } catch {
                            setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to create team" });
                          }
                        }}
                        className="bg-accent-strong rounded-md px-3 py-2 text-13 font-medium text-white disabled:opacity-50"
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingTeam(false);
                          setTeamName("");
                          setTeamDescription("");
                        }}
                        className="text-tertiary transition-colors hover:text-primary"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="divide-y divide-subtle overflow-hidden rounded-xl border border-subtle bg-layer-2">
                {helpdeskStore.getWorkspaceTeams(wSlug).map((team) => (
                  <div key={team.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: team.color || "#3B82F6" }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-13 font-medium text-primary">{team.name}</p>
                        {team.description && <p className="truncate text-12 text-tertiary">{team.description}</p>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await helpdeskStore.deleteTeam(wSlug, team.id);
                          setToast({ type: TOAST_TYPE.SUCCESS, title: "Team removed" });
                        } catch {
                          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to delete team" });
                        }
                      }}
                      className="hover:text-red-500 text-tertiary transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                {helpdeskStore.getWorkspaceTeams(wSlug).length === 0 && (
                  <div className="py-10 text-center text-13 text-tertiary">
                    No teams created yet. Click "Create team" above to add your first agent group.
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Macros ── */}
          {activeTab === "macros" && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-primary">Macros & Response Templates</h2>
                  <p className="mt-0.5 text-13 text-tertiary">
                    Create reusable response templates for agents to quickly reply to common customer requests.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreatingMacro(true)}
                  className="flex items-center gap-1.5 rounded-md border border-subtle bg-layer-2 px-3 py-1.5 text-13 font-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                >
                  <Plus className="size-3.5" />
                  Create macro
                </button>
              </div>

              {isCreatingMacro && (
                <div className="mb-4 space-y-3 rounded-xl border border-dashed border-subtle bg-layer-2 p-4">
                  <p className="tracking-wider text-12 font-medium text-tertiary uppercase">New Macro</p>
                  <div className="flex flex-col gap-3">
                    <input
                      type="text"
                      placeholder="Macro name (e.g. Solicitar logs, Confirmação de recebimento)"
                      value={macroName}
                      onChange={(e) => setMacroName(e.target.value)}
                      className="rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Description (optional short summary)"
                      value={macroDescription}
                      onChange={(e) => setMacroDescription(e.target.value)}
                      className="rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13 text-primary outline-none"
                    />
                    <textarea
                      placeholder="Response template content..."
                      rows={3}
                      value={macroContent}
                      onChange={(e) => setMacroContent(e.target.value)}
                      className="rounded-md border border-subtle bg-layer-1 p-3 text-13 text-primary outline-none resize-none"
                    />
                    <label className="flex items-center gap-2 cursor-pointer text-12 text-secondary">
                      <input
                        type="checkbox"
                        checked={macroIsPublic}
                        onChange={(e) => setMacroIsPublic(e.target.checked)}
                        className="rounded border-subtle"
                      />
                      <span>Public macro (accessible by all agents in the workspace)</span>
                    </label>
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        disabled={!macroName.trim() || !macroContent.trim()}
                        onClick={async () => {
                          if (!macroName.trim() || !macroContent.trim()) return;
                          try {
                            await helpdeskStore.createMacro(wSlug, {
                              name: macroName.trim(),
                              description: macroDescription.trim(),
                              content: macroContent.trim(),
                              is_public: macroIsPublic,
                            });
                            setMacroName("");
                            setMacroDescription("");
                            setMacroContent("");
                            setMacroIsPublic(true);
                            setIsCreatingMacro(false);
                            setToast({ type: TOAST_TYPE.SUCCESS, title: "Macro created" });
                          } catch {
                            setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to create macro" });
                          }
                        }}
                        className="bg-accent-strong rounded-md px-3 py-2 text-13 font-medium text-white disabled:opacity-50"
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingMacro(false);
                          setMacroName("");
                          setMacroDescription("");
                          setMacroContent("");
                        }}
                        className="text-tertiary transition-colors hover:text-primary"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="divide-y divide-subtle overflow-hidden rounded-xl border border-subtle bg-layer-2">
                {helpdeskStore.getWorkspaceMacros(wSlug).map((macro) => (
                  <div key={macro.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-13 text-primary">{macro.name}</span>
                        {!macro.is_public && (
                          <span className="text-[10px] bg-layer-1 border border-subtle px-1.5 py-0.5 rounded text-tertiary">Privada</span>
                        )}
                      </div>
                      {macro.description && <p className="text-12 text-tertiary">{macro.description}</p>}
                      <p className="text-12 text-secondary font-mono bg-layer-1 p-2 rounded border border-subtle whitespace-pre-wrap">{macro.content}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await helpdeskStore.deleteMacro(wSlug, macro.id);
                          setToast({ type: TOAST_TYPE.SUCCESS, title: "Macro removed" });
                        } catch {
                          setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to delete macro" });
                        }
                      }}
                      className="hover:text-red-500 text-tertiary transition-colors shrink-0"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                {helpdeskStore.getWorkspaceMacros(wSlug).length === 0 && (
                  <div className="py-10 text-center text-13 text-tertiary">
                    No macros created yet. Click "Create macro" above to add your first response template.
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Form preview modal */}
      {isPreviewOpen && selectedForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="shadow-xl flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-subtle bg-layer-1">
            <div className="flex items-center justify-between border-b border-subtle p-4">
              <div>
                <h3 className="text-sm font-semibold text-primary">{selectedForm.name}</h3>
                <p className="mt-0.5 text-12 text-tertiary">Preview mode — not submittable</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <HelpdeskFormRenderer fields={currentFields} isPreview />
            </div>
            <div className="flex justify-end border-t border-subtle p-4">
              <Button variant="primary" size="base" disabled title="Preview mode — submission disabled">
                Submit request
              </Button>
            </div>
          </div>
        </div>
      )}

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

      {removingMemberId && (
        <ConfirmModal
          title="Remove member?"
          body="This person will lose access to the Helpdesk module."
          confirmLabel="Remove"
          onConfirm={async () => {
            try {
              await helpdeskStore.removeMember(wSlug, removingMemberId);
              setToast({ type: TOAST_TYPE.SUCCESS, title: "Member removed" });
            } catch {
              setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to remove member" });
            } finally {
              setRemovingMemberId(null);
            }
          }}
          onCancel={() => setRemovingMemberId(null)}
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

function SettingRow({
  label,
  description,
  control,
  className,
}: {
  label: string;
  description: string;
  control: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 px-4 py-3", className)}>
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

function HelpdeskMemberRow({
  helpdeskMember,
  onRoleChange,
  onRemove,
}: {
  helpdeskMember: IHelpdeskMember;
  onRoleChange: (role: EHelpdeskMemberRole) => void;
  onRemove: () => void;
}) {
  const d = helpdeskMember.member_detail;
  const displayName = d.display_name || `${d.first_name} ${d.last_name}`.trim() || "Unknown";

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {d.avatar_url ? (
        <img src={d.avatar_url} alt={displayName} className="size-7 rounded-full object-cover" />
      ) : (
        <div className="bg-accent-strong/20 text-accent-strong flex size-7 items-center justify-center rounded-full text-11 font-medium">
          {displayName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-13 font-medium text-primary">{displayName}</p>
      </div>
      <select
        value={helpdeskMember.role}
        onChange={(e) => onRoleChange(Number(e.target.value) as EHelpdeskMemberRole)}
        className="rounded-md border border-subtle bg-layer-1 px-2 py-1 text-12 text-secondary outline-none"
      >
        <option value={20}>Admin</option>
        <option value={15}>Member</option>
        <option value={5}>Guest</option>
      </select>
      <button type="button" onClick={onRemove} className="hover:text-red-500 text-tertiary transition-colors">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

export default HelpdeskSettingsPage;
