# Issues Not Fixed

Problemas reais encontrados durante revisão mas adiados por decisão arquitetural, escopo ou risco.
NUNCA remover entradas. NUNCA duplicar. Apenas append ou update pontual.

---

## 2026-07-21 SR-F8 — MEMBER pode mutar estimates e estimate properties (ProjectEntityPermission)
**File**: `apps/api/plane/app/permissions/project.py:109-115` (`ProjectEntityPermission`)
**Problem**: `ProjectEntityPermission` concede escrita a `role__in=[ROLE.ADMIN, ROLE.MEMBER]`. Todo o gating `isAdmin` da settings page de estimates é cosmético — um member pode criar, re-apontar ou deletar sistemas de estimate direto pela API. Nesta fork, `EstimateProperty.kpi_role` determina qual estimate lastreia Difficulty/Repetitive, que alimentam `engine.calcular()` — um member re-apontar essa property altera nota de KPI de terceiros, privilégio administrativo (diferença material frente ao upstream, onde estimate é só rótulo).

Superfície completa verificada (8 endpoints em 2 arquivos):

*App API — `apps/api/plane/app/views/estimate/`:*
- `BulkEstimatePointEndpoint` — `base.py:154` (`permission_classes` em `:155` = `[ProjectEntityPermission]`) — ação futura: sobrescrever `create`/`partial_update`/`destroy` com `@allow_permission([ROLE.ADMIN])`
- `EstimatePointEndpoint` — `base.py:362` (`@allow_permission([ADMIN, MEMBER])` em `:363`, `:386`, `:404`) — trocar os 3 para `[ROLE.ADMIN]`
- `EstimatePropertyListCreateEndpoint` — `property.py:26` (`permission_classes` em `:30`) — sobrescrever só `create` (`:43`)
- `EstimatePropertyDetailEndpoint` — `property.py:64` (`permission_classes` em `:67`) — sobrescrever `partial_update` (`:74`) e `destroy` (`:104`)
- `EstimatePropertyKpiRoleEndpoint` — `property.py:122` (decorator em `:127`, `@allow_permission([ADMIN, MEMBER])`) — trocar para `[ROLE.ADMIN]`, o mais sensível dos cinco
- `ProjectEstimatePointEndpoint` — `base.py:136` (decorator em `:137`, GET-only, `[ADMIN, MEMBER]`) — NÃO TOCAR, é leitura
- `IssueEstimatePropertyValueListEndpoint` — `property.py:161` (decorator em `:166`, `[ADMIN, MEMBER, GUEST]`) — NÃO TOCAR, leitura
- `IssueEstimatePropertyValueEndpoint.put` — `property.py:175` (decorator em `:178`, `[ADMIN, MEMBER]`) — NÃO APERTAR, é o member setando o valor de estimate da própria work item, fluxo principal da feature

*Public API — `apps/api/plane/api/views/estimate.py` (roteada em `apps/api/plane/api/urls/estimate.py`) — superfície adicional, também com escrita liberada a ADMIN+MEMBER via `ProjectEntityPermission`:*
- `ProjectEstimateAPIEndpoint` — `:30` (`permission_classes` em `:31`) — `post:47`, `patch:106`, `delete:129`
- `EstimatePointListCreateAPIEndpoint` — `:137` (`permission_classes` em `:140`) — `post:196`
- `EstimatePointDetailAPIEndpoint` — `:234` (`permission_classes` em `:237`) — `patch:264`, `delete:286`

Apertar só o app-API deixa qualquer member criar/editar/deletar estimates e points via a API pública com um token — anulando o fix por completo.

**Why deferred**:
1. Mudança de comportamento, não bug — é o único destes findings nessa categoria, e é pré-existente ao fork (paridade com upstream do Plane).
2. Risco do MCP server: `apps/api/plane/api/views/estimate.py` é consumida pelo MCP server `plane-local` que o dev usa ativamente (`create_project_estimate`, `create_project_estimate_points`, `update_project_estimate_point`, `delete_project_estimate_point`, `link_estimate_to_project`). Se o token do MCP for de member, apertar quebra a ferramenta. Verificar o role do token é pré-requisito de qualquer implementação futura.

**Ressalva de implementação para quem retomar**: `ProjectEntityPermission` concede LEITURA a todos os roles via `SAFE_METHODS` (`permissions/project.py:101-107`). Trocar a classe inteira por uma admin-only quebraria a leitura para members e guests (quebraria o dropdown de estimate no work item para todo mundo que não é admin) — este é o erro mais provável na implementação. A técnica correta é sobrescrever SÓ os métodos de escrita (manter `permission_classes` para leitura + `@allow_permission([ROLE.ADMIN])` nos métodos de escrita) — tem precedente no próprio arquivo: `EstimatePointEndpoint` já é um `BaseViewSet` usando `@allow_permission` por método.

