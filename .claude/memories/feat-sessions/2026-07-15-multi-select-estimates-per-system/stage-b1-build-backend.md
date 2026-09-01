# Stage B1 — Build Backend

## Status: COMPLETE

## Note on generic agent instructions
This repo (Plane) is Django/Python (`apps/api`) + React/Vite (`apps/web`), not the
Node/TypeORM/Jest stack the `feature-build-backend` agent's boilerplate (Boot Step 3
service list, `implementation-execution`/`typeorm-database-patterns`/
`multi-tenancy-security` skills) targets. `final-plan.md` already correctly targets the
real stack (Django ORM, pytest, `apps/api/plane/db/migrations/`), so this stage followed
`final-plan.md`'s own Steps B1-B9 and pattern sources instead of the generic skill content.
TDD discipline (RED->GREEN, test quality standards: specific assertions, negative paths,
pre/post-condition state checks) was still applied throughout, using pytest/Django
equivalents of the generic rules.

## Backend Services Modified
- `apps/api` (Django): `EstimateProperty.is_estimate_default` field/constraint, 2 new
  migrations, auto-create/bulk-resync logic in `estimate/base.py`, dual-write + activity
  logging in `estimate/property.py`, new activity tracker in `issue_activities_task.py`,
  serializer read-only field, `CELERY_TASK_ALWAYS_EAGER` added to test settings.

## Steps Completed (all TDD RED->GREEN, evidence below)

| Step | Description | Tests | RED confirmed | GREEN confirmed |
|------|---|---|---|---|
| B1 | `is_estimate_default` field + unique constraint on `EstimateProperty` | 3 new (+1 existing) | Yes (`TypeError: unexpected keyword argument`) | Yes |
| B2 | Migration `0150_estimateproperty_is_estimate_default.py` (AddField+AddConstraint only, hand-written to avoid unrelated pre-existing drift picked up by `makemigrations`) | N/A (verified via `makemigrations --check --dry-run`) | N/A | Yes |
| B3 | Data migration `0151_backfill_estimate_default_properties.py` | 4 new | Yes (`ModuleNotFoundError` via temp-removed migration file) | Yes |
| B4 | `_ensure_estimate_default_property()` auto-create on activation (create + partial_update) | 4 new | Yes (`assert False`/`0==1`) | Yes |
| B5 | Dual-write (`Issue.estimate_point`) + precise activity call in `IssueEstimatePropertyValueEndpoint.put` | 7 new | Yes (5/7 genuine RED; 2 are inherent regression guards that already held) | Yes |
| B6 | `track_estimate_property_value_activity` + `ACTIVITY_MAPPER` registration | 3 new | Yes (`ImportError`) | Yes |
| B7 | `is_estimate_default` added to `EstimatePropertySerializer.read_only_fields` | 4 new (2 API-level regression guards + 2 serializer-level, since the view's own allowlist already blocked the field — serializer-level test was needed to get a genuine RED) | Yes (serializer-level: `AssertionError` field not in list / value changed) | Yes |
| B8 | `_bulk_resync_issue_estimate_point()` wired into both promotion branches (`_activate_numeric_estimate`, `partial_update` deactivation) | 2 new | Yes (`assert UUID(...) == UUID(...)` mismatch / `is None` failed) | Yes |
| B9 | Synchronous nulling in `EstimatePointEndpoint.destroy()`'s no-replacement branch | 2 new (patched out the async cascade via `monkeypatch` to force a genuine RED, since `CELERY_TASK_ALWAYS_EAGER` added for B5/B6 made the async path run eagerly too) | Yes | Yes |

## APIs/Endpoints — behavior changed (no new routes; existing routes gained new side effects)
| Method | Route | Change |
|--------|-------|--------|
| POST | `/api/workspaces/:slug/projects/:project_id/estimates/` | B4: auto-creates default `EstimateProperty` when `last_used=True` |
| PATCH | `/api/workspaces/:slug/projects/:project_id/estimates/:estimate_id/` | B4/B8: auto-creates default property on activation; bulk-resyncs `Issue.estimate_point` when the project default is promoted |
| PUT | `/api/workspaces/:slug/projects/:project_id/issues/:issue_id/estimate-properties/:property_id/` | B5/B6: dual-writes `Issue.estimate_point` for the project-default system only; always logs a precise `estimate_property_<id>` activity row |
| DELETE | `/api/workspaces/:slug/projects/:project_id/estimates/:estimate_id/estimate-points/:estimate_point_id/` | B9: synchronously nulls `Issue.estimate_point`/`IssueEstimatePropertyValue.estimate_point` on the no-replacement branch |
| PATCH/GET/POST | `/api/workspaces/:slug/projects/:project_id/estimate-properties/...` | B7: `is_estimate_default` now serialized, read-only |

## Database Migrations
- `0150_estimateproperty_is_estimate_default.py` — `AddField` + `AddConstraint` (hand-written, scoped exactly to this feature; `makemigrations` also wanted to bundle in unrelated pre-existing drift on `kpiconfig`/`kpiissueattribute`/`created_by` fields that predates this session — deliberately left out, confirmed via `git stash` that the same drift exists on unmodified `stable-1.3.1`).
- `0151_backfill_estimate_default_properties.py` — `RunPython` data migration, backfills default `EstimateProperty` rows for every `last_used=True` `Estimate` and migrates existing `Issue.estimate_point` values into `IssueEstimatePropertyValue`. Idempotent (`get_or_create`).

## Files Changed
- `apps/api/plane/db/models/estimate.py` — B1: new field + constraint
- `apps/api/plane/db/migrations/0150_estimateproperty_is_estimate_default.py` — B2 (new)
- `apps/api/plane/db/migrations/0151_backfill_estimate_default_properties.py` — B3 (new)
- `apps/api/plane/app/views/estimate/base.py` — B4/B8/B9
- `apps/api/plane/app/views/estimate/property.py` — B5
- `apps/api/plane/bgtasks/issue_activities_task.py` — B6
- `apps/api/plane/app/serializers/estimate.py` — B7
- `apps/api/plane/settings/test.py` — added `CELERY_TASK_ALWAYS_EAGER`/`CELERY_TASK_EAGER_PROPAGATES` (test-only; needed so `.delay()`-based activity logging and async soft-delete cascades run synchronously and are assertable in tests — the worker container otherwise runs against a different DB)
- Test files (new): `apps/api/plane/tests/unit/migrations/__init__.py`,
  `apps/api/plane/tests/unit/migrations/test_0151_backfill_estimate_default_properties.py`,
  `apps/api/plane/tests/contract/app/test_estimate_property_values.py`,
  `apps/api/plane/tests/unit/bg_tasks/test_issue_activities_task.py`,
  `apps/api/plane/tests/unit/serializers/test_estimate_serializer.py`
- Test files (extended): `apps/api/plane/tests/unit/models/test_estimate_model.py`,
  `apps/api/plane/tests/contract/app/test_estimates_app.py`

## Test Results
- New/modified test files: 29 new tests, all passing.
- Full suite: `28 failed, 270 passed` — all 28 failures confirmed pre-existing/unrelated via
  `git stash` (identical failures reproduced with every B1-B9 change reverted). None of the
  28 are in a file I created; 3 are in `test_estimates_app.py::TestEstimateAppAPI` (a
  pre-existing `str(UUID) == UUID` comparison bug in tests I did not write, unrelated to my
  4 new test classes in the same file, which all pass).
- Build: `python manage.py check` — 0 issues. `makemigrations --check --dry-run` — no new
  drift beyond the same pre-existing gap present on unmodified `stable-1.3.1`.

## Deviations from Plan
1. **Hand-wrote migration 0150** instead of using `makemigrations` directly, to avoid
   bundling in unrelated pre-existing model/migration drift (Meta options changes on
   `KpiConfig`/`KpiIssueAttribute`, `created_by` field alterations) that already exists on
   `stable-1.3.1` HEAD, confirmed via `git stash` — out of scope for this feature.
2. **B5's test cases 1 and 3** (non-default / secondary-system property values not touching
   `Issue.estimate_point`) pass trivially even before B5's code changes, since the endpoint
   never touched `estimate_point` at all pre-B5. Kept them as regression guards rather than
   dropping them, per the plan's explicit test-case list.
