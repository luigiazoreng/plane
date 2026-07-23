# Stage B: Plan — revisão 2 (pós-B2)

- Arquivos produção: 12 (3 novos: `inbound_security.py`, `throttles/helpdesk.py`, migration `0155`)
- Arquivos teste: 3 (1 atualizado, 2 novos)
- Testes TDD: 20 (8 existentes atualizados + 12 novos)
- Risco geral: **alto** (migration com constraints + fail-closed no webhook exigem ordem de deploy)

## Status do B2
`plan-review.md` retornou CHANGES_REQUESTED: 3 bloqueadores, 4 importantes, 3 sugestões.
**Todos os 10 endereçados** nesta revisão.

| # | Item | Resolução |
|---|------|-----------|
| 1 | `cache.clear()` sobre Redis compartilhado | `@override_settings(CACHES=LocMemCache, LOCATION="helpdesk-inbound-tests")` na classe de teste; `cache.clear()` no `setUp` passa a ser seguro |
| 2 | Seam de mock contraditório | Contrato único: view importa `verify_inbound_secret`; ela chama `get_inbound_secret()` do próprio módulo; testes patcham `plane.app.helpdesk.inbound_security.get_inbound_secret` |
| 3 | Ordem de deploy inválida sob `SKIP_ENV_VAR` | Leitura com `default` de env explícito no `get_configuration_value`; ordem reescrita para exigir `configure_instance` (ou UI de admin) antes de subir o código |
| 4 | RC-8 — chave sintética | Adotado o header `Date` na chave; `body_key` definido como `text_body.strip()` pós-fallback HTML→texto; T6 reescrito com o caso "mesmo corpo, Date diferente → ambos criados" |
| 5 | PATCH torna comentário legado ineditável | `validate()` só rejeita quando a combinação é **introduzida pelo payload**; + 3º `RunPython` na `0155` removendo `"email"` de `delivery_channels` onde `is_internal=True`; + teste T11 |
| 6 | RC-4 cobria só a origem portal | Normalização movida para **imediatamente antes do `get_connection()`**, sobre as variáveis finais, com `int(EMAIL_PORT)` protegido; T9b ampliado com a origem de instância e com `EMAIL_PORT` string |
| 7 | Token vaza em log | **Premissa do B2 corrigida**: não há `sentry_sdk` em `apps/api` (verificado). O vetor real é `plane/middleware/logger.py:62`, que loga `get_full_path()` **com query string** — redigir `token=` ali. Header tem precedência sobre query param; rotação documentada |
| 8 | `db_index=True` redundante | **Removido**. O índice único parcial já atende `email_message_id = X AND deleted_at IS NULL` (o manager é `SoftDeletionManager`). Passo `AlterField` da migration cai junto |
| 9 | Observabilidade dos descartes 200 | `logger.warning(..., extra={"detail": ..., "hd_request_id": ...})`; métrica dedicada registrada em `issues-not-fixed.md` |
| 10 | `compare_digest` com `str` não-ASCII | Comparação em **bytes** (`.encode("utf-8")` nos dois lados) — um `TypeError` viraria 500 → retry infinito |

## Decisões-chave (detalhes em `fix-plan.md`)
- **RC-1**: ECDSA não se aplica ao Inbound Parse (é do Event Webhook). Token secreto de instância
  (`HELPDESK_INBOUND_WEBHOOK_SECRET`, categoria SMTP, `is_encrypted=True`), header > query param,
  `compare_digest` em bytes, fail-closed.
- **RC-2**: 3 camadas (serializer com semântica "introduzido pelo payload", `perform_create`, task).
- **RC-3/RC-7**: `exists()` + `except IntegrityError`, ambos → `200 duplicate`. Descartes de negócio
  (404/403/400) → 200 com `detail`; `403` de auth e `500` genérico permanecem.
- **RC-4**: serializer + `CheckConstraint` + normalização na task cobrindo a origem de instância.
- **RC-5/RC-6**: só `UniqueConstraint` parcial soft-delete aware. Nunca `unique=True`, nunca
  `db_index=True` adicional.
- **RC-8**: `sha256(parent_id | from | Date | text_body.strip())@synthetic.inbound`.
- **RC-9**: `HelpdeskInboundThrottle(AnonRateThrottle)` por-IP a 600/min.

## Nota de deploy
SQL de pré-deploy (4 queries, incluindo `count(*)` da tabela e comentários legados internos+email)
e a ordem de ativação do segredo estão em `fix-plan.md`, seção "Riscos de Regressão".

## Pontos abertos para a re-review
- Nenhum bloqueador conhecido em aberto.
- Escolha estilística deixada ao Fix: `override_settings(CACHES=...)` na classe de teste (preferido,
  mais estreito) vs. override global em `plane/settings/test.py` (beneficia toda a suíte). Ambos aceitáveis.
