# Stack do Repositório (Plane)

> Referência única de caminhos, comandos e ferramentas. **Agentes não devem repetir comandos
> inline** — apontam para este arquivo. Se um comando aqui estiver errado, corrija AQUI.

## Layout

| Caminho | O que é | Runtime |
|---|---|---|
| `apps/api` | Backend — Django + DRF. Código em `apps/api/plane/` | Python |
| `apps/web` | App principal — React Router v7 (SPA). Dev: porta **3000** | Node |
| `apps/admin` | Painel admin — React Router v7. Dev: porta **3001** | Node |
| `apps/space` | Portal público — React Router v7. Dev: porta **3002** | Node |
| `apps/live` | Servidor de colaboração (Hocuspocus). Único app com testes JS (**vitest**) | Node |
| `apps/proxy` | Nginx | — |
| `packages/*` | Libs compartilhadas: `ui`, `types`, `services`, `constants`, `hooks`, `utils`, `editor`, `i18n`, `propel` | Node |

Monorepo **pnpm + turbo**. Shell: **bash / Linux**. ⛔ Não use PowerShell
(`Get-ChildItem`, `New-Item`, `Invoke-WebRequest`, `findstr`).

## Backend — `apps/api` (Django, pytest)

Testes ficam em `apps/api/plane/tests/`:
- `unit/` — models, serializers, utils (marker `unit`)
- `contract/api/` — endpoints externos `/api/v1/`, auth por API key (fixture `api_key_client`)
- `contract/app/` — endpoints do app `/api/`, auth por sessão (fixture `session_client`)
- `smoke/` — fluxos críticos · `e2e/` — requer Mailpit
- `conftest.py` — fixtures · `factories.py` — factories

```bash
cd apps/api

# Teste único (RED/GREEN) — pytest.ini já traz --reuse-db --nomigrations -vs
python -m pytest plane/tests/unit/test_x.py::TestX::test_y

# Arquivo / diretório / marker
python -m pytest plane/tests/contract/app/test_x.py
python -m pytest -m unit

# Suíte completa
python -m pytest

# Migrations
python manage.py makemigrations
python manage.py migrate
python manage.py showmigrations <app>
```

Padrão de teste:
```python
import pytest

@pytest.mark.unit
class TestMySerializer:
    def test_rejects_invalid_payload(self):
        serializer = MySerializer(data={"field": ""})
        assert not serializer.is_valid()
        assert "field" in serializer.errors
```

## Frontend — `apps/web`, `apps/admin`, `apps/space`

⛔ **Não existe runner de teste unitário nestes apps** (sem jest, sem vitest, sem Playwright
configurado). Não invente `npm run test` / `npx playwright test` aqui.

Verificação disponível:
```bash
pnpm --filter web check:types     # react-router typegen && tsc --noEmit
pnpm --filter web check:lint      # oxlint
pnpm --filter web build           # react-router build
pnpm build                        # turbo: todos os apps
```
Trocar `web` por `admin` / `space` conforme o app.

Validação de comportamento de frontend = **browser** (agente `gem-browser-tester`), não teste
automatizado. Um "TDD RED→GREEN" de frontend só é possível se a lógica estiver num
`packages/*` testável ou em `apps/live`.

## `apps/live` (único app JS com testes)

```bash
pnpm --filter live test     # vitest run
```

## Ambiente local

```bash
docker compose -f docker-compose-local.yml up -d   # plane-db, plane-redis, plane-mq, plane-minio, api, worker, beat-worker, mailpit
docker compose -f docker-compose-local.yml ps
pnpm dev                                            # turbo: web(3000) admin(3001) space(3002) live
```

## Regras de comando para agentes

1. Sempre `bash`, sempre caminho relativo à raiz do repo.
2. Antes de afirmar "testes passando", rode o comando real e cole a saída.
3. Se o alvo do fix é frontend puro, **não prometa TDD** — declare `TDD: N/A (sem runner)` e
   valide por `check:types` + browser.
4. Nunca referencie `assistant-api`, `account-api`, `channel-api`, `assistant-front`,
   `a4c dev`, TypeORM, Redux ou BullMQ — não existem neste repo.