**Found in**: 2026-07-20-estimates-review-findings
**Sources**: SR-F8
**Last updated**: 2026-07-21

---

## 2026-07-21 SR-F3-orphans — IssueEstimatePropertyValue órfãos apontando para EstimatePoint soft-deletado
**File**: `apps/api/plane/app/views/estimate/base.py:439-442` (fonte 1, CORRIGIDA nesta sessão — ver fix-progress.md) e `apps/api/plane/api/views/estimate.py:286-291` (fonte 2, NÃO corrigida)
**Problem**: Existem (e podem continuar sendo criados) `IssueEstimatePropertyValue` cujo `estimate_point` foi soft-deletado. Eles NÃO são inertes: `KpiPropertyResolver.__init__` (`apps/api/plane/app/views/kpi/issue.py:47-50`) faz `.filter(..., estimate_point__isnull=False).select_related("estimate_point")` — o JOIN não filtra `deleted_at__isnull=True` porque o `SoftDeletionManager` (`db/mixins.py:56-58`) filtra o queryset base do modelo consultado, não os joins de FK. Logo os órfãos resolvem normalmente e continuam alimentando `engine.calcular()` — o estrago em produção é uma nota calculada a partir de um estimate point que o admin já deletou.

Esta sessão CORRIGIU a fonte 1 (`app/views/estimate/base.py:427-442`, o bug de indentação onde `issues.update(...)` e o update de `IssueEstimatePropertyValue` estavam dentro do `for issue in issues:` — agora desindentados, ver stage-c-fix.md / fix-progress.md). Isso impede NOVOS órfãos por esse caminho a partir de agora. Mas:

**Why deferred** — três razões independentes (nenhuma delas foi resolvida por este fix pass):
1. Anular não é neutro e o efeito é imprevisível. Ao anular, o value sai do filtro `estimate_point__isnull=False`, `points_for` devolve `None`, e `_difficulty_lookup_key` (`kpi/issue.py`) cai no fallback para `issue.estimate_point_id` — a nota não vai a zero nem necessariamente cai, passa a usar o estimate NATIVO da issue, que pode dar contribuição maior, menor ou igual, issue a issue. Efeito não-monotônico, não previsível sem rodar. Mexe em nota de KPI de pessoas reais.
2. Migrar (em vez de anular) é inviável para os órfãos HISTÓRICOS já existentes: por construção, os órfãos que o bug da fonte 1 produzia são exatamente aqueles em que nenhuma `Issue` usava a coluna legada — não há `Issue.estimate_point` migrada de onde inferir o `new_estimate_id`, e o `issue_activity.delay` (único registro do DELETE original) também só era emitido dentro do `for issue in issues`, que não rodava. Nada no banco guarda o `new_estimate_id` daquele DELETE histórico.
3. Existe uma SEGUNDA fonte que continua sangrando MESMO DEPOIS deste fix: `EstimatePointDetailAPIEndpoint.delete` (`apps/api/plane/api/views/estimate.py:286-291`) — o delete de point da API PÚBLICA — faz apenas `estimate_point.delete()` sem `new_estimate_id`, sem nulling síncrono de `Issue.estimate_point` nem de `IssueEstimatePropertyValue`. Delega 100% ao cascade assíncrono `soft_delete_related_objects` (`bgtasks/deletion_task.py:18`), que só cobre a FK se o Celery estiver de pé — precisamente a dependência que o fork removeu do caminho do app-API ("Step B9", `app/views/estimate/base.py:461-470`). Esta fonte NÃO foi tocada por esta sessão (fora do escopo aprovado) e continua gerando órfãos novos em qualquer janela de Celery fora do ar.

