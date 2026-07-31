/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useParams } from "react-router";
import { PageHead } from "@/components/core/page-title";
import { ExecutiveDashboardLayout } from "@/components/executive/dashboard-layout";

const WorkspaceExecutivePage = observer(() => {
  const { workspaceSlug } = useParams();
  const wSlug = workspaceSlug?.toString() || "";

  return (
    <>
      <PageHead title="Executive Dashboard" />
      <ExecutiveDashboardLayout workspaceSlug={wSlug} />
    </>
  );
});

export default WorkspaceExecutivePage;
