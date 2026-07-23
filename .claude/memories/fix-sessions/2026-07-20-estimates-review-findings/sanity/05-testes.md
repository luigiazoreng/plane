# Sanity: Testes
## Resultados
| Item | Status | Evidência |
|------|--------|-----------|
| 5.1 Cobertura | ✅ SIM | `IssueEstimatePropertyValueBulkListEndpoint.get` (property.py:194) → `TestIssueEstimatePropertyValueBulkListEndpoint` (4 testes); `EstimatePointEndpoint.destroy` reassignment branch (base.py:421) → `TestEstimatePointDestroyReassignment` (2 testes). Ambas as funções de produção do backend têm teste correspondente. |
| 5.2 Negativos | ✅ SIM | `test_bulk_requires_issue_ids_param`: 400 (issue_ids ausente); `test_bulk_rejects_more_than_cap_issue_ids`: 201 ids → 400. Ambos checam status code exato. |
| 5.3 Qualidade pytest | ✅ SIM | Asserções de valor específico (`issue.estimate_point_id == replacement_point["id"]`, `len(activity_calls) == 1`), nenhuma vaga. Sem skip/xfail sem justificativa. Fixtures consistentes com o resto do arquivo. |
| 5.4 Edge cases | ✅ SIM | Lista vazia → 200 + `{}`. Issue sem valor → ausente do payload (não erro/null). Cap exato: 201 ids (1 acima do limite de 200). |
| 5.5 Playwright E2E | ⏸️ N/A | Infra de Playwright inexistente no repositório (limitação pré-existente) |
| 5.6 Visual Audit | ⏸️ N/A | Sem script visual-audit no repositório; nenhuma página nova criada |

## Funções sem teste (se ❌)
- N/A — as duas funções de produção do backend modificadas têm testes correspondentes. As duas funções de frontend (`fetchIssueEstimatePropertyValuesBulk`, `ensureProjectEstimateProperties`/coalescer) estão sem teste unitário, atribuído à ausência estrutural pré-existente de infraestrutura de testes de frontend (sem script `test` em `apps/web/package.json`), não a falha desta sessão.

## Testes com problema (se ❌)
- Nenhum
