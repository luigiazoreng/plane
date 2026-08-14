/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
import { Gauge } from "lucide-react";
// components
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";

export default function WorkspaceKpiLayout() {
  return (
    <>
      <AppHeader
        header={
          <div className="flex items-center gap-2">
            <Gauge className="text-tertiary size-4" />
            <span className="text-sm text-primary font-medium">Workspace KPI</span>
          </div>
        }
      />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
