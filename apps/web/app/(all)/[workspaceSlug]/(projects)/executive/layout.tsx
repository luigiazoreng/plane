/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Outlet } from "react-router";
import { ChevronDown, FileSpreadsheet, HelpCircle, LayoutDashboard, Printer } from "lucide-react";
import { Menu } from "@plane/propel/menu";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
// components
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ExecutiveHelpModal } from "@/components/executive/executive-help-modal";
import { ExecutiveExportProvider, useExecutiveExport } from "@/components/executive/export-context";
import { excludeMembersFromExport, exportExecutiveExcel } from "@/components/executive/export-excel";
import { ExportRemoveMembersModal } from "@/components/executive/export-remove-members-modal";

const handlePrint = () => {
  window.print();
};

const ExportMenu = () => {
  const { payload } = useExecutiveExport();
  const [isExporting, setIsExporting] = useState(false);
  const [isPickingMembers, setIsPickingMembers] = useState(false);
  // Kept at this level, not inside the modal, so unchecking someone survives
  // closing the picker and reopening it for the same export.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const handleExcel = async () => {
    if (!payload || isExporting) return;
    setIsExporting(true);
    try {
      await exportExecutiveExcel(excludeMembersFromExport(payload, excludedIds));
      setIsPickingMembers(false);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Export failed",
        message: "The Excel workbook could not be generated. Please try again.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Menu
        noChevron
        placement="bottom"
        optionsClassName="min-w-[200px]"
        customButton={
          <div className="text-xs flex items-center gap-1.5 rounded-md bg-accent-primary px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90">
            Export
            <ChevronDown className="size-3.5" />
          </div>
        }
      >
        <Menu.MenuItem onClick={handlePrint}>
          <span className="flex items-center gap-2">
            <Printer className="size-3.5" />
            Export to PDF
          </span>
        </Menu.MenuItem>
        <Menu.MenuItem onClick={() => setIsPickingMembers(true)} disabled={!payload || isExporting}>
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="size-3.5" />
            {isExporting ? "Exporting..." : "Export to Excel"}
          </span>
        </Menu.MenuItem>
      </Menu>
      <ExportRemoveMembersModal
        isOpen={isPickingMembers}
        onClose={() => setIsPickingMembers(false)}
        members={payload?.members ?? []}
        excludedIds={excludedIds}
        onChangeExcludedIds={setExcludedIds}
        onConfirm={handleExcel}
        isExporting={isExporting}
      />
    </>
  );
};

export default function WorkspaceExecutiveLayout() {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <ExecutiveExportProvider>
      <AppHeader
        header={
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="size-4 text-tertiary" />
              <span className="text-sm font-medium text-primary">Executive Dashboard</span>
            </div>
            <div className="hide-on-print flex items-center gap-4">
              <button
                type="button"
                onClick={() => setIsHelpOpen(true)}
                className="text-xs flex items-center gap-1.5 font-medium text-tertiary transition-colors hover:text-primary"
              >
                <HelpCircle className="size-3.5" />
                How it works
              </button>
              <ExportMenu />
            </div>
          </div>
        }
      />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
      <ExecutiveHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </ExecutiveExportProvider>
  );
}
