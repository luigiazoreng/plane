/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Outlet } from "react-router";
import { HelpCircle, LayoutDashboard, Printer } from "lucide-react";
// components
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ExecutiveHelpModal } from "@/components/executive/executive-help-modal";

export default function WorkspaceExecutiveLayout() {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <AppHeader
        header={
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="text-custom-text-300 size-4" />
              <span className="text-sm text-custom-text-100 font-medium">Executive Dashboard</span>
            </div>
            <div className="hide-on-print flex items-center gap-4">
              <button
                type="button"
                onClick={() => setIsHelpOpen(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-custom-text-300 transition-colors hover:text-custom-text-100"
              >
                <HelpCircle className="size-3.5" />
                How it works
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-md bg-custom-primary-100 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                <Printer className="size-3.5" />
                Export to PDF
              </button>
            </div>
          </div>
        }
      />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
      <ExecutiveHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}
