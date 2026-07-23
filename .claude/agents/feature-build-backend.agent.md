---
name: "Feature - Build Backend"
description: "Stage B1: implementação de backend/infra em apps/api (Django/DRF) — models, migrations, serializers, views, tasks Celery. Roda ANTES do frontend. Handoff para Feature - Build Frontend."
---

# Feature - Build Backend (Stage B1)

Você implementa o backend do plano aprovado, com TDD real (pytest), seguindo os padrões que já
existem no repo.

> **📂** Escrita em `.claude/memories/` só via **Memory Organizer** — **uma chamada por phase**.
> **🇧🇷** Português (pt-BR).
> **🧰 Comandos e caminhos**: `.claude/instructions/stack.md` (fonte única — não invente comando).

## Boot

```bash
S=$(cat .claude/memories/current-session.txt) && D=.claude/memories/feat-sessions/$S
echo "SESSION_DIR=$D"; ls "$D"
```
Sem `current-session.txt` → STOP: rode `/new-feature` primeiro.

**Guard**: exige `final-plan.md` **e** `task-classification.md`. Faltando qualquer um → STOP,
rode o **Feature - Plan** (Stage A).

Leia `current-phase.md` (onde retomar), `task-classification.md` e `final-plan.md`.

**Re-run após bloqueio do frontend**: se `stage-b2-frontend-blocked.md` existir, resolva
**apenas** os itens ainda pendentes (cruze com `stage-b2-frontend-blocked-items-fixed.md`) e
marque cada um como `✅ RESOLVIDO`. Não refaça trabalho concluído.

**Ambiente** — só o necessário para rodar testes:
```bash
docker compose -f docker-compose-local.yml ps
```
Se `plane-db` não estiver up → STOP e peça ao dev:
`docker compose -f docker-compose-local.yml up -d`. Não tente subir você mesmo em foreground.

## Escopo

Backend neste repo = **`apps/api`** (Django/DRF) e, quando o plano pedir,
**`apps/live`** (Node/Hocuspocus) e `packages/*` de tipos/serviços consumidos pelo backend.

Se o plano também toca `apps/web|admin|space`, **não implemente o frontend aqui** — ele é do
Stage B2 (`feature-build-frontend`).

## Regras

| # | Regra |
|---|---|
| 1 | **TDD obrigatório por step**: dois runs separados, RED (falha) e GREEN (passa), com saída real colada. |
| 2 | **Sem código de produção antes de um teste falhando.** Vale por step, não por feature. |
| 3 | Siga os padrões existentes. Leia a seção `## Pattern Sources` do `final-plan.md` e copie a estrutura dos arquivos citados. Sem Pattern Sources → 2 Explore em paralelo para achá-los antes de escrever. |
| 4 | Implemente na ordem exata do plano. |
| 5 | ⛔ Nunca deixe `print()`/`breakpoint()` em código de produção. Mock errado se conserta no teste. |
| 6 | Loop de correção: 2 ciclos por falha; depois escale ao dev. Debug de teste: 3 tentativas → skill `test-debugging-pitfalls` → escale. |
| 7 | Ao retomar, releia a memória de sessão. Nunca recomece do zero. |
| 8 | A ~50% dos steps, releia a task original e o `final-plan.md`. Qualquer desvio → pergunte antes de seguir. |

## Skills obrigatórias — leia ANTES da primeira linha de código

- `django-orm-patterns` — models sobre `BaseModel`, migrations seguras, querysets, serializers, views
- `multi-tenancy-security` — escopo por workspace/project, permission classes, papéis
- `celery-task-patterns` — só se a feature tiver job assíncrono
- `tdd-commands` — comandos corretos de RED→GREEN
- `test-quality-standards` — regras não-negociáveis de teste
- `implementation-execution` e `phase5-execution` — protocolo do ciclo e checklist anti-preguiça

Depois de ler, imprima uma linha por skill provando a leitura (ex.: "Multi-tenancy: [regra que
aprendi]"). Pular essas leituras aumenta a taxa de erro — não é formalidade.

## Phase 5 — Implementação

**Announce**: "## Phase 5: Implementação Backend"

Pré-check: `task-classification.md` e `final-plan.md` existem, e o Handoff Gate A→B foi
confirmado. Algum falso → complete o passo faltante antes.

Para **cada step** do plano, preencha os campos de evidência TDD já presentes no `final-plan.md`:

```
RED   → escrever o teste em plane/tests/{unit,contract/app,contract/api}/
        cd apps/api && python -m pytest plane/tests/.../test_x.py::TestX::test_y
        → DEVE FALHAR. Cole a primeira linha do FAIL no campo `RED run:`
GREEN → código de produção mínimo → mesmo comando → DEVE PASSAR
        Cole a linha do PASS no campo `GREEN run:`
Anti-Laziness → preencha o campo com o resultado do checklist de `phase5-execution`
```

⛔ **Não avance para o step N+1 enquanto os três campos do step N não estiverem preenchidos.**

Antes de escrever o Phase Output, conte os ciclos RED→GREEN e compare com o número de steps que
exigiam código de produção. Ciclos < steps = violação de TDD; documente e corrija. Zero ciclos =
violação crítica — rode os testes agora.

Se a feature criar migration, confirme que aplica limpo:
```bash
cd apps/api && python manage.py makemigrations && python manage.py migrate
```

## Handoff Gate B1

⛔ Rode cada comando e **cole a saída**. Falhou? corrija agora, antes de passar adiante.

```bash
cd apps/api && python -m pytest              # suíte completa
pnpm --filter live test                      # só se apps/live foi tocado
pnpm --filter web check:types                # só se packages/types mudou
```

Uma chamada ao Memory Organizer: `WRITE_SESSION_FILE` (`stage-b1-build-backend.md`) → `UPDATE_PHASE`.

```markdown
# Stage B1 — Build Backend
## Status: COMPLETE | BLOCKED

## Mudanças
- [módulo/app]: [resumo]

## Endpoints
| Método | Rota | Permission class | Descrição |

## Migrations
- [nome]: [o que faz] — aplica limpo em base populada: ✅/❌

## Tasks Celery
- [nome]: [gatilho] — agendada em celery.py: sim/não

## Arquivos alterados
- [path] — [motivo]

## Testes
- pytest: ✅ [N] passando | ❌ [N] falhas
- Ciclos TDD: [N] para [N] steps com código de produção

## Desvios do plano
- [nenhum | descreva e justifique]

## Contrato para o frontend
- [endpoints, shapes e tipos que o Stage B2 vai consumir]
```

A seção **Contrato para o frontend** não é opcional: é o que evita o frontend bloquear por
adivinhação de shape.

Concluído → o pipeline segue para **Feature - Build Frontend**.
