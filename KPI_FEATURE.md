# KPI Feature - Plane

Este documento serve como base técnica, histórico de desenvolvimento e rastreador de tarefas (TODO) para a implementação do **Motor de KPI** no Plane.

## Visão Geral da Feature

O módulo de KPI pontua tarefas de um time de TI e aplica uma **penalidade (ou bônus)** em função do atraso/antecipação na entrega. Cada tarefa recebe um **valor planejado** `Vp` (soma de pontos de Dificuldade, Repetitividade, Importância, Prioridade e Tipo) e um **valor final** `Vf = Vp · p`, onde `p` é um multiplicador que decai conforme os dias de atraso `d`.

Todas as tabelas de pontos e fatores são **editáveis pelo usuário**, e o usuário pode **escolher entre dois modos de penalidade**: com "zona morta" (`dead_zone`) ou contínuo (`continuous`). Não há números "mágicos" no código — tudo vem da configuração.

**Roadmap de integração:**

1. **Fase atual — Projects:** o KPI pontua os _work items_ (issues) existentes de cada projeto.
2. **Futuro — Helpdesk:** o mesmo motor pontuará `HelpdeskRequest` (ver [HELPDESK_FEATURE.md](HELPDESK_FEATURE.md)), reaproveitando a camada de cálculo.

---

## Decisões de Arquitetura

> Decisões tomadas com o desenvolvedor antes do início da implementação.

### D1 — Fonte das tarefas: **reutilizar work items do Plane (issues)**

O motor **não** cria uma entidade de tarefa própria. Ele pontua os `Issue` já existentes. Os campos da spec são mapeados aos campos nativos do Plane sempre que possível, e os que faltam ficam em uma tabela lateral de atributos KPI por issue.

| Campo da spec (seção 3)    | Origem no Plane                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `id` / `nome`              | `Issue.id` / `Issue.name`                                                                         |
| `priority` (P)             | `Issue.priority` (`urgent`/`high`/`medium`/`low`/`none`) — pontos e `b` vêm da config de Priority |
| `due_date` (prazo)         | `Issue.target_date`                                                                               |
| `delivered_date` (entrega) | `Issue.completed_at` (preenchido quando a issue entra em estado `completed`)                      |
| `type` (T)                 | `Issue.type` → `IssueType` (mapeado por nome na config de Type; default 0)                        |
| `difficulty` (D)           | **novo** — `KpiIssueAttribute.difficulty`                                                         |
| `repetitive` (R)           | **novo** — `KpiIssueAttribute.repetitive`                                                         |
| `importance` (I)           | **novo** — `KpiIssueAttribute.importance`                                                         |

> Os valores categóricos de `difficulty`, `repetitive`, `importance` e `type` só aceitam níveis que existam na config vigente (validação na escrita).

### D2 — Escopo da configuração: **por projeto, com herança do workspace**

- Um `KpiConfig` é resolvido na ordem: **config do projeto** → **config default do workspace** → **defaults da seção 4 (hard-coded apenas como bootstrap/seed)**.
- O usuário pode criar/editar uma config no nível de projeto. Sem config de projeto, herda a do workspace.
- A config inteira (tabelas + parâmetros) é versionada em um único campo `JSONField` seguindo o contrato da seção 7, mais colunas indexáveis para os parâmetros mais consultados.

### D3 — Motor de cálculo puro e isolado

A camada de cálculo (`plane/kpi/engine.py`) é uma função pura `calcular(task_fields, config) -> {Vp, d, p, Vf}` sem acesso a banco. Isso permite:

- Testes unitários determinísticos (os 6 casos da seção 9).
- Reuso direto pelo Helpdesk na fase futura.
- Recálculo no frontend (preview da curva) a partir do mesmo contrato JSON.

---

## Glossário de variáveis

