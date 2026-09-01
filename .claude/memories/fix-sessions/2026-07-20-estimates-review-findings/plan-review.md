# Plan Review — Estimates review findings (Stage B2, 2026-07-20)

Gate read-only sobre `fix-plan.md`. Todas as afirmações abaixo foram verificadas lendo o
código-fonte, não inferidas do plano.

## Decisão

**CHANGES_REQUESTED** — 3 blockers, 5 importantes, 5 sugestões.

A arquitetura central (endpoint bulk project-scoped + coalescer no store) está **correta e
bem justificada**. Os blockers são de especificação: o plano descreve mecanismos que não são
implementáveis como escritos (B1), deixa aberta a porta lateral que ele mesmo proíbe (B2), e
contém `arquivo:linha` errados que levariam o Fix a editar o endpoint errado (B3).

---

## Problemas Encontrados

### B1: O cache do coalescer não é derivável do estado atual do store
**Tipo**: abordagem
**Severidade**: 🔴 blocker

**Descrição**: O plano diz que `getIssueEstimatePropertyValues` passa a "(1) checar cache, (2)
enfileirar o `issueId`...". Mas o único estado disponível é
`issueEstimatePropertyValues: Record<issueId, Record<propertyId, value>>`
(`project-estimate.store.ts:117`), populado em `:592` apenas com os values **retornados**.

Uma issue **sem nenhum estimate property value setado** não deixa chave nenhuma no mapa. Logo
"checar cache" sempre dá miss para ela. Esse é o caso **majoritário** numa lista real — e é
exatamente o cenário que o bug-report cita como agravante (remount por scroll virtualizado).
O fix entregaria: 1 request bulk por projeto por scroll, para sempre, nas issues vazias.

**Sugestão**: o plano deve especificar um registro separado de "issues já resolvidas",
distinto do mapa de valores, com três estados e não dois:
- `resolvedIssueIds: Record<issueId, "in-flight" | "done">` (ou dois Sets).
- Marcar `in-flight` **no momento do enfileiramento**, não na resposta — senão dois layouts
  montando em ticks diferentes (não no mesmo microtask) disparam 2 requests para os mesmos ids.
- Marcar `done` para **todos** os ids pedidos, incluindo os que voltaram sem value.
- Em erro, remover a entrada (senão um 500 transitório congela a issue sem valores para sempre).

### B2: F8 deixa exatamente a porta lateral que o plano proíbe — a API pública
**Tipo**: regressão / cobertura incompleta
**Severidade**: 🔴 blocker

**Descrição**: O plano enumera 5 endpoints em `plane/app/views/estimate/` e afirma "apertar
parcial deixa porta lateral". Existe uma segunda superfície inteira que nem o A1 nem o Plan
mencionam: `apps/api/plane/api/views/estimate.py`, roteada em `apps/api/plane/api/urls/estimate.py`.
Todos com `permission_classes = [ProjectEntityPermission]` → escrita liberada a ADMIN+MEMBER:

| Endpoint | Linha | Métodos de escrita |
|---|---|---|
| `ProjectEstimateAPIEndpoint` | `api/views/estimate.py:30` | `post:47`, `patch:106`, `delete:129` |
| `EstimatePointListCreateAPIEndpoint` | `:137` | `post:196` |
| `EstimatePointDetailAPIEndpoint` | `:234` | `patch:264`, `delete:286` |

Apertar só o app-API deixa qualquer member criar/editar/deletar estimates e points via a API
pública com um token — anulando o F8 por completo.

Isto também **materializa o R7** (que o plano tratou como abstrato, "grep antes de apertar"):
o MCP server `plane-local` expõe `create_project_estimate`, `create_project_estimate_points`,
`update_project_estimate_point`, `delete_project_estimate_point`, `link_estimate_to_project` —
que consomem justamente essa superfície. Se o token do MCP for de member, o F8 quebra a
ferramenta.

**Sugestão**: incluir os 3 endpoints públicos no escopo do F8 (mesma técnica: manter a classe
para leitura, apertar os métodos de escrita) **ou** declarar explicitamente que a API pública
fica de fora e por quê — mas nesse caso o F8 não deve ser vendido como fechamento do buraco.
Adicionar ao roteiro de verificação: qual role tem o token usado pelo MCP server.