3. **B7's API-level PATCH test** (`is_estimate_default: true` silently ignored) also passes
   without the serializer change, because `EstimatePropertyDetailEndpoint.partial_update`'s
   own `allowed_fields` allowlist already filters the field before it reaches the serializer.
   Added a second, serializer-level test file (`test_estimate_serializer.py`) that exercises
   `EstimatePropertySerializer` directly — this one genuinely REDs/GREENs on the
   `read_only_fields` change, matching the plan's stated intent (defense-in-depth,
   consistent with `kpi_role`).
4. **B9's tests initially passed without code change** because `CELERY_TASK_ALWAYS_EAGER`
   (added earlier for B5/B6) made the async `soft_delete_related_objects` cascade also run
   synchronously in tests, masking the exact "depends on Celery being up" gap B9 targets.
   Fixed by `monkeypatch`-ing that cascade to a no-op in B9's two tests, isolating what the
   endpoint's own synchronous code is responsible for.
5. **Found (not fixed) pre-existing test bug**: `test_estimates_app.py::TestEstimateAppAPI`
   has 3 tests asserting `str(project.estimate_id) == response.data["id"]` where
   `response.data["id"]` is actually a `UUID` object (this repo's `BaseSerializer.id` uses
   `PrimaryKeyRelatedField`, which does not stringify), so `str(uuid) == uuid` is always
   `False`. Confirmed via `git stash` this fails identically on unmodified `stable-1.3.1`,
   unrelated to this feature. Left unfixed (out of scope) but the same bug pattern was
   avoided in all of my new tests.
6. **`test_kpi.py`'s 2 flaky failures** (`test_split_equally_between_two_assignees`,
   `test_aggregates_across_all_projects_in_workspace`) — `IntegrityError: duplicate key
   value violates unique constraint "users_username_key"` — confirmed pre-existing via
   `git stash`, unrelated to this feature (looks like test-DB/`--reuse-db` state leakage
   from blank-`username` user creation, not a real product bug).

## Risks / Open items carried into Stage B2 (Frontend)
Per `final-plan.md`'s "Risks / Open items" section — none of these blocked backend work,
but frontend build should re-verify:
1. F6's assumption that draft issues have a persisted id (`draft-issue-properties.tsx`'s
   `handleEstimate`).
2. F8's assumption that `workspaceSlug`/`projectId` are in scope in `commands.ts`.
3. Row-count check before merge for B3/B8's full-table iteration, if production data volume
   warrants tighter `.iterator(chunk_size=...)` batching (currently 500 for B8, unbounded
   `.filter()` for B3 matching the accepted `0148` migration precedent).
