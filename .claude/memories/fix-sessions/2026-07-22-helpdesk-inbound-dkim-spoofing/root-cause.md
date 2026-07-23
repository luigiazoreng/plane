# Root Cause — SR-002

## Root Cause

**Causa**: A identidade do remetente é derivada exclusivamente do campo `from` do multipart, sem nenhuma verificação de autenticidade. O ramo de agente promove essa string forjável a `actor` (usuário real do workspace).

**Arquivo(s)**:
- `apps/api/plane/app/views/helpdesk/inbound.py:134` — `from_email = self._extract_email_address(from_str)`, onde `from_str = data.get("from", "")` (linha 132)
- `apps/api/plane/app/views/helpdesk/inbound.py:198-207` — ramo de agente
- `apps/api/plane/app/views/helpdesk/inbound.py:190-195` — ramo de cliente

**Por que acontece**: em `:199-203` a query
`HelpdeskMember.objects.filter(workspace_id=..., member__email__iexact=from_email, is_active=True)`
usa `from_email` como se fosse uma identidade provada. O único gate anterior é
`verify_inbound_secret(request)` (`:103`), que autentica o **transporte**, não o remetente —
e o próprio SendGrid anexa o segredo ao encaminhar um email recebido no endereço público.
Confirmado: `grep -rniE "dkim|spf|dmarc|spam_score|authentication-results"` em todo `apps/api`
retorna **zero** ocorrências funcionais (único hit é a palavra "envelope" num docstring de
`plane/tests/e2e/test_helpdesk_email_e2e.py:164`, sem relação).

**Impacto**: comentário criado em `:265-275` com `actor` = agente real, indistinguível de um
genuíno; e, via `:295-297`, `first_responded_at` falsificado.

**Hipóteses descartadas**: nenhuma alternativa sobreviveu — não há verificação de autenticidade
em nenhum ponto do fluxo (nem middleware, nem signal, nem throttle).

---

## Confirmações dos pontos críticos levantados

### 1. `_extract_header` NÃO serve para `dkim`/`SPF` — CONFIRMADO

`_extract_header` (`inbound.py:45-57`) aplica regex **apenas** sobre `headers_str`, que é
`data.get("headers", "")` — um campo entre outros. O padrão de consumo em `:124-129` é uniforme:

```
headers_str = data.get("headers", "")
from_str    = data.get("from", "")
text_body   = data.get("text", "")
html_body   = data.get("html", "")
```

`headers`, `from`, `text`, `html` são **campos irmãos de topo** do multipart. `dkim` e `SPF`
são campos do mesmo nível — o acesso correto é `data.get("dkim")` / `data.get("SPF")`, nunca
`_extract_header(headers_str, "dkim")`, que buscaria dentro do valor de outro campo e sempre
retornaria `None`. **Hipótese do dev confirmada estruturalmente.**

Ressalva mantida: o **formato do valor** (`{@dominio.com : pass}`) continua não verificado
contra dados reais — não existe fixture de payload SendGrid no repositório. Os testes existentes
(`test_inbound_email.py`) montam payloads à mão e nenhum inclui `dkim`/`SPF`/`envelope`.

Fonte alternativa a considerar no Plan: o MTA receptor insere `Authentication-Results:` no MIME,
o que **cairia** dentro de `headers_str` e seria alcançável por `_extract_header`. São dois
caminhos distintos com formatos distintos.

### 2. `first_responded_at` — CONFIRMADO, não exige correção separada

`inbound.py:295`: `if hd_request.first_responded_at is None and actor is not None:`

A escrita é **condicionada a `actor is not None`**. Não atribuir `actor` já fecha a falsificação
de SLA como consequência — nenhuma alteração adicional é necessária neste ponto.
Confirmado que é a única escrita de `first_responded_at` no fluxo inbound
(a outra, `comment.py:105-108`, é do path autenticado da UI e está fora de escopo).

