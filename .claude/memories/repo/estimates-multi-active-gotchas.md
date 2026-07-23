# Estimates — fork design & fixes (reviewed 2026-07-14, fixed same day)

Fork allows multiple `last_used=True` ("active") estimates per project; `project.estimate`
is the single "default". As of the 2026-07-14 fix pass:

- **Invariant enforced**: at most one active estimate with `type in (points, time)` per
  project (Categories can still coexist). Enforced in `_activate_numeric_estimate()`
  (`app/views/estimate/base.py`), called from `BulkEstimatePointEndpoint.create`/
  `partial_update`. Migration `0144_single_active_numeric_estimate` cleans up any
  pre-existing violations in prod data.
- New shared helpers in `db/models/estimate.py`: `NUMERIC_ESTIMATE_TYPES = (POINTS, TIME)`
  and `project_has_active_numeric_estimate(slug, project_id)` — use these instead of
  re-deriving `estimate__type="points"` checks; ~15 call sites across cycle/module
  analytics were widened to use them (see `app/views/cycle/{base,archive}.py`,
  `app/views/module/{base,archive}.py`, `utils/{analytics_plot,cycle_transfer_issues}.py`).
  Grouped `.values().annotate(Sum(Cast(...)))` queries (assignee/label distributions) push
  the type filter into `Sum(..., filter=Q(estimate_point__estimate__type__in=NUMERIC_ESTIMATE_TYPES))`
  rather than the base queryset, so issues without a numeric estimate still appear with a
  0/None total instead of disappearing from the distribution.
- `KpiConfig.tables["difficulty"]`/`["repetitive"]` are now keyed by **EstimatePoint id**,
  not value (migration `0145_kpi_difficulty_rekey_by_point_id`). `kpi/issue.py` has
  separate `_difficulty_lookup_key`/`_difficulty_display_value` (and repetitive
  equivalents) — the lookup key feeds `engine.calcular()`, the display value feeds the
  `KpiIssueListEndpoint` response `"difficulty"`/`"repetitive"` fields. Don't collapse
  these back into one function — that was the original bug (rename silently zeroed Vp).
  Frontend `estimateValuesById` (kpi settings page + config-editor.tsx) is now
  `Record<string, {id, value}[]>`, not `Record<string, string[]>`.
- `EstimatePointEndpoint.create`/`destroy` now scope the parent `Estimate`/`EstimatePoint`
  lookup to `project_id`/`workspace__slug` (was an IDOR — any project member could
  delete/misattach points across projects/workspaces by guessing a UUID).
- `BulkEstimatePointEndpoint.destroy` (whole-estimate delete) now synchronously nulls
  `Issue.estimate_point`, `KpiConfig.difficulty_estimate`/`repetitive_estimate`,
  `KpiIssueAttribute.*_estimate_point` instead of relying solely on the async Celery
  `soft_delete_related_objects` cascade (that task still runs as a backstop).
- Server-side validation added: point value must be numeric when the estimate's type is
  points/time (`EstimatePointSerializer.validate`, needs `context={"estimate_type": ...}`
  since `self.instance` isn't available on create); point count must be 2-6
  (`ESTIMATE_POINT_COUNT_MIN/MAX` in `estimate/base.py`, mirrors
  `packages/constants/src/estimates.ts`'s `estimateCount`); duplicate estimate name → 400
  not a raw `IntegrityError` 500.

**Important interaction with KPI (found + fixed 2026-07-14, after the initial fix pass)**:
`KpiConfig.difficulty_estimate`/`repetitive_estimate` can reference ANY estimate for the
project, active or not — `_estimate_point_for_config()` and `KpiConfigSerializer.validate()`
never check `last_used`. This is intentional: KPI is meant to support a dedicated numeric
estimate (e.g., a 1-10 "Difficulty Scale") that's completely separate from the project's
main issue-estimation system, without needing to be "active"/assignable via the regular
`EstimateDropdown`. The `CreateEstimateModal` (`estimates/create/modal.tsx`) originally
hardcoded `last_used: true` on every creation — combined with the new
`_activate_numeric_estimate()` single-active-numeric invariant above, this meant creating
a second Points/Time estimate (even one meant purely for KPI) would silently deactivate
and replace the project's real default estimate. Fixed by changing the create modal to
send `last_used: false`; the backend's existing "first estimate ever → force active"
fallback (`project.estimate_id is None` branch in `BulkEstimatePointEndpoint.create`)
still activates a project's very first estimate automatically. Admins explicitly activate
a second numeric estimate via the existing "Set default" / toggle-active controls in the
estimates list, which correctly triggers `_activate_numeric_estimate` since that's an
intentional switch, not a side effect of creation. See
`test_creating_second_numeric_estimate_inactive_does_not_disturb_active_default` in
`test_estimates_app.py`.

**Full plan**: `.claude/plans/create-a-plan-to-kind-parnas.md` (approved plan with file:line
detail for every change, in case a future session needs to re-verify or extend this work).

**Known gap**: this sandbox has no Python deps installed (no pip/poetry, no running API
container), so the backend pytest suite (`test_estimates_app.py`, `test_kpi.py`, etc. —
including the new tests added in the fix pass) was only verified via `ast.parse` syntax
checks and careful manual trace-through, never actually executed. Run
`pytest apps/api/plane/tests/contract/app/test_estimates_app.py apps/api/plane/tests/contract/app/test_kpi.py`
in an environment with deps installed before trusting this is fully green.

**Confirmed production bug from the above gap (found via live curl repro 2026-07-15,
fixed same day)**: `POST .../estimates/` (`BulkEstimatePointEndpoint.create`) returned
`{"deleted_at": ["This field is required."]}` for every create request. Root cause: DRF
gotcha, not something manual code review would catch — `Estimate.Meta.unique_together =
["name", "project", "deleted_at"]`, and when a `ModelSerializer` has `unique_together`,
DRF auto-adds a `UniqueTogetherValidator` that treats every field in that tuple as
required+client-writable **unless it's explicitly marked `read_only`**. `EstimateSerializer`
had `project` in `read_only_fields` (so no error there) but not `deleted_at` (an internal
soft-delete bookkeeping column no client should ever set) — hence the error. Fixed by
adding `"deleted_at"` to `EstimateSerializer.Meta.read_only_fields`
(`app/serializers/estimate.py`). This only breaks non-partial writes (`create`, not
`partial_update`, since DRF skips required-field checks entirely when `partial=True`) — so
it silently passed manual trace-through of the `partial_update` path but broke `create`.
**General lesson for this codebase**: before wiring `ModelSerializer(data=...).is_valid()`
onto ANY model with `Meta.unique_together`/`UniqueConstraint`, check every field in that
tuple is either genuinely client-supplied or explicitly `read_only` — soft-deletable
models here routinely fold `deleted_at` into uniqueness constraints (see
`SoftDeleteModel`/`AuditModel` in `db/mixins.py`), so this same trap likely exists on
other models' serializers that were recently switched from raw `.objects.create()` to a
`ModelSerializer` — worth a quick audit if that pattern shows up elsewhere.
