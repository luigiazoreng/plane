# Stage B2: Review Plan
- Decisão: **CHANGES_REQUESTED**
- Bloqueadores: 3
- Importantes: 5
- Sugestões: 5

## Blockers
- **B1** — Coalescer: cache não é derivável de `issueEstimatePropertyValues` (issue sem value não deixa chave → refetch eterno). Precisa de `resolvedIssueIds` com estado `in-flight`/`done`.
- **B2** — F8 ignora `apps/api/plane/api/views/estimate.py` (3 endpoints, 6 métodos de escrita, mesma `ProjectEntityPermission`). É a porta lateral que o próprio plano proíbe; é também a superfície do MCP server.
- **B3** — F8 cita `BulkEstimatePointEndpoint` em `base.py:137`; l.136 é `ProjectEstimatePointEndpoint` (GET). Seguir o plano apertaria um endpoint de leitura — o erro que o plano avisa ser o mais provável.

## Importantes
- **I1** — Impacto do F3-repair mal previsto: anular não derruba notas, cai no fallback `issue.estimate_point` (`kpi/issue.py`). Efeito não-monotônico. (Núcleo do achado — `select_related` atravessa soft-delete — CONFIRMADO.)
- **I2** — 2ª fonte de órfãos: `api/views/estimate.py:286` deleta point sem nulling síncrono. "F3 para o sangramento" é falso.
- **I3** — F1 não trata o effect incondicional (`all-properties.tsx:174-177`), sub-achado do bug-report que sumiu do plano.
- **I4** — F2 fica BLOCKED transitivamente (Wave 3 ← 1b ← Wave 0) sem necessidade: F2 usa `estimate-properties/`, que já existe. Quebrar Wave 3 em 3a (F2, livre) / 3b (bulk, gated). Bloqueados reais: 1b, 3, 4, 5, 6 — não "1b, 4, 6".
- **I5** — Invalidação não especificada: faltam 4 mutadores de property no store (`:537`, `:553`, `:559`, `:570`).

## Sugestões
- **S1** — Playwright: não há config nem suíte E2E no repo; MCP + `gem-browser-tester` é a única via e já é a do plano. Ressalva: não deixa regression guard.
- **S2** — 3ª via do F3-repair (migrar em vez de anular) é inviável: `new_estimate_id` não é recuperável do banco.
- **S3** — Service existe só em `apps/web/core/services/`; o build de `packages/services` não se aplica.
- **S4** — Próxima migration confirmada: `0152`.
- **S5** — F3: assertar que `issue_activity.delay` continua 1x por issue após a desindentação.

## Validação dos pontos de escrutínio do prompt
1. Bulk project-scoped **vs** serializer embed → escolha **mantida**; O(projetos) em vez de O(linhas); argumento de permissão real (histórico de IDOR na feature).
2. Coalescer por microtask → mecanismo **não implementável como escrito** (B1); invalidação incompleta (I5); cancelamento em unmount desnecessário.
3. Ausência de infra de teste no frontend → **não há alternativa no escopo** (S1); plano correto, ressalva a acrescentar.
4. Migration F3 → análise do `select_related` **confirmada**; previsão de impacto **incorreta** (I1); 3ª via inviável (S2); leak não estancado (I2).
5. F8 ADMIN-only → estratégia (sobrescrever só escrita) **validada e com precedente no arquivo**; alvos **errados** (B3); escopo **incompleto** (B2).
6. Waves → F2 **está** bloqueado e o plano não diz; e **não precisaria estar** (I4).

## Veredito
Nenhuma mudança de arquitetura necessária. Os 3 blockers são de especificação, com correção pontual descrita em `plan-review.md`. Pipeline deve voltar ao **Fixer - Plan** para incorporar antes do Stage C.
</content>
</invoke>

---

# Rodada 2 — Re-revisão (2026-07-20)
- Decisão: **APPROVED** (com 1 condição obrigatória: C1)
- Blockers rodada 1: **3/3 FECHADOS**
- Problemas novos: **1** (C1, importante, correção de 1 linha)
- Nits: 1 (N1)

## Blockers — verificação de fechamento
- **B1 ✅** — spec implementável. Registro próprio (`issueValuesFetchState`), não derivado. `done` para ids sem value fecha o cache-miss-eterno. `force` NÃO vaza para os 3 sites de lista: grep confirma **7** call sites e a tabela do plano acerta os 7 com linha correta. Não há 5º consumidor escondido (`inbox/create-modal` usa computeds — confirmado ausente do grep).
- **B2 ✅** — escopo removido (DECISÃO 1); superfície completa (8 endpoints, 2 arquivos) + risco do MCP + ressalva "não trocar a classe" preservados em DEFERRED-1.
- **B3 ✅** — varredura real. Spot-check das refs de execução: **9/9 corretas** no store (`465/502/520/531/541/557/563/585/597`) + `urls/estimate.py:48-52` confirmada.

## Outras verificações
- **Wave 3a livre do bulk ✅** — `ensureProjectEstimateProperties` → `getProjectEstimateProperties` (`store:520`) → rota `estimate-properties/` (`urls/estimate.py:48-52`), já existente. O bulk é de *values*, o F2 precisa de *properties*.
- **Decisões do dev 3/3 aplicadas sem resíduo** — F8 fora de toda tabela executável; Wave 5 antiga (migration) removida, `0152` só como nota no DEFERRED-2; nenhum wave BLOCKED; critério de frontend corretamente mantido.
- **R11 contido ✅** — "Wave 5 é escrita, NÃO código" aparece em 3 lugares distintos.
- **`issues-not-fixed.md` ✅** — confirmado inexistente (`repo/` tem 3 outros arquivos); plano manda criar com o header do protocolo + checagem de duplicata + formato exato.
  - Nota para o Fix: incluir `**Last updated**: 2026-07-20` nas 3 entradas (o protocolo exige; o plano trouxe `**Sources**` mas omitiu esse campo).

## C1 — CONDIÇÃO OBRIGATÓRIA (problema novo)
**A invalidação não alcança `issueValuesFetchState` — o guard do I3 reintroduz o F4 nas listas.**

O guard do I3 marca issues como `"done"` **sem nunca ter buscado nada** quando o projeto tem zero properties. A tabela do I5 invalida só `projectPropertiesFetchState`. Sequência que quebra: lista aberta em projeto sem estimate (issues viram `done`) → admin ativa um estimate → volta à lista → colunas renderizam mas **0 requests de values** → dropdowns vazios até hard reload. É o F4 reaparecendo nas listas.

**Correção (1 linha, sem mudança de design)** — os 6 mutadores limpam **os dois** registros:
```ts
runInAction(() => { this.issueValuesFetchState = {}; });
```
Limpeza total, não seletiva: não há índice reverso projectId→issueIds e criar um é over-engineering. Custo = no máximo 1 batch bulk na próxima lista; ações de settings, admin-only. Mesma justificativa "regra simples > regra fina" que o plano já usa para os 4 write-through.

**Aplicar antes de a Wave 3b ser GREEN.** Não exige nova rodada de Plan. Roteiro de browser da 3b ganha: *ativar estimate num projeto que não tinha → voltar à lista → dropdowns aparecem com valores, sem reload.*

## N1 — nit
R1 e a tabela de arquivos dizem "8 call sites"; são **7** (3 lista + 4 issue única). Número herdado do root-cause, que contava `inbox/create-modal` (usa computeds). A tabela do `force` — que é o que o Fix executa — está correta.

## Veredito
**APPROVED.** Prosseguir para Stage C — Fix, aplicando C1.
