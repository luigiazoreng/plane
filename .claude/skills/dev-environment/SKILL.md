---
name: dev-environment
description: Como verificar e subir o ambiente de desenvolvimento do Plane — containers do docker-compose-local.yml (postgres, redis, rabbitmq, minio, api, worker, mailpit) e os dev servers do pnpm. Leia antes de rodar testes de integração, seed ou qualquer validação no browser.
---

# Ambiente de Desenvolvimento — Plane

> Portas e layout completos: `.claude/instructions/stack.md`.
> ⛔ Shell é bash/Linux. Não há `a4c` CLI, nem docker-compose por serviço.

## 1. Containers

Um único arquivo na raiz: `docker-compose-local.yml`.

```bash
docker compose -f docker-compose-local.yml ps
```

| Serviço | Papel | Porta host |
|---|---|---|
| `plane-db` | PostgreSQL 15 | 5432 |
| `plane-redis` | Valkey (cache) | — |
| `plane-mq` | RabbitMQ (broker do Celery) | — |
| `plane-minio` | S3 local (uploads) | 9000 / 9090 |
| `api` | Django/DRF | **8000** |
| `worker` | Celery worker | — |
| `beat-worker` | Celery beat (agendador) | — |
| `migrator` | roda as migrations e sai | — |
| `mailpit` | SMTP de teste + UI | 1025 / **8025** |

Subir tudo:
```bash
docker compose -f docker-compose-local.yml up -d
```

Subir só o necessário (mais rápido quando você só quer rodar pytest):
```bash
docker compose -f docker-compose-local.yml up -d plane-db plane-redis
```

Jobs assíncronos precisam também de `plane-mq`, `worker` e — se for periódico — `beat-worker`.

O `migrator` **sai com código 0** depois de aplicar as migrations. `Exited (0)` nele é normal,
não é falha.

## 2. Verificar saúde

```bash
curl -s -o /dev/null -w 'api: %{http_code}\n' --max-time 3 http://localhost:8000/api/
docker compose -f docker-compose-local.yml logs --tail 40 api
docker compose -f docker-compose-local.yml logs --tail 40 worker
```

Docker Engine parado (`Cannot connect to the Docker daemon`) → **PARE** e peça ao dev para
iniciar o Docker. Não tente contornar.

## 3. Dev servers do frontend

```bash
pnpm install     # só quando as deps mudarem
pnpm dev         # turbo: web(3000) admin(3001) space(3002) live
```

Um app só:
```bash
pnpm --filter web dev
```

⛔ `pnpm dev` é **foreground** e não retorna. Nunca o chame por tool esperando que termine —
peça ao dev para rodar em outro terminal e confirmar. Verifique por HTTP:

```bash
for p in 3000 3001 3002; do
  printf '%s: ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 3 "http://localhost:$p" || echo offline
done
```

## 4. Comandos do Django

Rode do host (com `plane-db` up):
```bash
cd apps/api
python manage.py migrate
python manage.py shell -c "<código>"
python -m pytest
```

Ou dentro do container, quando o ambiente Python local não estiver configurado:
```bash
docker compose -f docker-compose-local.yml exec api python manage.py migrate
```

## 5. E-mail em desenvolvimento

Nada sai de verdade: o `mailpit` captura tudo. Interface em **http://localhost:8025**. É lá que
se confere fluxo de convite, notificação e helpdesk.

## 6. Ordem de diagnóstico

Quando algo não funciona, siga nesta ordem antes de suspeitar do código:

1. Docker Engine de pé?
2. `docker compose ps` — algum container `Exited` (fora o `migrator`)?
3. `logs api` — erro de migration, de env var ou de conexão?
4. `plane-db` aceita conexão na 5432?
5. Job não roda → `worker` está de pé? `plane-mq` também?
6. Frontend não carrega dado → a API responde na 8000? o `.env` do app aponta para ela?
