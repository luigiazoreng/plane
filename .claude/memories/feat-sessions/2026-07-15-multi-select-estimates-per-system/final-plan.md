# Final Implementation Plan — Multi-select estimates per system

## Scope confirmed with developer (Round 1, 2026-07-15)
- **In scope UI surfaces**: work item Properties panel (sidebar.tsx), create/edit modal
  (default-properties.tsx), peek overview (peek-overview/properties.tsx), workspace drafts
  (draft-issue-properties.tsx), intake/inbox creation (inbox/modals/create-modal/issue-properties.tsx),
  Power-K command palette "change estimate" action (estimates-menu.tsx), and the activity log
  (must stay precise about which system changed).
- **Out of scope (read legacy single value only, unchanged)**: issue filters, sort, cycle/module
  analytics Sum() queries, CSV/Excel export. Documented as explicit follow-up, not a bug.
- **Public API**: `estimate_point` keeps working — represents the value of the project's
  *default* estimate system (`Project.estimate`).
- **Bulk issue update**: investigated and found NOT IMPLEMENTED anywhere in this CE (Community
  Edition) checkout — `apps/web/ce/components/issues/bulk-operations/root.tsx` is a stub
  returning `null`, and no backend route exists for `bulk-operation-issues/` (grep returned zero
  matches in `apps/api`). Building bulk-edit from scratch is far outside this feature's scope, so
  it is EXCLUDED here even though Q3 asked to include it — there is nothing to extend. Documented
  as a codebase gap, not a follow-up.

## Design Decision 1 — Backend approach: reuse EstimateProperty / IssueEstimatePropertyValue (confirmed)
The KPI refactor (migrations 0147-0149, commits `8955cad0`/`b3ec6371`) already built exactly the
infra this feature needs: `EstimateProperty` (a named, per-project row backed by one `Estimate`
system) + `IssueEstimatePropertyValue` (the selected `EstimatePoint` for one (issue, property)
pair, unique constraint on (issue, property) while not deleted). `EstimateDropdown` already has a
working "specific estimate mode" (`estimateId` prop) used today for KPI rows. Reusing this means:
- No new tables, no new frontend dropdown component, no new value-read/write hooks.
- Only new backend surface: one new boolean field + a small amount of glue code to keep this
  system-level usage of `EstimateProperty` distinct from admin-defined custom columns.

**New field**: `EstimateProperty.is_estimate_default = models.BooleanField(default=False)` —
marks "the row that represents an Estimate system's own primary value" (as opposed to
`kpi_role`-tagged rows or free-form admin-defined custom columns). One such row is
auto-maintained per (project, `Estimate`) pair for every `Estimate` with `last_used=True`.
Constraint mirrors the existing `kpi_role` uniqueness pattern exactly:
```python
models.UniqueConstraint(
    fields=["project", "estimate"],
    condition=Q(is_estimate_default=True, deleted_at__isnull=True),
    name="estimateproperty_unique_default_per_project_estimate",
)
```
`EstimateProperty`'s default manager already filters `deleted_at__isnull=True`
(`SoftDeletionManager`, `apps/api/plane/db/mixins.py:56-66`, inherited via
`AuditModel`/`BaseModel`/`ProjectBaseModel`), so `get_or_create` against it is safe without
repeating that filter.

**"Active estimate systems"** (confirmed via code, not just browser testing) = `Estimate` rows
for the project where `last_used=True` — this is exactly what
`activeEstimateIdsByProjectId` (`apps/web/core/store/estimates/project-estimate.store.ts:220-228`)
and the Power-K estimates menu already use. A project can have multiple `last_used=True`
estimates simultaneously (categories exempted from `_activate_numeric_estimate`'s
one-numeric-active-at-a-time rule, `apps/api/plane/app/views/estimate/base.py:46-67`); only ONE
of them is `Project.estimate` (the "default"/primary system).

## Design Decision 2 — Legacy `Issue.estimate_point` dual-write (confirmed per Q2)
`Issue.estimate_point` keeps representing the *default* system's value (`Project.estimate`).
In `IssueEstimatePropertyValueEndpoint.put` (`apps/api/plane/app/views/estimate/property.py:156-192`),
after saving the `IssueEstimatePropertyValue`, if `estimate_property.is_estimate_default` AND
`estimate_property.estimate_id == issue.project.estimate_id`: also set
`issue.estimate_point = estimate_point_id` (or `None`) and save, THEN call
`issue_activity.delay(type="issue.activity.updated", requested_data=json.dumps({"estimate_point": new_id}), current_instance=json.dumps({"estimate_point": old_id}), ...)`.
This is the exact same generic dispatch mechanism the main issue PATCH endpoint already uses —
it will automatically re-run the existing `track_estimate_points` tracker
(`apps/api/plane/bgtasks/issue_activities_task.py:433-476`), giving legacy activity log entries,
filters (`apps/api/plane/utils/issue_filters.py:107-118`), sort, export
(`apps/api/plane/utils/exporters/schemas/issue.py:148`), and the public API
(`apps/api/plane/space/views/issue.py:758`, `apps/api/plane/space/utils/grouper.py:88`,
`apps/api/plane/api/serializers/issue.py` exclude-based `estimate_point`) automatically for
free — zero new code needed in any of those four consumers.

**Blocker found in Phase 3 review, now closed by Step B8**: this dual-write only fires when a
value is set/cleared through the new per-system endpoint. When the project's *default* system
itself changes (`Project.estimate` gets promoted/reassigned — via `_activate_numeric_estimate`'s
promotion branch or `BulkEstimatePointEndpoint.partial_update`'s deactivation-promotion branch,
`apps/api/plane/app/views/estimate/base.py`), `Issue.estimate_point` is NOT automatically
re-synced to the newly-promoted system's per-issue values — every issue's `estimate_point` would
keep pointing at the OLD default's `EstimatePoint` until individually touched again. This
staleness pattern already exists today in a narrower form (nothing currently keeps
`Issue.estimate_point` in sync with ad-hoc default changes either), so it is not a regression
introduced by this feature, but this plan touches that exact code path and increases how often a
default-change can happen in practice (now that every system has independent values, admins are
more likely to reassign the default), so Step B8 adds an explicit bulk resync at promotion time
to close the gap rather than leaving it latent.

