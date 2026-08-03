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

| Campo da spec (seção 3)    | Origem no Plane                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `id` / `nome`              | `Issue.id` / `Issue.name`                                                                                                             |
| `priority` (P)             | `Issue.priority` (`urgent`/`high`/`medium`/`low`/`none`) — pontos e `b` vêm da config de Priority                                     |
| `due_date` (prazo)         | `Issue.target_date`                                                                                                                   |
| `delivered_date` (entrega) | `Issue.completed_at` (preenchido quando a issue entra em estado `completed`)                                                          |
| `type` (T)                 | `Issue.type` → `IssueType` (mapeado por nome na config de Type; default 0)                                                            |
| `difficulty` (D)           | **estimate KPI configurável** — `KpiIssueAttribute.difficulty_estimate_point.value` (fallback legado: `Issue.estimate_point.value`)   |
| `repetitive` (R)           | **estimate KPI configurável** — `KpiIssueAttribute.repetitive_estimate_point.value` (fallback legado: `KpiIssueAttribute.repetitive`) |
| `importance` (I)           | **priority nativo** — `Issue.priority`; pontos em `config.tables.priority[...].points` (ver D5)                                       |

> `difficulty` e `repetitive` são validados contra os estimate systems selecionados na config do projeto. `type` continua validado contra a tabela Type. `importance` é o `Issue.priority` nativo.

### D2 — Escopo da configuração: **por projeto, com herança do workspace**

- Um `KpiConfig` é resolvido na ordem: **config do projeto** → **config default do workspace** → **defaults da seção 4 (hard-coded apenas como bootstrap/seed)**.
- O usuário pode criar/editar uma config no nível de projeto. Sem config de projeto, herda a do workspace.
- A config inteira (tabelas + parâmetros) é versionada em um único campo `JSONField` seguindo o contrato da seção 7, mais colunas indexáveis para os parâmetros mais consultados.

### D4 — Difficulty (D) e Repetitive (R) usam Estimate Systems configuráveis no KPI

> Decisão tomada em 2026-06-26. Substitui o uso direto de `Issue.estimate_point` pela UI do KPI e permite dois estimate systems simultâneos por projeto.

- Cada `KpiConfig` de projeto pode selecionar dois estimate systems do mesmo projeto:
  - `difficulty_estimate` para Difficulty (D).
  - `repetitive_estimate` para Repetitive (R).
- Cada issue armazena seleções KPI próprias:
  - `difficulty_estimate_point`.
  - `repetitive_estimate_point`.
- A UI do KPI **não sobrescreve** mais `Issue.estimate_point`. O estimate nativo continua sendo usado pelo restante do Plane e fica apenas como fallback legado para D quando `difficulty_estimate_point` ainda não existe.
- `KpiIssueAttribute.repetitive` permanece como fallback legado para R, mas a UI nova usa `repetitive_estimate_point`.
- A contribuição para `Vp` vem de `config.tables.difficulty[value]` e `config.tables.repetitive[value]`, onde `value` é o valor do estimate point escolhido. Um value sem mapeamento contribui **0**.
- O motor puro não muda: continua recebendo strings `difficulty` e `repetitive` e consultando `tables.difficulty` / `tables.repetitive`.
- Settings: Difficulty e Repetitive mostram um seletor de estimate system e uma tabela com os points do estimate escolhido.
- Endpoints: `PUT .../kpi/issues/<id>/estimate/` fica como alias compatível para atualizar `difficulty_estimate_point`; `PUT .../kpi/issues/<id>/repetitive-estimate/` atualiza `repetitive_estimate_point`.

### D5 — Importance (I) usa a Priority nativa; P e I são unificados

> Decisão tomada em 2026-06-26. Substitui o `KpiIssueAttribute.importance` e funde os termos P e I.

