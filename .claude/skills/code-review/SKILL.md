---
name: code-review
description: 'Implementation review focused on bug hunting, unwanted behavior detection, security analysis, and pattern compliance. Uses parallel subagents for thorough multi-dimensional review.'
---

# Code Review (Bug Hunting & Behavior Analysis)

## Overview

Actively hunt for bugs, unwanted behavior, security issues, and pattern violations in the implementation. This is not a passive checklist — it requires mentally tracing execution paths and thinking adversarially about what could go wrong.

## When to Use

After implementation is complete and `npm test` passes (Phase 6).

## Review Philosophy

This review goes beyond compliance checking. For each file, ask:
- **"What could go wrong at runtime?"** — trace the execution path mentally
- **"Does this do exactly what the plan says?"** — no more, no less
- **"What happens with bad input?"** — think adversarially
- **"Could this leak data across accounts?"** — check every query

## Launch 3 Parallel Review Subagents

### Subagent 1: Security & Data Isolation Review

Check every new/modified file for:

**Authentication & Authorization**:
- [ ] All new routes have auth middleware (`verificaToken` or `authenticateApiKey`)
- [ ] All mutation routes have RBAC middleware (`requireRole`)
- [ ] `req.user.account_id` used (not client-supplied)
- [ ] `triage` role limitations enforced

**Data Isolation**:
- [ ] Every DB query filters by `account_id`
- [ ] No cross-account data leakage possible
- [ ] `system_admin` access properly scoped

**Input Validation**:
- [ ] All request bodies validated (Zod schemas)
- [ ] Route params validated (express-validator)
- [ ] No SQL injection vectors (parameterized queries)
- [ ] No XSS vectors in stored/returned content

**Data Exposure**:
- [ ] No passwords/tokens/secrets in API responses
- [ ] No sensitive data in log output
- [ ] Error messages don't leak internal details

### Subagent 2: Bug Hunting & Runtime Behavior Review

