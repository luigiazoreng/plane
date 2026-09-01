---
name: phase5-execution
description: 'Full Phase 5 protocols: TDD cycle how-to, anti-laziness checklist, phase5-progress.md template, confidence rubric, finalization flow checklist, test debugging guardrails, and critical coding rules. Read at Phase 5 start — before writing any code.'
---

# Phase 5 Execution Protocols

## TDD Cycle Protocol (RED → GREEN → REFACTOR)

For each plan step that requires production code:

1. **RED** — Write the test for this component. Run:
   ```bash
   cd apps/api && python -m pytest plane/tests/.../test_x.py::TestX::test_y
   ```
   You MUST see FAILURE output. Record the failure message. If the test passes before you write production code, the test is wrong — fix it first.

2. **GREEN** — Write the minimal production code. Run the same command. You MUST see PASS output. Record it.

3. **REFACTOR** — Clean up. Re-run to confirm still passing.

4. Move to the next component's RED step.

**Two separate test runs per component are mandatory.** Writing test + code together and running once is a TDD violation — you never proved the test catches the real issue.

**Steps sem teste próprio** (migration, model puro, tipo em `packages/types`): registre
`TDD: N/A — coberto pelo Step M`, referenciando o step que de fato os exercita.

**Steps de frontend** (`apps/web|admin|space`): não há runner. Registre
`TDD: N/A (sem runner)` + `Validação: pnpm --filter <app> check:types ✅` + o cenário de browser
para o Stage UX. Nunca invente um run de teste.

---

## Anti-Laziness Checklist (run after EACH component)

Answer ALL of these before marking a test suite complete. Every parenthetical action is mandatory if triggered.

1. **Count**: How many tests did I write? — if <3 per service method → add more
2. **Specificity**: Do ALL tests have specific value assertions? — if any use only `toBeDefined()`/`toBeTruthy()` → rewrite them
3. **Negative paths**: Did I write ANY error/rejection tests? — if zero → add at least 2
4. **Isolation**: Did I test multi-tenancy account isolation? — if function touches DB → add an isolation test
5. **Downstream state**: For EVERY mutation test: did I verify downstream state with a READ after? — if no → add (rule h)
6. **Lifecycle**: Is there a lifecycle test covering the whole multi-step workflow? — if no → write one (rule i)
7. **Scenario matrix**: Is there a scenario matrix comment at the top of the test file? — if no → write it (rule j)
8. **Initial state**: For EVERY mutation test: is there a READ before to assert initial state? — if no → add (rule k)
9. **Arithmetic**: For EVERY numeric mutation: does assertion use exact arithmetic? — if `> 0` or `!= initial` → rewrite with exact values (rule l)
10. **Status transitions**: Does the feature have a status field? — if yes → add invalid-transition tests (rule m)
11. **Finalization flows**: Does the feature involve "finalize", "complete", "close", "consume", "process"? — if yes → see Finalization Checklist below

---

## Finalization / Completion Flow Checklist

Tests MUST verify ALL four for any terminal-state mutation:

- Terminal-state field changed (e.g., `is_fulfilled=true`, `status=completed`)
- Every downstream counter/balance updated correctly (e.g., `qty_on_hand` decreased, `qty_reserved` cleared)
- The "skip/zero" variant does NOT change counters that should stay unchanged
- State is visible via LIST endpoint, not just GET-by-ID

A test that only checks the immediate response body without verifying resulting state is INCOMPLETE and WILL be flagged CRITICAL in Phase 6.

---

## Phase 5 Progress Template

Overwrite `.claude/memories/session/phase5-progress.md` after EACH step (or every 2-3 files):

```markdown
# Phase 5 Progress
## Completed Steps
- [x] Step 1: [description] — files: [list]
  - TDD: RED "test name" → FAIL (reason) ✓ / GREEN → PASS ✓
- [x] Step 2: [description] — files: [list]
  - TDD: RED "test name" → FAIL (reason) ✓ / GREEN → PASS ✓
## Current Step
- [ ] Step 3: [description] — working on: [file]
## Remaining Steps
- [ ] Step 4: [description]
## Next Action
[Exactly what to do next — e.g. "Write test for ThreadService.delete()"]
## Confidence
[HIGH | MEDIUM | LOW] — [brief reason if not HIGH]
```

### Confidence Rubric

- **HIGH**: "I verified against the plan, code follows existing patterns, confident in the behavior." → Proceed.
- **MEDIUM**: "Requirement has an alternative interpretation, I deviated from the plan, or I haven't confirmed an edge case." → MUST ask developer before proceeding.
- **LOW**: "Genuinely unsure, code feels hacky, or plan contradicts existing code." → MUST ask developer with 2–3 concrete options. Do NOT proceed until HIGH.

**Rule 23 enforcement**: MEDIUM or LOW triggers `vscode/askQuestions` immediately. Common triggers: "not sure if requirement means X or Y", "existing code does it differently than the plan", "had to deviate because [reason]", "edge case not covered in plan".

---

## Test Debugging Guardrails

- Read the FULL error message and stack trace before attempting any fix
- Consulte a skill `test-debugging-pitfalls` ANTES da segunda tentativa
- **3-attempt circuit breaker**: After 3 different fixes for the same error — STOP. Find a similar passing test, copy its mock setup, try once more. If still failing, document and move to Phase 6. Never let test debugging consume the whole session.
- `column/relation does not exist` após mexer em model → rode com `--create-db`
- `Database access not allowed` → falta `@pytest.mark.django_db`
- Mock que não intercepta → patch no módulo que **usa** o símbolo, não onde ele é definido

---

## Critical Coding Rules

All mandatory. Non-negotiable.

| Regra | Detalhe |
|---|---|
| Migrations | NUNCA edite migration já existente. Crie uma nova. Ver `django-orm-patterns`. |
| Migration em base populada | `AddField` com `null=False` precisa de default (ou add nullable → backfill → apertar). |
| Escopo de tenant | Toda query filtra por workspace, e por membresia do projeto quando aplicável. Ver `multi-tenancy-security`. |
| Permissões | Use as `permission_classes` de `plane/app/permissions/`. Nunca cheque papel na mão. GUEST não escreve. |
| Campos read-only | `workspace`, `project`, `created_by`, `updated_by` sempre em `read_only_fields`. |
| Erros | Status HTTP correto; mensagem sem stack, SQL ou path interno. |
| Logging | `logging` do Django. NUNCA `print()` em código de produção. |
| Tasks assíncronas | `@shared_task` em `plane/bgtasks/`, só argumentos serializáveis, idempotente. Ver `celery-task-patterns`. |
| Serializer público | `fields` explícito. NUNCA `"__all__"` em superfície pública. |
| Debug | NUNCA deixe `print()`, `breakpoint()` ou `console.log` em produção — conserte o mock. |
| Frontend | Stores MobX conforme `mobx-swr-patterns`; componente que lê observable precisa de `observer`. |