**Se for retomado no futuro**, a ordem correta é: (1) estender o nulling síncrono ao delete público (`api/views/estimate.py:286`, mesma técnica já aplicada em `app/views/estimate/base.py`), (2) só então avaliar reparo dos órfãos históricos. Dimensionar com dupla contagem, não simples:
```sql
-- órfãos totais
SELECT COUNT(*) FROM issue_estimate_property_values v
  JOIN estimate_points p ON v.estimate_point_id = p.id
 WHERE p.deleted_at IS NOT NULL;
-- quantos desses trocariam de valor pelo fallback (issue tem estimate nativo)
SELECT COUNT(*) FROM issue_estimate_property_values v
  JOIN estimate_points p ON v.estimate_point_id = p.id
  JOIN issues i ON v.issue_id = i.id
 WHERE p.deleted_at IS NOT NULL AND i.estimate_point_id IS NOT NULL;
```
Decidir também se restringe a values de properties com `kpi_role IS NOT NULL` ou se pega todas. Próxima migration livre: `0152` (última é `0151_backfill_estimate_default_properties.py`).

**Found in**: 2026-07-20-estimates-review-findings
**Sources**: SR-F3-orphans
**Last updated**: 2026-07-21

---

## 2026-07-21 RC-8-residual — Inbound grava email_status=SENT em vez de RECEIVED
**File**: `apps/api/plane/app/views/helpdesk/inbound.py:156`
**Problem**: O comentário criado pelo webhook inbound é gravado com `email_status=SENT`, que semanticamente significa "nós enviamos este email" — mas foi um email *recebido*. Consequência concreta: `helpdesk_email_task.py:106-110` seleciona o último comentário com `email_status=SENT` e `email_message_id` não nulo para montar o `In-Reply-To`/`References` do próximo outbound. Com RC-8 corrigido, um comentário inbound sem `Message-ID` real passa a ter uma chave sintética `@synthetic.inbound`, que pode acabar sendo usada como `In-Reply-To` de um email real — o threading no cliente do cliente degrada. Falta um valor `RECEIVED` no enum `EmailDeliveryStatus`.
**Why deferred**: Requer novo valor no enum `EmailDeliveryStatus` + migration de dados nas linhas existentes + revisão de todos os consumidores que filtram por SENT. Fora do escopo RC-1..RC-9.
**Found in**: 2026-07-21-helpdesk-email-seguranca
**Sources**: fix-plan.md (seção "Fora do escopo"), risco residual do RC-8
**Last updated**: 2026-07-21

---

## 2026-07-21 SMTP-plaintext — smtp_password do portal em texto plano no banco
**File**: `apps/api/plane/db/models/helpdesk.py:56`
**Problem**: `smtp_password = models.CharField(max_length=255, null=True, blank=True)` guarda a senha SMTP do portal sem criptografia. O serializer marca o campo como `write_only` (não vaza na API), mas qualquer acesso ao banco — dump, réplica, backup, engenheiro com credencial de leitura — expõe as credenciais SMTP de todos os portais. Contrasta diretamente com o `HELPDESK_INBOUND_WEBHOOK_SECRET` adicionado nesta sessão, registrado com `is_encrypted=True`.
**Why deferred**: Requer decisão sobre o mecanismo de criptografia (reusar `plane.license.utils.encryption` ou outro), migration de dados para as senhas já gravadas, e rotação coordenada. Fora do escopo RC-1..RC-9.
**Found in**: 2026-07-21-helpdesk-email-seguranca
**Sources**: fix-plan.md (seção "Fora do escopo")
**Last updated**: 2026-07-21

---