### 3. Anexos de remetente não verificado — PONTO EM ABERTO PARA O PLAN

`store_inbound_attachment` roda em `:254-260`, **depois** do gate `if not is_authorized`
(`:213`). O comentário do código em `:251-253` declara a intenção: *"Store the files only now
that the sender is known to be legitimate."*

O problema: com a decisão assimétrica, um agente forjado que falha a verificação **continua
com `is_authorized = True`** (setado em `:206`) — só perde o `actor`. Ele passa direto pelo
gate de `:213` e **seus anexos são gravados**. A premissa do comentário `:251-253` deixa de
valer silenciosamente.

O Plan precisa decidir explicitamente: remetente não verificado pode anexar arquivos?

---

## Causas raiz adicionais / efeitos colaterais não previstos no bug-report

### AD-1 — O comentário órfão (mais importante)

"Não atribuir `actor`" produz um comentário com `actor=None` **e** `customer=None` (o ramo de
agente nunca seta `customer`). Consequências:

- Na thread da conversa: bolha sem avatar e sem nome — uma **anomalia visível**, o que tensiona
  a Decisão 2 ("sem sinalização na UI da conversa"). Não sinalizar e criar um órfão não são
  compatíveis: o órfão *é* uma sinalização, só que sem legenda.
- Nos Email logs: a coluna "Recipient" renderiza `log.customer ? "Customer" : "Unknown"`
  (`apps/web/app/(all)/[workspaceSlug]/(projects)/helpdesk/settings/page.tsx:~1332`) → "Unknown".

O Plan deve escolher conscientemente entre descartar (`_discard`) e criar não atribuído.

### AD-2 — Serializer `fields = "__all__"` vaza campo novo para o portal público

`HelpdeskRequestCommentSerializer` (`apps/api/plane/app/serializers/helpdesk.py:344`, Meta em
`:389-399`) usa `fields = "__all__"`. O **mesmo** serializer atende:

- `portal.py:136` — Email logs (admin)
- `comment.py:145` e `comment.py:195` — `PublicHelpdeskCommentEndpoint`, **customer-facing**

Qualquer campo novo no modelo `HelpdeskRequestComment` aparece automaticamente na resposta da
API pública ao cliente. Contraria a Decisão 3 ("registrar apenas nos logs de email") no nível do
contrato, mesmo que a UI não renderize. Também entrega ao atacante o feedback de se o spoof foi
detectado. Mitigação: campo fora do modelo do comentário, ou `fields` explícito, ou serializer
separado para o path público.

### AD-3 — Os Email logs não têm onde exibir o resultado hoje

`HelpdeskPortalEmailLogsEndpoint` (`portal.py:119-137`) filtra por
`.exclude(email_status=NOT_SENT)`. Comentários inbound gravam `SENT` (`inbound.py:273`), então
**aparecem** — o achado Médio conhecido, fora de escopo, joga a favor aqui.

Mas a tabela do frontend tem colunas fixas (Status / Message / Recipient / Time / Error) e o
badge de Status só cobre `sent` / `failed` / `pending`. Persistir o resultado no backend **não
o torna visível**: satisfazer a Decisão 3 exige uma mudança de frontend, que o bug-report não
previu.

### AD-4 — Correção factual ao bug-report: não há relay outbound

O bug-report afirma (seção "Severidade aumentada pela Fase 17") que *"o outbound reenvia esses
arquivos ao cliente a partir de um endereço legítimo do domínio da empresa"*. **Isto não
corresponde ao código atual.**

`send_helpdesk_comment_email.delay` é chamado em **um único ponto**: `comment.py:112`, dentro de
`perform_create` do path autenticado da UI, sob a condição `should_send_email`. `inbound.py`
**nunca** despacha essa task, e não existe signal `post_save` em `HelpdeskRequestComment`
(verificado em `plane/db/models/helpdesk.py` e `plane/app/helpdesk/`). O `email_status=SENT` de
`:273` é um rótulo, não um envio.