## Design Decision 3 — New precise per-system activity logging (confirmed per Q1)
`IssueEstimatePropertyValueEndpoint.put` currently calls NO activity logging at all — confirmed
by grep: `IssueEstimatePropertyValue`/`EstimateProperty` never appear anywhere in
`apps/api/plane/bgtasks/`. This means KPI Difficulty/Repetitive changes are silent today, and our
new "Estimates" group rows would be too unless we add logging. New dedicated bgtask function
`track_estimate_property_value_activity` (in `issue_activities_task.py`, modeled closely on
`track_estimate_points` but property-scoped) is invoked directly (not through the generic
`update_issue_activity` dispatcher, since that dispatcher only understands flat Issue-model
field diffs) from the view, for EVERY property value change (system-default rows AND
custom/KPI rows alike — currently custom/KPI silently log nothing; fixing that is an accepted
side effect since Q1 said the log should be precise about "which system changed"). Fields:
`field=f"estimate_property_{property_id}"` (so multiple systems of the same `EstimateType` don't
collide), `old_value`/`new_value` = `EstimatePoint.value` strings, `comment=f"updated the {property.name} estimate to "`.
This runs in ADDITION to Decision 2's dual-write activity for the default system (so a change to
the default system produces two log lines: the legacy `estimate_<type>` one for back-compat
consumers, and the new precise `estimate_property_<id>` one) — both call sites share the same
`old_estimate_point_id`/`new_estimate_point_id`, so no duplicate DB reads are needed.

## Design Decision 4 — Draft/pre-creation flows reuse the existing buffer-then-flush pattern
`default-properties.tsx` (issue create/edit modal) already solves "no issue id yet" for KPI rows
by buffering into `useIssueModal()`'s local `estimatePropertyValues` map and flushing via
`updateIssueEstimatePropertyValue` per buffered pair after the issue is created
(`apps/web/ce/components/issues/issue-modal/provider.tsx:35-55`). Intake/inbox creation
(`inbox/modals/create-modal/issue-properties.tsx`) needs the identical pattern added net-new
(currently only has `data.estimate_point` local state, no property buffering). Workspace drafts
(`draft-issue-properties.tsx`) is different: draft issues are real `Issue` rows
(`is_draft=True`) with a persisted id before any property is touched (confirmed by
`draft-issue-properties.tsx` already calling a live update via `issue.estimate_point` +
`handleEstimate`, not a local-only draft buffer) — Build phase re-verifies `handleEstimate`'s
exact implementation before wiring, but the working assumption is it can use the LIVE-PUT
pattern (call `updateIssueEstimatePropertyValue` directly, like sidebar.tsx), not the buffer
pattern.

## Non-Goals (explicit, documented per developer's Q1 answer)
- `apps/api/plane/utils/issue_filters.py:107-118` (`filter_estimate_point`) — untouched, filters
  only the legacy FK.