## 2026-07-21 R3 — Descartes do inbound precisam de métrica dedicada, não só log
**File**: `apps/api/plane/app/views/helpdesk/inbound.py:_discard`
**Problem**: Com RC-3/RC-7 corrigidos, descartes de negócio (`thread_not_found`, `unauthorized_sender`, `missing_sender`, `empty_body`, `duplicate`) passaram de 4xx para 200. Isso elimina o loop de retry do SendGrid, mas também remove esses eventos das métricas de erro do provedor. A mitigação atual é `logger.warning("inbound discarded", extra={"detail": ...})` com campo estruturado. O caso mais grave é `thread_not_found`: um cliente respondendo a uma thread soft-deletada desaparece sem rastro para o agente — ninguém é notificado. Um contador por `detail` com alerta em cima permitiria detectar um pico de descartes.
**Why deferred**: Requer decisão de produto sobre a stack de métricas/alerting. Fora do escopo RC-1..RC-9.
**Found in**: 2026-07-21-helpdesk-email-seguranca
**Sources**: fix-plan.md (R3), plan-review.md (B2-#9)
**Last updated**: 2026-07-21

---

## 2026-07-21 R7 — UI de settings do portal permite marcar TLS e SSL juntos
**File**: `apps/web` — UI de settings SMTP do portal de helpdesk
**Problem**: A tela de configuração SMTP do portal expõe `smtp_use_tls` e `smtp_use_ssl` como toggles independentes. Após esta sessão, o backend rejeita a combinação em três camadas (serializer 400, CheckConstraint, normalização na task), mas o frontend não sabe disso: o usuário consegue marcar os dois e recebe um 400 provavelmente sem tratamento específico, exibindo erro genérico ou nenhum. Deveriam ser mutuamente exclusivos na própria UI (radio em vez de dois checkboxes).
**Why deferred**: Mudança de frontend; esta sessão é backend-only (`Serviços para build+test: somente apps/api`). Fora do escopo RC-1..RC-9.
**Found in**: 2026-07-21-helpdesk-email-seguranca
**Sources**: fix-plan.md (R7)
**Last updated**: 2026-07-21

---

## 2026-07-21 R10 — Segredo do webhook inbound trafega na query string quando o provedor não envia header
**File**: `apps/api/plane/app/helpdesk/inbound_security.py:INBOUND_SECRET_QUERY_PARAM`
**Problem**: O Inbound Parse do SendGrid não permite headers customizados nem assina o payload (o ECDSA `X-Twilio-Email-Event-Webhook-Signature` pertence ao Event Webhook, não ao Inbound Parse). Por isso o segredo é aceito também via `?token=`. A superfície da aplicação foi fechada — `plane/middleware/logger.py` passou a redigir `token=` antes de logar `get_full_path()` — mas o access log de um Nginx/proxy à frente da API registra a query string por padrão, fora do controle deste código. Mitigação de operação: preferir o header quando o provedor permitir, configurar o proxy para não logar a query string dessa rota, e considerar o log do proxy ao rotacionar o segredo.
**Why deferred**: Limitação do provedor + configuração de infraestrutura, não de código da aplicação. A rotação é possível sem migration (atualizar a config + a URL no SendGrid).
**Found in**: 2026-07-21-helpdesk-email-seguranca
**Sources**: fix-plan.md (R10, Bloco 1d), plan-review.md (#7)
**Last updated**: 2026-07-21

---

## 2026-07-21 Baseline-pytest — 25 testes pytest pré-existentes falhando na branch feat/email
**File**: `apps/api/plane/tests/` — 25 testes pytest falhando em `feat/email`
**Problem**: `pytest plane/tests` na branch `feat/email` tem 25 falhas que **não** foram introduzidas por esta sessão (verificado por baseline contra `git archive HEAD`, listas de FAILED idênticas). Concentradas em: `contract/api/test_cycles.py` (5), `contract/app/test_authentication.py` (7, fluxo de magic link), `contract/app/test_helpdesk.py` (5), `contract/app/test_kpi.py` (2), `contract/app/test_api_token.py` (1), `unit/bg_tasks/` (2), `unit/utils/test_url.py` (3). Cinco delas são do próprio helpdesk. Enquanto essas falhas forem o normal aceito, uma regressão nova nessas áreas passa despercebida.
**Why deferred**: Pré-existente e fora do escopo RC-1..RC-9; diagnosticar 25 falhas em 7 áreas distintas é uma investigação própria.
**Found in**: 2026-07-21-helpdesk-email-seguranca
**Sources**: Stage C — verificação de regressão
**Last updated**: 2026-07-21

---

## 2026-07-22 SR-002-D8 — PublicHelpdeskCommentEndpoint cria comentário com customer=None quando o token é inválido
**File**: `apps/api/plane/app/views/helpdesk/comment.py:177-183`
**Problem**: `PublicHelpdeskCommentEndpoint.post` faz `customer = self._get_customer_from_token(request)` e cria o comentário com esse valor **sem verificar se é `None`**. Token ausente, malformado ou expirado → comentário legítimo do cliente, postado por ele mesmo no portal, gravado com `customer=None`. Depois do SR-002 esse comentário cai no estado `unattributed` do `authorKind` e o cliente vê a própria mensagem recém-enviada rotulada como `"Participant"` em vez de `"You"`. É a fonte de falso positivo **mais comum** do rótulo neutro — mais comum que a do inbound (`inbound.py:190-192`).
**Why deferred**: Fechar exige rejeitar POST do portal sem token válido — mudança de contrato de API, com impacto próprio sobre clientes com sessão expirada. Fora do escopo estrito do SR-002, que trata de autenticidade de remetente de email. O rótulo `"Participant"` foi escolhido justamente para ser inofensivo enquanto isto não for fechado.
**Found in**: 2026-07-22-helpdesk-inbound-dkim-spoofing
**Sources**: fix-plan.md (D8), plan-review.md
**Last updated**: 2026-07-22
