# Root Cause — Helpdesk Email (5 achados Críticos/Altos)

Todos os 5 achados do bug-report foram **CONFIRMADOS** por leitura do código real na branch `feat/email`.
Nenhum foi refutado. Foram encontradas **4 causas raiz adicionais** diretamente ligadas ao escopo.

---

## RC-1 (CRÍTICO 1) — Webhook inbound sem autenticação — CONFIRMADO

**Arquivos**: `apps/api/plane/app/views/helpdesk/inbound.py:26`, `:112-140`; `apps/api/plane/app/urls/helpdesk.py:295-299`

**Evidências confirmadas**:
- `permission_classes = [AllowAny]` (inbound.py:26) — nenhuma outra verificação no `post()`.
- A rota `helpdesk/public/inbound/` não tem secret no path (urls/helpdesk.py:296).
- `grep -rni "sendgrid|twilio|webhook_secret|INBOUND"` em `plane/settings/` e `plane/license/` retorna **zero** ocorrências — não existe segredo configurado em lugar nenhum.
- A autorização do remetente (inbound.py:112-134) compara `from_email` (derivado do campo `from` do multipart, controlado pelo atacante) contra `hd_request.contact_email`, `hd_request.customer.email` e `HelpdeskMember.member.email`.

**Mecanismo**: `_extract_email_address(data.get("from"))` extrai o email de um campo POST forjável. Casando o `Message-ID` (que viaja nos headers de todo email enviado pelo sistema — `helpdesk_email_task.py:100`), o atacante escolhe arbitrariamente qual identidade assumir. Com `from: agente@empresa.com` o comentário é criado com `actor = member.member` (inbound.py:148-158).

**Impacto adicional não citado no report**: além do comentário forjado, o mesmo request sobrescreve `hd_request.first_responded_at` (inbound.py:161-163) — o atacante manipula métrica de SLA do workspace.

---

## RC-2 (CRÍTICO 2) — Nota interna vaza por email — CONFIRMADO

**Arquivos**: `apps/api/plane/app/views/helpdesk/comment.py:60-84`; `apps/api/plane/app/serializers/helpdesk.py:248-259`; `apps/api/plane/bgtasks/helpdesk_email_task.py` (task inteira)

**Evidências confirmadas**:
- `HelpdeskRequestCommentSerializer` usa `fields = "__all__"` e `read_only_fields` contém apenas `request`, `actor`, `customer`, `email_status`, `email_sent_at`, `email_message_id` — **`is_internal` e `delivery_channels` são ambos graváveis** e não há `validate()` no serializer.
- `perform_create` (comment.py:66-84) lê `delivery_channels` e dispara `send_helpdesk_comment_email.delay(comment.id)` sem jamais consultar `is_internal`.
- `send_helpdesk_comment_email` (helpdesk_email_task.py:24-125) nunca referencia `is_internal`; vai direto de `recipient_email` (linha 34) para `msg.send()` (linha 125).

**Impacto**: conteúdo marcado como interno é entregue ao `contact_email` do cliente. Irreversível.

---

## RC-3 (ALTO 3) — Sem idempotência no inbound — CONFIRMADO

**Arquivo**: `apps/api/plane/app/views/helpdesk/inbound.py:96-101`, `:135-140`, `:148`

**Evidências confirmadas**:
- `HelpdeskRequestComment.objects.create(...)` (linha 148) sem nenhuma checagem prévia de `email_message_id`.
- Model `HelpdeskRequestComment.Meta` (db/models/helpdesk.py:239-242) contém apenas `verbose_name` / `db_table` — **sem `constraints`, sem `indexes`**.
- Migration `0152` linha 42-45 adiciona `email_message_id` como `CharField(blank=True, max_length=255, null=True)` — sem `unique`, sem `db_index`.
- Retornos de erro que disparam retry do SendGrid: `404` (linha 98-101, thread não encontrada) e `403` (linha 137-140, remetente não autorizado).

**Impacto**: qualquer retry do SendGrid (timeout, 4xx, 5xx) duplica o comentário; emails legitimamente descartados entram em loop de retry.

---

## RC-4 (ALTO 4) — `use_tls` + `use_ssl` mutuamente exclusivos — CONFIRMADO

**Arquivos**: `apps/api/plane/db/models/helpdesk.py:57-58`; `apps/api/plane/bgtasks/helpdesk_email_task.py:87-97`; `apps/api/plane/app/serializers/helpdesk.py:49-87`

**Evidências confirmadas**:
- `smtp_use_tls = BooleanField(default=False)` e `smtp_use_ssl = BooleanField(default=False)` — independentes, sem `constraints` no `Meta` do `HelpdeskPortal`.
- `HelpdeskPortalSerializer.validate()` (serializers/helpdesk.py:50-79) valida apenas `auto_assignment_*` e `sla_*` — **não toca em smtp_use_tls/smtp_use_ssl**.
- `helpdesk_email_task.py:87-88` converte ambos para `"1"`/`"0"` e passa os dois a `get_connection(use_tls=..., use_ssl=...)` (linhas 95-96).
- Django `core/mail/backends/smtp.py:49` levanta `ValueError("EMAIL_USE_TLS/EMAIL_USE_SSL are mutually exclusive, so only set one of those settings to True.")` no `__init__` do backend.

