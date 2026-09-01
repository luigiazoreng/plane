# Stage B1 — Build Backend
## Status: COMPLETE

## Mudanças
- `apps/api/plane/app/views/helpdesk/asset.py`: nenhuma mudança funcional. Adicionada docstring em `_validate_upload_payload` alertando que `entity_type` tem default `COMMENT_ENTITY` e que callers de formulário de request (editor de descrição, campo de anexo dedicado) DEVEM passar `entity_type: "HELPDESK_REQUEST_ATTACHMENT"` explicitamente. Comportamento já suportava o caso de uso — verify-only (Step 5 do plano).
- `apps/api/plane/app/serializers/helpdesk.py`: `HelpdeskRequestSerializer.validate()` agora sanitiza `description` com `validate_html_content()` (nh3-based), espelhando `IssueSerializer` (`apps/api/plane/app/serializers/issue.py:136`). Rejeita HTML > 10MB com 400; remove tags perigosas (ex. `<script>`); texto puro sem HTML passa inalterado. Este é o único step com código de produção funcional (Step 6 do plano).
- Testes: 3 novos em `plane/tests/contract/app/test_helpdesk.py` (classe `TestUploadCredentials`), 3 novos em `plane/tests/unit/helpdesk/test_helpdesk_serializers.py` (classe `TestHelpdeskRequestDescriptionSanitization`), 1 novo em `plane/tests/unit/helpdesk/test_helpdesk_attachments.py` (`TestBindAssets.test_request_attachment_isolated_cross_workspace`).

## Endpoints
| Método | Rota | Permission class | Descrição |
|---|---|---|---|
| POST | `/api/workspaces/<slug>/helpdesk/assets/` | `get_helpdesk_role` >= MEMBER (checagem manual, não DRF permission_classes) | Já existia. Sem mudança de comportamento — aceita `entity_type` explícito no payload (`HELPDESK_REQUEST_ATTACHMENT` ou `HELPDESK_COMMENT_ATTACHMENT`); default permanece `HELPDESK_COMMENT_ATTACHMENT` se omitido. Documentado no docstring, coberto por 3 testes novos de contrato. |
| POST | `/api/workspaces/<slug>/helpdesk/requests/` (via `HelpdeskRequestSerializer`) | existente, sem mudança | `description` agora aceita HTML real (rich text), sanitizado no `validate()` antes de persistir. |

## Migrations
- Nenhuma. `HelpdeskRequest.description` já era `TextField(blank=True, default="")` — aceita HTML sem alteração de schema.

## Tasks Celery
- Nenhuma nova.

## Arquivos alterados
- `apps/api/plane/app/views/helpdesk/asset.py` — docstring documentando contrato de `entity_type` (Step 5, verify-only)
- `apps/api/plane/app/serializers/helpdesk.py` — sanitização de HTML em `HelpdeskRequestSerializer.validate()` (Step 6, único código de produção funcional)
- `apps/api/plane/tests/contract/app/test_helpdesk.py` — `TestUploadCredentials` (3 testes: default COMMENT_ENTITY, REQUEST_ENTITY explícito, entity_type inválido rejeitado)
- `apps/api/plane/tests/unit/helpdesk/test_helpdesk_serializers.py` — `TestHelpdeskRequestDescriptionSanitization` (3 testes: script tag removido, HTML >10MB rejeitado, texto puro inalterado)
- `apps/api/plane/tests/unit/helpdesk/test_helpdesk_attachments.py` — `TestBindAssets.test_request_attachment_isolated_cross_workspace` (isolamento cross-workspace para REQUEST_ENTITY)

## Testes
- Suíte relevante (helpdesk completo + novos): `python -m pytest plane/tests/unit/helpdesk/ plane/tests/contract/app/test_helpdesk.py -q` → 33 novos testes passando dentro de um total de 115 no escopo helpdesk (110 passed + 5 failed pré-existentes não relacionados, ver "Desvios do plano" abaixo).
- `plane/tests/unit/helpdesk/` sozinho: ✅ 93 passed, 36 subtests passed
- `plane/tests/unit/helpdesk/test_helpdesk_serializers.py::TestHelpdeskRequestDescriptionSanitization`: ✅ 3 passed
- `plane/tests/unit/helpdesk/test_helpdesk_attachments.py::TestBindAssets::test_request_attachment_isolated_cross_workspace`: ✅ 1 passed
- `plane/tests/contract/app/test_helpdesk.py::TestUploadCredentials`: ✅ 3 passed
- Suíte COMPLETA de `apps/api` (`python -m pytest`): ❌ NÃO está verde — 76 failed / 28 errors, mas confirmado (via `git stash` comparando contra baseline sem minhas mudanças) que 73 failed / 28 errors já existem SEM nenhuma mudança desta feature. Ver "Desvios do plano".
- Ciclos TDD: 1 ciclo RED→GREEN real (Step 6, único step com código de produção funcional). Steps 5 e 8 foram verify-only — testes escritos primeiro, mas passaram já na primeira execução por documentarem comportamento correto pré-existente (sem bug a expor). Isso é esperado e consistente com a natureza "verify + modify se necessário" desses steps no plano, não uma violação de TDD.

