# Fix Classifications — Estimates review findings

Nota: esta sessão do fix-pipeline foi conduzida a partir de `fix-plan.md` (já aprovado, com as 3 decisões definitivas do dev e a condição C1 do Stage B2), não a partir de um `findings.md` gerado por um Review agent do feature-pipeline. Por isso a classificação abaixo reflete o enquadramento que o PRÓPRIO fix-plan.md já fez de cada um dos 8 findings originais do bug-report/root-cause, e não uma reclassificação — os rótulos VALID/DEFERRED usados aqui são os do plano, aplicados de forma consistente com o vocabulário do pipeline de fix.

## F1: N+1 de requests em listas de work items
- Classificação: VALID
- Razão: bug real de performance causado pela arquitetura per-issue reusada em contexto de lista; confirmado por leitura de código (3 call sites de lista sem coalescer/endpoint bulk).
- Serviço: ambos (backend: novo endpoint bulk; frontend: coalescer no store)
- Arquivo de teste: apps/api/plane/tests/contract/app/test_estimate_property_values.py (TestIssueEstimatePropertyValueBulkListEndpoint)

## F2: Estimates invisíveis em workspace-views
- Classificação: VALID
- Razão: bug real — route projectId undefined fora de /[slug]/projects/[projectId]/..., gate e computeds retornavam vazio silenciosamente.
- Serviço: assistant-front (apps/web)
- Arquivo de teste: nenhum (sem infra de teste em apps/web — aceite por typecheck+build, documentado como lacuna estrutural desde o plano, DEFERRED-3 já registrado)

## F3: Valores órfãos ao deletar estimate point com reatribuição
- Classificação: VALID
- Razão: bug real confirmado — issues.update(...) e o update de IssueEstimatePropertyValue estavam dentro do for loop, só executavam se alguma issue usasse a coluna legada.
- Serviço: apps/api
- Arquivo de teste: apps/api/plane/tests/contract/app/test_estimates_app.py (TestEstimatePointDestroyReassignment)

## F4a: Settings page stale após ativar/desativar estimate
- Classificação: VALID
- Razão: useEffect com deps que nunca mudam ao ativar/desativar; backend auto-cria property default sem o frontend saber.
- Serviço: assistant-front
- Arquivo de teste: nenhum (mesma lacuna do F2)

## F4b: Settings page stale após deletar estimate
- Classificação: VALID
- Razão: deleteEstimate no store não limpava estimateProperties órfãs, computeds não validavam se o estimate ainda existia.
- Serviço: assistant-front
- Arquivo de teste: nenhum (mesma lacuna do F2)

## F5: Lixeira em property system-default
- Classificação: VALID
- Razão: UI só escondia a lixeira para property.kpi_role, backend rejeita também por is_estimate_default (2ª causa não coberta).
- Serviço: assistant-front
- Arquivo de teste: nenhum (mesma lacuna do F2)

## F6: Property criada silenciosamente no 1º estimate
- Classificação: VALID
- Razão: handleCreate usava estimateOptions[0] sem picker no form, comportamento silencioso e não intencional para o usuário.
- Serviço: assistant-front
- Arquivo de teste: nenhum (mesma lacuna do F2)

## F7: Código morto handleEstimate
- Classificação: VALID
- Razão: zero referências no arquivo, handleEstimateChange é o caminho vivo. Cleanup de baixo risco.
- Serviço: assistant-front
- Arquivo de teste: nenhum (não aplicável — remoção de código morto)

## F8: MEMBER muta estimates apesar da UI admin-only
- Classificação: DEFERRED (confirmado pelo dev nas decisões definitivas do fix-plan.md, DECISÃO 1)
- Razão: é mudança de comportamento (não bug), pré-existente ao fork/paridade com upstream; risco de quebrar o MCP server plane-local sem saber o role do token usado. Dev decidiu explicitamente não apertar permissões nesta sessão.
- Serviço: apps/api
- Arquivo de teste: N/A (não implementado)

## Órfãos históricos do F3 (2ª fonte incluída)
- Classificação: DEFERRED (confirmado pelo dev, DECISÃO 2)
- Razão: reparo (anular) tem efeito não-monotônico em notas de KPI reais; migrar é inviável (dado não recuperável); existe 2ª fonte (API pública, api/views/estimate.py:286-291) que não foi fechada nesta sessão e continua gerando órfãos novos.
- Serviço: apps/api
- Arquivo de teste: N/A (não implementado)

## Lacuna estrutural: apps/web sem infraestrutura de teste
- Classificação: DEFERRED (já registrado como DEFERRED-3 no próprio fix-plan.md, antes desta sessão)
- Razão: apps/web não tem script "test", jest ou vitest; montar isso é mudança de infra grande, fora do escopo de um fix pass.
- Serviço: assistant-front
- Arquivo de teste: N/A
