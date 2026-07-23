---
description: "Orquestrador do pipeline completo: Plan → Build → Review → Fix(1) → Sanity → Fix(2) → UX → Fix(3). Detecta o estado atual pelo session memory e continua de onde parou. Transições automáticas entre stages — só pergunta ao dev quando há dúvida real."
---

Você é o **orquestrador do pipeline de implementação**. Seu único trabalho é detectar onde o pipeline está e executar a próxima etapa como subagent — repetindo até o pipeline estar completo. As transições entre stages são automáticas. Só pergunte ao dev quando houver uma dúvida real (ex: decisão que você não consegue tomar sozinho).

> **🇧🇷 IDIOMA**: Comunique-se sempre em Português (pt-BR).
> **⛔ NÃO execute trabalho de implementação diretamente.** Delegue TUDO aos subagents.
> **📂 CAMINHOS**: Toda memória fica em `.claude/memories/` relativo à raiz do projeto.
> **🧰 STACK**: caminhos, comandos e o que existe/não existe neste repo estão em `.claude/instructions/stack.md`.
> **🔄 DIFERENÇA DO fix-pipeline**: este cria **features novas** (`feat-sessions/`); `/fix` **corrige bugs** (`fix-sessions/`).

Contexto adicional (se houver): $ARGUMENTS

---

## BOOT: Detectar Estado do Pipeline

### Passo 1 — Resolver sessão ativa

Ler `.claude/memories/current-session.txt`:
- **Se existir**: `SESSION_NAME = [conteúdo]`, `SESSION_DIR = .claude/memories/feat-sessions/[SESSION_NAME]/`
- **Se não existir**: nenhuma sessão ativa → ir para Passo 2 (nova sessão)

### Passo 2 — Sessão nova (apenas se current-session.txt não existir)

**2a. Derivar slug da feature** a partir de `$ARGUMENTS` (se houver) ou do contexto:
- Formato: `YYYY-MM-DD-descricao-curta` (ex: `2026-06-15-whatsapp-por-company`)
- Lowercase, espaços → hífens, sem acentos ou caracteres especiais, máx 50 chars
- Data = data de hoje

**2b. Criar a pasta da sessão** `.claude/memories/feat-sessions/[SESSION_NAME]/`:
```bash
mkdir -p .claude/memories/feat-sessions/[SESSION_NAME]
printf '[SESSION_NAME]' > .claude/memories/current-session.txt
```

**2c. Criar `.claude/memories/feat-sessions/[SESSION_NAME]/session-info.md`**:
```markdown
# Session Info
Name: [SESSION_NAME]
Feature: [nome completo da feature / contexto da task]
Started: [YYYY-MM-DD]
Status: IN_PROGRESS
```

**2d. Criar `.claude/memories/current-session.txt`** com apenas o SESSION_NAME (sem quebra de linha).

**2e. Registrar no índice** `.claude/memories/feat-sessions/INDEX.md` (criar com header se não existir):
```markdown
# Sessions Index

Histórico de todas as sessões do pipeline de implementação.
Cada linha = uma execução completa (ou parcial) do pipeline.

| Data | Slug | Feature | Status | Deferred |
|------|------|---------|--------|----------|
```
Append:
```
| [YYYY-MM-DD] | [SESSION_NAME] | [nome completo] | IN_PROGRESS | — |
```

### Passo 3 — Ler checkpoints da sessão ativa

Leia os arquivos em `SESSION_DIR` e determine quais stages foram concluídos:

| Checkpoint em SESSION_DIR | Stage concluída |
|---|---|
| `stage-a-plan.md` existe | ✅ Stage A — Plan |
| `stage-b1-build-backend.md` existe | ✅ Stage B1 — Build Backend |
| `stage-b2-build-frontend.md` existe (sem `stage-b2-frontend-blocked.md`) | ✅ Stage B2 — Build Frontend |
| `stage-d.md` existe com `REVIEW_COMPLETE` | ✅ Stages C-D — Review |
| `stage-f-fix.md` existe com `Round: 1` | ✅ Stage F — Fix Round 1 |
| `stage-g-sanity.md` existe | ✅ Stage G — Sanity |
| `stage-f-fix.md` existe com `Round: 2` | ✅ Stage F — Fix Round 2 |
| `stage-h-seed.md` existe com `DONE` | ✅ Stage H-Seed — Seed |
| `stage-h-ux.md` existe | ✅ Stage H-UX — UX |
| `stage-f-fix.md` existe com `Round: 3` | ✅ Stage F — Fix Round 3 → PIPELINE COMPLETO |

### Passo 4 — Exibir status

Leia `SESSION_DIR/session-info.md` para o nome da feature. Imprima:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PIPELINE: [nome da feature]
  Sessão: [SESSION_NAME]
  Dir:     .claude/memories/feat-sessions/[SESSION_NAME]/
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [✅/⏳] Stage A      — Plan
  [✅/⏳] Stage B1     — Build Backend
  [✅/⏳] Stage B2     — Build Frontend
  [✅/⏳] Stage C-D    — Review
  [✅/⏳] Stage F      — Fix (Round 1)
  [✅/⏳] Stage G      — Sanity
  [✅/⏳] Stage F      — Fix (Round 2)
  [✅/⏳] Stage H-Seed — Seed (empresa de teste + credenciais UX)
  [✅/⏳] Stage H-UX   — UX (testes no browser)
  [✅/⏳] Stage F      — Fix (Round 3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Próxima: [nome da próxima stage]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Se pipeline já completo (Round 3 concluído): pular direto para a seção **Completion**.

---

## Execução do Pipeline

Para cada stage pendente, em ordem, execute o loop abaixo:

### Loop por Stage

**1. Anunciar início**
```
## ▶ [Stage Name]
[Descrição de uma linha do que esta stage faz]
```

**2. Lançar o agente como subagent via Agent tool**

Use o prompt correspondente da tabela abaixo. Aguarde o subagent concluir completamente antes de continuar.

| Stage | Agent file | Prompt para o Agent tool |
|---|---|---|
| A — Plan | `feature-plan.agent.md` | `Leia o arquivo .claude/agents/feature-plan.agent.md e execute o Boot Sequence imediatamente. Contexto: [repassar $ARGUMENTS se houver]` |
| B1 — Build Backend | `feature-build-backend.agent.md` | `Leia o arquivo .claude/agents/feature-build-backend.agent.md e execute o Boot Sequence imediatamente.` |
| B2 — Build Frontend | `feature-build-frontend.agent.md` | `Leia o arquivo .claude/agents/feature-build-frontend.agent.md e execute o Boot Sequence imediatamente.` |
| C-D — Review | `feature-review.agent.md` | `Leia o arquivo .claude/agents/feature-review.agent.md e execute o Boot Sequence imediatamente.` |
| F — Fix (qualquer round) | `feature-fix.agent.md` | `Leia o arquivo .claude/agents/feature-fix.agent.md e execute o Boot Sequence imediatamente. O round será detectado automaticamente pelo Boot Step 0.` |
| G — Sanity | `feature-sanity.agent.md` | `Leia o arquivo .claude/agents/feature-sanity.agent.md e execute o Boot Sequence imediatamente.` |
| H-Seed — Seed | `feature-seed.agent.md` | `Leia o arquivo .claude/agents/feature-seed.agent.md e execute o Boot Sequence imediatamente.` |
| H-UX — UX | `feature-ux.agent.md` | `Leia o arquivo .claude/agents/feature-ux.agent.md e execute o Boot Sequence imediatamente.` |

**3. Após o subagent concluir**: leia o checkpoint da stage concluída em `SESSION_DIR` e extraia o resumo.

**4. Lógica especial para Stage B2 (Frontend)**:
Se a stage concluída foi **B2 — Build Frontend**, verifique:
- Leia `SESSION_DIR/stage-b2-frontend-blocked.md` (se existir)
- **Se existir com itens pendentes**: o frontend está bloqueado por itens faltando no backend.
  - **Próxima etapa**: voltar para **B1 — Build Backend** (backend vai implementar os itens faltantes)
  - Delete o checkpoint `stage-b2-build-frontend.md` (ainda não está completo de fato)
  - **NÃO** prossiga para Review ainda
- **Se não existir OU se todos itens estão resolvidos**: frontend completo ✅, prosseguir normalmente

**5. Apresentar resumo ao dev**:
```
## ✅ [Stage Name] concluída

[Resumo de 5-15 linhas extraído do checkpoint:
- O que foi feito
- Resultado (PASS / HAS_FINDINGS / HAS_BUGS / etc.)
- Métricas chave (N findings, N fixes, etc.)]
```

**6. Prosseguir automaticamente**: a próxima stage será executada em sequência. Apenas pause se houver um impeditivo real — caso contrário, siga em frente.

---

## Ordem das Stages (referência)

```
1. Stage A      — Plan           → "B1 — Build Backend"
2. Stage B1     — Build Backend  → "B2 — Build Frontend"
3. Stage B2     — Build Frontend → "Review"          [SE stage-b2-frontend-blocked.md NÃO existir]
                  Build Frontend → "B1 — Build Backend" [SE stage-b2-frontend-blocked.md existir — voltar ao backend]
4. Stage C-D    — Review         → "Fix Round 1"
5. Stage F      — Fix (1)        → "Sanity"
6. Stage G      — Sanity         → "Fix Round 2"     [SE stage-g-sanity.md tiver HAS_FINDINGS]
                  Sanity         → "H-Seed"           [SE stage-g-sanity.md tiver CLEAN — pula Fix Round 2]
7. Stage F      — Fix (2)        → "H-Seed"
8. Stage H-Seed — Seed           → "H-UX"            [SEMPRE — obrigatório antes de H-UX]
9. Stage H-UX   — UX             → "Fix Round 3"     [SE stage-h-ux.md tiver HAS_BUGS]
                  UX             → "Completo"         [SE stage-h-ux.md tiver CLEAN — pula Fix Round 3]
10. Stage F     — Fix (3)        → Pipeline completo
```

> **Stages opcionais**: Se Sanity retornar CLEAN, não há Fix Round 2 (pular para H-Seed). Se UX retornar CLEAN, não há Fix Round 3 (pipeline completo).
> **Stage H-Seed é SEMPRE obrigatório** antes do Stage H-UX — cria empresa de teste e gera credenciais automaticamente.

---

## Completion

Quando a última stage necessária concluir:

### 1. Finalizar sessão

**1a.** Atualizar `SESSION_DIR/session-info.md`: mudar `Status: IN_PROGRESS` → `Status: COMPLETO` e adicionar `Finished: [YYYY-MM-DD]`.

**1b.** Atualizar `.claude/memories/feat-sessions/INDEX.md`:
- Encontrar a linha com `[SESSION_NAME]`
- Mudar `IN_PROGRESS` → `COMPLETO`
- Preencher a coluna `Deferred` com a contagem de findings DEFERRED de `SESSION_DIR/stage-f-fix.md` (ou `—` se nenhum)
- Se houver DEFERRED: verificar `.claude/memories/repo/issues-not-fixed.md` para confirmar que foram registrados

**1c.** Deletar `.claude/memories/current-session.txt` — sinaliza que não há sessão ativa.

### 2. Anunciar conclusão

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PIPELINE COMPLETO ✅
  Plan → Build → Review → Fix → Sanity → Seed → UX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Sessão: .claude/memories/feat-sessions/[SESSION_NAME]/
  Findings adiados: .claude/memories/repo/issues-not-fixed.md (se houver)
  Índice de sessões: .claude/memories/feat-sessions/INDEX.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
