---
name: e2e-test-plan
description: 'Create a focused E2E test plan for features implemented in the current task. Uses Browser MCP for browser tests and black-box-e2e harness for API tests. Scoped strictly to current implementation.'
---

# E2E Test Plan Creation

## Overview

Create a focused E2E test plan that validates the features implemented in Phase 5. Tests are scoped strictly to the current implementation — do NOT test pre-existing functionality.

## When to Use

Phase 8, after code review bugs are fixed (Phase 7).

## Process

### Step 1: Load Implementation Context

Re-read:
- `.claude/memories/session/final-plan.md` — what was planned
- `.claude/memories/session/stage-c-harden.md` — what was built and hardened

Identify user-facing features and API endpoints that need E2E validation.

### Step 2: Determine Test Type

| Change Type | Test Approach | Infrastructure |
|---|---|---|
| Backend API only | Black-box API tests | `black-box-e2e/` harness |
| Frontend UI changes | Browser tests via MCP | Browser MCP → `gem-browser-tester` |
| Full-stack (API + UI) | Both | Both |
| Channel/webhook | API + webhook sim | `black-box-e2e/` harness |

### Step 3: Define Scenarios (max 10)

For each feature, write:
```markdown
#### Scenario: [Name]
- Type: Browser | API | Both
- Preconditions: [auth state, data setup]
- Steps:
  1. [action]
  2. [action]
- Expected: [outcome]
- On failure: [what evidence to capture]
```

Include per feature:
- 1 happy path scenario
- 1 error/edge case scenario (if applicable)

#### Login Test Precondition

Any scenario that requires user authentication MUST use these credentials:
- **Email**: `lgotcfg@gmail.com`
- **Password**: `123456`

The password is reset to this value via bcrypt hash during the E2E execution phase (Phase 9, Step 0c of `e2e-test-execution` skill). When writing scenario preconditions, specify:
```markdown
- Preconditions: Logged in as lgotcfg@gmail.com / 123456 (password reset handled by Phase 9 setup)
```

Do NOT invent test user credentials. Always use the above.

### Step 4: Scope Rules

- ✅ Test features from Phase 5
- ✅ Test integration between new and existing code
- ✅ Test error cases for new endpoints/UI
- ❌ Do NOT test pre-existing features
- ❌ Do NOT write performance tests
- ❌ Do NOT exceed 10 scenarios

### Step 5: Write to Session Memory

Save to `.claude/memories/session/phase8-e2e-plan.md`:
```markdown
# E2E Test Plan

## Test Type: Browser | API | Both
## Scenarios: [count]

### Scenario 1: [name]
[full definition]

### Scenario 2: [name]
...
```

## Browser Test Planning Notes

For browser tests, plan the tool sequence:
```
navigate → wait_for → snapshot → interact → snapshot → verify
```
- Always `wait_for` after navigation
- Always `snapshot` before interaction (to get UIDs)
- Always `screenshot` on failure

## Subagent Delegation Template

When delegating browser test plan authoring:
```
"Review the E2E test plan for browser scenarios. Ensure locators use
getByRole()/getByText() patterns. Check scenarios against existing
cenários para o agente gem-browser-tester (não há Playwright neste repo). Cenários: [colar]"
```
