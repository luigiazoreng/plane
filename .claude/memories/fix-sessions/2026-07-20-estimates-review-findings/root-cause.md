# Root Cause — Estimates review findings (Stage A1, 2026-07-20)

Todos os 8 findings foram validados lendo o código. **8/8 confirmados**, 3 refinados
(F1 subestimado, F3 mecanismo diferente do descrito, F5 tem 2ª causa). Nenhum refutado.

---

## Causa raiz arquitetural compartilhada (F1 + F2)

**Causa**: os valores de estimate property foram projetados para o contexto de **work item
único** (sidebar, peek overview, issue modal, power-k) e depois reusados literalmente nos
**contextos de lista** (issue-layouts, spreadsheet, workspace-draft) sem adaptar as duas
premissas que só valem no detalhe:

1. **Fetch por-issue é a única porta de entrada.** `getIssueEstimatePropertyValues`
   (`apps/web/core/store/estimates/project-estimate.store.ts:585-595`) é um `async` puro:
   sem SWR key, sem dedupe, sem checagem de cache, sem caminho em lote. No detalhe isso é
   1 request e está correto. Numa lista vira 1 request por linha. O backend espelha a mesma
   premissa: `apps/api/plane/app/urls/estimate.py:63-67` só expõe a rota por-issue — não
   existe endpoint bulk.
2. **`projectId` do route param identifica o projeto da issue.** Verdadeiro em
   `/[slug]/projects/[projectId]/...`; falso em `/[slug]/workspace-views/[globalViewId]`,
   onde a lista é multi-projeto e o param não existe.

Ou seja: **F1 e F2 não são dois bugs independentes — são a mesma decisão de design
(store per-issue + escopo por rota) vazando de um contexto onde é correta para outro onde
não é.** Um fix que não introduzir um caminho de carga em lote por-projeto-das-issues-visíveis
resolve F1 e F2 só pela metade.

---

## Validação finding a finding

### F1 — N+1 de requests (ALTA) — CONFIRMADO, **subestimado**
O relatório cita 2 call sites. São **3** em contexto de lista:
- `issue-layouts/spreadsheet/columns/estimate-column.tsx:39-42`
- `issue-layouts/properties/all-properties.tsx:175-178`
- **`issues/workspace-draft/draft-issue-properties.tsx:68-72`** (não relatado — mesmo
  `useEffect` por linha, e com `eslint-disable exhaustive-deps` em cima)

Os outros 5 call sites de `getIssueEstimatePropertyValues` são de issue única e estão
corretos — não mexer: `peek-overview/properties.tsx:83`, `issue-detail/sidebar.tsx:82`,
`issue-modal/components/default-properties.tsx:92`, `power-k/.../work-item/root.tsx:52`.

Confirmado também que o effect é incondicional (não checa display property `estimate` nem
se o projeto tem estimate configurado) — `all-properties.tsx:175` roda antes do gate da
linha 407.

### F2 — Estimates invisíveis em workspace-views (ALTA) — CONFIRMADO
`all-properties.tsx:82` faz `const { workspaceSlug, projectId } = useParams()`. Esse
`projectId` é usado em **três** pontos do bloco de estimates: linhas 180, 181 e o gate da
linha 407 (`projectId && areEstimateEnabledByProjectId(projectId)`). Em workspace-views o
param é `undefined` → `estimateSystemPropertyIds = []`, `estimatePropertyIds = []` e o gate
é falso. Silencioso, sem erro.

Contraste confirmado no mesmo arquivo: state (l.234), assignees/labels/módulos/cycles usam
`issue.project_id`. E `estimate-column.tsx:45-46` usa `issue.project_id` corretamente — daí
a assimetria spreadsheet vs list/kanban na mesma view.

Agravante do relatório confirmado: trocar `projectId` por `issue.project_id` **não basta**.
O store só é populado por quem chama `getProjectEstimateProperties`, e workspace-views está
fora do `project-wrapper.tsx`. Sem carga por projeto das issues visíveis, os computeds
retornam `[]` mesmo com o gate corrigido.

