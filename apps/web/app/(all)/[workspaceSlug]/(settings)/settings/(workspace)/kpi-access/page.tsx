/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Trash2, UserPlus } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { Avatar, Checkbox, EModalPosition, EModalWidth, ModalCore, Spinner } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useKpi } from "@/hooks/store/use-kpi";
import { useMember } from "@/hooks/store/use-member";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import { KpiAccessWorkspaceSettingsHeader } from "./header";

type AddMembersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  candidates: { id: string; displayName: string; avatarUrl: string | null }[];
  onConfirm: (memberIds: string[]) => Promise<void>;
};

const AddMembersModal = observer(function AddMembersModal({
  isOpen,
  onClose,
  candidates,
  onConfirm,
}: AddMembersModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    onClose();
  };

  const handleConfirm = async () => {
    if (selectedIds.size === 0 || isSaving) return;
    setIsSaving(true);
    try {
      await onConfirm([...selectedIds]);
      setSelectedIds(new Set());
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-16 font-medium text-primary">Give access to the KPI panels</h3>
          <p className="text-12 text-tertiary">
            Everyone you pick can open the general KPI and Executive dashboards, including the performance scores of
            every member and every project with KPIs enabled.
          </p>
        </div>

        {candidates.length === 0 ? (
          <p className="py-8 text-center text-13 text-tertiary">
            Everyone in this workspace is either an admin or already has access.
          </p>
        ) : (
          <div className="vertical-scrollbar scrollbar-sm max-h-80 overflow-y-auto">
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => toggle(candidate.id)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-layer-transparent-hover"
              >
                <Checkbox checked={selectedIds.has(candidate.id)} onChange={() => toggle(candidate.id)} />
                <Avatar name={candidate.displayName} src={getFileURL(candidate.avatarUrl ?? "")} size="md" />
                <span className="text-13 text-primary">{candidate.displayName}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-subtle pt-4">
          <Button variant="secondary" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleConfirm} disabled={selectedIds.size === 0 || isSaving}>
            {isSaving ? "Giving access..." : `Give access${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});

function KpiAccessSettingsPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() || "";

  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { accessGrants, fetchAccessGrants, grantAccess, revokeAccess } = useKpi();
  const {
    workspace: { fetchWorkspaceMembers, workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, slug);

  // Both requests are admin-only, so they stay behind the permission check to
  // avoid firing a request that can only 403.
  useSWR(slug && isAdmin ? `KPI_ACCESS_${slug}` : null, slug && isAdmin ? () => fetchAccessGrants(slug) : null);
  useSWR(
    slug && isAdmin ? `WORKSPACE_MEMBERS_${slug}` : null,
    slug && isAdmin ? () => fetchWorkspaceMembers(slug) : null
  );

  const grants = accessGrants[slug];

  // Admins are excluded: they already have access by role, so offering to grant
  // it would create a row that changes nothing and implies it could be revoked.
  const candidates = useMemo(() => {
    const alreadyGranted = new Set((grants ?? []).map((grant) => grant.member));
    return (workspaceMemberIds ?? [])
      .map((memberId) => getWorkspaceMemberDetails(memberId))
      .filter((detail) => detail?.member && detail.is_active)
      .filter((detail) => detail!.role !== EUserPermissions.ADMIN)
      .filter((detail) => !alreadyGranted.has(detail!.member.id))
      .map((detail) => ({
        id: detail!.member.id,
        displayName: detail!.member.display_name,
        avatarUrl: detail!.member.avatar_url ?? null,
      }));
  }, [grants, workspaceMemberIds, getWorkspaceMemberDetails]);

  const handleGrant = async (memberIds: string[]) => {
    try {
      await grantAccess(slug, memberIds);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Access granted",
        message: `${memberIds.length} ${memberIds.length === 1 ? "person" : "people"} can now open the KPI panels.`,
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not give access",
        message: "Please try again.",
      });
    }
  };

  const handleRevoke = async (grantId: string, displayName: string) => {
    setRevokingId(grantId);
    try {
      await revokeAccess(slug, grantId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Access removed",
        message: `${displayName} can no longer open the KPI panels.`,
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not remove access",
        message: "Please try again.",
      });
    } finally {
      setRevokingId(null);
    }
  };

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - KPI access` : undefined;

  if (workspaceUserInfo && !isAdmin) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<KpiAccessWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="flex w-full flex-col gap-y-6">
        <SettingsHeading
          title="KPI access"
          description="Workspace admins can always open the general KPI and Executive dashboards. Add anyone else who needs to see them here."
          control={
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-1.5"
            >
              <UserPlus className="size-3.5" />
              Give access
            </Button>
          }
        />

        {!grants ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : grants.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-subtle py-12 text-center">
            <p className="text-13 font-medium text-secondary">Only admins can open the KPI panels</p>
            <p className="text-12 text-tertiary">Give access to anyone outside the admin group who needs them.</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-subtle rounded-md border border-subtle">
            {grants.map((grant) => (
              <div key={grant.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={grant.member_detail.display_name}
                    src={getFileURL(grant.member_detail.avatar_url ?? "")}
                    size="md"
                  />
                  <span className="text-13 text-primary">{grant.member_detail.display_name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(grant.id, grant.member_detail.display_name)}
                  disabled={revokingId === grant.id}
                  aria-label={`Remove access for ${grant.member_detail.display_name}`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-12 text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-danger-primary disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                  {revokingId === grant.id ? "Removing..." : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-12 text-tertiary">Access changes apply the next time the person loads the workspace.</p>
      </div>

      <AddMembersModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        candidates={candidates}
        onConfirm={handleGrant}
      />
    </SettingsContentWrapper>
  );
}

export default observer(KpiAccessSettingsPage);
