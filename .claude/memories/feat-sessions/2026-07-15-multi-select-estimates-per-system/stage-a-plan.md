# Stage A Plan Checkpoint — Multi-select estimates per system

Full plan: `SESSION_DIR/final-plan.md` (9 backend steps B1-B9, 8 frontend steps F1-F8).

## Affected files
### Backend (apps/api)
- `apps/api/plane/db/models/estimate.py` (modify — new `is_estimate_default` field + constraint)
- `apps/api/plane/db/migrations/0150_estimateproperty_is_estimate_default.py` (create)
- `apps/api/plane/db/migrations/0151_backfill_estimate_default_properties.py` (create)
- `apps/api/plane/app/views/estimate/base.py` (modify — B4 auto-create on activation, B8 resync
  on default promotion, B9 sync nulling on point delete)
- `apps/api/plane/app/views/estimate/property.py` (modify — B5 dual-write + activity call,
  select_related fix)
- `apps/api/plane/bgtasks/issue_activities_task.py` (modify — B6 new tracker function +
  mapper-dict registration, reusing the single existing `issue_activity` task)
- `apps/api/plane/app/serializers/estimate.py` (modify — B7 read-only field)
- New/extended test files: `tests/unit/models/test_estimate_model.py`,
  `tests/unit/migrations/test_0151_backfill_estimate_default_properties.py`,
  `tests/contract/app/test_estimates_app.py`, `tests/contract/app/test_estimate_property_values.py`,
  `tests/unit/bg_tasks/test_issue_activities_task.py`

### Frontend (apps/web)
- `packages/types/src/estimate.ts` (modify — F1)
- `apps/web/core/store/estimates/project-estimate.store.ts` (modify — F2 new/adjusted selectors)
- `apps/web/core/components/issues/issue-detail/sidebar.tsx` (modify — F3)
- `apps/web/core/components/issues/issue-modal/components/default-properties.tsx` (modify — F4)
- `apps/web/core/components/issues/peek-overview/properties.tsx` (modify — F5, net-new loop)
- `apps/web/core/components/issues/workspace-draft/draft-issue-properties.tsx` (modify — F6)
- `apps/web/core/components/inbox/modals/create-modal/issue-properties.tsx` (modify — F7, net-new buffer)
- `apps/web/core/components/power-k/ui/pages/context-based/work-item/estimates-menu.tsx` (modify — F8)
- `apps/web/core/components/power-k/ui/pages/context-based/work-item/commands.ts` (modify — F8)

## Patterns to copy (see final-plan.md "Pattern Sources" for full list with line numbers)
- Backend: KPI's `EstimateProperty`/`IssueEstimatePropertyValue` infra (migrations 0147-0149),
  `_activate_numeric_estimate`, `track_estimate_points`, `Estimate.destroy()`'s synchronous
  cleanup precedent.
- Frontend: sidebar.tsx's existing KPI per-property loop (206-255) is the canonical live-PUT
  reference pattern for every new per-system row across all 5 UI surfaces.

## Design decisions (confirmed with developer, Q1-Q3 answers baked in)
1. Backend reuses `EstimateProperty`/`IssueEstimatePropertyValue` (near-zero new tables).
2. `Issue.estimate_point` dual-writes for the project's default system only, preserving public
   API / filters / sort / export behavior untouched.
3. New precise per-system activity logging added (previously KPI changes logged nothing at all).
4. Create/intake flows reuse existing buffer-then-flush pattern; sidebar/peek/drafts use live PUT.
5. Bulk issue update excluded — feature doesn't exist anywhere in this CE codebase (stub UI,
   zero backend route). Filters/sort/export/analytics explicitly out of scope per developer.

## Risks (all resolved or closed — see final-plan.md's "Risks / Open items" section)
- Phase 3 review found ONE real blocker (default-system promotion → stale `Issue.estimate_point`
  across all issues) — closed via new Step B8.
- Two pattern-compliance corrections applied (B6 test path, B6 task-vs-mapper-dict design).
- Remaining open items are narrow Build-phase verifications only (draft-issue id assumption,
  commands.ts scope check, exact mapper-dict entry point, row-count check for batching).

## No test infrastructure exists in apps/web
Zero test files, no jest/vitest/playwright config anywhere in the frontend. Frontend
verification relies on `npm run build` (TS compile) + Stage H browser-driven manual QA +
mandatory visual audit (Rule 26) instead of automated frontend tests. Backend has full
pytest/Django test infra and follows normal TDD (RED→GREEN) per existing
`test_estimates_app.py`/`test_kpi.py` patterns.

Link to full plan: `SESSION_DIR/final-plan.md`