- Sort (frontend `base-issues.store.ts`) — untouched.
- `apps/api/plane/utils/exporters/schemas/issue.py:148` — untouched, exports only the legacy FK's value.
- Cycle/module numeric analytics Sum() queries — untouched.
- Bulk issue update — excluded (feature doesn't exist in this CE checkout, see Scope section).

---

## Pattern Sources
- Property/value model: `apps/api/plane/db/models/estimate.py` (EstimateProperty lines 89-125,
  IssueEstimatePropertyValue lines 127-149)
- Property/value views: `apps/api/plane/app/views/estimate/property.py` (whole file, 193 lines)
- Property/value serializers: `apps/api/plane/app/serializers/estimate.py` (EstimatePropertySerializer
  lines 75-82, IssueEstimatePropertyValueSerializer lines 85-99)
- Estimate activation logic: `apps/api/plane/app/views/estimate/base.py`
  (`_activate_numeric_estimate` lines 46-67, `BulkEstimatePointEndpoint.create` lines 88-174,
  `.partial_update` lines 182-256, `.destroy` lines 258-289)
- Activity tracker pattern: `apps/api/plane/bgtasks/issue_activities_task.py`
  (`track_estimate_points` lines 433-476, generic `issue_activity` task entry lines 1505-1545+,
  single-field-outside-PATCH call convention: `apps/api/plane/app/views/issue/comment.py:85` /
  `attachment.py:48`)
- Data migration pattern: `apps/api/plane/db/migrations/0148_migrate_kpi_difficulty_repetitive_to_estimate_property.py`
  (whole file — copy the `apps.get_model` + explicit workspace-derivation approach exactly)
- Backend test pattern: `apps/api/plane/tests/contract/app/test_estimates_app.py` (pytest,
  `@pytest.mark.contract` + `@pytest.mark.django_db`, `session_client`/`workspace`/`create_user`
  fixtures) and `apps/api/plane/tests/contract/app/test_kpi.py`
  (`IssueEstimatePropertyValueEndpoint`-adjacent flows)
- Frontend per-property row pattern (KPI loop, the reference for every new "Estimates" group):
  `apps/web/core/components/issues/issue-detail/sidebar.tsx:227-255`
- Frontend flat-row pattern being REPLACED: `sidebar.tsx:206-225`,
  `apps/web/core/components/issues/issue-modal/components/default-properties.tsx:264-284`,
  `apps/web/core/components/issues/peek-overview/properties.tsx:192-205`,
  `apps/web/core/components/issues/workspace-draft/draft-issue-properties.tsx:260-272`,
  `apps/web/core/components/inbox/modals/create-modal/issue-properties.tsx:160-172`
- Store selectors: `apps/web/core/store/estimates/project-estimate.store.ts`
  (`activeEstimatePropertyIdsByProjectId` lines 286-295, `issueEstimatePropertyValueFor` lines
  302-305, `updateIssueEstimatePropertyValue` lines 575-591, `activeEstimateIdsByProjectId` lines
  220-228, `upsertKpiRoleEstimateProperty` lines 541-561 as the closest precedent for an
  upsert-by-estimate action)
- Draft-flush pattern: `apps/web/ce/components/issues/issue-modal/provider.tsx:35-55`
- Power-K estimate menu being reworked: `apps/web/core/components/power-k/ui/pages/context-based/work-item/estimates-menu.tsx`
  (whole file, 76 lines), wiring: `commands.ts:274-293` (`onSelect` at line 282-288),
  `root.tsx:66-69`, `modal/wrapper.tsx:54-65` (`handlePageDataSelection` — generic `unknown` payload,
  no changes needed there, only in `commands.ts`'s `onSelect`)
- Migration numbering: latest is `0149_remove_kpi_difficulty_repetitive_fields.py` → next is `0150`

---

## Implementation Steps

### Backend

#### Step B1 — Add `is_estimate_default` field + constraint
- File: `apps/api/plane/db/models/estimate.py`
- Action: modify
- What: add `is_estimate_default = models.BooleanField(default=False)` to `EstimateProperty`
  (after `kpi_role`); add the `UniqueConstraint` shown in Design Decision 1 to `Meta.constraints`
  alongside the existing `kpi_role` one.
- Copy from: existing `kpi_role` field + its `estimateproperty_unique_kpi_role_per_project`
  constraint (same file, lines 102, 109-115) — identical shape.
- Test file: `apps/api/plane/tests/unit/models/test_estimate_model.py`
- Test cases:
  1. Two `EstimateProperty` rows with `is_estimate_default=True` on the same (project, estimate)
     raise `IntegrityError` (constraint violation).
  2. Two `EstimateProperty` rows with `is_estimate_default=True` on the SAME project but
     DIFFERENT estimates are both allowed (one default row per system, not one per project).
  3. `is_estimate_default=False` (default) rows are unconstrained (can have many per
     project+estimate, matching today's free-form custom-column behavior).
- [ ] RED run: `pytest apps/api/plane/tests/unit/models/test_estimate_model.py -k is_estimate_default -v` → FAIL evidence: ___
- [ ] GREEN run: same command → PASS evidence: ___
- [ ] Anti-Laziness check: each test asserts on `IntegrityError`/successful `.save()`, not just `assertTrue(True)`.

#### Step B2 — Migration: schema
- File: `apps/api/plane/db/migrations/0150_estimateproperty_is_estimate_default.py`
- Action: create
- What: `AddField` for `is_estimate_default` (default=False) + `AddConstraint` for the new
  unique constraint. Depends on `0149_remove_kpi_difficulty_repetitive_fields`.
- Copy from: `apps/api/plane/db/migrations/0147_estimate_property.py` (constraint syntax, lines
  164-171)
- Test file: none (schema-only migration; covered indirectly by B1's model tests + `python manage.py makemigrations --check --dry-run` in CI)
- [ ] Verification: `python manage.py makemigrations db --check --dry-run` exits 0 (no missing migrations) after B1+B2.

#### Step B3 — Data migration: backfill default properties + migrate existing values
- File: `apps/api/plane/db/migrations/0151_backfill_estimate_default_properties.py`
- Action: create
- What: `RunPython` function that:
  1. For every `Estimate` with `last_used=True` (all projects): `get_or_create` an
     `EstimateProperty(project=estimate.project, estimate=estimate, is_estimate_default=True,
     defaults={"name": estimate.name, "workspace_id": estimate.workspace_id, "kpi_role": None})`.
  2. For every `Issue` with `estimate_point_id` set: resolve `point = EstimatePoint.objects.get(pk=issue.estimate_point_id)`,
     `estimate = point.estimate`; `get_or_create` the matching default `EstimateProperty` for
     `(issue.project, estimate)` the same way as step 1 (covers issues whose estimate_point
     belongs to an estimate that is NOT `last_used=True` — stale/historical data, still must not
     lose the value); then `get_or_create` an `IssueEstimatePropertyValue(issue=issue,
     property=default_property, defaults={"estimate_point": point, "project_id":
     issue.project_id, "workspace_id": issue.workspace_id})`.
  Historical models via `apps.get_model` — workspace set explicitly (no `ProjectBaseModel.save()`
  auto-derivation available), exactly like 0148.
- Copy from: `apps/api/plane/db/migrations/0148_migrate_kpi_difficulty_repetitive_to_estimate_property.py`
  (whole file — same `apps.get_model` + explicit `workspace_id`/`project_id` pattern,
  `migrations.RunPython.noop` as the reverse)
- Test file: `apps/api/plane/tests/unit/migrations/test_0151_backfill_estimate_default_properties.py`
  (new file — **confirmed by Phase 3 review: `django_test_migrations` is NOT a dependency in
  this repo**, so go straight to the fallback — call the migration module's `RunPython` function
  directly, e.g. `from plane.db.migrations import <module>` via `importlib` given the numeric
  filename, or copy `0148`'s function body's calling convention, against factory-created
  historical-shaped `Estimate`/`Issue`/`EstimateProperty` objects created through the normal
  ORM in a `@pytest.mark.django_db` test — no migration-runner fixture needed. This establishes
  the migration-test pattern for `apps/api/plane/tests/unit/migrations/` since none exists yet.)
- Test cases:
  1. Existing `Issue.estimate_point` pointing at a `last_used=True` estimate → after migration,
     `IssueEstimatePropertyValue` exists for that issue + the auto-created default property, with
     the same `estimate_point`.
  2. Existing `Issue.estimate_point` pointing at an estimate that is NOT `last_used=True` (stale
     data) → default property still gets created for that estimate, value still migrated (no data
     loss).
  3. `Estimate` with `last_used=True` but zero issues referencing it → default property still
     gets created (so the UI has a row to render even before any value is set).
  4. Running the migration twice (idempotency check, relevant since Build/Review may re-run
     migrations in CI) → `get_or_create` means no duplicate rows / no `IntegrityError`.
- [ ] RED run: `pytest apps/api/plane/tests/unit/migrations/test_0151_backfill_estimate_default_properties.py -v` → FAIL evidence: ___
- [ ] GREEN run: same command → PASS evidence: ___
- [ ] Anti-Laziness check: each test creates real historical-shaped rows and asserts on actual `IssueEstimatePropertyValue`/`EstimateProperty` DB state, not mocks.

#### Step B4 — Auto-create default property when an Estimate becomes active
- File: `apps/api/plane/app/views/estimate/base.py`
- Action: modify
- What: add a module-level helper `_ensure_estimate_default_property(estimate)` (near
  `_activate_numeric_estimate`, same file) that does the `get_or_create` from B3 step 1. Call it:
  - In `BulkEstimatePointEndpoint.create`, right after the block that sets
    `estimate.last_used = True` (existing lines ~163-171, when `project.estimate_id is None`) —
    call unconditionally after `estimate.save()` if `estimate.last_used`.
  - In `BulkEstimatePointEndpoint.partial_update`, right after `_activate_numeric_estimate(project, estimate)`
    (existing line ~224-225) — call if `estimate.last_used` is now `True` (covers the "activate
    a secondary estimate system" path where `Project.estimate` is untouched, per the research:
    "this is exactly the multiple `last_used=True` Estimates... scenario your plan depends on").
- Copy from: `_activate_numeric_estimate` (same file, lines 46-67) for helper-function shape and
  docstring style.
- Test file: `apps/api/plane/tests/contract/app/test_estimates_app.py`
- Test cases:
  1. Creating a brand-new estimate system (first one for the project, `last_used` forced True) →
     a default `EstimateProperty` with `is_estimate_default=True` exists for it afterward.
  2. PATCH-activating a SECOND estimate system (`last_used: true`) while a different one remains
     the project default → default `EstimateProperty` created for the newly-activated one too
     (not just the project's `Project.estimate`).
  3. PATCH-deactivating an estimate (`last_used: false`) → its default `EstimateProperty` row is
     left in place (not deleted) — deactivating doesn't destroy historical values, only hides the
     row from the "active systems" UI list going forward. Assert no deletion happens.
  4. Calling create/activate twice for the same estimate → no duplicate default property
     (`get_or_create` idempotency, mirrors B3 case 4).
- [ ] RED run: `pytest apps/api/plane/tests/contract/app/test_estimates_app.py -k default_property -v` → FAIL evidence: ___
- [ ] GREEN run: same command → PASS evidence: ___
- [ ] Anti-Laziness check: assert on actual `EstimateProperty.objects.filter(...)` state, not just response status codes.

#### Step B5 — Dual-write + new activity logging in `IssueEstimatePropertyValueEndpoint.put`
- File: `apps/api/plane/app/views/estimate/property.py`
- Action: modify
- What: change the existing `Issue.objects.filter(pk=issue_id, project_id=project_id,
  workspace__slug=slug).first()` lookup (line ~167) to `.select_related("project")` (Phase 3
  review found the naive `issue.project.estimate_id` access as written would trigger an N+1
  query — one extra `Project` fetch per PUT call; `select_related` collapses it into the
  existing query, following the same pattern already used elsewhere in this file, e.g.
  `EstimatePropertyListCreateEndpoint.get_queryset`'s `.select_related("estimate")`).
  Then, after the existing save logic (both the "clear" branch, lines 179-184, and the "set"
  branch, lines 186-192):
  1. Capture `old_estimate_point_id` (the value's estimate_point BEFORE this save — read it
     before calling `.save()`/`serializer.save()`).
  2. Always call `issue_activity.delay(type="estimate_property_value.activity.updated", ...)`
     (Step B6 — new `type` key added to the existing single `issue_activity` task's
     `ACTIVITY_MAPPER`, NOT a separate new Celery task) passing whatever payload shape B6's
     `track_estimate_property_value_activity` plain function expects (property_id,
     old/new estimate_point id, issue_id, actor_id, project_id, workspace_id, epoch) — same
     calling convention as `comment.py:85-95`.
  3. If `estimate_property.is_estimate_default and estimate_property.estimate_id == issue.project.estimate_id`:
     also set `issue.estimate_point_id = estimate_point_id_or_None`, `issue.save(update_fields=["estimate_point", "updated_at"])`,
     then call `issue_activity.delay(type="issue.activity.updated",
     requested_data=json.dumps({"estimate_point": estimate_point_id_or_None}),
     current_instance=json.dumps({"estimate_point": old_estimate_point_id}), issue_id=str(issue_id),
     actor_id=str(request.user.id), project_id=str(project_id), epoch=int(timezone.now().timestamp()))`
     (Design Decision 2 — reuses the existing `track_estimate_points` tracker for free).
- Copy from: `apps/api/plane/app/views/issue/comment.py:85` (or `attachment.py:48`) for the exact
  `issue_activity.delay(...)` call-site convention (imports, `json.dumps` usage, epoch computation);
  `EstimatePropertyListCreateEndpoint.get_queryset` (same file, line ~33) for the `select_related`
  convention.
- Test file: `apps/api/plane/tests/contract/app/test_kpi.py` (extend) +
  new `apps/api/plane/tests/contract/app/test_estimate_property_values.py` if `test_kpi.py`'s
  existing file doesn't already cover generic (non-KPI) property value PUT — Build phase checks
  first.
- Test cases:
  1. Setting a value on a NON-default (custom/KPI) property does NOT touch `Issue.estimate_point`.
  2. Setting a value on the DEFAULT property for the project's default estimate DOES update
     `Issue.estimate_point` to match.
  3. Setting a value on a DEFAULT property for a NON-default (secondary, `last_used=True` but
     not `Project.estimate`) system does NOT touch `Issue.estimate_point`.
  4. Clearing a value (`estimate_point: null`) on the default property clears `Issue.estimate_point`
     too.
  5. Any property value change (default or custom) creates exactly one new `IssueActivity` row
     with `field=f"estimate_property_{property_id}"`.
  6. A default-property change on the project's default estimate creates a SECOND `IssueActivity`
     row with `field` starting with `"estimate_"` (the legacy tracker's format) — i.e., two rows
     total for that one API call.
  7. A default-property change on a NON-default system creates exactly ONE `IssueActivity` row
     (no legacy dual-write row).
- [ ] RED run: `pytest apps/api/plane/tests/contract/app/test_estimate_property_values.py -v` → FAIL evidence: ___
- [ ] GREEN run: same command → PASS evidence: ___
- [ ] Anti-Laziness check: tests query `IssueActivity.objects.filter(issue_id=...)` and assert on
  `field`/`old_value`/`new_value`, not just HTTP status.

#### Step B6 — New activity tracker function (CORRECTED per Phase 3 pattern-compliance review)
- File: `apps/api/plane/bgtasks/issue_activities_task.py`
- Action: modify
- What: **confirmed by Phase 3 review — `track_estimate_points` is a plain function, NOT a
  Celery task; there is exactly ONE `@shared_task`-decorated entry point in this file
  (`issue_activity`, line ~1505), which dispatches to plain tracker functions via the
  `ACTIVITY_MAPPER`/`ISSUE_ACTIVITY_MAPPER` dicts.** Do NOT create a new independent
  `@shared_task`. Instead, follow the exact existing pattern used for out-of-band activity
  (comment/attachment endpoints, `comment.py:85-95`):
  1. Add a new plain function `track_estimate_property_value_activity(requested_data,
     current_instance, issue_id, project_id, workspace_id, actor_id, issue_activities, epoch)`
     matching the standard tracker signature (same as `track_estimate_points`, line 433-442).
     Resolves `EstimateProperty` (for `.name`, via `requested_data["property_id"]`) and both
     `EstimatePoint` rows (for `.value`), builds one `IssueActivity` exactly like
     `track_estimate_points` (verb, old/new identifier+value, `field=f"estimate_property_{property_id}"`,
     comment) per Design Decision 3, appends it to `issue_activities`.
  2. Register a new dispatch key in the mapper dict used by the top-level `issue_activity` task
     (near line 1541, alongside `"comment.activity.created": create_comment_activity` etc.):
     `"estimate_property_value.activity.updated": track_estimate_property_value_activity` (or
     nest it correctly if this needs to go in the narrower `ISSUE_ACTIVITY_MAPPER` sub-dict used
     inside `update_issue_activity` instead — Build phase reads lines 1500-1620 in full, in
     particular the exact call signature `comment.py:85-95` uses for a `type=` value that isn't
     `"issue.activity.updated"`, to determine which of the two dicts is the right one; the
     PLAN's intent is unambiguous — reuse the single existing `issue_activity` task's dispatch
     machinery, not a new task).
  3. Step B5's endpoint calls `issue_activity.delay(type="estimate_property_value.activity.updated",
     requested_data=json.dumps({"property_id": str(property_id), "estimate_point": new_id}),
     current_instance=json.dumps({"estimate_point": old_id}), issue_id=str(issue_id),
     actor_id=str(request.user.id), project_id=str(project_id), epoch=...)`.
- Copy from: `track_estimate_points` (same file, lines 433-476) for the tracker function shape;
  `comment.py:85-95` for the exact `issue_activity.delay(type=<non-"issue.activity.updated">, ...)`
  calling convention used by an endpoint outside the main issue-PATCH flow; the `ACTIVITY_MAPPER`/
  `ISSUE_ACTIVITY_MAPPER` dict definitions themselves (lines ~1541 onward) for where to register
  the new key.
- Test file: covered by B5's tests (integration-level, via the view) — add one focused unit test
  in `apps/api/plane/tests/unit/bg_tasks/test_issue_activities_task.py` (note: `bg_tasks` with an
  underscore — Phase 3 review confirmed this is the real directory name, not `bgtasks`; create
  the file if it doesn't already exist) calling `track_estimate_property_value_activity` directly.
- Test cases: (unit-level, narrower than B5's integration cases)
  1. Old and new both set, different values → verb="updated", correct old_value/new_value.
  2. New is None (clearing) → verb="removed".
  3. Field name is `estimate_property_<property_id>`, not a fixed string (so two different
     systems never collide).
- [ ] RED run: `pytest apps/api/plane/tests/unit/bg_tasks/test_issue_activities_task.py -k estimate_property_value -v` → FAIL evidence: ___
- [ ] GREEN run: same command → PASS evidence: ___
- [ ] Anti-Laziness check: assert exact `field`/`verb`/`old_value`/`new_value`, not `assertIsNotNone`.

#### Step B7 — Expose `is_estimate_default` read-only on the serializer
- File: `apps/api/plane/app/serializers/estimate.py`
- Action: modify
- What: `EstimatePropertySerializer.Meta.read_only_fields` gets `is_estimate_default` added
  alongside `kpi_role` (system-managed, not settable via the general create/update endpoint —
  same rationale as the existing comment on `kpi_role`).
- Copy from: existing `kpi_role` handling, same file lines 79-82.
- Test file: `apps/api/plane/tests/contract/app/test_estimates_app.py`
- Test cases:
  1. `PATCH /estimate-properties/<id>/` with `is_estimate_default: true` in the body is silently
     ignored (field stays whatever it was), matching existing `kpi_role` read-only behavior.
  2. `GET`/`POST` responses include `is_estimate_default` in the payload.
- [ ] RED run: `pytest apps/api/plane/tests/contract/app/test_estimates_app.py -k is_estimate_default -v` → FAIL evidence: ___
- [ ] GREEN run: same command → PASS evidence: ___
- [ ] Anti-Laziness check: assert the field value in the DB is unchanged after the PATCH attempt, not just response shape.

#### Step B8 — Bulk-resync `Issue.estimate_point` when the project's default system is promoted (NEW — closes Phase 3 review blocker)
- File: `apps/api/plane/app/views/estimate/base.py`
- Action: modify
- What: **blocker found in Phase 3 migration/edge-case review**: Design Decision 2's dual-write
  keeps `Issue.estimate_point` in sync only at the moment a value is set through the new
  per-system endpoint — it does NOT resync automatically when `Project.estimate` itself is
  reassigned to a different already-`last_used=True` system (via `_activate_numeric_estimate`'s
  promotion branch, lines ~63-67, or `BulkEstimatePointEndpoint.partial_update`'s
  deactivation-promotion branch, lines ~211-222). Every issue's `estimate_point` would keep
  pointing at the OLD default's value until individually touched again. This staleness pattern
  pre-dates this feature in a narrower form, but this plan touches these exact code paths and
  increases how often a default-change happens in practice, so close it explicitly: in both
  promotion branches, after `project.estimate = <new_default_estimate>` is set, bulk-resync every
  issue in the project from `IssueEstimatePropertyValue` — for the new default's
  `is_estimate_default=True` property, run
  `Issue.objects.filter(project_id=project.id, estimate_property_values__property=new_default_property).update(...)`
  is not directly expressible as a single `.update()` since the new value differs per issue, so
  iterate: `for value in IssueEstimatePropertyValue.objects.filter(property=new_default_property, deleted_at__isnull=True).select_related("issue"): value.issue.estimate_point_id = value.estimate_point_id; value.issue.save(update_fields=["estimate_point", "updated_at"])`
  (batch via `.iterator(chunk_size=500)` per the security review's note on B3's table-scan
  concern — same pattern applies here). Issues with NO value yet for the new default property
  get `estimate_point` cleared to `None` (they had no value under the new system either) —
  `Issue.objects.filter(project_id=project.id).exclude(estimate_property_values__property=new_default_property).update(estimate_point=None)`.
  No new activity-log spam for this bulk resync (it's a system-level consistency fix, not a
  user-initiated per-issue change) — mirrors how `Estimate.destroy()` already does silent bulk
  nulling for its own cleanup (see Step B9's "copy from").
- Copy from: `_activate_numeric_estimate` (same file, lines 46-67) for the promotion-branch
  insertion point; `Estimate.destroy()` (same file, lines ~258-289) for the precedent of doing
  synchronous bulk `Issue`/`IssueEstimatePropertyValue` cleanup directly in a view method.
- Test file: `apps/api/plane/tests/contract/app/test_estimates_app.py`
- Test cases:
  1. Project has two `last_used=True` systems (A=default, B=secondary), some issues have values
     under both. PATCH-deactivate A (promoting B to default) → every issue's `estimate_point` now
     matches its `IssueEstimatePropertyValue` for B's default property, not A's stale value.
  2. An issue has a value under A but NONE under B → after promotion, that issue's
     `estimate_point` becomes `None` (not left stale at A's old value).
  3. Numeric-estimate conflict promotion path (`_activate_numeric_estimate`) triggers the same
     resync, not just the explicit deactivation path.
- [ ] RED run: `pytest apps/api/plane/tests/contract/app/test_estimates_app.py -k resync -v` → FAIL evidence: ___
- [ ] GREEN run: same command → PASS evidence: ___
- [ ] Anti-Laziness check: assert actual `Issue.estimate_point_id` DB state post-promotion for multiple issues, not just that the endpoint returns 200.

#### Step B9 — Synchronous nulling on `EstimatePointEndpoint.destroy()`'s no-replacement branch (pre-existing gap, surfaced by this plan's increased surface area)
- File: `apps/api/plane/app/views/estimate/base.py`
- Action: modify
- What: Phase 3 review found `EstimatePointEndpoint.destroy()`'s "no replacement point supplied"
  branch does NOT synchronously null `Issue.estimate_point` /
  `IssueEstimatePropertyValue.estimate_point` for the deleted point — it relies only on the
  async `on_delete=SET_NULL` cascade. This is pre-existing (not introduced by this plan), but
  `Estimate.destroy()` (same file) already handles the equivalent case SYNCHRONOUSLY as a
  deliberate design choice, so mirror that pattern here for consistency now that this file is
  already being modified for B4/B8, rather than leaving an inconsistency between the two
  `destroy()` methods. What exactly to null and how: match `Estimate.destroy()`'s existing code
  exactly (same file, ~lines 274-279), scoped to the single `EstimatePoint` being deleted instead
  of every point under an `Estimate`.
- Copy from: `Estimate.destroy()` (same file, lines ~274-279) — same synchronous nulling shape,
  narrower scope (one point, not a whole estimate's points).
- Test file: `apps/api/plane/tests/contract/app/test_estimates_app.py`
- Test cases:
  1. Deleting an `EstimatePoint` with no replacement, referenced by `Issue.estimate_point` →
     immediately (synchronously, same request) `None` after the DELETE call returns, not
     eventually-consistent via async cascade.
  2. Same for `IssueEstimatePropertyValue.estimate_point` referencing the deleted point.
- [ ] RED run: `pytest apps/api/plane/tests/contract/app/test_estimates_app.py -k destroy_no_replacement -v` → FAIL evidence: ___
- [ ] GREEN run: same command → PASS evidence: ___
- [ ] Anti-Laziness check: assert DB state immediately post-request (no `time.sleep`/celery-eager workaround needed if nulling is truly synchronous).

---

### Frontend

#### Step F1 — Type: add `is_estimate_default`
- File: `packages/types/src/estimate.ts`
- Action: modify
- What: add `is_estimate_default: boolean` to `IEstimateProperty` (line ~97-108, alongside
  `kpi_role`).
- Copy from: existing `kpi_role` field placement in the same interface.
- Test file: n/a (type-only change; covered by TS compile in `npm run build`).

#### Step F2 — Store: split "system default" rows from "custom/KPI" rows
- File: `apps/web/core/store/estimates/project-estimate.store.ts`
- Action: modify
- What:
  1. Add new selector `estimateSystemPropertyIdsByProjectId(projectId)` — same shape as
     `activeEstimatePropertyIdsByProjectId` (lines 286-295) but filtered to
     `p.is_estimate_default && p.is_active`, ordered to match `activeEstimateIdsByProjectId`'s
     estimate ordering (by the estimate's `created_at` desc, so system rows appear in a stable,
     predictable order in the new "Estimates" group) — resolve via `getEstimateById(p.estimate)?.created_at`.
  2. Change `activeEstimatePropertyIdsByProjectId` (lines 286-295) to ALSO exclude
     `is_estimate_default` rows (`&& !p.is_estimate_default`), so the existing KPI/custom loop at
     every call site does not double-render system rows once F3-F7 add the new "Estimates" group
     next to it.
- Copy from: `activeEstimatePropertyIdsByProjectId` (same file, lines 286-295) as the structural
  template for the new selector.
- Test file: none (no test infra exists in `apps/web` — see Frontend Verification section below;
  this MobX selector logic gets exercised indirectly via the browser-driven UX pass in Stage H).

#### Step F3 — sidebar.tsx: replace flat row with per-system loop
- File: `apps/web/core/components/issues/issue-detail/sidebar.tsx`
- Action: modify
- What: replace the flat row block (lines 206-225) with a loop over
  `estimateSystemPropertyIdsByProjectId(projectId)` rendering one `SidebarPropertyListItem` per
  system, each wrapping an `EstimateDropdown` in specific-estimate mode (`estimateId={property.estimate}`,
  `value={issueEstimatePropertyValueFor(issueId, propertyId)?.estimate_point}`,
  `onChange={(val) => updateIssueEstimatePropertyValue(workspaceSlug, projectId, issueId, propertyId, val ?? null)}`),
  `label={estimateByEstimatePointId-derived estimate.name}` (the system's own name, so each row
  is labeled e.g. "teste" / "Categories" instead of a shared "Estimate" label). **Confirmed by
  Phase 3 pattern-compliance review: no reusable "grouped section with heading" primitive exists
  anywhere in the sidebar/property-list-item family** — so per-row system-name labels with NO
  visual group container is the PRIMARY design here (not a fallback), matching exactly how the
  existing KPI loop (227-255) already renders its rows ungrouped today. Do not build a new
  group-heading wrapper component for this.
- Copy from: `sidebar.tsx:227-255` (the existing KPI loop) — same `SidebarPropertyListItem` +
  `EstimateDropdown` shape, same handlers.
- Test file: none (no frontend test infra — see Frontend Verification section).

#### Step F4 — default-properties.tsx (create/edit modal): same replacement, buffered writes
- File: `apps/web/core/components/issues/issue-modal/components/default-properties.tsx`
- Action: modify
- What: replace flat row (264-284) with the same per-system loop pattern as F3, but writing via
  `setEstimatePropertyValue(propertyId, estimatePoint ?? null)` (buffered) instead of a live PUT,
  exactly like the existing KPI loop at 285-312 already does.
- Copy from: `default-properties.tsx:285-312` (existing KPI loop, buffered-write variant).
- Test file: none.

#### Step F5 — peek-overview/properties.tsx: add per-system loop (net-new, no KPI precedent here)
- File: `apps/web/core/components/issues/peek-overview/properties.tsx`
- Action: modify
- What: replace flat row (192-205) with the per-system loop. This file has NO existing KPI loop
  to copy from (confirmed gap) — build phase copies the sidebar.tsx (F3) live-PUT pattern instead,
  first confirming `workspaceSlug`/`projectId`/`issueId` are already in scope in this component
  (likely yes, since it already renders `issue.estimate_point`).
- Copy from: `sidebar.tsx:227-255` (closest live-PUT precedent, since this file has none of its own).
- Test file: none.

#### Step F6 — draft-issue-properties.tsx: replace flat row
- File: `apps/web/core/components/issues/workspace-draft/draft-issue-properties.tsx`
- Action: modify
- What: replace flat row (260-272) with per-system loop using the LIVE-PUT pattern (Design
  Decision 4 — draft issues have a persisted id already). Build phase first re-verifies
  `handleEstimate`'s implementation confirms a live update call (not local-only state) before
  wiring the loop the same way.
- Copy from: `sidebar.tsx:227-255`.
- Test file: none.

#### Step F7 — inbox/modals/create-modal/issue-properties.tsx: replace flat row, buffered writes
- File: `apps/web/core/components/inbox/modals/create-modal/issue-properties.tsx`
- Action: modify
- What: replace flat row (160-172) with per-system loop. No issue id exists yet at this point
  (pure creation form), so introduce local buffered state
  `estimatePropertyValues: Record<string, string | null>` (component-local `useState`, since this
  modal doesn't have access to `useIssueModal()`'s buffer) alongside the existing `data`/`handleData`
  state, and on submit, after the intake issue is created and its id is known, flush each buffered
  `[propertyId, value]` pair via `updateIssueEstimatePropertyValue` — mirroring
  `issue-modal/provider.tsx:35-55`'s flush loop but component-local instead of context-based.
- Copy from: `issue-modal/provider.tsx:35-55` (flush-after-create pattern) +
  `default-properties.tsx:285-312` (buffered dropdown rendering).
- Test file: none.

#### Step F8 — Power-K "change estimate": group by system
- Files:
  - `apps/web/core/components/power-k/ui/pages/context-based/work-item/estimates-menu.tsx`
  - `apps/web/core/components/power-k/ui/pages/context-based/work-item/commands.ts` (lines 274-293)
- Action: modify
- What:
  1. `estimates-menu.tsx`: change `Props.handleSelect` signature from
     `(estimatePointId: string | null) => void` to
     `(selection: { propertyId: string; estimatePointId: string | null }) => void`. Instead of one
     flat `Command.Group` built from `activeEstimateIdsByProjectId` + `estimate.estimatePointIds`,
     render one `Command.Group` PER active estimate system (heading = system name via
     `estimate.name`), resolving each system's backing default `EstimateProperty` id via the new
     `estimateSystemPropertyIdsByProjectId`/`estimatePropertyById` (F2) to pass as `propertyId`.
     Selection state (`isSelected`) now compares against
     `issueEstimatePropertyValueFor(workItemDetails.id, propertyId)?.estimate_point` instead of
     `workItemDetails.estimate_point`.
  2. `commands.ts` `onSelect` (line 282-288): destructure the new object shape; call
     `updateIssueEstimatePropertyValue(workspaceSlug, projectId, workItemDetails.id, propertyId, estimatePointId)`
     instead of `handleUpdateEntity({ estimate_point: estimatePointId })`. Needs
     `workspaceSlug`/`projectId` already in scope in this file (Build phase confirms — likely
     yes, given `entityDetails` is already resolved here per `root.tsx`'s reads).
- Copy from: `sidebar.tsx:236-241` (the `onChange` call shape for `updateIssueEstimatePropertyValue`)
  as the target write pattern; existing `estimates-menu.tsx` (whole file) as the structural
  starting point for the Command.Group-per-system grouping (labels already partially do this via
  `estimate.name` prefix at line 60, just needs a real `<Command.Group heading={estimate.name}>`
  wrapper instead of a flat list with inline name prefixes).
- Test file: none.

---

## Frontend Verification (no unit/e2e test infra exists in this repo)
Confirmed via research: `apps/web` has **zero** `*.test.tsx`/`*.spec.tsx` files, no
jest/vitest config, no `"test"` script in `package.json`, and no Playwright config anywhere in
the monorepo (only this agent's own `.claude/skills/playwright-testing` docs, not an actual
test setup). Standing up a new test framework from scratch is out of scope for this feature.
Frontend correctness for F1-F8 is verified instead via:
1. `npm run build` (TypeScript compile catches type errors from F1/F2 changes propagating).
2. Stage H (Feature - UX) browser-driven manual verification via `gem-browser-tester` against
   the real dev environment, covering: sidebar, create/edit modal, peek overview, workspace
   drafts, intake creation, and Power-K — one scenario per surface, using the already-seeded
   "growatt" workspace / "teste" project (2 active estimate systems: "teste", "Categories") from
   Phase 1's manual verification.
3. Visual audit protocol (Rule 26) mandatory for every `.tsx` file touched (F3-F8) — desktop +
   mobile screenshots per the `visual-audit-protocol` skill.

## Backend Test Command Summary (Build phase runs these after each step, per Rule 5)
```
cd apps/api && python manage.py makemigrations db --check --dry-run   # after B1+B2
cd apps/api && pytest plane/tests/unit/models/test_estimate_model.py -v
cd apps/api && pytest plane/tests/unit/migrations/test_0151_backfill_estimate_default_properties.py -v
cd apps/api && pytest plane/tests/contract/app/test_estimates_app.py -v
cd apps/api && pytest plane/tests/contract/app/test_estimate_property_values.py -v
cd apps/api && pytest plane/tests/unit/bg_tasks/test_issue_activities_task.py -v
cd apps/api && pytest plane/tests/contract/app/test_estimates_app.py -k "resync or destroy_no_replacement" -v
```
Migrations are Postgres-only for this repo (`apps/api/plane/settings/common.py:190,206` —
confirmed in Phase 1, no SQLite dual-compat needed, unlike the generic workflow assumption).

## Multi-tenancy / RBAC
- All new/modified endpoints already scope by `workspace__slug`/`project_id` (inherited from
  existing `EstimateProperty`/`Issue`/`IssueEstimatePropertyValue` queryset patterns — no new
  cross-tenant surface introduced). Confirmed by Phase 3 security review: `issue` is already
  looked up scoped to `project_id`/`workspace__slug` before the dual-write's
  `issue.project.estimate_id` check runs, so there is no path to writing across project/workspace
  boundaries.
- Permissions unchanged: `IssueEstimatePropertyValueEndpoint.put` stays
  `@allow_permission([ROLE.ADMIN, ROLE.MEMBER])`; no new role gate needed since this is the same
  permission level as the existing KPI value-setting flow (Q3 didn't ask for a role change).
  Confirmed by Phase 3 security review: this endpoint's role gate (ADMIN/MEMBER) is a SUBSET of,
  not a superset of, whatever permission the main issue PATCH endpoint requires to set
  `estimate_point` directly — so the new dual-write path cannot be used by a role that couldn't
  already achieve the same `estimate_point` change through the existing PATCH endpoint. No
  privilege-escalation gap.
- **Non-blocking note (documented per Phase 3 security review)**: there is a pre-existing
  asymmetry between GUEST-level issue-creator permissions on the main issue PATCH endpoint versus
  this PUT endpoint's ADMIN/MEMBER-only gate — this plan does not change that asymmetry, it's
  called out here so it isn't mistaken for a regression introduced by this feature during Stage D
  review.
- **Non-blocking note (Phase 3 security review)**: Step B3's data migration and Step B8's bulk
  resync both iterate across the full table (all workspaces), matching the accepted precedent set
  by `0148_migrate_kpi_difficulty_repetitive_to_estimate_property.py`. For a large production
  database this could be a long-running migration; Build phase should check approximate row
  counts (`Issue.objects.filter(estimate_point__isnull=False).count()`) before merge and consider
  `.iterator(chunk_size=2000)` on the `Issue`-iterating loops in B3/B8 if the count is large,
  rather than loading everything into memory at once.

## Risks / Open items for Build phase to verify
All items below were reviewed in Phase 3 (three parallel subagents: pattern compliance, security/
multi-tenancy, migration/edge-cases). Items 1, 3 (task-vs-plain-function question) and the
group-heading question were resolved by direct code inspection during that review and are now
baked into Steps B6/F3 above as confirmed facts, not open questions — removed from this list.
The one genuine blocker found (default-system promotion not resyncing `Issue.estimate_point`) is
now closed by Step B8. Remaining items are narrow, non-blocking verifications for Build phase:
1. F6's assumption that draft issues have a persisted id — re-verify `handleEstimate` in
   `draft-issue-properties.tsx` before wiring (Design Decision 4).
2. F8's assumption that `workspaceSlug`/`projectId` are in scope in `commands.ts` — quick grep
   confirms before writing.
3. B6's exact mapper dict (`ACTIVITY_MAPPER` vs the narrower `ISSUE_ACTIVITY_MAPPER` used inside
   `update_issue_activity`) — Build phase reads lines 1500-1620 of `issue_activities_task.py` in
   full to pick the correct one; the dispatch-reuse approach itself is settled, only which exact
   dict entry point is left to confirm.
4. Row-count check before merge for B3/B8's full-table iteration (see Multi-tenancy/RBAC section
   above) — add `.iterator(chunk_size=2000)` if the count warrants it.