### B3: `arquivo:linha` incorretos no F8 — o Fix editaria o endpoint errado
**Tipo**: abordagem (erro factual)
**Severidade**: 🔴 blocker

**Descrição**: O plano lista, item 1 da lista de 4:
> `BulkEstimatePointEndpoint` — `estimate/base.py:137` (`@allow_permission([ADMIN, MEMBER])`)

Verificado: `estimate/base.py:136` é `ProjectEstimatePointEndpoint` — um endpoint **GET-only**
(`def get`, l.138) cujo `@allow_permission([ADMIN, MEMBER])` está em l.137. `BulkEstimatePointEndpoint`
está em l.154 e usa `permission_classes = [ProjectEntityPermission]` — mecanismo diferente,
tratamento diferente. O root-cause tem o mesmo erro invertido (afirma que o Bulk usa
`@allow_permission` em l.404; l.404 é o terceiro decorator de `EstimatePointEndpoint`, l.362).

Consequências se o Fix seguir literalmente: (a) aperta um endpoint de **leitura** para
ADMIN-only, quebrando o dropdown para members — que é precisamente o erro que o plano avisa
ser "o mais provável na implementação do F8"; (b) deixa o `BulkEstimatePointEndpoint` real
intocado.

**Sugestão**: corrigir a tabela do F8 com os alvos verificados:

| Endpoint | Local | Mecanismo hoje | Ação |
|---|---|---|---|
| `BulkEstimatePointEndpoint` | `base.py:154` | `permission_classes=[ProjectEntityPermission]` | sobrescrever `create`/`partial_update`/`destroy` com `@allow_permission([ADMIN])` |
| `EstimatePointEndpoint` | `base.py:362` | `@allow_permission([ADMIN,MEMBER])` em 363/386/404 | trocar os 3 para `[ADMIN]` |
| `EstimatePropertyListCreateEndpoint` | `property.py:26` | `permission_classes` | sobrescrever só `create` |
| `EstimatePropertyDetailEndpoint` | `property.py:64` | `permission_classes` | sobrescrever `partial_update`/`destroy` |
| `EstimatePropertyKpiRoleEndpoint` | `property.py:122`, decorator em `:127` | `@allow_permission([ADMIN,MEMBER])` | trocar para `[ADMIN]` |
| `ProjectEstimatePointEndpoint` | `base.py:136` | GET, `[ADMIN,MEMBER]` | **NÃO TOCAR** (leitura; já exclui GUEST hoje) |

Nota positiva: a técnica que o plano recomendou (não trocar a classe, sobrescrever só escrita)
é **válida e já tem precedente no próprio arquivo** — `EstimatePointEndpoint` é um `BaseViewSet`
usando `@allow_permission` por método. Combinar decorator + `permission_classes` funciona: a
classe roda primeiro (member passa), o decorator restringe depois.

---

### I1: A previsão de impacto do F3-repair está errada (o sign-off do dev depende dela)
**Tipo**: causa raiz
**Severidade**: ⚠️ importante

**Descrição**: O núcleo da análise está **confirmado**: `KpiPropertyResolver.__init__`
(`app/views/kpi/issue.py:47-50`) faz `select_related("estimate_point")` com
`estimate_point__isnull=False` → INNER JOIN sobre a coluna FK, e `select_related` não aplica o
`SoftDeletionManager` do modelo relacionado. Órfãos hoje resolvem para o point soft-deletado e
alimentam `engine.calcular()`. Correto e bem achado.

Mas a consequência prevista — *"Notas caem para quem tinha órfãos"* — **não se sustenta**. Ao
anular, o value sai do filtro `estimate_point__isnull=False`, `points_for` devolve `None`, e
`_difficulty_lookup_key` (`kpi/issue.py`) **cai no fallback para `issue.estimate_point_id`**:

```python
if difficulty_point is not None:
    return str(difficulty_point.id)
if issue.estimate_point_id and issue.estimate_point is not None:
    return str(issue.estimate_point_id)
return None
```

Ou seja: a nota não vai a zero nem necessariamente cai. Ela passa a usar o estimate **nativo**
da issue, que pode dar contribuição maior, menor ou igual, issue a issue. O efeito é
**não-monotônico e não previsível sem rodar**.

