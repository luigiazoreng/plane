# Fix Plan — Estimates review findings (Stage B, revisão 2 — 2026-07-20)

**Revisão 2.** Incorpora as decisões do dev + os 3 blockers, 5 importantes e 5 sugestões de
`plan-review.md`. Escopo alterado: **7 findings executáveis (F1–F7)** + **2 registros DEFERRED**
em `.claude/memories/repo/issues-not-fixed.md` (F8 e órfãos históricos do F3).

> **Todas as referências `arquivo:linha` deste documento foram reverificadas lendo o
> código-fonte nesta revisão** (blocker B3). Não confie nas linhas do `bug-report.md` nem do
> `root-cause.md` — ambos contêm erros, listados na seção "Correções de referência".

---

## Bug

Revisão read-only da feature de estimates encontrou 8 problemas: N+1 de requests em toda lista
de work items (F1), estimates invisíveis em workspace-views (F2), valores órfãos ao deletar
estimate point com reatribuição (F3), settings page stale após ativar/deletar estimate (F4),
lixeira em property system-default (F5), property criada silenciosamente no 1º estimate (F6),
código morto (F7), MEMBER muta estimates apesar da UI admin-only (F8).

## Root Cause

**F1+F2 são a mesma raiz**: os valores de estimate property foram projetados para o contexto de
**work item único** e reusados literalmente nos **contextos de lista**, carregando duas premissas
que só valem no detalhe — (1) fetch por-issue é a única porta de entrada
(`getIssueEstimatePropertyValues`, `project-estimate.store.ts:585`, sem cache/dedupe/lote; o
backend só expõe a rota por-issue, `app/urls/estimate.py:63-67`), e (2) o `projectId` do route
param identifica o projeto da issue (falso em `/[slug]/workspace-views/[id]`).

**F3**: os dois updates de reatribuição (`app/views/estimate/base.py:439-442`) estão dentro do
`for issue in issues:` (l.427). Se nenhuma issue usa o point via a coluna legada
`Issue.estimate_point`, o loop não entra e os `IssueEstimatePropertyValue` nunca migram.

**F4/F5/F6/F7**: bugs locais de componente/store, sem raiz compartilhada.

**F8**: `ProjectEntityPermission` (`app/permissions/project.py:109-115`) concede escrita a
ADMIN **e** MEMBER. Pré-existente ao fork, paridade com upstream. **É mudança de comportamento,
não bug** — ver DECISÃO 1.

---

## Decisões do dev (definitivas — tomadas após o Stage B2)

### DECISÃO 1 — F8 é DEFERRED, fora do escopo de execução

Não apertar permissões nesta sessão. Motivos:
- F8 é o único dos 8 findings que é **mudança de comportamento**, não bug.
- A superfície real (blocker B2) inclui `apps/api/plane/api/views/estimate.py`, consumida pelo
  **MCP server `plane-local`** que o dev usa ativamente (`create_project_estimate`,
  `create_project_estimate_points`, `update_project_estimate_point`,
  `delete_project_estimate_point`, `link_estimate_to_project`). Apertar sem saber o role do
  token do MCP quebra a ferramenta.

**Consequência para B2 e B3**: deixam de ser blockers de execução. Mas a informação correta
(superfície completa + alvos verificados) **deve ser preservada** na entrada de
`issues-not-fixed.md` — ver Wave 5, registro DEFERRED-1.

### DECISÃO 2 — Sem migration de reparo do F3

Corrigir apenas o bug no código (para de gerar órfãos **novos** por esse caminho). Não anular
nem migrar os órfãos existentes. Motivo: anular tem efeito **não-monotônico e imprevisível** em
notas de KPI de pessoas reais (I1), e migrar é inviável (S2).

**Consequência**: a Wave 5 de migration sai do plano. Os órfãos históricos viram registro
DEFERRED-2 em `issues-not-fixed.md`.

**⚠️ Declaração explícita (corrige I2)**: **o fix do F3 NÃO estanca todos os órfãos.** Existe uma
segunda fonte, verificada nesta revisão: `EstimatePointDetailAPIEndpoint.delete`
(`apps/api/plane/api/views/estimate.py:286-291`) faz apenas
```python
estimate_point.delete()
return Response(status=status.HTTP_204_NO_CONTENT)
```
— sem `new_estimate_id`, sem nulling síncrono de `Issue.estimate_point` nem de
`IssueEstimatePropertyValue`. Delega 100% ao cascade assíncrono `soft_delete_related_objects`
(`bgtasks/deletion_task.py:18`), **que só roda se o Celery estiver de pé** — exatamente a
dependência que o fork removeu do caminho do app-API (comentário "Step B9",
`app/views/estimate/base.py:461-466`). Essa fonte continua sangrando depois do F3 e também
entra no registro DEFERRED-2.

### DECISÃO 3 — Ambiente: o dev sobe o container

O dev roda `docker compose -f docker-compose-local.yml up -d plane-db api` antes do Stage C.
**O Stage C terá pytest disponível.** Critério de aceite de backend volta a ser **"pytest verde"**,
sem alternativa BLOCKED — nenhum wave fica gated em ambiente.

O critério de frontend **permanece** typecheck + build + roteiro de browser: a ausência de infra
de teste em `apps/web` é real e não muda com o container.

---

## Bloqueio de ambiente — situação atualizada

| Alvo | Runner | Status após DECISÃO 3 |
|---|---|---|
| `apps/api` (pytest) | pytest 9.0.3 em `requirements/test.txt`, `pytest.ini` presente, suíte densa | ✅ **disponível via container** |
| `apps/web` | — | ❌ **não existe runner**: sem script `"test"`, sem jest/vitest, **zero `*.test.tsx`** |
| monorepo | `grep -l '"test"' apps/*/package.json packages/*/package.json` → só `apps/live` e `packages/codemods` | — |

Montar vitest + testing-library + mocks de MobX/SWR em `apps/web` é mudança de infra grande,
fora do escopo de um fix pass e com risco próprio. **Testes unitários de frontend estão fora de
escopo.** Registrar a lacuna em `issues-not-fixed.md` (Wave 5, DEFERRED-3).

