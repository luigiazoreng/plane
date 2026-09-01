# Stage B: Plan (rev. 2, pós Stage B2)

- Arquivos produção: 12 (8 backend, 4 frontend/types)
- Arquivos teste: 3 (1 novo, 2 modificados)
- Testes TDD: 15 (7 unit puros + 6 integração + 2 serializer)
- Risco geral: **alto** (era médio na rev. 1)

## Mudanças da rev. 1 → rev. 2

Ambos os blockers do B2 verificados no código e **aceitos**.

- **D2 REVISADO (blocker #1)**: `Authentication-Results` é forjável — `headers` são os headers
  como recebidos, escritos pelo atacante, e `_extract_header` usa `search()` (primeira
  ocorrência). Minha justificativa da rev. 1 ("inserido pelo MTA receptor") estava errada.
  Agora: campo `dkim` é a **única** fonte de `pass`; o A-R nunca produz `pass`, só
  `fail`/`unverified`, e só com authserv-id pinado (`HELPDESK_INBOUND_AUTHSERV_ID`) e
  rejeição de duplicatas. Teste **A7** adicionado. Consequência: capturar payload real do
  SendGrid virou **pré-requisito de deploy**.
- **D7 REVISADO (blocker #2)**: a rev. 1 corrigia só a string do rótulo. Autoria é comunicada
  também por alinhamento, cor e ícone — todos derivados de `!comment.actor`. Agora:
  `authorKind` de 3 estados (`agent`/`customer`/`unattributed`) governa o render inteiro nos
  **dois** frontends (portal `:204,206,210`; agente `:426` e derivadas).
- **D8 NOVO (#3)**: string fixada em `"Participant"`. Segunda fonte de falso positivo mapeada
  (`comment.py:177-183`, token ausente/expirado no POST do portal) — registrada como achado
  separado, fora de escopo.
- **D1-a / D1-b (#4)**: ordenação explicitada (veredito antes do loop `:254-260`; agente
  não-`pass` pula o loop inteiro). Borda anexo-only mantida como `_discard`, com o trade-off de
  observabilidade registrado — criar comentário com texto sintético foi **rejeitado** porque
  `content` está no serializer público e reconstruiria o oráculo de detecção.
- **R7 CORRIGIDO (#5)**: custo real é "perde atribuição **e anexos**", não só atribuição.
  Remédio operacional fixado: allowlist por workspace, nunca afrouxar alinhamento globalmente.
- **D3 (#6)**: condição explicitada como `== PASS`, jamais `!= FAIL`.
- **D6/R6 (#7)**: ênfase corrigida — o oráculo que importa é o serializer, não a UI.

## Decisões fechadas
- **D1** — anexos de agente não verificado descartados; texto mantido; anexo-only → `_discard`.
- **D2** — campo `dkim` única fonte de `pass`; A-R defensivo, nunca `pass`.
- **D3** — 4 estados; nunca exceção, nunca 500; atribuição exige `== PASS`.
- **D4** — alinhamento obrigatório estilo DMARC; sem domínio não há `pass`; SPF nu nunca passa.
- **D5** — módulo próprio `sender_authenticity.py`, separado de `inbound_security.py`.
- **D6** — serializer base exclui o campo; subclasse admin o inclui (fecha AD-2).
- **D7** — `authorKind` de 3 estados governando o render nos dois frontends.
- **D8** — rótulo neutro = `"Participant"`.

## Riscos principais
- R1 (**Alta**): campo `dkim` é ponto único de falha → payload real vira pré-requisito de deploy.
- R5 (Média→Alta): superfície visual dos dois frontends maior que na rev. 1.
- R7 (Média): agente com ESP assinando em subdomínio perde atribuição **e** anexos.
- R2/R3 (Média): `test_agent_reply:441` falha por design; `--create-db` obrigatório.

## Próximo
Stage B2 — Review Plan (re-revisão da rev. 2)
