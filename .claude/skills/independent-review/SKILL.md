---
name: independent-review
description: 'Multi-subagent independent review of implementation completeness, runtime correctness, deployment safety, and test quality. Replaces single-agent Stage E review with 4 specialized auditors and structured methodology.'
---

# Independent Review (Stage D)

## Overview

Stage D provides an unbiased, zero-implementation-context review of the feature's codebase state. Unlike Phase 6 (self-review by the implementing model), Stage D uses FRESH subagents that discover the feature state independently, preventing confirmation bias.

## Why This Exists

**Observed failure pattern**: An implementing LLM (Claude Opus 4.6) completed 14 fixes across 11 files, passed all unit tests, passed Phase 6 self-review (3 subagents), and produced a MINOR_ISSUES verdict from the Mentor review. A separate, fresh review of the same code found **2 CRITICAL + 4 HIGH issues** — including a SQL column that doesn't exist and a data removal that broke the entire frontend panel.

**Root causes this skill addresses**:
1. Self-review bias — the implementing model rationalizes its own decisions
2. Vague review prompts — "review the feature" doesn't elicit rigorous analysis
3. Single-agent bottleneck — one agent can't go deep on all dimensions
4. Missing spec comparison — no review compared code against original requirements
5. No schema verification — SQL column references were never validated against entities
6. No consumer chain tracing — removed data fields weren't traced to downstream consumers

## When to Use

Phase 8 of the feature agent. Replaces the previous Mentor-based approach.

## Context Isolation Rules (CRITICAL)

The ONLY context passed to review subagents:
- **Feature name** (e.g., "DB Bloat Fix", "Billing")
- **Services affected** (e.g., "assistant-api")
- **Spec/requirements document path** (if one exists)

**NEVER pass**:
- Implementation plan, files changed list, session memory
- Decisions made during implementation
- Phase 1-11 details
- Which files were recently created or modified

## Process: 4 Specialized Subagents

### Pre-Step: Identify the Spec Document

Before launching subagents, determine if a spec/requirements document exists:
- Was this task based on an analysis doc, issue description, or feature spec?
- Is there a `.md` file in the workspace that defines what should be implemented?
- Did the user reference a document when starting the task?

Store the spec path (or "none") — Subagent 1 needs it.

### Subagent 1: Spec Compliance Auditor

**Purpose**: Verify that every requirement in the original spec was implemented.

**Prompt template**:
```
You are auditing whether a feature implementation matches its specification.

FEATURE: {{FEATURE_NAME}}
SERVICES: {{SERVICES_AFFECTED}}
SPEC DOCUMENT: {{SPEC_PATH}} (read this file FIRST)

TASK:
1. Read the spec document thoroughly. Extract every actionable requirement:
   - Every entity/table that should be created
   - Every endpoint that should exist
   - Every job/scheduled task that should run
   - Every behavior change specified
   - Every data flow described
   Number each requirement: R1, R2, R3, ...

2. For EACH requirement, search the codebase to verify it was implemented:
   - Search for entity files, service methods, route definitions, job files
   - Read the actual code to verify it matches the spec (not just that a file exists)
   - Check if the implementation is complete or partial

3. For each requirement, classify:
   - ? IMPLEMENTED — code exists and matches spec
   - ?? PARTIAL — code exists but is incomplete or deviates from spec
   - ? MISSING — no implementation found
   - ?? DEFERRED — explicitly marked as out-of-scope (only if documented in code comments)

4. For PARTIAL and MISSING items, explain:
   - What the spec says should happen
   - What actually exists (or doesn't)
   - The impact of the gap

RULES:
- Do NOT read .claude/memories/session/ or any implementation plans
- Do NOT assume anything works — verify by reading code
- Be specific: cite exact spec sections and exact file paths
- If the spec document doesn't exist or is empty, report "NO SPEC FOUND" and skip this audit

RETURN FORMAT:
Return a structured report with:
- Total requirements found: N
- Implemented: N | Partial: N | Missing: N | Deferred: N
- Details for each requirement (especially PARTIAL and MISSING)
```

**When no spec exists**: If the task was a simple bug fix or refactor without a formal spec, Subagent 1 can be replaced with: "Search for TODO, FIXME, and incomplete implementations in all files related to {{FEATURE_NAME}}. Check if any functions are stubbed out, have empty bodies, or have comments indicating missing work."