**Wave 0 (ação do dev, roda em paralelo com o Wave 1):**
```bash
docker compose -f docker-compose-local.yml up -d plane-db api
docker compose -f docker-compose-local.yml exec api pip install -r requirements/test.txt
docker compose -f docker-compose-local.yml exec api pytest plane/tests/contract/app/test_estimates_app.py
```
Serviços confirmados em `docker-compose-local.yml`: `plane-db` (l.51), `api` (l.66),
`migrator` (l.125). O último comando serve de smoke test do próprio ambiente.

**Critério de aceite por camada:**

| Camada | Findings | Critério de aceite |
|---|---|---|
| Backend | F1 (endpoint bulk), F3 | **pytest verde no container** |
| Frontend | F1 (store/service/call sites), F2, F4, F5, F6, F7 | `pnpm typecheck` + `pnpm build` limpos **e** reprodução em browser (Stage F/UX, `gem-browser-tester`) do cenário de cada finding. Contagem de requests no Network para F1. |

**Ressalva sobre a verificação de browser (S1 — acatada)**: verificação por MCP é *one-shot* e
**não deixa regression guard atrás de si**. Todo fix de frontend deste pass ficará permanentemente
sem rede. Isso reforça R10 e o registro DEFERRED-3; não muda o veredito, porque não há alternativa
dentro do escopo (verificado: não existe `playwright.config.*` no repo; os únicos `*.spec.ts` são
codemods, e `.playwright-mcp` no `.gitignore` é diretório de **saída** do MCP, não infraestrutura).

---

## Correções de referência (blocker B3 — varredura completa)

Toda referência `arquivo:linha` do plano anterior foi reverificada. Erros encontrados e corrigidos:

| Onde | Plano anterior dizia | Verificado |
|---|---|---|
| F8 alvo 1 | `BulkEstimatePointEndpoint` em `estimate/base.py:137` com `@allow_permission` | ❌ **errado**. `base.py:136` é `ProjectEstimatePointEndpoint`, **GET-only** (`def get` l.138), decorator `[ADMIN, MEMBER]` em l.137. `BulkEstimatePointEndpoint` está em **l.154** e usa `permission_classes = [ProjectEntityPermission]` (l.155) — mecanismo diferente |
| F8 alvo 3 | `EstimatePropertyListCreateEndpoint` — `property.py:30` | classe em **l.26**; `permission_classes` em l.30. Ambos válidos, referência ajustada |
| F8 alvo 4 | `EstimatePropertyDetailEndpoint` — `property.py:67` | classe em **l.64**; `permission_classes` em l.67 |
| root-cause F8 | "`BulkEstimatePointEndpoint` usa `@allow_permission` em `base.py:404`" | ❌ **errado**. l.404 é o 3º decorator de `EstimatePointEndpoint` (classe em l.362) |
| Migration | `0152_*.py` "(nome a confirmar)" | ✅ **0152 confirmado** (S4) — última é `0151_backfill_estimate_default_properties.py`. Irrelevante agora (DECISÃO 2), mantido como nota |
| Service | "`packages/services/src/...` **ou** `core/services/...`" | ✅ **S3 acatada**. `find` confirma: existe **apenas** em `apps/web/core/services/estimate-property.service.ts`. Não há cópia em `packages/services` |
| I3 (review) | effect incondicional em `all-properties.tsx:174-177` | ligeiramente off-by-one: `useEffect(` em **l.175**, chamada em l.177, bloco **175-178** |

**Confirmados corretos** (relidos nesta revisão): `base.py:427` (`for`), `439`, `440-442`
(F3); `base.py:461-470` (branch `else`); `all-properties.tsx:82` (`useParams`), `:161`
(`handleEstimate`), `:175-178` (effect), `:180-181` (`projectId` do route param), `:407` (gate);
`properties/root.tsx:41-43`, `:76-89`, `:124`, `:141`; `estimates/root.tsx:59-62`, `:68`, `:80`;
`project-estimate.store.ts:117`, `:502`, `:520`, `:537`, `:553`, `:559`, `:570-580`, `:585-595`,
`:611`; `kpi/issue.py` `select_related("estimate_point")` com `estimate_point__isnull=False`;
`api/views/estimate.py:30/47/106/129, 137/196, 234/264/286`.

---

## Decisão de arquitetura F1+F2: endpoint bulk, não serializer embed

**Escolha mantida** (o Stage B2 validou explicitamente): **endpoint bulk novo, project-scoped.**

**Por que não embutir no serializer de listagem de issues:**
- A listagem de issues é o contrato mais quente e compartilhado do app — o mesmo serializer
  alimenta project issues, workspace views, drafts, cycles, modules, sub-issues, intake e a API
  pública. Blast radius de ordem de grandeza maior que o bug.
- Adicionaria join/prefetch de `IssueEstimatePropertyValue` em **toda** listagem, inclusive nos
  projetos sem estimate configurado — troca um N+1 condicional por custo incondicional.
- Exigiria tocar todos os endpoints de listagem juntos, ou aceitar comportamento assimétrico
  entre eles (que é exatamente a classe de bug do F2).

**Por que endpoint bulk:** puramente aditivo (1 URL, 1 view, 1 método de service). O endpoint
por-issue (`urls/estimate.py:63-67`) tem **1 consumidor** (`estimate-property.service.ts:72`) e
permanece intacto. Rollback trivial: remover a rota.

**Por que project-scoped e não workspace-scoped**: um endpoint workspace-wide exigiria lógica de
permissão nova (filtrar issues para os projetos onde o usuário é membro) — superfície de segurança
nova num fix pass, numa feature com histórico de IDOR (`estimates-multi-active-gotchas.md`). O
project-scoped reusa `@allow_permission([ADMIN, MEMBER, GUEST])` como o
`IssueEstimatePropertyValueListEndpoint` já faz (`property.py:166`). Em workspace-views isso dá
1 request por projeto distinto na tela (tipicamente 1–5), não 200. Ganho de ~40–200x, zero
permissão nova.

**Mecanismo no frontend: coalescer no store, não refatoração dos layouts.** Os 3 call sites de
lista são componentes **por linha**. Mover o fetch para "o root da lista" exigiria alterar todos
os roots (list, kanban, spreadsheet, calendar, gantt, workspace-draft) — `all-properties.tsx`
sozinho é renderizado por vários — e **não resolveria o remount por scroll virtualizado**, que é
o agravante citado no bug-report.

---

## 🔴 B1 — Especificação do coalescer (reescrita completa)