- O Plane não tem campo "importance"; o único campo nativo que significa importância é **`Issue.priority`**. A **Importance (I) passa a ser a priority nativa**.
- Antes a priority alimentava o termo **P** (pontos + fator `b`) **e** havia um termo **I** separado (atributo). "Replace P with Importance": o termo P e o termo I são **fundidos em um só** — `tables.priority[level].points` agora É a contribuição de Importance (I) para `Vp`; `b` continua sendo o fator de penalidade. Não existe mais um termo "Priority points" separado nem a tabela `importance`.
- `Vp` passa de `D + R + I + P + T` para **`Vp = D + R + Importance(priority.points) + T`**. O motor só **remove o termo `importance`** da soma; o termo `priority.points` sobrevive (agora = Importance).
- `KpiIssueAttribute.importance` foi **removido** (migração `0142`). Na tela de KPI a coluna **Importance** sai; a coluna **Priority** vira editável (`PriorityDropdown`) e persiste em `Issue.priority` via `PUT .../kpi/issues/<id>/priority/`.
- Settings: a tabela Importance some; a tabela Priority é renomeada para "Priority / Importance (I)" (points = Importance, b = penalidade).

### D6 — Projeto pode ter múltiplos Estimate Systems ativos

> Decisão tomada em 2026-06-26. Substitui a noção de que `Project.estimate` é o único estimate ativo.

- Cada estimate system tem um switch próprio. Apenas estimates com `Estimate.last_used=true` ficam disponíveis no fluxo nativo de work item.
- `Project.estimate` permanece como campo legado/default do Plane. Ele indica o estimate padrão para compatibilidade, toggle global de habilitação e fluxos antigos, mas **não é mais a fonte única** de estimates disponíveis.
- `Issue.estimate_point` continua sendo um único FK para `EstimatePoint`. Como o point já conhece seu `Estimate`, um work item pode selecionar um point de qualquer estimate system ativo sem mudar o schema.
- A aba Project Settings > Estimates mostra um switch por estimate, badge `Active`/`Inactive` por system e marca `Default` no estimate apontado por `Project.estimate`.
- O dropdown de estimate do work item lista os points dos estimate systems ativos agrupados pelo nome do estimate system. O KPI continua podendo forçar um estimate específico via `estimateId`, mesmo que ele não esteja no dropdown nativo.

### D7 — Tela inicial do KPI é um dashboard por membro (view-only); D/R saem para o work item

> Decisão tomada em 2026-07-01. Redefine a função da tela `kpi/` (nível projeto): ela não é mais uma tabela de work items editável, e sim um dashboard de visualização.

- A tela inicial (`kpi/page.tsx`) deixa de renderizar a tabela de work items (`KpiIssuesTable`). Em vez disso mostra: (1) o resumo agregado do projeto (`StatBar`, inalterado), (2) uma lista por **membro** do projeto com Σ Vp, Σ Vf, eficiência e contagem por status, e (3) gráficos — barra de Vf por membro e a curva `p(d)` (agora selecionável por nível de prioridade, já que não há mais uma linha de work item selecionada). A tela é **100% somente leitura**.
- `KpiIssuesTable` (`core/components/kpi/issues-table.tsx`) **não foi removida** — só deixou de ser importada pela tela inicial. Fica disponível para reaproveitamento futuro.
- Divisão de score por membro: quando um work item tem `N` assignees, cada um recebe `Vp/N` e `Vf/N` (quando `Vf` existe). A soma dos membros bate com os agregados de projeto existentes. Work items sem assignee não entram em nenhum bucket de membro (ficam de fora do ranking, mas continuam nos agregados de projeto); o endpoint expõe `unassigned_count` à parte.
- Novo endpoint `GET .../kpi/members/` (`KpiMemberAggregateEndpoint`) faz essa agregação — não altera `KpiIssueListEndpoint`, que continua existindo e retornando os agregados de projeto usados pelo `StatBar`.
- **Difficulty e Repetitive saem da tela de KPI** e passam a ser definidos **no próprio work item**: no modal de criação/edição (`issue-modal/`) e na sidebar de detalhe do work item (`issue-detail/sidebar.tsx`), ao lado do Estimate nativo, reaproveitando o mesmo `EstimateDropdown` com `estimateId` restrito ao `difficulty_estimate`/`repetitive_estimate` da `KpiConfig` do projeto. Os campos só aparecem se o projeto tiver esses estimates configurados (sem novo toggle "KPI habilitado" — não existe hoje e não foi criado).
- Como `difficulty_estimate_point`/`repetitive_estimate_point` não são campos de `TIssue` (são `KpiIssueAttribute`, entidade separada), o modal os administra fora do form do `react-hook-form`, via uma extensão do `IssueModalContext` (`kpiDifficultyEstimatePoint`/`kpiRepetitiveEstimatePoint` + `handleCreateUpdateKpiAttributes`), persistidos com uma chamada extra depois que o issue é criado/atualizado — mesmo padrão já usado para as custom properties de issue type (`handleCreateUpdatePropertyValues`).
- **Settings do KPI (`kpi/settings/page.tsx`, `KpiConfigEditor`) não mudou** — continua sendo a única tela do lead para ajustar o motor de cálculo.
- Sem migração de banco — nenhuma mudança de modelo, só um endpoint de agregação novo e realocação de UI.

