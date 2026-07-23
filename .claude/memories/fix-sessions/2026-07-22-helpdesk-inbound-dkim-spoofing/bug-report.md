# Bug Report — SR-002

## Descrição

O webhook inbound (`apps/api/plane/app/views/helpdesk/inbound.py`) deriva a identidade do
remetente **exclusivamente** do campo `from` do payload multipart. O header `From:` é forjável
em SMTP, e o endpoint nunca lê os campos `dkim`, `SPF` ou `envelope` que o próprio SendGrid
Inbound Parse fornece.

**Verificado**: `grep -c "dkim\|SPF\|envelope\|spam_score" inbound.py` → **0**.

O segredo compartilhado adicionado na sessão anterior (`HELPDESK_INBOUND_WEBHOOK_SECRET`)
**não protege contra isto**. Ele autentica o *transporte* — impede POST direto ao endpoint —
mas o atacante não precisa disso: ele envia um email normal para o endereço público do Inbound
Parse, e **o próprio SendGrid anexa o segredo** ao encaminhar.

## Comportamento esperado
Um email cujo remetente não pode ser autenticado nunca deve produzir um comentário atribuído
a um agente (`actor` preenchido).

## Comportamento atual
Produz, e o comentário fica indistinguível de um genuíno.

## Passos para reproduzir

1. Atacante obtém um `Message-ID` da thread — ele viaja no header `References` de **todo**
   email que o sistema envia ao cliente, então qualquer participante do ticket tem um.
2. Envia um email comum para o endereço configurado no Inbound Parse, com:
   - `From: agente@empresa.com` (agente real do workspace)
   - `In-Reply-To: <message-id-colhido>`
3. SendGrid recebe, anexa o segredo (está na URL configurada) e faz o POST.
4. `verify_inbound_secret` passa. O ramo de agente (`inbound.py:199-207`) casa o
   `HelpdeskMember` pelo email forjado e cria o comentário com `actor` = agente real.
5. Efeito colateral: `first_responded_at` é sobrescrito → métrica de SLA falsificada.

## Severidade aumentada pela Fase 17 (anexos)

O SR-002 foi descoberto **antes** da feature de anexos. Com ela em produção o impacto muda de
grau:

- O atacante deixa de injetar apenas texto e passa a injetar **arquivos**.
- O outbound reenvia esses arquivos ao cliente **a partir de um endereço legítimo do domínio
  da empresa** (`no_reply_email_address` / `default_agent_email_address` do portal).
- Resultado: o helpdesk vira vetor de entrega de malware com procedência confiável.

## Arquivos envolvidos

- `apps/api/plane/app/views/helpdesk/inbound.py` — `post()`, ramos de autorização em
  `:190-195` (cliente) e `:199-207` (agente)
- `apps/api/plane/app/helpdesk/inbound_security.py` — onde a verificação de origem já vive
- `apps/api/plane/app/views/helpdesk/portal.py` — `HelpdeskPortalEmailLogsEndpoint`, destino
  do registro da verificação
- `apps/api/plane/db/models/helpdesk.py` — `HelpdeskRequestComment`
- `apps/api/plane/tests/unit/helpdesk/test_inbound_email.py` — 22 testes existentes
- `apps/api/plane/tests/unit/helpdesk/test_helpdesk_attachments.py` — 15 testes

## Requisitos da correção (decididos com o dev)

### 1. Assimetria — este é o ponto central
A escalada mora **só** no ramo de agente. Um atacante que forja o `From:` de um cliente para
comentar no ticket desse mesmo cliente não ganha privilégio nenhum — ele já precisava do
`Message-ID` para chegar ali.

- **Agente**: sem autenticidade comprovada, **não** atribuir `actor`.
- **Cliente**: passa normalmente, verificado ou não. **Não bloquear.**

Motivo de não bloquear cliente: domínios de cliente sem DKIM configurado são comuns, e
descartar o email perderia a mensagem de quem tem razão em escrever.

### 2. Registro apenas nos logs de email
O dev decidiu **não** sinalizar "não verificado" na UI da conversa. O resultado da verificação
deve aparecer somente na aba "Email logs" do portal.

Ponto de atenção para o Plan: hoje o `HelpdeskPortalEmailLogsEndpoint` lista comentários
filtrando por `email_status`, e comentários inbound são gravados como `SENT` (achado Médio
conhecido, fora do escopo). Definir onde o resultado da verificação é persistido sem
atropelar isso.

## Notas técnicas que o Plan precisa validar

**Não confiar em "SPF passou".** Encaminhamento legítimo quebra SPF rotineiramente — o
servidor que reencaminha não está no SPF do domínio original. É exatamente por isso que o
DMARC aceita DKIM **ou** SPF em vez de exigir os dois. DKIM sobrevive ao encaminhamento
porque assina o conteúdo.

**DKIM sozinho não basta.** Ele prova o domínio que *assinou*, que pode diferir do domínio do
`From:`. A checagem que fecha o buraco é o **alinhamento** entre `d=` e o domínio do `From:` —
ou seja, lógica estilo DMARC, não leitura de um booleano.

**Formato do payload não foi verificado contra dados reais.** O campo `dkim` do SendGrid vem
documentado como `{@dominio.com : pass}` — string a parsear, não booleano. Como esses campos
nunca foram consumidos, **não existe exemplo real no repositório**. O Plan deve tratar o
formato como hipótese a confirmar e desenhar o parsing defensivamente (payload ausente ou em
formato inesperado deve degradar para "não verificado", nunca estourar 500 — um 500 faz o
SendGrid re-entregar em loop).

## Ambiente
- Backend: `apps/api` (Django 4.2.30 + DRF + Celery 5.4.0)
- Branch: `feat/email`
- Migration mais recente: `0156_helpdesk_portal_max_attachment_size`
- Suíte atual: 63 testes passando (`plane/tests/unit/helpdesk/` + `plane/tests/e2e/`)
- **Atenção**: `pytest.ini` usa `--reuse-db`. Qualquer mudança de modelo exige `--create-db`
  na primeira execução, senão a suíte falha em massa por coluna inexistente.
