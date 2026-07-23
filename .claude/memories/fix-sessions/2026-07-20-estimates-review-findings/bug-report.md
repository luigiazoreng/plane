# Bug Report — Estimates feature (revisão 2026-07-20)

## Descrição

Revisão read-only da feature de estimates (backend + frontend + página de Views) encontrou
8 problemas. O dev pediu `all` — corrigir todos. Estão ordenados por severidade.

Nada foi alterado ainda. Todos os achados foram verificados lendo o código; nenhum foi
reproduzido em runtime (ver seção "Informações Adicionais").

---

## FINDING 1 — N+1 de requests HTTP em toda lista de work items (ALTA)

**Arquivos**:
- `apps/web/core/components/issues/issue-layouts/spreadsheet/columns/estimate-column.tsx:38-42`
- `apps/web/core/components/issues/issue-layouts/properties/all-properties.tsx:175-178`

**Comportamento atual**: ambos os componentes disparam `getIssueEstimatePropertyValues` num
`useEffect` que roda **uma vez por linha de work item**. Cada chamada faz
`GET .../issues/<issue_id>/estimate-properties/`. Uma view com 200 work items dispara 200
requests HTTP separados.

Agravantes:
- Não existe endpoint bulk. `apps/api/plane/app/urls/estimate.py` só expõe a rota por-issue.
- `getIssueEstimatePropertyValues` (`project-estimate.store.ts:585-595`) é um método async
  simples: sem SWR key, sem dedupe, sem checagem de cache. Remounts (scroll virtualizado,
  troca de layout) re-disparam tudo.
- O effect é incondicional: roda mesmo quando a display property `estimate` está desligada e
  mesmo quando o projeto não tem nenhum estimate configurado.

**Comportamento esperado**: no máximo 1 request por página de listagem. Buscar os valores em
lote (endpoint novo `?issue_ids=...` ou embutir no serializer da listagem de issues) e o store
não deve refazer fetch de issue já carregada.

**Nota de escopo**: este é o achado mais caro e o único que mexe em contrato de API. Se o
Plan decidir fatiar, este pode virar uma correção separada — mas o dev pediu `all`.

---

## FINDING 2 — Estimates nunca renderizam em workspace-views (global views) (ALTA)

**Arquivo**: `apps/web/core/components/issues/issue-layouts/properties/all-properties.tsx:180-181, 407`

**Comportamento atual**: o bloco de estimates é gated em `projectId` vindo do **route param**
(`useParams()`), e as linhas 180-181 usam esse mesmo param para resolver quais properties
renderizar. Em `/[workspaceSlug]/workspace-views/[globalViewId]` não existe `projectId` na
rota → o gate é sempre falso → estimates somem silenciosamente.

Todas as outras properties no mesmo arquivo usam `issue?.project_id` corretamente (assignees,
modules, cycles, labels). O `SpreadsheetEstimateColumn` também usa `issue.project_id`
corretamente — então na mesma view o estimate aparece no layout spreadsheet e não aparece em
list/kanban.

**Agravante**: a página workspace-views fica fora de `core/layouts/auth-layout/project-wrapper.tsx`,
que é quem normalmente carrega as estimate properties no store. Então corrigir só o gate não
basta — as properties precisam ser carregadas por projeto das issues visíveis.

**Comportamento esperado**: estimates renderizam em list/kanban/spreadsheet igualmente, em
project views e workspace views, resolvendo o projeto a partir de `issue.project_id`.

---

## FINDING 3 — Valores de estimate property órfãos ao deletar estimate point (MÉDIA)

**Arquivo**: `apps/api/plane/app/views/estimate/base.py:427-442`

**Comportamento atual**: no branch de reatribuição (`if new_estimate_id:`), tanto
`issues.update(estimate_point_id=new_estimate_id)` (linha 439) quanto o update de
`IssueEstimatePropertyValue` (linhas 440-442) estão **dentro** do loop `for issue in issues:`
(indentação de 16 espaços; o `for` está em 12).

