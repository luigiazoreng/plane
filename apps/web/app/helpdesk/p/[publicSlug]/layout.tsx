/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { Outlet, Link, useParams, useNavigate } from "react-router";
import { observer } from "mobx-react";
import { publicHelpdeskStore } from "@/store/public-helpdesk.store";

const PublicHelpdeskLayout = observer(() => {
  const { publicSlug } = useParams();
  const navigate = useNavigate();
  const { customerToken, customerData, logout } = publicHelpdeskStore;

  return (
    <div className="flex min-h-screen flex-col bg-surface-1">
      {/* Minimal Header */}
      <header className="sticky top-0 z-10 border-b border-subtle bg-surface-1/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded font-bold text-primary">
              P
            </div>
            <span className="text-lg text-text-100 font-semibold">Helpdesk</span>
          </div>
          <div className="text-sm flex items-center gap-4 font-medium">
            {customerToken ? (
              <>
                <span className="text-text-300 text-sm">{customerData?.name || customerData?.email}</span>
                <button
                  onClick={() => {
                    logout();
                    navigate(`/helpdesk/p/${publicSlug}`);
                  }}
                  className="text-text-300 hover:text-red-400 transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to={`/helpdesk/p/${publicSlug}/login`}
                className="text-text-300 hover:text-text-100 transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-8">
        <div className="mx-auto max-w-5xl px-6">
          <Outlet />
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="mt-auto border-t border-subtle bg-surface-2 py-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <p className="text-xs text-text-400">Powered by Plane</p>
          <div className="text-xs text-text-400 flex items-center gap-4">
            <span className="hover:text-text-100 cursor-pointer">Terms</span>
            <span className="hover:text-text-100 cursor-pointer">Privacy</span>
          </div>
        </div>
      </footer>
    </div>
  );
});

export default PublicHelpdeskLayout;
