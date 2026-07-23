# Handoff: Segurança
Feature: Estimates review findings (fix-pipeline) — Stage E Sanity

## Contexto
Stack: Django REST Framework (backend, Python) + Next.js/MobX (frontend, TypeScript). Não use terminologia "account_id" — o equivalente de isolamento multi-tenant aqui é `workspace__slug` + `project_id`. Arquivos modificados: apps/api/plane/app/urls/estimate.py, apps/api/plane/app/views/__init__.py, apps/api/plane/app/views/estimate/base.py, apps/api/plane/app/views/estimate/property.py, apps/web/core/services/estimate-property.service.ts, apps/web/core/store/estimates/project-estimate.store.ts.

## Itens para verificar

### 1.1 Escopo por workspace/project (equivalente ao account_id) — novo endpoint bulk
**Código** (`apps/api/plane/app/views/estimate/property.py`, classe `IssueEstimatePropertyValueBulkListEndpoint`):
```python
class IssueEstimatePropertyValueBulkListEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        raw_issue_ids = request.query_params.get("issue_ids")
        if raw_issue_ids is None:
            return Response({"error": "issue_ids is required"}, status=status.HTTP_400_BAD_REQUEST)

        issue_ids = [item for item in raw_issue_ids.split(",") if item]
        if len(issue_ids) > ISSUE_ESTIMATE_PROPERTY_VALUES_BULK_CAP:
            return Response(
                {"error": f"issue_ids cannot contain more than {ISSUE_ESTIMATE_PROPERTY_VALUES_BULK_CAP} ids"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not issue_ids:
            return Response({}, status=status.HTTP_200_OK)

        values = IssueEstimatePropertyValue.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id__in=issue_ids
        )
        serializer = IssueEstimatePropertyValueSerializer(values, many=True)

        grouped: dict = {}
        for item in serializer.data:
            grouped.setdefault(str(item["issue"]), []).append(item)

        return Response(grouped, status=status.HTTP_200_OK)
```
Um teste automatizado (`test_bulk_returns_values_grouped_by_issue_and_isolates_by_project`) já cobre o caso: um `issue_id` de OUTRO projeto (mesmo workspace) é passado deliberadamente na lista e o teste assert que ele NÃO aparece no payload de resposta.

✅ A query (`values = IssueEstimatePropertyValue.objects.filter(...)`) filtra por `workspace__slug` E `project_id`, não confiando apenas nos `issue_ids` passados pelo client?
✅ Um `issue_id` de outro projeto passado deliberadamente na URL não teria como vazar dados (a query nunca casaria `project_id`)?
✅ Usa filtro ORM parametrizado (Django QuerySet), não concatenação de string SQL crua?

### 1.2 Autenticação/permissão em endpoints novo e modificado
**Código** (permissões dos endpoints tocados nesta sessão, `apps/api/plane/app/views/estimate/property.py` e `base.py`):
```python
# property.py — endpoint NOVO desta sessão (bulk)
class IssueEstimatePropertyValueBulkListEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id): ...

# property.py — endpoint por-issue já existente, mesmo nível de permissão (para comparação)
class IssueEstimatePropertyValueListEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id): ...

# base.py — EstimatePointEndpoint.destroy, MODIFICADO nesta sessão (F3: dedent)
class EstimatePointEndpoint(BaseViewSet):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, estimate_id, estimate_point_id):
        ...
```
✅ O endpoint bulk NOVO tem o MESMO nível mínimo de permissão que o endpoint por-issue equivalente que já existia (nem mais permissivo, nem mais restritivo sem razão)?
✅ `EstimatePointEndpoint.destroy` (que teve sua lógica interna modificada por F3) continua exigindo ADMIN/MEMBER (não ficou acessível a GUEST)?
✅ Todos os métodos GET/POST/PUT/PATCH/DELETE tocados nesta sessão têm `@allow_permission(...)` ou `permission_classes` — nenhum endpoint ficou sem decorator de autorização?

### 1.3 Validação de input — novo query param `issue_ids`
**Código** (mesmo endpoint, parsing do query param):
```python
raw_issue_ids = request.query_params.get("issue_ids")
if raw_issue_ids is None:
    return Response({"error": "issue_ids is required"}, status=status.HTTP_400_BAD_REQUEST)

issue_ids = [item for item in raw_issue_ids.split(",") if item]
if len(issue_ids) > ISSUE_ESTIMATE_PROPERTY_VALUES_BULK_CAP:  # = 200
    return Response({...}, status=status.HTTP_400_BAD_REQUEST)
if not issue_ids:
    return Response({}, status=status.HTTP_200_OK)

values = IssueEstimatePropertyValue.objects.filter(
    workspace__slug=slug, project_id=project_id, issue_id__in=issue_ids
)
```
Note: `issue_ids` NÃO passa por validação explícita de formato UUID antes de entrar no `filter(issue_id__in=issue_ids)` — se um item da lista não for um UUID válido, o comportamento depende de como o Django ORM trata strings inválidas em `__in` sobre um campo UUID.

✅ Existe uma checagem explícita de "obrigatório" (issue_ids ausente → 400) ANTES de qualquer processamento?
✅ Existe um cap superior (200) que impede uma lista arbitrariamente grande de sobrecarregar a query?
✅ Um valor malformado (não-UUID) dentro de `issue_ids` causaria um erro 500 não tratado, OU o Django/DRF absorve isso graciosamente (retornando lista vazia/erro 400)? Se não tiver certeza pela leitura do código sozinho, responda ⏸️ N/A e explique a incerteza na evidência — não invente um comportamento do Django que não está no snippet.

### 1.4 Exposição de dados sensíveis na resposta
**Código** (serializer usado pelo endpoint bulk e resposta agrupada):
```python
serializer = IssueEstimatePropertyValueSerializer(values, many=True)
grouped: dict = {}
for item in serializer.data:
    grouped.setdefault(str(item["issue"]), []).append(item)
return Response(grouped, status=status.HTTP_200_OK)
```
O `IssueEstimatePropertyValueSerializer` não foi modificado nesta sessão (apenas reutilizado) — mas a resposta agrupada por `issue_id` é uma superfície nova. Cada `item` é um valor de estimate property (ex.: `{"id": ..., "issue": ..., "property": ..., "estimate_point": ..., "project": ..., "workspace": ...}`).

✅ A resposta contém apenas dados de estimate (id, issue, property, estimate_point, project, workspace) — nada como senha, token, secret, hash de usuário?
✅ Os dados retornados já são escopados por workspace/project (não vazam dados de outro workspace, já que a query base é `workspace__slug=slug, project_id=project_id`)?

---

## Formato de Resposta
ESCREVA EXATAMENTE este formato em `.claude/memories/fix-sessions/2026-07-20-estimates-review-findings/sanity/01-seguranca.md` usando a ferramenta Write:

```markdown
# Sanity: Segurança
## Resultados
| Item | Status | Evidência |
|------|--------|-----------|
| 1.1 Escopo workspace/project | ✅ SIM / ❌ NAO / ⏸️ N/A | [linha/código que comprova] |
| 1.2 Auth/permissão | ✅ SIM / ❌ NAO / ⏸️ N/A | [linha/código que comprova] |
| 1.3 Validação de input | ✅ SIM / ❌ NAO / ⏸️ N/A | [linha/código que comprova] |
| 1.4 Dados sensíveis | ✅ SIM / ❌ NAO / ⏸️ N/A | [linha/código que comprova] |

## Achados (se ❌)
Para cada ❌, descreva:
- **Problema**: [descrição curta]
- **Onde**: [arquivo:linha]
- **Risco**: [baixo/médio/alto]
```
