# Plan Review (rev. 2 — re-revisão)

## Decisão

**APPROVED**, com 3 correções obrigatórias a aplicar **durante o Stage C** — nenhuma delas exige
uma rev. 3 do plano. Os 2 blockers e os 3 importantes da rev. 1 estão fechados; verifiquei cada
um contra o código, não contra a alegação.

O item **#1 abaixo é um erro de especificação introduzido pela própria correção do I2** (D1-a).
Está escrito de forma que, se o Stage C seguir a letra, quebra dois testes do próprio plano. Não
é blocker — é uma frase a corrigir, e o plano estabeleceu a norma certa ("a especificação afirma,
o teste apenas verifica"), que agora precisa valer para ela mesma.

---

## Verificação dos blockers da rev. 1

### Blocker #1 (fallback A-R forjável) — **FECHADO**

A via conservadora fecha o vetor por construção, e o argumento de segurança do D2 **procede**.
Testei as direções em que o atacante poderia ganhar algo:

| Direção | Resultado |
|---------|-----------|
| Plantar A-R `dkim=pass` no próprio email | → `unverified` (regra 2). Sem `actor`, sem anexos. Nada ganho. |
| Plantar A-R `fail` no próprio email | Piora a própria situação. O veredito honesto já seria não-`pass`. |
| Plantar A-R com authserv-id forjado | Rejeitado pelo pin. E mesmo se casasse, o teto continua `fail`. |
| Duas ocorrências de A-R | → `unverified`. |
| **Negar atribuição a um agente legítimo** | **Não alcançável**: exigiria escrever no email do agente, que o atacante não controla. Ver ressalva #2 abaixo. |
| Envenenar a coluna dos Email logs | Só a própria linha, e só na direção que o incrimina. Sem valor. |

O teto de `fail` é o que torna o argumento sólido: a única alavanca que o header dá ao remetente
aponta contra ele mesmo. O A7 trava as três guardas. O A4 com asserção invertida é a peça certa —
o teste que antes exigia o comportamento vulnerável agora o proíbe.

### Blocker #2 (`authorKind`) — **FECHADO, cobertura completa**

Conferi ocorrência por ocorrência.

Página do agente — `grep -n isAgent` retorna **8** linhas: 426, 427, 431, 434, 436, 443, 449, 450.
Os intervalos declarados no plano (426, 427, 428-434, 436, 439-448, 449-451) cobrem **todas as
oito**. Nenhuma sobrou.

Portal público — `grep -n "comment\.actor\|comment\.customer"` retorna **exatamente** 204, 206,
210. As três estão listadas. Não há outra derivada.

Nota de implementação: o portal hoje **não referencia `comment.customer` em lugar nenhum**, então
o `authorKind` introduz o primeiro uso. Confirmei que isso funciona nas duas pontas —
`IHelpdeskRequestComment.customer` existe (`packages/types/src/helpdesk.ts:213`) e o serializer
público envia o campo (`fields = "__all__"`; o D6 exclui apenas `sender_verification`).

---

## Respostas diretas ao foco do re-review

**(a) O argumento do D2 fecha?** Sim, com uma ressalva de especificação — ver #2.

**(b) `authorKind` cobre todas as derivadas?** Sim, 8/8 e 3/3. Nada sobrou.

**(c) O trade-off do I2 está correto?** **Sim, e o argumento é melhor que a minha objeção.**
Confirmado: `content` está no serializer público (`fields = "__all__"`) e é renderizado ao cliente
em `page.tsx:214`. Um texto sintético do tipo *"(anexos não entregues)"* seria lido pelo atacante,
que é participante do ticket — reconstruindo por outro caminho o mesmo oráculo de detecção que o
D6 fecha no serializer. Trocar um furo de observabilidade por um oráculo de segurança é
efetivamente um mau negócio. **Retiro a objeção #4b da rev. 1.** A exigência de documentar a
lacuna junto ao `_discard`, para que ninguém leia ausência de linha como ausência de ataque, é a
mitigação certa.

**(d) `dkim` como ponto único de falha é aceitável?** Sim, dado o resto do desenho. A alternativa
era manter um caminho de `pass` forjável, o que anularia o fix — não é um trade-off equilibrado,
é uma escolha entre um risco de disponibilidade e um buraco de segurança. A mitigação (payload
real como pré-requisito de deploy) é adequada **para o dia do deploy**; ver #3 para o depois.

**(e) Problema novo introduzido?** Sim, um: o #1.

---

## Correções obrigatórias para o Stage C

### 1: D1-a fixa o esvaziamento de `uploaded_files` num ponto onde ele quebra B4 e B5
**Tipo**: edge case / erro de especificação
**Severidade**: ⚠️ importante (obrigatório corrigir antes de implementar; não exige rev. 3)

**Descrição**:
O D1-a diz: *"O veredito é computado uma única vez, logo após `from_email` estar disponível
(`inbound.py:~134`), antes de qualquer efeito colateral. No ramo de agente não-`pass`, ...
`uploaded_files` é esvaziado antes do loop"*.

Computar o **veredito** em `:134` está certo. Mas `:134` é cedo demais para **agir** sobre ele,
porque o ramo (agente vs. cliente) só é conhecido em `:190-207`. Se o Stage C ler a frase
literalmente e esvaziar `uploaded_files` em `:134`, três coisas quebram:

- **`:151`** — `if not text_body and not uploaded_files: return self._discard("empty_body")`.
  Um email de agente não verificado com **apenas** anexos passaria a cair aqui, retornando
  `detail == "empty_body"` em vez de `"unverified_agent_attachments_only"`. **O B4 falha** — ele
  assere exatamente esse `detail`.
- **`:236-239`** — `if not body_key and uploaded_files: body_key = attachments_fingerprint(...)`,
  usado para derivar o `message_id` sintético. Muda a chave de idempotência.
- E, decisivo: em `:134` **não se sabe se é agente**. Esvaziar ali atingiria também o cliente,
  violando a Decisão 1 do dev. **O B5 falha.**

**Sugestão** (substituir a frase do D1-a):
> O **veredito** é computado uma vez em `~:134`. A **supressão dos anexos** acontece depois do
> ramo de autorização e antes do loop — isto é, entre `:213` e `:254`: se `is_agent_branch and
> verification != PASS`, `uploaded_files = []`. A borda anexo-only do D1-b é avaliada **no mesmo
> ponto** (`if not text_body: return self._discard("unverified_agent_attachments_only")`), nunca
> pelo caminho do `empty_body` de `:151`.

Com isso o `empty_body` de `:151` continua significando o que sempre significou, e a asserção do
B4 sobre o `detail` volta a ser alcançável.

---

### 2: Precedência entre as duas fontes e critério de `fail` do A-R não estão especificados
**Tipo**: abordagem
**Severidade**: ⚠️ importante (uma frase no D2/D3)

**Descrição**:
O D2 define os **tetos** de cada fonte (`dkim` pode `pass`; A-R no máximo `fail`) mas nunca diz o
que acontece quando as duas falam ao mesmo tempo. O D4 passo 2 fala em *"cada (mecanismo,
resultado, domínio) extraído da fonte primária"* — o A-R fica fora do algoritmo, sem regra de
combinação própria.