| Símbolo | Nome                    | Origem                                                           |
| ------- | ----------------------- | ---------------------------------------------------------------- |
| `D`     | Difficulty              | tabela de pontos, por nível                                      |
| `R`     | Repetitive              | tabela de pontos, por nível                                      |
| `I`     | Importance              | tabela de pontos, por nível                                      |
| `P`     | Priority                | tabela de pontos, por nível                                      |
| `T`     | Type                    | tabela de pontos, por nível (padrão 0)                           |
| `b`     | fator de prioridade     | atrelado a cada nível de prioridade                              |
| `k`     | fator de suavização     | global (0–1), inclinação após o valor zerar                      |
| `d`     | dias de atraso          | `delivered_date − due_date`, conforme `day_count`/`day_rounding` |
| `Vp`    | valor planejado         | `Vp = D + R + I + P + T`                                         |
| `p`     | multiplicador de atraso | função de `b`, `k`, `d` e do modo                                |
| `Vf`    | valor final             | `Vf = Vp · p`                                                    |

- `d > 0` atrasada · `d = 0` no prazo · `d < 0` antecipada (bônus).
- `T` entra na soma de `Vp`, mas seu valor padrão é 0 em todos os níveis.
- Se `delivered_date` (`completed_at`) estiver vazio, a issue está **em aberto**: não calcular `Vf` (status "pendente").

---

## Estrutura de Modelos (Backend - Django)

Os modelos herdam de `WorkspaceBaseModel` (workspace FK obrigatório, project nullable) — mesma base do Helpdesk. Arquivo: `apps/api/plane/db/models/kpi.py`.

### 1. `KpiConfig` — Configuração editável (D2)

- Campos:
  - `workspace` (FK, obrigatório), `project` (FK, **nullable** — null = config default do workspace).
  - `name` (Char) — rótulo da config.
  - `tables` (JSON) — tabelas de pontos de D/R/I/P/T conforme contrato da seção 7.
  - `penalty_mode` (Char, choices `continuous`|`dead_zone`, default `continuous`).
  - `k` (Float, default 0.5, validado 0–1).
  - `day_count` (Char, `calendar`|`business`, default `calendar`).
  - `day_rounding` (Char, `truncate`|`round`|`ceil`, default `truncate`).
  - `allow_negative` (Bool, default `true`).
  - `max_multiplier` (Float, **nullable**, default null).
  - `vf_decimals` (Int, default 2).
  - `is_active` (Bool, default true).
- `db_table`: `kpi_configs`
- `unique_together`: `["workspace", "project", "deleted_at"]` (1 config por projeto; project=null = default do workspace).

> Os parâmetros globais ficam em colunas próprias (consultáveis/validáveis); as tabelas de pontos ficam no JSON `tables` por serem livremente editáveis (add/remove níveis).

### 2. `KpiIssueAttribute` — Atributos KPI por issue (D1)

- Campos:
  - `workspace` (FK), `project` (FK), `issue` (OneToOne FK → `Issue`).
  - `difficulty` (Char, nullable) — nível da tabela Difficulty.
  - `repetitive` (Char, nullable) — nível da tabela Repetitive.
  - `importance` (Char, nullable) — nível da tabela Importance.
  - `type_override` (Char, nullable) — opcional; se null, usa `Issue.type.name` mapeado na tabela Type.
- `db_table`: `kpi_issue_attributes`
- `unique_together`: `["issue", "deleted_at"]`

> `priority` **não** é duplicada aqui — vem de `Issue.priority`. `due_date`/`delivered_date` vêm de `Issue.target_date`/`Issue.completed_at`.

### 3. `KpiResult` (opcional — cache de resultado)

Materializa o último cálculo para listagem/agregação rápida, recalculado sempre que a issue ou a config mudar.

- Campos: `workspace`, `project`, `issue` (OneToOne), `vp` (Float), `d` (Int, nullable), `p` (Float, nullable), `vf` (Float, nullable), `computed_at` (DateTime), `config` (FK → `KpiConfig`).
- `db_table`: `kpi_results`

> **Decisão de implementação:** começar **sem** `KpiResult` (calcular on-the-fly no serializer) e só introduzir o cache se a listagem ficar lenta. Marcado como fase opcional abaixo.

