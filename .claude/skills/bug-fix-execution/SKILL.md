---
name: bug-fix-execution
description: 'Systematic bug and issue fixing methodology. Process issues by severity, verify each fix, enforce circuit breaker. Used after code review (Phase 7) and after E2E failures (Phase 10).'
---

# Bug Fix Execution

## Overview

Systematically fix bugs and issues found during review or testing. Process by severity, verify fixes, and enforce a 2-cycle circuit breaker to prevent infinite loops.

## When to Use

- **Phase 7**: Fix code review findings from Phase 6
- **Phase 10**: Fix E2E failures from Phase 9

## Process

### Step 1: Load the Issue List

Read from session memory:
- Phase 7: `.claude/memories/session/phase6-review.md`
- Phase 10: `.claude/memories/session/phase9-e2e-results.md`

### Step 2: Triage by Severity

Fix in this order:
1. **🔴 Critical**: Broken functionality, security holes, data leaks
2. **⚠️ Important**: Wrong behavior, missing validation, test failures
3. **💡 Minor**: Pattern violations, style issues

### Step 3: Write Regression Tests FIRST (TDD Approach — RED Step is MANDATORY)

**BEFORE fixing any issue**, write a test that reproduces the bug:
1. **Write a failing test** that demonstrates the exact broken behavior
2. **Run the test** and confirm it FAILS — **you MUST see the failure output:**
   ```bash
   cd apps/api && python -m pytest plane/tests/.../test_x.py::TestX::test_y
   ```
   Copy the failure output — this is your RED evidence. If the test passes, either:
   - Your test is wrong (not testing the right thing) — rewrite it
   - The issue doesn't actually exist — re-evaluate the finding
3. **Only then** fix the production code
4. **Run the test again** and confirm it PASSES — **you MUST see the passing output:**
   ```bash
   cd apps/api && python -m pytest plane/tests/.../test_x.py::TestX::test_y
   ```
   This is your GREEN evidence.

**⛔ TDD Verification Requirement:**
- Skipping the RED run (writing fix + test together, running once) is a TDD violation
- You MUST have TWO separate test runs per issue: one RED (fail), one GREEN (pass)
- Record each cycle: `RED: "test name" → FAIL (error message) ✓ / GREEN: "test name" → PASS ✓`

This ensures:
- The bug is captured in the test suite forever (regression protection)
- The fix is verified to actually address the root cause
- Future refactors won't silently re-introduce the bug

**Where to place the test:**
- If a relevant test file already exists, add the test case there
- If the bug is in a service/repository, add to the corresponding unit test
- If the bug is in a route/middleware, add to the E2E mock test
- Name the test descriptively: `"should reject soft-deleted keys"`, `"should reset deleted_at on re-sync"`

**Exception:** If writing a test is impractical for this specific issue (e.g., pure formatting, config change, or the test infrastructure doesn't support the scenario), document WHY in the session memory and proceed to fix.

### Step 3b: Test-vs-Code Integrity Check (MANDATORY before fixing)

**Before changing ANY code to fix a test failure, determine WHO IS WRONG — the test or the code:**

1. Read the test assertion: what behavior does it expect?
2. Read the production code: what does it actually do?
3. Determine the INTENDED behavior by checking: feature requirements, API contracts, downstream consumers, and business logic.
4. **If the test enforces wrong behavior** → fix the TEST, not the production code.
5. **If the code implements wrong behavior** → fix the CODE, then verify the test passes.
6. **If unsure** → ask the developer: "Test expects [A], code does [B]. Which is correct?"

**NEVER change production code solely to make a failing test pass without first verifying that the test's expected behavior is actually correct.** A test that enforces wrong behavior is a bug in the test, not in the code.

**Mandatory self-check (run EVERY time a test fails):**
> "Am I changing the test to match the code, or the code to match the test? Which one represents the INTENDED behavior?"
> If you cannot confidently answer, STOP and ask the developer.

### Step 4: Fix Each Issue

For each issue:
1. **Read** the affected file
2. **Understand** the root cause (not the symptom)
3. **Fix** the root cause with minimal changes
4. **Verify** the fix doesn't break related code

**CRITICAL**: If the issue is a test failure caused by jsdom limitations or missing mocks, fix the test setup — NOT the production code. Check service-specific instruction files for Known Test Pitfalls before attempting fixes.

### Step 5: Run Tests

Run **targeted tests first**, then full suite only if targeted pass:
```bash
cd [affected-service]
cd apps/api && python -m pytest plane/tests/.../test_afetado.py
# Only after targeted tests pass:
cd apps/api && python -m pytest
```

⛔ NUNCA rode a suíte completa como primeiro comando — rode o teste alvo, depois a suíte.

### Step 6: Circuit Breaker

**Max 2 fix-and-recheck cycles.** Track which cycle you're on.

- **Cycle 1**: Fix all issues, run tests. If all pass → done.
- **Cycle 2**: Fix any remaining/new failures, run tests. If all pass → done.
- **After Cycle 2**: If failures remain, STOP. Escalate to the developer:
  "N issues remain after 2 fix cycles: [list]. Recommend manual review."

### Step 7: Write to Session Memory

- Phase 7: `.claude/memories/session/stage-c-harden.md`
- Phase 10: `.claude/memories/session/phase10-fixes.md`

## Output Format

```
### Phase N Output
- Status: PASS | FAIL | ESCALATED
- Issues received: N
- Issues fixed: N
- Issues remaining: N
- Fix cycles used: [1 or 2] of 2
- Tests: ✅ All passing | ❌ N failures
- Session memory: [file path]
```

## Rules

- Fix root causes, not symptoms
- Never introduce new features while fixing bugs
- Rode o teste alvo primeiro (`python -m pytest <arquivo>::<classe>::<teste>`), depois `python -m pytest`
- Max 2 cycles then escalate — never loop forever
- Keep fixes minimal — change only what's necessary
- **NEVER** add `console.log` or debug logging to production `src/` files
- **NEVER** modify production code to work around test infrastructure issues — fix the mock/setup instead
- Teste falhando: consulte a skill `test-debugging-pitfalls` ANTES da segunda tentativa
