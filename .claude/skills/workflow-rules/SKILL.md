---
name: workflow-rules
description: 'Full text of the three most complex mandatory workflow rules: Rule 18 (TDD mandatory), Rule 23 (ask questions checkpoints), and Rule 28 (TDD structural gate). Read at Phase 5 start for any non-trivial implementation. Also referenced from the compact rules table in the agent file.'
---

# Workflow Rules — Full Detail

The agent file's mandatory rules section is a compact table. This skill contains the complete text for Rules 18, 23, and 28, which are too nuanced to fit in a table row.

---

## Rule 18 — TDD is MANDATORY for ALL code changes

**Write the test BEFORE the implementation — no exceptions.**

For each component (service method, route handler, utility function):
1. Write or update its test first
2. **Run it and observe FAILURE (RED)** — record the failure output
3. Write the minimal production code to make it pass
4. **Run it and observe PASS (GREEN)** — record the pass output
5. Refactor if needed, re-run to confirm still passing

**Two separate test runs are required** per component — one RED, one GREEN. Writing test + code together and running once is a TDD violation because you never proved the test actually catches the issue.

This applies to:
- Phase 5: new feature code
- Phase 7: bug fixes
- Phases 9 and 10: review-driven fixes

Even "obvious" one-line fixes require a failing test first. The test IS the proof that the fix works.

---

## Rule 23 — Ask questions instead of guessing

**MANDATORY checkpoints** where you MUST use `vscode/askQuestions`:

**Phase 2 (before planning)**: After codebase review, present your understanding of the task to the developer:
- "Here's what I think you're asking me to build: [1-3 sentence summary]"
- "I plan to change: [services/areas]. Anything I'm missing or should NOT touch?"
- "I identified these edge cases: [list]. Handle all, or are some out of scope?"
- "I see two approaches: A) [approach] B) [approach]. Which do you prefer?" (if applicable)
- "I'm assuming [X, Y, Z]. Correct?"

**Wait for developer response before writing the plan.** This prevents building the wrong thing.

**Phase 5 (mid-implementation)**: If at ANY point you feel uncertain about the correct behavior, the right approach, or whether a requirement means X or Y — STOP coding and ask. Do NOT resolve ambiguity by guessing.

**When stuck for >5 minutes on ANY decision**: That's the signal you need developer input.

**Question format**: Always present 2-4 concrete options with brief descriptions of what behavior each would produce. Never ask open-ended "what should I do?" questions.

---

## Rule 28 — TDD Structural Gate

**No production code without a prior failing test run. Enforced PER STEP, not per feature.**

For each plan step that produces production code:

1. Write the test(s) for that step
2. Rode `cd apps/api && python -m pytest plane/tests/.../test_x.py::TestX::test_y` — **tem que falhar** (RED)
3. Record failure in `phase5-progress.md`
4. Write the minimal production code
5. Run the same test — it **MUST** pass (GREEN)
6. Record pass in `phase5-progress.md`
7. **Before starting Step N+1**: verify Step N has RED+GREEN evidence. If not — STOP, run tests now.

**Explicitly invalid rationalizations** (these are the phrases used when the rule was violated in real sessions):
- "large scope"
- "efficiency"
- "I'll run tests at the end"
- "backend changes first"
- "it's a simple change"
- "the implementation is obvious"

**Exceção 1**: model, migration e tipo puro não exigem ciclo RED→GREEN próprio — são exercitados
pelos testes da view/serializer/task que os usa. Mas essa view/serializer/task **precisa** do
ciclo dela antes do próximo step.

**Exceção 2**: `apps/web`, `apps/admin` e `apps/space` **não têm runner de teste** neste repo
(ver `.claude/instructions/stack.md`). Lá o gate é `pnpm --filter <app> check:types` + cenário de
browser registrado para o Stage UX. Declarar RED/GREEN nesses apps é relatório falso — não faça.

**Required format in phase5-progress.md**:
```markdown
- [x] Step N: [description]
  - TDD: RED "test name" → FAIL (reason) ✓ / GREEN → PASS ✓
  - Files: [production files] | Tests: [test files]
```

For entity/migration/type steps:
```
  - TDD: N/A (entity/migration/type — tested via Step M)
```

**Phase 5 Output MUST include**: `TDD Cycles: [N] RED→GREEN cycles for [M] plan steps`. If N < (M minus entity/migration/type steps), Phase 6 MUST flag this as 🔴 CRITICAL.

**If you catch yourself writing production code for 2+ steps without a test run**: You are in VIOLATION. Stop immediately. Go back and run the pending tests, record evidence, then resume.
