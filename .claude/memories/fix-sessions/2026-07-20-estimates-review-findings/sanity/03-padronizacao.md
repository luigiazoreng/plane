# Sanity: Padronização
## Resultados
| Item | Status | Evidência |
|------|--------|-----------|
| 3.1 Erros | ✅ SIM | Endpoint novo usa `Response({"error": "issue_ids is required"}, status=status.HTTP_400_BAD_REQUEST)` e `Response({"error": f"issue_ids cannot contain more than {ISSUE_ESTIMATE_PROPERTY_VALUES_BULK_CAP} ids"}, status=status.HTTP_400_BAD_REQUEST)` — mesmo padrão `Response({"error": "..."}, status=...)` do endpoint vizinho `destroy()`, que retorna `Response({"error": "Estimate property not found"}, status=status.HTTP_404_NOT_FOUND)`. Status codes usados (400, 404) são apropriados para input inválido/recurso não encontrado, não 500. |
| 3.2 Debug | ✅ SIM | Confirmado via grep prévio: zero console.log/debugger novos (apenas 2 TODOs pré-existentes em `base.py` linhas 365 e 388, fora do escopo). |
| 3.3 Naming | ✅ SIM | `ISSUE_ESTIMATE_PROPERTY_VALUES_BULK_CAP = 200` segue SCREAMING_SNAKE_CASE igual a `ESTIMATE_POINT_COUNT_MIN = 2` / `ESTIMATE_POINT_COUNT_MAX = 6` em `base.py`. `class IssueEstimatePropertyValueBulkListEndpoint(BaseAPIView)` segue PascalCase + sufixo `Endpoint`, igual à classe vizinha `class IssueEstimatePropertyValueListEndpoint(BaseAPIView)`. `ensureProjectEstimateProperties` (camelCase) segue o mesmo padrão de `getProjectEstimateProperties`/`getIssueEstimatePropertyValues` no mesmo store. Nenhum nome genérico (`data`/`temp`/`x`/`foo`) aparece nos trechos citados. |
| 3.4 DI | ✅ SIM | `project-estimate.store.ts` importa e usa o singleton já exportado — `import estimatePropertyService from "@/services/estimate-property.service";` seguido de `await estimatePropertyService.fetchIssueEstimatePropertyValuesBulk(...)` — sem `new EstimatePropertyService()` dentro dos métodos novos/modificados (`ensureProjectEstimateProperties`, `getIssueEstimatePropertyValues`, `drainIssueValueFetchQueue`). |

## Achados (se ❌)
Nenhum achado — todos os itens avaliados como ✅ SIM com base na evidência de código fornecida no handoff.