**Sugestão**: reescrever a seção com essa mecânica e trocar o passo 2 (contagem simples) por
uma dupla contagem, que é o que dimensiona de verdade a decisão:
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
E restringir a migration aos values de properties com `kpi_role IS NOT NULL` vs. todas —
decisões diferentes, impactos diferentes.

### I2: "F3 para o sangramento" é falso — existe uma segunda fonte de órfãos
**Tipo**: causa raiz
**Severidade**: ⚠️ importante

**Descrição**: O plano afirma que, sem sign-off, "F3 (o fix de código) entra sozinho e para o
sangramento". Verificado — não para. `EstimatePointDetailAPIEndpoint.delete`
(`apps/api/plane/api/views/estimate.py:286-291`) é o delete de point da API pública e faz
apenas:
```python
estimate_point.delete()
return Response(status=status.HTTP_204_NO_CONTENT)
```
Sem `new_estimate_id`, sem nulling síncrono de `Issue.estimate_point` nem de
`IssueEstimatePropertyValue`. Delega 100% ao cascade assíncrono
`soft_delete_related_objects` (`bgtasks/deletion_task.py:18`), que é genérico e provavelmente
cobre a FK — **se o Celery estiver de pé**. Foi exatamente essa dependência que o fork removeu
do caminho do app-API (comentário "Step B9" em `base.py:461-466`).

Logo: a migration de reparo limparia órfãos enquanto um segundo caminho continua gerando-os
em qualquer janela de Celery fora do ar.

**Sugestão**: decidir explicitamente entre (a) estender o nulling síncrono ao delete público
no mesmo wave do F3, ou (b) registrar como DEFERRED nomeado — mas remover a afirmação de que
o F3 sozinho estanca. Também muda o enquadramento da migration: ela não repara só o bug do F3.

### I3: F1 não trata o effect incondicional — sub-achado do bug-report que sumiu do plano
**Tipo**: edge case
**Severidade**: ⚠️ importante

**Descrição**: O bug-report (F1, agravante 3) e o A1 confirmam que o `useEffect` de
`all-properties.tsx:174-177` roda **antes e independentemente** do gate de estimates da l.407,
sem checar a display property nem `areEstimateEnabledByProjectId`. Verificado no arquivo.

O coalescer resolve o N+1 mas **não** resolve isto: um projeto sem estimate nenhum configurado
continua disparando 1 request bulk por projeto em toda lista renderizada. Ficou barato, mas
segue sendo trabalho inútil, e o plano não menciona o item em lugar nenhum.

**Sugestão**: adicionar ao Wave 3 o guard no effect
(`if (!areEstimateEnabledByProjectId(issue.project_id)) return;`), ou declarar DEFERRED com
justificativa. Atenção à ordem: o guard depende do store de estimates estar carregado para
aquele projeto, então ele só é confiável **depois** do `ensureProjectEstimateProperties` —
provavelmente o guard pertence ao coalescer no store, não ao componente.

### I4: F2 está de fato BLOCKED e o plano não diz — mas não precisaria estar
**Tipo**: abordagem (sequenciamento)
**Severidade**: ⚠️ importante

**Descrição**: Confirmada a suspeita levantada. A tabela de waves gate 1b no Wave 0, e o Wave 3
(F1+F2) depende do 1b. Transitivamente **F2 — um dos dois findings ALTA e o mais visível ao
usuário — fica bloqueado atrás do ambiente Python**. A seção "Bloqueios ativos" do
`stage-b-plan.md` lista apenas "Waves 1b, 4, 6 BLOCKED", o que subestima o alcance: o correto é
**1b, 3, 4, 5, 6** — 5 dos 7 waves.

Mas essa dependência é **artificial**. O F2 precisa de duas coisas: (a) trocar `projectId` por
`issue.project_id` nos 3 pontos, e (b) popular o store para os projetos das issues visíveis via
`ensureProjectEstimateProperties`. Verificado: `ensureProjectEstimateProperties` chamaria
`getProjectEstimateProperties`, que usa o endpoint `estimate-properties/` **que já existe hoje**
(`urls/estimate.py`, `EstimatePropertyListCreateEndpoint.list`). **O F2 não depende do endpoint
bulk** — o bulk é só de *values*, não de *properties*.

