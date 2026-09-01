# Sanity — Catálogo de Domínios

> Lido pelo `feature-sanity.agent.md`. **Copie apenas os blocos dos domínios selecionados** para
> dentro dos handoffs. Não carregue o catálogo inteiro num handoff.
>
> Cada handoff é auto-suficiente: o subagent lê **só** o handoff, sem acesso ao filesystem. Isso
> significa colar o **código real** dos arquivos modificados sob cada item — checklist sem código
> não produz verificação, produz opinião.

Formato de resposta comum a todos os domínios — inclua no fim de cada handoff:

```markdown
# Sanity: [Domínio]
## Resultados
| Item | Status | Evidência |
|------|--------|-----------|
| [N.N] [nome] | ✅ OK / ❌ PROBLEMA / ⏸️ N/A | [linha exata do código colado que comprova] |

## Achados (só para ❌)
- **Problema**: [o que está errado]
- **Onde**: [arquivo:linha]
- **Impacto**: [o que acontece em produção]
```

⚠️ `⏸️ N/A` é resposta legítima quando o handoff não traz código para o item. Chutar `✅` sem
evidência é pior que responder N/A.

---

## 01 — 🔒 Segurança
**Gatilho**: qualquer mudança em `apps/api/plane/{app,api,space}/views/`, serializers,
permissions, ou queries.

- **1.1 Escopo de tenant** — toda query filtra por `workspace_id`/`project_id` conforme o
  contexto? Se não filtra, o queryset já vem escopado de camada acima (mostre de onde)?
- **1.2 Permissão** — a view declara `permission_classes` adequada? Checa papel
  (Admin/Member/Guest) onde a operação exige? Objeto acessado pertence ao workspace do request?
- **1.3 Validação de input** — campos do request passam por serializer? Tipos específicos
  (UUID, email, choice) validados? Payload malformado é rejeitado com 400, não com 500?
- **1.4 Exposição de dado** — a resposta evita campo sensível (senha, token, secret, hash,
  e-mail de terceiro)? Usa serializer explícito em vez de despejar o model?
- **1.5 SQL/ORM** — sem `.raw()`/`.extra()` com string interpolada a partir de input do usuário?

## 02 — 🚀 Deploy & Migrations
**Gatilho**: mudança em `apps/api/plane/db/migrations/`, settings, env vars, ou queries em
tabela grande.

- **2.1 Migration segura** — `ADD COLUMN NOT NULL` tem default? `DROP COLUMN`/rename quebra código
  que ainda roda na versão antiga? `ALTER` que trava tabela grande? Reversível?
- **2.2 Env vars** — variável nova tem default ou falha explícita na inicialização? Documentada
  em `.env.example`/compose?
- **2.3 Breaking change** — assinatura, shape de retorno ou nome de campo mudou? Todos os
  chamadores foram atualizados (inclusive `apps/web`, `apps/space`, `apps/admin`)?
- **2.4 Performance** — query nova tem índice compatível? Há query dentro de loop (N+1)?
  Listagem tem paginação? Falta `select_related`/`prefetch_related` óbvio?

## 03 — 📐 Padronização
**Gatilho**: sempre que houver código novo de produção.

- **3.1 Erros** — usa o padrão de erro do módulo vizinho? Status HTTP correto (400 vs 403 vs 404
  vs 500)? Mensagem não vaza detalhe interno (stack, SQL, path)?
- **3.2 Código de debug** — sem `print()`, `console.log`, `debugger`, `breakpoint()` em código de
  produção? Sem `TODO`/`FIXME` novo sem dono?
- **3.3 Nomes e estrutura** — segue a convenção do arquivo vizinho? Nome descreve a intenção
  (não `data`, `tmp`, `x`, `handle2`)? `snake_case` em Python, `camelCase` em TS?
- **3.4 Encaixe** — a mudança usa os helpers/managers que já existem, ou reimplementa algo que o
  módulo já resolve?

## 04 — 🔗 Contratos
**Gatilho**: serializer, view, tipo compartilhado em `packages/types`, ou resposta de API tocada.

- **4.1 Shape de retorno** — campo adicionado é opcional (backward-compatible)? Campo removido ou
  renomeado tem consumidor vivo?
- **4.2 Serializers/tipos** — o serializer reflete exatamente o que a view retorna? O tipo em
  `packages/types` bate com o payload real do backend?
- **4.3 Parâmetros** — parâmetro obrigatório novo quebra chamador existente? Parâmetro removido
  ainda é enviado por algum app?
- **4.4 Front ↔ back** — o `apps/web` consome o campo com o mesmo nome e tipo que o backend envia?

## 05 — 🧪 Testes
**Gatilho**: sempre que houver mudança em `apps/api` ou `apps/live`.

- **5.1 Cobertura** — cada função/endpoint modificado tem teste correspondente? Liste
  função → arquivo de teste → existe ✅/❌.
- **5.2 Caminho negativo** — há teste para o erro, não só para o sucesso? O teste asserta o
  status/mensagem específicos, e não apenas "deu erro"?
- **5.3 Qualidade** — nenhum teste com assert vazio (`assert response` sozinho), tautológico
  (`assert x == x`), `skip`/`xfail` sem justificativa, ou dependente da ordem de execução?
- **5.4 Edge cases** — vazio, nulo, limite de paginação, string longa, campo opcional omitido?
- **5.5 Marker correto** — `unit` / `contract` / `smoke` conforme `plane/tests/` (ver
  `.claude/instructions/stack.md`)?

⛔ **Não pergunte sobre Playwright, visual-audit, jest ou screenshots**: não existem neste repo.
Frontend não tem runner — cobertura de `apps/web|admin|space` é `⏸️ N/A` por definição.