### Subagent 2: Runtime Correctness Auditor

**Purpose**: Find bugs that would crash or silently fail at runtime — the class of bugs that self-review misses.

**Prompt template**:
```
You are hunting for runtime bugs in the "{{FEATURE_NAME}}" feature.
Services: {{SERVICES_AFFECTED}}

TASK:
1. Find ALL files related to "{{FEATURE_NAME}}" in the codebase:
   - Entities, migrations, services, repositories, routes, jobs, tests

2. SCHEMA VERIFICATION (CRITICAL):
   For every raw SQL query or QueryBuilder call you find:
   a. Extract every column name referenced (e.g., r.duration_ms, m.internal_context)
   b. Find the corresponding entity file and verify the column EXISTS
   c. If the column doesn't exist in the entity, flag as ?? CRITICAL
   d. For computed expressions (EXTRACT, COALESCE), verify the source columns exist

3. CONSUMER CHAIN ANALYSIS:
   For every field that is written to or read from in the feature code:
   a. Grep for ALL other files that read this field
   b. If the feature REMOVES or CHANGES a field, verify every consumer handles it
   c. Specifically check: services, middleware, frontend components, other APIs
   d. Flag any consumer that would break or silently return empty data

4. NULL/ERROR PATH ANALYSIS:
   For each function:
   a. What happens when the DB query returns zero rows?
   b. What happens when a nullable field is actually null?
   c. Are there non-null assertions (!) on values that could be null?
   d. Are there try/catch blocks that silently swallow errors?

5. TYPE SAFETY CHECK:
   a. Do TypeScript types match what the DB actually returns? (e.g., bigint ? string, not number)
   b. Are there `as any` or `!` assertions hiding type mismatches?
   c. Do JSON column types match between entity definition and actual usage?

RULES:
- Do NOT read .claude/memories/session/ or any implementation plans
- For SQL column verification, ALWAYS read the entity file — don't assume
- For consumer chain analysis, use grep/search extensively
- Be specific: cite file paths, line numbers, and exact column/field names

RETURN FORMAT:
Return findings categorized as:
- ?? CRITICAL: Will crash or produce wrong data at runtime
- ?? IMPORTANT: Likely to cause issues under certain conditions
- ?? MINOR: Code smell or potential future issue
Include the specific file, line, and evidence for each finding.
```

### Subagent 3: Deployment & Integration Risk Auditor

**Purpose**: Analyze what happens when this code is deployed to production for the first time.

**Prompt template**:
```
You are analyzing deployment risks for the "{{FEATURE_NAME}}" feature.
Services: {{SERVICES_AFFECTED}}

TASK:
1. MIGRATION ANALYSIS:
   Find all migration files related to the feature. For each:
   a. What does the UP migration do? (create table, alter column, delete data, add FK)
   b. How long will it take on production data? (check table sizes if analysis docs exist)
   c. Does it lock tables? For how long?
   d. Is the DOWN migration implemented and correct?
   e. Are there data-destructive operations (DELETE, DROP, CASCADE changes)?
   f. If FK actions are changed (e.g., SET NULL ? CASCADE), what data could be lost?

2. FIRST-RUN ANALYSIS:
   For scheduled jobs/background tasks related to the feature:
   a. What happens on the FIRST execution after deploy?
   b. Is there a backfill/migration storm? How many items need processing?
   c. Is there concurrency protection if the job overlaps with the next scheduled run?
   d. What's the estimated time to reach steady state?

3. DATA CONTINUITY:
   a. Does the feature remove any data that other features still read?
   b. Is there a gap between "stopped writing old format" and "started reading new format"?
   c. Will dashboards, APIs, or frontend pages show empty/stale data after deploy?
   d. Are there fallback paths for when new data structures are empty?

4. ROLLBACK SAFETY:
   a. If deployment fails, can migrations be rolled back safely?
   b. Will rolled-back migrations leave data in an inconsistent state?
   c. Are there one-way data transformations that can't be undone?

5. INTEGRATION POINTS:
   a. Do other services depend on data this feature changes?
   b. Are there webhook contracts, API contracts, or event schemas that changed?
   c. Will channel-api, account-api, or frontend break if this deploys first?

RULES:
- Do NOT read .claude/memories/session/ or any implementation plans
- Think about production data volumes — don't assume tables are small
- Consider time-of-day deployment windows
- Be specific about lock durations and data volumes

RETURN FORMAT:
Return findings categorized as:
- ?? DEPLOY BLOCKER: Must fix before any deployment
- ?? DEPLOY RISK: Could cause issues, needs mitigation plan
- ?? DEPLOY NOTE: Good to know, no action required
Include specific migration files, job files, and estimated impact.
```

