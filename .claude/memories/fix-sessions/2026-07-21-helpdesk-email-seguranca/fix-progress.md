# Fix Progress — Stage C (TDD RED → GREEN)

Execução do `fix-plan.md` aprovado, com as 2 condições vinculantes do `plan-review.md` aplicadas.
Escopo estrito RC-1..RC-9. Nada commitado — diff deixado na working tree.

## Infra de teste (pré-requisito)

O comando do plano (`python manage.py test plane.tests.unit.helpdesk`) não rodava. Três bloqueios, todos resolvidos:

1. **API em crash-loop** — `plane/app/views/helpdesk/__init__.py` não exportava `HelpdeskPortalEmailLogsEndpoint`, que `plane/app/urls/helpdesk.py:13` importa. Introduzido em `a8454ce251`. Derrubava o `plane-api-1` inteiro e qualquer comando Django. **Fora do escopo RC-1..RC-9, mas corrigido por ser bloqueador absoluto.**
2. **`plane/tests/unit/helpdesk/` sem `__init__.py`** — namespace package faz `unittest.loader.discover` estourar `TypeError: expected str, bytes or os.PathLike object, not NoneType`. Criado arquivo vazio.
3. **Sem Python local** — testes rodados em container one-off da imagem `plane-api` + `factory-boy`/`freezegun`/`pytest` (deps de `requirements/test.txt` ausentes na imagem de runtime).

## Ciclos TDD

### Bloco 1 — Autenticação do webhook (RC-1)
- **Testes**: T1 (`test_inbound_rejects_request_without_secret`, `test_inbound_rejects_malformed_payload_without_secret_before_parsing`), T2 (`test_inbound_rejects_invalid_secret`, `test_inbound_accepts_secret_via_query_param`, `test_inbound_header_takes_precedence_over_query_param`), T3 (`test_inbound_fails_closed_when_secret_not_configured`)
- **RED**: `201 != 403` — o POST forjado como agente criava o comentário. E `400 != 403` — o parsing acontecia antes de qualquer verificação de origem.
- **Fix**: novo `plane/app/helpdesk/inbound_security.py` (`get_inbound_secret` + `verify_inbound_secret`); guard na 1ª linha do `post()`; config var `HELPDESK_INBOUND_WEBHOOK_SECRET` (categoria SMTP, `is_encrypted=True`); redação de `token=` em `plane/middleware/logger.py`; `.env.example` (raiz e `apps/api/`).
- **GREEN**: 14/14. **Status: FIXED**
- Nota TDD: o RED de T2/T3 é estrutural (o seam `plane.app.helpdesk.inbound_security.get_inbound_secret` ainda não existia). O RED **comportamental** que prova RC-1 é o do T1.

### Bloco 2 — Throttle dedicado (RC-9)
- **Teste**: T10 (`test_inbound_throttle_is_above_the_global_anon_rate`)
- **RED**: `429 == 429 : requisição 31 de 35 foi barrada pelo throttle` — o anon global de 30/min confirmado no comportamento, não só na leitura.
- **Fix**: `plane/throttles/helpdesk.py` (`HelpdeskInboundThrottle`, scope `helpdesk_inbound`), rate `600/minute` em `settings/common.py`, `throttle_classes` no view.
- **GREEN**: 15/15. **Status: FIXED**
- Isolamento de cache: `@override_settings(CACHES=LocMemCache)` na classe + `cache.clear()` no `setUp` — o `default` é RedisCache real em `settings/test.py`.

### Bloco 3 — Idempotência + 200 em descartes (RC-3, RC-7, RC-8)
- **Testes**: T4 (`test_replay_of_same_message_id_does_not_duplicate`), T6 (4 testes de chave sintética), + os 3 existentes que mudaram de código
- **RED (6 falhas, todas comportamentais)**: `403 != 200` (unauthorized_sender), `404 != 200` (thread_not_found), `400 != 200` (missing_sender/empty_body), `201 != 200` (replay duplicava), `AssertionError: unexpectedly None` (sem chave de idempotência).
- **Fix**: helper `_discard()` com log estruturado; `_build_synthetic_message_id()` com `Date` na composição; normalização `"" → None`; `exists()` antes do `create()`; `except IntegrityError` no `create()`.
- **GREEN**: 21/21. **Status: FIXED**

### Bloco 4 — UniqueConstraint parcial (RC-5, RC-6)
- **Testes**: `test_partial_unique_constraint_blocks_live_duplicates`, `test_partial_unique_constraint_allows_multiple_nulls`, T5 (`test_duplicate_detection_is_soft_delete_aware`)
- **RED**: `AssertionError: IntegrityError not raised`.
- **Fix**: `HelpdeskRequestComment.Meta.constraints` com `UniqueConstraint` parcial. **Condição vinculante A aplicada**: condition é `Q(deleted_at__isnull=True) & Q(email_message_id__isnull=False)`, **sem** `~Q(email_message_id="")` — sob psycopg3 (binding no servidor, `prepare_threshold=5`) o generic plan não provaria `email_message_id <> ''` a partir de `= $1` e a query cairia em seq scan, reintroduzindo RC-5 silenciosamente. A exclusão de `""` é redundante: o Bloco 3 normaliza na escrita. Raciocínio registrado em comentário no modelo.
- **GREEN**: 23/23. **Status: FIXED**

