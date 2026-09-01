# Dynamic N estimate properties (replaces hardcoded KPI Difficulty/Repetitive)

As of migrations `0147`-`0149` (see `estimates-multi-active-gotchas.md` in this same
directory for the earlier multi-active-estimate work this builds on), `KpiConfig.difficulty_estimate`/
`repetitive_estimate` and `KpiIssueAttribute.difficulty_estimate_point`/
`repetitive_estimate_point` **no longer exist**. They were replaced by two new models
(`db/models/estimate.py`): `EstimateProperty` (project + estimate FK + `kpi_role`
nullable — `"difficulty"`/`"repetitive"` for the two KPI-reserved rows, `null` for
free-form custom properties) and `IssueEstimatePropertyValue` (issue + property +
estimate_point). `engine.py`'s `calcular()` math is untouched; only the data-access layer
in `kpi/issue.py` (`KpiPropertyResolver`) changed — it bulk-resolves points via the new
tables instead of the old FK columns.

**Frontend is now genuinely dynamic, not just a 2-slot rename**:
- `sidebar.tsx` and `issue-modal/components/default-properties.tsx` no longer have
  hardcoded Difficulty/Repetitive JSX blocks — both loop over
  `activeEstimatePropertyIdsByProjectId(projectId)` (from `useProjectEstimates()`,
  `store/estimates/project-estimate.store.ts`) and render one `EstimateDropdown` row per
  property. Rows where `property.kpi_role` is set are additionally gated on
  `project?.kpi_view` (closes the old gap where Difficulty/Repetitive ignored the KPI
  feature toggle); custom (non-KPI) properties are shown regardless of `kpi_view`.
- The create/edit issue modal's draft state (`issue-modal/context/issue-modal-context.tsx`
  + `ce/components/issues/issue-modal/provider.tsx`) replaced the old fixed
  `kpiDifficultyEstimatePoint`/`kpiRepetitiveEstimatePoint` state pair with a generic
  `estimatePropertyValues: Record<propertyId, string | null>` draft map + single
  `setEstimatePropertyValue(propertyId, value)` setter + `handleCreateUpdateEstimatePropertyValues`
  (submits all touched entries via the store's `updateIssueEstimatePropertyValue`, then
  clears the draft). A missing key = untouched/skip on submit, matching the old
  `undefined` sentinel semantics per-field.
- New settings UI: `estimates/properties/root.tsx` (`EstimatePropertiesSection`), rendered
  inside the existing Estimates settings page (`estimates/root.tsx`), lets admins add/
  rename/retarget/deactivate/delete custom properties and retarget the two KPI-reserved
  ones (via `upsertKpiRoleEstimateProperty`, called from `kpi/config-editor.tsx` and
  `kpi/settings/page.tsx` — the "which estimate backs Difficulty/Repetitive" picker there
  now upserts a `kpi_role`-tagged `EstimateProperty` instead of patching `KpiConfig`).

**Dead code found and removed during this migration**: `core/components/kpi/issues-table.tsx`
(`KpiIssuesTable`) was unreferenced by any route/page — grepped the whole repo, zero
imports outside its own barrel export. Rather than speculatively wiring it onto the new
`EstimateProperty` API, it was deleted along with its barrel export in
`core/components/kpi/index.ts`. **Gotcha**: `status-badge.tsx` in the same directory
looked related (also KPI-table-ish) but is actually still used by the live
`kpi/member-list.tsx` — don't delete it too when cleaning up this directory (caught via
`git status` + `git checkout --` after an over-eager `rm`).

`packages/services/src/kpi/kpi.service.ts` also needed cleanup: `updateIssueDifficultyEstimate`/
`updateIssueEstimate`/`updateIssueRepetitiveEstimate` and the `IKpiIssueEstimate` type
import were removed (the backend endpoints they called, `kpi-issue-estimate`/
`kpi-issue-repetitive-estimate`, were deleted in the same backend change; superseded by
`estimate-property.service.ts`'s generic `updateIssueEstimatePropertyValue`).

**Build-staleness gotcha extends to `@plane/services` too**, not just `@plane/types`/
`@plane/constants` (see `estimates-multi-active-gotchas.md` for the original instance of
this gotcha): `pnpm run build` (tsdown) must be run in `packages/services/` after editing
`kpi.service.ts` or `apps/web`'s typecheck won't see the change.
