# findings.md
Feature: Multi-select estimates per system
Created: 2026-07-17

---
### SR-001: EstimatePointEndpoint.destroy() com substituição não sincroniza IssueEstimatePropertyValue
**Severity**: 🔴 Critical
**Domain**: correctness
**File**: `apps/api/plane/app/views/estimate/base.py:417-436`
**Problem**: Quando um EstimatePoint é deletado COM um `new_estimate_id` de substituição no body, `Issue.estimate_point_id` é atualizado sincronamente para o novo ponto, mas NENHUMA linha de `IssueEstimatePropertyValue` referenciando o ponto deletado é atualizada — nem para o novo ponto, nem nulada. Fica órfã/desatualizada até o cascade assíncrono (`on_delete=SET_NULL`) rodar, e mesmo aí vira `None` (não o novo ponto), divergindo do campo legado `Issue.estimate_point`. A nova UI "Estimates" lê primariamente de `IssueEstimatePropertyValue`, então o usuário verá um valor errado/vazio enquanto o campo legado já mostra o valor correto.
**Evidence**:
```python
if new_estimate_id:
    issues = Issue.objects.filter(project_id=project_id, workspace__slug=slug, estimate_point_id=estimate_point_id)
    for issue in issues:
        issue_activity.delay(...)
        issues.update(estimate_point_id=new_estimate_id)
    # <<< nenhuma atualização de IssueEstimatePropertyValue aqui >>>
else:
    ...
    issues.update(estimate_point_id=None)
    IssueEstimatePropertyValue.objects.filter(workspace__slug=slug, estimate_point_id=estimate_point_id).update(estimate_point=None)
```
Comparar com o branch `else` (sem substituição), que trata `IssueEstimatePropertyValue` explicitamente. O branch `if new_estimate_id:` não tem o equivalente.
**Status**: OPEN

**Note (Phase 2)**: reconfirmado de forma independente (mesmo achado, ângulo adicional): o branch "com substituto" de `EstimatePointEndpoint.destroy()` também não atualiza `IssueEstimatePropertyValue`, deixando a tabela nova dessincronizada do campo legado. Mantido como Critical.

---
### SR-002: _bulk_resync_issue_estimate_point zera Issue.estimate_point de TODO o projeto sem escopo por sistema
**Severity**: 🔴 Critical
**Domain**: correctness
**File**: `apps/api/plane/app/views/estimate/base.py:108-118`
**Problem**: Quando a `EstimateProperty` default do novo sistema promovido ainda não existe (`default_property is None` — ocorre quando `_activate_numeric_estimate` roda ANTES de `_ensure_estimate_default_property` no mesmo call site), o código zera `Issue.estimate_point` de TODOS os issues do projeto, sem filtrar por qual sistema o valor atual pertence. A migração 0151 (Step B3, test case 2) documenta explicitamente que `Issue.estimate_point` pode conter dados "stale/histórico" apontando para estimates que não são nem o antigo default nem o novo — esses valores também são zerados indiscriminadamente por esta query, uma perda de dado real e reproduzível ao ativar/promover um segundo sistema de estimate numérico.
**Evidence**:
```python
default_property = (
    EstimateProperty.objects.filter(project_id=project.id, estimate_id=new_default_estimate.id, is_estimate_default=True).first()
    if new_default_estimate is not None else None
)
if default_property is None:
    Issue.objects.filter(project_id=project.id).update(estimate_point=None)  # sem filtro por sistema
    return
```
Chamado a partir de `_activate_numeric_estimate` (linha ~68) ANTES de `_ensure_estimate_default_property(estimate)` rodar no chamador (`BulkEstimatePointEndpoint.create`/`.partial_update`), garantindo que `default_property` ainda não existe nesse instante para uma primeira ativação.
**Status**: OPEN