### D8 — KPI unificado do workspace é ponderado por nº de itens, não soma de Vf

> Decisão tomada em 2026-07-23. Define como a tela de workspace consolida os KPIs dos projetos.

- **`Vf` não é comparável entre projetos.** `tables.difficulty` é keyed por _EstimatePoint id_ — cada
  projeto define a própria escala de pontos — e `priority.points`/`b`/`k`/`penalty_mode` também podem
  divergir por `KpiConfig` de projeto. Somar `Vf` deixaria o projeto com a tabela mais "inflada"
  dominar o número consolidado, e a distorção seria invisível.
- **Eficiência (`Vf/Vp`) é adimensional** e é a base do número único:

  ```
  eff_p = Σ Vf_p / Σ Vp_p        # só itens entregues (d != None)
  KPI   = Σ (eff_p × n_p) / Σ n_p    # n_p = itens pontuados do projeto p
  ```

- Projeto sem item pontuado (ou `Σ Vp = 0`) aparece na tabela com `efficiency: null` e fica **fora**
  da média (`projects_in_average` < `project_count`).
- `contribution` = `eff_p × n_p / Σ n_p` decompõe o KPI: a soma das contribuições **é** o KPI.
- `sum_vp_raw`/`sum_vf_raw` continuam expostos, mas rotulados como escalas mistas na UI — nunca são
  a base do número.
- **Config**: cada projeto é calculado com a própria config (`resolve_contract`), então o número da
  linha bate exatamente com o da tela daquele projeto.
- **Escopo**: só projetos com `kpi_view=true`, não arquivados, dos quais o requester é
  `ProjectMember` ativo.
- **Período**: `?period=30d|90d|180d|365d|all` (default `90d`) ou `?start=&end=`. Um item entra pela
  `completed_at` quando entregue, ou pela `target_date` quando ainda aberto.

### D3 — Motor de cálculo puro e isolado

A camada de cálculo (`plane/kpi/engine.py`) é uma função pura `calcular(task_fields, config) -> {Vp, d, p, Vf}` sem acesso a banco. Isso permite:

- Testes unitários determinísticos (os 6 casos da seção 9).
- Reuso direto pelo Helpdesk na fase futura.
- Recálculo no frontend (preview da curva) a partir do mesmo contrato JSON.

---

## Glossário de variáveis

| Símbolo | Nome                    | Origem                                                             |
| ------- | ----------------------- | ------------------------------------------------------------------ |
| `D`     | Difficulty              | tabela de pontos, por nível                                        |
| `R`     | Repetitive              | tabela de pontos, por nível                                        |
| `I`     | Importance              | `Issue.priority` nativo → `tables.priority[level].points` (ver D5) |
| `T`     | Type                    | tabela de pontos, por nível (padrão 0)                             |
| `b`     | fator de prioridade     | atrelado a cada nível de prioridade                                |
| `k`     | fator de suavização     | global (0–1), inclinação após o valor zerar                        |
| `d`     | dias de atraso          | `delivered_date − due_date`, conforme `day_count`/`day_rounding`   |
| `Vp`    | valor planejado         | `Vp = D + R + I + T` (I = priority.points; ver D5)                 |
| `p`     | multiplicador de atraso | função de `b`, `k`, `d` e do modo                                  |
| `Vf`    | valor final             | `Vf = Vp · p`                                                      |

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
  - `difficulty_estimate` (FK → `Estimate`, nullable) — estimate system usado para D no projeto.
  - `repetitive_estimate` (FK → `Estimate`, nullable) — estimate system usado para R no projeto.
