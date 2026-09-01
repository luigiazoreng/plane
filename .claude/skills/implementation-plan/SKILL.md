---
name: implementation-plan
description: 'Create a detailed, ordered implementation plan with specific file paths, code approach, test strategy, and risk assessment. Used after codebase review to define the exact steps before coding.'
---

# Implementation Plan

## Overview

Create a step-by-step implementation plan based on the codebase review. The plan defines exactly what to build, in what order, and how to test it.

## When to Use

Use this skill **after** the codebase review is complete and you have a clear understanding of the existing codebase.

## Clarify Before Planning (MANDATORY)

Before writing the plan, check if any of these are unclear:
- **Scope**: Which services are affected? Backend only, or frontend too?
- **Business rules**: What should happen in edge cases? (e.g., duplicates, missing data, concurrent access)
- **Architecture**: Are there multiple valid approaches? (e.g., sync vs async, new entity vs extending existing)
- **Permissions**: Which roles should access new features?
- **Breaking changes**: Will this affect existing API consumers?

If ANY of these are ambiguous, use `#tool:vscode/askQuestions` to ask the developer with clear numbered options. Do NOT guess — bad assumptions cascade into the entire plan and are expensive to fix later.

## Plan Structure

### 1. Summary

One paragraph describing what we're implementing and why.

### 2. Prerequisites

- [ ] Migrations needed? (describe schema changes)
- [ ] New dependencies to install?
- [ ] Environment variables to add?
- [ ] External service changes?

### 3. Implementation Steps

Each step must include:

```markdown
#### Step N: [Action]
- **File**: [exact file path]
- **Action**: create | modify | delete
- **Description**: What to do and why
- **Depends on**: Step X (or "none")
- **Pattern reference**: [link to similar existing file]
- **Tests**: What tests to write for this step
```

### 4. Ordering Rules

1. **Entities first** — DB schema must exist before anything else
2. **Migrations second** — Run migration to create tables
3. **Repositories third** — Data access layer
4. **Services fourth** — Business logic (depends on repositories)
5. **Controllers fifth** — Request handling (depends on services)
6. **Routes sixth** — Wire up endpoints
7. **Tests BEFORE each layer** — For each layer above, write or update its tests first (confirm they fail), then write the production code to make them pass
8. **Frontend last** — After backend is stable

### 5. Migration Plan

If database changes are needed:

```markdown
- Migration name: `{timestamp}-{DescriptiveName}`
- Tables affected: [list]
- Columns added/modified: [list]
- PostgreSQL + SQLite compatibility: [notes]
- Rollback strategy: [how to revert]
```

### 6. Testing Strategy

```markdown
- Unit tests: [what to test, which factories to use]
- Integration tests: [API endpoint tests]
- Edge cases: [list specific edge cases]
- Multi-tenancy: [cross-account isolation tests]
```

### 7. Risk Assessment

```markdown
| Risk | Impact | Mitigation |
|------|--------|------------|
| [description] | High/Medium/Low | [mitigation strategy] |
```

## Plan Quality Checklist

Before finalizing the plan, verify:

- [ ] Every new file has a pattern reference from existing code
- [ ] Escopo por workspace/project tratado em toda query, com permission class definida
- [ ] RBAC permissions are defined for new routes
- [ ] Audit logging is planned for mutations
- [ ] Migration supports both PostgreSQL and SQLite
- [ ] Test coverage plan exists for each component
- [ ] No existing migration is being modified
- [ ] Timestamp columns use default patterns
- [ ] **Frontend component reuse**: Every frontend step specifies which EXISTING component to use (ResourceListPage, FilterBar, StatsBar, etc.) — new component files are created only if justified
- [ ] **Frontend visual quality**: Every new page/component step includes entrance animation, all 3 data states (loading/empty/error), and follows the design system (see `frontend-design` skill)

## Regras de planejamento de frontend (quando toca `apps/web|admin|space`)

When the plan includes frontend work, these additional rules apply:

1. **Specify reusable components**: Each frontend step MUST name which existing shared component(s) to use. The plan reviewer (Phase 3) will reject steps that create new components when existing ones suffice.
2. **Component creation budget**: If the plan creates >3 new component files for a single page, justify each one. Most pages should need ≤1 new component file (the page itself) by composing existing shared components.
3. **Reference a similar page**: Each frontend step should reference a similar existing page as the pattern to follow (e.g., "Follow ThreadsMgmtPage pattern for filter + list layout").
4. **Design system compliance**: The plan must note: colors from CSS vars/Tailwind tokens, motion.div entrance animations, loading/empty/error states, lucide-react icons only.

## Output Format

The plan should be a structured markdown document that can be followed step-by-step during implementation. Each step should be atomic — completable independently before moving to the next.