### Subagent 4: Test Quality & Coverage Auditor

**Purpose**: Review the tests created for this feature — find gaps, missing edge cases, weak assertions, and opportunities to strengthen test coverage. **This is THE MOST CRITICAL auditor** — lazy or superficial tests are more dangerous than no tests because they create false confidence. Lower-capability models (GPT-5-mini) are especially prone to writing tests that always pass but verify nothing.

**Prompt template**:
```
You are auditing the test quality and coverage for the "{{FEATURE_NAME}}" feature.
Services: {{SERVICES_AFFECTED}}

TASK:
1. Find ALL test files related to "{{FEATURE_NAME}}" in the codebase:
   - Unit tests, integration tests, route tests, job tests
   - Search in tests/ directories of affected services

2. TEST COVERAGE ANALYSIS:
   For each production file related to the feature (entities, services, repositories, routes, jobs):
   a. Does a corresponding test file exist?
   b. Are all public methods/functions tested?
   c. Are error paths tested (not just happy paths)?
   d. Flag any production code with ZERO test coverage as ?? CRITICAL

3. EDGE CASE REVIEW:
   For each tested function:
   a. Are boundary conditions tested? (empty arrays, null values, zero counts, max limits)
   b. Are multi-tenant isolation scenarios tested? (cross-account data leakage)
   c. Are concurrent/race condition scenarios tested? (if applicable)
   d. Are permission/RBAC edge cases tested? (wrong role, no role, triage role)
   e. Flag missing edge cases as ?? IMPORTANT with specific test case suggestions

4. ASSERTION QUALITY — THE MOST IMPORTANT CHECK:
   For each test file, verify:

   a. **Assertion Specificity** — the #1 lazy-test indicator:
      ? BAD: `expect(result).toBeDefined()` — a wrong result is also "defined"
      ? BAD: `expect(response.status).toBe(200)` with NO body checks — status 200 with wrong data is a bug
      ? BAD: `expect(result.length).toBeGreaterThan(0)` — doesn't verify the actual items
      ? GOOD: `expect(result.name).toBe('Expected Name')` — checks specific values
      ? GOOD: `expect(response.body).toMatchObject({ id: expect.any(String), name: 'Test' })` — verifies shape AND values
      Flag any test whose ONLY meaningful assertion is `toBeDefined()`/`toBeTruthy()` as ?? CRITICAL

   b. **Tautological Test Detection** — tests that CANNOT fail:
      ? TAUTOLOGICAL: Mock returns `{ id: '1', name: 'Test' }`, test asserts `result.id === '1'` — this tests the mock, not the code
      ? TAUTOLOGICAL: The function under test is itself mocked — you're testing Jest, not your code
      ? TAUTOLOGICAL: Test asserts on the input rather than the output
      Flag any tautological test as ?? CRITICAL — it actively hides bugs by inflating test counts

   c. Do tests verify side effects? (audit logs written, sync functions called with correct args, queue jobs enqueued with correct payload)
   
   d. Are mocks overly broad, hiding potential bugs? (e.g., mocking entire service vs specific method)
   
   e. **Mock Realism**: Do mocks return objects with ALL fields the production code accesses? A mock returning `{}` when the code reads `.name` hides a real null-reference bug.

5. TEST ISOLATION:
   a. Do tests properly clean up after themselves?
   b. Could tests interfere with each other if run in parallel?
   c. Are there global state mutations that could cause flaky tests?

6. MINIMUM TEST COUNT CHECK:
   - Service methods: =3 tests each (happy path + 2 error/edge cases)
   - Route handlers: =4 tests each (success + auth + validation + not-found)
   - Repository methods: =2 tests each (found + not-found)
   - Flag any component below minimums as ?? IMPORTANT

7. MULTI-TENANCY ISOLATION TESTS:
   - For every endpoint/query that takes account_id: is there at least ONE test that creates data for Account A, queries as Account B, and verifies data is NOT returned?
   - Missing isolation tests are ?? IMPORTANT — multi-tenancy bugs are production-critical

RULES:
- Do NOT read .claude/memories/session/ or any implementation plans
- Read BOTH the test file AND the production file it tests
- Be specific: cite exact test names, file paths, and what's missing
- For EVERY gap, provide a concrete test case: test name + what to assert + why it matters
- Ask yourself for each test: "Would this test still pass if the function returned completely wrong data?" If yes ? ?? CRITICAL

RETURN FORMAT:
Return findings categorized as:
- ?? CRITICAL: Zero test coverage, tautological tests, assertion-free tests, tests that always pass
- ?? IMPORTANT: Missing edge cases, missing negative paths, missing isolation tests, below minimum test count
- ?? MINOR: Style improvements or optional additional tests
- ?? SUGGESTED TESTS: For EVERY gap, a concrete test case description:
  "should throw ValidationError when name is empty" — calls create() with empty name, expects ValidationError with message containing 'name'
Include specific file paths and test names for each finding.
```