- `db_table`: `kpi_configs`
- `unique_together`: `["workspace", "project", "deleted_at"]` (1 config por projeto; project=null = default do workspace).

> Os parâmetros globais ficam em colunas próprias (consultáveis/validáveis); as tabelas de pontos ficam no JSON `tables` por serem livremente editáveis (add/remove níveis).

### 2. `KpiIssueAttribute` — Atributos KPI por issue (D1)

- Campos:
  - `workspace` (FK), `project` (FK), `issue` (OneToOne FK → `Issue`).
  - `difficulty_estimate_point` (FK → `EstimatePoint`, nullable) — seleção KPI para D.
  - `repetitive_estimate_point` (FK → `EstimatePoint`, nullable) — seleção KPI para R.
  - `repetitive` (Char, nullable) — legado/fallback para R.
  - `type_override` (Char, nullable) — opcional; se null, usa `Issue.type.name` mapeado na tabela Type.
- `db_table`: `kpi_issue_attributes`
- `unique_together`: `["issue", "deleted_at"]`

> `priority` **não** é duplicada aqui — vem de `Issue.priority`. `due_date`/`delivered_date` vêm de `Issue.target_date`/`Issue.completed_at`. `Issue.estimate_point` também não é sobrescrito pelo KPI; ele é apenas fallback legado para D.

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
    "difficulty": {},
    "repetitive": { "High": 4, "Medium": 2, "Low": 0 },
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

| Método  | Rota                                                                         | Descrição                                                                                                   |
| ------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GET/PUT | `workspaces/<slug>/kpi/config/`                                              | Config default do workspace (project=null).                                                                 |
| GET/PUT | `workspaces/<slug>/projects/<id>/kpi/config/`                                | Config do projeto (cria/edita; herda do workspace se ausente).                                              |
| GET     | `workspaces/<slug>/projects/<id>/kpi/issues/`                                | Lista issues do projeto com `Vp`, `d`, `p`, `Vf` calculados + agregados de projeto.                         |
| GET     | `workspaces/<slug>/projects/<id>/kpi/members/`                               | Agregação por membro (Vp/Vf divididos igualmente entre assignees) + `unassigned_count`.                     |
| GET     | `workspaces/<slug>/kpi/members/`                                             | Idem, entre os projetos com KPI ativo do workspace que o requester integra.                                 |
| GET     | `workspaces/<slug>/kpi/overview/`                                            | Painel consolidado: `unified` (KPI único) + `projects` + `members`. Aceita `period`/`start`/`end` (ver D8). |
| GET/PUT | `workspaces/<slug>/projects/<id>/kpi/issues/<issue_id>/attributes/`          | Lê/define atributos KPI laterais e `type_override` da issue.                                                |
| PUT     | `workspaces/<slug>/projects/<id>/kpi/issues/<issue_id>/estimate/`            | Compatibilidade: define `difficulty_estimate_point`, sem alterar `Issue.estimate_point`.                    |
| PUT     | `workspaces/<slug>/projects/<id>/kpi/issues/<issue_id>/repetitive-estimate/` | Define `repetitive_estimate_point`.                                                                         |
| POST    | `workspaces/<slug>/projects/<id>/kpi/preview/`                               | Recalcula `p(d)`/`Vf` para um payload arbitrário (curva/preview, sem persistir).                            |

Agregados retornados na listagem: `sum(Vp)`, `sum(Vf)`, `eficiencia = Vf_total / Vp_total`, contagem por status (no prazo / antecipada / atrasada / pendente).

---

## Frontend — `apps/web`

Reaproveitar os padrões do Helpdesk (sidebar, rotas, store, service, types).