**Sugestão**: quebrar o Wave 3 em dois:
- **3a (não-gated)**: F2 completo — `issue.project_id` + `ensureProjectEstimateProperties`, com
  o `getIssueEstimatePropertyValues` per-issue atual. Entrega o finding ALTA hoje.
- **3b (gated no 1b)**: service bulk + coalescer no store. F1 puro; nenhum call site muda de
  novo, porque a assinatura é preservada (é a premissa do R1).

Isso reduz os bloqueados a 1b, 3b, 4, 5, 6 e tira o finding mais visível da fila de espera.
Custo: 3a passa pelo browser com N requests ainda (aceitável — é o estado atual, e o roteiro
de contagem de requests fica no 3b).

### I5: A regra de invalidação dos dois caches não está especificada
**Tipo**: edge case
**Severidade**: ⚠️ importante

**Descrição**: R2 e R3 **reconhecem** o problema mas nenhum define a regra, e o Fix precisa dela
por escrito. Dois caches distintos, dois conjuntos de invalidadores:

1. `resolvedIssueIds` (values, do B1): `updateIssueEstimatePropertyValue` já faz write-through
   (`:611`) — cobre o caminho local. Falta decidir peek-overview/issue-detail: hoje eles
   refazem fetch a cada abertura; com cache passam a ler stale de sessão. O plano diz
   "invalidar o cache da issue no peek-overview/detail" no R2 mas não põe isso na tabela de
   arquivos a modificar — vira invisível para o Fix.
2. `loadedProjectProperties` (guard do `ensureProjectEstimateProperties`): o plano cita só
   F4a (`mutate`) e F4b (`deleteEstimate`). Verificado no store, faltam **4** mutadores que
   também alteram `estimateProperties` e portanto precisam invalidar o projeto:
   `createEstimateProperty` (`:537`), `updateEstimateProperty` (`:553`),
   `deleteEstimateProperty` (`:559`), `upsertKpiRoleEstimateProperty` (`:570-580`).

**Sugestão**: tabela explícita "mutador → o que invalida" no plano, cobrindo os 6 mutadores.
Sobre concorrência: coalescer por microtask é seguro para dois layouts montando **no mesmo
tick** (a fila resolve junta). Não protege ticks diferentes — por isso o estado `in-flight` do
B1 é obrigatório, não opcional. Cancelamento em unmount **não** é necessário (a escrita é no
store, não em `setState` de componente desmontado) — vale o plano dizer isso para o Fix não
inventar `AbortController`.

---

### S1: Playwright — não há alternativa dentro do escopo; o plano está certo, mas seja explícito
**Tipo**: abordagem
**Severidade**: 💡 sugestão

Verificado: **não existe** `playwright.config.*` em lugar nenhum do repo; os únicos `*.spec.ts`
são `packages/codemods/tests/{function-declaration,remove-directives}.spec.ts` (testes de
codemod, não E2E). `.playwright-mcp` no `.gitignore` é o diretório de **saída** do MCP server,
não infraestrutura de teste.

O que existe é automação de browser via MCP (`mcp__playwright__*`), a skill `playwright-testing`
e o agente `gem-browser-tester` — que é exatamente o que o plano já propõe para o Stage F/UX.
Então: **o plano está correto e não há caminho melhor dentro do escopo.** A ressalva a
acrescentar é qualitativa: verificação por MCP é *one-shot*, **não deixa regression guard
atrás de si**. Todo fix de frontend deste pass ficará permanentemente sem rede. Isso reforça o
R10 e o registro em `issues-not-fixed.md`; não muda o veredito.

### S2: A 3ª opção do F3-repair (migrar em vez de anular) é inviável — e o plano deveria dizer
**Tipo**: causa raiz
**Severidade**: 💡 sugestão

O dev vai perguntar "por que não migrar para o point novo, que é o que o código deveria ter
feito?". A resposta é que **o alvo não é recuperável**: por construção, os órfãos que este bug
produz são exatamente aqueles em que **nenhuma** `Issue` usava a coluna legada — então não há
`Issue.estimate_point` migrada de onde inferir o `new_estimate_id`, e o `issue_activity.delay`
(único registro do delete) também só é emitido dentro do `for issue in issues`, que não rodou.
Nada no banco guarda o `new_estimate_id` daquele DELETE.