**Mecanismo**: o `ValueError` estoura dentro do `try` da task → cai no `except` (linha 138) → `email_status = FAILED` com `email_error = str(e)`. Todo email daquele portal falha silenciosamente para o admin.

---

## RC-5 (ALTO 5) — `email_message_id` sem índice — CONFIRMADO

**Arquivo**: `apps/api/plane/db/models/helpdesk.py:236`; migration `0152` linha 42-45

**Evidências confirmadas**: campo sem `db_index=True` nem `unique=True`; `Meta` sem `indexes`.
O inbound roda `filter(email_message_id=msg_id)` dentro de dois loops — `inbound.py:85` (sobre os IDs de `In-Reply-To`) e `inbound.py:92` (sobre os IDs de `References`, tipicamente a thread inteira). Cada um é um seq scan em `helpdesk_request_comments`, tabela que cresce sem limite.

---

# Causas Raiz Adicionais Encontradas (dentro do escopo)

## RC-6 — `unique=True` simples em `email_message_id` QUEBRA com soft delete

**Arquivos**: `apps/api/plane/db/mixins.py:56-82`; `apps/api/plane/db/models/helpdesk.py:212`

`HelpdeskRequestComment` herda `WorkspaceBaseModel → BaseModel → AuditModel → SoftDeleteModel`.
`objects = SoftDeletionManager()` filtra `deleted_at__isnull=True`, mas **um `unique=True` no banco enxerga também as linhas soft-deletadas**.
Consequência: comentário deletado (soft) + email reenviado com o mesmo `Message-ID` → `IntegrityError` → 500 → retry infinito do SendGrid.

**Correção correta**: `models.UniqueConstraint(fields=["email_message_id"], condition=Q(deleted_at__isnull=True, email_message_id__isnull=False), name=...)` + `db_index=True`.
**Não usar** `unique=True` no field. Isto condiciona o fix de RC-3 e RC-5.

## RC-7 — Constraint sozinha não resolve RC-3: precisa de checagem explícita

Se a idempotência depender só da constraint, um remetente que reenvie um `Message-ID` já existente causa `IntegrityError` → cai no `except` genérico (inbound.py:173-175) → **500** → SendGrid faz retry indefinidamente. Exatamente o loop que RC-3 quer eliminar.
O fix precisa de uma checagem `exists()` **antes** do `create()`, retornando `200` com corpo indicando o descarte.

## RC-8 — `Message-ID` ausente no inbound gera `email_message_id = None`

`_extract_header(headers_str, "Message-ID")` (inbound.py:66) retorna `None` quando o header não existe, e `None` é gravado direto no `create()` (linha 157). Sem `Message-ID` não há chave de idempotência — o fix de RC-3 precisa decidir explicitamente o comportamento (fallback de chave ou aceitar sem dedup) e a condition do índice parcial precisa excluir NULL.

## RC-9 — Throttle anônimo de 30/min aplicado ao webhook inbound

`plane/settings/common.py:121-125`: `DEFAULT_THROTTLE_CLASSES = ("rest_framework.throttling.AnonRateThrottle",)` com `"anon": "30/minute"`.
`PublicHelpdeskInboundEmailEndpoint` é um `APIView` puro e **não sobrescreve `throttle_classes`** → herda o limite global. Como todo o tráfego do SendGrid chega do mesmo conjunto de IPs, um pico de emails legítimos gera `429` → mais retries do SendGrid → agrava RC-3.
O fix de RC-1 (autenticação) deve vir acompanhado de um throttle apropriado ao endpoint, não do anônimo global.

---

## Cobertura de testes atual

`apps/api/plane/tests/unit/helpdesk/test_inbound_email.py` — 8 testes (`test_successful_threading`, `test_sender_validation_fails`, `test_missing_context`, `test_html_parsing`, `test_agent_reply`, `test_references_header_threading`, `test_empty_body_and_missing_from`, `test_contact_email_match`).
Cobrem threading feliz e rejeição de remetente. **Nenhum** cobre: assinatura do webhook, forja de identidade via `from`, nota interna + canal email, replay/duplicata, TLS+SSL simultâneos.
Confirmado: os testes existentes **vão quebrar** quando RC-1 adicionar autenticação (todos postam sem assinatura) e quando RC-3 trocar 404/403 por 200 (`test_sender_validation_fails`, `test_missing_context` assertam os códigos de erro). O Plan precisa contemplar a atualização deles.

---

## Diagnóstico Adicional Necessário
- **UX Diagnose: NÃO** — todos os 5 achados são backend puro (borda HTTP, task Celery, schema do banco, validação de serializer). Nada depende de reprodução visual no browser. A única superfície de UI relacionada (tela de settings SMTP do portal) só importa como origem do input inválido de RC-4, e isso é validável no serializer.
- **VPS Diagnose: NÃO** — as causas raiz foram estabelecidas 100% por leitura de código; nenhuma hipótese depende do estado dos dados em produção. Ressalva para o Stage B (Plan): antes de aplicar a migration da UniqueConstraint de RC-6, será preciso checar se já existem duplicatas de `email_message_id` em produção — isso é uma etapa de **deploy**, não de diagnóstico.

## Próximo Passo
Plan (Stage B)