O plano anterior dizia "checar cache". **Isso não é implementável**: o único estado disponível é
`issueEstimatePropertyValues: Record<issueId, Record<propertyId, value>>`
(`project-estimate.store.ts:117`), populado em `:592` **apenas com os values retornados**. Uma
issue **sem nenhum estimate property value setado** não deixa chave nenhuma no mapa → "checar
cache" dá miss para sempre. Esse é o caso **majoritário** numa lista real, e o fix entregaria
1 request bulk por projeto **a cada scroll**, eternamente.

### Estado novo no store — dois registros separados dos dados

```ts
// NÃO derivar de issueEstimatePropertyValues. Registro próprio, observable.
issueValuesFetchState: Record<string, "in-flight" | "done"> = {};   // issueId -> estado
projectPropertiesFetchState: Record<string, "in-flight" | "done"> = {}; // projectId -> estado
```

Ambos entram em `makeObservable` como `observable` (junto aos de `:125-126`).

### Regras dos três estados (issueValuesFetchState)

| Estado | Significado | Ação de `getIssueEstimatePropertyValues` |
|---|---|---|
| **ausente** (não-carregado) | nunca pedido | enfileira o `issueId`, marca `in-flight`, retorna a Promise da fila |
| **`"in-flight"`** | já enfileirado ou em voo | **não enfileira de novo**; retorna a Promise em voo daquele batch |
| **`"done"`** | resolvido (com ou sem values) | retorna imediatamente, **0 requests** |

**Regras obrigatórias:**
1. **Marcar `in-flight` no momento do ENFILEIRAMENTO**, não na resposta. Sem isso, dois layouts
   montando em **ticks diferentes** (não no mesmo microtask) disparam 2 requests para os mesmos ids.
2. **Marcar `done` para TODOS os ids pedidos**, inclusive os que voltaram sem nenhum value. Este
   é o ponto do B1 — é o que impede o refetch eterno das issues vazias.
3. **Em erro, REMOVER a entrada** (voltar a "ausente"), não deixar `in-flight` nem marcar `done`.
   Senão um 500 transitório congela a issue sem valores para sempre.

### Comportamento com dois layouts montando simultaneamente

- **Mesmo tick** (ex.: list + um peek overview montando juntos): a fila de microtask resolve
  junta — 1 request. Coberto pelo coalescer.
- **Ticks diferentes** (ex.: troca de layout, virtualização revelando linhas novas): coberto pelo
  estado `in-flight` marcado no enfileiramento. O 2º chamador encontra `in-flight` e **anexa-se à
  Promise em voo** em vez de abrir batch novo. Manter um `Map<issueId, Promise>` (ou uma Promise
  por batch, indexada) para poder devolvê-la.
- **Issues novas chegando enquanto um batch está em voo**: abrem um **segundo** batch. Correto e
  esperado — não tentar cancelar nem mesclar batches.

### ⛔ NÃO usar AbortController / cancelamento em unmount

O Stage B2 é explícito: **é desnecessário**. A escrita é no store (MobX), não em `setState` de
componente desmontado — não há warning de React nem leak. **O Fix não deve inventar
`AbortController`, `isMounted` flags nem cleanup de effect com cancelamento.**

### Comportamento dos 5 call sites de issue única (resolve R2)

Com o cache, abrir um peek-overview de issue já resolvida leria **stale de sessão** — hoje esses
sites refazem fetch a cada abertura. Um usuário abrindo um work item espera dado atual.

**Spec**: `getIssueEstimatePropertyValues` ganha um 4º parâmetro **opcional** `force = false`.
Os 5 call sites de issue única passam `force: true` (bypassa o cache, faz o request direto,
atualiza os dois registros). Assinatura preservada para os 3 call sites de lista → premissa do
R1 intacta.

| Call site | Arquivo | `force` |
|---|---|---|
| peek-overview | `peek-overview/properties.tsx:83` | ✅ `true` |
| issue-detail sidebar | `issue-detail/sidebar.tsx:82` | ✅ `true` |
| issue-modal | `issue-modal/components/default-properties.tsx:92` | ✅ `true` |
| power-k | `power-k/.../work-item/root.tsx:52` | ✅ `true` |
| all-properties (lista) | `all-properties.tsx:177` | ❌ default |
| estimate-column (lista) | `spreadsheet/columns/estimate-column.tsx:41` | ❌ default |
| draft-issue-properties (lista) | `workspace-draft/draft-issue-properties.tsx:69` | ❌ default |

> O 5º site de issue única citado no root-cause (`inbox/create-modal/issue-properties`) usa os
> **computeds**, não `getIssueEstimatePropertyValues` — não entra nesta tabela.

### I5 — Tabela de invalidação (mutador → o que invalida)

**Verificado no store**: 6 mutadores tocam `estimateProperties` ou o estimate. O plano anterior
citava só 2.

| Mutador | Linha | Toca o store corretamente? | Invalida `projectPropertiesFetchState[projectId]`? |
|---|---|---|---|
| `deleteEstimate` | `:502` | ❌ **não** — só `unset(this.estimates, ...)`, deixa as properties órfãs | ✅ **obrigatório** (é o F4b) |
| `updateEstimate` (toggle active / set default) | `:465` | ❌ **não** — o backend auto-cria a property default (`_ensure_estimate_default_property`, `estimate/base.py:72-88`); o store não sabe | ✅ **obrigatório** (é o F4a) |
| `createEstimateProperty` | `:531`, set em `:537` | ✅ write-through | ✅ **sim** (defensivo, custo = 1 refetch numa ação de settings) |
| `updateEstimateProperty` | `:541`, set em `:553` | ✅ write-through | ✅ **sim** (defensivo) |
| `deleteEstimateProperty` | `:557`, unset em `:559` | ✅ write-through | ✅ **sim** (defensivo) |
| `upsertKpiRoleEstimateProperty` | `:563`, `:570-580` | ⚠️ parcial — o backend pode alterar `kpi_role` de outras properties | ✅ **obrigatório** |

**Justificativa de invalidar os 4 write-through também**: invalidar apenas remove a chave do
guard; **não dispara refetch sozinho**. O custo é no máximo 1 refetch na próxima chamada de
`ensureProjectEstimateProperties`, numa página de settings admin-only e de baixo tráfego. O risco
de um estado sutilmente stale é maior que esse custo. Regra simples > regra fina.