Incluir esse parágrafo evita uma rodada de ida e volta no sign-off.

### S3: Localização do service confirmada — remover a ambiguidade
**Tipo**: abordagem
**Severidade**: 💡 sugestão

O plano escreve "`packages/services/src/.../estimate-property.service.ts` **ou**
`core/services/estimate-property.service.ts`". Verificado: o arquivo existe **apenas** em
`apps/web/core/services/estimate-property.service.ts`. Não há cópia em `packages/services`.

Consequência prática: o passo "`packages/services` — `pnpm run build` (tsdown)" da seção
"Serviços para build+test" **não se aplica** e a gotcha de build-staleness de
`estimate-properties-dynamic-kpi.md` não é acionada aqui. Fixar isso no plano evita que o Fix
crie o método no pacote errado e depois passe uma hora atrás de um typecheck que não vê nada.

### S4: `0152` confirmado como próximo número de migration
**Tipo**: abordagem
**Severidade**: 💡 sugestão

A última é `0151_backfill_estimate_default_properties.py`. O "(nome a confirmar)" do plano pode
virar `0152_repair_orphan_estimate_property_values.py`.

### S5: F3 — acrescentar um assert sobre `issue_activity`
**Tipo**: regressão
**Severidade**: 💡 sugestão

A desindentação move 2 statements para fora do `for`, mas `issue_activity.delay` **precisa
continuar dentro**. O 2º teste (edge case, com issue legada) deve assertar que o activity segue
sendo emitido 1x por issue — é o único efeito colateral que a desindentação pode levar junto
por engano, e nenhum assert do plano cobre isso hoje.

---

## Pontos Fortes

- **A decisão bulk-endpoint vs. serializer-embed está certa e bem argumentada.** O raciocínio
  de blast radius (o serializer de issues alimenta project/workspace/drafts/cycles/modules/
  sub-issues/intake/API pública) é o argumento decisivo, e a alternativa trocaria um N+1
  condicional por custo incondicional em todo projeto sem estimate.
- **Project-scoped resolve o F2 sim.** Auditei o cenário multi-projeto que o prompt levantou:
  numa workspace view o custo vira O(projetos distintos na página), não O(1) — mas continua
  sendo O(1) *por projeto* em vez de O(linhas). Com 200 items em 5 projetos: 5 requests contra
  200. E o argumento de permissão é real: um endpoint workspace-wide exigiria filtrar issues
  pelos projetos onde o usuário é membro — superfície de autorização nova num fix pass, com o
  histórico de IDOR que esta própria feature já teve (`estimates-multi-active-gotchas.md`).
  Trade-off corretamente pesado; **manter a escolha**.
- **Coalescer no store em vez de refatorar os roots de layout** é a decisão certa, pelo motivo
  certo: os 3 call sites são componentes por-linha e uma refatoração de root tocaria 6 layouts
  sem sequer resolver o remount por scroll virtualizado.
- **Não separar F1 de F2** — herdado do A1, mantido com justificativa própria. Correto.
- **A recusa da opção (b) do A1** (escrever teste sem executar), ancorada no precedente concreto
  do `deleted_at`/`UniqueTogetherValidator` que quebrou 100% dos `POST /estimates/` em produção,
  é a decisão de maior valor do plano. Manter, inclusive a consequência: sem Wave 0, BLOCKED —
  não "feito sem teste".
- **A correção do A1 sobre a infra de teste do frontend** (`pnpm` disponível ≠ existe runner)
  é uma auditoria honesta de um erro do estágio anterior. Verificada e correta.
- **O achado do `select_related` atravessando soft-delete** é o melhor trabalho técnico desta
  fase: transforma o F3-repair de "cleanup óbvio" em decisão com sign-off. A mecânica exata do
  impacto está errada (I1), mas a descoberta que muda a natureza da decisão está certa.
- **O aviso sobre não trocar `ProjectEntityPermission` por uma classe admin-only** identifica
  corretamente o erro mais provável na implementação do F8 — e verifiquei que a classe de fato
  concede leitura a todos os roles em `SAFE_METHODS` (`permissions/project.py:101-107`).
- **R1–R10 são riscos reais**, não teatro de risco. R3/R8 antecipam corretamente o acoplamento
  F4↔F2 e justificam a ordem 2→3.

