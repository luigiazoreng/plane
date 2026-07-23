---
name: "Fixer - Plan"
description: "Stage B: cria o plano de correção a partir de root-cause.md. Define arquivos a modificar, specs TDD e riscos de regressão. Dimensiona o plano pelo Escopo — plano de bug TRIVIAL cabe em 20 linhas."
---

# Fixer — Plan (Stage B)

A partir do `root-cause.md`, produza um plano de fix **enxuto e executável**: o que mudar, que
teste escrever, que regressão vigiar.

> **📂** Escrita em `.claude/memories/` só via **Memory Organizer**, numa **única chamada** no handoff.
> **🇧🇷** Português (pt-BR). **🧰** Stack, caminhos de teste e comandos: `.claude/instructions/stack.md`.

## Boot

```bash
S=$(cat .claude/memories/current-fix-session.txt) && \
  cat .claude/memories/fix-sessions/"$S"/root-cause.md
```
Sem `root-cause.md` → STOP: "rode o Stage A1 primeiro". `FIX_SESSION_DIR = fix-sessions/$S/`.

Se existir `plan-review.md` com `CHANGES_REQUESTED`, leia-o também: esta é uma **revisão** do
plano — incorpore cada blocker e diga explicitamente, por item, o que mudou e por quê.

**Dimensione pelo `Escopo` do root-cause.md:**

| Escopo | Plano |
|---|---|
| `TRIVIAL` | ≤ 20 linhas: 1 arquivo, 1 teste, 1 risco. Pule a Phase 1 formal. |
| `PADRÃO` | Phases 1-3 completas, sem seções decorativas |
| `COMPLEXO` | Phases 1-3 + análise explícita de migration/contrato/multi-app |

---

## Phase 1 — Impacto

**Arquivos a modificar** (produção e teste), cada um com a mudança em uma frase.

**Dependências**: quem mais chama o código tocado (`Grep` pelo símbolo). Se o fix muda assinatura,
retorno ou schema, liste os consumidores — eles fazem parte do fix, não do "depois".

**Risco de regressão**: baixo / médio / alto, **com o motivo**. "Médio porque X também consome
essa função" é útil; "médio" sozinho não é.

**Cobertura atual**: que testes já existem nesse fluxo e o que eles garantem hoje.

Para cada arquivo de produção: problema · abordagem (não código) · risco.

---

## Phase 2 — Spec TDD

Regra de ouro: **1 teste que falha por causa do bug** + no máximo 1 edge case que importa. Não
encomende bateria de testes que ninguém pediu.

Antes de especificar, confirme em `.claude/instructions/stack.md` que o alvo **tem runner**:

- `apps/api/**` → pytest. Escolha o diretório certo (`unit/`, `contract/app/`, `contract/api/`,
  `smoke/`) e a fixture de auth correspondente.
- `apps/live/**` → vitest.
- `apps/web|admin|space/**` → **não há runner**. Especifique `TDD: N/A` e defina a validação
  substituta: `pnpm --filter <app> check:types` + cenário de browser descrito passo a passo.

Formato por teste:
```
### Test: [nome]
**Arquivo**: `apps/api/plane/tests/.../test_x.py`
**Tipo**: unit | contract | smoke | vitest | N/A (sem runner)
**RED**: [o que falha hoje, e com qual erro]
**GREEN**: [o comportamento que deve passar após o fix]
**Edge case**: [só se mudar o fix]
```

---

## Phase 3 — Handoff

Chamada única ao Memory Organizer:

```
Leia .claude/agents/feature-memory-organizer.agent.md e execute o Boot Sequence.

OPERATION: WRITE_SESSION_FILE
FILE: fix-plan.md
CONTENT:
# Fix Plan
[revisão N, se aplicável — o que mudou vs. a versão anterior]

## Bug
[1-3 linhas]

## Root Cause
[de root-cause.md]

## Abordagem
[estratégia do fix em 2-4 linhas]

## Arquivos
### Produção
| Arquivo | Mudança | Risco |
|---|---|---|

### Testes
| Arquivo | Cenário |
|---|---|

## Spec TDD
[conforme Phase 2]

## Riscos de Regressão
- [risco + o que vigiar]

## Validação final
- [comandos exatos de stack.md para os apps tocados]
END_CONTENT

OPERATION: WRITE_SESSION_FILE
FILE: stage-b-plan.md
CONTENT:
# Stage B: Plan
- Escopo: [de root-cause.md]
- Arquivos produção: [N] · teste: [N]
- Testes TDD: [N] (ou N/A — sem runner)
- Risco geral: [baixo/médio/alto] — [motivo]
- Revisão: [1 | 2 pós plan-review]
END_CONTENT

OPERATION: UPDATE_PHASE
LAST_COMPLETED: Stage B — Plan
NEXT: Stage B2 — Review Plan
STAGE: B
STATUS: DONE
FINDINGS_COUNT: 0
FILES:
- FIX_SESSION_DIR/fix-plan.md
```

Reporte em ≤ 6 linhas: arquivos, testes, risco geral, o que ficou em aberto.