**Note (Phase 2)**: reconciliação de nuance sobre este achado. Uma leitura alternativa argumenta que o branch de "wipe" é observacionalmente idêntico a um resync correto NA PRIMEIRA ativação de um sistema numérico (pois nenhum `IssueEstimatePropertyValue` pode existir ainda para uma `EstimateProperty` que não existe) — ou seja, "inofensivo hoje" nesse caso específico. Isso é verdade, MAS não invalida o achado: `Issue.estimate_point` não está restrito a refletir apenas o sistema default atual em todos os cenários — o próprio Step B3 (migração 0151, test case 2) documenta explicitamente que `Issue.estimate_point` pode conter "stale/historical data" apontando para um estimate que não é sequer `last_used=True`. A query de wipe (`Issue.objects.filter(project_id=project.id).update(estimate_point=None)`) não tem NENHUM filtro por sistema, então ela zera indiscriminadamente esses valores obsoletos/não-relacionados também, não apenas os do sistema antigo sendo substituído. Mantido como Critical. Adicionalmente, esta função não gera nenhum `IssueActivity` para o zeramento em massa (decisão deliberada documentada no plano — "no activity-log spam for this bulk resync" — não é um bug per se, mas reduz a rastreabilidade caso este código tenha um gatilho incorreto; vale considerar ao menos um log agregado de auditoria não-usuário caso o Fix agent decida corrigir a ordem de chamada).

---
### SR-003: EstimatePropertyDetailEndpoint.destroy não protege properties com is_estimate_default=True
**Severity**: 🔴 Critical
**Domain**: correctness
**File**: `apps/api/plane/app/views/estimate/property.py:94-104`
**Problem**: `destroy()` só bloqueia deleção quando `estimate_property.kpi_role` está setado. Uma property com `is_estimate_default=True` pode ser deletada livremente (soft-delete) por qualquer ADMIN/MEMBER via `ProjectEntityPermission`. Isso quebra o dual-write (o PUT do valor por sistema passa a retornar 404 "Estimate property not found", pois o manager filtra soft-deletados) até uma reativação do sistema recriar a property com um NOVO id — as `IssueEstimatePropertyValue` antigas ficam órfãs, presas ao id antigo soft-deletado, inacessíveis pela nova UI.
**Evidence**:
```python
def destroy(self, request, slug, project_id, property_id):
    estimate_property = self.get_queryset().filter(pk=property_id).first()
    if not estimate_property:
        return Response(status=404, ...)
    if estimate_property.kpi_role:
        return Response({"error": "..."}, status=400)
    estimate_property.delete()  # is_estimate_default=True não é checado
    return Response(status=204)
```
**Status**: OPEN

---
### SR-004: EstimatePropertyDetailEndpoint.partial_update permite reatribuir `estimate` de property default/kpi_role
**Severity**: ⚠️ Important
**Domain**: correctness
**File**: `apps/api/plane/app/views/estimate/property.py:74-92`
**Problem**: `allowed_fields = {"name", "estimate", "is_active", "sort_order"}` permite trocar o FK `estimate` de QUALQUER property via PATCH genérico, incluindo uma com `is_estimate_default=True` ou `kpi_role` setado. Isso quebra a invariante "uma default property por (project, estimate)" — pode causar `IntegrityError` na constraint `estimateproperty_unique_default_per_project_estimate` (500 não tratado), ou deixar o sistema de estimate original órfão sem property default, corrompendo o dual-write silenciosamente para esse sistema até uma nova ativação recriar a property com outro id.
**Evidence**:
```python
allowed_fields = {"name", "estimate", "is_active", "sort_order"}
filtered_data = {k: v for k, v in request.data.items() if k in allowed_fields}
if "estimate" in filtered_data:
    estimate = Estimate.objects.filter(pk=filtered_data["estimate"], project_id=project_id, workspace__slug=slug).first()
    ...
serializer = EstimatePropertySerializer(estimate_property, data=filtered_data, partial=True)
```
O serializer's `read_only_fields` bloqueia mudar `is_estimate_default`/`kpi_role` em si, mas não bloqueia mudar o `estimate` que essas flags apontam.
**Status**: OPEN

