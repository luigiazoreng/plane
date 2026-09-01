# Fix Plan — Helpdesk Email (RC-1 a RC-9) — **revisão pós-B2**

> **Revisão 2** (pós `plan-review.md`). Endereça os 3 bloqueadores, os 4 importantes e as 3
> sugestões. Mudanças materiais em relação à revisão 1 estão marcadas com **[B2-#N]**.

## Bug
Code review da feature de email do helpdesk (branch `feat/email`) identificou 5 achados
Críticos/Altos, todos CONFIRMADOS pelo Stage A1: webhook inbound sem autenticação (RC-1),
nota interna vazando por email (RC-2), ausência de idempotência no inbound (RC-3),
`smtp_use_tls` + `smtp_use_ssl` simultâneos quebrando todo envio do portal (RC-4),
`email_message_id` sem índice (RC-5).

O Stage A1 encontrou 4 causas raiz adicionais que **condicionam** a correção:
RC-6 (unique simples quebra com soft delete), RC-7 (constraint sozinha vira 500 + retry loop),
RC-8 (Message-ID ausente = sem chave de idempotência), RC-9 (AnonRateThrottle 30/min barra o SendGrid).

**Escopo estrito**: RC-1 a RC-9. Achados Médios/Menores do review original ficam FORA.

## Root Cause
Ver `root-cause.md`. Resumo por arquivo:
- `plane/app/views/helpdesk/inbound.py:26` — `AllowAny` sem verificação de origem; autoriza pelo campo `from` do multipart (forjável). Retorna 404/403/400 em descartes de negócio → SendGrid faz retry infinito. `create()` na linha 148 sem checagem de duplicata. Sem `throttle_classes` → herda anon 30/min.
- `plane/app/serializers/helpdesk.py:248-259` — `HelpdeskRequestCommentSerializer` com `fields="__all__"`; `is_internal` e `delivery_channels` graváveis, sem `validate()`.
- `plane/app/views/helpdesk/comment.py:66-84` — `perform_create` dispara o email sem consultar `is_internal`.
- `plane/bgtasks/helpdesk_email_task.py:24-125` — task nunca referencia `is_internal`; linhas 87-96 passam `use_tls` e `use_ssl` juntos a `get_connection()` → `ValueError` → todo email do portal vira FAILED.
- `plane/db/models/helpdesk.py:236` — `email_message_id` sem `db_index`, sem constraint; `Meta` sem `constraints`/`indexes`.
- `plane/db/models/helpdesk.py:57-58` — `smtp_use_tls`/`smtp_use_ssl` independentes, sem `CheckConstraint`.
- `HelpdeskRequestComment` herda `SoftDeleteModel` (`db/mixins.py:56-82`) → `unique=True` no field enxergaria linhas soft-deletadas.

## Abordagem

Sete blocos de mudança, ordenados por dependência:

---

### Bloco 1 — Autenticação do webhook (RC-1)

Segredo compartilhado de instância, validado **antes** de qualquer parsing.

> ⚠️ **Decisão técnica**: o bug-report sugere validar a assinatura ECDSA
> `X-Twilio-Email-Event-Webhook-Signature`. Esse mecanismo pertence ao **Event Webhook** do SendGrid,
> **não ao Inbound Parse**, que só permite configurar a URL de destino — não envia cabeçalhos
> customizados nem assina o payload. **ECDSA não é implementável aqui.**
> Mecanismo escolhido: token secreto aceito via header `X-Helpdesk-Inbound-Secret` **ou**
> query param `?token=` (o Inbound Parse permite query string na URL configurada).

#### 1a. Seam único e explícito **[B2-#2]**

A revisão 1 tinha um contrato contraditório (view chamava `verify_inbound_secret`, testes
patchavam `get_inbound_secret` no módulo do view → `AttributeError`). Contrato fixado:

```
plane/app/helpdesk/inbound_security.py
    get_inbound_secret() -> str            # lê a config; retorna "" se ausente
    verify_inbound_secret(request) -> bool # chama get_inbound_secret() DO PRÓPRIO MÓDULO

plane/app/views/helpdesk/inbound.py
    from plane.app.helpdesk.inbound_security import verify_inbound_secret
    # primeira linha do post(): if not verify_inbound_secret(request): return 403
```

**Regra para os testes**: patchar sempre
`plane.app.helpdesk.inbound_security.get_inbound_secret`.
Nunca `plane.app.views.helpdesk.inbound.*`. Como `verify_inbound_secret` resolve
`get_inbound_secret` pelo namespace do próprio módulo em tempo de chamada, o patch funciona
independentemente de como o view importa. O seam fica num lugar só.

#### 1b. Leitura do segredo com fallback de env explícito **[B2-#3]**

```python
# dentro de get_inbound_secret()
(secret,) = get_configuration_value([
    {
        "key": "HELPDESK_INBOUND_WEBHOOK_SECRET",
        "default": os.environ.get("HELPDESK_INBOUND_WEBHOOK_SECRET", ""),
    }
])
return secret or ""
```

Motivo: com `SKIP_ENV_VAR=True` (padrão do self-hosted), `get_configuration_value`
(`plane/license/utils/instance_value.py:19-33`) **ignora `os.environ`** e lê só de
`InstanceConfiguration`; se a chave não existir na tabela, devolve `key.get("default")`.
Sem o `default` explícito, o segredo resolveria para `None` → fail-closed → 403 em 100% do
inbound. O `default` acima replica o padrão de `get_email_configuration()`.

Registro da config em `plane/utils/instance_config_variables/core.py`:
`{"key": "HELPDESK_INBOUND_WEBHOOK_SECRET", "value": os.environ.get("HELPDESK_INBOUND_WEBHOOK_SECRET", ""), "category": "SMTP", "is_encrypted": True}`
(categoria `SMTP` para reaproveitar a seção existente da UI de admin, em vez de criar uma nova).

#### 1c. Comparação e precedência **[B2-#7, B2-#10]**

- Ordem de leitura: **header primeiro; query param só como fallback**. Reduz a superfície de
  vazamento para os provedores que conseguem enviar header.
- Comparação em **bytes**: `hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))`.
  `compare_digest` com `str` só aceita ASCII puro; um segredo com caractere não-ASCII levantaria
  `TypeError` → `except Exception` genérico → 500 → **retry infinito do SendGrid**, o oposto de RC-3.
- Token ausente ou vazio → `403` sem tentar comparar.

#### 1d. Contenção do vazamento do token na query string **[B2-#7 — premissa corrigida]**

O `plan-review.md` atribui o vazamento ao Sentry. **Verifiquei: não há `sentry_sdk` em `apps/api`**
(`grep -rn "sentry_sdk.init"` → zero resultados; `plane/utils/exception_logger.py` só usa o
`logging` stdlib e não toca na request). O vetor real é outro e está confirmado:

**`plane/middleware/logger.py:62`** — `f"{request.method} {request.get_full_path()} {response.status_code}"`.
`get_full_path()` **inclui a query string**, então o token seria logado em **toda** requisição
inbound, não só nos 500. Mitigações:
1. No `RequestLoggerMiddleware`, redigir o valor do parâmetro `token` antes de logar
   (substituir por `token=***`). Correção pontual e localizada.
2. Nenhum `logger.*` do `inbound.py` pode emitir `request.get_full_path()` nem `request.GET`.
3. Nginx/proxy: o access log padrão registra a query string. Documentar no handoff de deploy
   que o header é o caminho preferido e que o log do proxy deve ser considerado ao rotacionar.
4. **Rotação**: o segredo é rotacionável sem migration — atualizar a config (env + `configure_instance`
   ou UI de admin) e a URL no SendGrid. Documentar o procedimento.

#### 1e. Fail-closed

Segredo não configurado (`""`) → `403`. Não retornar 200 silencioso: descartaria emails legítimos
sem rastro. Um 403 constante é falha ruidosa e detectável. Token ausente/errado → `403` (é abuso,
não descarte de negócio; **não** deve virar 200).

---

### Bloco 2 — Throttle dedicado (RC-9)

`HelpdeskInboundThrottle(AnonRateThrottle)`, `scope="helpdesk_inbound"`, `rate="600/minute"`,
declarado em `throttle_classes` do view (sobrescreve o anon global de 30/min).

**Por-IP (via `AnonRateThrottle`) e não global**: o throttle roda em `initial()`, antes do handler
— logo antes da validação do segredo. Um bucket global permitiria a um atacante anônimo esgotar
a cota e causar DoS no tráfego legítimo do SendGrid. Por-IP isola: o pool de IPs do SendGrid tem
bucket próprio.

---

### Bloco 3 — Idempotência + resposta 200 em descartes (RC-3, RC-7, RC-8)

- Checagem `exists()` explícita em `email_message_id` **antes** do `create()` → `200` com
  `{"success": True, "detail": "duplicate"}`.
- `create()` envolto em `try/except IntegrityError` → também `200 duplicate` (cobre corrida entre
  dois retries concorrentes do SendGrid, em que ambos passam pelo `exists()`).
- Descartes por decisão de negócio passam a `200` com `detail`:
  `thread_not_found` (era 404), `unauthorized_sender` (era 403), `missing_sender` (era 400),
  `empty_body` (era 400). Regra: **qualquer não-2xx faz o SendGrid re-tentar**, e nenhuma dessas
  condições melhora com retry. O `500` do `except` genérico permanece — esse sim merece retry.
  O `403` de autenticação (Bloco 1) permanece — não é descarte de negócio.

#### 3a. Observabilidade dos descartes **[B2-#9]**

`logger.warning` sozinho não compensa a perda dos 4xx nas métricas do provedor. O caso mais grave
é `thread_not_found`: um cliente respondendo a uma thread soft-deletada some sem rastro para o
agente. Mitigação neste escopo:
```python
logger.warning("inbound discarded", extra={"detail": "thread_not_found", "hd_request_id": ...})
```
`detail` como campo estruturado permite alerta por contagem. **Registrar em `issues-not-fixed.md`**
que descartes de inbound merecem métrica/contador dedicado (fora do escopo).

#### 3b. RC-8 — chave de idempotência quando falta `Message-ID` **[B2-#4 — proposta revisada]**

A revisão 1 propunha `sha256(parent_id | from_email | corpo)`. **Rejeitada pelo B2, com razão**:
respostas curtas repetidas ("ok", "obrigado", "segue anexo") são o padrão dominante em thread de
suporte, e o descarte seria silencioso e irrecuperável (200 → SendGrid nunca re-tenta → o agente
nunca vê a mensagem).

**Composição adotada** — incluir o header `Date`:
```
email_message_id = "<" + sha256(f"{parent_comment.id}|{from_email}|{date_header}|{body_key}") + "@synthetic.inbound>"
```
- `date_header` = `self._extract_header(headers_str, "Date")` — o `_extract_header` existente
  (`inbound.py:28`) já lê esse header do campo `headers` bruto do Inbound Parse, sem mudança nenhuma.
- `body_key` = **`text_body.strip()`**, aplicado **depois** do fallback HTML→texto
  (`generate_plain_text_from_html`). Definido explicitamente para o Fix agent não inventar. **[B2-#4]**
- Domínio `@synthetic.inbound` garante não colisão com Message-IDs reais.
- **Propriedade preservada**: retry do SendGrid → payload idêntico → mesmo `Date` → mesma chave →
  dedup funciona. Dois envios deliberados → `Date` difere (granularidade de segundo) → ambos criados.
- **Fallback**: `Date` ausente → cair na chave sem ele (comportamento da revisão 1). Janela residual
  de colisão: duas mensagens idênticas no mesmo segundo — incomparavelmente mais estreita.
- Normalizar `""` → `None` na extração do `Message-ID`, para não gravar string vazia.
- **Risco residual**: inbound grava `email_status=SENT` (achado Médio, fora do escopo), então o
  outbound pode usar um ID sintético como `In-Reply-To`. Threading no cliente degrada marginalmente.
  Registrar em `issues-not-fixed.md`.

---

### Bloco 4 — Constraint única soft-delete aware (RC-5, RC-6)

Em `HelpdeskRequestComment.Meta`:
```python
constraints = [
    models.UniqueConstraint(
        fields=["email_message_id"],
        condition=Q(deleted_at__isnull=True) & Q(email_message_id__isnull=False) & ~Q(email_message_id=""),
        name="helpdesk_comment_unique_email_message_id",
    )
]
```

**Não usar `unique=True` no field**: o índice único do banco enxerga linhas soft-deletadas
(`SoftDeletionManager` filtra só no ORM) → comentário deletado + reenvio do mesmo Message-ID →
`IntegrityError` → 500 → retry infinito. Exatamente o loop que RC-3 elimina.

**`db_index=True` REMOVIDO** **[B2-#8]**. A revisão 1 pedia `db_index=True` *além* da constraint.
As duas queries que motivam RC-5 (`inbound.py:85` e `:92`) usam o manager `objects`
(`SoftDeletionManager`), que injeta `deleted_at IS NULL`. A query final é
`email_message_id = X AND deleted_at IS NULL` — **já atendida pelo índice único parcial**, cuja
condition é implicada pelo predicado com `X` não-nulo. O `db_index=True` criaria um segundo índice
**não-parcial sobre a tabela inteira**, e é justamente ele que carregaria o custo de build e de
lock no deploy. RC-5 fica resolvido **pelo índice parcial**, sem índice adicional.

---

### Bloco 5 — TLS/SSL mutuamente exclusivos (RC-4)

**Três defesas, cobrindo as duas origens do `ValueError`** **[B2-#6]**:

1. **Portal (serializer)**: `HelpdeskPortalSerializer.validate()` rejeita `smtp_use_tls=True` **e**
   `smtp_use_ssl=True` simultâneos. Ler com o padrão já usado no método
   (`attrs.get(x, getattr(instance, x, default))`) para funcionar em `PATCH` parcial.
2. **Portal (banco)**: `HelpdeskPortal.Meta.constraints` com
   `CheckConstraint(check=~(Q(smtp_use_tls=True) & Q(smtp_use_ssl=True)), name="helpdesk_portal_smtp_tls_ssl_exclusive")`.
3. **Instância (task)** — a origem que a revisão 1 **não cobria**. A task só sobrescreve TLS/SSL
   `if portal.smtp_host:` (`helpdesk_email_task.py:82`). Quando o portal **não** tem `smtp_host`,
   os valores vêm de `get_email_configuration()` — config de instância com `EMAIL_USE_TLS=1` e
   `EMAIL_USE_SSL=1` escapa do serializer **e** do `CheckConstraint`.

   **Normalização posicionada imediatamente antes do `get_connection()`**, ou seja **depois** do
   bloco `if portal.smtp_host:`, operando sobre as variáveis finais
   `EMAIL_USE_TLS` / `EMAIL_USE_SSL` / `EMAIL_PORT`:
   ```
   se EMAIL_USE_TLS == "1" e EMAIL_USE_SSL == "1":
       porta = int(EMAIL_PORT) protegido por try/except (ValueError, TypeError) → fallback 587
       porta == 465 → EMAIL_USE_TLS = "0"   (prefere SSL)
       senão        → EMAIL_USE_SSL = "0"   (prefere TLS)
       logger.warning(...)
   ```
   **Armadilha de tipo coberta**: sem `portal.smtp_host`, `EMAIL_PORT` é **string** vinda da config
   de instância — um teste `smtp_port == 465` falharia silenciosamente. Por isso a comparação é
   `int(EMAIL_PORT) == 465`, protegida contra porta não-numérica.

---

### Bloco 6 — Nota interna nunca sai por email (RC-2)

Defesa em três camadas:

1. **`HelpdeskRequestCommentSerializer.validate()`** — rejeitar `is_internal=True` +
   `"email" in delivery_channels` com `ValidationError` (400).

   **Semântica precisa: rejeitar apenas quando a combinação é INTRODUZIDA pelo payload** **[B2-#5]**.
   Com a leitura ingênua (fallback ao `instance` nos dois campos), um comentário **já gravado** com
   a combinação — possível hoje, é exatamente o bug RC-2 — passaria a receber 400 em **qualquer**
   `PATCH`, inclusive um que só edite `content` (`comment.py:46-51` também invoca `validate()`).
   A linha viraria permanentemente ineditável.

   Regra a implementar:
   - `create` → rejeitar sempre que a combinação resultante for inválida.
   - `partial_update` → rejeitar **somente** se o payload contiver `is_internal` ou
     `delivery_channels` e o resultado for a combinação proibida. Se nenhum dos dois campos vier no
     payload, deixar passar mesmo que o `instance` já seja inválido (essas linhas são normalizadas
     pela migration — ver Bloco 7, passo 3).

2. **`HelpdeskRequestCommentViewSet.perform_create`** — só agendar
   `send_helpdesk_comment_email.delay()` se `"email" in delivery_channels and not comment.is_internal`;
   `email_status` só vira `PENDING` na mesma condição.

3. **`send_helpdesk_comment_email`** — guard antes do `msg.send()`: se `comment.is_internal`, gravar
   `email_status=NOT_SENT`, `email_error="Internal note is not delivered by email."`, publicar SSE e
   retornar. Cobre chamadas por qualquer outro caminho (incluindo re-enfileiramento manual).

**Consumidores do serializer — confirmado pelo B2**: os 4 usos fora do ViewSet são de
serialização apenas (`validate()` não roda em leitura): `portal.py:136`, `comment.py:112`,
`comment.py:142`. `PublicHelpdeskCommentEndpoint.post` (`comment.py:135`) e o inbound
(`inbound.py:148`) criam via ORM direto. Nenhum quebra.

---

### Bloco 7 — Migration (uma só)

`0155_helpdesk_email_security.py`, **nesta ordem**:

1. `RunPython` — normalizar duplicatas de `email_message_id` entre linhas não deletadas:
   por grupo duplicado, manter a mais antiga (`created_at`), setar as demais para `NULL`.
   Reverse = `noop`. **Sem isso o índice único falha no deploy.**
2. `RunPython` — normalizar portais com `smtp_use_tls` e `smtp_use_ssl` ambos `True`:
   `smtp_port == 465` → `smtp_use_tls=False`; caso contrário → `smtp_use_ssl=False`.
   Reverse = `noop`. **Sem isso o `CheckConstraint` falha no deploy.**
3. **`RunPython` — normalizar comentários legados com `is_internal=True`** **[B2-#5]**:
   remover `"email"` de `delivery_channels`. Reverse = `noop`. Elimina as linhas que o novo
   `validate()` tornaria problemáticas e restaura a simetria com o tratamento do RC-4.
4. `AlterField` em `email_message_id` — **só se houver mudança de field**. Com o `db_index=True`
   removido (**[B2-#8]**), o field não muda: **este passo cai**.
5. `AddConstraint` da `UniqueConstraint` parcial.
6. `AddConstraint` do `CheckConstraint` de TLS/SSL.

Os `RunPython` usam `apps.get_model(...)`; o manager dos modelos históricos é o `models.Manager`
puro (sem filtro de soft delete), então as queries enxergam todas as linhas — o passo 1 precisa
filtrar `deleted_at__isnull=True` explicitamente.

**`AddIndexConcurrently` NÃO é necessário** **[resposta ao R5]**. Justificativa verificada pelo B2:
`email_message_id` foi introduzido em `0152`, e `0152/0153/0154` estão na branch `feat/email`,
**ainda não mergeada em `stable-1.3.1`**. Em produção a coluna ou não existe ou é 100% NULL, e o
índice único é **parcial excluindo NULL** → índice efetivamente vazio, build instantâneo. Manter a
migration simples e atômica. O custo de lock que justificaria `AddIndexConcurrently` estava no
`db_index=True` não-parcial — que foi removido.

---

## Arquivos a Modificar

### Produção

| Arquivo | Mudança | RC | Risco |
|---------|---------|----|-------|
| `apps/api/plane/app/helpdesk/inbound_security.py` (novo) | `get_inbound_secret()` (com `default` de env explícito) + `verify_inbound_secret(request)`; header > query param; `compare_digest` em bytes; fail-closed | RC-1 | baixo |
| `apps/api/plane/throttles/helpdesk.py` (novo) | `HelpdeskInboundThrottle(AnonRateThrottle)`, scope `helpdesk_inbound` | RC-9 | baixo |
| `apps/api/plane/app/views/helpdesk/inbound.py` | `verify_inbound_secret(request)` no topo do `post()`; `throttle_classes`; `exists()` + `except IntegrityError`; 404/403/400 de negócio → 200 com `detail`; chave sintética com `Date`; log estruturado dos descartes | RC-1,3,7,8,9 | **alto** |
| `apps/api/plane/middleware/logger.py` | redigir `token=` na query string antes de logar `get_full_path()` (linha 62) | RC-1 | baixo |
| `apps/api/plane/db/models/helpdesk.py` | `HelpdeskRequestComment.Meta.constraints` com `UniqueConstraint` parcial; `HelpdeskPortal.Meta.constraints` com `CheckConstraint` TLS/SSL. **Sem `db_index=True`** | RC-4,5,6 | médio |
| `apps/api/plane/db/migrations/0155_helpdesk_email_security.py` (novo) | 3 `RunPython` de normalização + 2 `AddConstraint` | RC-2,4,5,6 | **alto** (deploy) |
| `apps/api/plane/app/serializers/helpdesk.py` | `HelpdeskPortalSerializer.validate()`: TLS+SSL exclusivos. `HelpdeskRequestCommentSerializer.validate()` (novo): bloquear a combinação **quando introduzida pelo payload** | RC-2,4 | médio |
| `apps/api/plane/app/views/helpdesk/comment.py` | `perform_create`: não agendar email nem marcar `PENDING` quando `is_internal` | RC-2 | baixo |
| `apps/api/plane/bgtasks/helpdesk_email_task.py` | guard `is_internal` antes do `msg.send()`; normalização TLS/SSL **imediatamente antes do `get_connection()`**, com `int(EMAIL_PORT)` protegido | RC-2,4 | médio |
| `apps/api/plane/utils/instance_config_variables/core.py` | `HELPDESK_INBOUND_WEBHOOK_SECRET`, categoria `SMTP`, `is_encrypted=True` | RC-1 | baixo |
| `apps/api/plane/settings/common.py` | `DEFAULT_THROTTLE_RATES["helpdesk_inbound"] = "600/minute"` | RC-9 | baixo |
| `.env.example` e `apps/api/.env.example` | documentar `HELPDESK_INBOUND_WEBHOOK_SECRET` | RC-1 | baixo |

### Testes

| Arquivo | Cenário |
|---------|---------|
| `apps/api/plane/tests/unit/helpdesk/test_inbound_email.py` | **atualizar os 8 existentes** + T1..T6, T10 |
| `apps/api/plane/tests/unit/helpdesk/test_helpdesk_email_task.py` (novo) | T8, T9b |
| `apps/api/plane/tests/unit/helpdesk/test_helpdesk_serializers.py` (novo) | T7, T9, T11 |

---

## Atualização dos 8 testes existentes (obrigatória)

Todos postam sem segredo → virariam `403` com o Bloco 1. Dois assertam códigos que mudam.

### Infra do `TestInboundEmailParsing` **[B2-#1, B2-#2]**

**Isolamento de cache — NÃO usar `cache.clear()` sobre o cache default.** Verificado:
`plane/settings/common.py:225-242` define o cache `default` como `django_redis.cache.RedisCache`
em **todos** os ambientes, e `plane/settings/test.py` **não sobrescreve `CACHES`**. `cache.clear()`
faria **FLUSHDB no Redis real** compartilhado com dev e com suítes paralelas, e o estado do
throttle sobreviveria entre execuções (o cache não é recriado como o banco de teste), tornando
T10 dependente de ordem e do histórico da máquina.

Correção — decorar a classe de teste:
```python
@override_settings(CACHES={"default": {
    "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    "LOCATION": "helpdesk-inbound-tests",
}})
class TestInboundEmailParsing(APITestCase):
```
Com LocMemCache, `cache.clear()` no `setUp` passa a ser seguro e suficiente — e é o que o T10 exige.
*Alternativa considerada*: adicionar o override de `CACHES` em `plane/settings/test.py`, o que
beneficiaria toda a suíte. Preferido o override na classe por ser mais estreito e não alterar o
comportamento de testes fora deste escopo; se o Fix preferir a versão global, é aceitável.

**Seam de mock**: `mock.patch("plane.app.helpdesk.inbound_security.get_inbound_secret",
return_value="test-inbound-secret")` com `addCleanup`. **Nunca** patchar
`plane.app.views.helpdesk.inbound.*` — o view importa `verify_inbound_secret`, não
`get_inbound_secret`, e o patch falharia com `AttributeError`.

**Helper**: `self._post(payload, secret="test-inbound-secret")`, injetando
`HTTP_X_HELPDESK_INBOUND_SECRET` e `format="multipart"`. Todos os testes passam a usá-lo.

| Teste | Mudança |
|-------|---------|
| `test_successful_threading` | usar `_post`. Asserts inalterados (201) |
| `test_sender_validation_fails` | **403 → 200**; `detail == "unauthorized_sender"`; contagem continua 1 |
| `test_missing_context` | **404 → 200**; `detail == "thread_not_found"`; contagem continua 1 |
| `test_html_parsing` | usar `_post`. Asserts inalterados (201) |
| `test_agent_reply` | usar `_post`. Asserts inalterados (201) |
| `test_references_header_threading` | usar `_post`. Asserts inalterados (201) |
| `test_empty_body_and_missing_from` | **400 → 200** nos dois cenários; `detail == "missing_sender"` e `detail == "empty_body"`; nenhum comentário criado |
| `test_contact_email_match` | usar `_post`. Asserts inalterados (201) |

---

## Especificação TDD

### T1 — webhook rejeita requisição sem segredo
**Arquivo**: `test_inbound_email.py` · **Tipo**: integration
**O que testa**: RC-1 — nenhum processamento sem prova de origem.
**RED**: hoje o POST sem cabeçalho nenhum retorna 201 e cria o comentário.
**GREEN**: `403`; contagem de comentários da thread continua 1.
**Edge cases**: o 403 acontece **antes** de qualquer parsing (payload malformado + sem segredo → 403,
não 400/500). **`hd_request.first_responded_at` continua `None`** — o impacto de SLA levantado no
RC-1 não era assertado em lugar nenhum. **[B2 — lacuna de cobertura]**

### T2 — webhook rejeita segredo inválido
**Arquivo**: `test_inbound_email.py` · **Tipo**: integration
**RED**: header ignorado, retorna 201.
**GREEN**: `403`, nenhum comentário criado.
**Edge cases**: token truncado (`"test-inbound-secr"`) → 403 (igualdade completa, não `startswith`);
segredo aceito também via query param `?token=`; **header tem precedência sobre query param**
(header válido + query inválido → 201; header inválido + query válido → 403).

### T3 — segredo não configurado → fail-closed
**Arquivo**: `test_inbound_email.py` · **Tipo**: integration
**RED**: sem o conceito de segredo, 201.
**GREEN**: com `plane.app.helpdesk.inbound_security.get_inbound_secret` mockado para `""`,
qualquer POST (com ou sem token) → `403`, nenhum comentário criado.

### T4 — replay do mesmo Message-ID não duplica
**Arquivo**: `test_inbound_email.py` · **Tipo**: integration · **RC-3 + RC-7**
**RED**: dois POSTs idênticos criam 2 comentários (total 3 na thread).
**GREEN**: 1º POST `201`; 2º POST `200` com `detail == "duplicate"`; total na thread = 2.
**Edge cases**: o 2º POST não pode retornar 500 nem alterar `first_responded_at`.

### T5 — duplicata é soft-delete aware
**Arquivo**: `test_inbound_email.py` · **Tipo**: integration · **RC-6**
**RED**: com `unique=True` no field, o cenário levantaria `IntegrityError` → 500.
**GREEN**: criar comentário com `email_message_id="<dup@x>"`, `.delete()` (soft), POST inbound com o
mesmo Message-ID → `201`, comentário criado, sem exceção.
**Edge cases**: `HelpdeskRequestComment.all_objects.filter(email_message_id="<dup@x>").count() == 2`.

### T6 — Message-ID ausente: chave sintética com `Date` **[B2-#4 — revisado]**
**Arquivo**: `test_inbound_email.py` · **Tipo**: integration · **RC-8**
**RED**: hoje grava `email_message_id=None`; um retry duplicaria o comentário.
**GREEN**: POST sem header `Message-ID` (mas **com** `Date`) → `201`; `email_message_id` não nulo,
terminado em `@synthetic.inbound>`. Repetir o **mesmo** payload → `200 duplicate`, sem novo comentário.
**Edge cases**:
- Dois emails sem `Message-ID`, **mesmo corpo**, **`Date` diferente** → **ambos criados**
  (é a propriedade que motivou a revisão: "ok"/"obrigado" repetidos não são engolidos).
- Dois emails sem `Message-ID` com corpos diferentes → ambos criados.
- Sem `Message-ID` **e** sem `Date` → fallback para a chave sem `Date`; retry idêntico ainda dedupa.

### T7 — serializer bloqueia nota interna com canal email
**Arquivo**: `test_helpdesk_serializers.py` · **Tipo**: unit · **RC-2 camada 1**
**RED**: `HelpdeskRequestCommentSerializer(data={... is_internal: True, delivery_channels: ["email"] ...}).is_valid()` → `True`.
**GREEN**: `is_valid()` é `False`; `errors` menciona `is_internal` ou `delivery_channels`.
**Edge cases**: `is_internal=True` + `[]` → válido; `is_internal=False` + `["email"]` → válido;
`PATCH` que **adiciona** `"email"` a um comentário já `is_internal=True` → inválido.

### T8 — task não envia email de nota interna
**Arquivo**: `test_helpdesk_email_task.py` · **Tipo**: unit · **RC-2 camada 3**
**RED**: `mail.outbox` recebe 1 mensagem com o conteúdo interno.
**GREEN**: comentário criado via ORM com `is_internal=True`, `delivery_channels=["email"]`;
`send_helpdesk_comment_email(comment.id)` → `len(mail.outbox) == 0`; `email_status == NOT_SENT`;
`email_error` preenchido.
**Edge cases**: equivalente com `is_internal=False` → `len(mail.outbox) == 1` e `email_status == SENT`
(prova que o guard não é curto-circuito universal).

### T9 — portal rejeita TLS e SSL simultâneos
**Arquivo**: `test_helpdesk_serializers.py` · **Tipo**: unit · **RC-4**
**RED**: `HelpdeskPortalSerializer` aceita ambos `True`.
**GREEN**: `is_valid()` é `False` com erro nos campos SMTP.
**Edge cases**: só TLS → válido; só SSL → válido; nenhum → válido; `PATCH` setando `smtp_use_ssl=True`
num portal que já tem `smtp_use_tls=True` no banco → inválido (cobre o `getattr(instance, ...)`).

### T9b — task normaliza TLS/SSL nas DUAS origens **[B2-#6 — ampliado]**
**Arquivo**: `test_helpdesk_email_task.py` · **Tipo**: unit · **RC-4**
**RED**: `get_connection` levanta `ValueError` → `email_status == FAILED`.
**GREEN (origem portal)**: portal gravado via `.update()` (bypass do serializer) com ambos `True` e
`smtp_port=465` → envia (`len(mail.outbox) == 1`), `email_status == SENT`.
**Edge cases**:
- Origem portal com `smtp_port=587` → também envia (prefere TLS).
- **Origem instância**: portal **sem `smtp_host`** + config de instância com `EMAIL_USE_TLS="1"` e
  `EMAIL_USE_SSL="1"` (mockar `get_email_configuration`) → envia, `email_status == SENT`.
  Este caminho escapa do serializer e do `CheckConstraint` — é a origem que a revisão 1 não cobria.
- Mesmo cenário de instância com `EMAIL_PORT="465"` (**string**) → escolhe SSL corretamente,
  provando que a comparação usa `int(EMAIL_PORT)` e não igualdade de string.

### T10 — throttle do inbound acima do anon global
**Arquivo**: `test_inbound_email.py` · **Tipo**: integration · **RC-9**
**RED**: a 31ª requisição retorna `429`.
**GREEN**: 35 POSTs válidos e distintos (Message-IDs diferentes) → **nenhum** `429`.
**Edge cases**: depende do `@override_settings(CACHES=LocMemCache)` da classe + `cache.clear()` no
`setUp`; asserção adicional de que `HelpdeskInboundThrottle` está em
`PublicHelpdeskInboundEmailEndpoint.throttle_classes`.

### T11 — comentário legado permanece editável **[B2-#5 — novo]**
**Arquivo**: `test_helpdesk_serializers.py` · **Tipo**: unit · **RC-2, regressão**
**O que testa**: o novo `validate()` não torna linhas pré-existentes ineditáveis.
**RED**: com o `validate()` ingênuo (fallback ao `instance` nos dois campos), um `PATCH` que só
altera `content` num comentário já gravado com `is_internal=True` + `["email"]` retorna 400.
**GREEN**: esse `PATCH` é **válido** (`is_valid()` é `True`) — nenhum dos dois campos veio no payload.
**Edge cases**: no mesmo comentário legado, um `PATCH` que envie `delivery_channels=["email"]`
explicitamente → **inválido** (a combinação está sendo reafirmada pelo payload).
**Complemento**: teste de dados verificando que o `RunPython` do passo 3 removeu `"email"` de
`delivery_channels` nas linhas com `is_internal=True`.

**Total**: 8 testes existentes atualizados + 12 novos (T1–T11, com T9b contado à parte).

---

## Riscos de Regressão

| # | Risco | Severidade | Mitigação |
|---|-------|-----------|-----------|
| R1 | Migration falha no deploy: duplicatas de `email_message_id`, portal com TLS+SSL, ou comentário legado interno+email | **alta** | Os **3** `RunPython` rodam antes dos `AddConstraint` na mesma migration. SQL de pré-deploy abaixo. |
| R2 | Ativar o segredo derruba o inbound até o SendGrid ser reconfigurado | **alta** | Fail-closed é intencional. Ver "Ordem de deploy" — corrigida para contemplar `SKIP_ENV_VAR`. |
| R3 | Descartes 200 sem observabilidade adequada | média | `detail` estruturado no `logger.warning` (3a). Métrica dedicada registrada em `issues-not-fixed.md`. |
| R4 | Chave sintética descarta mensagem legítima | **baixa** (era média) | Mitigado pelo `Date` na chave **[B2-#4]**. Residual: duas mensagens idênticas no mesmo segundo. |
| R5 | Lock de índice no deploy | **baixa** (era média) | `AddIndexConcurrently` desnecessário: `email_message_id` nasceu em `0152`, não mergeada em `stable-1.3.1` → coluna inexistente ou 100% NULL, e o índice é parcial excluindo NULL. O `db_index=True` não-parcial, que carregava o custo real, foi **removido** **[B2-#8]**. |
| R6 | Novo `validate()` quebra fluxos existentes | **baixa** (era média) | Confirmado por leitura: os 4 usos fora do ViewSet são só serialização; portal público e inbound criam via ORM direto. `partial_update` tratado pela semântica "introduzido pelo payload" + `RunPython` do passo 3 **[B2-#5]**. |
| R7 | Frontend envia TLS+SSL e passa a receber 400 sem tratamento | baixa | Fora do escopo. Registrar em `issues-not-fixed.md`. |
| R8 | Throttle por-IP pode saturar em pico | baixa | 600/min por IP é ~20x o volume esperado. Ajustável via `DEFAULT_THROTTLE_RATES`. |
| R9 | `X-Forwarded-For` mal configurado colapsa IPs num bucket | baixa | Herdado do `AnonRateThrottle` global já existente; não é regressão nova. |
| R10 | **Token vazando em log** **[B2-#7]** | média | `plane/middleware/logger.py:62` loga `get_full_path()` **com query string** — verificado. Redigir `token=` ali. Não há `sentry_sdk` no `apps/api` (verificado), então esse vetor específico não se aplica. Preferir header; documentar rotação. |

### SQL de pré-deploy (rodar em produção antes da `0155`)
```sql
-- volume da tabela (decide se algum lock importa)
SELECT count(*) FROM helpdesk_request_comments;

-- R1: duplicatas que a constraint rejeitaria
SELECT email_message_id, count(*) FROM helpdesk_request_comments
 WHERE deleted_at IS NULL AND email_message_id IS NOT NULL
 GROUP BY 1 HAVING count(*) > 1;

-- R1: portais que o CheckConstraint rejeitaria
SELECT id FROM helpdesk_portals WHERE smtp_use_tls AND smtp_use_ssl;

-- R6: comentários legados que o novo validate() tornaria ineditáveis
SELECT count(*) FROM helpdesk_request_comments
 WHERE deleted_at IS NULL AND is_internal AND delivery_channels::text LIKE '%email%';
```

### Ordem de deploy do segredo (RC-1) **[B2-#3 — corrigida]**
1. Definir a env var `HELPDESK_INBOUND_WEBHOOK_SECRET` **e** rodar
   `python manage.py configure_instance` — ou setar pela UI de admin, seção SMTP.
   **Confirmar que a linha existe em `InstanceConfiguration`**: com `SKIP_ENV_VAR=True` (padrão do
   self-hosted) a env var sozinha **não** é lida; apenas o `default` da chamada a
   `get_configuration_value` (Bloco 1b) evita o `None`.
2. Atualizar a URL do Inbound Parse no SendGrid com `?token=...` (ou header, se o provedor permitir).
3. Só então subir o código.

---

## Fora do escopo (registrar em `repo/issues-not-fixed.md` no fim do pipeline)
- Inbound grava `email_status=SENT` em vez de `RECEIVED` (agrava o risco residual de RC-8).
- `smtp_password` em texto plano no banco (contrasta com o `is_encrypted=True` do segredo do webhook).
- UI de settings do portal deveria tornar TLS/SSL mutuamente exclusivos (R7).
- Descartes de inbound merecem métrica/contador dedicado, não só log (R3 / **[B2-#9]**).
- Demais achados Médios/Menores do review original.

## Serviços para build+test
Somente `apps/api` (Django). Nenhuma mudança de frontend.

```
cd apps/api
python manage.py makemigrations --check --dry-run     # migration deve estar completa
python manage.py migrate                              # aplicar 0155
python manage.py test plane.tests.unit.helpdesk       # 8 atualizados + 12 novos
```
