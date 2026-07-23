# Handoff: Deploy & Migrations
Feature: Estimates review findings (fix-pipeline) — Stage E Sanity

## Contexto
Arquivos modificados: apps/api/plane/app/urls/estimate.py, apps/api/plane/app/views/__init__.py, apps/api/plane/app/views/estimate/base.py, apps/api/plane/app/views/estimate/property.py (backend); apps/web/core/services/estimate-property.service.ts, apps/web/core/store/estimates/project-estimate.store.ts, + 9 componentes React (frontend). Esta sessão de fix-pipeline corrigiu 7 findings de uma revisão anterior (N+1 de requests, estimates ausentes em workspace-views, órfãos ao deletar estimate point, UI stale no settings, correções menores). NENHUM arquivo de migration (`apps/api/plane/db/migrations/`) foi modificado nesta sessão — confirmado pela lista de arquivos do Stage C.

## Itens

### 2.1 Segurança de Migrations
Nenhuma migration foi tocada nesta sessão de fix. Responda ⏸️ N/A diretamente para este item, sem precisar analisar nada.

### 2.2 Env Vars
Nenhuma env var nova foi referenciada por este changeset (apenas endpoints, store, componentes). Responda ⏸️ N/A diretamente para este item.

### 2.3 Breaking Changes — novo parâmetro `force` e novo endpoint
**Código** (assinatura da função modificada, `apps/web/core/store/estimates/project-estimate.store.ts`):
```typescript
getIssueEstimatePropertyValues = async (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  force = false
): Promise<IIssueEstimatePropertyValue[] | undefined> => { ... }
```
Antes desta sessão, a assinatura tinha apenas 3 parâmetros (`workspaceSlug, projectId, issueId`); `force` foi ADICIONADO com valor default `false`.

**Código** (novo endpoint backend, aditivo — não substitui nenhum endpoint existente):
```python
# urls/estimate.py — nova rota, endpoint por-issue antigo continua existindo sem mudanças
path(
    "workspaces/<str:slug>/projects/<uuid:project_id>/issue-estimate-properties/",
    IssueEstimatePropertyValueBulkListEndpoint.as_view(),
    name="issue-estimate-property-values-bulk",
),
```

✅ O novo parâmetro `force` tem um valor default, então TODOS os 7 call-sites que já chamavam `getIssueEstimatePropertyValues` antes desta sessão continuam funcionando sem precisar passar o 4º argumento?
✅ O novo endpoint bulk é ADITIVO (nova rota), sem remover ou alterar o contrato de nenhum endpoint pré-existente?
✅ Nenhuma função teve parâmetro OBRIGATÓRIO adicionado ou removido (o que quebraria callers existentes)?

### 2.4 Performance — evitar N+1
**Código** (o problema original que este fix resolve, para contexto — comentário no próprio código):
```python
class IssueEstimatePropertyValueBulkListEndpoint(BaseAPIView):
    """F1: bulk-list estimate property values for many issues of the SAME
    project in a single request. ... Pairs with `estimate-properties/`
    (properties, not values) for populating list/kanban/spreadsheet/
    workspace-draft layouts without 1-request-per-row."""
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        ...
        values = IssueEstimatePropertyValue.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id__in=issue_ids
        )
        serializer = IssueEstimatePropertyValueSerializer(values, many=True)
        grouped: dict = {}
        for item in serializer.data:
            grouped.setdefault(str(item["issue"]), []).append(item)
        return Response(grouped, status=status.HTTP_200_OK)
```
**Código** (frontend, chunking de 200 em vez de 1 request por issue, `apps/web/core/services/estimate-property.service.ts`):
```typescript
async fetchIssueEstimatePropertyValuesBulk(
  workspaceSlug: string, projectId: string, issueIds: string[]
): Promise<Record<string, IIssueEstimatePropertyValue[]>> {
  if (issueIds.length === 0) return {};
  const CHUNK_SIZE = 200;
  const chunks: string[][] = [];
  for (let i = 0; i < issueIds.length; i += CHUNK_SIZE) {
    chunks.push(issueIds.slice(i, i + CHUNK_SIZE));
  }
  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-estimate-properties/?issue_ids=${chunk.join(",")}`);
      return (data || {}) as Record<string, IIssueEstimatePropertyValue[]>;
    })
  );
  return chunkResults.reduce((acc, chunk) => ({ ...acc, ...chunk }), {});
}
```

✅ A query backend é UMA ÚNICA query (`filter(...issue_id__in=issue_ids)`), não um loop de N queries por issue?
✅ O frontend faz no máximo `ceil(N/200)` requests para N issues, em vez de N requests (1 por issue)?
✅ Existe um cap superior no backend (200) que limita o tamanho de cada query individual?

---

## Formato de Resposta
ESCREVA EXATAMENTE este formato em `.claude/memories/fix-sessions/2026-07-20-estimates-review-findings/sanity/02-deploy.md` usando a ferramenta Write:

```markdown
# Sanity: Deploy
## Resultados
| Item | Status | Evidência |
|------|--------|-----------|
| 2.1 Migration | ⏸️ N/A | Nenhuma migration modificada nesta sessão |
| 2.2 Env vars | ⏸️ N/A | Nenhuma env var nova |
| 2.3 Breaking | ✅ SIM / ❌ NAO | [linha/código] |
| 2.4 Performance | ✅ SIM / ❌ NAO | [linha/código] |

## Achados (se ❌)
Para cada ❌: Problema | Onde | Risco
```