---

## Núcleo do Cálculo (`plane/kpi/engine.py`)

Função pura, sem banco. Espelha exatamente as seções 5 e 6 da spec.

### Valor planejado

```
Vp = pontos(D) + pontos(R) + pontos(I) + pontos(P) + pontos(T)
```

### Dias de atraso

```
d_bruto = delivered_date - due_date     # conforme day_count (calendar|business)
d       = aplicar(day_rounding, d_bruto)  # truncate|round|ceil → inteiro
```

### Termo base

```
t = 1 - b * d      # b vem do nível de prioridade da tarefa
```

### Multiplicador `p` — depende do modo

**CONTÍNUO** (`continuous`):

```
p = max(0, t) + k * min(0, t)
```

Equivalente por trechos:

```
d <= 1/b  ->  p = 1 - b*d          (inclinação -b)
d >  1/b  ->  p = k * (1 - b*d)    (inclinação -k*b, contínuo em 1/b)
```

**ZONA MORTA** (`dead_zone`):

```
p = max(0, 1 - b*d) + min(0, 1 - k*b*d)
```

Equivalente por trechos:

```
d <= 1/b            ->  p = 1 - b*d     (inclinação -b)
1/b < d <= 1/(k*b)  ->  p = 0           (ZONA MORTA, platô em zero)
d > 1/(k*b)         ->  p = 1 - k*b*d   (inclinação -k*b)
```

### Pós-processamento

```
se max_multiplier != null:  p = min(p, max_multiplier)
Vf = Vp * p
se allow_negative == false:  Vf = max(0, Vf)
Vf = arredondar(Vf, vf_decimals)
```

### Comportamento de `k`

| `k`   | Efeito                                                               |
| ----- | -------------------------------------------------------------------- |
| `1.0` | Reta única `p = 1 - b*d`. Os dois modos colapsam.                    |
| `0.5` | Inclinação cai pela metade após o zero. Zona morta de `1/b` a `2/b`. |
| `0.0` | `p` trava em zero. Os dois modos coincidem.                          |

---

## Contrato de Configuração (JSON `tables`)

Defaults iniciais (seed). Priority é keyed pelos valores de `Issue.priority` do Plane.

```json
{
  "tables": {
    "difficulty": {
      "Hard-High": 50,
      "Hard-Low": 45,
      "Medium-High": 39,
      "Medium-Low": 32,
      "Easy-High": 24,
      "Easy-Low": 13
    },
    "repetitive": { "High": 4, "Medium": 2, "Low": 0 },
    "importance": { "High": 20, "Medium": 10, "Low": 5 },
    "type": { "Feature": 0, "Enhancement": 0, "Support": 0, "Bug": 0 },
    "priority": {
      "urgent": { "points": 30, "b": 0.3, "label": "Today / Critical" },
      "high": { "points": 27, "b": 0.25, "label": "Urgent" },
      "medium": { "points": 23, "b": 0.2, "label": "High" },
      "low": { "points": 18, "b": 0.15, "label": "Medium" },
      "none": { "points": 12, "b": 0.1, "label": "Low" }
    }
  }
}
```

> **Mapeamento de Priority:** a spec usa níveis Today/Urgent/High/Medium/Low; o Plane usa `urgent/high/medium/low/none`. A chave do dicionário é o valor nativo do Plane e `label` é o nome exibido — o usuário pode reajustar pontos/`b`/label livremente. A correspondência default acima preserva os pontos/`b` da spec na mesma ordem decrescente de severidade.

---

## API (Backend) — `apps/api/plane/app/views/kpi/`

Padrão idêntico ao Helpdesk: URLs em `apps/api/plane/app/urls/kpi.py`, registrado em `urls/__init__.py`; serializers em `app/serializers/kpi.py`.

