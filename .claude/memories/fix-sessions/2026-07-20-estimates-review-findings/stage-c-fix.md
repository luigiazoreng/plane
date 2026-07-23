# Stage C: Fix Results — Estimates review findings

- Feature: 2026-07-20-estimates-review-findings
- Source: FIX_SESSION_DIR/fix-plan.md (aprovado no Stage B2 com condição C1)

## Baseline de testes (antes de qualquer mudança)

24 passed, 5 failed — todas as 5 falhas eram bugs nos próprios testes, não regressões de produto:
1-3. `test_project_can_have_multiple_estimate_systems_with_single_active_project_estimate`, `test_creating_second_numeric_estimate_inactive_does_not_disturb_active_default`, `test_activating_second_numeric_estimate_deactivates_first` — comparação `str(x) == response.data["id"]` onde `response.data["id"]` é um objeto `UUID` (DRF pre-render), não `str`.
4. `test_list_issue_estimate_property_values` — mesmo padrão, campo FK `property`.
5. `test_bulk_deleting_points_with_no_replacement_nulls_issue_estimate_point_synchronously` — fazia DELETE numa rota (`estimates/<id>/estimate-points/`) que só registra `{"post": "create"}`; não existe endpoint de bulk-delete-por-lista em nenhum lugar do código. Não é nenhum dos 8 findings da revisão. Decisão: teste quebrado/aspiracional, reescrito para exercitar o endpoint real de delete single-point (`estimate-points/<id>/`), preservando a intenção original (nulling combinado de `Issue.estimate_point` + `IssueEstimatePropertyValue`). Nenhum endpoint novo foi implementado.

Todos os 5 corrigidos como parte deste Stage C (sem TDD RED/GREEN — são bugs de teste, não de produto).

## Resumo

- Total findings executáveis do plano: 7 (F1, F2, F3, F4a, F4b, F5, F6, F7)
- FIXED (VALID): 7 — todos implementados com TDD onde aplicável (backend) e verificação típica (typecheck+build, frontend sem infra de teste)
- DEFERRED: 2 — F8 (permissões) e órfãos do F3 (2ª fonte + histórico) → registrados em `.claude/memories/repo/issues-not-fixed.md`
- BLOCKED: 0
- NOISE: 0

## Por finding

### F1 — N+1 de requests em listas (backend + frontend)
- Backend: novo endpoint `IssueEstimatePropertyValueBulkListEndpoint` (`apps/api/plane/app/views/estimate/property.py`), rota `workspaces/<slug>/projects/<project_id>/issue-estimate-properties/?issue_ids=csv` (`apps/api/plane/app/urls/estimate.py`). Cap de 200 ids, `@allow_permission([ADMIN, MEMBER, GUEST])`, resposta agrupada por issue. TDD: `apps/api/plane/tests/contract/app/test_estimate_property_values.py::TestIssueEstimatePropertyValueBulkListEndpoint` (4 testes: grouped+isolamento por projeto, issue_ids ausente→400, lista vazia→200 vazio, >200 ids→400). RED confirmado (404) → GREEN.
- Frontend: `estimate-property.service.ts` ganhou `fetchIssueEstimatePropertyValuesBulk` (chunking 200). `project-estimate.store.ts`: `getIssueEstimatePropertyValues` ganhou 4º parâmetro `force` (default false); coalescer com 3 estados (`issueValuesFetchState`: ausente/in-flight/done), batching por microtask/tick via `pendingIssueValueFetches`/`pendingIssueValueFetchPromises`, detach síncrono do batch antes do fetch de rede (evita corrida com issues novas chegando em tick posterior). Sem AbortController (conforme proibição explícita do plano).
- 7 call sites atualizados: 3 de lista (`all-properties.tsx`, `estimate-column.tsx`, `draft-issue-properties.tsx`) usam o default coalescido; 4 de issue única (`peek-overview/properties.tsx`, `issue-detail/sidebar.tsx`, `issue-modal/components/default-properties.tsx`, `power-k/.../work-item/root.tsx`) passam `force: true`.