---
### SR-005: Power-K "change estimate" menu não busca IssueEstimatePropertyValue antes de renderizar
**Severity**: ⚠️ Important
**Domain**: correctness
**File**: `apps/web/core/components/power-k/ui/pages/context-based/work-item/estimates-menu.tsx`, `apps/web/core/components/power-k/ui/pages/context-based/work-item/root.tsx:68`
**Problem**: Diferente das outras 5 superfícies de UI desta feature (sidebar.tsx, default-properties.tsx, peek-overview/properties.tsx, draft-issue-properties.tsx, issue-properties.tsx), o Power-K nunca chama `getIssueEstimatePropertyValues` — confirmado via grep, zero ocorrências em `apps/web/core/components/power-k/`. `isSelected`/`currentValue` lêem `issueEstimatePropertyValueFor(workItemDetails.id, propertyId)` direto do cache MobX. Se o usuário abrir o Command Palette e for direto no "change estimate" sem antes ter aberto sidebar/peek/modal daquele issue nesta sessão, o cache está vazio e todo sistema aparece como "no estimate" (`currentValue === null`) mesmo que o issue já tenha valores reais — regressão em relação ao comportamento antigo, que lia `workItemDetails.estimate_point` sempre fresco vindo do próprio objeto do issue.
**Evidence**:
```tsx
const currentValue = issueEstimatePropertyValueFor(workItemDetails.id, propertyId)?.estimate_point ?? null;
```
Nenhum `useEffect`/fetch equivalente ao adicionado em peek-overview/draft-issue-properties para popular o cache antes desta leitura.
**Status**: OPEN

**Note (Phase 2)**: reconfirmado de forma independente por múltiplos ângulos adicionais (mesma raiz: Power-K nunca popula o cache de `IssueEstimatePropertyValue` antes de ler `issueEstimatePropertyValueFor`). Mantido como Important.

---
### SR-006: Zero testes de caminho negativo e zero teste cross-workspace para o endpoint principal da feature
**Severity**: ⚠️ Important
**Domain**: tests
**File**: `apps/api/plane/tests/contract/app/test_estimate_property_values.py`
**Problem**: `IssueEstimatePropertyValueEndpoint.put` (o endpoint carro-chefe da feature) tem 7 testes, todos happy-path (confirmado via grep — zero ocorrências de `404`/`not_found`/`400`/`invalid`/`another_project`/`other_project` no arquivo). Não há teste que verifique 404 para `property_id`/`issue_id` de outro projeto, nem 400 para um `estimate_point` que não pertence ao `estimate` da property (apesar do serializer ter validação para isso). Adicionalmente, grep em TODOS os arquivos de teste novos/estendidos desta feature (`test_estimate_property_values.py`, `test_estimates_app.py`, `test_estimate_model.py`, `test_estimate_serializer.py`, `test_0151_backfill_estimate_default_properties.py`) por termos como `other_workspace`/`workspace_2`/`cross_workspace`/`different_workspace` retornou ZERO resultados — nenhum teste de isolamento cross-workspace existe para esta feature inteira (só há isolamento cross-project dentro do mesmo workspace, ex: `test_estimate_point_destroy_rejects_point_from_another_project`).
**Evidence**: Comando executado: `grep -n "404\|not_found\|400\|invalid\|another_project\|other_project\|wrong_estimate" apps/api/plane/tests/contract/app/test_estimate_property_values.py` → sem resultados.
**Status**: OPEN

---
### SR-007: BulkEstimatePointEndpoint.destroy (DELETE /estimates/:id/) sem nenhum teste
**Severity**: ⚠️ Important
**Domain**: tests
**File**: `apps/api/plane/app/views/estimate/base.py:326-356` (BulkEstimatePointEndpoint.destroy)
**Problem**: Nenhum teste cobre a deleção de um `Estimate` inteiro, apesar deste método ser citado explicitamente como o "copy from" precedente para o padrão de nulling síncrono do Step B9 (`final-plan.md`), e de conter lógica não-trivial: promoção de `replacement_estimate`, nulling de `Issue.estimate_point`/`IssueEstimatePropertyValue.estimate_point`, soft-delete em cascata de `EstimateProperty`. Confirmado via grep em `test_estimates_app.py` — nenhum teste exercita `DELETE /estimates/:id/` (só existem testes para deleção de `EstimatePoint` individual).
**Evidence**: `grep -n "def test_.*estimate.*delete\|def test_.*delete.*estimate\|client.delete.*estimates/" apps/api/plane/tests/contract/app/test_estimates_app.py` → apenas `test_deactivating_estimate_does_not_delete_its_default_property` (que testa PATCH, não DELETE).
**Status**: OPEN

