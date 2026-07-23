# Stage B2: Review Plan — re-review (rodada 2)
- Decisão: **APPROVED** (com 2 condições de implementação vinculantes)
- Bloqueadores: 0
- Condições vinculantes: 2
- Sugestões: 2
- Correções da rodada 1: 10/10 verificadas como corretas

## Condições vinculantes para o Stage C (Fix)
**A — condition do índice parcial.** Remover `& ~Q(email_message_id="")` da `UniqueConstraint`,
deixando `Q(deleted_at__isnull=True) & Q(email_message_id__isnull=False)`. Motivo: o projeto usa
`psycopg==3.3.0` (binding no servidor + prepared statements automáticos); o Postgres não consegue
provar `email_message_id <> ''` a partir de `email_message_id = $1` num generic plan, então o índice
parcial deixaria de ser elegível e a query do inbound cairia em seq scan — RC-5 reintroduzido
silenciosamente sob repetição. A cláusula é redundante: o Bloco 3b já normaliza `""` → `None`.
Se a invariante for desejada, usar um `CheckConstraint` separado.

**B — complemento do T11.** Remover a verificação do 3º `RunPython` do T11: as migrations rodam na
criação do banco de teste, que está vazio, então não há linha legada para transformar — o teste
passaria vazio, dando falsa confiança. O núcleo do T11 (PATCH em comentário legado permanece
editável, com a linha criada via ORM no próprio teste) é válido e suficiente. A verificação do
`RunPython` fica com a SQL de pré-deploy, que já a contempla.

## Sugestões
- **C**: fixar o seam do mock do T9b em `plane.bgtasks.helpdesk_email_task.get_email_configuration`
  (import no topo do módulo, `helpdesk_email_task.py:16`).
- **D**: na SQL de pré-deploy, trocar `delivery_channels::text LIKE '%email%'` por
  `delivery_channels @> '["email"]'` (o campo é `JSONField`/jsonb).

## Correção de premissa da rodada 1
Minha atribuição do vazamento do token ao Sentry estava **errada** — não há `sentry_sdk` em
`apps/api` (verificado: zero resultados). O Stage B identificou o vetor real e mais grave:
`plane/middleware/logger.py:62` loga `get_full_path()` com query string, em **toda** requisição, e o
middleware está registrado em `common.py:116`. A mitigação proposta cobre a superfície da aplicação.

## Próximo passo
Stage C (Fix), aplicando A e B junto com o plano.
