# Sanity: Deploy
## Resultados
| Item | Status | Evidência |
|------|--------|-----------|
| 2.1 Migration | ⏸️ N/A | "Nenhuma migration foi tocada nesta sessão de fix" — confirmado pela lista de arquivos do Stage C (nenhum arquivo em `apps/api/plane/db/migrations/`) |
| 2.2 Env vars | ⏸️ N/A | "Nenhuma env var nova foi referenciada por este changeset (apenas endpoints, store, componentes)" |
| 2.3 Breaking | ✅ SIM | `getIssueEstimatePropertyValues = async (workspaceSlug, projectId, issueId, force = false)` — `force` tem default `false`, logo os 7 call-sites antigos continuam funcionando sem o 4º argumento; nova rota `issue-estimate-properties/` → `IssueEstimatePropertyValueBulkListEndpoint` é aditiva ("endpoint por-issue antigo continua existindo sem mudanças"); nenhum parâmetro obrigatório foi adicionado/removido |
| 2.4 Performance | ✅ SIM | Backend: `values = IssueEstimatePropertyValue.objects.filter(workspace__slug=slug, project_id=project_id, issue_id__in=issue_ids)` — uma única query com `issue_id__in`, sem loop por issue; Frontend: `CHUNK_SIZE = 200` com `chunks.push(issueIds.slice(i, i + CHUNK_SIZE))` e `Promise.all(chunks.map(...))` = `ceil(N/200)` requests em vez de N; o cap de 200 por chunk limita o tamanho de cada `issue_id__in` individual |

## Achados (se ❌)
Nenhum achado — todos os itens aplicáveis (2.3 e 2.4) foram confirmados como SIM com base no código citado no handoff. 2.1 e 2.2 são N/A conforme instruído.