- **Types:** `packages/types/src/kpi.ts` — `IKpiConfig`, `IKpiIssueAttribute`, `IKpiResult`, enums de modo/arredondamento.
- **Service:** `packages/services/src/kpi/kpi.service.ts` — métodos de config, listagem, attributes e preview.
- **Engine espelhado:** `apps/web/core/helpers/kpi/engine.ts` — reimplementação 1:1 do motor para preview/curva sem round-trip (validado contra os mesmos 6 casos de teste).
- **Store:** `apps/web/core/store/kpi.store.ts`.
- **Páginas (nível projeto):**
  - `:workspaceSlug/projects/:projectId/kpi` — dashboard **somente leitura**: `StatBar` (agregados de projeto), lista por membro (Σ Vp/Vf, eficiência, contagem por status), gráfico de barras de Vf por membro, e a curva `p(d)` com seletor de nível de prioridade (D7). Não tem mais tabela de work items nem edição inline.
  - `:workspaceSlug/projects/:projectId/kpi/settings` — editor de config: tabelas D/R/I/P/T (add/remove/editar níveis; Priority edita pontos **e** `b`), `k` (slider 0–1), toggle de `penalty_mode`, `day_count`, `day_rounding`, `allow_negative`, `max_multiplier`, `vf_decimals`. Inalterado por D7.
  - **Visualização da curva** `p(d)` do modo selecionado; no dashboard o marcador de `d` foi substituído por um seletor de nível de prioridade (D7), já que não há mais uma issue selecionada numa tabela.
- **Difficulty/Repetitive no work item (D7):** editáveis no modal de criação/edição (`issue-modal/components/default-properties.tsx`) e na sidebar de detalhe (`issue-detail/sidebar.tsx`), reaproveitando `EstimateDropdown`. `KpiIssuesTable` (`core/components/kpi/issues-table.tsx`) continua existindo mas não é mais renderizada por nenhuma página.
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

### Fase 7 — Workspace Level KPI Panel ✅

- [x] Backend: `WorkspaceKpiMemberAggregateEndpoint` para agregar Vp/Vf entre todos os projetos de um workspace.
- [x] Backend: Rota `/api/workspaces/<slug>/kpi/members/` registrada.
- [x] Frontend: `KpiService.getWorkspaceMemberAggregates` e `KpiStore.workspaceMemberAggregates`.
- [x] Frontend: Rota `/:workspaceSlug/kpi` configurada em `core.ts` e `WorkspaceKpiPage` adaptada a partir da página de nível de projeto, usando layout de workspace.
- [x] Frontend: Link na barra lateral (sidebar) do workspace sob a seção Analytics, com ícone `Gauge`.

### Fase 7.1 — Workspace KPI Overview: KPI unificado entre projetos ✅

> D8 (2026-07-23). A tela de workspace deixa de ser só um ranking de membros e vira o painel
> consolidado dos **KPIs ativos** (projetos com `kpi_view=true`).

- [x] Backend: `WorkspaceKpiOverviewEndpoint` — `GET .../kpi/overview/`, uma única passada sobre os
      issues alimentando três blocos (`projects`, `members`, `unified`).
- [x] Backend: `resolve_contracts_bulk()` em `plane/kpi/contract.py` (1 query para todas as configs).
- [x] Backend: helpers extraídos (`_accumulate_member_buckets`, `_finalize_member_buckets`,
      `_active_kpi_projects`, `_resolve_period`, `_period_filter`) — elimina a duplicação entre
      `KpiMemberAggregateEndpoint` e `WorkspaceKpiMemberAggregateEndpoint`.
- [x] Frontend: tipos, `KpiService.getWorkspaceOverview`, `KpiStore.workspaceOverview`, componentes
      (`stat-bar`, `score-bar-chart`, `project-list`, `unified-kpi-hero`, `period-selector`) e a
      reescrita de `kpi/page.tsx` (workspace).
- [ ] ⚠️ **`pytest plane/tests/contract/app/test_kpi.py` pendente** — host sem Django e o container
      foi morto por falta de memória; rodar quando o ambiente subir.

### Fase 8 — Integração futura com Helpdesk

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

### 2026-06-26 — Redesign da tela + Difficulty via Estimate (D4)

