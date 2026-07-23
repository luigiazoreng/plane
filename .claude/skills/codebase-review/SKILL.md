---
name: codebase-review
description: 'Thorough codebase review skill for understanding existing code before implementation. Maps dependencies, identifies patterns, finds related tests, and builds a mental model of the affected areas.'
---

# Codebase Review

## Overview

Systematically review the existing codebase to understand the architecture, patterns, and dependencies before making any changes. This is the foundation for a bug-free implementation.

## When to Use

Use this skill as the **first step** before any implementation. Never skip this phase.

## Review Methodology

### Step 1: Identify the Scope

Determine which areas of the codebase are affected:

1. **Quais apps?** (`apps/api` Django · `apps/web` · `apps/admin` · `apps/space` · `apps/live` · `packages/*`)
2. **Which layers?** (entity, repository, service, controller, route, middleware, tests)
3. **Which existing features does this touch?**

### Step 2: Map Existing Components

For each affected service, explore:

```
Entities       → What tables/columns exist? What are the relationships?
Repositories   → What queries exist? What patterns are used?
Services       → What business logic exists? What are the dependencies?
Controllers    → What validation exists? What error handling?
Routes         → What middleware is applied? What RBAC roles?
Migrations     → What's the current DB state? Any pending changes?
Tests          → What patterns do existing tests follow? What factories exist?
```

### Step 3: Pattern Extraction

Find 2-3 similar features and document the exact patterns used:

- How are entities structured? (decorators, relations, nullable fields)
- How are services injected? (constructor injection pattern)
- How are routes defined? (middleware chain, validation)
- How are audit logs written? (transactional, field-level diffing)
- How are tests structured? (setup, factories, assertions)
- Como o isolamento é garantido? (filtro por workspace/project + permission class) → `multi-tenancy-security`

### Step 3b: Auditoria de reuso de componente (obrigatória quando toca `apps/web|admin|space`)

When the task involves creating or modifying React components/pages, you MUST audit for reuse opportunities:

1. **Search existing components**: Check `src/components/ui/`, `src/components/management/`, and `src/components/` for components that already solve the need. Key reusable components:
   - `ResourceListPage` — lists with CRUD, loading/empty/error states
   - `FilterBar` — search + configurable filter fields
   - `StatsBar` — summary statistics display
   - `StatusHandler` — loading skeletons, error and empty states
   - `ModalComponent` / `FormModal` / `ComfirmAction` — modals and confirmations
   - `Card` + subcomponents — content containers
   - `Button` — all clickable actions (6 variants, 4 sizes)
   - `Combobox` — searchable dropdowns

2. **Find similar pages**: Search for 2-3 pages that solve a similar layout problem (e.g., list page, dashboard page, form page). Document which shared components they use and which patterns they follow.

3. **Identify potential component expansion**: If an existing component covers ~70% of the need, document how it could be extended with a new prop rather than creating a new component.

4. **Flag bloat risk**: If the plan would create >3 new component files for a single page, flag it — most pages should compose existing components with <2 new files.

**Output**: Add a "Frontend Component Reuse Plan" section to the review summary listing which existing components to use and which (if any) new components are genuinely needed.

### Step 4: Dependency Graph

Map which files depend on which:

```
Route → Controller → Service → Repository → Entity
                  ↘ AuditLogService
                  ↘ WebSocket (emitRunStatus, emitCreditsUpdated)
```

### Step 5: Documentation

Create a concise summary:

1. **Files to modify**: List every file that will change
2. **Files to create**: List every new file needed
3. **Patterns to follow**: Link to existing examples
4. **Risks identified**: Anything unusual or risky
5. **Open questions**: Things to clarify before implementing

## Output Format

```markdown
## Codebase Review Summary

### Affected Files
- [file path] — [what changes]

### New Files Needed
- [file path] — [purpose]

### Patterns to Follow
- [pattern name] — see [example file]

### Risks
- [risk description]

### Questions
- [question]
```

## Parallel Exploration Strategy

Launch subagents in parallel to explore different aspects:

- **Subagent 1**: Entity layer — schemas, migrations, relationships
- **Subagent 2**: Service/Business layer — logic, dependencies, error handling
- **Subagent 3**: Test layer — existing test patterns, factories, helpers