---
### SR-008: Queries de cleanup em base.py sem filtro explícito de project_id
**Severity**: 💡 Minor
**Domain**: standardization
**File**: `apps/api/plane/app/views/estimate/base.py:344-346` e `:462-464`
**Problem**: `Estimate.destroy()` e `EstimatePointEndpoint.destroy()` fazem `IssueEstimatePropertyValue.objects.filter(workspace__slug=slug, estimate_point__estimate_id=estimate_id).update(...)` / `.filter(workspace__slug=slug, estimate_point_id=estimate_point_id).update(...)` sem filtro explícito de `project_id`, inconsistente com o padrão do resto do arquivo (que sempre inclui `project_id` explicitamente). Não é explorável hoje porque `estimate_id`/`estimate_point_id` já resolvem unicamente para um único projeto, mas é uma inconsistência de defesa-em-profundidade que vale alinhar.
**Evidence**:
```python
IssueEstimatePropertyValue.objects.filter(
    workspace__slug=slug, estimate_point__estimate_id=estimate_id
).update(estimate_point=None)
```
**Status**: OPEN

---
### SR-009: Dual-write/activity logging não dispara em PUT sem mudança de valor (desvio não documentado do plano)
**Severity**: 💡 Minor
**Domain**: standardization
**File**: `apps/api/plane/app/views/estimate/property.py:205-242`
**Problem**: `final-plan.md` Step B5 ponto 2 diz "Always call `issue_activity.delay(...)`" para toda mudança de valor. A implementação real só dispara (tanto o log preciso quanto o dual-write legado) quando `old_estimate_point_str != new_estimate_point_str`. Comportamento provavelmente mais correto (evita spam de activity em PUT idempotente), mas é um desvio do plano não documentado como decisão deliberada, e não há teste explícito cobrindo o caso "PUT com o mesmo valor não gera activity".
**Evidence**:
```python
if old_estimate_point_str != new_estimate_point_str:
    epoch = int(timezone.now().timestamp())
    issue_activity.delay(type="estimate_property_value.activity.updated", ...)
    if estimate_property.is_estimate_default and estimate_property.estimate_id == issue.project.estimate_id:
        ...
```
**Status**: OPEN

---
### SR-010: Props opcionais com fallback silencioso em issue-properties.tsx (buffer de estimates)
**Severity**: 💡 Minor
**Domain**: standardization
**File**: `apps/web/core/components/inbox/modals/create-modal/issue-properties.tsx:38-39,182`
**Problem**: `estimatePropertyValues?`/`setEstimatePropertyValue?` são props opcionais com fallback `?.()` silencioso (`onChange={(estimatePoint) => setEstimatePropertyValue?.(propertyId, estimatePoint ?? null)}`). Hoje só existe um caller correto (`create-root.tsx`, que sempre passa ambos), mas o contrato de tipos permite um caller futuro esquecer de passar essas props sem nenhum erro/warning em tempo de compilação ou runtime — o buffer de estimates simplesmente não funcionaria, silenciosamente.
**Evidence**:
```tsx
estimatePropertyValues?: Record<string, string | null>;
setEstimatePropertyValue?: (propertyId: string, estimatePointId: string | null) => void;
...
onChange={(estimatePoint) => setEstimatePropertyValue?.(propertyId, estimatePoint ?? null)}
```
**Status**: OPEN

---
### SR-011: Migração 0151 e resync em massa sem chunking consistente em tabelas grandes
**Severity**: 💡 Minor
**Domain**: deployment
**File**: `apps/api/plane/db/migrations/0151_backfill_estimate_default_properties.py:51-53`
**Problem**: O loop `for issue in Issue.objects.filter(estimate_point__isnull=False, deleted_at__isnull=True).select_related("estimate_point"):` não usa `.iterator()`/chunking, apesar de `final-plan.md`'s "Risks / Open items" #4 pedir explicitamente para Build verificar contagem de linhas e considerar `.iterator(chunk_size=2000)` antes do merge — não foi resolvido (confirmado também em `stage-b1-build-backend.md`: "row-count check... was NOT re-verified"). Nota: `_bulk_resync_issue_estimate_point` em `base.py` (Step B8) JÁ usa `.iterator(chunk_size=500)` corretamente — só a migração 0151 ficou sem chunking.
**Evidence**:
```python
for issue in Issue.objects.filter(estimate_point__isnull=False, deleted_at__isnull=True).select_related("estimate_point"):
    ...
```
**Status**: OPEN