| Método  | Rota                                                                | Descrição                                                                        |
| ------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| GET/PUT | `workspaces/<slug>/kpi/config/`                                     | Config default do workspace (project=null).                                      |
| GET/PUT | `workspaces/<slug>/projects/<id>/kpi/config/`                       | Config do projeto (cria/edita; herda do workspace se ausente).                   |
| GET     | `workspaces/<slug>/projects/<id>/kpi/issues/`                       | Lista issues do projeto com `Vp`, `d`, `p`, `Vf` calculados + agregados.         |
| GET/PUT | `workspaces/<slug>/projects/<id>/kpi/issues/<issue_id>/attributes/` | Lê/define `difficulty`/`repetitive`/`importance`/`type_override` da issue.       |
| POST    | `workspaces/<slug>/projects/<id>/kpi/preview/`                      | Recalcula `p(d)`/`Vf` para um payload arbitrário (curva/preview, sem persistir). |

Agregados retornados na listagem: `sum(Vp)`, `sum(Vf)`, `eficiencia = Vf_total / Vp_total`, contagem por status (no prazo / antecipada / atrasada / pendente).

---

## Frontend — `apps/web`

Reaproveitar os padrões do Helpdesk (sidebar, rotas, store, service, types).

- **Types:** `packages/types/src/kpi.ts` — `IKpiConfig`, `IKpiIssueAttribute`, `IKpiResult`, enums de modo/arredondamento.
- **Service:** `packages/services/src/kpi/kpi.service.ts` — métodos de config, listagem, attributes e preview.
- **Engine espelhado:** `apps/web/core/helpers/kpi/engine.ts` — reimplementação 1:1 do motor para preview/curva sem round-trip (validado contra os mesmos 6 casos de teste).
- **Store:** `apps/web/core/store/kpi.store.ts`.
- **Páginas (nível projeto):**
  - `:workspaceSlug/projects/:projectId/kpi` — tabela de issues com `Vp/d/p/Vf`, chips de filtro por status, agregados no header.
  - `:workspaceSlug/projects/:projectId/kpi/settings` — editor de config: tabelas D/R/I/P/T (add/remove/editar níveis; Priority edita pontos **e** `b`), `k` (slider 0–1), toggle de `penalty_mode`, `day_count`, `day_rounding`, `allow_negative`, `max_multiplier`, `vf_decimals`.
  - **Visualização da curva** `p(d)` do modo selecionado, com marcador no `d` da issue selecionada; recalcula ao mudar `b`, `k` ou modo.
- **Sidebar:** adicionar item "KPI" ao project navigation (`project-navigation.tsx`) com ícone apropriado (ex.: `Gauge`/`TrendingUp`).

---

## Tasks (Próximos Passos)

### Fase 0 — Fundação e contrato

- [ ] Validar este documento com o time e confirmar o mapeamento de Priority (Plane ↔ spec).
- [ ] Definir defaults de seed da `KpiConfig` (seção contrato JSON).

### Fase 1 — Backend: Modelos e Migração ✅

- [x] Criar `apps/api/plane/db/models/kpi.py` com `KpiConfig` e `KpiIssueAttribute` (+ `default_kpi_tables()` seed).
- [x] Registrar modelos em `apps/api/plane/db/models/__init__.py`.
- [x] Criar migração `0140_kpi_config_and_attributes.py` (escrita manualmente — Django não está instalado localmente; **aplicar com `makemigrations --check` + `migrate` quando o ambiente subir**).
- [ ] Data migration opcional: criar `KpiConfig` default (project=null) por workspace com os defaults da spec. _(adiado — config é criada sob demanda na primeira escrita; herança resolve defaults)_

### Fase 2 — Backend: Motor de cálculo (TDD) ✅

- [x] Implementar `apps/api/plane/kpi/engine.py` — função pura `calcular(task, config)` + `sample_curve` para a curva.
- [x] Implementar `calcular_dias` (`calendar`/`business` + `truncate`/`round`/`ceil`).
- [x] Testes unitários `plane/tests/unit/kpi/test_engine.py` cobrindo os **6 casos** nos dois modos.
- [x] Testes de borda: `k=0`, `k=1`, `allow_negative=false`, `max_multiplier`, `d<0` (bônus), tarefa em aberto.
- [x] **Verificado**: os 6 casos batem exatamente nos dois modos (validação standalone do motor — ver log abaixo).

