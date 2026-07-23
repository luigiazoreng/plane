---
name: implementation-plan-review
description: 'Review and validate an implementation plan before execution. Checks for missing edge cases, security concerns, pattern compliance, and migration compatibility. Uses parallel subagents for thorough review.'
---

# Implementation Plan Review

## Overview

Critically review the implementation plan before executing it. This phase catches design mistakes that are expensive to fix later.

## When to Use

Use this skill **after** the implementation plan is created and **before** any code is written.

## Review Dimensions

### 1. Pattern Compliance Review

Verify the plan follows existing project patterns:

- [ ] Entity structure matches existing entities (decorators, naming, relations)
- [ ] Service uses constructor injection (same pattern as existing services)
- [ ] Validação feita no serializer do DRF (`validate_<campo>` / `validate`), não na view
- [ ] Routes apply correct middleware chain (auth → RBAC → handler)
- [ ] Erros retornam o status HTTP correto, sem vazar stack, SQL ou path interno
- [ ] Audit logging is inside transactions (not separate operations)

### 2. Security & Multi-Tenancy Review

- [ ] Toda query filtra por workspace (e por membresia do projeto quando aplicável)
- [ ] Tenant nunca vem do corpo do request — vem da URL já validada pela permission class
- [ ] RBAC roles are correctly assigned to routes
- [ ] Input validation exists for all user inputs
- [ ] No sensitive data in logs or responses
- [ ] `triage` role restrictions enforced if applicable

### 3. Migration Compatibility Review

- [ ] Migration is a NEW file (not modifying existing)
- [ ] SQL works on both PostgreSQL and SQLite
- [ ] `created_at`/`updated_at` defaults are NOT modified on existing tables
- [ ] Foreign keys use correct `ON DELETE` action (CASCADE, SET NULL, RESTRICT)
- [ ] Indexes are appropriate for query patterns
- [ ] Rollback (`down`) migration is implemented

### 4. Edge Cases & Error Handling

- [ ] What happens if the entity doesn't exist? (404)
- [ ] What happens if the user lacks permission? (403)
- [ ] What happens on duplicate creation? (409)
- [ ] What happens with invalid input? (400 with descriptive error)
- [ ] What happens on DB constraint violation?
- [ ] What about race conditions? (concurrent operations)

### 5. Test Coverage Review

- [ ] Unit tests for service layer business logic
- [ ] API tests for controller/route layer
- [ ] Factory functions created for new entities
- [ ] Edge case tests (not found, unauthorized, invalid input)
- [ ] Multi-tenancy isolation tests (different accounts can't see each other's data)

### 6. Completeness Review

- [ ] No missing steps in the sequence
- [ ] Dependencies between steps are correct
- [ ] Frontend changes account for loading states and errors
- [ ] WebSocket events emitted where needed
- [ ] Webhook callbacks handled if applicable

## Parallel Review Strategy

Launch subagents to review different aspects simultaneously:

```
Subagent 1: Pattern and convention compliance
Subagent 2: Security, multi-tenancy, and RBAC
Subagent 3: Migration compatibility and edge cases
```

## Output Format

```markdown
## Plan Review Results

### ✅ Approved
- [aspect that looks good]

### ⚠️ Issues Found
- [issue description] → [suggested fix]

### 🔴 Blockers
- [critical issue that must be fixed before implementation]

### Revised Steps (if any)
- Step N revised: [what changed and why]
```