O vetor de entrega real é outro: o anexo injetado fica acessível ao cliente pelo endpoint
público do portal (`public-helpdesk-asset-detail`, `plane/app/urls/helpdesk.py:314`). Continua
sendo entrega de arquivo hostil sob procedência confiável — mas por download no portal, não por
email. **A severidade permanece alta; o mecanismo descrito precisa ser corrigido**, senão o Plan
desenha mitigação para um canal que não existe.

---

## Diagnóstico Adicional Necessário

- **UX Diagnose**: NÃO — a causa raiz é inteiramente server-side e está confirmada por leitura de
  código. O único aspecto de UI (AD-1/AD-3) é consequência de decisão de design a tomar no Plan,
  não comportamento a observar no browser.
- **VPS Diagnose**: NÃO para a causa raiz — ela não depende de estado de produção.
  **Ressalva**: o formato real dos campos `dkim`/`SPF` do SendGrid permanece não verificado e
  não há fixture no repo. Não bloqueia o Plan (o requisito já é parsing defensivo que degrada
  para "não verificado" em formato inesperado), mas capturar um payload real de produção
  aumentaria a confiança do parser. Fica como **opcional, não bloqueante**.

## Próximo Passo

**Stage B — Plan**

### Decisões FECHADAS pelo dev sobre AD-1 e AD-3 (2026-07-22)

Levados ao dev após o A1; ambos resolvidos. O Plan deve **executar** estas decisões,
não reabri-las.

**AD-1 — comentário órfão → rótulo de fallback, sem campo novo e sem badge**

O comentário continua sendo criado **sem `actor`** (é isso que fecha a escalada) e sem
`customer`. Para não produzir a bolha anônima:

- **Frontend apenas**: quando `actor_detail` e `customer_detail` são ambos nulos, renderizar
  um rótulo neutro de fallback em vez de vazio. Vale para a thread do agente e para o portal.
- **Nada de campo novo com o endereço reivindicado.** Guardar o `From:` forjado num campo do
  comentário faria ele vazar pelo serializer público (AD-2) — entregaria ao cliente o email de
  um agente. O ganho não paga o risco.
- **Não é badge de "não verificado".** É o fallback que já deveria existir para qualquer
  comentário sem autor. Respeita a Decisão 2 do dev (nada de sinalização na conversa) e ainda
  assim elimina a anomalia visual.

**AD-3 — Email logs ganham a coluna; é escopo obrigatório, não opcional**

O dev confirmou que quer o resultado nos Email logs sabendo que exige frontend.

- Persistir o resultado da verificação em campo próprio de `HelpdeskRequestComment`
  (migration nova — atenção ao `--create-db` na primeira execução dos testes).
- **Excluir explicitamente do serializer público** — resolve AD-2 na mesma passada. O
  `HelpdeskRequestCommentSerializer` usa `fields = "__all__"` e é o mesmo usado por
  `PublicHelpdeskCommentEndpoint`; o campo novo não pode chegar ao cliente, senão informa ao
  atacante se o spoof foi detectado.
- `HelpdeskPortalEmailLogsEndpoint` passa a expor o campo; a tabela de Email logs ganha a
  coluna correspondente.

### Decisões que o Plan ainda deve fechar
1. Anexos de remetente-agente não verificado: gravar ou não? O gate de `is_authorized`
   continua `True` no desenho assimétrico, então hoje os anexos seriam gravados — e o
   comentário em `inbound.py:254` ("*only now that the sender is known to be legitimate*")
   deixa de valer em silêncio. Precisa de decisão explícita.
2. Fonte do sinal: campos `dkim`/`SPF` do multipart vs `Authentication-Results` em `headers`.
3. Como degradar quando o payload não traz sinal algum (ausente ou em formato inesperado) —
   nunca 500, que faz o SendGrid re-entregar em loop.