### Fase 3 — Backend: API e Serializers ✅

- [x] `app/serializers/kpi.py` — `KpiConfigSerializer` (valida `k` 0–1 e estrutura de `priority`), `KpiIssueAttributeSerializer`.
- [x] `plane/kpi/contract.py` — `default_contract`, `model_to_contract`, `resolve_contract` (herança projeto → workspace → seed).
- [x] `app/views/kpi/` — `config.py` (workspace + projeto, com herança e delete de override) e `issue.py` (listagem com cálculo + agregados, attributes com validação de níveis, preview + curva).
- [x] `app/urls/kpi.py` + registro em `app/urls/__init__.py`. Rotas: config (ws/projeto), issues, attributes, preview.
- [x] Permissões via `allow_permission` (`ROLE`): leitura ADMIN/MEMBER/GUEST, escrita ADMIN/MEMBER (config de workspace só ADMIN).
- [x] Suíte de testes de contrato `tests/contract/app/test_kpi.py` (config, herança, attributes+validação, scoring batendo caso da spec, pending, preview).
- [ ] ⚠️ **Rodar a suíte** (`pytest plane/tests/unit/kpi plane/tests/contract/app/test_kpi.py`) quando o ambiente Python/Django subir — não executável no host atual.

### Fase 4 — Frontend: Camada de dados ✅

- [x] `packages/types/src/kpi.ts` (+ export em `packages/types/src/index.ts`).
- [x] `packages/services/src/kpi/kpi.service.ts` (+ `index.ts` + export em `packages/services/src/index.ts`).
- [x] `apps/web/core/helpers/kpi/engine.ts` (espelho 1:1 do motor) — **verificado** contra os 6 casos via Node (ver log).
- [x] `apps/web/core/store/kpi.store.ts` (MobX) + registro em `root.store.ts` + hook `core/hooks/store/use-kpi.ts`.

### Fase 5 — Frontend: Páginas e UI ✅

- [x] Item "KPI" no sidebar do projeto (`project-navigation.tsx`, ícone `Gauge`, sortOrder 7) + chave i18n `sidebar.kpi`.
- [x] Rotas em `apps/web/app/routes/core.ts` (`/projects/:projectId/kpi` e `/kpi/settings`) + `kpi/layout.tsx`.
- [x] Página de listagem (`kpi/page.tsx`): agregados (Σ Vp, Σ Vf, eficiência, contagens), tabela de issues, curva lado a lado.
- [x] Página de Settings (`kpi/settings/page.tsx`) com `KpiConfigEditor`: tabelas D/R/I/T (add/remove/editar níveis), Priority (pontos + `b` + label), `k` (slider), toggle de modo, day_count, day_rounding, allow_negative, max_multiplier, vf_decimals, reset para default do workspace.
- [x] Componente **curva `p(d)`** (`curve-chart.tsx`, SVG puro) com marcador no `d` da issue selecionada, recalculando via engine espelho.
- [x] Editor de atributos KPI (D/R/I) inline na tabela (`issues-table.tsx`, selects que salvam e re-scoram).
- [x] **Type-check:** `tsc --noEmit` no `apps/web` → **0 erros** (após rebuild de `@plane/types`, `@plane/services`, `@plane/i18n`).

### Fase 6 — Polish e validação ✅

- [x] Recalcular ao mudar atributos: `updateIssueAttributes` re-busca a lista (Vp/Vf atualizam); curva recalcula no client ao selecionar linha/trocar `b`/`k`/modo.
- [x] Lint (`oxlint`) dos arquivos novos do frontend → **0 erros / 0 warnings**.
- [x] `tsc --noEmit` do `apps/web` → **0 erros**.
- [x] `py_compile` de todos os arquivos backend → OK.
- [x] Validação dos critérios de aceitação (abaixo) no nível de implementação.
- [ ] (Opcional) Introduzir `KpiResult` como cache se a listagem ficar lenta. _(adiado — cálculo on-the-fly por enquanto)_
- [ ] ⚠️ **Validação E2E pendente de ambiente:** aplicar migração `0140` + rodar `pytest` + subir app e clicar o fluxo. Não executável no host atual (sem Django/containers Plane).

