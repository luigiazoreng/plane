/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { IExecutiveExportPayload } from "./export-excel";

/**
 * The export controls live in the route layout's `AppHeader`, but everything
 * they export is fetched and derived one level down, inside the dashboard.
 * This context is the seam: the dashboard publishes its current payload, the
 * header consumes it. Null means "nothing loaded yet" -- the header disables
 * the Excel option rather than writing an empty workbook.
 */
type TExecutiveExportContext = {
  payload: IExecutiveExportPayload | null;
  setPayload: (payload: IExecutiveExportPayload | null) => void;
};

const ExecutiveExportContext = createContext<TExecutiveExportContext | undefined>(undefined);

export const ExecutiveExportProvider = ({ children }: { children: React.ReactNode }) => {
  const [payload, setPayload] = useState<IExecutiveExportPayload | null>(null);
  const value = useMemo(() => ({ payload, setPayload }), [payload]);

  return <ExecutiveExportContext.Provider value={value}>{children}</ExecutiveExportContext.Provider>;
};

export const useExecutiveExport = (): TExecutiveExportContext => {
  const context = useContext(ExecutiveExportContext);
  if (!context) throw new Error("useExecutiveExport must be used within an ExecutiveExportProvider");
  return context;
};
