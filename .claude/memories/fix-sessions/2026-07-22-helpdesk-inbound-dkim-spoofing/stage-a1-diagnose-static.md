# Stage A1: Diagnose Static
- Bug: SR-002 — inbound webhook deriva identidade só do campo `from`, permitindo forjar agente
- Root cause: `inbound.py:134` + ramo de agente `:198-207` — `from_email` forjável usado como identidade provada; nenhuma verificação DKIM/SPF existe no repo (grep = 0)
- Serviços afetados: `apps/api` (Django/DRF) + `apps/web` (aba Email logs, se AD-3 entrar em escopo)
- UX Diagnose: NÃO
- VPS Diagnose: NÃO (opcional: capturar payload SendGrid real para validar formato de `dkim`/`SPF`)
- Próximo: Stage B — Plan

## Confirmações
- `_extract_header` inútil para `dkim`/`SPF`: campos irmãos do multipart, não conteúdo de `headers` — CONFIRMADO
- `first_responded_at` (`:295`) guarda `actor is not None` → não atribuir actor já fecha o SLA — CONFIRMADO, sem correção separada
- `store_inbound_attachment` (`:254`) roda após o gate `:213`; agente não verificado mantém `is_authorized=True` e ainda anexa — EM ABERTO

## Achados adicionais
- AD-1: comentário órfão (`actor=None` + `customer=None`) tensiona a Decisão 2
- AD-2: `fields = "__all__"` em serializer compartilhado com endpoint público vaza campo novo ao cliente
- AD-3: tabela de Email logs tem colunas fixas — persistir não basta para cumprir a Decisão 3
- AD-4: correção factual — não há relay outbound a partir do inbound; vetor real é o download no portal público

## Arquivos analisados
- apps/api/plane/app/views/helpdesk/inbound.py
- apps/api/plane/app/helpdesk/inbound_security.py
- apps/api/plane/app/views/helpdesk/portal.py
- apps/api/plane/app/views/helpdesk/comment.py
- apps/api/plane/app/serializers/helpdesk.py
- apps/api/plane/db/models/helpdesk.py
- apps/api/plane/app/helpdesk/attachments.py
- apps/api/plane/bgtasks/helpdesk_email_task.py
- apps/api/plane/app/urls/helpdesk.py
- apps/api/plane/tests/unit/helpdesk/test_inbound_email.py
- apps/web/app/(all)/[workspaceSlug]/(projects)/helpdesk/settings/page.tsx
