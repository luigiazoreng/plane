# Plan Review — Helpdesk Email (RC-1 a RC-9) — **re-review (rodada 2)**

Revisão da revisão 2 do `fix-plan.md`. Verifiquei cada uma das 10 correções **no código**,
não na descrição delas.

## Decisão
**APPROVED**, com **2 condições de implementação vinculantes** (A e B abaixo).
Nenhum bloqueador. As 10 correções da rodada 1 foram resolvidas — 10 de 10 **corretamente**,
não apenas endereçadas. As duas condições são problemas **novos**, introduzidos por correções
que estavam certas na direção; ambas são de escopo pequeno e estão especificadas ao nível de
linha para o Stage C aplicar sem reabrir o plano.

---

## Verificação das 10 correções da rodada 1

| # | Item | Veredito |
|---|------|----------|
| 1 | `cache.clear()` / LocMemCache | ✅ correto |
| 2 | Seam único de mock | ✅ correto |
| 3 | `default` de env + `configure_instance` | ✅ correto |
| 4 | `Date` na chave RC-8 | ✅ correto |
| 5 | PATCH legado + 3º `RunPython` | ✅ correto (ressalva no teste → **B**) |
| 6 | RC-4 origem de instância | ✅ correto (nota menor **C**) |
| 7 | Vazamento do token em log | ✅ correto — **minha premissa estava errada** |
| 8 | `db_index=True` removido | ⚠️ correto no raciocínio, **incompleto na execução** → **A** |
| 9 | Log estruturado | ✅ correto |
| 10 | `compare_digest` em bytes | ✅ correto |

### Sobre o #7 — eu estava errado, o Stage B está certo
Confirmei: `grep -rn "sentry" --include=*.py plane/` retorna **zero** resultados. Não há
`sentry_sdk` em `apps/api` e `plane/utils/exception_logger.py` usa só o `logging` stdlib.
Minha atribuição do vazamento ao Sentry na rodada 1 era infundada.
O vetor apontado pelo Stage B é o correto e é **pior** do que o que eu havia descrito:
`plane/middleware/logger.py:62` emite
`f"{request.method} {request.get_full_path()} {response.status_code}"`, e
`RequestLoggerMiddleware` está registrado em `MIDDLEWARE` (`common.py:116`). Como
`get_full_path()` inclui a query string, o token vazaria em **toda** requisição inbound
bem-sucedida, não apenas nos 500 — exposição contínua, não excepcional.
Varri os demais candidatos: os únicos outros `get_full_path()` são `print()` de debug em
`plane/space/views/base.py:112,195`, que não estão no caminho do inbound. A mitigação proposta
(redigir `token=` no middleware + header com precedência + rotação documentada) **cobre a
superfície da aplicação por completo**. O ponto 3 do plano (access log do proxy) reconhece
corretamente o que fica fora do controle do código.

### Sobre o #5 — o 3º `RunPython` é seguro e reversível
Verifiquei o campo: `delivery_channels = models.JSONField(default=list, blank=True)`
(`plane/db/models/helpdesk.py:229`) e `is_internal = models.BooleanField(default=False)` (`:221`).
- **Seguro**: iterar em Python sobre o modelo histórico e reescrever a lista é a abordagem certa
  para `JSONField` (manipulação de array jsonb em SQL puro seria frágil). O manager histórico é
  o `models.Manager` puro, então enxerga todas as linhas — correto para uma normalização de dados.
- **Reversível**: `reverse=noop` é a escolha certa e é **consistente com os passos 1 e 2**. Um
  downgrade deixa os dados normalizados, o que é inofensivo: o schema antigo aceita a combinação.
  Não há perda de informação recuperável (a combinação removida era o próprio bug RC-2).
- **Defensivo**: o `RunPython` precisa tolerar `delivery_channels` não-lista (o campo é
  `blank=True`; linhas com `None` ou com outro tipo não devem quebrar a migration). Vale um
  `isinstance(value, list)` antes do `remove`.

---

## Condições de implementação vinculantes

### A: a condition do índice parcial pode impedir seu próprio uso — RC-5 voltaria silenciosamente
**Tipo**: abordagem · **Severidade**: ⚠️ importante (**vinculante**)

Remover o `db_index=True` foi a decisão certa, e minha sugestão #8 da rodada 1 estava correta
**no raciocínio** — mas incompleta. Verifiquei o driver: `requirements/base.txt:8` fixa
**`psycopg==3.3.0`**. Isso muda a análise.

A condition adotada é:
```
Q(deleted_at__isnull=True) & Q(email_message_id__isnull=False) & ~Q(email_message_id="")
```
A query do inbound (`inbound.py:85` e `:92`, via `SoftDeletionManager`) é
`email_message_id = $1 AND deleted_at IS NULL`. Para usar um índice parcial, o planner do
Postgres precisa **provar** que o predicado da query implica a condition do índice:
- `deleted_at IS NULL` → provado, é literal.
- `email_message_id IS NOT NULL` → provado, `= $1` implica não-nulo.
- `email_message_id <> ''` → **não é provável a partir de `= $1`**, porque `$1` poderia ser `''`.

