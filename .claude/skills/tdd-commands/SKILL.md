---
name: tdd-commands
description: Comandos TDD reais deste repo (Plane) — pytest/Django no backend, vitest em apps/live, e o que fazer quando o alvo é frontend sem runner. Ler antes de qualquer ciclo RED→GREEN.
---

# TDD Commands (Plane)

> Caminhos, portas e layout completos: `.claude/instructions/stack.md`.

## Escolha do ciclo

| Alvo do fix | Ciclo |
|---|---|
| `apps/api/**` (view, serializer, model, task, util) | **pytest** RED→GREEN |
| `packages/**` com lógica pura | pytest N/A → extrair caso testável ou tratar como frontend |
| `apps/live/**` | **vitest** RED→GREEN |
| `apps/web`, `apps/admin`, `apps/space` | ⛔ **Sem runner.** Ver "Frontend sem runner" abaixo |

## Backend — `apps/api` (pytest)

`pytest.ini` já aplica `--reuse-db --nomigrations -vs --strict-markers`. Não repita essas flags.

```bash
cd apps/api

# RED — o teste DEVE falhar, e a mensagem de falha deve ser sobre o bug
python -m pytest plane/tests/unit/test_alvo.py::TestAlvo::test_caso

# GREEN — mesmo comando, depois do fix mínimo
python -m pytest plane/tests/unit/test_alvo.py::TestAlvo::test_caso

# Arquivo inteiro / marker / suíte
python -m pytest plane/tests/contract/app/test_alvo.py
python -m pytest -m unit
python -m pytest
```

Onde colocar o teste:

| Fix em | Teste em | Marker | Fixture de auth |
|---|---|---|---|
| model / serializer / util | `plane/tests/unit/` | `unit` | — |
| view sob `/api/` (app) | `plane/tests/contract/app/` | `contract` | `session_client` |
| view sob `/api/v1/` (externa) | `plane/tests/contract/api/` | `contract` | `api_key_client` |
| fluxo crítico ponta a ponta | `plane/tests/smoke/` | `smoke` | conforme o fluxo |

```python
import pytest

@pytest.mark.contract
class TestInboundWebhook:
    def test_rejects_unverified_sender(self, session_client, workspace):
        response = session_client.post("/api/helpdesk/inbound/", data={...})
        assert response.status_code == 403
        assert response.json()["error"] == "sender_not_verified"
```

Se a mudança alterar schema:
```bash
python manage.py makemigrations
python manage.py migrate
```

## `apps/live` (vitest)

```bash
pnpm --filter live test
```

## Frontend sem runner — `web` / `admin` / `space`

Não existe jest, vitest nem Playwright nesses apps. **Não escreva que rodou testes.**

Substituto obrigatório do ciclo TDD:
```bash
pnpm --filter web check:types    # tem que passar
pnpm --filter web check:lint
pnpm --filter web build          # só se o fix mexeu em rotas/build
```
E validação de comportamento via browser (agente `gem-browser-tester`) contra
`http://localhost:3000`.

No registro do fix, declarar honestamente:
```
- RED/GREEN: N/A (apps/web sem runner de teste)
- Validação: check:types ✅ + browser ✅ (cenário: [descrição])
```

## Regras

1. RED e GREEN são **dois runs separados** com saída real. Sem RED, não há fix.
2. Se o RED passar de primeira, o teste está errado — reescreva, não prossiga.
3. Máx. 3 tentativas por finding; depois `git checkout -- <arquivo-de-produção>` e marque BLOCKED.
4. Nunca declarar suíte verde sem ter rodado `python -m pytest` no serviço tocado.
