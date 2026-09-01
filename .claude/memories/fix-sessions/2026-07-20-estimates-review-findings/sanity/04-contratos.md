# Sanity: Contratos
## Resultados
| Item | Status | Evidência |
|------|--------|-----------|
| 4.1 Retorno | ✅ SIM | Backend: `grouped.setdefault(str(item["issue"]), []).append(item)` → `{issueId: [values]}`, chave ausente quando sem valores. Frontend service tipa retorno como `Promise<Record<string, IIssueEstimatePropertyValue[]>>` e retorna `(data || {})` com esse tipo. Store consome com `const values = grouped[issueId] ?? [];` seguido de `values.forEach(...)`, tratando ausência como lista vazia, não erro/undefined que quebraria o `.forEach`. |
| 4.2 DTOs | ✅ SIM | Interface `IProjectEstimateStore`: `getIssueEstimatePropertyValues: (workspaceSlug: string, projectId: string, issueId: string, force?: boolean) => Promise<IIssueEstimatePropertyValue[] | undefined>;` bate exatamente com a implementação. `force?:` na interface é opcional, compatível com call sites que omitem o argumento. |
| 4.3 Params | ✅ SIM | 3 call sites de lista (`all-properties.tsx`, `estimate-column.tsx`, `draft-issue-properties.tsx`) chamam sem 4º argumento (default `force=false`). 4 call sites de issue única passam explicitamente `true` como 4º argumento. Nenhum call site passa um 5º argumento. |

## Achados (se ❌)
Nenhum achado — todos os 3 itens avaliados como ✅ SIM com base exclusivamente no código citado no handoff.
