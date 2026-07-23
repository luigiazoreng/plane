---
name: celery-task-patterns
description: Padrões de tarefas assíncronas do Plane (apps/api) — @shared_task em plane/bgtasks/, invocação com .delay(), agendamento em celery.py beat_schedule, workers do docker-compose. Leia ANTES de criar ou modificar qualquer job assíncrono ou periódico.
---

# Celery — `apps/api/plane/bgtasks/`

> ⛔ Não existe BullMQ, Redis Queue nem worker em Node neste repo. O broker é o
> `plane-mq` (RabbitMQ) / Redis do `docker-compose-local.yml`; ver `.claude/instructions/stack.md`.

## Onde vive

- Tarefas: `plane/bgtasks/*.py` (uma por domínio: `email_notification_task.py`,
  `issue_activities_task.py`, `deletion_task.py`, `file_asset_task.py`, …)
- App Celery: `apps/api/plane/celery.py` — `Celery("plane")` + `autodiscover_tasks()`
- Agendamento: `app.conf.beat_schedule` no mesmo `celery.py`
- Containers: `worker` (executa) e `beat-worker` (agenda) no `docker-compose-local.yml`

## Definir uma task

```python
# plane/bgtasks/my_domain_task.py
from celery import shared_task

@shared_task
def do_the_thing(entity_id, workspace_id):
    ...
```

Regras:
- Use `@shared_task` (não `@app.task`) — é o padrão do repo e mantém a task desacoplada do app.
- **Argumentos serializáveis apenas**: ids (str/UUID), dicts, listas. ⛔ Nunca passe instância de
  model, `request`, `QuerySet` ou objeto de datetime não serializado — quebra na serialização e
  o dado pode estar velho quando o worker rodar.
- Carregue o objeto **dentro** da task, a partir do id.
- Task precisa ser **idempotente**: pode reexecutar após retry ou redelivery. Antes de criar algo,
  cheque se já existe.
- Trate `DoesNotExist` explicitamente — a entidade pode ter sido apagada entre o enqueue e a
  execução. Deixar estourar polui a fila com falha permanente.
- Task nova em arquivo novo é descoberta automaticamente pelo `autodiscover_tasks()`; não precisa
  registrar, mas o arquivo precisa estar em `plane/bgtasks/`.

## Invocar

```python
from plane.bgtasks.my_domain_task import do_the_thing

do_the_thing.delay(str(entity.id), str(workspace.id))
```

- `.delay(...)` é a forma usada no repo (ver `plane/app/views/**`). `apply_async` só quando
  precisar de `countdown`/`eta`/`queue`.
- ⛔ Nunca chame a task **de dentro** de um `transaction.atomic()` sem cuidado: o worker pode
  pegar o job antes do commit e não achar a linha. Enfileire depois do commit
  (`transaction.on_commit(lambda: task.delay(...))`).
- ⛔ Nunca chame a função diretamente (`do_the_thing(...)`) esperando comportamento assíncrono —
  isso roda inline e bloqueia o request.

## Agendar (periódica)

Em `apps/api/plane/celery.py`, dentro de `app.conf.beat_schedule`:

```python
"check-every-day-to-do-the-thing": {
    "task": "plane.bgtasks.my_domain_task.do_the_thing",
    "schedule": crontab(hour=3, minute=0),  # UTC 03:00
},
```

- O `"task"` é o **caminho pontuado completo** — errar aqui falha em silêncio no beat.
- Horário é **UTC**. Comente o horário, como o resto do arquivo faz.
- Escolha um slot livre: as diárias existentes ocupam 00:00, 01:00, 01:30, 02:00, 02:15…
  Empilhar tudo na mesma hora cria pico de carga.
- Task periódica não recebe argumentos de contexto — ela mesma varre o que precisa processar,
  em lotes.

## Executar e depurar localmente

```bash
docker compose -f docker-compose-local.yml up -d worker beat-worker
docker compose -f docker-compose-local.yml logs -f worker
docker compose -f docker-compose-local.yml logs -f beat-worker
```

Task não roda? Verifique nesta ordem: o `worker` está de pé → o nome no `beat_schedule` bate com
o caminho real → a task foi enfileirada (log do request) → o broker está acessível.

## Testar

Em teste, o caminho normal é **mockar o `.delay`** e asserir que foi chamado com os argumentos
certos; a lógica da task se testa chamando a função diretamente.

```python
from unittest.mock import patch

@patch("plane.app.views.my_module.do_the_thing.delay")
def test_enqueues_task(mock_delay, session_client, project):
    session_client.post(f"/api/workspaces/{project.workspace.slug}/...", data={...})
    mock_delay.assert_called_once_with(str(project.id), str(project.workspace_id))
```

## Checklist antes de fechar

- [ ] `@shared_task` em `plane/bgtasks/`
- [ ] Só argumentos serializáveis (ids), objeto carregado dentro da task
- [ ] Idempotente e tolerante a `DoesNotExist`
- [ ] Enfileirada após o commit quando dentro de transação
- [ ] Periódica: caminho pontuado correto, horário UTC comentado, slot sem conflito
- [ ] Teste cobrindo o enqueue (mock do `.delay`) e a lógica da task