**`issueValuesFetchState`**: invalidado por `updateIssueEstimatePropertyValue` (`:597`), que já
faz write-through em `:611` — basta manter a issue como `"done"` (o valor no store já está
correto). Nenhuma remoção necessária. Mudança de outro usuário não é coberta — aceitável, e é
o mesmo que hoje exceto pela granularidade (antes: por remount; agora: por sessão, com os 5
sites de detalhe forçando refresh).

### I3 — Effect incondicional (ACATADO — entra no escopo)

Verificado: `all-properties.tsx:175-178` roda **antes e independentemente** do gate de estimates
da l.407, sem checar a display property nem `areEstimateEnabledByProjectId`. O coalescer torna
isso barato mas não gratuito: um projeto **sem estimate nenhum configurado** continuaria
disparando 1 request bulk por projeto em toda lista renderizada.

**Spec — o guard vai no coalescer do store, NÃO no componente.** O Stage B2 está certo: o guard
depende do store de estimates estar carregado para aquele projeto, então só é confiável **depois**
do `ensureProjectEstimateProperties`. Colocá-lo no componente cria uma corrida.

Fluxo no coalescer, ao drenar a fila e agrupar por `projectId`:
1. `await ensureProjectEstimateProperties(slug, projectId)` (que já é 1 request por projeto,
   dedupado pelo `projectPropertiesFetchState`).
2. Se o projeto tem **zero** properties ativas/system → **não disparar o request bulk**; marcar
   todos os ids daquele projeto como `"done"` e resolver.
3. Caso contrário → 1 request bulk com os ids do projeto.

Isso resolve F1, F2 e I3 com o mesmo mecanismo, e zera o tráfego em projetos sem estimate.

---

## Arquivos a Modificar

### Backend (`apps/api`)

| Arquivo | Mudança | Risco |
|---|---|---|
| `plane/app/views/estimate/property.py` | **F1**: nova `IssueEstimatePropertyValueBulkListEndpoint` (GET, `?issue_ids=` csv, cap 200, `@allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])` — espelhando `IssueEstimatePropertyValueListEndpoint:166` —, escopo `project_id` + `workspace__slug`) | baixo (aditivo) |
| `plane/app/views/__init__.py` (barrel) | export da nova view | baixo |
| `plane/app/urls/estimate.py` | rota `workspaces/<slug>/projects/<uuid:project_id>/issue-estimate-properties/` (ao lado das rotas existentes, l.63-72) | baixo |
| `plane/app/views/estimate/base.py:439-442` | **F3**: desindentar `issues.update(...)` (l.439) e o update de `IssueEstimatePropertyValue` (l.440-442) para fora do `for` (de 16 → 12 espaços). **`issue_activity.delay` (l.428-438) PERMANECE dentro do loop** | **médio** — dado de produção |

### Frontend (`apps/web`)

| Arquivo | Mudança | Risco |
|---|---|---|
| `core/services/estimate-property.service.ts` | **F1**: novo `fetchIssueEstimatePropertyValuesBulk(slug, projectId, issueIds[])` com chunking em 200. **Confirmado: o arquivo existe SÓ aqui** (S3) | baixo |
| `core/store/estimates/project-estimate.store.ts` (novo estado) | **F1/F2**: `issueValuesFetchState` + `projectPropertiesFetchState` observables | médio |
| `core/store/estimates/project-estimate.store.ts:585-595` | **F1**: coalescer em `getIssueEstimatePropertyValues` + 4º param `force` | **médio** — 8 call sites |
| `core/store/estimates/project-estimate.store.ts` (novo método) | **F2**: `ensureProjectEstimateProperties(slug, projectId)` com guard de 3 estados | médio |
| `core/store/estimates/project-estimate.store.ts:502-513` | **F4b**: `deleteEstimate` remove as properties daquele estimate de `this.estimateProperties` + invalida o guard do projeto | baixo |
| `core/store/estimates/project-estimate.store.ts:465, 531, 541, 557, 563` | **I5**: invalidação do guard nos 5 mutadores restantes (ver tabela) | baixo |
| `core/components/issues/issue-layouts/properties/all-properties.tsx:180, 181, 407` | **F2**: trocar route `projectId` → `issue.project_id` nos 3 pontos | **médio** |
| `all-properties.tsx:175-178` | **F2/F1**: effect chama `ensureProjectEstimateProperties`; fetch de values passa pelo coalescer | médio |
| `all-properties.tsx:161-163` | **F7**: remover `handleEstimate` morto (zero referências; o caminho vivo é `handleEstimateChange`, l.183) | baixo |
| `issue-layouts/spreadsheet/columns/estimate-column.tsx:39-42` | **F1**: chamar `ensureProjectEstimateProperties`; effect coalescido. (Já usa `issue.project_id` em `:45-46` — **não mexer nisso**) | baixo |
| `issues/workspace-draft/draft-issue-properties.tsx:68-72` | **F1**: idem + remover `eslint-disable exhaustive-deps` (as deps ficam corretas) | baixo |
| `core/components/estimates/properties/root.tsx:41-43` | **F4a**: migrar fetch de `useEffect` para `useSWR`, key `PROJECT_ESTIMATE_PROPERTIES_${slug}_${projectId}` (mesma família de `estimates/root.tsx:59-62`) | médio |
| `core/components/estimates/root.tsx:68-96` | **F4a**: `mutate` da key acima após `handleSetDefaultEstimate` (l.68) e `handleToggleEstimateActive` (l.80) | médio |
| `core/components/estimates/properties/root.tsx:141` | **F5**: `{!property.kpi_role && !property.is_estimate_default && (...)}` — alinha com o `CustomSelect` ao lado (l.124, já usa `disabled={!isAdmin \|\| property.is_estimate_default}`) | baixo |
| `core/components/estimates/properties/root.tsx:76-89, 155-173` | **F6**: `CustomSelect` de estimate no form de criação; `handleCreate` (l.76) usa o escolhido em vez de `estimateOptions[0]` (l.78) | baixo |

### Memória (Wave 5)

| Arquivo | Mudança |
|---|---|
| `.claude/memories/repo/issues-not-fixed.md` | **NÃO EXISTE** — criar com header. 3 entradas: DEFERRED-1 (F8), DEFERRED-2 (órfãos + 2ª fonte), DEFERRED-3 (infra de teste frontend) |

### Testes

