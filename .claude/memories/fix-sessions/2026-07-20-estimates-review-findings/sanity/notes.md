# Sanity Notes — Estimates review findings (fix-pipeline, Stage C→D→E)

Stack real do projeto: backend Django REST Framework (Python, apps/api), frontend Next.js + MobX (TypeScript, apps/web). NÃO é o stack Node/Jest do template genérico do agente — comandos de teste adaptados nesta rodada (pytest no backend; sem infra de teste automatizado no frontend, apenas typecheck+build).

## Backend (apps/api/plane/app/)

### File: urls/estimate.py
- Changes: nova rota `workspaces/<slug>/projects/<project_id>/issue-estimate-properties/` (sem issue_id no path, query param `issue_ids` csv) -> `IssueEstimatePropertyValueBulkListEndpoint`. Import atualizado.
- Key lines: 16, 69-76
- Concerns: nenhuma — rota project-scoped, paralela à `issue-estimate-property-values` existente.

### File: views/__init__.py
- Changes: export aditivo de `IssueEstimatePropertyValueBulkListEndpoint` (linha 197). Diff puramente aditivo, confirmado no Stage D.
- Concerns: nenhuma.

### File: views/estimate/base.py
- Changes: F3 — em `EstimatePointEndpoint.destroy` (branch `new_estimate_id`), `issues.update(estimate_point_id=new_estimate_id)` e `IssueEstimatePropertyValue...update(estimate_point_id=new_estimate_id)` (linhas 448-451) foram DESINDENTADOS para fora do `for issue in issues:` (linhas 427-438). `issue_activity.delay` permanece dentro do loop.
- Key lines: 421-451 (branch reassignment), 452-479 (branch no-replacement, já era correto antes)
- Test file: tests/contract/app/test_estimates_app.py::TestEstimatePointDestroyReassignment
- Concerns: `EstimatePointEndpoint.create/partial_update/destroy` usam `@allow_permission([ROLE.ADMIN, ROLE.MEMBER])` (linha 404) — sem GUEST, correto (mutação). `BulkEstimatePointEndpoint` usa `permission_classes = [ProjectEntityPermission]` (não `@allow_permission`) — padrão pré-existente, não tocado nesta sessão.

### File: views/estimate/property.py
- Changes: nova classe `IssueEstimatePropertyValueBulkListEndpoint` (linhas 180-223), cap `ISSUE_ESTIMATE_PROPERTY_VALUES_BULK_CAP = 200` (linha 28).
- Key lines: 194 (`@allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])`, mesmo nível do endpoint por-issue existente), 196-198 (400 se `issue_ids` ausente), 201-210 (400 se >200 ids), 211-212 (200 vazio se lista vazia), 214-216 (query única `filter(workspace__slug=slug, project_id=project_id, issue_id__in=issue_ids)` — SEM filtro extra de que os issue_ids pertençam ao projeto: a query já filtra por `project_id=project_id` nas VALUES, então mesmo que um issue_id de outro projeto seja passado, nenhuma IssueEstimatePropertyValue daquele projeto terá `project_id` igual ao da URL — isolamento correto, testado em `test_bulk_returns_values_grouped_by_issue_and_isolates_by_project`).
- Concerns: `raw_issue_ids.split(",")` não valida formato UUID dos ids — se um id malformado for passado, o Django ORM pode levantar `ValueError`/500 em vez de 400. Não é um dos 8 findings da revisão original, já discutido implicitamente no Stage D (não reportado como finding). Vale checar no handoff de Segurança.

### Test files
- tests/contract/app/test_estimate_property_values.py — nova classe `TestIssueEstimatePropertyValueBulkListEndpoint` (4 testes), helper `_bulk_values_url`.
- tests/contract/app/test_estimates_app.py — nova classe `TestEstimatePointDestroyReassignment` (2 testes); 5 bugs de teste pré-existentes corrigidos (comparação str/UUID e um teste reescrito para não bater num endpoint inexistente).

## Frontend (apps/web/core/)

### File: services/estimate-property.service.ts
- Changes: novo método `fetchIssueEstimatePropertyValuesBulk` (linhas 93-123) — chunking de 200 ids, `Promise.all` sobre chunks, merge via `reduce`.
- Concerns: nenhum tratamento de erro parcial — se um chunk falhar, `Promise.all` rejeita tudo (comportamento aceito no plano).

