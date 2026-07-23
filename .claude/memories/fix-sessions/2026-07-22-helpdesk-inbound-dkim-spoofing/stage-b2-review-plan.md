# Stage B2: Review Plan (rev. 2 — re-revisão)

- Decisão: **APPROVED**
- Bloqueadores: 0
- Correções obrigatórias no Stage C: 2
- Sugestões: 1
- Rev. 3 necessária: não

## Blockers da rev. 1 — ambos fechados (verificados no código)
- **B1 (A-R forjável) — FECHADO.** A via conservadora (A-R nunca produz `pass`) fecha o vetor por
  construção. Percorri as direções de ataque: plantar `pass` → `unverified`; plantar `fail` → age
  contra o próprio atacante; authserv-id forjado → rejeitado pelo pin; duplicata → `unverified`;
  negar atribuição a agente legítimo → não alcançável (exigiria escrever no email do agente).
  A7 trava as três guardas; A4 com asserção invertida é a peça certa.
- **B2 (`authorKind`) — FECHADO, cobertura completa.** Agente: `grep -n isAgent` retorna 8 linhas
  (426, 427, 431, 434, 436, 443, 449, 450) — os intervalos do plano cobrem todas. Portal:
  `comment.actor`/`comment.customer` aparecem em exatamente 204, 206, 210 — as três listadas.
  `IHelpdeskRequestComment.customer` existe (types:213) e o serializer público envia o campo.

## Correções obrigatórias no Stage C (não exigem rev. 3)
- **C1 — D1-a posiciona o esvaziamento de `uploaded_files` onde ele quebra B4 e B5.** Computar o
  veredito em `:134` está certo; **agir** sobre ele ali não, porque o ramo agente/cliente só é
  conhecido em `:190-207`. Esvaziar em `:134` faz o anexo-only cair no `empty_body` de `:151`
  (B4 assere `detail == "unverified_agent_attachments_only"` → falha), muda o fingerprint de
  `:236-239`, e atinge o cliente (B5 falha). Correto: veredito em `~:134`, supressão dos anexos
  entre `:213` e `:254`, e a borda anexo-only avaliada no mesmo ponto.
- **C2 — precedência entre as duas fontes e critério de `fail` do A-R não especificados.** Falta
  dizer que um `pass` da fonte primária vence qualquer `fail` do A-R (a leitura natural do D4 já
  dá isso, mas o Stage C não deve inferir), e que só mecanismo com domínio utilizável e
  desalinhado produz `fail` — senão `spf=fail` de encaminhamento legítimo reporta ataque na
  coluna dos Email logs. Caso extra sugerido no A4: `dkim` primário `pass` + A-R `spf=fail` → `pass`.

## Sugestão
- **S1 — a mitigação do R1 cobre o deploy, não a deriva posterior.** Parser tolerante a mais de
  uma grafia e a múltiplas entradas do campo `dkim` (caso explícito em A1 ou A5), e alertar pela
  **taxa** de `pass` entre comentários de agente caindo a zero.

## Respostas ao foco do re-review
- (a) argumento do D2 fecha — sim, com a ressalva de especificação C2.
- (b) `authorKind` cobre tudo — sim, 8/8 e 3/3.
- (c) trade-off do I2 correto — **sim, e o argumento é melhor que a objeção original**. `content`
  confirmado no serializer público (`fields="__all__"`) e renderizado em `page.tsx:214`. Objeção
  #4b da rev. 1 **retirada**.
- (d) `dkim` como ponto único de falha — aceitável; a alternativa era um caminho de `pass`
  forjável, que anularia o fix. Ver S1 para a deriva pós-deploy.
- (e) problema novo introduzido — sim, um: C1.

## Próximo
Stage C — Fix. O Stage C deve ler `plan-review.md` e aplicar C1 e C2 na implementação.
