---
name: "Fixer - Diagnose UX"
description: "Stage A2: reproduz o bug no browser para capturar evidência visual/comportamental. Delega ao gem-browser-tester. Só roda quando o Diagnose Static marcou UX Diagnose: SIM."
---

# Fixer — Diagnose UX (Stage A2)

Reproduza o bug no browser e traga **a evidência que muda o fix** — não um tour pela aplicação.

> **⛔ Nunca use browser tools direto.** Delegue ao `gem-browser-tester` via Agent tool.
> **📂** Escrita em `.claude/memories/` só via **Memory Organizer**, numa única chamada no handoff.
> **🇧🇷** Português (pt-BR). **🧰** Portas e ambiente: `.claude/instructions/stack.md`.

## Boot

```bash
S=$(cat .claude/memories/current-fix-session.txt) && \
  cat .claude/memories/fix-sessions/"$S"/root-cause.md
```

Confirme que `root-cause.md` traz `UX Diagnose: SIM`. Se trouxer `NÃO`, pare e devolva ao
orquestrador — esta stage não deveria ter sido lançada.

---

## Phase 1 — Servidores

```bash
for p in 3000 3001 3002; do
  printf '%s: ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' --max-time 3 "http://localhost:$p" || echo offline
done
curl -s -o /dev/null -w 'api: %{http_code}\n' --max-time 3 http://localhost:8000/api/ || echo "api: offline"
```

O app relevante depende do bug: `apps/web` → 3000, `apps/admin` → 3001, `apps/space` → 3002.

Se o app alvo estiver offline → STOP e peça ao dev:
> "Servidores offline ([status]). Suba com `docker compose -f docker-compose-local.yml up -d` e
> `pnpm dev`, e me avise."

---

## Phase 2 — Reproduzir

Defina **um** cenário mínimo a partir do `root-cause.md`:

```markdown
## Cenário
**Tela**: [rota/feature]
**Passos**: 1. … 2. … 3. …
**Esperado**: [comportamento correto]
**Atual (bug)**: [o que acontece]
```

Delegue ao `gem-browser-tester` com instruções fechadas: URL do app alvo, cada passo, e o que
capturar — screenshot no momento da falha, mensagens de console (erros e warnings relevantes) e
a requisição de rede que falhou (status + corpo da resposta), se houver.

Peça de volta apenas: reproduziu SIM/NÃO, screenshots, erros de console, requisição relevante.
Se não reproduzir, isso é resultado válido e importante — a hipótese do Static pode estar errada.

---

## Handoff

```
Leia .claude/agents/feature-memory-organizer.agent.md e execute o Boot Sequence.

OPERATION: APPEND_SESSION_FILE
FILE: root-cause.md
CONTENT:

## Evidências UX
- Bug reproduzido: [SIM | NÃO]
- Console: [erros relevantes, ou "limpo"]
- Rede: [método URL → status, corpo do erro, ou "sem falha"]
- Screenshots: [o que mostram]
- Impacto na hipótese: [confirma | refuta | refina — e como]
END_CONTENT

OPERATION: WRITE_SESSION_FILE
FILE: stage-a2-diagnose-ux.md
CONTENT:
# Stage A2: Diagnose UX
- Bug reproduzido: [SIM | NÃO]
- Evidências: [resumo em 1-2 linhas]
- Hipótese do Static: [confirmada | refutada | refinada]
END_CONTENT

OPERATION: UPDATE_PHASE
LAST_COMPLETED: Stage A2 — Diagnose UX
NEXT: [Stage A3 VPS | Stage B Plan]
STAGE: A2
STATUS: DONE
FINDINGS_COUNT: 0
FILES:
- FIX_SESSION_DIR/root-cause.md (atualizado)
```

Se a evidência **refutou** a causa raiz do Static, diga isso explicitamente ao orquestrador — o
Plan precisa saber que está partindo de premissa revisada.
