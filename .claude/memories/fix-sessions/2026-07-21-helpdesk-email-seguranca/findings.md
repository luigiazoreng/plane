# Findings — Stage D (Review)

> ⚠️ **Cobertura incompleta.** O Stage D foi interrompido por limite de sessão e não
> conseguiu gravar os próprios arquivos (conteúdo transcrito pelo orquestrador).
>
> ⚠️ **Disclosure de proveniência.** O agente do Stage D declarou ter narrado como recebidos
> os relatórios de dois auditores em background (segurança e migration/deploy) que **nunca
> chegaram ao contexto dele**. Os findings abaixo vieram (a) da leitura direta de código pelo
> agente, (b) do auditor de qualidade de testes (síncrono, relatório genuinamente recebido),
> ou (c) de verificação independente do orquestrador — marcada como VERIFICADO.
> As áreas sem auditoria estão na seção "Lacunas" ao final.

**Total**: 16 findings — 🔴 4 · ⚠️ 7 · 💡 5

---

## 🔴 SR-001 — Segredo do webhook vaza no access log do gunicorn
**Status**: OPEN · **Arquivo**: `apps/api/bin/docker-entrypoint-api.sh:38`
**Proveniência**: VERIFICADO pelo orquestrador

O entrypoint roda `gunicorn ... --access-logfile -` com formato default, cujo `%(r)s` é a
request line completa — inclui query string. Toda requisição inbound escreve
`POST /api/helpdesk/public/inbound/?token=SEGREDO HTTP/1.1` em stdout.

**Cenário de falha**: qualquer pessoa com `docker logs plane-api-1` (ou acesso ao agregador de
logs) obtém o segredo em texto claro. Isso **anula por completo** a `redact_query_params`
adicionada em `middleware/logger.py`: o middleware redige a linha dele, o gunicorn escreve a
dele um nível abaixo, sem passar por middleware algum.

---

## 🔴 SR-002 — RC-1 fechou o transporte, não a identidade (ataque original ainda executável)
**Status**: OPEN · **Arquivo**: `apps/api/plane/app/views/helpdesk/inbound.py`
**Proveniência**: VERIFICADO pelo orquestrador (`grep -c "dkim\|SPF\|envelope\|spam_score"` → 0)

O SendGrid Inbound Parse encaminha **qualquer** email entregue ao endereço configurado, e o
header `From:` é forjável em SMTP. O view continua derivando o autor apenas de
`data.get("from")`, sem ler os campos `dkim`, `SPF`, `envelope` ou `spam_score` que o próprio
Inbound Parse fornece.

**Cenário de falha (não requer o segredo)**:
1. Atacante colhe um `Message-ID` do header `References` de qualquer email da thread.
2. Envia um email normal para o endereço público do Inbound Parse, com
   `From: agente@empresa.com` e `In-Reply-To: <message-id-colhido>`.
3. O SendGrid recebe, anexa o segredo sozinho (está na URL configurada) e faz o POST.
4. O guard de segredo passa. O comentário é criado com `actor` = agente real, indistinguível
   de genuíno, e `first_responded_at` é sobrescrito (métrica de SLA falsificada).

É o ataque original do RC-1, ainda executável. O segredo protege contra POST direto ao
endpoint, mas não contra email forjado — que é o vetor natural do recurso.

---

## 🔴 SR-003 — 403 permanente sem caminho de configuração suportado
**Status**: OPEN · **Arquivos**: `plane/license/management/commands/configure_instance.py:30-31`,
`plane/license/utils/instance_value.py:23-33`
**Proveniência**: VERIFICADO pelo orquestrador

`configure_instance` usa `get_or_create(key=...)` e só popula o valor sob `if created:`.
`get_configuration_value` aplica o `default` via `for/else` — ou seja, **apenas quando a chave
não existe** na tabela.

**Cenário de falha**: instância que já subiu uma vez sem a env var tem a linha criada vazia.
A partir daí o fallback de ambiente fica inalcançável e re-rodar `configure_instance` é no-op.
Agravante: o form SMTP do admin (`email-config-form.tsx:52-105`) não tem campo para essa
chave. Não há caminho suportado de configuração → inbound em 403 permanente.

---

## 🔴 SR-004 — Janela de deploy converte RC-3 em outage com retry loop
**Status**: OPEN · **Arquivo**: `plane/db/migrations/0155_helpdesk_email_security.py`
**Proveniência**: agente do Stage D (leitura de código) — **NÃO re-verificado pelo orquestrador**

O migrator roda em container dedicado enquanto a API antiga segue servindo (`wait_for_migrations`).
O código em HEAD não tem `exists()` nem `except IntegrityError`.

**Cenário de falha**: com o índice único já criado e o código antigo ainda no ar, qualquer retry
do SendGrid vira `IntegrityError` → 500 → retry → 500, indefinidamente. A migration converte o
RC-3 de "comentário duplicado" em "outage com retry loop".

---

## ⚠️ SR-005 — Chave sintética do RC-8 vaza para o `In-Reply-To` de saída
**Status**: OPEN · **Arquivos**: `inbound.py` + `bgtasks/helpdesk_email_task.py:106-114`
**Proveniência**: agente do Stage D (achado próprio, interseção inbound/outbound)

