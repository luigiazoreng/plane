---
name: implementation-plan-finalize
description: 'Incorporate review feedback into a locked-down final implementation plan. Resolves all blockers, produces the definitive version that Phase 5 will execute.'
---

# Implementation Plan Finalize

## Overview

Take the implementation plan (Phase 2) and review feedback (Phase 3), resolve all issues, and produce the final locked plan. After this phase, the plan is frozen — no changes during implementation.

## When to Use

After Phase 3 (plan review), before any code is written.

## Process

### Step 1: Categorize Review Feedback

Read Phase 3 output. For each finding:
- **🔴 Blocker**: MUST fix before proceeding
- **⚠️ Warning**: SHOULD fix, document if skipping
- **💡 Suggestion**: Include if low effort, otherwise note and skip

### Step 2: Resolve Each Finding

For each blocker and warning:
1. Identify affected plan step(s)
2. Revise the step with the fix
3. Annotate: `[REVISED: reason]`

### Step 3: Validate After Revisions

- [ ] Step ordering still correct
- [ ] No circular dependencies introduced
- [ ] Test plan covers revised steps
- [ ] Migration still PostgreSQL + SQLite compatible
- [ ] Filtro por workspace (e membresia de projeto) presente em toda query nova
- [ ] RBAC roles assigned to all new routes

### Step 4: Produce Final Plan

Write to `.claude/memories/session/final-plan.md`:
```markdown
# Final Implementation Plan (LOCKED)

## Review Changes Applied
- [Step N]: [what changed and why]

## Implementation Steps (in order)
1. [Step: file, action, description, dependencies, tests]
2. ...

## Files to Create
- [path] — [purpose]

## Files to Modify
- [path] — [what changes]
```

### Step 5: Write Stage A Checkpoint

Write to `.claude/memories/session/stage-a-plan.md`:
```markdown
# Stage A: Plan Complete
- Steps: [count]
- Files to create: [list]
- Files to modify: [list]
- Key decisions: [list]
- Risks: [list]
```

## Rules

- Do NOT add features beyond Phase 2 scope
- Do NOT skip blocker resolution — ask developer if unsure
- The plan after this phase is FINAL — Phase 5 must follow it exactly
- If blockers cannot be resolved without developer input, use `vscode/askQuestions`
