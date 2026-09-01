# Handoff: Contratos & Compatibilidade
Feature: Estimates review findings (fix-pipeline) — Stage E Sanity

## Contexto
Arquivos modificados: apps/api/plane/app/views/estimate/property.py (backend, novo endpoint), apps/web/core/services/estimate-property.service.ts (frontend, novo método consumidor), apps/web/core/store/estimates/project-estimate.store.ts (frontend, `force` param novo em método existente).

## Itens

### 4.1 Tipos de Retorno — endpoint novo vs. tipo esperado pelo frontend
**Código** (backend, formato de resposta do endpoint bulk):
```python
grouped: dict = {}
for item in serializer.data:
    grouped.setdefault(str(item["issue"]), []).append(item)
return Response(grouped, status=status.HTTP_200_OK)
# formato: { "<issue_id>": [ {..IssueEstimatePropertyValue fields..}, ... ], ... }
# um issue SEM nenhum valor fica AUSENTE do dict (não aparece com [] nem null)
```
**Código** (frontend, tipo declarado para consumir essa resposta, `estimate-property.service.ts`):
```typescript
async fetchIssueEstimatePropertyValuesBulk(
  workspaceSlug: string, projectId: string, issueIds: string[]
): Promise<Record<string, IIssueEstimatePropertyValue[]>> {
  ...
  const { data } = await this.get(`.../issue-estimate-properties/?issue_ids=${chunk.join(",")}`);
  return (data || {}) as Record<string, IIssueEstimatePropertyValue[]>;
  ...
}
```
**Código** (consumo no store, tratando ausência como "sem valores", não como erro):
```typescript
const grouped = await estimatePropertyService.fetchIssueEstimatePropertyValuesBulk(workspaceSlug, projectId, issueIds);
runInAction(() => {
  issueIds.forEach((issueId) => {
    const values = grouped[issueId] ?? [];
    values.forEach((value) => set(this.issueEstimatePropertyValues, [issueId, value.property], value));
    set(this.issueValuesFetchState, [issueId], "done");
  });
});
```

✅ O formato de resposta do backend (`{issueId: [values]}`, chave ausente = sem valores) corresponde EXATAMENTE ao que o tipo TypeScript `Record<string, IIssueEstimatePropertyValue[]>` e o código consumidor (`grouped[issueId] ?? []`) esperam?
✅ Um issue sem nenhum valor (ausente do dict Python) é tratado como "lista vazia" no frontend (`?? []`), não como `undefined`/erro que quebraria o `.forEach`?

### 4.2 Interfaces e DTOs — assinatura de método modificado
**Código** (interface pública do store, `IProjectEstimateStore` em `project-estimate.store.ts`):
```typescript
getIssueEstimatePropertyValues: (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  force?: boolean
) => Promise<IIssueEstimatePropertyValue[] | undefined>;
```
**Código** (implementação real da classe, mesma assinatura):
```typescript
getIssueEstimatePropertyValues = async (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  force = false
): Promise<IIssueEstimatePropertyValue[] | undefined> => { ... }
```
✅ A assinatura na interface `IProjectEstimateStore` (`force?: boolean`) bate exatamente com a assinatura da implementação (`force = false`)?
✅ `force` é opcional na interface (`force?:`) — backward compatível com os 7 call sites que não passam esse argumento?

### 4.3 Parâmetros — 7 call sites consumindo o método com `force`
**Código** (3 call sites de LISTA, usam o default `force=false` — NÃO passam o 4º argumento):
```typescript
// all-properties.tsx
getIssueEstimatePropertyValues(workspaceSlug.toString(), issue.project_id, issue.id).catch(() => {});
// estimate-column.tsx
getIssueEstimatePropertyValues(workspaceSlug.toString(), issue.project_id, issue.id).catch(() => {});
// draft-issue-properties.tsx
getIssueEstimatePropertyValues(workspaceSlug.toString(), issue.project_id, issue.id).catch(() => {});
```
**Código** (4 call sites de ISSUE ÚNICA, passam `true` explicitamente como 4º argumento):
```typescript
// peek-overview/properties.tsx
getIssueEstimatePropertyValues(workspaceSlug, projectId, issueId, true).catch(() => {});
// issue-detail/sidebar.tsx
getIssueEstimatePropertyValues(workspaceSlug, projectId, issueId, true).catch(() => {});
// issue-modal/components/default-properties.tsx
getIssueEstimatePropertyValues(workspaceSlug, projectId, id, true).catch(() => {});
// power-k/.../work-item/root.tsx
getIssueEstimatePropertyValues(workspaceSlug.toString(), entityDetails.project_id, entityDetails.id, true).catch(() => {});
```
✅ Nenhum dos 3 call sites de LISTA passa `force: true` acidentalmente (o que reintroduziria o N+1 que o fix resolve)?
✅ Todos os 4 call sites de ISSUE ÚNICA passam `true` explicitamente (não dependem do default `false`, que faria a UI mostrar dado potencialmente stale de uma lista)?
✅ Nenhum call site passa um 5º argumento inesperado ou usa a API de forma diferente da assinatura declarada?

---

## Formato de Resposta
ESCREVA EXATAMENTE este formato em `.claude/memories/fix-sessions/2026-07-20-estimates-review-findings/sanity/04-contratos.md` usando a ferramenta Write:

```markdown
# Sanity: Contratos
## Resultados
| Item | Status | Evidência |
|------|--------|-----------|
| 4.1 Retorno | ✅ SIM / ❌ NAO / ⏸️ N/A | [código] |
| 4.2 DTOs | ✅ SIM / ❌ NAO / ⏸️ N/A | [código] |
| 4.3 Params | ✅ SIM / ❌ NAO / ⏸️ N/A | [código] |

## Achados (se ❌)
Para cada ❌: Problema | Onde | Breaking? (sim/não)
```
