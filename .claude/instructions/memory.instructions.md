# Memória do Pipeline

> Este arquivo é carregado em **toda** sessão — mantenha-o curto. O protocolo detalhado de
> escrita (formatos, anti-duplicata, operações) vive em
> `.claude/agents/feature-memory-organizer.agent.md` e só é lido quando o Organizer roda.

## Caminhos

Tudo em `.claude/memories/`, **relativo à raiz do repo**. Nunca `/memories/` (absoluto).

```
.claude/memories/
  current-session.txt        → SESSION_DIR     = feat-sessions/[conteúdo]/
  current-fix-session.txt    → FIX_SESSION_DIR = fix-sessions/[conteúdo]/
  feat-sessions/INDEX.md · fix-sessions/INDEX.md
  repo/                      → conhecimento entre sessões + issues-not-fixed.md
```

Resolução de sessão (todo agente, no boot): ler `current-fix-session.txt`; se não existir, ler
`current-session.txt`; se nenhum existir, parar e pedir `/fix` ou `/new-feature`.

## Arquivos permitidos numa pasta de sessão

`session-info.md` · `bug-report.md` · `root-cause.md` · `fix-plan.md` · `plan-review.md` ·
`findings.md` · `current-phase.md` · `fix-classifications.md` · `fix-progress.md` ·
`ux-test-credentials.md` · `stage-*.md` · `sanity/`

**Nada fora dessa lista.** Proibidos: `retrospective.md` (vai numa seção de `stage-d*.md`),
`phase1-classifications.md` → `fix-classifications.md`, `phase2-fixes.md` → `fix-progress.md`,
`sanity-*.md` na raiz → `sanity/`, pasta `handoffs/` → `sanity/`.

`findings.md`, `sanity/` e `current-phase.md` ficam **sempre** em SESSION_DIR, **nunca** em `repo/`.
`repo/` guarda só conhecimento persistente — inclusive `issues-not-fixed.md`.

## Escrita de memória: via Organizer, em lote

Toda escrita em `.claude/memories/` é delegada ao **Memory Organizer** (Agent tool).

⚡ **Uma chamada por stage, não uma por arquivo.** Acumule todas as operações da stage e faça
**uma única** chamada no handoff. Cada chamada extra é um subagente novo carregando o arquivo do
Organizer do zero — é o maior desperdício de token do pipeline.

Ordem dentro do lote: `APPEND_FINDING` → `UPDATE_FINDING_STATUS` → `APPEND_DEFERRED` →
`WRITE_SESSION_FILE` → `UPDATE_PHASE` (sempre por último).

## current-phase.md

Sobrescrito pelo Organizer (`UPDATE_PHASE`) a cada transição de stage, só em `SESSION_DIR/`:

```markdown
# Current Phase Navigator
- Last completed: [Stage/Phase] — [Nome]
- NEXT: [Stage/Phase] — [Nome]
- Stage: [letra]
- Status: DONE | BLOCKED | IN_PROGRESS
- findings.md entries so far: [N]
## Files reviewed/modified
- [lista acumulativa]
```

## findings.md

Formato único, consumido pelo Fix agent:

```
---
### [SR|SG|UX]-[NNN]: [título curto]
**Severity**: 🔴 Critical | ⚠️ Important | 💡 Minor
**Domain**: security | correctness | deployment | standardization | tests | ux
**File**: `path/to/file.py:42`
**Problem**: [uma frase: o que está errado e o impacto]
**Evidence**:
[2-5 linhas do código problemático]
**Status**: OPEN
---
```

Status finais: `FIXED` · `DESIGN_COMPLIANT` · `DEFERRED` · `NOISE` · `BLOCKED` — sempre com razão.

## issues-not-fixed.md

`.claude/memories/repo/issues-not-fixed.md` acumula os DEFERRED de todas as sessões.
Só o Organizer escreve nele, via `APPEND_DEFERRED` (anti-duplicata é responsabilidade dele).
⛔ Nunca remover entradas. ⛔ Nunca sobrescrever o arquivo inteiro.

## Rotina

- **Antes**: checar `repo/` para não redescobrir padrões já documentados.
- **Durante**: registrar decisões não óbvias (por que X e não Y).
- **Depois**: novo padrão ou gotcha recorrente → `repo/`, em bullets, arquivo < 50 linhas.
- ⛔ Nunca guardar senha, API key ou token em memória.