Duas perguntas ficam para o Stage C inventar:

1. **`dkim` = `pass` alinhado + A-R = `fail`. Qual vence?** A leitura natural do D4 (mesclar as
   entradas utilizáveis numa lista, filtrando as de `pass` vindas do A-R, e aplicar os passos 3-5
   em ordem) dá a resposta **certa** — o passo 3 vem antes do 4, então `pass` vence. Mas se o
   Stage C implementar "qualquer sinal não-`pass` presente → `fail`", um agente legítimo cuja
   mensagem foi encaminhada perde `actor` **e anexos**. É precisamente a lógica do OU do DMARC
   sendo desfeita — o mesmo erro que o D4 existe para impedir.
2. **O que, dentro do A-R, produz `fail`?** Encaminhamento legítimo traz `spf=fail` com
   `dkim=pass` rotineiramente (é a premissa do próprio D4). Se qualquer mecanismo não-`pass`
   marcar `fail`, a coluna dos Email logs passa a dizer *"checamos e reprovou"* para mensagens
   encaminhadas normais. O comportamento no ramo de agente é idêntico (`fail` e `unverified`
   ambos não atribuem), então **não há consequência de segurança** — o dano é ao sinal
   operacional, que é a única razão de o D3 separar os dois estados.

**Sugestão** (duas frases):
> **Precedência**: um `pass` da fonte primária vence qualquer `fail` do A-R. As entradas do A-R
> entram na mesma lista do D4 com as de `resultado == pass` descartadas, e os passos 3-5 são
> aplicados em ordem — o passo 3 antes do 4 é o que preserva o OU do DMARC.
> **Critério de `fail` do A-R**: só um mecanismo cujo domínio seja **utilizável e desalinhado**
> produz `fail`. `spf=fail` sem domínio, ou de mensagem encaminhada, é `unverified`, não `fail` —
> senão a coluna reporta ataque onde houve encaminhamento.