| Arquivo | Cenário |
|---|---|
| `apps/api/plane/tests/contract/app/test_estimates_app.py` | **F3 RED**: delete de point com `new_estimate_id` sem nenhuma issue na coluna legada |
| `apps/api/plane/tests/contract/app/test_estimates_app.py` | **F3 edge**: com issue legada E value de property — ambos migram; `issue_activity.delay` continua 1x por issue (S5) |
| `apps/api/plane/tests/contract/app/test_estimate_property_values.py` | **F1 bulk**: endpoint retorna N issues em 1 request; isolamento por projeto |

---

## Especificação TDD

### Test 1: F3 — reatribuição migra values quando nenhuma issue usa a coluna legada
**Arquivo**: `apps/api/plane/tests/contract/app/test_estimates_app.py`
**Classe**: nova `TestEstimatePointDestroyReassignment` (espelha
`TestEstimatePointDestroyNoReplacementSynchronousNulling:706`)
**Tipo**: contract (`@pytest.mark.contract` + `@pytest.mark.django_db`)
**Molde**: copiar
`test_deleting_point_with_no_replacement_nulls_issue_estimate_property_value_synchronously:769`
— mesmo setup (project, `ProjectMember` role=20, State, POST de estimate com 3 points,
`monkeypatch` de `db_mixins.soft_delete_related_objects.delay`).
**Diferença do molde**: (1) **não** criar nenhuma `Issue` com `estimate_point_id` setado — esse é
o ponto do teste; (2) `session_client.delete(url, data={"new_estimate_id": <outro point>}, format="json")`;
(3) assertar migração em vez de `None`.
**RED**: `value.refresh_from_db()` → `estimate_point_id` continua sendo o point deletado, porque
`issues` é vazio e o corpo do `for` (l.428-442) nunca executa.
**GREEN**: `value.estimate_point_id == new_point_id`.
**Cobertura atual**: `grep -rn "new_estimate_id" apps/api/plane/tests/` → **zero ocorrências**.
O branch de reatribuição tem cobertura ZERO. RED limpo.

### Test 2: F3 edge — issue legada presente (não quebrar o branch que hoje funciona)
**Arquivo**: mesmo
**Setup**: 1 `Issue` com `estimate_point_id` = point a deletar **E** 1 `IssueEstimatePropertyValue`
apontando para o mesmo point.
**GREEN**: (a) `issue.estimate_point_id == new_point_id`; (b) `value.estimate_point_id == new_point_id`;
(c) **S5 — ACATADA**: `issue_activity.delay` foi chamado **exatamente 1x por issue**. A desindentação
move 2 statements para fora do `for`, mas `issue_activity.delay` (l.428-438) **precisa continuar
dentro** — é o único efeito colateral que a desindentação pode arrastar junto por engano, e nenhum
outro assert cobre isso. Usar `monkeypatch`/mock com contagem de chamadas.

### Test 3: F1 — endpoint bulk
**Arquivo**: `apps/api/plane/tests/contract/app/test_estimate_property_values.py`
**Tipo**: contract
**O que testa**: `GET .../projects/<pid>/issue-estimate-properties/?issue_ids=a,b,c` retorna os
values das 3 issues em **uma** resposta.
**RED**: 404 — a rota não existe.
**GREEN**: 200, payload agrupado por issue, e os values de uma issue de **outro projeto** não
aparecem mesmo se o id for passado em `issue_ids` (**isolamento — este é o assert que importa**).
**Edge cases**: `issue_ids` ausente → 400; lista vazia → 200 vazio; >200 ids → 400; issue sem
nenhum value → ausente do payload (não erro — e o **store** marca `done` mesmo assim, ver B1).

### Frontend (F1 store, F2, F4, F5, F6, F7) — sem teste automatizado
Não há runner em `apps/web`. Aceite = typecheck + build + roteiro de browser no Stage F/UX:
- **F1**: workspace view com 50+ work items → Network filtrado por `estimate-properties` →
  esperado **≤ 1 request por projeto distinto** (hoje: 1 por linha). Scrollar → **0 requests novos**.
- **F1/I3**: projeto **sem estimate configurado** → **0 requests** de values.
- **F1/R1**: os 4 sites de issue única (peek-overview, sidebar, issue-modal, power-k) continuam
  refazendo fetch a cada abertura (`force: true`) e mostram valores corretos.
- **F2**: `/[slug]/workspace-views/[id]` em layout **list** e **kanban** → estimates aparecem,
  iguais aos do spreadsheet na mesma view.
- **F4a**: settings → ativar estimate inativo → linha nova no painel Properties **sem** reload.
- **F4b**: deletar estimate → linhas dele somem do painel **sem** reload.
- **F5**: lixeira ausente na linha system-default.
- **F6**: form de criação mostra picker de estimate; property criada no estimate escolhido.
- **F7**: sem regressão visível (remoção de código morto) — coberto por typecheck.

---

## Sequenciamento

**Nenhum wave fica gated em ambiente** (DECISÃO 3). O Wave 0 roda em paralelo com o Wave 1.

| Wave | Conteúdo | Depende de | Gate |
|---|---|---|---|
| **0** | Dev sobe container + pytest smoke verde | — | paralelo, não bloqueia |
| **1a** | F7 (código morto), F5 (lixeira), F6 (picker) | — | typecheck + build |
| **1b** | F1 backend: endpoint bulk + Test 3 | Wave 0 | pytest verde |
| **2** | F4a (SWR nas properties) + F4b (store `deleteEstimate`) + I5 (invalidação nos 6 mutadores) | — | browser |
| **3a** | **F2 completo**: `issue.project_id` nos 3 pontos + `ensureProjectEstimateProperties` + guard `projectPropertiesFetchState` | 2 | browser |
| **3b** | **F1 frontend**: service bulk + coalescer (`issueValuesFetchState`, `force`) + guard do I3 | 1b, 3a | browser (contagem de requests) |
| **4** | F3 (desindentação) + Tests 1 e 2 | Wave 0 | pytest verde |
| **5** | 3 registros em `.claude/memories/repo/issues-not-fixed.md` | — | revisão do dev |

### Por que 3a e 3b separados (I4 — ACATADO)

O Stage B2 confirmou: **F2 estava BLOCKED transitivamente sem necessidade.** F2 precisa de duas
coisas: (a) trocar `projectId` por `issue.project_id` nos 3 pontos, e (b) popular o store para os
projetos das issues visíveis via `ensureProjectEstimateProperties`. Verificado:
`ensureProjectEstimateProperties` chama `getProjectEstimateProperties` (`store:520`), que usa o
endpoint `estimate-properties/` (`urls/estimate.py:48-52`, `EstimatePropertyListCreateEndpoint.list`)
— **que já existe hoje**.

