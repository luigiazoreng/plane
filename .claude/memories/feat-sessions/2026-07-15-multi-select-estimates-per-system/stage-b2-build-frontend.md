# Stage B2 — Build Frontend

## Status: COMPLETE

## Note on generic agent instructions
This repo (Plane) is Django/Python (`apps/api`) + React Router/Vite (`apps/web`) with a
MobX store layer (`computedFn`/`observable`/`action`), not the Redux Toolkit /
Jest / `assistant-front` stack the `feature-build-frontend` agent's boilerplate
(Boot Step 4 service name, `redux-toolkit-patterns`/`javascript-typescript-jest`/
`tdd-commands`/`test-quality-standards` skills, `npm run visual-audit -- --grep` command,
`assistant-front.instructions.md`) targets. Consistent with Stage B1's equivalent note,
this stage followed `final-plan.md`'s own Steps F1-F8 and Pattern Sources instead of the
generic skill content:
- No test infra exists in `apps/web` (confirmed by Stage A research: zero `*.test.tsx`,
  no jest/vitest config, no `"test"` script, no Playwright config) — TDD RED/GREEN cycles
  were structurally not applicable to F1-F8; verification instead follows final-plan.md's
  documented "Frontend Verification" plan: TypeScript compile + full production build,
  with live browser QA explicitly deferred to Stage H (Feature - UX / gem-browser-tester).
- No `npm run visual-audit` script/DevPreview harness exists in `apps/web` (that tooling
  belongs to a different codebase, `assistant-front`) — the dev server was also not
  running locally during this stage, so the `visual-audit-protocol` skill's screenshot
  workflow was N/A here. This is a structural gap in this repo, not a skipped step; it is
  the reason final-plan.md assigns browser-driven per-surface verification to Stage H.
- Store selectors use the existing `computedFn` (mobx-utils) pattern, not Redux
  slices/thunks/selectors.

## Frontend Service Modified
- `apps/web` (React Router/Vite): per-system estimate rendering across all 6 confirmed
  UI surfaces (sidebar, create/edit modal, peek overview, workspace drafts, intake
  creation, Power-K), backed by a new store selector splitting "system-default" rows
  from "custom/KPI" rows.

## Steps Completed (F1-F8, all per final-plan.md)

