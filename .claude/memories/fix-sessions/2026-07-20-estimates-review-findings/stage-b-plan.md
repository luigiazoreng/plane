# Stage B: Plan

## Revisão 2 (2026-07-20) — pós CHANGES_REQUESTED

- Arquivos produção backend: **3 novos/tocados** (`estimate/property.py`, `app/views/__init__.py`, `app/urls/estimate.py`) + **1** edição (`estimate/base.py:439-442`)
- Arquivos produção frontend: **7**
- Arquivos teste: **2** (`test_estimates_app.py`, `test_estimate_property_values.py`)
- Testes TDD especificados: **3** (F3 RED, F3 edge com assert de `issue_activity`, F1 bulk)
- Registros DEFERRED: **3** (F8, órfãos do F3, infra de teste do frontend)
- Risco geral: **médio** (era **alto** — os itens de risco alto saíram do escopo)
- Waves: 0, 1a, 1b, 2, 3a, 3b, 4, 5 — **nenhum BLOCKED**

## O que mudou nesta revisão

### Decisões do dev incorporadas
1. **F8 → DEFERRED.** Wave 6 removida do escopo de execução. Motivo: único finding que é mudança
   de comportamento, não bug; a superfície inclui `apps/api/plane/api/views/estimate.py`, consumida
   pelo MCP server `plane-local` em uso ativo. Superfície completa (8 endpoints, 2 arquivos),
   argumento de KPI do A1, risco do MCP e estratégia validada (sobrescrever só métodos de escrita)
   preservados em **DEFERRED-1**.
2. **Sem migration de reparo do F3.** Wave 5 (migration) removida. Órfãos existentes viram
   **DEFERRED-2**. Declarado explicitamente que o fix do F3 **não** estanca todos os órfãos —
   2ª fonte em `api/views/estimate.py:286`.
3. **Ambiente resolvido** — dev sobe o container. Critério de backend volta a **"pytest verde"**,
   sem alternativa BLOCKED. Critério de frontend inalterado (typecheck + build + browser), porque
   a ausência de runner em `apps/web` é real e não muda.

### Blockers corrigidos
- **B1** — coalescer reespecificado. `issueValuesFetchState` + `projectPropertiesFetchState`
  como registros próprios (não deriváveis de `issueEstimatePropertyValues`), 3 estados,
  `in-flight` marcado no **enfileiramento**, `done` para **todos** os ids pedidos (incl. os que
  voltaram sem value — é o ponto do blocker), remoção da entrada em erro. Spec de 2 layouts
  simultâneos (mesmo tick vs. ticks diferentes). Proibição explícita de `AbortController` /
  cancelamento em unmount. Tabela de invalidação com os **6** mutadores. Param opcional `force`
  para os 4 call sites de issue única (resolve R2 sem quebrar R1).
- **B2** — deixou de ser blocker de execução (F8 DEFERRED); informação verificada preservada.
- **B3** — varredura completa de `arquivo:linha` lendo o código. **6 erros corrigidos**, incl. um
  herdado do root-cause. Principal: `BulkEstimatePointEndpoint` está em `base.py:154` com
  `permission_classes`, **não** em `:137` — l.136 é `ProjectEstimatePointEndpoint`, GET-only.
  Confirmado também que os `arquivo:linha` do frontend do plano anterior estavam **corretos**
  (`all-properties.tsx:161/175-178/180-181/407`).

### Wave 3 quebrada em 3a/3b
- **3a** — F2 completo, **livre**. Depende só do endpoint `estimate-properties/`, que já existe
  (`urls/estimate.py:48-52`). O bulk é de *values*, não de *properties*.
- **3b** — service bulk + coalescer + guard do I3.
Com a DECISÃO 3 o gating some de qualquer forma, mas a separação fica por clareza de dependência.

### Importantes e sugestões
Todos os 5 importantes e as 5 sugestões **acatados**; **nenhum rejeitado**. Tabela item a item no
`fix-plan.md`. Destaques:
- **I3** entra no escopo — guard no coalescer, não no componente (evita corrida com o load das
  properties).
- **I1 / I2 / S2** viram as três razões do DEFERRED-2, com a dupla contagem SQL.
- **I5** — tabela "mutador → o que invalida" com os 6; os 4 write-through também invalidam
  (regra simples > regra fina; custo = 1 refetch numa página de settings).
- **S3** — `estimate-property.service.ts` existe **só** em `apps/web/core/services/`;
  `packages/services` riscado da lista de build.
- **S5** — assert de `issue_activity.delay` 1x por issue no Test 2 (virou R5).

### Riscos
R1–R11 (era R1–R10). **Saíram**: migration altera KPI, F8 quebra leitura, F8 quebra integração
externa (fora de escopo). **Entraram**: R7 (refetch eterno das issues sem values — o próprio B1),
R8 (Fix inventar `AbortController`), R11 (Fix implementar F8/migration por inércia, já que os
registros DEFERRED os descrevem em detalhe — **Wave 5 é escrita em `issues-not-fixed.md`, não
código**).

### Nota de execução para o Stage C
`.claude/memories/repo/issues-not-fixed.md` **não existe** (verificado: a pasta `repo/` tem só
`estimate-properties-dynamic-kpi.md`, `estimates-multi-active-gotchas.md`,
`fix-pipeline-architecture.md`). Criar com o header do protocolo, ler o arquivo inteiro antes de
cada append para checar duplicata, e usar o formato exato de entrada.

## Próximo
Stage B2 — Review Plan (re-revisão)
