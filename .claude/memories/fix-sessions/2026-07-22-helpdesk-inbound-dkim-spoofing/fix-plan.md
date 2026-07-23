# Fix Plan — SR-002 (rev. 2, pós Stage B2)

> Revisão 2 incorpora `plan-review.md` (CHANGES_REQUESTED: 2 blockers, 3 importantes,
> 2 sugestões). Mudanças materiais em **D2** (fonte do sinal) e no escopo de frontend do
> **AD-1**. Ambos os blockers foram verificados no código e **procedem**.

## Bug

O webhook inbound (`apps/api/plane/app/views/helpdesk/inbound.py`) deriva a identidade do
remetente exclusivamente do campo `from` do multipart. O ramo de agente (`:198-207`) promove
essa string forjável a `actor` — um usuário real do workspace. O segredo compartilhado
(`verify_inbound_secret`) autentica o **transporte**, não o remetente: o próprio SendGrid anexa
o segredo ao encaminhar um email recebido no endereço público do Inbound Parse.

## Root Cause

`inbound.py:134` → `from_email = self._extract_email_address(data.get("from", ""))`, usado em
`:199-203` como identidade provada na query de `HelpdeskMember`. Nenhuma verificação de
autenticidade existe em ponto algum do fluxo (grep de `dkim|spf|dmarc|authentication-results`
em `apps/api` = 0 ocorrências funcionais).

Consequências: comentário com `actor` = agente real (`:265-275`), `first_responded_at`
falsificado (`:295-297`), e — desde a Fase 17 — anexo hostil publicado no portal público sob
procedência confiável.

---

## Decisões FECHADAS pelo dev (executar, não reabrir)

1. **Validação assimétrica.** Agente sem autenticidade comprovada → comentário criado **sem**
   `actor`. Cliente passa sempre, verificado ou não. NUNCA bloquear cliente.
2. **AD-1** — bolha órfã resolvida com **tratamento neutro só no frontend**, quando
   `actor_detail` e `customer_detail` são ambos nulos. Sem campo novo com o endereço
   reivindicado. Sem badge de "não verificado".
3. **AD-3** — resultado da verificação persistido em campo próprio de `HelpdeskRequestComment`
   (migration nova), **excluído explicitamente do serializer público** (resolve AD-2 junto),
   exposto no `HelpdeskPortalEmailLogsEndpoint`, com coluna nova na tabela de Email logs.
4. **Sem sinalização na thread da conversa.**

---

## Decisões FECHADAS neste Plan

### D1 — Anexos de agente não verificado: **descartar os arquivos, manter o texto**

**Decisão**: no ramo de agente, quando a verificação **não** resulta em `pass`, os arquivos
recebidos **não** são gravados. O comentário de texto é criado normalmente (sem `actor`).
O ramo de cliente permanece intocado: anexos de cliente são sempre gravados.

**Justificativa**:
- O vetor real (corrigido em AD-4) é o **download pelo endpoint público do portal**
  (`public-helpdesk-asset-detail`, `urls/helpdesk.py:314`), não relay outbound — que não existe.
  O cliente confia no **portal**, não no rótulo da bolha. Por isso o tratamento neutro do AD-1
  **não** neutraliza o anexo: o arquivo continua servido pelo domínio da empresa, dentro do
  ticket legítimo do cliente. Texto sob rótulo neutro tem valor baixo para o atacante; um `.exe`
  baixável do portal da empresa tem valor alto **independentemente** do rótulo.
- Custo legítimo baixo, mas **não nulo** — ver R7 revisado.
- O comentário em `inbound.py:251-253` ("*only now that the sender is known to be legitimate*")
  deixaria de valer em silêncio no desenho assimétrico, já que `is_authorized` continua `True`.
  Esta decisão restaura a premissa do comentário — e o comentário **deve ser reescrito** para
  dizer a verdade nova: **autorizado ≠ autêntico**.