**O F2 não depende do endpoint bulk.** O bulk é de *values*, não de *properties*.

Com a DECISÃO 3 o gating some de qualquer forma, mas **a separação continua correta por clareza de
dependência**: 3a entrega o finding ALTA mais visível ao usuário sozinho, e se o 3b travar por
qualquer motivo, o F2 já está entregue. Custo de 3a isolado: passa pelo browser ainda com N
requests (aceitável — é o estado atual; o roteiro de contagem fica no 3b).

### Por que Wave 2 antes de 3a

R3/R8: `ensureProjectEstimateProperties` e o F4 tocam **o mesmo estado**
(`projectPropertiesFetchState` / `estimateProperties`). O guard de "já carregado" precisa ser
invalidável antes de existir código que dependa dele. Ordem 2 → 3a → 3b é deliberada.

---

## Registros DEFERRED (Wave 5) — conteúdo obrigatório

**Protocolo** (`.claude/instructions/memory.instructions.md`): o arquivo
`.claude/memories/repo/issues-not-fixed.md` **não existe** — verificado nesta revisão (a pasta
`repo/` tem só `estimate-properties-dynamic-kpi.md`, `estimates-multi-active-gotchas.md`,
`fix-pipeline-architecture.md`). **Passo 1**: criar com o header exato do protocolo. **Passo 2**:
ler o arquivo inteiro e checar duplicata por `**File**` + ~60 chars de `**Problem**` antes de
cada append. **Passo 3**: formato exato de entrada. `**Found in**`:
`2026-07-20-estimates-review-findings`.

### DEFERRED-1 — F8: MEMBER pode mutar estimates e estimate properties

**File**: `apps/api/plane/app/permissions/project.py:109-115` (`ProjectEntityPermission`)

**Problem**: `ProjectEntityPermission` concede escrita a `role__in=[ROLE.ADMIN, ROLE.MEMBER]`.
Todo o gating `isAdmin` da settings page de estimates é cosmético — um member pode criar,
re-apontar ou deletar sistemas de estimate direto pela API.

**Superfície completa — 8 endpoints em 2 arquivos** (a do plano original tinha só 5 e com linhas
erradas; esta foi verificada lendo o código):

*App API — `apps/api/plane/app/views/estimate/`:*

| Endpoint | Local | Mecanismo hoje | Ação futura |
|---|---|---|---|
| `BulkEstimatePointEndpoint` | `base.py:154` (`permission_classes` em `:155`) | `[ProjectEntityPermission]` | sobrescrever `create`/`partial_update`/`destroy` com `@allow_permission([ROLE.ADMIN])` |
| `EstimatePointEndpoint` | `base.py:362` | `@allow_permission([ADMIN, MEMBER])` em `:363`, `:386`, `:404` | trocar os 3 para `[ROLE.ADMIN]` |
| `EstimatePropertyListCreateEndpoint` | `property.py:26` (`permission_classes` em `:30`) | `[ProjectEntityPermission]` | sobrescrever **só** `create` (`:43`) |
| `EstimatePropertyDetailEndpoint` | `property.py:64` (`permission_classes` em `:67`) | `[ProjectEntityPermission]` | sobrescrever `partial_update` (`:74`) e `destroy` (`:104`) |
| `EstimatePropertyKpiRoleEndpoint` | `property.py:122` (decorator em `:127`) | `@allow_permission([ADMIN, MEMBER])` | trocar para `[ROLE.ADMIN]` — **o mais sensível dos cinco**, é o que re-aponta a property de KPI |
| `ProjectEstimatePointEndpoint` | `base.py:136` (decorator em `:137`) | GET-only, `[ADMIN, MEMBER]` | ⛔ **NÃO TOCAR** — é leitura |
| `IssueEstimatePropertyValueListEndpoint` | `property.py:161` (decorator em `:166`) | `[ADMIN, MEMBER, GUEST]` | ⛔ **NÃO TOCAR** — leitura |
| `IssueEstimatePropertyValueEndpoint.put` | `property.py:175` (decorator em `:178`) | `[ADMIN, MEMBER]` | ⛔ **NÃO APERTAR** — é o member setando o valor de estimate da própria work item; colaboração normal, fluxo principal da feature |

*Public API — `apps/api/plane/api/views/estimate.py` (roteada em `apps/api/plane/api/urls/estimate.py`) — **superfície que nem o A1 nem o plano original mencionavam**:*

| Endpoint | Local | Métodos de escrita |
|---|---|---|
| `ProjectEstimateAPIEndpoint` | `:30` (`permission_classes` em `:31`) | `post:47`, `patch:106`, `delete:129` |
| `EstimatePointListCreateAPIEndpoint` | `:137` (`permission_classes` em `:140`) | `post:196` |
| `EstimatePointDetailAPIEndpoint` | `:234` (`permission_classes` em `:237`) | `patch:264`, `delete:286` |

**Apertar só o app-API deixa qualquer member criar/editar/deletar estimates e points via a API
pública com um token — anulando o F8 por completo.**

**Argumento a favor de apertar (do A1)**: nesta fork, `EstimateProperty` com `kpi_role` determina
qual estimate lastreia Difficulty/Repetitive, que alimentam `engine.calcular()`
(`.claude/memories/repo/estimate-properties-dynamic-kpi.md`). Um member re-apontar essa property
**altera nota de KPI de terceiros** — privilégio administrativo. No upstream, estimate é só rótulo
de work item; a paridade citada no bug-report **não se sustenta aqui porque o dado mudou de
natureza**.

**Why deferred**:
1. **Mudança de comportamento, não bug** — é o único dos 8 findings nessa categoria, e é
   pré-existente ao fork (paridade com upstream do Plane).
2. **Risco do MCP server**: `apps/api/plane/api/views/estimate.py` é consumida pelo MCP server
   `plane-local` que o dev usa ativamente — `create_project_estimate`,
   `create_project_estimate_points`, `update_project_estimate_point`,
   `delete_project_estimate_point`, `link_estimate_to_project`. **Se o token do MCP for de member,
   apertar quebra a ferramenta.** Verificar o role do token é pré-requisito de qualquer
   implementação futura.