---

## Resumo

- Aprovado: ❌ **CHANGES_REQUESTED**
- Bloqueadores: **3** (B1 cache não derivável · B2 API pública fora do F8 · B3 `arquivo:linha` errados no F8)
- Importantes: **5** (I1 impacto do repair mal previsto · I2 segunda fonte de órfãos · I3 effect incondicional · I4 F2 bloqueado sem precisar · I5 invalidação não especificada)
- Sugestões: **5** (S1 Playwright · S2 3ª via inviável · S3 local do service · S4 nº da migration · S5 assert de activity)

**Nenhuma mudança de arquitetura é necessária.** Os 3 blockers são de especificação e todos
têm correção pontual descrita acima. O caminho mais curto para APPROVED:

1. Reescrever a seção do coalescer com os 3 estados de cache e a tabela de invalidação (B1+I5).
2. Refazer a tabela do F8 com os alvos verificados e decidir sobre a API pública (B2+B3).
3. Quebrar o Wave 3 em 3a/3b e corrigir a lista de bloqueados para 1b, 3b, 4, 5, 6 (I4).
4. Corrigir a previsão de impacto do F3-repair e o alcance do F3 (I1+I2).
5. Decidir F1-effect-incondicional: entra ou DEFERRED (I3).
</content>
</invoke>

---
---

# RE-REVISÃO — Rodada 2 (Stage B2, 2026-07-20)

Gate focado. Verifica apenas (a) fechamento dos 3 blockers, (b) aplicação correta das 3
decisões do dev, (c) problemas novos introduzidos pela reescrita. **Não repete a revisão
completa** — o registro da rodada 1 acima fica preservado.

## Decisão

**APPROVED**, com **1 condição obrigatória de execução (C1)** — uma linha faltando na tabela
de invalidação. Ver abaixo.

Os 3 blockers estão **fechados**. As 3 decisões do dev foram aplicadas corretamente e sem
resíduo. Um problema novo foi introduzido pela reescrita (C1), de grau "importante", com
correção pontual e não-ambígua.

---

## Fechamento dos blockers

### B1 — coalescer: ✅ FECHADO

Spec agora é implementável sem ambiguidade. Verifiquei os três pontos que importavam:

