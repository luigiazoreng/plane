---
name: e2e-final-verification
description: 'Final E2E verification pass. Re-runs all tests to confirm fixes work and no regressions occurred. Produces the definitive go/no-go report.'
---

# E2E Final Verification

## Overview

Re-run all E2E tests after fixes to confirm everything works. This is the last quality gate. Produce a go/no-go report.

## When to Use

Phase 11, after E2E issues are fixed (Phase 10). Also runs when Phase 9 had all tests passing (confirmation pass).

## Process

### Step 0: Verify Dev Environment

Before re-running tests, verify all services are still running on their correct ports. Services may have crashed during Phase 9/10 fixes.

Health-check each service with a retry-based curl:
```bash
curl -s --retry 5 --retry-delay 2 --retry-connrefused http://localhost:3000/health
curl -s --retry 5 --retry-delay 2 --retry-connrefused http://localhost:3002/health
curl -s --retry 5 --retry-delay 2 --retry-connrefused http://localhost:3001/health
curl -s --retry 5 --retry-delay 2 --retry-connrefused http://localhost:3000
```

If any service does NOT respond after retries:
1. Libere a porta: `fuser -k <porta>/tcp`
2. Peça ao dev para reiniciar noutro terminal: `pnpm --filter <app> dev`
3. Re-run the health check to confirm it's up

**Do NOT re-reset login credentials** — the password was already set in Phase 9 (Step 0c of `e2e-test-execution` skill). Only re-run the password reset if Phase 10 modified authentication code.

### Step 1: Run Unit/Integration Tests

```bash
cd [affected-service]
cd apps/api && python -m pytest
```

All tests must still pass. Stop and fix regressions before proceeding.

### Step 2: Re-run ALL E2E Tests

Re-execute every scenario from Phase 8 plan (not just fixed ones):
- API tests: run directly
- Browser tests: delegate to `gem-browser-tester` (same template as Phase 9)

### Step 3: Compare Against Phase 9

- Previously failing → now passing? ✅ Fixed
- Previously passing → still passing? ✅ No regression
- Previously passing → now failing? 🔴 Regression — escalate
- Previously failing → still failing? 🔴 Not fixed — escalate

### Step 4: Check for Code Quality

- Run TypeScript compilation check (look for errors in problems panel)
- Verify no `console.log` left in production code
- Verify no TODO/FIXME left behind
- Verify no debug code or hardcoded test values

### Step 5: Final Report

```markdown
## Final Verification Report

### Status: ✅ READY | ⚠️ PARTIAL | 🔴 NOT READY

### Unit/Integration Tests
- [N] suites, [N] tests — ✅ all passing | ❌ details

### E2E Tests
| Scenario | Phase 9 | Phase 11 | Verdict |
|---|---|---|---|
| [name] | PASS/FAIL | PASS/FAIL | ✅/🔴 |

### Code Quality
- TypeScript: ✅ clean | ❌ N errors
- console.log: ✅ none | ❌ found in [files]
- TODOs: ✅ none | ❌ N remaining

### All Files Changed
- [path] — [description]
```

### Step 6: Update Repo Memory

If new patterns or gotchas were discovered, update `.claude/memories/repo/`:
- Keep entries as concise bullet points
- Don't duplicate existing notes

### Step 7: Write Stage D Checkpoint

Save to `.claude/memories/session/stage-d-validate.md`.

### Step 7b: Git Commit (if requested by developer)

If the developer has previously asked for commits, create one final commit encompassing all changes:
```bash
git add -A && git commit -m "<description of full feature>"
```
Do NOT open a PR. Do NOT push unless explicitly asked.

## Go/No-Go Criteria

- **✅ READY**: All tests pass, zero TS errors, no critical issues
- **⚠️ PARTIAL**: Critical tests pass, minor/cosmetic issues documented
- **🔴 NOT READY**: Critical failures remain — escalate to developer

## Rules

- If ANY critical test fails → NOT READY
- If ANY regression found → NOT READY
- Do NOT fix code in this phase — if issues found, escalate
- Always update repo memory with discoveries
- This is the LAST phase — deliver report and stop

## Step 8: Write Retrospective

As the absolute last action, write `.claude/memories/session/retrospective.md` with honest answers to these questions:

```markdown
# Retrospective

## Execution Quality
- Which phase took the most attempts/retries? Why?
- Which subagent prompt had to be re-launched? What was wrong with the original?
- Were any skill files confusing or missing information? Which ones?

## Instruction Clarity
- Which instruction was ambiguous or hard to follow? (quote it)
- Did the task classification feel correct? Would you reclassify now?
- Were any steps unnecessary for this task? Which ones?

## Environment Issues
- Did any dev environment command fail? Which one and what was the error?
- Did the login credential reset work on first try?
- Did any service crash during testing? Which one?

## What Would Help Next Time
- What information was missing that you had to discover yourself?
- What pattern or shortcut did you find that should be documented?
- Rate your confidence in the final result: HIGH | MEDIUM | LOW — why?
```

Answer every question. Write "N/A" if a question doesn't apply, not blank. This file will be reviewed by a senior engineer or higher-capability model to improve future instructions.