### Fase 7 — Integração futura com Helpdesk

- [ ] Generalizar o motor para aceitar `HelpdeskRequest` (start_date/target_date já existem em helpdesk — ver migração `0138`).
- [ ] Config KPI no nível do portal/workspace do Helpdesk.

---

## Casos de Teste (validação — seção 9 da spec)

Config padrão, `k = 0.5`.

| Tarefa               | Priority (b)  | D   | R   | I   | T   | d   | Vp  | `p` contínuo | `p` zona morta | Vf contínuo | Vf zona morta |
| -------------------- | ------------- | --- | --- | --- | --- | --- | --- | ------------ | -------------- | ----------- | ------------- |
| No prazo             | urgent (0.30) | 50  | 0   | 20  | 0   | 0   | 100 | 1.00         | 1.00           | 100         | 100           |
| Atraso leve          | high (0.25)   | 45  | 0   | 20  | 0   | 2   | 92  | 0.50         | 0.50           | 46          | 46            |
| Antecipada           | medium (0.20) | 39  | 2   | 10  | 0   | -1  | 74  | 1.20         | 1.20           | 88.8        | 88.8          |
| No limite 1/b        | medium (0.20) | 50  | 0   | 20  | 0   | 5   | 93  | 0.00         | 0.00           | 0           | 0             |
| Muito atrasada       | high (0.25)   | 45  | 0   | 20  | 0   | 10  | 92  | -0.75        | -0.25          | -69         | -23           |
| Extremo / zona morta | none (0.10)   | 13  | 0   | 5   | 0   | 12  | 30  | -0.10        | 0.00           | -3          | 0             |

> A diferença entre os modos só aparece **depois** de `1/b`: o contínuo já desce; a zona morta fica em 0 até `1/(k*b)`. Com `allow_negative=false`, todos os `Vf` negativos viram 0. Com `k=1` os dois modos coincidem; com `k=0` ambos travam em `Vf=0` a partir de `d = 1/b`.

---

## Log de Desenvolvimento

### 2026-06-24 — Fases 1 e 2 (Backend: modelos + motor)

- **Modelos:** `KpiConfig` (params em colunas, tabelas de pontos em `tables` JSON, `unique_together` workspace+project+deleted_at) e `KpiIssueAttribute` (OneToOne com `Issue`, guarda D/R/I + `type_override`). Seed `default_kpi_tables()` com Priority keyed pelos valores nativos do Plane.
- **Migração:** `0140_kpi_config_and_attributes.py` escrita manualmente seguindo o padrão de `0135_helpdeskmember`. ⚠️ Django não está instalado no host — rodar `python manage.py makemigrations --check` e `migrate` quando o container da API subir, para confirmar que o autodetector não encontra diferenças.
- **Motor:** `plane/kpi/engine.py` — `calcular`, `calcular_dias`, `sample_curve`. Função pura, sem banco, reusável pelo Helpdesk depois.
- **Validação:** os 6 casos da spec foram conferidos via execução standalone do motor (sem Django). Resultado: todos OK nos dois modos —
  ```
  no_prazo    Vp=100 pC=1.00  pD=1.00  Vf=100/100
  atraso_leve Vp=92  pC=0.50  pD=0.50  Vf=46/46
  antecipada  Vp=74  pC=1.20  pD=1.20  Vf=88.8/88.8
  no_limite   Vp=93  pC=0.00  pD=0.00  Vf=0/0
  muito_atras Vp=92  pC=-0.75 pD=-0.25 Vf=-69/-23
  extremo     Vp=30  pC=-0.10 pD=0.00  Vf=-3/0
  ```

### 2026-06-24 — Fase 3 (Backend: API)