Vale um caso a mais no A4: `dkim` primário `pass` + A-R `spf=fail` no mesmo payload → `pass`.

---

### 3: A mitigação do R1 cobre o deploy, não a deriva posterior
**Tipo**: regressão
**Severidade**: 💡 sugestão

**Descrição**:
Capturar o payload real antes do deploy resolve a **hipótese de formato hoje**. Não cobre o
SendGrid mudar o formato depois — e com o A-R fora do caminho do `pass`, essa mudança leva 100%
dos agentes a `unverified`, perdendo atribuição **e anexos**, silenciosamente. As mitigações
restantes ((b) `logger.warning`, (c) a coluna) são ambas **passivas**: dependem de alguém reparar.

**Sugestão** (barata, no Stage C):
- Parser tolerante a mais de uma grafia plausível do campo (`{@d.com : pass}`, `{d.com : pass}`,
  e **múltiplas entradas** para mensagens com várias assinaturas). O D4 passo 2 já diz "para
  cada", o que implica lista — vale um caso explícito no A1 ou A5 com duas entradas, senão um
  parser de entrada única passa em todos os testes e ninguém percebe.
- Registrar no plano que a métrica a alertar é a **taxa** de `pass` entre comentários de agente
  caindo a zero — o sintoma de deriva de formato, distinguível de um ataque isolado. O
  `logger.warning` sozinho não produz isso; a contagem por `detail` produz.

---

## O que a rev. 2 acertou

- **Não terceirizou o julgamento.** O plano verificou os dois blockers no código e escreveu por
  que a justificativa anterior estava errada, em vez de só aceitar. O parágrafo *"O que a rev. 1
  dizia e por que estava errado"* em D2 e D7 é a forma certa de registrar uma correção — quem
  ler daqui a seis meses entende por que a decisão é essa.
- **Escolheu a via conservadora no D2 e assumiu a conta.** Elevar o R1 para Alta e transformar a
  captura do payload em pré-requisito de deploy é o custo honesto dessa escolha, declarado em vez
  de diluído.
- **Devolveu um argumento melhor no I2.** A objeção sobre o `content` no serializer público é
  correta e eu não a tinha considerado. Um plano que só absorve feedback é pior que um que
  discorda com evidência.
- **D8 é bem raciocinado.** `"Participant"` funciona nas três leituras, e a rejeição de
  `"Via email"` por ser factualmente falsa na fonte de falso positivo do `comment.py:177-183`
  mostra que a escolha foi testada contra o caso concreto, não escolhida por soar neutra.
- **A segunda fonte de falso positivo foi mapeada e mandada para fora do escopo pelo motivo
  certo** — fechá-la é mudança de contrato de API, que não pertence ao SR-002.
- **R7 corrigido sem afrouxar nada**, com o remédio operacional (allowlist por workspace) fixado
  de antemão para que o afrouxamento não vire a saída óbvia sob pressão de suporte.
- **D3 e D1-a responderam à norma certa**: escrever a condição (`== PASS`) e a ordenação na
  especificação, para o Stage C não inferir. É a mesma norma que o #1 acima pede que se aplique
  à própria frase do D1-a.

---

## Resumo

- Aprovado: ✅ (APPROVED — segue para o Stage C)
- Bloqueadores: 0 (os 2 da rev. 1 verificados no código e fechados)
- Correções obrigatórias no Stage C: 2 (#1 posicionamento do esvaziamento de `uploaded_files`;
  #2 precedência entre fontes e critério de `fail` do A-R)
- Sugestões: 1 (#3 tolerância do parser + métrica de deriva)
- Rev. 3 necessária: **não** — as duas correções são pontuais e estão especificadas acima em
  forma aplicável direto na implementação
- Objeção retirada: #4b da rev. 1 (observabilidade do discard anexo-only) — o contra-argumento
  do `content` no serializer público procede