**⚠️ Ressalva de implementação para quem for fazer isso no futuro — a estratégia validada é
sobrescrever SÓ os métodos de escrita:**
`ProjectEntityPermission` concede leitura a **todos** os roles em `SAFE_METHODS`
(`permissions/project.py:101-107`). **Trocar a classe inteira por uma admin-only quebraria a
leitura para members e guests** — ou seja, quebraria o dropdown de estimate no work item para
todo mundo que não é admin. **Este é o erro mais provável na implementação.**
A técnica correta (manter `permission_classes` para leitura + `@allow_permission([ROLE.ADMIN])`
nos métodos de escrita) **tem precedente no próprio arquivo**: `EstimatePointEndpoint` é um
`BaseViewSet` usando `@allow_permission` por método. Combinar decorator + `permission_classes`
funciona — a classe roda primeiro (member passa), o decorator restringe depois.

**Sources**: bug-report F8 · root-cause F8 · plan-review B2 · plan-review B3

### DEFERRED-2 — `IssueEstimatePropertyValue` órfãos apontando para `EstimatePoint` soft-deletado

**File**: `apps/api/plane/app/views/estimate/base.py:439-442` (fonte 1, **corrigida nesta sessão**)
e `apps/api/plane/api/views/estimate.py:286-291` (fonte 2, **NÃO corrigida**)

**Problem**: existem em produção `IssueEstimatePropertyValue` cujo `estimate_point` foi
soft-deletado. Verificado que **eles não são inertes**: `KpiPropertyResolver.__init__`
(`apps/api/plane/app/views/kpi/issue.py:47-50`) faz
`.filter(..., estimate_point__isnull=False).select_related("estimate_point")` — o JOIN **não**
filtra `deleted_at__isnull=True`, porque o `SoftDeletionManager` (`db/mixins.py:56-58`) filtra o
queryset base do modelo consultado, **não os joins de FK**. Logo os órfãos **resolvem
normalmente e continuam alimentando `engine.calcular()`**. O estrago em produção não é uma nota
faltando — é uma nota calculada a partir de um estimate point que o admin já deletou.

**Why deferred** — três razões independentes:

1. **Anular não é neutro e o efeito é imprevisível.** Ao anular, o value sai do filtro
   `estimate_point__isnull=False`, `points_for` devolve `None`, e `_difficulty_lookup_key`
   (`kpi/issue.py`) **cai no fallback para `issue.estimate_point_id`**:
   ```python
   if difficulty_point is not None:
       return str(difficulty_point.id)
   if issue.estimate_point_id and issue.estimate_point is not None:
       return str(issue.estimate_point_id)
   return None
   ```
   A nota não vai a zero nem necessariamente cai — passa a usar o estimate **nativo** da issue,
   que pode dar contribuição maior, menor ou igual, **issue a issue**. Efeito **não-monotônico e
   não previsível sem rodar**. Mexe em nota de KPI de pessoas reais.

2. **Migrar (em vez de anular) é inviável.** O alvo não é recuperável do banco: por construção, os
   órfãos que este bug produz são exatamente aqueles em que **nenhuma** `Issue` usava a coluna
   legada — então não há `Issue.estimate_point` migrada de onde inferir o `new_estimate_id`, e o
   `issue_activity.delay` (único registro do DELETE) também só é emitido **dentro** do
   `for issue in issues`, que não rodou. **Nada no banco guarda o `new_estimate_id` daquele DELETE.**

3. **Existe uma SEGUNDA fonte que continua sangrando mesmo depois do fix do F3.**
   `EstimatePointDetailAPIEndpoint.delete` (`apps/api/plane/api/views/estimate.py:286-291`) — o
   delete de point da API pública — faz apenas `estimate_point.delete()` sem `new_estimate_id`,
   sem nulling síncrono de `Issue.estimate_point` nem de `IssueEstimatePropertyValue`. Delega
   100% ao cascade assíncrono `soft_delete_related_objects` (`bgtasks/deletion_task.py:18`), que
   **só cobre a FK se o Celery estiver de pé** — precisamente a dependência que o fork removeu do
   caminho do app-API ("Step B9", `app/views/estimate/base.py:461-466`). **Uma migration de reparo
   limparia órfãos enquanto esse segundo caminho continua gerando-os** em qualquer janela de
   Celery fora do ar. Reparar sem fechar essa fonte é enxugar gelo.

**Se for retomado no futuro**, a ordem correta é: (1) estender o nulling síncrono ao delete
público (`api/views/estimate.py:286`), (2) só então avaliar reparo. E dimensionar com **dupla**
contagem, não simples:
```sql
-- órfãos totais
SELECT COUNT(*) FROM issue_estimate_property_values v
  JOIN estimate_points p ON v.estimate_point_id = p.id
 WHERE p.deleted_at IS NOT NULL;
-- quantos desses trocariam de valor pelo fallback (issue tem estimate nativo)
SELECT COUNT(*) FROM issue_estimate_property_values v
  JOIN estimate_points p ON v.estimate_point_id = p.id
  JOIN issues i ON v.issue_id = i.id
 WHERE p.deleted_at IS NOT NULL AND i.estimate_point_id IS NOT NULL;
```
Decidir também se restringe a values de properties com `kpi_role IS NOT NULL` ou se pega todas —
decisões diferentes, impactos diferentes. Próxima migration livre: `0152` (última é
`0151_backfill_estimate_default_properties.py`).

**Sources**: bug-report F3 · root-cause F3 · plan-review I1 · plan-review I2 · plan-review S2

### DEFERRED-3 — `apps/web` não tem nenhuma infraestrutura de teste

**File**: `apps/web/package.json`

**Problem**: `apps/web` não tem script `"test"`, não tem jest nem vitest, e tem **zero arquivos
`*.test.tsx`**. No monorepo, só `apps/live` e `packages/codemods` têm `"test"`. Não existe
`playwright.config.*` em lugar nenhum do repo (os únicos `*.spec.ts` são
`packages/codemods/tests/{function-declaration,remove-directives}.spec.ts`, testes de codemod;
`.playwright-mcp` no `.gitignore` é o diretório de **saída** do MCP server, não infra de teste).
Consequência: **6 dos 8 findings desta sessão são frontend e foram corrigidos sem nenhum
regression guard.** A verificação por MCP/`gem-browser-tester` é *one-shot* e não deixa nada para
trás.