- **Redesign:** `kpi/page.tsx`, `issues-table.tsx` e `curve-chart.tsx` reescritos seguindo o design system da tela de work items (tokens `surface-1`/`layer-1`/`subtle`/`text-*`, `h-11`, flat sem glows/rings). Settings inalterado visualmente.
- **Difficulty = Estimate (D4):** coluna Difficulty na tabela KPI agora é o `EstimateDropdown` real (edita `Issue.estimate_point`); `Vp` usa `tables.difficulty[estimate.value]` (default 0). Removido `KpiIssueAttribute.difficulty`.
  - Backend: `models/kpi.py` (campo removido, default difficulty `{}`), migração `0141_kpi_difficulty_from_estimate.py`, `serializers/kpi.py`, `views/kpi/issue.py` (`_difficulty_value`, novo `KpiIssueEstimateEndpoint`), `urls/kpi.py`, `views/kpi/__init__.py`.
  - Frontend: `packages/types/src/kpi.ts` (+`estimate_point`, `IKpiIssueEstimate`), `kpi.service.ts` (`updateIssueEstimate`), `kpi.store.ts` (`updateIssueEstimate`), `issues-table.tsx`, `config-editor.tsx` (DifficultyEstimateEditor), `kpi/page.tsx` e `kpi/settings/page.tsx` (preload de estimates).
  - Testes atualizados: `test_engine.py` (injeta tabela difficulty da spec), `test_kpi.py` (estimate→difficulty, novo teste do endpoint de estimate, seeds vazios).
- **Gates:** `tsc --noEmit` (web) **0 erros**; `oxlint` arquivos KPI **0/0**; backend validado por AST (Django ausente no host → `pytest` pendente de ambiente).

### 2026-06-26 — Importance via Priority nativa (D5)

- **Importance = Priority (D5):** Importance (I) passa a ser a `Issue.priority` nativa. P e I fundidos: `tables.priority[level].points` é a contribuição de Importance; `b` segue como fator de penalidade. `Vp = D + R + Importance(priority.points) + T` — o motor só **remove o termo `importance`** da soma.
  - Backend: `kpi/engine.py` (remove termo importance), `models/kpi.py` (campo `importance` removido + seed sem tabela importance), migração `0142_kpi_importance_from_priority.py`, `serializers/kpi.py`, `views/kpi/issue.py` (remove importance, novo `KpiIssuePriorityEndpoint`), `urls/kpi.py`, `views/kpi/__init__.py`.
  - Frontend: `packages/types/src/kpi.ts` (remove importance, +`IKpiIssuePriority`), `kpi.service.ts`/`kpi.store.ts` (`updateIssuePriority`), `helpers/kpi/engine.ts` (remove termo importance), `issues-table.tsx` (coluna Importance removida, Priority vira `PriorityDropdown` editável), `config-editor.tsx` (remove tabela Importance, renomeia Priority → "Priority / Importance (I)").
  - Testes: `test_engine.py` (Vp recomputado sem o termo I), `test_kpi.py` (sem importance, novo teste do endpoint de priority).
- **Gates:** `tsc --noEmit` (web) **0 erros**; `oxlint` arquivos KPI **0/0**; backend validado por AST (Django ausente no host → `pytest` pendente de ambiente).

### 2026-06-26 — Multi Estimate ativo no work item (D6)

- **Work item:** `EstimateDropdown` sem `estimateId` agora lista points de todos os estimate systems ativos (`Estimate.last_used=true`) do projeto habilitado. O label inclui o nome do estimate para desambiguar values repetidos.
- **KPI preservado:** `EstimateDropdown` com `estimateId` continua restrito ao estimate configurado para Difficulty/Repetitive.
- **Settings:** lista mostra switch individual por estimate, badge `Active`/`Inactive` via `Estimate.last_used` e `Default` para o estimate apontado por `Project.estimate`. A ação mudou de "Set active" para "Set default".
- **Fluxos auxiliares:** Power-K, readonly estimate, sorting e distribuição local passam a resolver `estimate_point` procurando em todos os estimates carregados do projeto.
- **Gates:** `pnpm --filter=web check:types` **0 erros**.

### 2026-06-26 — Switch individual por Estimate