### F2 — Estimates invisíveis em workspace-views
- `all-properties.tsx`: os 3 pontos que usavam a `projectId` da rota (`useParams()`, undefined fora de `/[slug]/projects/[projectId]/...`) trocados por `issue.project_id` (linhas do gate de render, `estimateSystemPropertyIds`/`estimatePropertyIds`, effect de fetch). Effect agora também chama `ensureProjectEstimateProperties(workspaceSlug, issue.project_id)` para popular o store nos projetos das issues visíveis (necessário fora do `project-wrapper.tsx`). Route `projectId` removido da destructuring (ficou não utilizado).
- Novo método no store: `ensureProjectEstimateProperties` com guard de 3 estados (`projectPropertiesFetchState`), mesmo padrão do B1.

### F3 — Valores órfãos ao deletar estimate point com reatribuição (backend)
- `apps/api/plane/app/views/estimate/base.py:427-442`: `issues.update(...)` e o update de `IssueEstimatePropertyValue` desindentados para FORA do `for issue in issues:` — antes só migravam se pelo menos 1 issue usasse a coluna legada `Issue.estimate_point`. `issue_activity.delay` permanece dentro do loop (não foi arrastado pelo dedent).
- TDD: `apps/api/plane/tests/contract/app/test_estimates_app.py::TestEstimatePointDestroyReassignment` — 2 testes: (1) reatribuição migra values quando NENHUMA issue usa a coluna legada (RED confirmado: value não migrava; GREEN após dedent); (2) edge case com issue legada presente — ambos migram, E `issue_activity.delay` chamado exatamente 1x (assert de contagem, S5 do plan-review). Este 2º teste já passava mesmo antes do fix (branch que já funcionava), confirmando que o dedent não quebrou o caminho existente.
- 2ª fonte de órfãos (API pública, `api/views/estimate.py:286-291`) e os órfãos históricos NÃO foram tocados — DEFERRED (ver issues-not-fixed.md).

### F4a — Settings page stale após ativar/desativar estimate
- `estimates/properties/root.tsx`: `useEffect` de fetch substituído por `useSWR` com key `PROJECT_ESTIMATE_PROPERTIES_${slug}_${projectId}`.
- `estimates/root.tsx`: `handleSetDefaultEstimate` e `handleToggleEstimateActive` chamam `mutate()` global do `swr` com a mesma key ao final (early `return` removido de `handleToggleEstimateActive` para garantir que o `mutate` sempre rode).

### F4b — Settings page stale após deletar estimate
- `project-estimate.store.ts::deleteEstimate`: além de remover o estimate, agora também remove de `this.estimateProperties` toda property cujo `property.estimate === estimateId` (o backend soft-deleta essas properties via cascade, `EstimateProperty.estimate` não é nullable). Reativo — painel de Properties some sem reload via o próprio observable do store, sem depender do SWR.

### I5 + C1 — Tabela de invalidação (condição obrigatória do Stage B2)
- Novo método privado `invalidateEstimatePropertiesCache(projectId)`: limpa `projectPropertiesFetchState[projectId]` E ZERA `issueValuesFetchState` por inteiro (sem índice reverso projectId→issueIds, por design — custo é no máximo 1 batch extra por projeto no próximo render de lista).
- Chamado nos 6 mutadores: `updateEstimate`, `deleteEstimate`, `createEstimateProperty`, `updateEstimateProperty`, `deleteEstimateProperty`, `upsertKpiRoleEstimateProperty`. Isso fecha o C1: sem isso, o guard do I3 (issues marcadas "done" sem values quando o projeto não tinha estimate) reintroduziria o F4 nas listas quando um estimate fosse ativado depois.
- `updateIssueEstimatePropertyValue` NÃO foi alterado (conforme o plano — já faz write-through correto, sem necessidade de invalidação adicional).