| Step | Description | Files |
|------|---|---|
| F1 | `is_estimate_default: boolean` added to `IEstimateProperty` | `packages/types/src/estimate.ts` |
| F2 | New `estimateSystemPropertyIdsByProjectId` selector (system-default rows, ordered by backing estimate's `created_at` desc); `activeEstimatePropertyIdsByProjectId` now excludes `is_estimate_default` rows to avoid double-rendering | `apps/web/core/store/estimates/project-estimate.store.ts` |
| F3 | Flat `estimate_point` row replaced with per-system loop (live PUT via `updateIssueEstimatePropertyValue`), each row labeled with its own system's name | `apps/web/core/components/issues/issue-detail/sidebar.tsx` |
| F4 | Same replacement, buffered writes via `setEstimatePropertyValue` (existing `useIssueModal()` buffer, same pattern as the KPI loop) | `apps/web/core/components/issues/issue-modal/components/default-properties.tsx` |
| F5 | Net-new per-system loop (no prior KPI precedent in this file) using the sidebar.tsx live-PUT pattern; added a `getIssueEstimatePropertyValues` fetch on mount (this file had none before) | `apps/web/core/components/issues/peek-overview/properties.tsx` |
| F6 | Confirmed `handleEstimate` was already a live update via the `updateIssue` prop (Design Decision 4's assumption held) — replaced with per-system loop using `updateIssueEstimatePropertyValue` directly + a values-fetch `useEffect`; removed the now-dead `handleEstimate` | `apps/web/core/components/issues/workspace-draft/draft-issue-properties.tsx` |
| F7 | No issue id exists at creation time. Buffered state (`estimatePropertyValues`/`setEstimatePropertyValues`) was lifted into the parent `create-root.tsx` (which owns the actual submit/`createInboxIssue` call) rather than kept in `issue-properties.tsx` itself, since only the parent knows the created issue's id to flush against; `issue-properties.tsx` receives the buffer + setter as new optional props | `apps/web/core/components/inbox/modals/create-modal/issue-properties.tsx`, `apps/web/core/components/inbox/modals/create-modal/create-root.tsx` |
| F8 | `estimates-menu.tsx`: `handleSelect` signature changed to `{ propertyId, estimatePointId }`; one `Command.Group` per active system (heading = system name) replacing the single flat group; `isSelected` now reads `issueEstimatePropertyValueFor`. `commands.ts`: confirmed `workspaceSlug`/`entityDetails.project_id` were already in scope (Risk item #2 closed); `onSelect` now calls `updateIssueEstimatePropertyValue` directly instead of `handleUpdateEntity({ estimate_point })` | `apps/web/core/components/power-k/ui/pages/context-based/work-item/estimates-menu.tsx`, `apps/web/core/components/power-k/ui/pages/context-based/work-item/commands.ts` |

## Pages/Components Modified
- `apps/web/core/components/issues/issue-detail/sidebar.tsx` — work item detail sidebar
- `apps/web/core/components/issues/issue-modal/components/default-properties.tsx` — create/edit issue modal
- `apps/web/core/components/issues/peek-overview/properties.tsx` — peek overview panel
- `apps/web/core/components/issues/workspace-draft/draft-issue-properties.tsx` — workspace drafts list row
- `apps/web/core/components/inbox/modals/create-modal/issue-properties.tsx` — intake/inbox create form properties
- `apps/web/core/components/inbox/modals/create-modal/create-root.tsx` — intake/inbox create form root (submit flow, buffer owner)
- `apps/web/core/components/power-k/ui/pages/context-based/work-item/estimates-menu.tsx` — Power-K "change estimate" menu
- `apps/web/core/components/power-k/ui/pages/context-based/work-item/commands.ts` — Power-K command wiring

## API Integration Summary
- Endpoints consumed (all confirmed present and behaving as documented by Stage B1):
  - `GET /issues/:issue_id/estimate-properties/` (values) — via `getIssueEstimatePropertyValues`
  - `PUT /issues/:issue_id/estimate-properties/:property_id/` — via `updateIssueEstimatePropertyValue`
    (dual-writes `Issue.estimate_point` server-side for the default system only, per Design Decision 2 —
    no frontend-side dual-write needed)
  - `EstimateProperty.is_estimate_default` (F1/F7 of backend) — read via `estimatePropertyById`/store cache,
    consumed by the new F2 selector
- Adaptations made:
  - F5 (peek-overview) had no pre-existing `getIssueEstimatePropertyValues` fetch anywhere in its
    render tree, so one was added directly in that component (mirrors sidebar.tsx's `useEffect`).
  - F7's buffer had to live in the parent (`create-root.tsx`) rather than `issue-properties.tsx`,
    a deviation in *where* the code lives (not in behavior) from final-plan.md's literal wording
    ("component-local `useState`") — necessary because only `create-root.tsx` has access to the
    freshly created issue's id at flush time.

## Files Changed
- `packages/types/src/estimate.ts` — F1
- `apps/web/core/store/estimates/project-estimate.store.ts` — F2
- `apps/web/core/components/issues/issue-detail/sidebar.tsx` — F3
- `apps/web/core/components/issues/issue-modal/components/default-properties.tsx` — F4
- `apps/web/core/components/issues/peek-overview/properties.tsx` — F5
- `apps/web/core/components/issues/workspace-draft/draft-issue-properties.tsx` — F6
- `apps/web/core/components/inbox/modals/create-modal/issue-properties.tsx` — F7
- `apps/web/core/components/inbox/modals/create-modal/create-root.tsx` — F7 (buffer owner)
- `apps/web/core/components/power-k/ui/pages/context-based/work-item/estimates-menu.tsx` — F8
- `apps/web/core/components/power-k/ui/pages/context-based/work-item/commands.ts` — F8

## Test Results
- No unit/e2e test infra exists in `apps/web` (confirmed at Stage A and re-confirmed here) —
  N/A, not skipped.
- TypeScript compile (`turbo run check:types --filter=web`): 0 errors attributable to this
  session's files. 39 pre-existing `TS2550 toSorted`/`TS7006 implicit any` errors remain in
  unrelated files (`extended-sidebar.tsx`, `use-navigation-items.ts`, `chart/utils.ts`,
  `form-renderer.tsx`, `customize-navigation-dialog.tsx`, `tab-navigation-root.tsx`,
  `power-k/ui/renderer/command.tsx`, `members-list.tsx`, `base-issues-utils.ts`,
  `member/utils.ts`) — confirmed identical via `git stash` against unmodified
  `stable-1.3.1` (same file/line/error set before and after this session's changes).
- Lint (`turbo run check:lint --filter=web`): 0 errors, 896 warnings (all pre-existing
  style-level oxlint/eslint-plugin warnings across the whole repo, e.g.
  `no-accumulating-spread`, `always-return`, `consistent-function-scoping`,
  `no-static-element-interactions`). The handful of warnings attributable to this
  session's new code (`click-events-have-key-events`/`no-static-element-interactions` on
  the new per-system rows in `draft-issue-properties.tsx`) exactly replicate the existing
  `<div onClick={handleEventPropagation}>` wrapper pattern already used by every other
  field in that same file — not a new pattern introduced.
- Build (`turbo run build --filter=web`): exit 0.

## Visual Audit
- ⏭️ N/A — no `npm run visual-audit`/DevPreview screenshot harness exists in this repo
  (that tooling is specific to a different codebase, `assistant-front`), and the local
  dev server was not running during this stage. This gap was anticipated and explicitly
  documented in `final-plan.md`'s "Frontend Verification" section: browser-driven manual
  verification per surface (sidebar, create/edit modal, peek overview, workspace drafts,
  intake creation, Power-K) is Stage H's (Feature - UX) responsibility, against the
  already-seeded "growatt" workspace / "teste" project (2 active estimate systems:
  "teste", "Categories").

## Deviations from Plan
1. **F5 gained a `getIssueEstimatePropertyValues` fetch `useEffect`** that final-plan.md's
   Step F5 description didn't explicitly call out (it only mentioned copying the sidebar.tsx
   live-PUT dropdown pattern) — necessary because this file had zero prior estimate-property
   value fetching anywhere, unlike sidebar.tsx which already had one for its own KPI loop.
   Without it, `issueEstimatePropertyValueFor` would read stale/empty cache on first open of
   peek overview if sidebar.tsx hadn't already mounted for the same issue.
2. **F7's buffer state lives in `create-root.tsx`, not `issue-properties.tsx`** — see API
   Integration Summary above for the reasoning (only the parent has the created issue's id at
   flush time). `issue-properties.tsx` now takes `estimatePropertyValues`/
   `setEstimatePropertyValue` as new optional props instead of owning local `useState`.
3. **F6 removed the now-dead `handleEstimate` function** (was only used by the flat row this
   step replaces) — not explicitly called out in the plan step but a direct, uncontroversial
   consequence of the replacement (mirrors F3/F4/F5's flat-row removal).
4. Confirmed Risk item #1 (draft issues have a persisted id, `handleEstimate` was a live
   `updateIssue` call, not local-only state) and Risk item #2 (`workspaceSlug`/`projectId`
   already in scope in `commands.ts`) from final-plan.md's "Risks / Open items" — both held
   as assumed, no further deviation needed.
