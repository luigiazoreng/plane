# Fix Progress — Estimates review findings (TDD RED→GREEN log)

## Bugs de teste pré-existentes (corrigidos antes do TDD dos findings, sem RED/GREEN — são fixes diretos de asserção)
- Serviço: apps/api
- Arquivos: plane/tests/contract/app/test_estimates_app.py, plane/tests/contract/app/test_estimate_property_values.py
- Mudança: `str(first.data["id"])` em vez de `first.data["id"]` (e equivalentes) em 4 asserções — DRF `response.data` (pre-render) retorna UUID nativo para PK/FK fields, não str.
- Mudança adicional: `test_bulk_deleting_points_with_no_replacement_nulls_issue_estimate_point_synchronously` reescrito como `test_deleting_point_with_no_replacement_nulls_issue_and_property_value_synchronously` — removida a chamada DELETE a um endpoint bulk-delete-por-lista inexistente (404/405 sempre), mantida a cobertura combinada real (Issue.estimate_point + IssueEstimatePropertyValue nulling via o endpoint single-point que existe de fato).
- Status: FIXED (bug de teste, não de produto)

## F1: N+1 de requests em listas — endpoint bulk (backend)
- Serviço: apps/api
- Arquivo de produção: apps/api/plane/app/views/estimate/property.py (IssueEstimatePropertyValueBulkListEndpoint) + apps/api/plane/app/urls/estimate.py + apps/api/plane/app/views/__init__.py
- Arquivo de teste: apps/api/plane/tests/contract/app/test_estimate_property_values.py
- Teste escrito: TestIssueEstimatePropertyValueBulkListEndpoint (4 métodos: test_bulk_returns_values_grouped_by_issue_and_isolates_by_project, test_bulk_requires_issue_ids_param, test_bulk_empty_issue_ids_returns_empty_payload, test_bulk_rejects_more_than_cap_issue_ids)
- RED: confirmado (todos os 4 falharam com 404 — rota não existia)
- Fix: nova rota + view + export no barrel
- GREEN: confirmado (passou de primeira após corrigir um bug de fixture no próprio teste — State duplicado no mesmo projeto)
- Status: FIXED

## F1: N+1 de requests em listas — coalescer + service bulk (frontend)
- Serviço: assistant-front
- Arquivo de produção: apps/web/core/services/estimate-property.service.ts (fetchIssueEstimatePropertyValuesBulk), apps/web/core/store/estimates/project-estimate.store.ts (getIssueEstimatePropertyValues com force param, drainIssueValueFetchQueue, failIssueValueFetchBatch), 7 call sites atualizados
- Arquivo de teste: nenhum (sem infra de teste em apps/web — aceite por typecheck+build)
- Status: FIXED (verificado via typecheck limpo + build verde, sem regressão vs baseline)

## F2: Estimates invisíveis em workspace-views
- Serviço: assistant-front
- Arquivo de produção: apps/web/core/components/issues/issue-layouts/properties/all-properties.tsx (3 pontos: gate, estimateSystemPropertyIds/estimatePropertyIds, effect com ensureProjectEstimateProperties), apps/web/core/store/estimates/project-estimate.store.ts (novo método ensureProjectEstimateProperties)
- Arquivo de teste: nenhum
- Status: FIXED (verificado via typecheck limpo + build verde)

## F3: Valores órfãos ao deletar estimate point com reatribuição
- Serviço: apps/api
- Arquivo de produção: apps/api/plane/app/views/estimate/base.py:427-442
- Arquivo de teste: apps/api/plane/tests/contract/app/test_estimates_app.py
- Teste escrito: TestEstimatePointDestroyReassignment (test_reassignment_migrates_property_values_with_no_legacy_issue, test_reassignment_migrates_both_legacy_issue_and_property_value)
- RED: confirmado (test_reassignment_migrates_property_values_with_no_legacy_issue falhou — value não migrava, ficava apontando pro point deletado; o edge case com issue legada JÁ passava antes do fix, confirmando que só o branch "sem issue legada" estava quebrado)
- Fix: desindentar issues.update(...) e o update de IssueEstimatePropertyValue para fora do for loop; issue_activity.delay permanece dentro
- GREEN: confirmado (ambos os testes passam; assert de contagem de issue_activity.delay == 1 confirma que o dedent não duplicou nem removeu o efeito colateral)
- Status: FIXED

## F4a: Settings page stale após ativar/desativar estimate (SWR)
- Serviço: assistant-front
- Arquivo de produção: apps/web/core/components/estimates/properties/root.tsx (useSWR), apps/web/core/components/estimates/root.tsx (mutate após handleSetDefaultEstimate/handleToggleEstimateActive)
- Arquivo de teste: nenhum
- Status: FIXED (verificado via typecheck limpo + build verde)

## F4b: Settings page stale após deletar estimate (store cleanup)
- Serviço: assistant-front
- Arquivo de produção: apps/web/core/store/estimates/project-estimate.store.ts (deleteEstimate)
- Arquivo de teste: nenhum
- Status: FIXED (verificado via typecheck limpo + build verde)

## I5 + C1: Tabela de invalidação (condição obrigatória)
- Serviço: assistant-front
- Arquivo de produção: apps/web/core/store/estimates/project-estimate.store.ts (invalidateEstimatePropertiesCache + chamadas nos 6 mutadores: updateEstimate, deleteEstimate, createEstimateProperty, updateEstimateProperty, deleteEstimateProperty, upsertKpiRoleEstimateProperty)
- Arquivo de teste: nenhum
- Status: FIXED (C1 aplicado conforme especificado no plan-review.md — limpeza total de issueValuesFetchState, sem índice reverso)

## F5: Lixeira em property system-default
- Serviço: assistant-front
- Arquivo de produção: apps/web/core/components/estimates/properties/root.tsx
- Arquivo de teste: nenhum
- Status: FIXED (verificado via typecheck limpo + build verde)

## F6: Property criada silenciosamente no 1º estimate
- Serviço: assistant-front
- Arquivo de produção: apps/web/core/components/estimates/properties/root.tsx
- Arquivo de teste: nenhum
- Status: FIXED (verificado via typecheck limpo + build verde)

## F7: Código morto handleEstimate
- Serviço: assistant-front
- Arquivo de produção: apps/web/core/components/issues/issue-layouts/properties/all-properties.tsx
- Arquivo de teste: nenhum (remoção de código morto)
- Status: FIXED

## Verificação final consolidada
- Backend: 35/35 passed (test_estimates_app.py + test_estimate_property_values.py)
- Backend (regressão ampla): 47 passed, 2 failed pré-existentes (confirmados via git stash, não relacionados a esta sessão)
- Frontend: check:types com exatamente os mesmos 40 erros pré-existentes antes/depois (zero novos)
- Frontend: build verde (exit 0)
