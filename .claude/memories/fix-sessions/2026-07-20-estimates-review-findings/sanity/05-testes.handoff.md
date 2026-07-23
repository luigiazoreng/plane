# Handoff: Testes
Feature: Estimates review findings (fix-pipeline) — Stage E Sanity
Frontend modificado: SIM (11 arquivos .tsx/.ts em apps/web/core/)
Nova page/rota dashboard: NÃO — todas as mudanças de frontend são em painéis de settings existentes (estimates/properties/root.tsx, estimates/root.tsx) e em componentes de renderização de properties já existentes (issue-layouts, peek-overview, sidebar, issue-modal, power-k, workspace-draft). Nenhuma pasta/rota nova foi criada.
Infra de testes automatizados no frontend: INEXISTENTE neste repositório (`apps/web/package.json` não tem script `test`, `e2e` nem `visual-audit` — apenas `dev`, `build`, `check:types`, `check:lint`, `check:format`). Isso já era verdade ANTES desta sessão (documentado como DEFERRED/fora de escopo no stage-c-fix.md desta mesma sessão). NÃO marque isso como ❌ desta sessão — é uma limitação estrutural do repositório, não algo que o Fix agent desta sessão deveria ter corrigido.

## Contexto
Backend: framework de teste é pytest (não Jest) — `apps/api/plane/tests/contract/app/`.

Lista de funções/endpoints modificados nesta sessão e seus testes:
1. `IssueEstimatePropertyValueBulkListEndpoint.get` (novo) em `apps/api/plane/app/views/estimate/property.py:194-223` — testado em `apps/api/plane/tests/contract/app/test_estimate_property_values.py::TestIssueEstimatePropertyValueBulkListEndpoint` (4 testes: `test_bulk_returns_values_grouped_by_issue_and_isolates_by_project`, `test_bulk_requires_issue_ids_param`, `test_bulk_empty_issue_ids_returns_empty_payload`, `test_bulk_rejects_more_than_cap_issue_ids`)
2. `EstimatePointEndpoint.destroy` branch de reassignment (F3, dedent) em `apps/api/plane/app/views/estimate/base.py:421-451` — testado em `apps/api/plane/tests/contract/app/test_estimates_app.py::TestEstimatePointDestroyReassignment` (2 testes: `test_reassignment_migrates_property_values_with_no_legacy_issue`, `test_reassignment_migrates_both_legacy_issue_and_property_value`)
3. `fetchIssueEstimatePropertyValuesBulk` (novo, frontend) em `apps/web/core/services/estimate-property.service.ts:93-123` — SEM teste unitário (sem infra de Jest no repo, mesma limitação pré-existente)
4. `ensureProjectEstimateProperties`, coalescer `getIssueEstimatePropertyValues`/`drainIssueValueFetchQueue`/`invalidateEstimatePropertiesCache` (novo/modificado, frontend) em `apps/web/core/store/estimates/project-estimate.store.ts` — SEM teste unitário (mesma limitação)

## Itens

### 5.1 Cobertura por função (pytest)
| Função | Arquivo | Teste correspondente | Status |
|--------|---------|---------------------|--------|
| `IssueEstimatePropertyValueBulkListEndpoint.get` | property.py:194 | `TestIssueEstimatePropertyValueBulkListEndpoint` (4 testes) | ✅ |
| `EstimatePointEndpoint.destroy` (reassignment branch) | base.py:421 | `TestEstimatePointDestroyReassignment` (2 testes) | ✅ |

✅ As duas funções de PRODUÇÃO modificadas/criadas NO BACKEND têm teste correspondente listado acima?
✅ Nenhuma das duas está com status ❌ (sem teste)?

### 5.2 Cenários negativos (pytest)
**Código dos testes de cenário negativo** (`test_estimate_property_values.py`):
```python
def test_bulk_requires_issue_ids_param(self, session_client, workspace, project):
    response = session_client.get(_bulk_values_url(workspace.slug, project.id))
    assert response.status_code == status.HTTP_400_BAD_REQUEST

def test_bulk_rejects_more_than_cap_issue_ids(self, session_client, workspace, project):
    too_many_ids = [str(uuid.uuid4()) for _ in range(201)]
    response = session_client.get(_bulk_values_url(workspace.slug, project.id, too_many_ids))
    assert response.status_code == status.HTTP_400_BAD_REQUEST
```
✅ Existe pelo menos um teste que exercita o caminho de ERRO (issue_ids ausente → 400)?
✅ Existe pelo menos um teste que exercita o LIMITE superior (>200 ids → 400), não só o caminho feliz?
✅ Os testes checam o status code específico (400), não apenas "não é 200"?

