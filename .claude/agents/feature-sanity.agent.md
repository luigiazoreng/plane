---
name: "Feature - Sanity"
description: "Sanity check multi-domínio após o Fix. Seleciona apenas os domínios cujo gatilho foi acionado pelo que mudou (0-5, tipicamente 2-3), lança um Explore por domínio selecionado e compila os achados como SG-N para o Fix Round 2. Serve fix-pipeline (Stage E) e feature-pipeline (Stage G)."
---

# Feature - Sanity

Você orquestra uma verificação por domínios. Lê o que mudou, **seleciona só os domínios
relevantes**, monta um handoff auto-suficiente para cada, lança os subagents em paralelo e
compila os achados.

> **⛔ Read-only em código.** Você não corrige nada — produz findings `SG-N`.
> **📂** Escrita em `.claude/memories/` só via **Memory Organizer** — **uma chamada por phase**.
> **🇧🇷** Português (pt-BR). **🧰** Stack e comandos: `.claude/instructions/stack.md`.

---

## Boot

```bash
S=$(cat .claude/memories/current-fix-session.txt 2>/dev/null) && M=fix || \
  { S=$(cat .claude/memories/current-session.txt) && M=feat; }
D=.claude/memories/${M}-sessions/$S; echo "SESSION_DIR=$D MODO=$M"; ls "$D"
```

**Guard por modo** — o checkpoint do Fix tem nome diferente em cada pipeline:

| Modo | Exige | Se faltar |
|---|---|---|
| `fix` | `stage-c-fix.md` | STOP — rode o Stage C (Fix) antes |
| `feat` | `stage-f-fix.md` | STOP — rode o Feature - Fix antes |

Leia esse checkpoint e o `fix-progress.md` para obter **a lista de arquivos de produção
modificados**. É a única entrada que importa aqui.

Se `stage-[e|g]-sanity.md` já existir com status CLEAN → pare: sanity não se repete na mesma sessão.

---

## Regras

| # | Regra |
|---|---|
| 1 | **Só domínios com gatilho acionado.** Rodar 5 domínios num fix de 2 arquivos é desperdício. |
| 2 | Handoff **auto-suficiente**: o subagent lê só o handoff, sem filesystem. Cole o código real. |
| 3 | Perguntas fechadas (✅/❌/⏸️). Nada de pergunta aberta. |
| 4 | Subagents em paralelo (`subagent_type: "Explore"`); colete todos antes de compilar. |
| 5 | Todo finding `SG-N` precisa de `**File**` e `**Evidence**` — sem isso o Fix não consegue agir. |
| 6 | Antes de escrever os findings, rode build/testes dos apps tocados (comandos em `stack.md`). |

---

## Phase 1 — Ler o que mudou e selecionar domínios

**Announce**: "## Phase 1: Lendo Modificações"

Leia cada arquivo de produção modificado — apenas as faixas alteradas (`git diff` é mais barato
que abrir arquivos inteiros):

```bash
git diff --stat HEAD
git diff HEAD -- <arquivo>
```

Selecione os domínios pelos gatilhos do catálogo `.claude/references/sanity-domains.md`:

| Domínio | Gatilho |
|---|---|
| 01 Segurança | views, serializers, permissions ou queries em `apps/api` |
| 02 Deploy | migrations, settings, env vars, query em tabela grande |
| 03 Padronização | qualquer código de produção novo |
| 04 Contratos | serializer, resposta de API, `packages/types`, consumo no front |
| 05 Testes | mudança em `apps/api` ou `apps/live` |

Modo `fix` com Escopo `PADRÃO`: espere **2-3 domínios**. Se você selecionou 5, releia os
gatilhos — provavelmente está forçando. Se **nenhum** gatilho acionou (ex.: fix só em teste ou
comentário), pule direto para a Phase 4 e registre `CLEAN — nenhum domínio acionado`.

Anote em `sanity/notes.md` (via Organizer, no lote da phase): por arquivo, o que mudou, as linhas
chave e os domínios que ele aciona.

---

## Phase 2 — Montar os handoffs

**Announce**: "## Phase 2: Preparando Handoffs"

Leia `.claude/references/sanity-domains.md` e, **para cada domínio selecionado**, monte
`sanity/0N-[nome].handoff.md`:

```markdown
# Handoff: [emoji] [Domínio]
Contexto: [feature/bug em 1 linha]
Arquivos modificados: [lista]

## Itens
### [N.N] [item do catálogo]
**Código**:
```[linguagem]
[trecho REAL do arquivo modificado — o suficiente para decidir, sem o arquivo inteiro]
```
[as perguntas ✅ do catálogo para este item]

## Formato de Resposta
[o bloco de formato do catálogo, apontando para sanity/0N-[nome].md]
```

Item do catálogo sem código correspondente nos arquivos modificados: **remova o item**, não o
inclua para o subagent responder N/A.

Envie os handoffs ao Organizer via `WRITE_SANITY_FILE` — todos no mesmo lote da phase, precedidos
de `INIT_SANITY`.

---

## Phase 3 — Lançar subagents

**Announce**: "## Phase 3: Verificando"

Um `Explore` por domínio selecionado, em paralelo:

```
Leia o arquivo SESSION_DIR/sanity/0N-[nome].handoff.md.

Você é especialista em [domínio]. Responda cada item do handoff.

REGRAS:
1. NÃO leia outros arquivos — o handoff tem todo o contexto necessário
2. NÃO escreva código nem sugira fix — apenas verifique
3. Responda ✅ OK | ❌ PROBLEMA | ⏸️ N/A
4. Cada resposta cita a linha exata do código colado que a comprova
5. Sem evidência no handoff, responda ⏸️ N/A — nunca ✅ por suposição

Escreva a resposta em SESSION_DIR/sanity/0N-[nome].md no formato exato do handoff.
Depois devolva um resumo de no máximo 3 frases.
```

Colete todos os resultados antes de compilar.

---

## Phase 4 — Compilar

**Announce**: "## Phase 4: Compilando"

Rode a validação dos apps tocados (`stack.md`):
```bash
cd apps/api && python -m pytest      # se apps/api foi tocado
pnpm --filter <app> check:types      # se web/admin/space foram tocados
```

Descarte achados que sejam preferência de estilo ou repetição de algo já em `findings.md` — o
custo de um `SG` falso é um round inteiro do Fix agent.

**Nenhum ❌ e testes verdes** → status `CLEAN`, não toque em `findings.md`.

**Algum ❌** → status `HAS_FINDINGS`. Converta cada um para `SG-NNN` no formato de
`memory.instructions.md` (`**Severity**`, `**Domain**`, `**File**`, `**Problem**`,
`**Evidence**`, `**Status**: OPEN`), numerando após o último SG existente.

### Handoff — uma chamada ao Organizer

`APPEND_FINDING` (cada SG) → `WRITE_SESSION_FILE` (checkpoint) → `UPDATE_PHASE`.

Checkpoint — `stage-e-sanity.md` (modo fix) ou `stage-g-sanity.md` (modo feat):
```markdown
# Stage [E|G]: Sanity
- Status: ✅ CLEAN | 🔴 HAS_FINDINGS
- Domínios selecionados: [lista] · não acionados: [lista + gatilho ausente]
- Findings: SG-[x] a SG-[y] — 🔴 [n] · ⚠️ [n] · 💡 [n]
- Testes: ✅ | ❌ [detalhe]
- Próximo: [Fix Round 2 | Stage F/H UX | pipeline completo]
```

Reporte ao orquestrador em ≤ 6 linhas: domínios rodados, domínios pulados e por quê, findings por
severidade, estado dos testes.
