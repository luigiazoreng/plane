---
name: "Feature - Build Frontend"
description: "Stage B2: implementação de frontend em apps/web|admin|space (React Router v7 + MobX + SWR). Roda DEPOIS do backend. Audita os endpoints entregues, implementa UI e stores, e pode bloquear pedindo itens faltantes ao backend."
---

# Feature - Build Frontend (Stage B2)

Você implementa o frontend do plano aprovado, consumindo o backend já entregue no Stage B1.

> **📂** Escrita em `.claude/memories/` só via **Memory Organizer** — **uma chamada por phase**.
> **🇧🇷** Português (pt-BR).
> **🧰 Comandos e caminhos**: `.claude/instructions/stack.md` (fonte única — não invente comando).

## Boot

```bash
S=$(cat .claude/memories/current-session.txt) && D=.claude/memories/feat-sessions/$S
echo "SESSION_DIR=$D"; ls "$D"
```

**Guard**: exige `final-plan.md`, `task-classification.md` e `stage-b1-build-backend.md`.
Faltando o B1 → STOP: o backend roda primeiro.

Leia `current-phase.md`, `final-plan.md` e a seção **Contrato para o frontend** do
`stage-b1-build-backend.md`.

## ⚠️ Realidade de testes neste repo

`apps/web`, `apps/admin` e `apps/space` **não têm runner de teste** — sem jest, sem vitest, sem
Playwright, sem visual-audit. Confira em `.claude/instructions/stack.md`.

**Não existe ciclo TDD aqui.** Não escreva `.spec.ts`, não mande rodar `npx jest` ou
`npx playwright test`, e não declare "testes passando". A validação disponível é:

```bash
pnpm --filter <app> check:types    # obrigatório, tem que passar
pnpm --filter <app> check:lint
pnpm --filter <app> build          # se mexeu em rotas ou build
```

Comportamento se valida no **browser**, e isso é responsabilidade do Stage H (UX). Registre no
checkpoint o que precisa ser verificado lá.

Se a lógica for testável de verdade, extraia-a para `packages/*` ou `apps/live` (que tem vitest) —
aí sim vale um ciclo RED→GREEN.

## Phase 1 — Auditoria da API

**Announce**: "## Phase 1: Auditoria da API"

Antes de escrever UI, confirme que o backend entrega o que a tela precisa:

```markdown
## API Audit
| Necessário | Endpoint | Existe? | Paginação | Filtros | Shape confere | OK? |
|---|---|---|---|---|---|---|
```

Verifique contra o código real (`apps/api/plane/app/views/**` e serializers), não contra o plano.

**Tudo OK** → siga para a Phase 5.

**Item faltando** → primeiro pergunte se o frontend consegue se adaptar (ex.: sem paginação,
carregar tudo é aceitável para volume pequeno). Só bloqueie o que for realmente impeditivo.

Para os impeditivos, escreva `stage-b2-frontend-blocked.md`:
```markdown
# Stage B2 — Frontend Blocked
| # | Item | Endpoint esperado | Detalhe | Prioridade |
## Status
⏳ Aguardando backend.
## Progresso do frontend até aqui
- [o que já foi implementado]
```
E **PARE** — o pipeline detecta o arquivo e re-executa o Stage B1 só para os itens pendentes.

## Regras

| # | Regra |
|---|---|
| 1 | `check:types` tem que passar antes do handoff. Sem exceção. |
| 2 | Siga os padrões existentes — `## Pattern Sources` do `final-plan.md`. Copie a estrutura dos arquivos citados; não invente arquitetura. |
| 3 | Implemente na ordem do plano. |
| 4 | ⛔ Nunca deixe `console.log` em código de produção. |
| 5 | Reuso antes de criação: componente novo que sobrepõe ≥70% de um existente é retrabalho. |
| 6 | Ao retomar, releia a memória de sessão. |
| 7 | A ~50% dos steps, releia a task original. Desvio → pergunte antes de seguir. |

## Skills obrigatórias — antes da primeira linha

- `mobx-swr-patterns` — stores, `observer`, `runInAction`, `fetchedMap`, services, chaves SWR
- `frontend-design` — auditoria de componente existente, design system, checklist de página nova
- `multi-tenancy-security` — o que **não** exibir e como o `workspaceSlug` entra nas chamadas
- `implementation-execution` — protocolo de execução

Após ler, imprima uma linha por skill provando a leitura.

## Phase 5 — Implementação

**Announce**: "## Phase 5: Implementação Frontend"

Ordem que evita retrabalho: **tipos** (`packages/types`) → **service** → **store MobX** →
**componente** → **rota**.

Por step:
1. Implemente conforme o plano e os padrões da skill `mobx-swr-patterns`
2. `pnpm --filter <app> check:types` → tem que passar antes do próximo step
3. Preencha o campo de evidência do step no `final-plan.md` com o resultado do `check:types`
   (e `Validação: browser pendente — [cenário]` no lugar do RED/GREEN)

### Responsivo — regras práticas

1. **Mobile-first**: layout base sem prefixo, depois `sm:` `md:` `lg:` `xl:`
2. **Touch targets** de no mínimo 44×44px
3. `overflow-x-hidden` no container principal — a página nunca rola na horizontal
4. Grid responsivo (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), não colunas fixas
5. Texto longo trunca (`truncate` / `line-clamp-[N]`)
6. Inputs em mobile ocupam `w-full`
7. Modal em mobile ocupa a tela quase inteira

### Estados obrigatórios

Toda tela que carrega dado trata os três: **carregando** (store `undefined`), **vazio**
(carregado com zero itens) e **erro**. Entregar só o caminho feliz é entrega incompleta.

## Handoff Gate B2

⛔ Rode e **cole a saída**:

```bash
pnpm --filter <app> check:types
pnpm --filter <app> check:lint
pnpm --filter <app> build     # se tocou rotas
```

Uma chamada ao Organizer: `WRITE_SESSION_FILE` (`stage-b2-build-frontend.md`) → `UPDATE_PHASE`.

```markdown
# Stage B2 — Build Frontend
## Status: COMPLETE | BLOCKED

## Apps modificados
- apps/web: [resumo]

## Rotas novas/alteradas
| Rota | Arquivo | Descrição |

## Stores e services
- [store] em core/store/[x].store.ts — registrado no root.store: ✅/❌
- [service] em core/services/[x].ts

## Componentes
- [novo | reusado de packages/ui] — [path]

## Validação
- check:types: ✅/❌
- check:lint: ✅/❌
- build: ✅/❌ | N/A
- Testes automatizados: N/A (apps/web|admin|space sem runner)

## A verificar no Stage H (UX)
- [cenário de browser 1] — [o que deve acontecer]
- [estados: loading / vazio / erro cobertos? onde ver]

## Desvios do plano
- [nenhum | descreva]
```

A seção **A verificar no Stage H** é o que substitui os testes automatizados aqui — sem ela, o
Stage UX testa às cegas.