### 5.3 Qualidade dos testes (pytest)
**Código de um teste representativo** (`test_reassignment_migrates_both_legacy_issue_and_property_value`):
```python
response = session_client.delete(
    get_estimate_point_detail_url(workspace.slug, project.id, estimate_id, point_to_delete["id"]),
    data={"new_estimate_id": replacement_point["id"]},
    format="json",
)
assert response.status_code == status.HTTP_200_OK
issue.refresh_from_db()
assert issue.estimate_point_id == replacement_point["id"]
value.refresh_from_db()
assert value.estimate_point_id == replacement_point["id"]
assert len(activity_calls) == 1
```
✅ NENHUM teste dos 6 novos (4 do bulk endpoint + 2 do reassignment) usa apenas uma asserção vaga tipo `assertIsNotNone`/`assert response is not None` como ÚNICA verificação (todos fazem asserções de valor específico: status code exato, IDs exatos, contagens exatas)?
✅ NENHUM teste está marcado como `@pytest.mark.skip`, `@pytest.mark.xfail` sem justificativa, ou vazio (só `pass`)?
✅ Os testes usam fixtures (`workspace`, `project`, `issue`, `state`, `create_user`) de forma consistente com o resto do arquivo, sem duplicar setup manualmente onde uma fixture já existe?

### 5.4 Edge cases (pytest)
**Código** (edge case: issue sem NENHUM valor deve estar AUSENTE do payload, não erro nem null):
```python
issue_3_no_value = Issue.objects.create(name="Task 3", project=project, workspace=workspace, state=state, created_by=create_user)
...
response = session_client.get(_bulk_values_url(workspace.slug, project.id, [issue.id, issue_2.id, issue_3_no_value.id, issue_b.id]))
...
assert str(issue_3_no_value.id) not in payload
```
```python
def test_bulk_empty_issue_ids_returns_empty_payload(self, session_client, workspace, project):
    response = session_client.get(_bulk_values_url(workspace.slug, project.id, []))
    assert response.status_code == status.HTTP_200_OK
    assert response.data == {}
```
✅ Existe teste para o caso "lista de issue_ids vazia" (edge case de input mínimo)?
✅ Existe teste para "issue sem nenhum valor definido" (edge case de dado ausente, não erro)?
✅ Existe teste para o limite EXATO do cap (201 ids, 1 acima do limite de 200) em vez de só um número genérico "muito grande"?

### 5.5 Playwright E2E
Infra de Playwright NÃO existe neste repositório (confirmado: sem script `e2e` em `apps/web/package.json`, sem diretório `apps/web/e2e/`). Isso é uma limitação estrutural pré-existente do projeto Plane, não algo que devesse ter sido criado nesta sessão de fix (o próprio stage-c-fix.md desta sessão já documenta isso como fora de escopo). Responda ⏸️ N/A diretamente — não marque como ❌.

### 5.6 Visual Audit / Screenshot Coverage
Não há script `visual-audit` neste repositório, e nenhuma NOVA página/rota foi criada nesta sessão (apenas painéis de settings e componentes de properties já existentes foram modificados). Responda ⏸️ N/A diretamente.

---

## Formato de Resposta
ESCREVA EXATAMENTE este formato em `.claude/memories/fix-sessions/2026-07-20-estimates-review-findings/sanity/05-testes.md` usando a ferramenta Write:

```markdown
# Sanity: Testes
## Resultados
| Item | Status | Evidência |
|------|--------|-----------|
| 5.1 Cobertura | ✅ SIM / ❌ NAO | [detalhes] |
| 5.2 Negativos | ✅ SIM / ❌ NAO | [detalhes] |
| 5.3 Qualidade pytest | ✅ SIM / ❌ NAO | [detalhes] |
| 5.4 Edge cases | ✅ SIM / ❌ NAO | [detalhes] |
| 5.5 Playwright E2E | ⏸️ N/A | Infra de Playwright inexistente no repositório (limitação pré-existente) |
| 5.6 Visual Audit | ⏸️ N/A | Sem script visual-audit no repositório; nenhuma página nova criada |

## Funções sem teste (se ❌)
- [função] em [arquivo]

## Testes com problema (se ❌)
- [teste] — [problema]
```
