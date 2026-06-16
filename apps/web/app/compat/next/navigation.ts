/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useMemo } from "react";
import {
  useLocation,
  useMatches,
  useNavigate,
  useParams as useParamsRR,
  useSearchParams as useSearchParamsRR,
} from "react-router";
import { ensureTrailingSlash } from "./helper";

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (to: string) => {
        // Defer navigation to avoid state updates during render
        setTimeout(() => navigate(ensureTrailingSlash(to)), 0);
      },
      replace: (to: string) => {
        // Defer navigation to avoid state updates during render
        setTimeout(() => navigate(ensureTrailingSlash(to), { replace: true }), 0);
      },
      back: () => {
        setTimeout(() => navigate(-1), 0);
      },
      forward: () => {
        setTimeout(() => navigate(1), 0);
      },
      refresh: () => {
        location.reload();
      },
      prefetch: async (_to: string) => {
        // no-op in this shim
      },
    }),
    [navigate]
  );
}

export function usePathname(): string {
  const { pathname } = useLocation();
  return pathname;
}

export function useSearchParams(): URLSearchParams {
  const [searchParams] = useSearchParamsRR();
  return searchParams;
}

/**
 * Shallow-compares two plain param objects by value.
 * Returns true if every key/value pair is identical in both objects.
 */
function paramsEqual(
  a: Record<string, string | string[] | undefined>,
  b: Record<string, string | string[] | undefined>
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Next.js `useParams()` returns ALL route params for the current URL, regardless of where
 * the component sits in the tree. React Router's `useParams()` is scoped to the matched route,
 * so a provider mounted above the `:projectId` segment would not see `projectId`.
 *
 * To preserve the Next.js behaviour our code relies on (e.g. the root store-wrapper that feeds
 * `projectId`/`workspaceSlug` into the router store), we merge params from every matched route.
 *
 * IMPORTANT: `useMatches()` returns a new array reference on every render, which would
 * invalidate `useMemo` and produce a new object each time — causing infinite re-render
 * cascades in MobX observers (e.g. StoreWrapper).  We stabilise the output by keeping
 * a ref to the previous result and only returning a new object when the *values* change.
 */
export function useParams() {
  const scopedParams = useParamsRR();
  const matches = useMatches();
  const prevRef = useRef<Record<string, string | string[] | undefined>>({});

  return useMemo(() => {
    const merged: Record<string, string | string[] | undefined> = {};
    for (const match of matches) {
      Object.assign(merged, match.params);
    }
    // Scoped params win for the deepest match, but merged covers ancestors/descendants too.
    const next = { ...merged, ...scopedParams };

    // Only produce a new reference if values actually changed — this prevents
    // downstream useEffect / MobX observer cascades from firing on every render.
    if (paramsEqual(prevRef.current, next)) {
      return prevRef.current;
    }
    prevRef.current = next;
    return next;
  }, [matches, scopedParams]);
}