### F5 — Lixeira em property system-default
- `estimates/properties/root.tsx:141` (aprox): condição da lixeira mudou de `{!property.kpi_role && (...)}` para `{!property.kpi_role && !property.is_estimate_default && (...)}`, alinhando com o `CustomSelect` ao lado que já usava `disabled={!isAdmin || property.is_estimate_default}`.

### F6 — Property criada silenciosamente no 1º estimate
- `estimates/properties/root.tsx`: novo estado `newEstimateId` + `CustomSelect` no form de criação (mesmo padrão visual do select por-linha). `handleCreate` usa `newEstimateId ?? estimateOptions[0]?.id` em vez de sempre `estimateOptions[0]`. Reset do select após criar com sucesso.

### F7 — Código morto `handleEstimate`
- `all-properties.tsx`: função `handleEstimate` (zero referências, `handleEstimateChange` é o caminho vivo) removida.

## Bugs de teste pré-existentes corrigidos (não são findings da revisão)
- 4x comparação str/UUID em `test_estimates_app.py` e `test_estimate_property_values.py` (ver Baseline acima).
- 1x teste quebrado testando endpoint bulk-delete inexistente, reescrito (ver Baseline acima).

## Verificação final
- Backend: `pytest plane/tests/contract/app/test_estimates_app.py plane/tests/contract/app/test_estimate_property_values.py` → 35 passed (29 pré-existentes/corrigidos + 6 novos: 4 do F1 bulk endpoint + 2 do F3 reassignment).
- Backend (regressão ampla): `test_kpi.py` + `tests/unit/kpi` + `tests/unit/models/test_estimate_model.py` + `tests/unit/serializers/test_estimate_serializer.py` + `tests/unit/migrations/test_0151_*` → 47 passed, 2 failed. As 2 falhas (`TestKpiMemberAggregates::test_split_equally_between_two_assignees`, `TestWorkspaceKpiMemberAggregates::test_aggregates_across_all_projects_in_workspace`) CONFIRMADAS pré-existentes via `git stash` + rerun no código não modificado — não são regressão desta sessão, fora do escopo.
- Frontend: `pnpm run check:types` → 40 erros TS antes E depois das mudanças (diff byte-a-byte idêntico ignorando linha/coluna) — zero erros novos introduzidos em qualquer um dos 11 arquivos modificados. Os 2 erros em `all-properties.tsx` (linhas 429/450, `string | null` não atribuível a `string | undefined` em prop de `.map()`) são pré-existentes, confirmados via stash.
- Frontend: `pnpm run build` → exit code 0, build completo com sucesso (SPA mode). Warnings de sourcemap em arquivos não relacionados (helpdesk/analytics, navigation) não afetam o build nem tocam estimates.
- Frontend: sem infra de teste em `apps/web` (documentado, fora do escopo desta sessão — DEFERRED-3 já estava fora do escopo executável desde o plano).

## Arquivos modificados

### Backend (apps/api)
- plane/app/urls/estimate.py
- plane/app/views/__init__.py
- plane/app/views/estimate/base.py
- plane/app/views/estimate/property.py
- plane/tests/contract/app/test_estimate_property_values.py
- plane/tests/contract/app/test_estimates_app.py

### Frontend (apps/web)
- core/components/estimates/properties/root.tsx
- core/components/estimates/root.tsx
- core/components/issues/issue-detail/sidebar.tsx
- core/components/issues/issue-layouts/properties/all-properties.tsx
- core/components/issues/issue-layouts/spreadsheet/columns/estimate-column.tsx
- core/components/issues/issue-modal/components/default-properties.tsx
- core/components/issues/peek-overview/properties.tsx
- core/components/issues/workspace-draft/draft-issue-properties.tsx
- core/components/power-k/ui/pages/context-based/work-item/root.tsx
- core/services/estimate-property.service.ts
- core/store/estimates/project-estimate.store.ts

## Próximo passo
Este é o fix-pipeline (não feature-pipeline) — verificar em `.claude/instructions/memory.instructions.md` / `fix-pipeline-architecture.md` qual é o próximo stage (D — Review). Ainda não executado.