- **Ativação individual:** cada estimate system pode ser ativado/desativado na aba Project Settings > Estimates. O estado é persistido em `Estimate.last_used`.
- **Default seguro:** desligar o estimate default promove outro estimate ativo para `Project.estimate`; se não houver outro ativo, o default fica `null` e o switch global do projeto fica desligado.
- **Work item:** dropdown nativo e Power-K mostram apenas points de estimates ativos. Histórico continua resolvendo points de estimates inativos para exibição quando o `Issue.estimate_point` já aponta para eles.

---

### 2026-07-01 — Dashboard por membro (view-only) + Difficulty/Repetitive no work item (D7)

- **Backend:** `KpiMemberAggregateEndpoint` (`app/views/kpi/issue.py`) — `GET .../kpi/members/`, agrega `Vp`/`Vf` por assignee (`prefetch_related("assignees")`, sem N+1), dividindo igualmente entre os assignees de cada issue. Issues sem assignee ficam fora de `results` (contadas em `unassigned_count`). Rota registrada em `app/urls/kpi.py`. Testes de contrato novos em `tests/contract/app/test_kpi.py::TestKpiMemberAggregates` (split 50/50 entre 2 assignees, issue sem assignee, issue pendente). Sem migração.
- **Frontend — dados:** `IKpiMemberAggregate`/`IKpiMemberAggregateResponse` (`packages/types/src/kpi.ts`), `KpiService.getProjectMemberAggregates` (`packages/services`), `KpiStore.memberAggregates`/`fetchProjectMemberAggregates` + `KpiStore.issueAttributes`/`fetchIssueAttributes` (novo, usado pela sidebar do work item).
- **Frontend — dashboard:** `kpi/page.tsx` reescrito — `StatBar` mantido, `KpiIssuesTable` removida da tela e substituída por `KpiMemberList` (novo, `core/components/kpi/member-list.tsx`) + `KpiMemberBarChart` (novo, usa `BarChart` de `@plane/propel/charts/bar-chart`) + `KpiCurveChart` com seletor de prioridade em vez de linha selecionada. `StatusBadge`/`STATUS_BADGE` extraído de `issues-table.tsx` para `core/components/kpi/status-badge.tsx` (reaproveitado pelos dois componentes, sem duplicar).
- **Frontend — work item:** Difficulty/Repetitive viram campos do work item, não da tela de KPI. `IssueModalContext` ganhou `kpiDifficultyEstimatePoint`/`kpiRepetitiveEstimatePoint` + `handleCreateUpdateKpiAttributes` (implementado em `ce/components/issues/issue-modal/provider.tsx`); `default-properties.tsx` renderiza os dois `EstimateDropdown` (gated por `KpiConfig.difficulty_estimate`/`repetitive_estimate`) e pré-carrega o valor atual ao editar um issue existente; `base.tsx` persiste depois de criar/atualizar o issue. `issue-detail/sidebar.tsx` ganhou os mesmos dois campos ao lado do Estimate nativo, lendo/escrevendo via `KpiStore` (`issueAttributes`, `updateIssueDifficultyEstimate`/`updateIssueRepetitiveEstimate`, já existentes).
- **Gates:** `pnpm --filter=web check:types` — mesmos 40 erros pré-existentes (não relacionados, `toSorted`/ES2023) antes e depois da mudança, zero erros novos. `oxlint` nos arquivos tocados — 0 erros, únicos warnings são padrões pré-existentes (`jsx-no-constructed-context-values` no provider, `no-shadow` em `base.tsx`, confirmados via `git stash` que já existiam antes desta mudança). Backend validado via `py_compile` (Django não instalado no host — suíte pytest pendente de ambiente, mesma limitação já documentada nas fases anteriores).

### 2026-07-23 — Workspace KPI Overview (D8)

- **Backend:** `WorkspaceKpiOverviewEndpoint` (`app/views/kpi/issue.py`) — `GET .../kpi/overview/`,
  uma passada sobre os issues alimentando `projects`, `members` e `unified`.
  `resolve_contracts_bulk()` (`plane/kpi/contract.py`) resolve todas as configs do workspace numa
  query só. Helpers novos: `_accumulate_member_buckets`/`_finalize_member_buckets` (fim da duplicação
  entre os dois endpoints de membro), `_active_kpi_projects`, `_resolve_period`, `_period_filter`.
  Sem migração.