Diferente do psycopg2 (que interpolava parâmetros no cliente, entregando um literal ao Postgres),
o **psycopg3 usa binding no servidor** e prepara automaticamente statements repetidos
(`prepare_threshold=5` por padrão). Nas primeiras execuções o Postgres monta um *custom plan* com
o valor conhecido e o índice é usado; depois que o statement é preparado e o planner passa para
*generic plan*, `$1` fica desconhecido, a prova falha e a consulta cai em **seq scan**. Ou seja:
o índice funciona nos testes e nas primeiras chamadas, e **degrada exatamente sob a repetição que
caracteriza a produção** — RC-5 reintroduzido de forma silenciosa e difícil de diagnosticar.

**Correção (uma linha)**: remover `& ~Q(email_message_id="")` da condition, deixando
```
condition=Q(deleted_at__isnull=True) & Q(email_message_id__isnull=False)
```
A exclusão de string vazia é **redundante**: o Bloco 3b já normaliza `""` → `None` na extração do
`Message-ID`, e o fallback sintético do RC-8 nunca produz string vazia. Com a condition reduzida,
a prova de implicação é trivial em qualquer plano e o índice é sempre elegível.

*Se o Fix quiser manter a garantia contra `""`*, a alternativa correta é um `CheckConstraint`
separado (`~Q(email_message_id="")`), que impõe a invariante **sem** entrar na condition do índice.

### B: o "complemento" do T11 testa o `RunPython` de um jeito que não funciona
**Tipo**: edge case · **Severidade**: ⚠️ importante (**vinculante**)

O T11 termina com: *"teste de dados verificando que o `RunPython` do passo 3 removeu `"email"` de
`delivery_channels` nas linhas com `is_internal=True`"*. Isso **não é executável como teste unitário
comum**: o Django roda todas as migrations na **criação do banco de teste**, quando ele está vazio.
Não existe linha legada para o `RunPython` transformar. O teste passaria com 0 linhas antes e 0
depois — **verde e vazio**, dando falsa confiança justamente sobre o passo de migration mais novo
do plano.

**Correção**: escolher uma das duas e registrar no plano:
1. **Remover** esse complemento do T11 (o núcleo do T11 — PATCH em comentário legado permanece
   editável — é válido e suficiente, pois cria a linha legada via ORM dentro do teste). Passar a
   verificação do `RunPython` para a checagem de pré-deploy, que já tem a query correspondente na
   seção de SQL.
2. Ou testar de verdade, com o `MigratorExecutor` (`django.db.migrations.executor`) para regredir
   até `0154`, semear a linha e reaplicar `0155` — caro e frágil; só vale se o Fix julgar necessário.

Recomendo a opção 1.

---

## Sugestões (não vinculantes)

### C: seam do mock do T9b não está especificado
**Severidade**: 💡 sugestão
O plano foi rigoroso ao fixar o seam do `get_inbound_secret` (**[B2-#2]**), mas o T9b diz apenas
"mockar `get_email_configuration`" sem dizer onde. `helpdesk_email_task.py:16` importa a função
**no topo do módulo**, então o único patch que funciona é
`plane.bgtasks.helpdesk_email_task.get_email_configuration`. Patchar
`plane.license.utils.instance_value.get_email_configuration` **não** teria efeito. Vale explicitar,
pela mesma razão que motivou o #2.

### D: a SQL de pré-deploy do R6 é frouxa
**Severidade**: 💡 sugestão
`delivery_channels::text LIKE '%email%'` casaria também com valores como `"email_backup"` ou
`"no_email"`. Como o campo é `JSONField` (jsonb), o teste exato é
`delivery_channels @> '["email"]'`. Só afeta a contagem de pré-deploy, não a migration.

---

## Pontos Fortes da revisão 2
- **A correção do #7 é melhor que a crítica original.** O Stage B não aceitou a premissa errada,
  foi ao código, mostrou que não há Sentry e encontrou um vetor **mais grave** (vazamento em toda
  requisição, não só em erro). É o comportamento certo diante de uma revisão incorreta.
- **#5 resolvido em duas frentes complementares**: a semântica "rejeitar só quando introduzido pelo
  payload" trata o futuro, o `RunPython` trata o passado. Nenhuma das duas sozinha bastaria — com
  só a semântica, linhas legadas continuariam violando RC-2 silenciosamente; com só a migration,
  a corrida entre deploy e tráfego deixaria janela.
- **#6 é a correção mais substantiva**: mover a normalização para depois do `if portal.smtp_host:`
  cobre a origem de instância, que escapava do serializer **e** do `CheckConstraint`. O edge case
  do T9b com `EMAIL_PORT="465"` como **string** ataca exatamente a armadilha de tipo.
- **#4 com o edge case "mesmo corpo, `Date` diferente → ambos criados"** — o teste codifica a
  propriedade que motivou a mudança, não só o caminho feliz.
- **#8 foi aplicado com disciplina**: removeu o `db_index=True` **e** o `AlterField` que dependia
  dele, e rebaixou o R5 em vez de deixar o risco desatualizado na tabela.
- **T1 com `first_responded_at` continua `None`** fecha a lacuna de SLA que ninguém assertava.

## Resumo
- Aprovado: ✅ **APPROVED** (com 2 condições vinculantes)
- Bloqueadores: 0
- Condições vinculantes: 2 (**A** condition do índice parcial vs. psycopg3; **B** teste vazio do `RunPython` no T11)
- Sugestões: 2 (**C** seam do T9b; **D** SQL de pré-deploy com `@>`)
- Correções da rodada 1 verificadas: 10/10 corretas
