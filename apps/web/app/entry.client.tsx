/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    {
      onRecoverableError(error, errorInfo) {
        // Suppress unhandled hydration errors caused by edge script injections
        // (e.g. Cloudflare Zaraz, Cloudflare Web Analytics, or browser extensions).
        // React automatically recovers by falling back to client-side rendering.
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes("Hydration failed") ||
          errorMessage.includes("Minified React error #418") ||
          errorMessage.includes("Minified React error #423")
        ) {
          return;
        }
        console.error("Recoverable hydration error:", error, errorInfo);
      },
    }
  );
});
