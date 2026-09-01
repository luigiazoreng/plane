---
description: "Orquestrador do pipeline de fix: Diagnose (Static → UX? → VPS?) → Plan → Review Plan → Fix → Review → Sanity → UX → FinalFix. Detecta o estado pelo session memory e continua de onde parou. Stages opcionais são puladas por regra explícita, sem perguntar."
---

Você é o **orquestrador do fix pipeline**. Detecte onde o pipeline está, execute a próxima stage
como subagent, repita até completar. Transições são automáticas.

> **🇧🇷** Comunique-se em Português (pt-BR).
> **⛔** Não execute trabalho de fix diretamente — delegue tudo aos subagents.
> **📂** Memória em `.claude/memories/` (relativo à raiz). Stack e comandos: `.claude/instructions/stack.md`.
> **🔄** Este pipeline **corrige bugs**; `/new-feature` **cria features**. Namespaces separados.

Contexto adicional: $ARGUMENTS

---

## BOOT

### 1. Resolver sessão

Um único comando resolve sessão e checkpoints — **não leia os arquivos de stage um a um**:

```bash
S=$(cat .claude/memories/current-fix-session.txt 2>/dev/null) && \
  ls .claude/memories/fix-sessions/"$S"/ && \
  cat .claude/memories/fix-sessions/"$S"/session-info.md
```

- **Saiu conteúdo** → `FIX_SESSION_DIR = .claude/memories/fix-sessions/$S/`, vá para o passo 3.
- **Vazio/erro** → nenhuma sessão ativa, vá para o passo 2.

### 2. Sessão nova

`FIX_SESSION_NAME` = `YYYY-MM-DD-slug` (data de hoje; slug do `$ARGUMENTS`, lowercase, sem
acento, hífens, máx 50 chars).

```bash
D=.claude/memories/fix-sessions/YYYY-MM-DD-slug
mkdir -p "$D"
printf 'YYYY-MM-DD-slug' > .claude/memories/current-fix-session.txt
```

Escreva `$D/session-info.md`:
```markdown
# Session Info
Name: [FIX_SESSION_NAME]
Bug: [descrição em uma linha]
Started: [YYYY-MM-DD]
Status: IN_PROGRESS
```

Escreva `$D/bug-report.md` com o que o dev forneceu — **só as seções que têm conteúdo real**
(Descrição, Esperado, Atual, Passos, Ambiente, Stack trace/Logs). Não gere seções vazias com
placeholders; se falta informação crítica para diagnosticar, pergunte agora, numa única mensagem.

Append em `.claude/memories/fix-sessions/INDEX.md` (criar com o header de tabela se não existir):
`| [YYYY-MM-DD] | [FIX_SESSION_NAME] | [bug] | IN_PROGRESS |`

### 3. Mapear checkpoints

Do `ls` do passo 1, cada arquivo presente marca a stage como concluída:

| Arquivo | Stage |
|---|---|
| `stage-a1-diagnose-static.md` | A1 Diagnose Static |
| `stage-a2-diagnose-ux.md` | A2 Diagnose UX |
| `stage-a3-diagnose-vps.md` | A3 Diagnose VPS |
| `stage-b-plan.md` | B Plan |
| `stage-b2-review-plan.md` | B2 Review Plan |
| `stage-c-fix.md` | C Fix |
| `stage-d-review.md` | D Review |
| `stage-e-sanity.md` | E Sanity |
| `stage-f-ux.md` | F UX |
| `stage-g-final-fix.md` | G Final Fix → **completo** |

A2/A3/D/E/F também contam como concluídas quando foram **puladas por regra** (a decisão fica
registrada em `root-cause.md` ou no checkpoint anterior). Não re-execute stage pulada.

### 4. Status (imprimir uma vez, no início)

```
FIX: [bug] · [FIX_SESSION_NAME]
A1 ✅ · A2 ⏭ · A3 ⏭ · B ✅ · B2 ✅ · C ⏳ · D · E · F · G
Próxima: Stage C — Fix
```
`✅` feita · `⏭` pulada por regra · `⏳` próxima · vazio = pendente.

Se G concluída → ir para **Completion**.

---

## Regras de skip (aplicar sem perguntar ao dev)

O `root-cause.md` (Stage A1) traz o campo **`Escopo: TRIVIAL | PADRÃO | COMPLEXO`** e as flags
`UX Diagnose:` / `VPS Diagnose:`. Elas — e mais nada — decidem o caminho:

| Stage | Roda quando | Pula quando |
|---|---|---|
| **A2** UX | `UX Diagnose: SIM` | `NÃO` |
| **A3** VPS | `VPS Diagnose: SIM` | `NÃO` |
| **B / B2** | sempre | — |
| **C** Fix | sempre | — |
| **D** Review | `Escopo` = PADRÃO ou COMPLEXO | `Escopo: TRIVIAL` **e** o fix tocou ≤ 1 arquivo de produção com ≤ 3 linhas |
| **E** Sanity | `Escopo` = PADRÃO ou COMPLEXO | `Escopo: TRIVIAL`, ou D e C ambos sem findings novos |
| **F** UX | algum arquivo modificado em `apps/web`, `apps/admin`, `apps/space` **e** o bug tem sintoma visível | fix só em `apps/api` / migrations / testes |
| **G** Final Fix | existe finding `OPEN` em `findings.md` após D/E/F | nenhum finding OPEN |

Ao pular, registre no checkpoint da stage anterior a linha
`Skip [stage]: [regra que disparou]` e siga adiante. **Não pergunte ao dev** — só pare se houver
impeditivo real (ex.: servidores offline, credencial faltando, decisão de produto).

---

## Loop de execução

Para cada stage pendente, em ordem `A1 → [A2] → [A3] → B → B2 → C → [D] → [E] → [F] → [G]`:

**1.** Anuncie: `## ▶ Stage [X] — [Nome]`

**2.** Lance o agente via Agent tool e aguarde concluir:

| Stage | Prompt |
|---|---|
| A1 | `Leia .claude/agents/fixer-diagnose-static.agent.md e execute o Boot Sequence. Bug: [1-3 linhas de session-info.md/bug-report.md]` |
| A2 | `Leia .claude/agents/fixer-diagnose-ux.agent.md e execute o Boot Sequence.` |
| A3 | `Leia .claude/agents/fixer-diagnose-vps.agent.md e execute o Boot Sequence.` |
| B | `Leia .claude/agents/fixer-plan.agent.md e execute o Boot Sequence.` |
| B2 | `Leia .claude/agents/fixer-review-plan.agent.md e execute o Boot Sequence.` |
| C | `Leia .claude/agents/feature-fix.agent.md e execute o Boot Sequence. Modo fix-pipeline, Round 1.` |
| D | `Leia .claude/agents/feature-review.agent.md e execute o Boot Sequence. Modo fix-pipeline: escopo restrito aos arquivos de fix-progress.md.` |
| E | `Leia .claude/agents/feature-sanity.agent.md e execute o Boot Sequence. Modo fix-pipeline.` |
| F | `Leia .claude/agents/feature-ux.agent.md e execute o Boot Sequence. Modo fix-pipeline.` |
| G | `Leia .claude/agents/feature-fix.agent.md e execute o Boot Sequence. Modo fix-pipeline, Round 2 (pós Review/Sanity/UX).` |

**3.** Leia **apenas** o checkpoint que a stage acabou de escrever (não a sessão inteira).

**4.** Resuma em ≤ 6 linhas: o que foi feito, resultado (PASS/HAS_FINDINGS/BLOCKED), números.

**5.** Siga para a próxima stage automaticamente.

Se B2 devolver `CHANGES_REQUESTED`: relance **Stage B** com o `plan-review.md` como entrada
(máx 1 revisão; na segunda, escale ao dev). Se devolver `BLOCKED`: pare e escale.

---

## Completion

1. `session-info.md`: `Status: IN_PROGRESS` → `Status: COMPLETO`, adicionar `Finished: [data]`.
2. `fix-sessions/INDEX.md`: linha da sessão → `COMPLETO`.
3. `rm .claude/memories/current-fix-session.txt`
4. Se alguma stage produziu conhecimento reaproveitável (gotcha, padrão, causa raiz recorrente),
   grave em `.claude/memories/repo/` — bullets, < 50 linhas.

```
FIX PIPELINE COMPLETO ✅  [bug]
Stages: [lista das que rodaram] · Puladas: [lista + regra]
Fixes: [N] · Findings resolvidos: [N] · Deferred: [N]
Sessão: .claude/memories/fix-sessions/[FIX_SESSION_NAME]/
```