## Phase 8 Execution Steps

1. **Determine spec path**: Check if a requirements/spec document exists for this task
2. **Check for existing review file**: If `.claude/memories/session/phase8-review.md` already exists (from a previous run), delete it first — the `create_file` tool fails on existing files.
3. **Launch 4 Explore subagents in parallel** using the templates above (set thoroughness to "thorough")
4. **Collect all findings** from the 4 subagents
5. **Write findings to `.claude/memories/session/phase8-review.md`**:
   - Copy subagent findings VERBATIM — do NOT summarize, filter, or minimize
   - Use the combined output format below
   - If a finding seems wrong, include it anyway with a note — Phase 9 will triage
6. **Write checkpoint to `.claude/memories/session/stage-d-review.md`**

### Combined Output File Format

```markdown
# {{FEATURE_NAME}} — Independent Review

## Review Date: [today]
## Methodology: 4-subagent independent audit (spec compliance, runtime correctness, deployment risk, test quality)

---

## Subagent 1: Spec Compliance Audit

### Requirements Found: [N]
### Coverage: ? [N] | ?? [N] | ? [N] | ?? [N]

[Paste Subagent 1 findings verbatim]

---

## Subagent 2: Runtime Correctness Audit

[Paste Subagent 2 findings verbatim]

---

## Subagent 3: Deployment Risk Audit

[Paste Subagent 3 findings verbatim]

---

## Subagent 4: Test Quality & Coverage Audit

[Paste Subagent 4 findings verbatim]

---

## Combined Severity Summary

### ?? CRITICAL / DEPLOY BLOCKER
[List all critical findings from all 3 subagents]

### ?? IMPORTANT / DEPLOY RISK
[List all important findings]

### ?? MINOR / NOTES
[List all minor findings]

## Verdict
- [ ] CLEAN — No issues found
- [ ] MINOR_ISSUES — Small fixes needed
- [ ] NEEDS_WORK — Significant issues found
- [ ] CRITICAL — Blocking issues requiring immediate attention
```

## Chunked File Creation (Required for Large Reviews)

If the combined review is >200 lines, create the file in chunks:
1. Create the file with the header + Subagent 1 findings
2. Append Subagent 2 findings
3. Append Subagent 3 findings + summary

This avoids file creation failures from oversized single writes.

## Failure Modes & Mitigations

| Failure | Mitigation |
|---------|-----------|
| Subagent returns empty/incomplete results | Re-launch with more specific search hints derived from the feature name (e.g., "search for 'billing' in assistant-api/src/") — do NOT pass file lists from implementation artifacts |
| Subagent can't find feature files | Add search hints like entity names or service names to the prompt — derive these from the feature name, NOT from session memory or implementation plans |
| No spec document exists | Replace Subagent 1 with TODO/FIXME/incomplete-code scanner |
| Findings contradict each other | Include both in the file — Phase 9 will resolve |
| Review file too large to create | Use chunked creation (see above) |