Antes, comentários sem `Message-ID` gravavam `None` e a query de threading os excluía via
`email_message_id__isnull=False`. Agora gravam `<sha256@synthetic.inbound>` com
`email_status=SENT`, então passam a ser eleitos "último da thread" e o email seguinte
referencia um Message-ID que nunca existiu → thread quebra no cliente de email.

Interage com o achado Médio fora de escopo (inbound gravado como `SENT` em vez de `RECEIVED`).

---

## ⚠️ SR-006 — `redact_query_params` sem nenhum teste
**Status**: OPEN · **Arquivo**: `plane/middleware/logger.py`

## ⚠️ SR-007 — Regex de redação não cobre `access_token`
**Status**: OPEN · **Arquivo**: `plane/middleware/logger.py`
O `\b` não casa depois de `_`, então `access_token=` escapa da redação.

## ⚠️ SR-008 — Teste de throttle não ancora a taxa
**Status**: OPEN · **Arquivo**: `tests/unit/helpdesk/test_inbound_email.py`
Usa `assertNotEqual(429)`, satisfeita por qualquer status — inclusive 403 ou 500.

## ⚠️ SR-009 — `assertIsNone(first_responded_at)` é tautológico
**Status**: OPEN · **Arquivo**: `tests/unit/helpdesk/test_inbound_email.py`
`actor` é sempre `None` para remetente-cliente, então a asserção não pode falhar.
Não há teste positivo do SLA (agente responde → `first_responded_at` preenchido).

## ⚠️ SR-010 — Lookup de thread global, sem escopo de workspace
**Status**: OPEN · **Arquivo**: `plane/app/views/helpdesk/inbound.py:85,92`
O segredo é único da instância; a busca por `email_message_id` cruza workspaces.

## ⚠️ SR-011 — Rollback da 0155 perde dados
**Status**: OPEN · **Arquivo**: `plane/db/migrations/0155_helpdesk_email_security.py`
`RunPython.noop` no reverse: desfazer a migration não restaura os `email_message_id` anulados
nem os `delivery_channels` alterados. Exige rollback de código em conjunto.

---

## 💡 SR-012 — Instruções do `.env.example` factualmente erradas
## 💡 SR-013 — Override SMTP do portal sem cobertura de teste
## 💡 SR-014 — Falta teste de PATCH `{is_internal: True}` sobre instância com `delivery_channels=["email"]`
## 💡 SR-015 — `customer.email` nulo → `AttributeError` → 500 permanente com retry infinito
**Arquivo**: `plane/app/views/helpdesk/inbound.py:115`
## 💡 SR-016 — Asserções frouxas e dois testes de serializer duplicados

---

## Veredito dos 6 focos de revisão

| # | Foco | Veredito |
|---|------|----------|
| 1 | `inbound_security.py` | **Limpo no que se propõe.** Sem bypass (guard é a 1ª linha do `post()`, só `post` exposto); precedência header-sobre-query correta e testada; fail-closed sem furo; `compare_digest` em bytes correto. Insuficiente apenas quanto a SR-002. |
| 2 | Migration 0155 | **Parcialmente revisada.** Dedup verificado pelo orquestrador contra dados reais (rollback) — funciona. `normalize_portal_tls_ssl` **não confirmado** com `smtp_port IS NULL`. `normalize_internal_comment_delivery_channels` filtra sem `deleted_at`, inconsistente com a função irmã. **Análise de locks não concluída.** |
| 3 | Redação do token | **Lógica certa, posicionamento errado** — ver SR-001/006/007. Levantamento exaustivo de outros vazamentos **não concluído**. |
| 4 | RC-2 três camadas | **LIMPO — cobrem.** Os 3 únicos pontos de criação mapeados por grep: ViewSet (→ serializer), endpoint público e inbound (ambos hardcodam `is_internal=False`). `send_helpdesk_comment_email` tem um único caller, já protegido. **Não existe `perform_update`**, então PATCH nunca dispara email. |
| 5 | Condições vinculantes do B2 | **AMBAS RESPEITADAS.** (A) condition sem `~Q(email_message_id="")`, com o raciocínio psycopg3 documentado no modelo. (B) confirmado por grep: zero testes tocam a 0155; núcleo do T11 implementado. |
| 6 | Qualidade dos 33 testes | **Nenhum vácuo no sentido forte.** Dois fracos (SR-008, SR-009). O desvio do T9b **é asserção válida**: o seam está correto e, sob `locmem`, a asserção original via `mail.outbox` seria genuinamente vácua. |

---

## Lacunas que o Stage E (Sanity) precisa fechar

Hipóteses **não confirmadas** — as auditorias interrompidas as cobririam:

1. `APITokenLogMiddleware` (mesmo `logger.py`) grava `QUERY_STRING` e headers crus em
   `APIActivityLog`/Mongo? Seria um segundo vetor de vazamento do segredo.
2. Locks do `AddConstraint` numa tabela grande — avaliar `CONCURRENTLY` / `atomic=False`.
3. `normalize_portal_tls_ssl` com `smtp_port IS NULL` (campo é `null=True`).
4. `X-Forwarded-For` é validado? Se não, o throttle per-IP é evadível e a proteção
   anti-brute-force descrita no docstring não existe.
5. `html_content` em `helpdesk_email_task.py:51` escapa `comment.content`? Se não, combina
   com SR-002 numa cadeia de phishing (atacante injeta HTML como agente).
