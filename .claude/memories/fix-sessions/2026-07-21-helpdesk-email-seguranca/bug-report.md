# Bug Report

## Descrição
Code review da feature de email do helpdesk (branch `feat/email`) identificou 14 achados.
Esta sessão cobre os **5 de severidade Crítica e Alta**. A arquitetura geral está correta
(threading por Message-ID, status de entrega persistido, SMTP por portal com fallback,
SSE após envio) — os problemas estão na **borda de segurança** e nos **casos de falha**.

## Arquivos envolvidos
- `apps/api/plane/app/views/helpdesk/inbound.py` (webhook inbound SendGrid)
- `apps/api/plane/bgtasks/helpdesk_email_task.py` (envio outbound via Celery)
- `apps/api/plane/app/views/helpdesk/comment.py` (dispara o envio)
- `apps/api/plane/db/models/helpdesk.py` (campos SMTP e de status de email)
- `apps/api/plane/app/serializers/helpdesk.py` (validação)
- `apps/api/plane/tests/unit/helpdesk/test_inbound_email.py` (testes existentes)

---

## 🔴 CRÍTICO 1 — Webhook inbound sem autenticação nenhuma

**Arquivo**: `apps/api/plane/app/views/helpdesk/inbound.py:26` e `:112-134`

`PublicHelpdeskInboundEmailEndpoint` é `AllowAny` sem verificação de assinatura do SendGrid,
sem secret na URL e sem allowlist de IP. A autorização do remetente confia no campo `from`
do POST — que nesse ponto é apenas um campo de `multipart/form-data`, forjável trivialmente.

**Comportamento esperado**: só requisições comprovadamente originadas do provedor de email
devem ser processadas.

**Comportamento atual**: o único segredo que impede abuso é o `Message-ID` — mas ele viaja
nos headers de **todo email que o sistema envia ao cliente**.

**Passos para reproduzir (escalada de privilégio)**
1. Cliente abre um ticket no helpdesk e recebe o email de resposta do agente.
2. Cliente extrai o `Message-ID` dos headers do email recebido.
3. Cliente faz `POST /helpdesk/public/inbound/` (multipart) com:
   - `headers: "In-Reply-To: <message-id-capturado>"`
   - `from: agente@empresa.com`  ← e-mail de um agente real do workspace
   - `text: "conteúdo arbitrário"`
4. O endpoint casa o `Message-ID`, encontra o `HelpdeskMember` pelo `from`, e cria o
   comentário com `actor` = aquele agente.

**Correção sugerida**: validar a assinatura ECDSA do SendGrid
(`X-Twilio-Email-Event-Webhook-Signature`) antes de processar qualquer coisa.
No mínimo, um token secreto no path/header.

---

## 🔴 CRÍTICO 2 — Notas internas podem vazar para o cliente

**Arquivos**: `apps/api/plane/app/views/helpdesk/comment.py:61-83`,
`apps/api/plane/bgtasks/helpdesk_email_task.py` (task inteira)

Nada impede `is_internal=True` junto com `delivery_channels=["email"]`. O serializer aceita
ambos e a task **nunca checa `is_internal`** antes de enviar para `recipient_email`.

**Comportamento esperado**: nota interna nunca sai por email para o cliente.
**Comportamento atual**: um agente que marque a nota como interna e mantenha o canal email
envia o conteúdo interno direto para o cliente.

**Correção sugerida**: guard em `perform_create` (rejeitar/limpar a combinação) **e** guard
defensivo na task antes do `msg.send()`.

---

## 🟠 ALTO 3 — Sem idempotência no inbound

**Arquivo**: `apps/api/plane/app/views/helpdesk/inbound.py:148` (o `create()`), `:98`, `:137`

Não há unique constraint nem checagem em `email_message_id` antes do `create()`.
SendGrid faz retry em qualquer resposta não-2xx e em timeout → **comentários duplicados**.

Agrava: os retornos `404` (thread não encontrada) e `403` (remetente não autorizado) fazem
o SendGrid tentar de novo indefinidamente. Emails descartados por decisão de negócio devem
retornar `200` (aceito e descartado), não erro.

**Correção sugerida**: unique constraint em `email_message_id` + checagem prévia
(get_or_create / verificação de existência); trocar 404/403 por 200 com corpo indicando o
descarte.

---

## 🟠 ALTO 4 — `use_tls` e `use_ssl` são mutuamente exclusivos no Django

**Arquivos**: `apps/api/plane/db/models/helpdesk.py` (campos `smtp_use_tls` / `smtp_use_ssl`),
`apps/api/plane/bgtasks/helpdesk_email_task.py:87-97`

O modelo permite os dois `True` sem validação. Se um admin marcar ambos na tela de settings
do portal, `get_connection()` levanta `ValueError` e **todo** email daquele portal falha
(cai no `except`, marca `FAILED`, e o admin não tem pista clara da causa).

**Correção sugerida**: validação no `HelpdeskPortalSerializer` rejeitando a combinação.

---

## 🟠 ALTO 5 — `email_message_id` sem índice

**Arquivo**: `apps/api/plane/db/models/helpdesk.py` (campo `email_message_id`)

O inbound executa até N `filter(email_message_id=...)` sequenciais por email recebido
(`inbound.py:85` e `:92`, dentro de loops sobre os IDs de `In-Reply-To` e `References`),
numa tabela que cresce sem limite.

**Correção sugerida**: `db_index=True` + `unique` — o unique resolve o achado #3 junto.

---

## Ambiente
- Backend: `apps/api` (Django 4.2.30 + DRF + Celery 5.4.0)
- Branch: `feat/email` (base `stable-1.3.1`)
- Migrations existentes da feature: `0152`, `0153`, `0154`
- `CELERY_TASK_SERIALIZER = "json"` (kombu 5.x serializa UUID → str; não é problema)
- `ATOMIC_REQUESTS` **não** está setado → `serializer.save()` commita em autocommit,
  logo o `.delay()` em `perform_create` não é race condition

## Informações Adicionais
- Testes atuais (`test_inbound_email.py`) cobrem threading feliz e rejeição de remetente,
  mas **nenhum** dos 5 cenários acima.
- Achados FORA do escopo desta sessão (registrar em `repo/issues-not-fixed.md` no final):
  - Médio: inbound gravado como `email_status=SENT` (deveria ser `RECEIVED`)
  - Médio: senha SMTP em texto plano no banco
  - Médio: sem fallback de threading (assunto sem `[#TICKET-ID]`)
  - Médio: parsing de headers por regex quebra com folding RFC 5322
  - Menor: HTML sem escape em `helpdesk_email_task.py:51`
  - Menor: sem remoção de citação no inbound
  - Menor: endpoint de logs sem paginação e expondo comentários internos
  - Menor: campo `smtp_password` sempre vazio no frontend (write_only)
  - Lacuna: comentários do cliente no portal não notificam agentes por email