- **Dois bugs pré-existentes corrigidos:**
  1. `WorkspaceKpiMemberAggregateEndpoint` agregava `Issue.issue_objects.filter(workspace=...)` sem
     filtro — incluía projetos com KPI **desabilitado** e projetos dos quais o requester **não é
     membro**. Agora passa por `_active_kpi_projects`. ⚠️ Muda também a saída da tool MCP
     `get_workspace_kpi_members` (que consome esse endpoint).
  2. `workspaceMemberAggregates` estava declarado no `KpiStore` mas **fora** do `makeObservable` —
     a tela só re-renderizava por acidente, via o `useState(loading)` local. Registrado.
- **Frontend:** tipos (`IKpiOverviewResponse`, `IKpiUnifiedSummary`, `IKpiWorkspaceProjectRow`,
  `TKpiPeriod`), `KpiService.getWorkspaceOverview`, `KpiStore.workspaceOverview`.
  `core/components/kpi/`: `stat-bar.tsx` (extraído da página de projeto, reusado pelas duas telas),
  `CountChips` movido para `status-badge.tsx`, `score-bar-chart.tsx` genérico (`member-bar-chart`
  virou wrapper), e os novos `project-list.tsx`, `unified-kpi-hero.tsx`, `period-selector.tsx`.
  `kpi/page.tsx` (workspace) reescrita: hero do KPI único → StatBar (rotulado escalas mistas) →
  tabela de projetos linkando para cada painel → gráfico de eficiência por projeto → ranking de
  membros.
- **Gates:** `pnpm --filter web check:types` — 42 erros pré-existentes (`toSorted`/ES2023) antes e
  depois, **0 novos** (comparação por `git stash`). `oxlint` nos arquivos KPI (web + packages) —
  **0/0**. `py_compile` do backend OK.
- **Pendente:** `pytest plane/tests/contract/app/test_kpi.py` (11 testes novos em
  `TestKpiWorkspaceOverview` + 2 de regressão de escopo) — o host ficou sem memória e o container da
  API foi morto (exit 137) antes da suíte rodar.

### 2026-08-03 — Justiça no ranking por membro: Vp pendente não conta mais

- **Problema:** desde o D8, `_accumulate_member_buckets` (`app/views/kpi/issue.py`) somava o `Vp`
  de um issue ao balde do membro assim que o issue existia (mesmo pendente/não entregue), mas só
  somava `Vf` quando entregue. Isso era assimétrico com o próprio bloco `projects`/`unified` do
  mesmo endpoint (que já ignora issues pendentes por completo). Resultado prático: quem carrega
  mais trabalho aberto atribuído aparece como "menos eficiente" que um colega com menos trabalho
  aberto, **mesmo entregando na mesma qualidade** — a quantidade de backlog, por si só, derrubava
  o score.
- **Fix:** `_accumulate_member_buckets` agora só soma `Vp`/`Vf` de um issue quando ele foi
  entregue (`calc["d"] is not None`), igual à regra que `KpiIssueListEndpoint` e o bloco
  `projects`/`unified` já usavam. `counts["pending"]` continua incrementando normalmente (o
  volume de trabalho aberto continua visível na UI), só deixou de alimentar a conta de
  eficiência. Usado pelos três endpoints que compartilham o helper:
  `KpiMemberAggregateEndpoint`, `WorkspaceKpiMemberAggregateEndpoint` e o bloco `members` de
  `WorkspaceKpiOverviewEndpoint` — corrige os três de uma vez.
- **Teste:** `test_pending_issue_counts_vp_not_vf` renomeado para
  `test_pending_issue_contributes_to_counts_not_vp_or_vf` e reescrito para esperar
  `sum_vp == 0` (era `27`) num issue pendente. Sem migração.
- **Gates:** `pytest plane/tests/contract/app/test_kpi.py plane/tests/unit/kpi/` — **52 passed**
  (container `api` local, `docker compose -f docker-compose-local.yml exec api pytest ...`).

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