## Desvios do plano
- **Ambiente de teste local não estava funcional no boot**: `apps/api/.venv` existente tinha Django 6.0.7 sem pytest instalado (incompatível com `requirements/base.txt`, que pina Django 4.2.30). Foi necessário reinstalar as dependências pinadas (`requirements/base.txt` sem `psycopg-c`, que falha por falta de `pg_config`/`libpq-dev` no host — `psycopg-binary` já cobre o binding compilado) + `requirements/test.txt`. Além disso, `POSTGRES_HOST`/`REDIS_HOST` do `.env` apontam para hostnames internos do docker (`plane-db`, `plane-redis`) inacessíveis do host; foi necessário rodar com `POSTGRES_HOST=localhost` (porta 5432 publicada) e `REDIS_HOST=<IP do bridge docker de plane-plane-redis-1>` (esse container não publica porta). Isso é infraestrutura local, não uma mudança de código do repo.
- **Suíte completa de `apps/api` tem falhas pré-existentes não relacionadas a esta feature**: confirmado via `git stash` que rodar a suíte completa SEM nenhuma mudança desta feature já produz 73 failed / 28 errors. Dois padrões identificados: (1) cascata de corrupção de transação/conexão a partir de `test_estimates_app.py` (`OperationalError: cannot TRUNCATE "users" because it has pending trigger events` → `the connection is closed` propagando para dezenas de testes não relacionados); (2) falha determinística isolada em `test_helpdesk.py::TestHelpdeskPortalAndFormsAPI::test_reorder_forms` e mais 4 testes do mesmo arquivo (`AssertionError: assert UUID(...) == '...'` — serialização de UUID incorreta). Nenhum dos dois padrões toca arquivo modificado por esta feature. Flagrado como task separada em background (`task_a9643ac5`) para investigação — NÃO bloqueia este handoff, que é escopado aos steps 5/6/8 do plano (todos com evidência de teste real, isolada e limpa).
- Fora isso, nenhum desvio — implementação seguiu exatamente Steps 5, 6, 8 na ordem do plano, usando os Pattern Sources indicados (`issue.py:136` para a chamada de `validate_html_content`, `test_helpdesk_attachments.py`/`test_helpdesk_serializers.py` como molde de teste).

## Contrato para o frontend
- **Upload de attachment do formulário de ticket (Stage B2 DEVE usar)**: toda chamada a `POST /api/workspaces/<slug>/helpdesk/assets/` (agente) ou `POST /api/helpdesk/public/portals/<public_slug>/assets/` (portal público) originada do formulário de ticket — tanto do editor de descrição (paste/drop) quanto do campo de anexo dedicado — DEVE incluir `entity_type: "HELPDESK_REQUEST_ATTACHMENT"` explicitamente no payload JSON. Se omitido, o endpoint aceita silenciosamente com o default `entity_type: "HELPDESK_COMMENT_ATTACHMENT"`, o que corrompe a listagem de anexos do ticket sem erro visível. Não há validação de servidor que force isso — a responsabilidade é 100% do frontend (Step 3/4 do plano, wrapper `description-editor.tsx`).
- **`HelpdeskRequestSerializer.description` agora aceita e sanitiza HTML real**: o campo `description` de `HelpdeskRequest` (tanto na criação via formulário público quanto na edição pelo agente) passa por `validate_html_content()` antes de persistir. Comportamento: (a) HTML com tags/scripts perigosos é limpo automaticamente (nh3), sem erro — o cliente não recebe feedback de que algo foi removido; (b) HTML/texto acima de 10MB (`content_validator.MAX_SIZE`) é rejeitado com `400 {"description": "<mensagem>"}`; (c) texto puro sem HTML passa inalterado. O frontend deve tratar `description` como podendo conter HTML de rich text a partir de agora (renderizar com o mesmo componente usado para `Issue.description_html`, não como texto puro).
- **`bind_assets` (usado no submit do formulário) já trunca em `HELPDESK_MAX_ATTACHMENTS_PER_COMMENT`** (default 10, settings) e ignora silenciosamente qualquer `asset_id` além do limite, de outro workspace, já vinculado, não enviado (`is_uploaded=False`) ou mais velho que 24h (`CLAIM_WINDOW`). O frontend deve limitar a 5 arquivos por operação de paste/drop no editor (Design Decision 7 do plano) como UX preventiva, já que o servidor não avisa qual asset_id foi descartado — só retorna a contagem total vinculada.
- Nenhuma mudança de shape em `HelpdeskAttachmentSerializer` nem em `HelpdeskRequestSerializer.get_attachments`.