- **Endpoints:** `GET/PUT workspaces/<slug>/kpi/config/`; `GET/PUT/DELETE .../projects/<id>/kpi/config/`; `GET .../kpi/issues/`; `GET/PUT .../kpi/issues/<issue_id>/attributes/`; `POST .../kpi/preview/`.
- **Herança:** `resolve_contract()` resolve projeto → workspace default (project=null) → seed. Payloads de config trazem `is_default_seed` e `inherited` para o frontend saber a origem.
- **Listagem:** monta o task dict de cada `Issue` (priority/target_date/completed_at + atributos KPI), chama o motor e devolve `vp/d/p/vf/status` por linha + agregados (`sum_vp`, `sum_vf`, `efficiency`, `counts`).
- **Validação:** níveis categóricos de attributes são checados contra a config vigente (400 se inválido); `k` validado 0–1.
- **Status:** todos os arquivos passam em `py_compile`. Suíte ainda não executada (sem Django no host).

### 2026-06-24 — Fase 4 (Frontend: dados)

- **Types/Service:** `IKpiConfig`, `IKpiIssueRow`, `IKpiAggregates`, `IKpiPreviewResponse` etc.; `KpiService` com base `/api/workspaces/` cobrindo config (ws/projeto), issues, attributes e preview.
- **Engine espelho:** `apps/web/helpers/kpi/engine.ts` (alias `@/helpers/kpi/engine`) é port 1:1 do Python (`calcular`, `calcularDias`, `sampleCurve`, `priorityFactor`). Validado via Node: os 6 casos batem nos dois modos.
- **Store:** `KpiStore` (MobX) com observables por workspace/projeto, registrado no `RootStore` (construtor + `resetOnSignOut`), hook `useKpi`.

### 2026-06-24 — Fase 5 e 6 (Frontend: UI + polish)

- **Sidebar/rotas:** item "KPI" no `project-navigation.tsx` (ícone `Gauge`); rotas `/kpi` e `/kpi/settings` + `kpi/layout.tsx`.
- **Componentes:** `core/components/kpi/` — `curve-chart.tsx` (SVG p(d) com marcador), `issues-table.tsx` (scoring + edição inline de D/R/I), `config-editor.tsx` (editor completo de tabelas + params).
- **Páginas:** dashboard (`kpi/page.tsx`) com agregados + tabela + curva; settings (`kpi/settings/page.tsx`).
- **Gates:** `tsc --noEmit` (web) **0 erros**; `oxlint` dos arquivos novos **0/0**; `py_compile` backend OK. Rebuild de `@plane/types`/`@plane/services`/`@plane/i18n` aplicado.

---

## Critérios de Aceitação

> Marcados ✅ no nível de implementação (lógica verificada via execução standalone do motor + type-check). Falta apenas a validação E2E com app rodando (ver Fase 6).

- [x] Nenhum valor de pontuação/fator embutido no código; tudo vem da `KpiConfig`/seed `default_kpi_tables()`.
- [x] Usuário alterna entre `dead_zone` e `continuous` e o resultado muda conforme o motor (toggle no editor; verificado nos 6 casos).
- [x] `k` e `b` editáveis, afetando imediatamente cálculo e visualização da curva (slider `k`, edição de `b` na tabela Priority; curva recalcula no client).
- [x] Os seis casos de teste batem exatamente (nas duas colunas) — verificado em Python **e** TypeScript.
- [x] `allow_negative`, `max_multiplier`, `day_count`, `day_rounding` e `vf_decimals` implementados no motor e expostos no editor.
- [x] Antecipação (`d < 0`) gera bônus (`p > 1`), respeitando `max_multiplier` quando definido (teste `test_max_multiplier_caps_bonus`).
- [x] Config resolve corretamente projeto → workspace → defaults (`resolve_contract` + teste `test_project_config_inherits_workspace_default`).
- [x] Issues sem `completed_at` aparecem como "pendente" (sem `Vf`) (teste `test_open_task_is_pending`).