**Schema & Column Verification (MANDATORY — catches the #1 missed bug class)**:
For every raw SQL query, QueryBuilder call, or `.addSelect()` / `.where()` referencing column names:
- [ ] Extract EVERY column name referenced (e.g., `r.duration_ms`, `m.internal_context`, `ts.status`)
- [ ] Open the corresponding entity file and verify the column EXISTS as a `@Column()` decorator
- [ ] If the column doesn't exist in the entity ? ?? CRITICAL (runtime SQL crash)
- [ ] For computed expressions (EXTRACT, COALESCE, JULIANDAY), verify the SOURCE columns exist
- [ ] For aggregate queries (SUM, AVG, COUNT), verify the aggregated columns have compatible types

**Concrete example of a schema verification bug:**
> A service references `r.duration_ms` in a SQL query. The `runs` entity has NO `duration_ms` column — duration is computed from `started_at` and `completed_at`. Every call to this query throws: `column r.duration_ms does not exist`. This went undetected through 3 review subagents because none verified column names against the entity schema.

**Consumer Chain Impact Analysis (MANDATORY for removed/changed data)**:
For every field, data structure, or behavior that was REMOVED or CHANGED:
- [ ] Grep the ENTIRE codebase for consumers that read the removed/changed field
- [ ] Check services, middleware, frontend components, other API services, and test factories
- [ ] For each consumer found: does it handle the absence gracefully, or will it break/show empty data?
- [ ] Pay special attention to: `internal_context.*`, `result.*`, JSONB sub-fields, and any data written by one service and read by another

**Concrete example of a consumer chain bug:**
> A line writing `input_composition` to `message.internal_context` is removed. But `MessageDetailsService.getMessageDetails()` still reads `message.internal_context.input_composition` and the frontend `MessageDetailsPanel` still renders `details?.input_composition`. Result: the frontend panel shows empty data for all new messages. The data exists elsewhere (`runs.result.inputComposition`) but no consumer reads from there as a fallback.

**Contract & Interface Consistency** — for every function whose return value was changed:
- [ ] Read the INPUT schema (Zod, TypeScript interface, or type definition) — does the output still honor the invariants implied by the input? (e.g., if the input enforces `z.literal(true)`, the output must not return `false` for the same semantic field)
- [ ] Grep for ALL consumers that parse or read the output (other services, middleware, frontend, downstream tools) — will they break or silently misbehave with the new shape/values?
- [ ] If a new field was added to a response, verify no consumer uses strict property-count checks (e.g., `Object.keys(parsed).length === 3`)
- [ ] If a field's possible values changed (e.g., was always `true`, now can be `false`), trace every `if` / `switch` / guard that reads it

**Concrete example of a contract violation bug:**
> A tool has input schema `transfer_to_human: z.literal(true)`. The function is modified to return `{ transfer_to_human: available }` where `available` can be `false`. This violates the semantic contract: the input says "always true", but the output now says "sometimes false". A downstream consumer checking `parsed.transfer_to_human === true` will silently skip the transfer when the field is `false`, even though the tool was intentionally called. The fix: keep `transfer_to_human: true` always, add a separate `available_agents` boolean for the conditional logic.

**Execution Path Tracing** — for each main code path, mentally walk through:
- [ ] What happens when the DB returns null/empty?
- [ ] What happens when a required field is missing or wrong type?
- [ ] What happens with concurrent requests to the same resource?
- [ ] What happens when an external service call fails or times out?
- [ ] Are there any off-by-one errors in pagination, indexing, or slicing?

**Logic Correctness**:
- [ ] Happy path produces correct results
- [ ] Response format matches API conventions (status codes, shapes)
- [ ] Calculations and transformations are correct
- [ ] Boolean conditions have correct polarity (no inverted checks)

**Side Effects & State**:
- [ ] No unintended mutations to shared state
- [ ] Transactions wrap multi-table operations
- [ ] Audit logs written atomically with mutations
- [ ] WebSocket events emitted where frontend expects them
- [ ] Queue jobs dispatched correctly (if applicable)

**Edge Cases**:
- [ ] Empty arrays/collections handled
- [ ] Null/undefined fields handled without crashes
- [ ] Very long strings or large payloads handled
- [ ] Unicode and special characters handled

### Subagent 3: Plan Compliance, Spec Compliance & Pattern Review

**Spec/Requirements Compliance** — if the task is based on a spec, analysis doc, or issue:
- [ ] Read the original spec/requirements document (if one exists in the workspace or was referenced by the user)
- [ ] Extract every actionable requirement from the spec
- [ ] For each requirement, verify it was implemented in code (not just planned)
- [ ] Flag any spec items marked "deferred" or "out of scope" — were they deferred with explicit user approval, or did the feature silently skip them?
- [ ] If the spec says "Job X should do Y" — verify Job X actually does Y (not just that Job X exists)

**Behavior vs Plan** — read the implementation plan from `.claude/memories/session/final-plan.md`, then:
- [ ] Every planned feature is implemented
- [ ] No extra features added beyond the plan
- [ ] No planned steps were skipped
- [ ] API endpoints match planned routes and methods

**Code Structure**:
- [ ] Constructor injection used (no global imports for dependencies)
- [ ] File naming follows conventions (kebab-case.type.ts)
- [ ] File locations match project structure

**Error Handling**:
- [ ] `AppError` subclasses used (not generic Error)
- [ ] HTTP status codes are correct (404, 400, 403, 409, 422)
- [ ] Pino logger used (not console.log)

**Testing**:
- [ ] Tests exist for new code
- [ ] Factory functions created (channel-api) or inline mocks (assistant-api)
- [ ] Edge cases tested (not just happy path)
- [ ] Multi-tenancy isolation tested (account A can't see account B data)

## Output Format

Write to `.claude/memories/session/phase6-review.md`:

```markdown
## Code Review Results

### Security & Data (Subagent 1)
- ? [passed check]
- ?? [critical issue] ? [what to fix]

### Bugs & Behavior (Subagent 2)
- ? [passed check]
- ?? [bug found] ? [root cause and fix]
- ?? [concern] ? [recommendation]

### Plan Compliance & Patterns (Subagent 3)
- ? [passed check]
- ?? [deviation] ? [how to align]

### Prioritized Issue List
For each issue, include a **test specification** so Phase 7 can write a regression test BEFORE fixing:
1. ?? [Critical: description, file, impact]
   - **Test spec:** `"should [expected behavior]"` — describe the test that would catch this bug
2. ?? [Important: description, file]
   - **Test spec:** `"should [expected behavior]"`
3. ?? [Minor: description, file]
   - **Test spec:** (optional for minor issues)
```

### (Conditional) Subagent 4: Frontend Quality Review (only if assistant-front files were changed)

Run this subagent only when assistant-front files were created or modified. Read the `frontend-design` skill first.

**Component Reuse**:
- [ ] Every new component file is justified — could it be replaced by ResourceListPage, FilterBar, StatsBar, StatusHandler, ModalComponent, FormModal, or ComfirmAction?
- [ ] No wrapper components that just pass props to existing shared components
- [ ] If >3 new component files for a single page ? flag as ?? (bloat risk)

**Design System Compliance**:
- [ ] All colors use CSS variables or Tailwind theme tokens (no hardcoded hex/rgb)
- [ ] Icons from `lucide-react` only (no other icon libraries)
- [ ] Spacing follows standard scale (space-y-6 sections, gap-3 items)
- [ ] Typography follows hierarchy (see frontend-design skill)

**Interactive Element Sizing** (the #1 visual bug shipped by LLMs):
- [ ] All `<input>`, `<select>`, `<button>` elements use h-8 or taller (h-10 recommended) — NEVER h-4, h-5, h-6, h-7
- [ ] All `<textarea>` elements use min-h-[60px] or taller — NEVER min-h below 60px
- [ ] Icon-only buttons use h-8 w-8 minimum (32px touch target)
- [ ] Checkboxes/radios use h-4 w-4 minimum
- [ ] No interactive element has `p-0` (no padding = unclickable)
- [ ] No container with `max-w-[<30px]` holds an input (compression)
- [ ] No text on clickable elements uses `text-[8px]` or similar sub-10px sizes
- [ ] Flag any undersized element as ?? CRITICAL — it's broken for users even though tests pass

**Table Usability** (catch layout issues invisible to RTL):
- [ ] Every `<table>` wrapped in `overflow-x-auto` container
- [ ] Every `<table>` has `<thead>` with header row
- [ ] Cells with `truncate` have `title` attribute for full text on hover
- [ ] Clickable `<tr>` rows have `role="button"` and `tabIndex`
- [ ] Text columns at least `w-20` — narrower only for icon/checkbox columns
- [ ] Input/button/select elements in cells have cells of at least `w-16`

**Form Usability**:
- [ ] Every input has label association (`for`/`id`, `aria-label`, `aria-labelledby`, or wrapping `<label>`)
- [ ] Exception: `<input type="search">` with placeholder is OK without visible label
- [ ] Every `<form>` has a submit button
- [ ] Disabled inputs have visual indication (`opacity-50`, `cursor-not-allowed`)

**Frontend Test Quality**:
- [ ] Page/component tests call `runAllValidations(container)` from `tests/helpers/ui-validation.ts`
- [ ] Pages with tables call `assertTableUsability(container)`
- [ ] Pages with forms call `assertFormUsability(container)`
- [ ] Pages with API-submitting forms call `assertApiContractCompliance(form, expectedPayload)`
- [ ] If no UI validation calls found in tests ? flag as ?? IMPORTANT

**Visual Verification Evidence**:
- [ ] For new pages: DevPreview harness (`/dev/preview/:pageName`) was checked or screenshot provided
- [ ] All 4 states verified (Loading, Empty, WithData, Error)
- [ ] If no visual verification happened ? flag as ?? MINOR (recommendation, not blocking)

**Pre-existing Bug Detection**:
- [ ] If the implementation modifies a page, were sibling pages in the same area also scanned for pre-existing issues?
- [ ] Any pre-existing violations documented in `.claude/memories/session/pre-existing-bugs.md`?

**State Handling**:
- [ ] Every data-driven component handles: loading, empty, AND error states
- [ ] Loading uses Loader2 spinner or skeleton pattern
- [ ] Empty state has icon + message + subtext

**Animation & Polish**:
- [ ] Page content wrapped in `motion.div` with entrance animation
- [ ] List items have stagger animation with capped delay
- [ ] Modals use `AnimatePresence` with exit animation

**Status Badges**:
- [ ] Status color mapping follows standardized pattern (not inline per-page definitions)

### Subagent 5: Test Quality Audit (ALWAYS runs when test files exist)

This subagent catches lazy, insufficient, or deceptive tests that give false confidence. **This is the most important review for lower-capability models (GPT-5-mini) which are prone to writing superficial tests that pass but verify nothing.**

**Assertion Specificity** — the #1 indicator of lazy testing:
- [ ] NO test uses ONLY `toBeDefined()` or `toBeTruthy()` as its sole assertion for a return value — these prove nothing (a wrong result is also "defined" and "truthy")
- [ ] Response body tests don't stop at status code — they verify the shape AND values of the response data
- [ ] Array length is asserted AND at least one item's properties are verified
- [ ] For each assertion, ask: "Would this test still pass if the function returned completely wrong data?" If yes ? flag as ?? CRITICAL

**Tautological Test Detection** — tests that cannot fail:
- [ ] No tests where the mock's return value is directly asserted without production code in between (e.g., mock returns `{ id: '1' }`, test asserts `result.id === '1'` — this tests the mock, not the code)
- [ ] No tests where the function under test is itself mocked (you're testing Jest, not your code)
- [ ] No tests that assert on the input rather than the output
- [ ] Flag any tautological test as ?? CRITICAL — it actively hides bugs by inflating test counts

**Negative Path Coverage** — the most commonly skipped tests:
- [ ] Every service method that can throw has at least one test for each error type (NotFoundError, ValidationError, ForbiddenError)
- [ ] Every route handler has tests for: missing auth, wrong role, invalid body, not-found resource
- [ ] Every DB query has a test for "returns empty when no data matches"
- [ ] Flag functions with ZERO negative tests as ?? CRITICAL

**Multi-Tenancy Isolation** — critical for data safety:
- [ ] For every endpoint or query that takes `account_id`: at least one test creates data for Account A, then queries as Account B and verifies the data is NOT returned
- [ ] Missing isolation tests are ?? IMPORTANT — multi-tenancy bugs are production-critical

**Mock Discipline**:
- [ ] Mocks return objects with ALL fields the production code accesses (not empty `{}`)
- [ ] Repository mocks return entity-shaped objects, not minimal stubs
- [ ] External service mocks include realistic error responses, not just happy paths
- [ ] No overly broad mocks that bypass the logic being tested (e.g., mocking an entire class instead of just its dependency)

**Side-Effect Verification**:
- [ ] Mutation tests verify audit log creation (correct action, correct user, correct data)
- [ ] Sync-triggering mutations verify the sync function was called with correct args
- [ ] Queue-triggering mutations verify the job was enqueued with correct payload

**Minimum Test Count**:
- [ ] Service methods: =3 tests each (happy path + 2 error/edge cases)
- [ ] Route handlers: =4 tests each (success + auth + validation + not-found)
- [ ] Repository methods: =2 tests each (found + not-found)
- [ ] Flag any component below minimums as ?? IMPORTANT

**Output for test quality findings:**
For EACH finding, provide a **concrete test case** to add:
```
?? IMPORTANT: MyService.create() has only 1 test (happy path)
   Missing tests:
   - "should throw ValidationError when name is empty"
   - "should throw ForbiddenError when user role is triage"
   - "should not return data from other accounts"
```

## After Review

- Do NOT fix issues in this phase — only document them
- Phase 7 will process the issue list
- If zero issues found, Phase 7 will be skipped