---
### SR-012: List/Board/Kanban quick-edit e Spreadsheet estimate column nunca migrados — escrevem só no campo legado
**Severity**: 🔴 Critical
**Domain**: correctness
**File**: `apps/web/core/components/issues/issue-layouts/properties/all-properties.tsx:161-162,380-388` e `apps/web/core/components/issues/issue-layouts/spreadsheet/columns/estimate-column.tsx:25-37`
**Problem**: [needs-context: gap de escopo ou gap de build?] Confirmado via `git status` que NENHUM dos dois arquivos foi modificado nesta feature. Ambos usam `<EstimateDropdown value={issue.estimate_point} onChange={...} projectId={...} />` SEM o prop `estimateId` (ou seja, modo "flat", não o modo "specific estimate" usado pelos 6 surfaces migrados) e escrevem diretamente `{ estimate_point: value }` via `updateIssue`/`onChange` genérico do issue — o endpoint genérico de update de issue NÃO passa pelo dual-write de `IssueEstimatePropertyValueEndpoint.put`. Resultado: editar o estimate pela visão de lista/board/kanban (dropdown rápido de propriedades) ou pela coluna de estimate da spreadsheet view atualiza `Issue.estimate_point` mas NUNCA cria/atualiza a `IssueEstimatePropertyValue` correspondente. sidebar/peek-overview/modal/draft/intake/Power-K (que agora leem primariamente de `IssueEstimatePropertyValue`) vão mostrar um valor desatualizado ou "sem estimate" para o mesmo issue logo após essa edição. É uma divergência de dado real e imediata, reproduzível em qualquer projeto com múltiplos sistemas de estimate, sem nenhum teste cobrindo isso. Nota: `final-plan.md`'s seção "Scope confirmed with developer" lista explicitamente as 6 superfícies em escopo (sidebar, create/edit modal, peek overview, workspace drafts, intake creation, Power-K) e a seção "Out of scope" lista apenas consumidores DE LEITURA (filters, sort, analytics, export) — list/kanban/spreadsheet são superfícies de ESCRITA que não aparecem em nenhuma das duas listas, sugerindo que este é um gap do próprio escopo definido no Stage A (Plan), não apenas um item esquecido no Build.
**Evidence**:
```tsx
// all-properties.tsx:161-162
const handleEstimate = async (value: string | undefined) => {
  if (updateIssue) await updateIssue(issue.project_id, issue.id, { estimate_point: value });
};
// ...:380-388
<EstimateDropdown value={issue.estimate_point ?? undefined} onChange={handleEstimate} projectId={issue.project_id} ... />

// estimate-column.tsx:25-29
<EstimateDropdown
  value={issue.estimate_point || undefined}
  onChange={(data) => onChange(issue, { estimate_point: data }, { changed_property: "estimate_point", change_details: data })}
  ...
/>
```
**Status**: OPEN

---
### SR-013: EstimatePropertyListCreateEndpoint.create() grava direto via .objects.create(), sem validação do serializer
**Severity**: ⚠️ Important
**Domain**: correctness
**File**: `apps/api/plane/app/views/estimate/property.py:43-61`
**Problem**: `create()` valida manualmente apenas `name`/`estimate` (presença), mas grava a `EstimateProperty` via `.objects.create()` direto, sem passar os dados pelo `EstimatePropertySerializer` para validação (o serializer só é usado DEPOIS, para montar a resposta). Isso é inconsistente com `EstimatePropertyDetailEndpoint.partial_update` (mesmo arquivo), que valida via serializer antes de salvar. Nenhuma validação de tamanho/formato de `name` (o serializer poderia ter `max_length` ou outras regras de model não checadas no create manual).
**Evidence**:
```python
def create(self, request, slug, project_id):
    name = (request.data.get("name") or "").strip()
    estimate_id = request.data.get("estimate")
    if not name or not estimate_id:
        return Response({"error": "name and estimate are required"}, status=400)
    estimate = Estimate.objects.filter(pk=estimate_id, project_id=project_id, workspace__slug=slug).first()
    if not estimate:
        return Response({"error": "Estimate not found"}, status=404)
    estimate_property = EstimateProperty.objects.create(
        name=name, estimate=estimate, project_id=project_id, workspace_id=estimate.workspace_id,
    )  # <-- sem serializer.is_valid()
    serializer = EstimatePropertySerializer(estimate_property)  # só para resposta
    return Response(serializer.data, status=201)
```
**Status**: OPEN

