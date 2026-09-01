/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams, Outlet } from "react-router";
import { Gauge } from "lucide-react";
// components
import { AppHeader } from "@/components/core/app-header";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { ContentWrapper } from "@/components/core/content-wrapper";
// hooks
import { useUserPermissions } from "@/hooks/store/user";

const KpiAccessGuard = observer(function KpiAccessGuard({ children }: { children: React.ReactNode }) {
  const { workspaceSlug } = useParams();
  const { hasPageAccess, workspaceInfoBySlug } = useUserPermissions();
  const slug = workspaceSlug?.toString() || "";

  // Wait for the bootstrap request: until /workspace-members/me/ lands there is
  // no flag to read, and denying early would flash "not authorized" at people who
  // do have access.
  if (!workspaceInfoBySlug(slug)) return null;
  if (!hasPageAccess(slug, "kpi")) return <NotAuthorizedView className="h-full" />;

  return <>{children}</>;
});

export default function WorkspaceKpiLayout() {
  return (
    <KpiAccessGuard>
      <AppHeader
        header={
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-tertiary" />
            <span className="text-sm font-medium text-primary">Workspace KPI</span>
          </div>
        }
      />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </KpiAccessGuard>
  );
}
