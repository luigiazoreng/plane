# Session Info
Name: 2026-07-22-helpdesk-inbound-dkim-spoofing
Bug: SR-002 — webhook inbound não valida autenticidade do remetente (DKIM/SPF), permitindo forjar `From:` de um agente e criar comentários com `actor` real
Started: 2026-07-22
Status: IN_PROGRESS

## Escopo
Fechar **apenas** o SR-002. Os outros 15 achados do Stage D da sessão anterior
(`2026-07-21-helpdesk-email-seguranca`) ficam FORA — aquela sessão continua pausada
com eles em aberto.

## Decisões já tomadas com o dev (não re-litigar)

1. **Validação assimétrica.** Bloquear tudo que falha DKIM/SPF quebraria resposta legítima
   de cliente. A escalada mora só no ramo de agente, então:
   - Atribuição de **agente** (`actor`) exige verificação de autenticidade.
   - Resposta de **cliente** passa normalmente, verificada ou não.
2. **Sem sinalização na UI da conversa.** O dev decidiu explicitamente que NÃO é necessário
   marcar o comentário como "não verificado" para o agente ver na thread.
3. **Registrar apenas nos logs de email.** O resultado da verificação vai para a aba
   "Email logs" (`HelpdeskPortalEmailLogsEndpoint`), não para a bolha do comentário.

## Branch
feat/email (base: stable-1.3.1)

## Contexto relacionado
- Sessão anterior (PAUSADA, 15 achados ainda abertos):
  `.claude/memories/fix-sessions/2026-07-21-helpdesk-email-seguranca/findings.md`
- A feature de anexos (Fase 17 em `HELPDESK_FEATURE.md`) foi implementada DEPOIS do SR-002
  ser descoberto e **aumentou a superfície dele** — ver bug-report.
