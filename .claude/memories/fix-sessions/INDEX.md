# Fix Sessions Index

Histórico de todas as sessões do pipeline de fix.
Cada linha = uma execução completa (ou parcial) da pipeline.

| Data | Slug | Bug | Status |
|------|------|-----|--------|
| 2026-07-20 | 2026-07-20-estimates-review-findings | Estimates — 8 achados de revisão (N+1 de requests, estimates ausentes em workspace-views, órfãos ao deletar estimate point, UI stale, + menores) | COMPLETO |
| 2026-07-21 | 2026-07-21-helpdesk-email-seguranca | Helpdesk Email — 5 achados Críticos/Altos (webhook inbound sem autenticação, vazamento de notas internas, falta de idempotência, TLS/SSL mutuamente exclusivos, índice faltando) | PAUSADA (Stage D; 15 findings OPEN) |
| 2026-07-22 | 2026-07-22-helpdesk-inbound-dkim-spoofing | SR-002 — inbound não valida DKIM/SPF: `From:` forjado cria comentário com `actor` de agente real | IN_PROGRESS |