**D1-a — Ordenação (obrigatória, não inferir do teste)** *(review #4a)*

O veredito é computado **uma única vez**, logo após `from_email` estar disponível
(`inbound.py:~134`), **antes** de qualquer efeito colateral. No ramo de agente não-`pass`, o loop
de `store_inbound_attachment` (`:254-260`) é **pulado inteiro** — `uploaded_files` é esvaziado
antes do loop, e nenhuma chamada a `store_inbound_attachment` acontece. Não é filtrar depois:
se o veredito fosse consultado após o loop, os arquivos já teriam ido para o bucket e restariam
órfãos até o sweep diário. A especificação afirma isto; o B3 apenas verifica.

**D1-b — Borda anexo-only: `_discard`, com o trade-off registrado** *(review #4b)*

Agente não verificado que envia **apenas** anexos (sem texto) → `_discard(
"unverified_agent_attachments_only")`. Não se cria comentário.

O review corretamente aponta que isto deixa o cenário mais gráfico do ataque **invisível na
coluna nova do AD-3** — sem comentário não há linha nos Email logs. Considerei a alternativa
(criar o comentário com texto sintético) e **rejeitei**, por uma razão que o review não
considerou: o `content` **está** no serializer público. Um texto do tipo *"(anexos não
entregues)"* seria lido pelo cliente — e pelo atacante, que é participante do ticket. Isso
reconstrói exatamente o **oráculo de detecção** que o D6 existe para eliminar. Trocar um furo de
observabilidade por um oráculo de segurança é um mau negócio.

Sem o oráculo, a única saída seria criar o comentário com `synthesize_content(0)` →
*"(mensagem sem texto — 0 anexos)"*, uma linha absurda para o cliente.

**Trade-off aceito e registrado**: a borda anexo-only é observável apenas pelo
`logger.warning` com `detail` estruturado — alertável por contagem, mesmo padrão dos demais
discards. A cobertura da coluna nova é **parcial por construção**: o caso com texto (B3) produz
linha nos Email logs com o veredito; o caso anexo-only não. Documentar isto no código, junto ao
`_discard`, para que ninguém leia a ausência de linha como ausência de ataque.

### D2 — Fonte do sinal — **REVISADO (blocker #1)**

**O que a rev. 1 dizia e por que estava errado**: eu justifiquei o fallback de
`Authentication-Results` dizendo que ele "é inserido pelo MTA receptor — a mesma fronteira de
confiança que já aceitamos". **Isso é falso, e verifiquei no código.**

- `headers_str = data.get("headers", "")` (`inbound.py:124`) são os headers da mensagem **como
  recebida** — escritos por quem enviou o email, isto é, o atacante.
- `_extract_header` usa `pattern.search()` (`inbound.py:49`) → retorna a **primeira** ocorrência
  e ignora as demais **em silêncio**.

Logo o atacante planta `Authentication-Results: mx.sendgrid.net; dkim=pass header.d=empresa.com`
no próprio email e vence. Acoplado ao R1 é pior ainda: se o formato do campo `dkim` divergir da
hipótese, o parser cai no fallback para **100% do tráfego**, e o veredito do sistema inteiro
passa a ser um header que o remetente escreve — com a coluna nova dos Email logs afirmando
`pass` para o spoof. Isso seria **fail-open sob controle do atacante**: pior que o estado atual,
porque acrescenta uma afirmação falsa de verificação.

**Decisão revisada** — três regras cumulativas:

1. **Fonte única de `pass`: o campo `dkim` do multipart.** `data.get("dkim")`, campo irmão de
   topo (o A1 confirmou que `_extract_header` não o alcança). Formato documentado:
   `{@dominio.com : pass}`.
2. **`Authentication-Results` NUNCA produz `pass`.** Pode produzir no máximo `fail` ou
   `unverified`. Isto elimina o vetor **por construção**, não por qualidade de parser. É seguro
   porque a única direção que o atacante consegue forçar pelo header é **contra si mesmo**:
   plantar `fail` remove o próprio `actor`. Ele nunca ganha nada.
3. **Mesmo restrito a `fail`/`unverified`, o A-R é lido defensivamente**, para que o valor
   gravado nos Email logs não seja lixo plantável:
   - **authserv-id pinado por configuração**: `HELPDESK_INBOUND_AUTHSERV_ID`
     (`settings/common.py`, mesmo padrão de `HELPDESK_INBOUND_MAX_BODY_SIZE:355`). O A-R só é
     considerado se o authserv-id casar. Sem match, ou config vazia → `unverified`.
     RFC 7601 §5 exige (a) descartar A-R de fora da fronteira de confiança e (b) validar o
     authserv-id — a rev. 1 não fazia nenhum dos dois.
   - **duplicata = injeção**: contar com `re.findall(r"^Authentication-Results:", headers_str,
     re.I | re.M)`. Se > 1 → `unverified`. A primeira linha não garante nada.
   - **não reusar `_extract_header`** para o A-R: seu `search()` de primeira ocorrência é
     precisamente o comportamento inadequado aqui. O módulo novo lê `headers_str` por conta
     própria.

**Consequência assumida — e é uma escalada de requisito de deploy**: com o A-R fora do caminho
do `pass`, o campo `dkim` vira **ponto único de falha**. Portanto **capturar um payload real do
SendGrid deixa de ser "recomendado, não bloqueante" e passa a ser PRÉ-REQUISITO DE DEPLOY**
(ver R1 revisado). Aceito conscientemente: a alternativa era manter um caminho de `pass`
forjável, o que anula o fix.

### D3 — Degradação sem sinal: **`unverified`, nunca exceção, nunca 500**

**Decisão**: quatro estados, não um booleano.

| Estado | Quando |
|--------|--------|
| `pass` | campo `dkim` presente, resultado `pass` **e** domínio alinhado com o `From:` |
| `fail` | sinal presente e utilizável, mas resultado não-`pass` **ou** domínio desalinhado |
| `unverified` | nenhum sinal, sinal irreconhecível, sinal sem domínio, ou A-R rejeitado pelas guardas do D2 |
| `not_applicable` | default — comentários que não vieram do inbound |

- A função de verificação inteira roda dentro de `try/except Exception` e retorna `unverified`
  em qualquer erro, com `logger.warning` estruturado. **Nunca propaga.** Um 500 faria o SendGrid
  re-entregar em loop (mesma razão do `_discard` retornar 200).
- **A condição de atribuição é `verification == PASS`, jamais `!= FAIL`** *(review #6)*.
  Qualquer um dos outros três estados não atribui `actor` e não grava anexos. Escrito assim
  para que o Stage C não precise inferir — `!= FAIL` deixaria `unverified` atribuindo `actor`,
  que é exatamente o buraco.
- **Risco operacional aceito e mitigado**: se o SendGrid mudar o formato do payload, *todos* os
  agentes caem em `unverified` e perdem atribuição **e anexos**. Como o D2 revisado removeu a
  segunda fonte de `pass`, a mitigação (a) da rev. 1 caiu. Restam: (b) `logger.warning` com
  `detail` distinto, alertável por contagem; (c) a coluna nova nos Email logs; e — novo —
  (d) o payload real capturado antes do deploy, agora obrigatório.
- Distinguir `unverified` de `fail` é o que permite ao ops separar "checamos e reprovou" de
  "não tínhamos o que checar" — a diferença entre um ataque e uma quebra de integração, que é
  precisamente a decisão que o admin toma olhando a coluna.

### D4 — Alinhamento estilo DMARC: **alinhamento é obrigatório; sem domínio não há `pass`**

DKIM prova o domínio que **assinou** (`d=`), que pode diferir do domínio do `From:`. Ler um
booleano "passou" não fecha nada: um atacante assina legitimamente `d=atacante.com` e forja
`From: agente@empresa.com` — DKIM passa, e o `From:` continua mentira.

**Algoritmo**:

1. `from_domain` = parte após `@` de `from_email` (já em minúsculas por
   `_extract_email_address`). Vazio ou sem `@` → `unverified`.
2. Para cada `(mecanismo, resultado, domínio)` extraído da fonte primária:
   - só considerar se `resultado == "pass"` **e** `domínio` não vazio;
   - `aligned(d, from_domain)` ⇔ `d == from_domain` **ou** `from_domain.endswith("." + d)`,
     exigindo `d` com ≥ 2 labels.
3. Algum mecanismo alinhado com `pass` → **`pass`**. É o **OU** do DMARC: SPF quebra em
   encaminhamento legítimo (o servidor que reencaminha não está no SPF do domínio original),
   DKIM sobrevive porque assina o conteúdo — por isso DMARC aceita um ou outro, nunca exige os dois.
4. Nenhum alinhado, mas havia ao menos um sinal utilizável → **`fail`**.
5. Nenhum sinal utilizável → **`unverified`**.

**Direção do alinhamento**: aceita-se `from_domain` ser **subdomínio** do domínio assinante
(`agente@mail.empresa.com` assinado por `d=empresa.com` — comum e inexplorável sem a chave). A
direção inversa é **rejeitada**: assinante em subdomínio não valida `From:` no domínio pai.
Mais estrito que o "relaxed" do DMARC, deliberadamente — relaxed de verdade exigiria a Public
Suffix List, que o projeto não tem.

**Guarda de sufixo público**: ≥ 2 labels em `d` impede `d=com` alinhar com tudo. `d=co.uk`
passaria a guarda, mas exploração exigiria a chave DKIM de `co.uk` — inatingível. A guarda é
higiene, não a defesa.

**Consequência decisiva**: o campo `SPF` do SendGrid é documentado como veredito nu
(`pass`/`fail`/`softfail`), **sem domínio**. Sem domínio não há alinhamento, logo ele **nunca**
produz `pass` sozinho. Na prática o único caminho para `pass` é DKIM com `d=` alinhado. É
intencional e responde diretamente à nota do bug-report ("não confiar em SPF passou").

### D5 — Onde mora o código novo

**Novo módulo** `apps/api/plane/app/helpdesk/sender_authenticity.py`, **não** dentro de
`inbound_security.py`. `inbound_security.py` trata autenticidade de **transporte** (o segredo
compartilhado). Confundir as duas coisas é literalmente a causa do SR-002 — o dev razoavelmente
supôs que o segredo cobria o remetente. Módulos separados, com docstrings que se referenciam
mutuamente, tornam a confusão difícil de refazer por acidente. Bônus: funções puras, sem
dependência de Django, testáveis sem banco.

### D6 — Serializer: default público-seguro, subclasse admin

`HelpdeskRequestCommentSerializer` usa `fields = "__all__"` e atende **tanto** o Email logs
(admin) **quanto** o `PublicHelpdeskCommentEndpoint` (customer-facing, `comment.py:145,195`).

**Decisão**: o serializer base **exclui** o campo novo (`exclude` explícito); uma subclasse
`HelpdeskRequestCommentAdminSerializer` o inclui, usada **só** por
`HelpdeskPortalEmailLogsEndpoint`. O default é o seguro; expor exige ato deliberado.

Fecha AD-2. **Este é o oráculo que mais importa** *(review #7)* — o serializer é consultável por
API de forma barata e repetível, ao contrário da leitura visual de uma bolha. A
indistinguibilidade visual (R6) é reforço, não a defesa. Por isso dar tratamento visual próprio
ao estado "unattributed" **não** enfraquece a postura de segurança, desde que o tratamento seja
idêntico para todas as origens de "ambos nulos".

### D7 — Frontend: `authorKind` de três estados governa o render inteiro — **REVISADO (blocker #2)**

**O que a rev. 1 dizia e por que estava incompleto**: eu planejei trocar apenas a **string** do
rótulo. Verifiquei: a autoria é comunicada por um conjunto de decisões que derivam **todas** do
mesmo booleano.

Portal público (`apps/web/app/helpdesk/p/[publicSlug]/[requestId]/page.tsx`):
```
204: className={`flex ${!comment.actor ? "justify-end" : "justify-start"}`}
206: ${!comment.actor ? "bg-primary/5 border-primary/20" : "border-subtle bg-surface-1"}
210: {!comment.actor ? "You" : "Support Team"}
```
Com 204 e 206 intactas, o comentário forjado continua **à direita e na cor das mensagens do
próprio cliente**. Num layout de chat, posição e cor afirmam "esta mensagem é sua" com mais
força que qualquer legenda. Trocar só a 210 produz uma inconsistência, não uma correção.

Página do agente (`.../helpdesk/[requestId]/page.tsx:426`): `const isAgent = !!comment.actor`
governa `flex-row-reverse`, `avatarClass`, o ícone (`UserRound` vs `MessageSquareText`) e
`authorName`. O comentário forjado cai inteiro no ramo de cliente — o agente vê a mensagem do
atacante como se o **cliente** a tivesse escrito. Mesma classe de misattribution, apontada para
o outro lado.

**Decisão revisada**: nos **dois** arquivos, substituir o booleano por
```
authorKind = comment.actor ? "agent" : comment.customer ? "customer" : "unattributed"
```
e derivar dele **alinhamento, cor/superfície, avatar/ícone e rótulo** — todos. `"unattributed"`
recebe tratamento neutro: alinhamento à esquerda, superfície neutra, ícone genérico. Neutro não
é acusação, então a Decisão 4 do dev (nada de badge, nada de "não verificado") é respeitada.

### D8 — A string do rótulo neutro: **`"Participant"`** *(review #3)*

A rev. 1 nunca definiu a string. Ela precisa funcionar para três leituras simultâneas:
(a) o cliente vendo a **própria** mensagem, (b) o cliente vendo um spoof, (c) o agente vendo
qualquer um dos dois.

**Decisão**: `"Participant"` (consistente com o inglês já usado na UI: `"Agent"`, `"Customer"`,
`"Support Team"`).

Por que funciona nas três: é **factual e sem juízo** — quem escreveu é participante do ticket, o
que é verdade em todos os casos, inclusive no benigno. Não afirma identidade que não temos, não
insinua suspeita, e não distingue o spoof do falso positivo — que é exatamente a
indistinguibilidade que o R6 pede. Alternativas descartadas: `"Unknown sender"` e
`"Não verificado"` falham na leitura (a) — alarmam o cliente sobre a própria mensagem — e
violam a Decisão 4.

**Descartada também `"Via email"`**: seria factualmente **falsa** na fonte de falso positivo mais
comum (abaixo), que vem do portal, não de email.

**Fontes de falso positivo (`actor=None + customer=None` legítimo)** — duas, ambas verificadas:
1. `inbound.py:190-192` — match por `contact_email` com `hd_request.customer` nulo. (R6)
2. `comment.py:177-183` — **não mapeada na rev. 1 e mais comum**: `PublicHelpdeskCommentEndpoint
   .post` faz `customer = self._get_customer_from_token(request)` e cria o comentário com esse
   valor **sem verificar se é `None`**. Token ausente, malformado ou expirado → comentário do
   cliente, postado pelo próprio cliente no portal, com `customer=None`. O cliente digita, envia
   e vê a própria mensagem recém-enviada como `"Participant"` em vez de `"You"`.

**Tratamento da fonte 2**: fechar isso significa rejeitar POST do portal sem token válido — uma
mudança de contrato de API com impacto próprio, **fora do escopo estrito do SR-002**. Registrar
como **achado separado** para o dev, não misturar aqui. Enquanto não for fechada, ela dilui o
rótulo no caso benigno — custo aceito, e o `"Participant"` foi escolhido justamente para ser
inofensivo nesse caso.

---

## Abordagem geral

Computar a verificação **uma vez por email**, antes de qualquer efeito colateral, para os dois
ramos. Persistir sempre. Usar o resultado **apenas** no ramo de agente, para decidir `actor` e
anexos. Cliente jamais bloqueado, jamais afetado.

`first_responded_at` não precisa de alteração: `inbound.py:295` já condiciona a
`actor is not None`, então não atribuir `actor` fecha a falsificação de SLA como consequência
(confirmado no A1).

---

## Arquivos a Modificar

### Produção — backend (`apps/api`)

| Arquivo | Mudança | Risco |
|---------|---------|-------|
| `plane/app/helpdesk/sender_authenticity.py` (**novo**) | Parser do campo `dkim`/`SPF` (única fonte de `pass`) + leitor defensivo de A-R (authserv-id pinado, duplicata → `unverified`, nunca `pass`) + alinhamento + veredito. Funções puras, nunca levantam. | **médio** |
| `plane/settings/common.py` | `HELPDESK_INBOUND_AUTHSERV_ID` (padrão de `:355`) | baixo |
| `.env.example` / `apps/api/.env.example` | documentar a nova variável | baixo |
| `plane/db/models/helpdesk.py` | Campo `sender_verification` em `HelpdeskRequestComment`: `CharField(max_length=20, choices=..., default=NOT_APPLICABLE)` | baixo |
| `plane/db/migrations/0157_helpdesk_comment_sender_verification.py` (**novo**) | AddField com default → sem backfill | baixo |
| `plane/app/views/helpdesk/inbound.py` | Veredito computado em `~:134`, antes de efeitos colaterais; agente atribui `actor` só em `== PASS`; agente não-`pass` pula o loop `:254-260` inteiro; borda anexo-only → `_discard`; persiste o campo; reescreve o comentário `:251-253` | **alto** |
| `plane/app/serializers/helpdesk.py` | Base exclui `sender_verification`; nova `HelpdeskRequestCommentAdminSerializer` o inclui | **médio** |
| `plane/app/views/helpdesk/portal.py` | `HelpdeskPortalEmailLogsEndpoint` usa o serializer admin | baixo |

### Produção — frontend (`apps/web`, `packages/types`)

| Arquivo | Linhas | Mudança | Risco |
|---------|--------|---------|-------|
| `packages/types/src/helpdesk.ts` | ~224 | `sender_verification?: "pass" \| "fail" \| "unverified" \| "not_applicable"` — opcional, o serializer público não o envia | baixo |
| `.../helpdesk/settings/page.tsx` | ~1305-1345 | Coluna nova nos Email logs, entre "Recipient" e "Time" | baixo |
| `.../helpdesk/[requestId]/page.tsx` | **426** (`isAgent`), 427 (`avatarClass`), 428-434 (`authorName`, `avatarUrl`), 436 (`flex-row-reverse`), 439-448 (ícone), 449-451 (`items-end`) | Substituir `isAgent` por `authorKind` de 3 estados governando **todas** essas decisões | **médio** |
| `apps/web/app/helpdesk/p/[publicSlug]/[requestId]/page.tsx` | **204** (alinhamento), **206** (cor/borda), **210** (rótulo) | Idem — as três linhas, não só a 210 | **alto** |

---

## Especificação TDD

### Grupo A — `sender_authenticity` (unit puro, sem banco)

Arquivo: `plane/tests/unit/helpdesk/test_sender_authenticity.py` (**novo**)

#### Test A1: DKIM alinhado produz `pass`
`dkim` = `{@empresa.com : pass}`, `from_email = agente@empresa.com` → `pass`.

#### Test A2: DKIM válido mas **desalinhado** produz `fail` — *o coração do D4*
`dkim` = `{@atacante.com : pass}`, `from_email = agente@empresa.com` → `fail`.
**Uma implementação que só checa `: pass` passa em A1 e falha aqui** — é este teste que garante
que o alinhamento foi realmente implementado.
**Edge**: `d=` com case diferente do `From:` → normalizar, ainda `pass`.

#### Test A3: SPF sem domínio nunca produz `pass`
Campo `SPF = "pass"` isolado, sem `dkim` → `unverified`. Sem domínio não há alinhamento.

#### Test A4: A-R legítimo pode produzir `fail`, **nunca** `pass` — *reescrito na rev. 2*
`headers` com **uma** ocorrência de `Authentication-Results: <authserv-id configurado>;
dkim=fail header.d=empresa.com`, sem campo `dkim` → **`fail`**.
Mesmo payload com `dkim=pass` → **`unverified`, NÃO `pass`** (D2 regra 2).
**Na rev. 1 este teste esperava `pass` — a asserção invertida é parte do fix do blocker #1.**

#### Test A5: degradação — nunca levanta, nunca `pass`
Sem `dkim`, sem `SPF`, sem `headers` → `unverified`. `dkim` em formato lixo (`"???"`, `None`,
`[]`, dict inesperado) → `unverified`, **sem exceção**. `from_email` sem `@` → `unverified`.

#### Test A6: guarda de sufixo e direção do alinhamento
`d=com` + `from=x@empresa.com` → **não** alinha (`fail`).
`d=empresa.com` + `from=agente@mail.empresa.com` → alinha (`pass`).
`d=mail.empresa.com` + `from=agente@empresa.com` → **não** alinha (`fail`).

#### Test A7: A-R plantado ou duplicado não escapa das guardas — **NOVO (blocker #1)**
1. A-R com **authserv-id desconhecido** (`Authentication-Results: evil.example; dkim=pass
   header.d=empresa.com`) → `unverified`.
2. **Duas** ocorrências de `Authentication-Results` no `headers_str`, a primeira forjada com
   `dkim=pass` → `unverified` (duplicata = injeção).
3. `HELPDESK_INBOUND_AUTHSERV_ID` vazio/não configurado → A-R ignorado → `unverified`.
Sem este teste a implementação natural passa em A4 e continua explorável.

### Grupo B — endpoint inbound (integração, com banco)

Arquivo: `plane/tests/unit/helpdesk/test_inbound_email.py`

#### Test B1: agente forjado sem DKIM não recebe `actor` — **o teste do bug**
**RED (hoje)**: comentário criado com `actor = agente real`.
**GREEN**: 201, `actor is None`, `sender_verification == "unverified"`.
**Encadeado**: `hd_request.first_responded_at` permanece `None` — a falsificação de SLA fecha junto.

#### Test B2: agente legítimo com DKIM alinhado **continua** recebendo `actor`
Payload de B1 + `dkim = {@<dominio-do-agente> : pass}` → `actor == agente`,
`sender_verification == "pass"`, `first_responded_at` preenchido.
Guarda de regressão contra um fix agressivo demais que quebrasse todo agente.
**Nota**: `test_agent_reply` (`test_inbound_email.py:423`, asserção em `:441`) afirma hoje o
comportamento vulnerável e **vai falhar**. Adaptar, não deletar — a asserção invertida **é** o fix.

#### Test B3: anexo de agente não verificado é descartado, texto sobrevive (D1)
Agente sem DKIM, com texto **e** arquivo → comentário com o texto, `actor is None`, **zero**
assets vinculados, e `store_inbound_attachment` **não chamado** (mock — evita depender do S3).
Asserção sobre a chamada, não só sobre o resultado: é o que verifica o D1-a (pular o loop, não
filtrar depois).

#### Test B4: agente não verificado com **apenas** anexo é descartado inteiro (D1-b)
200, `detail == "unverified_agent_attachments_only"`, **nenhum** comentário criado, e
`store_inbound_attachment` não chamado.

#### Test B5: cliente **nunca** é afetado — a assimetria
Email do cliente (match por `contact_email`) **sem** qualquer sinal, com anexo → comentário
criado, `customer` preenchido, **anexo gravado normalmente**, `sender_verification ==
"unverified"` (registrado, sem efeito na autorização).
Impede que um fix futuro derrape para "bloquear tudo que falha DKIM".

#### Test B6: payload malformado nos campos de autenticidade não gera 500
`dkim` com valor absurdo, resto válido (ramo de cliente) → **nunca** 500.

### Grupo C — serializers

Arquivo: `plane/tests/unit/helpdesk/test_helpdesk_serializers.py`

#### Test C1: `sender_verification` **ausente** no serializer público (AD-2)
**RED**: com `fields = "__all__"`, a chave aparece.
**GREEN**: `"sender_verification" not in HelpdeskRequestCommentSerializer(comment).data`.
Impede o oráculo de detecção — o mais importante dos dois (review #7).

#### Test C2: presente no serializer admin
`HelpdeskRequestCommentAdminSerializer(comment).data["sender_verification"] == "unverified"`.
Sem isto a coluna do frontend fica vazia.

**Total**: 7 unit puros + 6 integração + 2 serializer = **15 testes** (+1 vs rev. 1: A7).

---

## Riscos de Regressão

| # | Risco | Severidade | Mitigação |
|---|-------|-----------|-----------|
| R1 | **Formato real do `dkim` do SendGrid não confirmado** — não há fixture no repo. Com o D2 revisado, é a **única** fonte de `pass`: se divergir, 100% dos agentes perdem atribuição **e anexos**. | **Alta** | **Capturar um payload real do SendGrid é agora PRÉ-REQUISITO DE DEPLOY, não mais opcional.** A rev. 1 tinha a segunda fonte como mitigação; o blocker #1 removeu-a por ser forjável. Restam: `logger.warning` alertável por contagem + a coluna nova. |
| R2 | `test_agent_reply` (`:423`, asserção `:441`) vai falhar — afirma o comportamento vulnerável. | Média | Esperado. Adaptar → B2. Documentar no commit que a mudança de asserção **é** o fix. |
| R3 | `--reuse-db` + campo novo = suíte falha em massa por coluna inexistente. Já aconteceu hoje. | Média | Primeira execução **obrigatoriamente** com `--create-db`. `--nomigrations` monta o schema pelos models, então não é a migration que destrava a suíte — é o `--create-db`. |
| R4 | Trocar `fields = "__all__"` por `exclude` pode omitir campo consumido hoje. | Média | `exclude` lista **só** o campo novo. C1/C2 cobrem os dois lados. |
| R5 | Reescrever o render dos dois frontends (D7) toca alinhamento, cor, ícone e rótulo — superfície visual maior que a da rev. 1. | **Média→Alta** | É o preço do blocker #2: corrigir só a string produziria bolha neutra posicionada e colorida como "minha", pior que não mexer. Verificação visual dos 3 estados nos 2 arquivos. |
| R6 | `actor=None + customer=None` ocorre legitimamente por **duas** vias (`inbound.py:190-192` e `comment.py:177-183`). | Média | **Desejável, não defeito**: tratamento idêntico não informa ao atacante se houve detecção. O oráculo que importa é o serializer (D6), não a UI (review #7). A via 2 fica como achado separado (D8). |
| R7 | **REVISADO** — fail-closed no ramo de agente: o agente cujo ESP assina em subdomínio próprio (`d=em1234.empresa.com`, `From: agente@empresa.com`) é rejeitado pelo D4 estrito. DMARC relaxed aceitaria (mesmo Organizational Domain via PSL). | **Média** | A mitigação da rev. 1 ("não perde mensagem — só atribuição") **deixou de valer quando o D1 entrou**: esse agente perde atribuição **e anexos**, silenciosamente, sem feedback para ele. Manter o rigor (a alternativa exige PSL). **Remédio operacional fixado de antemão: allowlist de domínio assinante por workspace — NUNCA afrouxar o alinhamento globalmente.** Registrado aqui para que o afrouxamento não vire a saída óbvia sob pressão de suporte. |
| R8 | A-R dobrado em várias linhas (RFC 5322 folding) → captura parcial. | Baixa | Irrelevante para segurança após o D2 revisado: o A-R não produz `pass` em hipótese alguma. Parcial sem domínio utilizável → `unverified`. |
| R9 | `HELPDESK_INBOUND_AUTHSERV_ID` não configurado em ambiente existente → A-R sempre ignorado. | Baixa | Comportamento correto por design (fail-closed). Documentar em `.env.example`. Não afeta o caminho do `pass`, que não depende dessa config. |

---

## Serviços para build+test

### Backend (`apps/api`)
```
# PRIMEIRA execução após a migration — obrigatório:
pytest plane/tests/unit/helpdesk/ plane/tests/e2e/ --create-db

# Execuções seguintes:
pytest plane/tests/unit/helpdesk/ plane/tests/e2e/
```
Baseline: **63 testes passando**. Alvo: 63 + 15 novos − adaptações do B2 = **~78**.

### Frontend (`apps/web`)
```
npx tsc --noEmit
npm run lint
```

### Migration
```
python manage.py makemigrations plane.db --check --dry-run   # confirmar 0157 e nada mais
```

### Pré-deploy (novo, obrigatório — R1)
Capturar um payload real do SendGrid Inbound Parse e confirmar o formato de `dkim`/`SPF` antes
de habilitar em produção. Com o D2 revisado o campo `dkim` é a única fonte de `pass`.

---

## Fora de escopo (não tocar) / achados a registrar

- Os 15 achados da sessão `2026-07-21-helpdesk-email-seguranca`.
- `email_status = SENT` para comentários inbound (achado Médio conhecido) — joga a favor aqui,
  é o que faz o comentário inbound aparecer nos Email logs.
- Relay outbound: **não existe** (AD-4). `send_helpdesk_comment_email` só é despachado em
  `comment.py:112`, no path autenticado da UI.
- **Achado novo a registrar (não corrigir aqui)**: `comment.py:177-183` —
  `PublicHelpdeskCommentEndpoint.post` cria comentário com `customer=None` quando o token está
  ausente, malformado ou expirado, sem erro. Fechar exige mudança de contrato de API. Ver D8.
