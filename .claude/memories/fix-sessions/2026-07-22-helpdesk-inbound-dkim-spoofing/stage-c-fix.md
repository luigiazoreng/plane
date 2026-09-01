# Stage C: Fix Results — SR-002 (spoofing de agente no inbound)

- Sessão: `2026-07-22-helpdesk-inbound-dkim-spoofing`
- Fonte: `fix-plan.md` (rev. 2, APROVADO) + `plan-review.md` (2 correções obrigatórias + 1 sugestão)
- Modo: execução do plano aprovado (não há `findings.md` nesta sessão)

## Resumo

- ✅ Plano executado integralmente, com disciplina RED → GREEN em 3 ciclos
- ✅ Correções obrigatórias do B2 aplicadas: **C1** (reposicionamento da supressão de anexos)
  e **C2** (precedência entre fontes + semântica do `fail` do A-R)
- ✅ Sugestão **S1** aplicada (parser tolerante a múltiplas entradas, com caso explícito em teste)
- 🔴 BLOCKED: 0
- Nada commitado — diff na working tree

## Por serviço

| Serviço | Fixes | Build/Typecheck | Testes |
|---|---|---|---|
| `apps/api` | 8 arquivos (3 novos) | ✅ migration limpa | ✅ 97 passed (baseline 63) |
| `apps/web` + `packages/types` | 4 arquivos | ✅ 0 erros novos (42 vs 43) | ⏸️ sem harness de componente |

## O que mudou, e por quê

1. **Novo módulo puro** `plane/app/helpdesk/sender_authenticity.py` — separado de
   `inbound_security.py` de propósito: aquele prova o **transporte**, este prova o
   **remetente**. Confundir os dois é literalmente a causa do SR-002.
2. **Veredito de 4 estados** (`pass`/`fail`/`unverified`/`not_applicable`), computado uma vez
   antes de qualquer efeito colateral, com alinhamento estilo DMARC obrigatório.
3. **Validação assimétrica**: agente só vira `actor` com `== PASS`; cliente nunca é bloqueado.
   `first_responded_at` fecha junto, sem alteração própria (já condicionado a `actor is not None`).
4. **Anexos de agente não verificado descartados** antes de chegarem ao bucket; borda
   anexo-only vira `_discard("unverified_agent_attachments_only")`.
5. **Campo novo fora do serializer público** (`exclude`) + subclasse admin para os Email logs —
   fecha o oráculo de detecção que importa.
6. **Frontend**: `authorKind` de 3 estados governando todas as decisões de render nos dois
   arquivos; rótulo neutro `"Participant"`; coluna "Sender" nos Email logs.

## Testes

| Grupo | Arquivo | Novos |
|---|---|---|
| A — unit puro | `test_sender_authenticity.py` (**novo**) | 24 |
| B — integração | `test_inbound_email.py` | 7 + 1 adaptado |
| C — serializers | `test_helpdesk_serializers.py` | 3 |

O plano previa 15 testes; foram escritos 34 casos mais granulares cobrindo as mesmas 15
especificações, mais os casos extras exigidos por C2 e S1.

**`test_agent_reply` (`test_inbound_email.py`) foi adaptado, não deletado.** Ele afirmava o
comportamento vulnerável (agente virava `actor` sem sinal algum). O acréscimo do campo `dkim`
e das asserções de `sender_verification`/`first_responded_at` **é** a correção — deve ser dito
assim na mensagem de commit.

## Desvios do plano (todos justificados)

| Item | Plano | Executado | Razão |
|---|---|---|---|
| Supressão de anexos | D1-a: esvaziar em `~:134` | Após o gate de `is_authorized` | Correção **C1** do `plan-review.md` — a letra do D1-a quebraria B4 e B5 |
| Constantes de estado | Campo importando do módulo | Literais duplicados + teste de contrato | Evita `plane.db → plane.app` e risco de import circular |
| `npm run lint` | Previsto como gate | ⏸️ N/A | O script não existe no `package.json` de `apps/web`; `tsc` é o gate real |
| Nº de migration | `0157_helpdesk_comment_sender_verification` | idêntico | — |

## Pendências que este stage NÃO fecha

1. 🔴 **PRÉ-REQUISITO DE DEPLOY (R1)**: capturar um payload real do SendGrid Inbound Parse e
   confirmar o formato de `dkim`. Com o A-R fora do caminho do `pass`, esse campo é ponto
   único de falha — se divergir, 100% dos agentes caem em `unverified` e perdem atribuição
   **e anexos**. O parser foi feito tolerante (S1), mas tolerância não substitui a captura.
2. ⚠️ **Métrica a alertar (sugestão #3 do B2)**: a **taxa** de `pass` entre comentários de
   agente caindo a zero é o sintoma de deriva de formato, distinguível de um ataque isolado.
   O `logger.warning` sozinho não produz isso; exige contagem por `detail`.
3. ⚠️ **`HELPDESK_INBOUND_AUTHSERV_ID` precisa ser configurado** em produção para que o A-R
   seja lido. Vazio = fail-closed (correto por design), mas o A-R fica inerte.
4. 📋 **Achado registrado, não corrigido**: `comment.py:177-183` cria comentário com
   `customer=None` quando o token do portal é inválido → o cliente vê a própria mensagem como
   `"Participant"`. Gravado em `.claude/memories/repo/issues-not-fixed.md` (SR-002-D8).
5. 📋 **R7 sem remédio ainda**: agente cujo ESP assina em subdomínio próprio
   (`d=em1234.empresa.com`, `From: agente@empresa.com`) é rejeitado pelo alinhamento estrito.
   Remédio fixado de antemão: **allowlist de domínio assinante por workspace — NUNCA
   afrouxar o alinhamento globalmente.**

## Arquivos

**Novos**
- `apps/api/plane/app/helpdesk/sender_authenticity.py`
- `apps/api/plane/db/migrations/0157_helpdesk_comment_sender_verification.py`
- `apps/api/plane/tests/unit/helpdesk/test_sender_authenticity.py`

**Modificados — backend**
- `apps/api/plane/app/views/helpdesk/inbound.py`
- `apps/api/plane/app/serializers/helpdesk.py`
- `apps/api/plane/app/views/helpdesk/portal.py`
- `apps/api/plane/db/models/helpdesk.py`
- `apps/api/plane/settings/common.py`
- `apps/api/plane/tests/unit/helpdesk/test_inbound_email.py`
- `apps/api/plane/tests/unit/helpdesk/test_helpdesk_serializers.py`

**Modificados — frontend/config**
- `packages/types/src/helpdesk.ts`
- `apps/web/app/helpdesk/p/[publicSlug]/[requestId]/page.tsx`
- `apps/web/app/(all)/[workspaceSlug]/(projects)/helpdesk/[requestId]/page.tsx`
- `apps/web/app/(all)/[workspaceSlug]/(projects)/helpdesk/settings/page.tsx`
- `.env.example`, `apps/api/.env.example`

## Próximo passo

**Stage D — Review**