### File: store/estimates/project-estimate.store.ts
- Changes maiores: `issueValuesFetchState`/`projectPropertiesFetchState` (guards de 3 estados), `ensureProjectEstimateProperties` (linhas 596-619), coalescer `getIssueEstimatePropertyValues`/`drainIssueValueFetchQueue`/`failIssueValueFetchBatch` (linhas 726-854), `invalidateEstimatePropertiesCache` privado (linhas 700-705) chamado nos 6 mutadores.
- Key lines: 700-705 (invalidação), 726-771 (getIssueEstimatePropertyValues com `force` param), 778-843 (drain), 845-854 (fail handler).
- Concerns: nenhum AbortController (proibido explicitamente no plano); `invalidateEstimatePropertiesCache` zera `issueValuesFetchState` POR INTEIRO (workspace-wide), não só do projectId — trade-off documentado (custo: 1 batch extra por projeto).

### File: components/estimates/properties/root.tsx
- Changes: SWR (`PROJECT_ESTIMATE_PROPERTIES_${slug}_${projectId}`) substitui useEffect (F4a); novo `newEstimateId` state + CustomSelect no create form (F6); condição da lixeira ganhou `&& !property.is_estimate_default` (F5).
- Key lines: 49-52 (SWR), 85-101 (F6 select), 153 (F5 lixeira)

### File: components/estimates/root.tsx
- Changes: `handleSetDefaultEstimate`/`handleToggleEstimateActive` chamam `mutate()` da key SWR das properties ao final (F4a); early `return` removido de `handleToggleEstimateActive`.
- Key lines: 81, 99

### File: components/issues/issue-layouts/properties/all-properties.tsx
- Changes: F2 — `issue.project_id` substitui `useParams().projectId` em 3 pontos (gate de render, ids de propriedades, effect); effect chama `ensureProjectEstimateProperties` + `getIssueEstimatePropertyValues` (force=false, default); F7 remove função morta `handleEstimate`.
- Key lines: 82-85 (comentário F2), 175-183 (effect), 188-190 (ids via issue.project_id), 417 (gate `areEstimateEnabledByProjectId(issue.project_id)`)

### File: components/issues/issue-layouts/spreadsheet/columns/estimate-column.tsx
- Changes: mesmo padrão do all-properties — effect com `ensureProjectEstimateProperties`+`getIssueEstimatePropertyValues` force=false (list call site).
- Key lines: 40-44

### File: components/issues/workspace-draft/draft-issue-properties.tsx
- Changes: mesmo padrão — force=false (list call site).
- Key lines: 69-73

### File: components/issues/peek-overview/properties.tsx
- Changes: `getIssueEstimatePropertyValues(..., true)` — force=true (issue única).
- Key lines: 81-86

### File: components/issues/issue-detail/sidebar.tsx
- Changes: `getIssueEstimatePropertyValues(..., true)` — force=true.
- Key lines: 81-86

### File: components/issues/issue-modal/components/default-properties.tsx
- Changes: `getIssueEstimatePropertyValues(..., true)` — force=true (edição de issue existente).
- Key lines: 90-95

### File: components/power-k/ui/pages/context-based/work-item/root.tsx
- Changes: `getIssueEstimatePropertyValues(..., true)` — force=true, só quando `activePage === "update-work-item-estimate"`.
- Key lines: 50-62

## Verificação de debug code (grep já executado nos 17 arquivos)
- ZERO `console.log`/`console.warn`/`console.error`/`debugger` em qualquer arquivo modificado.
- 2 `TODO` pré-existentes em base.py (linhas 365, 388) — NÃO adicionados nesta sessão (já existiam antes, fora do escopo dos 7 findings).

## Migrations
- Nenhuma migration nova nesta sessão de fix (o changeset toca apenas views/urls/tests/frontend).

## Observação sobre convenções de padronização
- Mensagens de erro no backend são em INGLÊS (ex.: "Estimate not found", "issue_ids is required") — consistente com o resto do codebase Plane (produto internacional, não é o padrão "erros em português" do CLAUDE.md do agents4chat). Tratado como convenção do projeto, não desvio.
