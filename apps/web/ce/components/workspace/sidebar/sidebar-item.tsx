/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import type { IWorkspaceSidebarNavigationItem } from "@plane/constants";
import { EUserPermissionsLevel } from "@plane/constants";
import { SidebarItemBase } from "@/components/workspace/sidebar/sidebar-item";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspaceNavigationPreferences } from "@/hooks/use-navigation-preferences";
import { HelpdeskSidebarItem } from "./helpdesk-sidebar-item";

type Props = {
  item: IWorkspaceSidebarNavigationItem;
};

export function SidebarItem({ item }: Props) {
  const { workspaceSlug } = useParams();
  const { allowPermissions } = useUserPermissions();
  const { isWorkspaceItemPinned } = useWorkspaceNavigationPreferences();

  const slug = workspaceSlug?.toString() || "";

  if (item.key === "helpdesk") {
    if (!allowPermissions(item.access, EUserPermissionsLevel.WORKSPACE, slug)) return null;
    if (!isWorkspaceItemPinned(item.key)) return null;
    return <HelpdeskSidebarItem workspaceSlug={slug} />;
  }

  return <SidebarItemBase item={item} />;
}
