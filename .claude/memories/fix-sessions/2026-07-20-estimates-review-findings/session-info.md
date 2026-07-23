# Session Info
Name: 2026-07-20-estimates-review-findings
Bug: Estimates feature — 8 achados de revisão (N+1 de requests nas listas de work items, estimates invisíveis em workspace-views, bug de reatribuição ao deletar estimate point, UI stale no settings, e correções menores)
Started: 2026-07-20
Status: COMPLETO
Finished: 2026-07-20

## Escopo
Contexto do dev: `all` — corrigir TODOS os achados da revisão.

## Origem
Revisão manual (read-only) da feature de estimates feita em 2026-07-20 antes desta sessão,
cobrindo backend (models/serializers/views/urls), frontend (store, services, settings page)
e a renderização de estimates nos issue-layouts que alimentam a página de Views.

## Contexto prévio relevante
- `.claude/memories/repo/estimates-multi-active-gotchas.md`
- `.claude/memories/repo/estimate-properties-dynamic-kpi.md`
- Sessão de feature anterior: `.claude/memories/feat-sessions/2026-07-15-multi-select-estimates-per-system/`