### Bloco 5 — TLS/SSL mutuamente exclusivos (RC-4)
- **Testes**: T9 (3 testes de serializer), T9b (`TestNormalizeTlsSsl` com 5 casos + 3 testes de task)
- **RED**: `True is not false` (serializer aceitava ambos), `True is not false` (task passava ambos ao `get_connection`), `IntegrityError not raised` (sem CheckConstraint).
- **Fix**: 3 camadas — `HelpdeskPortalSerializer.validate()`; `HelpdeskPortal.Meta` com `CheckConstraint`; `normalize_tls_ssl()` chamada **depois** do bloco `if portal.smtp_host:`, cobrindo a origem de instância que escapa das outras duas.
- **GREEN**. **Status: FIXED**
- **Desvio de método (justificado)**: o plano pedia asserção via `mail.outbox`/`email_status` para o `ValueError` do backend SMTP. Sob `settings/test.py` o `EMAIL_BACKEND` é `locmem`, cujo `__init__` aceita e ignora `use_tls`/`use_ssl` — o `ValueError` **nunca ocorre em teste**, então essa asserção seria vácua. A asserção load-bearing passou a ser os kwargs efetivamente passados a `get_connection` (spy), que é o contrato real violado por RC-4. `email_status == SENT` mantido como asserção secundária.
- **Desvio de cenário (forçado pelo próprio fix)**: o plano previa T9b com portal gravado via `.update()` e ambos os flags. Com o `CheckConstraint` ativo (camada 2), o Postgres rejeita esse `UPDATE` — o cenário deixou de ser construível. Substituído por: (a) unit tests diretos de `normalize_tls_ssl` incluindo a armadilha de tipo `EMAIL_PORT="465"` string; (b) teste da origem de instância ponta a ponta; (c) teste de que o banco rejeita o portal com ambos os flags.

### Bloco 6 — Nota interna nunca sai por email (RC-2)
- **Testes**: T7 (`test_rejects_internal_note_delivered_by_email`, `test_accepts_valid_combinations`), T8 (`test_internal_note_is_not_sent`, `test_public_comment_is_still_sent`), T11 (`test_legacy_comment_stays_editable`, `test_legacy_comment_rejects_reaffirming_the_forbidden_pair`)
- **RED**: `True is not false` (serializer aceitava a combinação), `AssertionError: 1 != 0` (a task enviava o email da nota interna).
- **Fix**: 3 camadas — `HelpdeskRequestCommentSerializer.validate()` com a semântica "rejeitar só quando a combinação é introduzida/reafirmada pelo payload"; `perform_create` não agenda nem marca `PENDING`; guard `is_internal` na task antes do `msg.send()`.
- **GREEN**. **Status: FIXED**
- **Condição vinculante B aplicada**: o "complemento do T11" (verificar o efeito do 3º `RunPython` sobre linhas legadas) **NÃO foi implementado** — migrations rodam na criação do banco de teste, que está vazio, então o teste passaria com 0 linhas antes e 0 depois. O núcleo do T11 (linha legada criada via ORM dentro do teste) **foi** implementado.
- Camada 2 (`perform_create`) ficou sem teste dedicado: com a camada 1 ativa, ela é inalcançável pelo ViewSet. É defesa em profundidade para chamadas fora do ViewSet.

### Bloco 7 — Migration 0155
`0155_helpdesk_email_security.py`, na ordem: 3 `RunPython` de normalização (duplicatas de `email_message_id`; portais com TLS+SSL; `"email"` em `delivery_channels` de notas internas — este com `isinstance(value, list)` conforme sugestão do B2) → `AddConstraint` da `UniqueConstraint` parcial → `AddConstraint` do `CheckConstraint`.
`AlterField` não existe: com `db_index=True` removido, o field não muda.
`makemigrations --check --dry-run` → **No changes detected**. **Status: FIXED**

## Resultado

| Suíte | Antes | Depois |
|---|---|---|
| `plane.tests.unit.helpdesk` (Django runner) | 8 passando | **41 passando** |
| `pytest plane/tests` (repo inteiro) | 291 passando / 25 falhando | **324 passando / 25 falhando** |

As 25 falhas do pytest são **pré-existentes e idênticas**, verificadas por baseline: export de `git archive HEAD` para o scratchpad + apenas o fix do import quebrado, rodado na mesma imagem. `diff` das listas de FAILED → vazio. **Zero regressões.** O delta de +33 passando é exatamente o número de testes novos.
