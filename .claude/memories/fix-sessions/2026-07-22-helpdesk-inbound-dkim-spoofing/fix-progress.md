# Fix Progress — SR-002 (Stage C)

Tracking TDD RED → GREEN. Baseline da suíte: **63 testes passando**.
Comando: `docker compose -f docker-compose-local.yml exec -T api python -m pytest plane/tests/unit/helpdesk/ plane/tests/e2e/ -p no:randomly -q [--create-db]`

---

## Ciclo 1 — Grupo A: `sender_authenticity` (unit puro, sem banco)

- Serviço: `apps/api`
- Arquivo de produção: `plane/app/helpdesk/sender_authenticity.py` (**novo**)
- Arquivo de teste: `plane/tests/unit/helpdesk/test_sender_authenticity.py` (**novo**)
- Testes escritos: 24 (`TestSenderAuthenticity`), cobrindo A1–A7 do plano
- **RED**: ✅ `ModuleNotFoundError` na coleta — módulo inexistente
- Fix: parser do campo `dkim`/`SPF` (única fonte de `pass`), leitor defensivo de
  `Authentication-Results` (authserv-id pinado, duplicata → sem sinais, teto de `fail`),
  alinhamento estilo DMARC, veredito de 4 estados, `try/except` que nunca propaga
- **GREEN**: ✅ 23/24 imediatamente; a 24ª (`test_states_match_the_model_choices`) exigia o
  campo no model — fechada no passo de infra abaixo. 24/24 após.
- Status: **FIXED**

### Correções do B2 aplicadas neste ciclo

- **C2 (precedência)**: implementada como lista única de sinais com os `pass` do A-R
  descartados na origem, e passo 3 (`pass` alinhado) avaliado antes do passo 4 (`fail`).
  Travada por `test_a4_primary_pass_beats_secondary_fail`.
- **C2 (semântica do `fail` do A-R)**: só `dkim=<result> ... header.d=<domínio>` produz sinal
  utilizável. `spf=fail smtp.mailfrom=...` — rotineiro em encaminhamento legítimo — não
  produz `fail`. Travada por `test_a4_forwarded_spf_fail_does_not_report_an_attack`.
- **S1 (parser tolerante)**: `findall` sobre múltiplas entradas + `@` opcional. Travada por
  `test_a1_multiple_dkim_entries_are_all_considered` e
  `test_a1_domain_without_at_sign_is_still_parsed` — sem elas um parser de entrada única
  passaria em todo o resto.

---

## Infra — model, migration, settings

- `plane/db/models/helpdesk.py`: `HelpdeskRequestComment.SenderVerification` (TextChoices) +
  campo `sender_verification` (default `not_applicable`)
- `plane/db/migrations/0157_helpdesk_comment_sender_verification.py` (**novo**, AddField com
  default → sem backfill). `makemigrations --check --dry-run` → *No changes detected*
- `plane/settings/common.py`: `HELPDESK_INBOUND_AUTHSERV_ID` (padrão de `:355`)
- `.env.example` + `apps/api/.env.example`: variável documentada

**Decisão de import**: o módulo puro **não** é importado por `plane/db/models` (evita
`plane.db → plane.app` e o risco de import circular). Os literais são duplicados de propósito
e `test_states_match_the_model_choices` é o que impede a divergência.

---

## Ciclo 2 — Grupo C: serializers

- Serviço: `apps/api`
- Arquivos de produção: `plane/app/serializers/helpdesk.py`, `plane/app/views/helpdesk/portal.py`
- Arquivo de teste: `plane/tests/unit/helpdesk/test_helpdesk_serializers.py`
- Testes escritos: 3 (`TestSenderVerificationExposure`) — C1, guarda do R4, C2
- **RED**: ✅ em dois passos deliberados. Primeiro `ImportError` (serializer admin inexistente);
  depois, com a subclasse admin já criada mas sem `exclude`, **C1 isolado falhou** — provando
  que o teste realmente detecta o vazamento antes de eu fechá-lo
