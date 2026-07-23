# Handoff: Padronização
Feature: Estimates review findings (fix-pipeline) — Stage E Sanity

## Contexto
Stack: Django REST Framework (Python) + Next.js/MobX (TypeScript). IMPORTANTE: este é o produto Plane (SaaS internacional em inglês) — mensagens de erro em INGLÊS são a convenção CORRETA deste codebase, não um desvio. NÃO marque ❌ por mensagens estarem em inglês. Um grep prévio nos 17 arquivos modificados desta sessão já confirmou ZERO `console.log`/`console.warn`/`console.error`/`debugger` novos, e apenas 2 comentários `TODO` PRÉ-EXISTENTES (não adicionados nesta sessão) em `base.py` linhas 365 e 388 (fora do escopo dos findings corrigidos).

## Itens

### 3.1 Error Handling — padrão do backend
**Código** (padrão consistente usado no endpoint novo E nos endpoints vizinhos já existentes no mesmo arquivo, `apps/api/plane/app/views/estimate/property.py`):
```python
# endpoint NOVO desta sessão
if raw_issue_ids is None:
    return Response({"error": "issue_ids is required"}, status=status.HTTP_400_BAD_REQUEST)
if len(issue_ids) > ISSUE_ESTIMATE_PROPERTY_VALUES_BULK_CAP:
    return Response({"error": f"issue_ids cannot contain more than {ISSUE_ESTIMATE_PROPERTY_VALUES_BULK_CAP} ids"}, status=status.HTTP_400_BAD_REQUEST)

# endpoint VIZINHO pré-existente, mesmo arquivo, para comparação de padrão
def destroy(self, request, slug, project_id, property_id):
    estimate_property = self.get_queryset().filter(pk=property_id).first()
    if not estimate_property:
        return Response({"error": "Estimate property not found"}, status=status.HTTP_404_NOT_FOUND)
```
✅ O endpoint novo usa o MESMO padrão de erro (`Response({"error": "..."}, status=...)`) que os endpoints vizinhos já existentes no mesmo arquivo, sem inventar um formato de erro diferente?
✅ Os status codes HTTP usados (400, 404, 200) são apropriados para cada caso (400 para input inválido, não 500)?

### 3.2 Debug Code
Já verificado via grep automatizado nos 17 arquivos desta sessão: ZERO console.log/console.warn/console.error/debugger novos. Responda ✅ SIM diretamente para este item — não precisa re-analisar código, apenas confirme com base nesta informação.

### 3.3 Naming & Structure
**Código** (nome da nova constante e função, seguindo o estilo já usado no arquivo vizinho `base.py`):
```python
# property.py — constante nova
ISSUE_ESTIMATE_PROPERTY_VALUES_BULK_CAP = 200

# base.py — constantes já existentes no arquivo IRMÃO (mesmo módulo estimate/), para comparação de estilo
ESTIMATE_POINT_COUNT_MIN = 2
ESTIMATE_POINT_COUNT_MAX = 6
```
```python
# property.py — classe nova
class IssueEstimatePropertyValueBulkListEndpoint(BaseAPIView):
    ...
# property.py — classe vizinha pré-existente, mesmo arquivo, para comparação de nomenclatura
class IssueEstimatePropertyValueListEndpoint(BaseAPIView):
    ...
```
```typescript
// project-estimate.store.ts — método novo
ensureProjectEstimateProperties = async (workspaceSlug: string, projectId: string): Promise<void> => { ... }
// método/padrão já existente no mesmo arquivo, para comparação
getProjectEstimateProperties = async (workspaceSlug: string, projectId: string): Promise<IEstimateProperty[] | undefined> => { ... }
```
✅ `ISSUE_ESTIMATE_PROPERTY_VALUES_BULK_CAP` segue o MESMO estilo de nomenclatura (SCREAMING_SNAKE_CASE) que `ESTIMATE_POINT_COUNT_MIN`/`MAX` no arquivo irmão?
✅ `IssueEstimatePropertyValueBulkListEndpoint` segue o MESMO padrão de nomenclatura de classes (PascalCase, sufixo `Endpoint`) que `IssueEstimatePropertyValueListEndpoint` ao lado?
✅ `ensureProjectEstimateProperties` (TypeScript, camelCase) segue o mesmo padrão de nomenclatura que os outros métodos do mesmo store (`getProjectEstimateProperties`, `getIssueEstimatePropertyValues`)?
✅ Nenhum nome genérico/não-descritivo (`data`, `temp`, `x`, `foo`) foi introduzido nas funções/variáveis novas?

### 3.4 Dependency Injection
**Código** (padrão de instanciação de serviços no frontend — singleton exportado, usado via import, não `new` dentro de métodos):
```typescript
// estimate-property.service.ts (não modificado neste ponto, mas usado pelo store)
const estimatePropertyService = new EstimatePropertyService();
export default estimatePropertyService;

// project-estimate.store.ts — uso do singleton, sem instanciar dentro de métodos
import estimatePropertyService from "@/services/estimate-property.service";
...
const values = await estimatePropertyService.fetchIssueEstimatePropertyValuesBulk(workspaceSlug, projectId, issueIds);
```
✅ O código novo usa o singleton `estimatePropertyService` já exportado, em vez de instanciar `new EstimatePropertyService()` dentro de um método?
✅ Não há nenhuma instanciação direta com `new` de uma dependência dentro dos métodos novos/modificados do store (`ensureProjectEstimateProperties`, `getIssueEstimatePropertyValues`, `drainIssueValueFetchQueue`)?

---

## Formato de Resposta
ESCREVA EXATAMENTE este formato em `.claude/memories/fix-sessions/2026-07-20-estimates-review-findings/sanity/03-padronizacao.md` usando a ferramenta Write:

```markdown
# Sanity: Padronização
## Resultados
| Item | Status | Evidência |
|------|--------|-----------|
| 3.1 Erros | ✅ SIM / ❌ NAO / ⏸️ N/A | [código] |
| 3.2 Debug | ✅ SIM | Confirmado via grep prévio: zero console.log/debugger novos |
| 3.3 Naming | ✅ SIM / ❌ NAO / ⏸️ N/A | [código] |
| 3.4 DI | ✅ SIM / ❌ NAO / ⏸️ N/A | [código] |

## Achados (se ❌)
Para cada ❌: Problema | Onde
```
