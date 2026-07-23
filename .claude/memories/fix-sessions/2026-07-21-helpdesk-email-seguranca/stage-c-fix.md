# Stage C: Fix Results
- Modo: fix-pipeline
- Bug: Helpdesk Email — 5 achados Críticos/Altos + 4 causas raiz adicionais
- Fonte: `fix-plan.md` (aprovado) + `plan-review.md` (2 condições vinculantes)

## Resumo
- RC corrigidos com TDD: **9 de 9** (RC-1 a RC-9)
- 🔴 BLOCKED: 0
- Testes: 8 existentes atualizados + 33 novos = **41 passando**
- Regressões: **0** (verificado contra baseline do HEAD)
- Commits: **nenhum** — diff na working tree para revisão

## Condições vinculantes do B2
- **A (condition do índice parcial vs. psycopg3)**: APLICADA. `~Q(email_message_id="")` removido da condition; raciocínio documentado em comentário no modelo.
- **B (complemento vazio do T11)**: APLICADA (opção 1). Complemento não implementado; núcleo do T11 implementado.

## Sugestões menores do B2
- Seam do T9b (`plane.bgtasks.helpdesk_email_task.get_email_configuration`): aplicada, com constante nomeada e comentário.
- SQL de pré-deploy com `delivery_channels @> '["email"]'`: aplicada (ver seção de deploy abaixo).
- 3º `RunPython` tolerando `delivery_channels` não-lista: aplicada via `isinstance(value, list)`.

## Arquivos de produção (13)
- `plane/app/helpdesk/inbound_security.py` (novo)
- `plane/throttles/helpdesk.py` (novo)
- `plane/db/migrations/0155_helpdesk_email_security.py` (novo)
- `plane/app/views/helpdesk/inbound.py`
- `plane/app/views/helpdesk/comment.py`
- `plane/app/serializers/helpdesk.py`
- `plane/bgtasks/helpdesk_email_task.py`
- `plane/db/models/helpdesk.py`
- `plane/middleware/logger.py`
- `plane/settings/common.py`
- `plane/utils/instance_config_variables/core.py`
- `.env.example` e `apps/api/.env.example`
- `plane/app/views/helpdesk/__init__.py` — **fora do escopo, ver abaixo**

## Arquivos de teste (3)
- `plane/tests/unit/helpdesk/test_inbound_email.py` (8 atualizados + 15 novos)
- `plane/tests/unit/helpdesk/test_helpdesk_serializers.py` (novo, 8 testes)
- `plane/tests/unit/helpdesk/test_helpdesk_email_task.py` (novo, 10 testes)
- `plane/tests/unit/helpdesk/__init__.py` (novo, vazio — necessário para a descoberta de testes)

## ⚠️ Correção fora do escopo (exige ciência do dev)
`plane/app/views/helpdesk/__init__.py` não exportava `HelpdeskPortalEmailLogsEndpoint`, importado por `plane/app/urls/helpdesk.py:13`. Introduzido em `a8454ce251`. O container `plane-api-1` estava em **crash-loop** e nenhum comando Django rodava. Corrigido por ser bloqueador absoluto do Stage C. **A branch `feat/email` estava com a API quebrada em HEAD.**

## Ordem de deploy (RC-1) — fail-closed, ativar nesta ordem
1. Definir `HELPDESK_INBOUND_WEBHOOK_SECRET` **e** rodar `python manage.py configure_instance` (ou setar pela UI de admin, seção SMTP). Com `SKIP_ENV_VAR=True` a env var sozinha não é lida — confirmar a linha em `InstanceConfiguration`.
2. Atualizar a URL do Inbound Parse no SendGrid com `?token=...` (ou header, se o provedor permitir).
3. Só então subir o código. Antes disso, todo inbound retorna 403 por desenho.

## SQL de pré-deploy (rodar em produção antes da 0155)
```sql
SELECT count(*) FROM helpdesk_request_comments;

SELECT email_message_id, count(*) FROM helpdesk_request_comments
 WHERE deleted_at IS NULL AND email_message_id IS NOT NULL
 GROUP BY 1 HAVING count(*) > 1;

SELECT id FROM helpdesk_portals WHERE smtp_use_tls AND smtp_use_ssl;

SELECT count(*) FROM helpdesk_request_comments
 WHERE deleted_at IS NULL AND is_internal AND delivery_channels @> '["email"]';
```
Os 3 `RunPython` da 0155 normalizam essas linhas automaticamente; as queries servem para dimensionar o impacto antes.

## Como rodar os testes
Não há Python local. Container one-off sobre a imagem `plane-api` + deps de teste:
```
docker run --rm --network plane_dev_env -v <repo>/apps/api:/code -w /code \
  -e DJANGO_SETTINGS_MODULE=plane.settings.test -e POSTGRES_HOST=plane-db ... \
  plane-api-test python manage.py test plane.tests.unit.helpdesk --noinput
```
`--keepdb` acelera; recriar o banco após mudanças de migration.

## Próximo Passo
Stage D (Review)