**(a) O `done` para ids sem value fecha o cache-miss-eterno.** Sim. A regra 2 ("marcar `done`
para TODOS os ids pedidos, inclusive os que voltaram sem nenhum value") ataca exatamente a
causa que apontei: o registro passou a ser **próprio** (`issueValuesFetchState`), não derivado
de `issueEstimatePropertyValues`, então a ausência de values deixa de ser indistinguível da
ausência de fetch. As regras 1 (`in-flight` no enfileiramento) e 3 (remoção em erro) cobrem os
dois furos laterais que eu tinha listado.

**(b) O `force` NÃO reintroduz o N+1 em nenhum call site de lista.** Verificado por grep — há
exatamente **7** call sites de `getIssueEstimatePropertyValues` fora do store, e a tabela do
plano acerta os 7, com linha correta:

| Call site | Verificado | `force` no plano |
|---|---|---|
| `workspace-draft/draft-issue-properties.tsx:70` | ✅ (plano diz `:69` — off-by-one inócuo) | default ✅ |
| `issue-layouts/properties/all-properties.tsx:177` | ✅ | default ✅ |
| `spreadsheet/columns/estimate-column.tsx:41` | ✅ | default ✅ |
| `peek-overview/properties.tsx:83` | ✅ | `true` ✅ |
| `issue-modal/components/default-properties.tsx:92` | ✅ | `true` ✅ |
| `issue-detail/sidebar.tsx:82` | ✅ | `true` ✅ |
| `power-k/ui/pages/context-based/work-item/root.tsx:52` | ✅ | `true` ✅ |

`force` é 4º param **opcional com default `false`** — os 3 sites de lista não passam nada e
continuam no caminho coalescido. Não há caminho pelo qual um site de lista receba `force`.

**(c) Não há 5º consumidor escondido.** A ressalva do plano está certa: `inbox/create-modal/
issue-properties` **não** aparece no grep — usa os computeds, não o getter. Nenhum call site
ficaria com leitura stale silenciosa fora da tabela.

### B2 — F8 / API pública: ✅ FECHADO (por remoção de escopo, com informação preservada)

DECISÃO 1 do dev tira o F8 da execução. Verifiquei que a informação não se perdeu: DEFERRED-1
carrega a superfície completa (8 endpoints em 2 arquivos), o risco do MCP server, o argumento
de KPI e — o que mais importa para quem retomar — a ressalva de que trocar a classe inteira
quebraria a leitura, com o precedente que valida a técnica correta. Nada a acrescentar.

### B3 — `arquivo:linha`: ✅ FECHADO

Spot-check das referências que a execução realmente usa (não as dos registros DEFERRED).
**9 de 9 corretas** no store:

`updateEstimate:465` · `deleteEstimate:502` · `getProjectEstimateProperties:520` ·
`createEstimateProperty:531` · `updateEstimateProperty:541` · `deleteEstimateProperty:557` ·
`upsertKpiRoleEstimateProperty:563` · `getIssueEstimatePropertyValues:585` ·
`updateIssueEstimatePropertyValue:597`

E `urls/estimate.py:48-52` = a rota `estimate-properties/`, confirmada
(`EstimatePropertyListCreateEndpoint.as_view({"get": "list", "post": "create"})`).

O erro herdado do root-cause (Bulk em `:404`) está corrigido e documentado na tabela
"Correções de referência". A varredura foi real, não declarativa.

---

## Wave 3a — F2 livre do bulk: ✅ CONFIRMADO

`ensureProjectEstimateProperties` → `getProjectEstimateProperties` (`store:520`) → rota
`estimate-properties/` (`urls/estimate.py:48-52`), **que já existe em produção hoje**. O
endpoint bulk é de *values*; o F2 precisa de *properties*. Não há dependência. A separação
3a/3b está correta e a justificativa ("clareza de dependência mesmo com o gating removido")
é legítima.

## Decisões do dev — aplicação: ✅ as 3 corretas

1. **F8 DEFERRED** — Wave 6 removida da tabela de sequenciamento; F8 não aparece em nenhuma
   linha de "Arquivos a Modificar"; R6/R7 antigos (F8 quebra leitura / integração) saíram dos
   riscos. Sem resíduo executável.
2. **Sem migration** — Wave 5 antiga (migration) removida; a Wave 5 atual é só escrita em
   memória; `0152` sobrevive apenas como nota dentro do DEFERRED-2. Sem resíduo.
3. **Container** — critério de backend voltou a "pytest verde" sem alternativa BLOCKED;
   nenhuma linha da tabela de waves diz BLOCKED. O critério de frontend foi corretamente
   **mantido** (o container não cria runner em `apps/web`).

## R11 / risco de o Fix implementar F8 ou a migration por inércia: ✅ adequadamente contido

Os registros DEFERRED são detalhados o bastante para serem acionáveis no futuro — que era o
pedido — e por isso mesmo o risco de inércia é real. O plano o nomeia (R11), marca a Wave 5
como "escrita em `issues-not-fixed.md`, **NÃO código**" em três lugares distintos (tabela de
waves, seção de riscos, resumo de escopo), e o resumo final fecha com "Fora do escopo: aperto
de permissões, migration de reparo". Contenção suficiente.

## `issues-not-fixed.md`: ✅ CONFIRMADO

Verificado: `.claude/memories/repo/` contém apenas `estimate-properties-dynamic-kpi.md`,
`estimates-multi-active-gotchas.md`, `fix-pipeline-architecture.md`. O arquivo **não existe**,
como o plano afirma. A Wave 5 manda os 3 passos do protocolo de
`.claude/instructions/memory.instructions.md`: criar com o header exato, ler o arquivo inteiro
e checar duplicata por `**File**` + ~60 chars de `**Problem**` antes de cada append, formato
exato de entrada, `**Found in**: 2026-07-20-estimates-review-findings`. Correto.

> Nota para o Fix: o formato do protocolo exige também `**Last updated**: 2026-07-20` em cada
> entrada. As 3 entradas do plano trazem `**Sources**` mas não `**Last updated**` — incluir.

---

## Problema novo introduzido pela reescrita

### C1: a invalidação não alcança `issueValuesFetchState` — o guard do I3 reintroduz o F4 nas listas
**Tipo**: edge case / regressão
**Severidade**: ⚠️ importante — **condição obrigatória antes do GREEN da Wave 3b**

**Descrição**: a tabela de invalidação do I5 invalida `projectPropertiesFetchState[projectId]`
nos 6 mutadores — correto. Mas `issueValuesFetchState` é keyed por **issueId**, e a tabela
declara que ele "não precisa de remoção nenhuma". Combinado com o guard novo do I3, isso abre
um buraco que o plano da rodada 1 não tinha:

> I3, passo 2: *"Se o projeto tem zero properties ativas/system → **não disparar o request
> bulk**; marcar todos os ids daquele projeto como `"done"` e resolver."*

Sequência que quebra:
1. Projeto sem estimate configurado. Usuário abre uma lista → o guard marca todas as issues
   como `"done"` **sem nunca ter buscado valor nenhum**.
2. Admin vai em settings e ativa um estimate (ou cria uma property). O backend auto-cria a
   property default (`_ensure_estimate_default_property`). `projectPropertiesFetchState` é
   invalidado corretamente.
3. Usuário volta para a lista. `ensureProjectEstimateProperties` refaz o fetch de properties
   e agora o projeto **tem** properties → o gate da l.407 abre e as colunas renderizam. Mas
   toda issue continua `"done"` em `issueValuesFetchState` → **0 requests de values** → todos
   os dropdowns aparecem vazios, até hard reload.

Ou seja: **é o F4 — o bug que esta sessão está corrigindo — reaparecendo nas listas.** O mesmo
vale para `deleteEstimate` e para qualquer criação de property com uma lista já visitada na
sessão.

**Sugestão (uma linha na tabela de invalidação, sem mudança de design)**: os 6 mutadores devem
limpar **os dois** registros. Como não existe índice reverso projectId→issueIds, e como criar
um seria over-engineering para isto, a limpeza deve ser **total**:

```ts
// nos 6 mutadores de estimate/property, junto da invalidação de projectPropertiesFetchState:
runInAction(() => { this.issueValuesFetchState = {}; });
```

Justificativa de custo — a mesma que o plano já usa para os 4 write-through defensivos:
limpar o registro **não dispara refetch sozinho**, só permite que a próxima chamada busque.
São ações de settings, admin-only, baixíssimo tráfego. O pior caso é 1 batch bulk por projeto
na próxima lista aberta. Regra simples > regra fina, exatamente como o plano já argumentou.

**Onde entra**: linha adicional na tabela do I5 + o roteiro de browser da Wave 3b ganha o
cenário: *ativar estimate num projeto que não tinha → voltar para a lista → dropdowns
aparecem **com valores**, sem reload.*

---

## Nit (não bloqueia, não exige nova rodada)

**N1 — "8 call sites" deveria ser 7.** R1 e a linha de `:585-595` da tabela de arquivos dizem
"8 call sites" (número herdado do root-cause). O grep dá **7** fora do store: 3 de lista + 4 de
issue única. O root-cause chegou a 8 contando `inbox/create-modal/issue-properties`, que o
próprio plano já corrigiu na ressalva do `force` — falta propagar o número. Cosmético: a
tabela do `force`, que é o que o Fix vai executar, está certa com os 7.

---

## Resumo da Rodada 2

- Aprovado: ✅ **APPROVED** (com condição C1)
- Blockers da rodada 1: **3/3 fechados** (B1 spec implementável e verificada call site a call
  site · B2 escopo removido com informação preservada · B3 varredura real, 9/9 refs de
  execução corretas)
- Importantes da rodada 1: **5/5 acatados**; Sugestões: **5/5 acatadas**; nenhum rejeitado
- Decisões do dev: **3/3 aplicadas sem resíduo executável**
- Problemas novos: **1** (C1 — invalidação de `issueValuesFetchState`), com correção de 1 linha
- Nits: 1 (N1 — contagem de call sites)

**Condição de execução**: C1 deve entrar na tabela de invalidação do I5 **antes de a Wave 3b
ser considerada GREEN**. Não exige nova rodada de Plan — é uma linha, especificada acima sem
ambiguidade, e o Fix agent pode aplicá-la direto. Registrada também em
`stage-b2-review-plan.md` e em `current-phase.md` para não se perder no handoff.

**Próximo**: Stage C — Fix.
