# Sanity: Segurança
## Resultados
| Item | Status | Evidência |
|------|--------|-----------|
| 1.1 Escopo workspace/project | ✅ SIM | `values = IssueEstimatePropertyValue.objects.filter(workspace__slug=slug, project_id=project_id, issue_id__in=issue_ids)` — filtra por workspace__slug E project_id via Django QuerySet ORM parametrizado, não confia apenas nos issue_ids do client; teste `test_bulk_returns_values_grouped_by_issue_and_isolates_by_project` confirma que issue_id de outro projeto não vaza no payload. |
| 1.2 Auth/permissão | ✅ SIM | Endpoint bulk novo: `@allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])` em `IssueEstimatePropertyValueBulkListEndpoint.get` — idêntico ao endpoint por-issue existente `IssueEstimatePropertyValueListEndpoint.get` (mesmo decorator). `EstimatePointEndpoint.destroy` (modificado por F3) mantém `@allow_permission([ROLE.ADMIN, ROLE.MEMBER])`, sem GUEST. Todos os métodos mostrados têm `@allow_permission(...)`. |
| 1.3 Validação de input | ⏸️ N/A | Confirmado: checagem "obrigatório" existe antes de qualquer processamento (`if raw_issue_ids is None: return ... 400`) e cap de 200 existe (`if len(issue_ids) > ISSUE_ESTIMATE_PROPERTY_VALUES_BULK_CAP`). Porém, o próprio handoff declara incerteza quanto ao comportamento de um item não-UUID em `filter(issue_id__in=issue_ids)`: "o comportamento depende de como o Django ORM trata strings inválidas em `__in` sobre um campo UUID" — não há evidência no snippet suficiente para afirmar se isso gera 500 ou é tratado graciosamente, então não invento esse comportamento. |
| 1.4 Dados sensíveis | ✅ SIM | Resposta usa `IssueEstimatePropertyValueSerializer` com campos `{"id", "issue", "property", "estimate_point", "project", "workspace"}` — apenas dados de estimate, nada como senha/token/secret/hash. Escopo garantido pela query base `workspace__slug=slug, project_id=project_id` antes da serialização. |

## Achados (se ❌)
Nenhum ❌ encontrado. O único ponto de atenção é o 1.3 (⏸️ N/A), documentado acima por incerteza declarada no próprio handoff sobre o tratamento de valores não-UUID em `issue_id__in`, não por falha de segurança confirmada.