Duas consequências:
1. **Bug de dados**: se nenhuma issue usa aquele point via a coluna legada
   `Issue.estimate_point`, o corpo do loop nunca executa e os `IssueEstimatePropertyValue`
   apontando para o point deletado nunca migram para `new_estimate_id` — ficam referenciando
   uma linha soft-deletada.
2. **Perf**: quando o loop roda, re-executa um `UPDATE` de tabela inteira uma vez por issue.

O branch `else` (deletar sem reatribuir) está correto — o nulling está fora do loop nas
linhas 467-470.

**Por que importa agora**: depois da migração para múltiplos sistemas de estimate, a maior
parte dos valores vive em `IssueEstimatePropertyValue`, não em `Issue.estimate_point`. Então
isso atinge qualquer deleção de point num sistema de estimate que não seja o default.

**Comportamento esperado**: os dois updates fora do loop, executados uma vez.

---

## FINDING 4 — Settings page fica stale após ativar/deletar um estimate (MÉDIA)

**Arquivos**:
- `apps/web/core/components/estimates/root.tsx:68-96` (`handleToggleEstimateActive`, `handleSetDefaultEstimate`)
- `apps/web/core/components/estimates/properties/root.tsx:41-43`
- `apps/web/core/store/estimates/project-estimate.store.ts:502-513` (`deleteEstimate`)

**Comportamento atual**, dois casos espelhados:

a) Ao ativar um estimate, o backend auto-cria uma `EstimateProperty` default para o sistema
   recém-ativado (`_ensure_estimate_default_property`, `estimate/base.py:72-88`). O frontend
   não refaz fetch das properties — `properties/root.tsx` busca só uma vez no mount. A linha
   do novo sistema não aparece no painel de Properties nem nos dropdowns de work item até dar
   reload na página.

b) `deleteEstimate` no store remove o estimate mas deixa as properties dele em
   `estimateProperties`. O backend soft-deleta essas properties
   (`estimate/base.py:354-356`), mas o store local continua renderizando linhas de um sistema
   que não existe mais.

**Comportamento esperado**: as duas operações refletem imediatamente no painel de Properties
sem reload.

---

## FINDING 5 — Botão de deletar aparece em properties system-default e sempre falha (BAIXA/UX)

**Arquivo**: `apps/web/core/components/estimates/properties/root.tsx:141`

**Comportamento atual**: o ícone de lixeira só é escondido quando `property.kpi_role` está
setado. Mas o backend também rejeita deletar linhas com `is_estimate_default`
(`estimate/property.py:108-112`, HTTP 400). Clicar na lixeira numa linha de sistema sempre
produz o toast genérico "Could not delete the estimate property."

O `CustomSelect` de estimate logo ao lado já desabilita em `is_estimate_default`
(linha 124) — o botão de delete deveria seguir a mesma regra.

**Comportamento esperado**: lixeira escondida (ou desabilitada) quando `is_estimate_default`
for true, igual ao select.

---

## FINDING 6 — Property nova é criada silenciosamente no primeiro estimate da lista (BAIXA/UX)

**Arquivo**: `apps/web/core/components/estimates/properties/root.tsx:76-89`

**Comportamento atual**: `handleCreate` usa `estimateOptions[0]`, que é o estimate mais
recente (`estimateIdsByProjectId` ordena por `created_at` desc). Não há picker de estimate no
formulário de criação. O usuário precisa perceber e re-apontar depois.

**Comportamento esperado**: o formulário de criação deixa escolher a qual sistema de estimate
a property se liga.

---

## FINDING 7 — Código morto: `handleEstimate` (BAIXA)

**Arquivo**: `apps/web/core/components/issues/issue-layouts/properties/all-properties.tsx:161-163`

Definido, nunca referenciado. Sobra da migração para valores por-property (o caminho novo é
`handleEstimateChange`, linha 183). Remover.