### F3 — Valores órfãos ao deletar estimate point (MÉDIA) — CONFIRMADO, **mecanismo refinado**
`apps/api/plane/app/views/estimate/base.py:427-442`. Indentação confirmada: `for` em 12
espaços (l.427), `issues.update(...)` (l.439) e o update de `IssueEstimatePropertyValue`
(l.440-442) em 16 — dentro do loop.

**Correção ao relatório**: o impacto de perf descrito ("re-executa UPDATE de tabela inteira
uma vez por issue") não é o que acontece. Na 1ª iteração `issues.update()` migra TODAS as
linhas de uma vez; a partir da 2ª o filtro `estimate_point_id=estimate_point_id` não casa
mais nada e os UPDATEs são no-op. O custo real é **N queries desperdiçadas**, não N
reescritas. Isso não muda a correção, mas muda a justificativa.

**O bug de dados está exatamente certo e é o ponto que importa**: se nenhuma issue usa o
point via a coluna legada `Issue.estimate_point`, o loop nunca entra e os
`IssueEstimatePropertyValue` **nunca migram** — ficam apontando para um point soft-deletado.
Esse é o caso comum em qualquer sistema de estimate que não seja o default do projeto.

Branch `else` confirmado correto (l.467-470, fora do loop).

### F4 — Settings page stale (MÉDIA) — CONFIRMADO (a e b)
- (a) `_ensure_estimate_default_property` (`estimate/base.py:72-88`) faz `get_or_create` da
  property default na ativação. `properties/root.tsx:41-43` tem `useEffect` com deps
  `[workspaceSlug, projectId, getProjectEstimateProperties]` — nenhuma muda ao ativar um
  estimate, então não refaz fetch. Confirmado.
- (b) `deleteEstimate` (`project-estimate.store.ts:502-513`) faz apenas
  `unset(this.estimates, [estimateId])`. Não toca `this.estimateProperties`. Como os
  computeds filtram por `p.project === projectId` e não validam que `p.estimate` ainda
  existe, as linhas órfãs continuam renderizando. Confirmado.

**Nota**: `root.tsx` (estimates) usa SWR (`PROJECT_ESTIMATES_${slug}_${projectId}`, l.59-62)
mas as properties **não** — daí a assimetria. Padronizar as properties em SWR com a mesma
key family resolveria (a) e (b) de uma vez via revalidação.

### F5 — Lixeira em property system-default (BAIXA/UX) — CONFIRMADO, **2 causas**
`properties/root.tsx:141` esconde só em `property.kpi_role`. Backend rejeita **duas**
condições em `estimate/property.py:destroy`: `is_estimate_default` (400) **e** `kpi_role`
(400). A UI cobre uma. O `CustomSelect` ao lado (l.124) já usa
`disabled={!isAdmin || property.is_estimate_default}` — a lixeira deve seguir a mesma regra.
Confirmado.

### F6 — Property criada silenciosamente no 1º estimate (BAIXA/UX) — CONFIRMADO
`properties/root.tsx:76-89`: `handleCreate` usa `estimateOptions[0]`. `estimateOptions` vem
de `estimateIdsByProjectId(projectId)`. Sem picker no formulário (l.155-173: só um `Input` de
nome e o botão). Confirmado.

### F7 — Código morto `handleEstimate` (BAIXA) — CONFIRMADO
`all-properties.tsx:161-163`. Zero referências no arquivo; o caminho vivo é
`handleEstimateChange` (l.183). Remover.

### F8 — MEMBER muta estimates (MÉDIA — decisão de comportamento) — CONFIRMADO
`permissions/project.py:109-115`: `ProjectEntityPermission` concede escrita a
`role__in=[ROLE.ADMIN, ROLE.MEMBER]`. Usada por `EstimatePropertyListCreateEndpoint` e
`EstimatePropertyDetailEndpoint` (`estimate/property.py:30`). `BulkEstimatePointEndpoint`
usa `@allow_permission([ROLE.ADMIN, ROLE.MEMBER])` (`estimate/base.py:404`) — mesmo efeito.
Gating `isAdmin` no frontend é cosmético. Ressalva do relatório confirmada: é paridade com
upstream, pré-existente ao fork.

**Recomendação (é decisão, não bug)**: apertar para ADMIN-only. Justificativa: nesta fork
estimate properties alimentam **scoring de KPI** (ver `estimate-properties-dynamic-kpi.md`) —
um member re-apontar qual estimate lastreia Difficulty/Repetitive altera nota de KPI de
terceiros, o que é privilégio administrativo, não colaborativo. É uma diferença material
frente ao upstream, onde estimate é só rótulo de work item.
Se apertar: apertar **os quatro** juntos (`BulkEstimatePointEndpoint`, `EstimatePointEndpoint`,
`EstimatePropertyListCreateEndpoint`, `EstimatePropertyDetailEndpoint`) — apertar só parte
deixa uma porta lateral. `EstimatePropertyKpiRoleEndpoint` também deve ser verificado.
**Ler/GET deve continuar para todos os roles** — o dropdown de estimate no work item depende
disso; apertar leitura quebra a feature para members.
Se o dev preferir não apertar: registrar DEFERRED em `.claude/memories/repo/issues-not-fixed.md`.

---

## Blast radius

**`getIssueEstimatePropertyValues`** — 8 call sites. 3 em lista (corrigir: all-properties,
estimate-column, draft-issue-properties); 5 em issue única (não mexer: peek-overview,
sidebar, issue-modal/default-properties, power-k/work-item/root).

**`activeEstimatePropertyIdsByProjectId`** + **`estimateSystemPropertyIdsByProjectId`** —
8 call sites cada, sempre em par. Passam `issue.project_id` (correto) em: estimate-column:45-46,
draft-issue-properties:65-66. Passam `projectId` de outra origem em: all-properties:180-181
(**route param — é o F2**), peek-overview:91-92, sidebar:93-94,
issue-modal/default-properties:85-86, power-k/estimates-menu:38-41,
inbox/create-modal/issue-properties:68-69.
→ **Verificado**: dos que não usam `issue.project_id`, apenas `all-properties.tsx` está em
contexto multi-projeto. Os demais recebem `projectId` como **prop** (não route param), em
contexto de projeto único — corretos. **F2 é o único site afetado.** Se a assinatura dos
computeds mudar, os 8 pares precisam ser tocados juntos.

**Endpoint por-issue** (`issue-estimate-property-values`,
`urls/estimate.py:63-67`) — consumido só por `estimate-property.service.ts:72`
(`fetchIssueEstimatePropertyValues`), que só é chamado pelo store. Superfície pequena:
adicionar um endpoint bulk ao lado é aditivo e não quebra nada.

**`issueEstimatePropertyValueFor`** — 13 leituras. Puramente leitura do cache do store;
não muda se a estratégia de fetch mudar.

---

## Cobertura de teste — F3

`apps/api/plane/tests/contract/app/test_estimates_app.py` tem
`TestEstimatePointDestroyNoReplacementSynchronousNulling` (l.706+) com 3 testes — **todos
exercitam apenas o branch `else`** (sem `new_estimate_id`).

**`grep -rn "new_estimate_id" apps/api/plane/tests/` → zero ocorrências.**

→ **O branch de reatribuição do F3 tem cobertura ZERO.** Nenhum teste em
`test_estimates_app.py`, `test_estimate_property_values.py` ou
`test_0151_backfill_estimate_default_properties.py` passa por ele. É um TDD RED limpo:
o teste "deletar point com `new_estimate_id` num projeto onde NENHUMA issue usa o point via
`Issue.estimate_point`, mas existe `IssueEstimatePropertyValue` apontando pra ele" falha hoje
e passa depois de desindentar. Há um teste bem próximo para copiar como molde:
`test_deleting_point_with_no_replacement_nulls_issue_estimate_property_value_synchronously`
(l.769+) — basta mandar `data={"new_estimate_id": <outro point>}` no DELETE e assertar
migração em vez de `None`.

---

## ⚠️ BLOQUEIO DE AMBIENTE — TDD backend NÃO é executável nesta máquina

O gap de `estimates-multi-active-gotchas.md` **persiste e piorou**. Verificado agora:

| Checagem | Resultado |
|---|---|
| `python3` | ✅ `/usr/bin/python3` |
| `import django` | ❌ `ModuleNotFoundError` |
| `pytest` no PATH | ❌ ausente |
| `pip` / `pip3` / `uv` / `poetry` / `pipx` | ❌ **nenhum instalado** |
| `python3 -m pip` | ❌ `No module named pip` |
| venv (`apps/api/.venv`, `./.venv`) | ❌ não existe |
| container da API Plane rodando | ❌ só containers `pdv_*` (projeto não relacionado) |

**Consequência para o Plan**: não há caminho para rodar `pytest` sem antes provisionar o
ambiente. Não existe nem instalador de pacote Python disponível. O Plan **não pode assumir
TDD de backend** sem uma destas providências primeiro:
1. Dev sobe o container da API Plane (`docker compose`) e roda pytest via `docker exec`; **ou**
2. Dev instala `python3-pip`/`uv` e cria venv a partir de `apps/api/requirements/test.txt`; **ou**
3. Aceita explicitamente que a correção do F3 vai com teste **escrito mas não executado** —
   repetindo exatamente o gap que já produziu um bug de produção real
   (o `deleted_at` do `EstimateSerializer`, ver `estimates-multi-active-gotchas.md`).

**Recomendação**: opção 1 ou 2 antes do Stage C. O F3 é uma mudança de indentação de 4 linhas
com efeito em dados de produção — é precisamente o tipo de coisa que "parece obviamente certo"
e onde o histórico desta feature já mostrou que trace-through manual não é suficiente.
O frontend (F1, F2, F4-F7) não tem esse bloqueio: `pnpm` está disponível.

---

## Diagnóstico Adicional Necessário

- **UX Diagnose: NÃO** — todos os 8 findings já estão localizados em `arquivo:linha` com o
  mecanismo entendido. Reproduzir no browser confirmaria o sintoma mas não acrescentaria
  informação que mude o fix. Reprodução tem mais valor **depois** do fix (Stage F/UX), como
  validação: F1 (contar requests no Network), F2 (estimates em workspace-views list/kanban),
  F4a/F4b (painel sem reload), F5 (lixeira sumindo).
- **VPS Diagnose: NÃO** — não há hipótese que dependa de dado de produção. F3 é provável por
  teste, não por inspeção de prod, e a correção é idêntica haja órfãos ou não.
  **Ressalva para o Plan**: se decidir incluir uma migration de reparo para
  `IssueEstimatePropertyValue` já órfãos (apontando para `EstimatePoint` soft-deletado), essa
  migration deve ser escrita **idempotente e no-op quando não houver órfãos** — assim não
  precisa de checagem prévia em prod. Se o Plan quiser dimensionar o estrago antes de decidir,
  aí sim vale um A3 pontual com:
  `SELECT COUNT(*) FROM issue_estimate_property_values v JOIN estimate_points p ON v.estimate_point_id = p.id WHERE p.deleted_at IS NOT NULL;`

## Próximo Passo
**Stage B — Plan**

### Nota de sequenciamento para o Plan
F1 e F2 compartilham raiz e devem ser planejados **juntos**, não em ordem: o caminho de fetch
em lote por-projeto que o F1 precisa é o mesmo mecanismo que faz o F2 funcionar fora do
`project-wrapper`. Planejar F2 como "trocar `projectId` por `issue.project_id`" isolado produz
um fix que não funciona.
Ordem sugerida: **F3 (backend, isolado, precisa de ambiente) → F1+F2 (juntos, maior) →
F4 → F5/F6/F7 (pequenos, independentes) → F8 (decisão do dev antes de codar)**.
