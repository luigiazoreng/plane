# Fix-Pipeline Architecture

> Pipeline de correção de bugs deste repo (**Plane**). Orquestrado por `/fix`.
> Última revisão: 2026-07-23.

## Visão geral

10 stages, mas **só as acionadas rodam**. O `Escopo` definido no Stage A1
(`TRIVIAL | PADRÃO | COMPLEXO`) + as flags `UX/VPS Diagnose` governam os skips — as regras estão
na tabela "Regras de skip" de `.claude/commands/fix.md`, e o orquestrador aplica sem perguntar.

```
A1 → [A2] → [A3] → B → B2 → C → [D] → [E] → [F] → [G]
```
Fix TRIVIAL típico: A1 → B → B2 → C. Fix COMPLEXO: tudo.

## Arquivos

| Arquivo | Função |
|---|---|
| `.claude/commands/fix.md` | Orquestrador — boot, skips, loop de stages |
| `.claude/instructions/stack.md` | **Fonte única** de caminhos/comandos. Agentes não repetem comando inline |
| `.claude/references/sanity-domains.md` | Catálogo dos 5 domínios do Sanity, carregado seletivamente |
| `agents/fixer-diagnose-static.agent.md` | A1 — causa raiz + define `Escopo` |
| `agents/fixer-diagnose-ux.agent.md` | A2 — reprodução no browser (condicional) |
| `agents/fixer-diagnose-vps.agent.md` | A3 — dados de produção (condicional; tenta DB local antes) |
| `agents/fixer-plan.agent.md` | B — plano dimensionado pelo Escopo |
| `agents/fixer-review-plan.agent.md` | B2 — revisão do plano, calibrada pelo Escopo |

Stages C/D/E/F/G reusam os agentes `feature-*`, todos com boot dual e **guard por modo**.

## Guards por modo (fonte de bug histórico)

Os checkpoints têm nomes diferentes nos dois pipelines. Guard que exige o arquivo do pipeline
errado trava a stage — foi o que impediu as sessões de 2026-07 de passarem do Stage D:

| Agente | Modo `fix` exige | Modo `feat` exige |
|---|---|---|
| `feature-review` | `stage-c-fix.md` | `stage-b-build.md` + `task-classification.md` |
| `feature-sanity` | `stage-c-fix.md` | `stage-f-fix.md` |
| `feature-ux` | `stage-c-fix.md` | `stage-b-build.md`/`stage-f-fix.md` + `stage-h-seed.md` |

`stage-h-seed.md` e `ux-handoff.md` **não existem** no fix-pipeline — nunca exigi-los no modo fix.

## Round do Fix agent

No fix-pipeline, **Round 1 (Stage C) não tem findings** — a fonte é `fix-plan.md`. Só do Round 2
(Stage G) em diante existe `findings.md` para classificar. No feature-pipeline todos os rounds
partem de `findings.md`.

## Custo de token — decisões

- **Organizer em lote**: uma chamada por phase, com todas as operações. Cada chamada extra é um
  subagente novo carregando o arquivo do Organizer do zero.
- **Sanity seletivo**: só domínios com gatilho acionado (tipicamente 2-3, não 5).
- **Review escalado**: modo `fix` usa 1-2 subagents restritos aos arquivos do fix; modo `feat` usa
  os dois rounds completos.
- **Boot barato**: um `ls` do SESSION_DIR resolve os checkpoints; não abrir arquivo de stage que
  não será usado.

## Armadilhas do stack (Plane ≠ agents4chat)

- Backend é **Django + pytest** em `apps/api`, não Node/Jest.
- `apps/web|admin|space` **não têm runner de teste** e **não têm Playwright**. Não prometer TDD
  nem mandar rodar `npx playwright test` — validação é `check:types` + browser.
- Shell é **bash/Linux**. Nada de PowerShell.
- Não existem `assistant-api`, `channel-api`, `account-api`, `assistant-front`, TypeORM, Redux
  ou BullMQ neste repo.

## Estrutura de sessão

`current-fix-session.txt` → `fix-sessions/[slug]/` com `session-info.md`, `bug-report.md`,
`root-cause.md`, `fix-plan.md`, `plan-review.md`, `findings.md`, `current-phase.md`,
`fix-classifications.md`, `fix-progress.md`, `stage-*.md`, `sanity/`.

---

## Skills — reorganização de 2026-07-23

Skills de tecnologia **inexistente** neste repo foram movidas para
`.claude/_archive/skills-agents4chat/` (não deletadas — `.claude` está no `.gitignore`, logo
deleção seria irreversível). São elas: `typeorm-database-patterns`, `redux-toolkit-patterns`,
`bullmq-job-patterns`, `sync-architecture`, `javascript-typescript-jest`, `playwright-testing`,
`visual-audit-protocol`, `dev-servers-start`, `docker-containers-check`.

Substitutas criadas, ancoradas no código real:

| Nova skill | Substitui | Ancorada em |
|---|---|---|
| `django-orm-patterns` | typeorm-database-patterns | `plane/db/models/base.py`, `app/views/base.py` |
| `mobx-swr-patterns` | redux-toolkit-patterns | `apps/web/core/store/label.store.ts` |
| `celery-task-patterns` | bullmq-job-patterns | `plane/bgtasks/`, `plane/celery.py` |
| `dev-environment` | dev-servers-start + docker-containers-check | `docker-compose-local.yml` |

`multi-tenancy-security` foi retargetada de `account_id` para escopo por workspace/project +
as permission classes de `plane/app/permissions/` (papéis: ADMIN 20, MEMBER 15, GUEST 5).

`frontend-design` agora aponta para o guia oficial `packages/tailwind-config/AGENTS.md`
(Canvas / Surface / Layer) em vez de duplicar um design system inventado.