---

## FINDING 8 — MEMBER consegue mutar estimates apesar da UI ser admin-only (MÉDIA — decisão do dev)

**Arquivos**: `apps/api/plane/app/permissions/project.py:85-115` (`ProjectEntityPermission`),
usado por `BulkEstimatePointEndpoint`, `EstimatePropertyListCreateEndpoint`,
`EstimatePropertyDetailEndpoint`.

**Comportamento atual**: `ProjectEntityPermission` concede escrita a ADMIN **e** MEMBER. Todo
o gating `isAdmin` na settings page de estimates é cosmético — um member pode criar,
re-apontar ou deletar sistemas de estimate direto pela API.

**Ressalva importante**: isso replica o tratamento upstream do Plane para
`BulkEstimatePointEndpoint` — é pré-existente, não foi introduzido por este fork. Apertar para
admin-only é uma **mudança de comportamento**, não um bug fix puro.

**Ação sugerida**: o Plan deve tratar isso como decisão consciente. Se apertar, apertar tanto
os endpoints de estimate quanto os de estimate property, e conferir se algum fluxo existente
depende de member escrevendo. Se não apertar, registrar em
`.claude/memories/repo/issues-not-fixed.md` como DEFERRED com essa justificativa.

---

## Comportamento Esperado (resumo)

Views/listas carregam estimates com 1 request em vez de N; estimates aparecem em workspace
views; deleção de estimate point migra os valores corretamente; settings page reflete
ativação/deleção sem reload; controles de UI batem com o que o backend aceita.

## Passos para Reproduzir

1. **F1**: abrir qualquer projeto com estimates ativos → página de Views (ou list/kanban/
   spreadsheet) com muitos work items → observar aba Network: 1 `GET .../estimate-properties/`
   por linha.
2. **F2**: criar uma workspace view global (`/[slug]/workspace-views/[id]`) → layout list ou
   kanban → estimates não aparecem; trocar para spreadsheet → aparecem.
3. **F3**: num projeto com 2+ sistemas de estimate, setar valores de property num sistema NÃO
   default, depois deletar um estimate point desse sistema passando `new_estimate_id` →
   os `IssueEstimatePropertyValue` continuam apontando o point deletado.
4. **F4a**: settings → estimates → ativar um estimate inativo → painel "Estimate properties"
   abaixo não ganha a linha do novo sistema até dar F5.
5. **F4b**: deletar um estimate → suas properties continuam listadas até dar F5.
6. **F5**: settings → estimates → clicar na lixeira de uma linha system-default → toast de erro.

## Ambiente

- Branch: `feat/email` (base: `stable-1.3.1`)
- Backend: `apps/api` (Django + DRF)
- Frontend: `apps/web` (React Router + MobX)
- Local (o dev tem containers Docker e script de sync de DB de prod disponíveis)

## Informações Adicionais

- Stack trace: nenhum — todos os achados vieram de leitura de código, não de um crash relatado.
- Logs: nenhum.
- Screenshots: nenhum.
- **Nenhum achado foi reproduzido em runtime.** F1, F2, F4 e F5 são observáveis no browser e
  valem uma reprodução (Stage A2 / UX) antes ou depois do fix. F3 é mais fácil de provar com
  teste de backend do que no browser.
- **Gap conhecido de ambiente** (herdado de `estimates-multi-active-gotchas.md`): sessões
  anteriores não tinham deps Python instaladas, então a suíte pytest nunca rodou de verdade —
  só `ast.parse`. Confirmar se dá para rodar
  `pytest apps/api/plane/tests/contract/app/test_estimates_app.py` nesta sessão antes de
  confiar em qualquer "verde" do backend.
- Testes existentes relevantes: `apps/api/plane/tests/contract/app/test_estimates_app.py`,
  `test_estimate_property_values.py`, `apps/api/plane/tests/unit/serializers/test_estimate_serializer.py`.