**Why deferred**: montar vitest + testing-library + mocks de MobX/SWR é mudança de infra grande,
com risco próprio, fora do escopo de um fix pass.

**Sources**: root-cause (bloqueio de ambiente) · plan-review S1

---

## Riscos de Regressão

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| R1 | Coalescer muda o comportamento de **8** call sites, incluindo os 5 de issue única que hoje funcionam | **alta** | Assinatura e `Promise` preservadas; `force` é 4º param opcional. Roteiro de browser cobre os 4 sites de issue única (peek-overview, sidebar, issue-modal, power-k) — não só as listas |
| R2 | Cache torna valores **stale** após update externo | média | `updateIssueEstimatePropertyValue` já faz write-through (`:611`). Os 4 sites de detalhe passam `force: true` → sempre fresh. Mudança por outro usuário não é coberta — aceitável |
| R3 | Guard de "já carregado" impede re-fetch legítimo após F4a | média | Tabela de invalidação do I5 cobre os **6** mutadores. **Wave 2 antes da 3a**, deliberadamente |
| R4 | F3: desindentar quebra o branch que **hoje** funciona (issue legada presente) | média | Test 2 (edge case) existe exatamente para isso |
| R5 | F3: desindentar arrasta `issue_activity.delay` junto por engano | média | Assert de contagem de chamadas no Test 2 (S5) |
| R6 | Endpoint bulk sem cap → URL longa demais / query pesada | baixa | Cap 200 no backend (400) + chunking no service |
| R7 | Coalescer com estado só de 2 valores → refetch eterno das issues sem values | **alta** | **É o B1.** Três estados, `in-flight` no enfileiramento, `done` para todos os ids pedidos, remoção em erro |
| R8 | Fix inventa `AbortController`/cancelamento em unmount | média | Proibição explícita na spec do B1 |
| R9 | F4a (SWR) muda o ciclo de vida do fetch num componente de que o F2 passa a depender | média | Mesmo acoplamento do R3. Ordem 2 → 3a → 3b |
| R10 | **Nenhum fix de frontend tem teste automatizado** — 6 de 7 findings executáveis | **alta (estrutural)** | Roteiro de browser obrigatório no Stage F/UX + DEFERRED-3 |
| R11 | Fix implementa F8 ou a migration por inércia (estão descritos em detalhe nos registros DEFERRED) | média | **Wave 5 é escrita em `issues-not-fixed.md`, NÃO código.** F8 e a migration estão FORA do escopo de execução por decisão do dev |

---

## Serviços para build+test

- `apps/api` —
  `docker compose -f docker-compose-local.yml exec api pytest plane/tests/contract/app/test_estimates_app.py plane/tests/contract/app/test_estimate_property_values.py`
- `apps/web` — `pnpm typecheck` + `pnpm build`
- ~~`packages/services`~~ — **não se aplica** (S3). `estimate-property.service.ts` existe apenas em
  `apps/web/core/services/`; não há cópia em `packages/services`. A gotcha de build-staleness de
  `estimate-properties-dynamic-kpi.md` **não é acionada aqui**.

---

## Tratamento item a item do `plan-review.md`

| Item | Tratamento |
|---|---|
| **B1** cache não derivável | ✅ **ACATADO** — seção "🔴 B1" reescreve o coalescer: 2 registros novos no store, 3 estados, `in-flight` no enfileiramento, `done` para todos os ids, remoção em erro, comportamento com 2 layouts, proibição de `AbortController` |
| **B2** F8 ignora a API pública | ✅ **ACATADO como informação, escopo removido** — DECISÃO 1 tira F8 da execução; a superfície completa (8 endpoints, 2 arquivos) fica preservada em DEFERRED-1, incluindo o risco do MCP |
| **B3** `arquivo:linha` errados | ✅ **ACATADO** — seção "Correções de referência". Varredura completa; 6 erros corrigidos (incl. um do root-cause). Alvos verificados preservados em DEFERRED-1 |
| **I1** impacto do repair mal previsto | ✅ **ACATADO** — a mecânica do fallback não-monotônico é agora a razão nº 1 do DEFERRED-2; a dupla contagem SQL substituiu a simples |
| **I2** 2ª fonte de órfãos | ✅ **ACATADO** — declarado explicitamente na DECISÃO 2 ("o fix do F3 NÃO estanca todos os órfãos") e é a razão nº 3 do DEFERRED-2 |
| **I3** effect incondicional | ✅ **ACATADO, entra no escopo** — guard no coalescer (não no componente, para evitar corrida), Wave 3b. Roteiro de browser inclui "projeto sem estimate → 0 requests" |
| **I4** F2 bloqueado sem precisar | ✅ **ACATADO** — Wave 3a (F2, livre) / 3b (bulk). Com a DECISÃO 3 o gating some, mas a separação fica por clareza de dependência, como pedido |
| **I5** invalidação não especificada | ✅ **ACATADO** — tabela "mutador → o que invalida" com os 6 mutadores. Os 4 write-through invalidam também, por regra simples > regra fina, com justificativa de custo |
| **S1** Playwright / one-shot | ✅ **ACATADA** — ressalva incorporada ao critério de aceite; vira DEFERRED-3 |
| **S2** 3ª via inviável | ✅ **ACATADA** — é a razão nº 2 do DEFERRED-2 |
| **S3** local do service | ✅ **ACATADA** — ambiguidade removida; `packages/services` riscado da lista de build |
| **S4** migration `0152` | ✅ **ACATADA como nota** — confirmado, mas irrelevante para a execução (DECISÃO 2). Registrado em DEFERRED-2 para uso futuro |
| **S5** assert de `issue_activity` | ✅ **ACATADA** — assert (c) do Test 2, e virou R5 |

**Nada foi rejeitado.** Os únicos itens que não viram código (B2, B3 parcial, I1, I2, S2, S4)
saíram do escopo por decisão do dev, não por discordância técnica — e toda a informação verificada
foi preservada nos registros DEFERRED, que é onde ela é útil para quem retomar.

---

## Resumo do escopo

- **7 findings executáveis**: F1, F2, F3, F4 (a+b), F5, F6, F7
- **2 findings/problemas registrados como DEFERRED**: F8 (DEFERRED-1), órfãos do F3 (DEFERRED-2)
- **1 lacuna estrutural registrada**: infra de teste do frontend (DEFERRED-3)
- **Fora do escopo**: aperto de permissões, migration de reparo, infra de teste de frontend