- Fix: base trocou `fields = "__all__"` por `exclude = ["sender_verification"]`;
  `HelpdeskRequestCommentAdminSerializer` reexpõe o campo; `HelpdeskPortalEmailLogsEndpoint`
  passou a usar o serializer admin
- **GREEN**: ✅ 11/11 no arquivo
- Status: **FIXED**

> **Gotcha do R3 confirmado na prática**: neste ciclo 3 testes pré-existentes falharam por
> coluna inexistente — `--reuse-db` reaproveitava um schema anterior ao campo novo. Resolvido
> com `--create-db`, não era regressão.

---

## Ciclo 3 — Grupo B: endpoint inbound (integração)

- Serviço: `apps/api`
- Arquivo de produção: `plane/app/views/helpdesk/inbound.py`
- Arquivo de teste: `plane/tests/unit/helpdesk/test_inbound_email.py`
- Testes escritos: 7 novos (`TestInboundSenderAuthenticity`) + `test_agent_reply` adaptado (B2)
- **RED**: ✅ 7 falhas. A do bug, verbatim:
  `test_b1_forged_agent_without_dkim_gets_no_actor` →
  `AssertionError: <User: agent-auth <agent@plane.so>> is not None`
- Fix:
  1. veredito computado uma vez em `~:134`, antes de qualquer efeito colateral
  2. ramo de agente atribui `actor` **só** em `== PASS` (nunca `!= FAIL`)
  3. supressão de anexos + borda anexo-only posicionadas **depois** do gate de
     `is_authorized` (correção **C1** — ver abaixo)
  4. comentário de `:251-253` reescrito: *autorizado ≠ autêntico*
  5. `sender_verification` persistido nos dois ramos
- **GREEN**: ✅ 30/30 no arquivo
- Status: **FIXED**

### Correção C1 do B2 aplicada

O D1-a mandava esvaziar `uploaded_files` em `~:134`. Segui o `plan-review.md`: **computar** o
veredito ali, mas **agir** só depois do ramo de autorização. Posicionei a supressão logo após o
`if not is_authorized: return ...`, o que satisfaz "entre `:213` e `:254`" e preserva as três
coisas que a letra do D1-a quebraria:

- `empty_body` de `:151` continua significando o que sempre significou → B4 assere
  `detail == "unverified_agent_attachments_only"` e alcança essa asserção
- fingerprint de `:236-239` intacto: quando a supressão ocorre, `text_body` é
  necessariamente não-vazio (caso contrário já retornamos), então `body_key = text_body` e o
  ramo do fingerprint nem é tomado — a chave de idempotência não muda
- o cliente não é atingido: `is_agent_branch` só existe depois de `:190-207` → B5 passa

---

## Frontend (D7/D8) — sem TDD automatizado

Sem harness de teste de componente nestes arquivos; verificação por `tsc --noEmit` comparativo.

- `packages/types/src/helpdesk.ts`: `sender_verification` opcional (o serializer público não o envia)
- `apps/web/app/helpdesk/p/[publicSlug]/[requestId]/page.tsx`: `authorKind` de 3 estados
  governando **alinhamento, superfície/cor e rótulo** (as 3 linhas — 204, 206, 210)
- `apps/web/app/(all)/[workspaceSlug]/(projects)/helpdesk/[requestId]/page.tsx`: `authorKind`
  governando alinhamento, avatar, ícone e nome (as 8 derivadas do antigo `isAgent`)
- `apps/web/app/(all)/[workspaceSlug]/(projects)/helpdesk/settings/page.tsx`: coluna "Sender"
  nos Email logs, entre "Recipient" e "Time"
- Rótulo neutro: **"Participant"** (D8)

---

## Resultado final

| Verificação | Resultado |
|---|---|
| Suíte backend (`unit/helpdesk` + `e2e`) | ✅ **97 passed** (63 baseline + 34 novos), 0 falhas |
| `makemigrations --check --dry-run` | ✅ No changes detected |
| `tsc --noEmit` (apps/web) | ✅ 42 erros vs **43 no baseline** → 0 erros novos |
| `npm run lint` (apps/web) | ⏸️ N/A — o script não existe no `package.json` |
| Regressões | **0** |

Nada commitado; diff inteiro na working tree.
