---
name: test-quality-standards
description: Regras não-negociáveis de qualidade de teste para pytest/Django no Plane (a–m) com exemplos ❌/✅ — especificidade, caminhos negativos, isolamento cross-workspace, efeitos colaterais, disciplina de mock, mínimos, estado downstream, ciclo de vida, matriz de cobertura, pré-condições, aritmética exata e transições inválidas.
---

# Test Quality Standards — pytest + Django

Critérios **não-negociáveis**. Teste que falha nestes checks é 🔴 CRITICAL na revisão e precisa
ser reescrito. **Teste preguiçoso conta como teste ausente.**

> Comandos e onde cada teste vive: `.claude/instructions/stack.md` e skill `tdd-commands`.
> ⚠️ `apps/web|admin|space` não têm runner — lá não existe teste automatizado. Ver regra **g**.

## a. Especificidade — teste o comportamento real

- ❌ `assert response` / `assert result is not None` — passa mesmo com o valor errado
- ❌ `assert response.status_code == 200` sozinho, sem olhar o corpo
- ✅ `assert response.json()["name"] == "esperado"`
- ✅ `assert response.json()["workspace"] == str(workspace.id)` — shape **e** valor
- ✅ `assert len(response.json()["results"]) == 3` + verificar as propriedades de cada item

## b. Caminhos negativos (🔴 CRITICAL se faltar)

Para toda view ou função de domínio:
- Input inválido (campo obrigatório ausente, tipo errado, string vazia) → 400 com o erro certo
- Não autorizado (papel insuficiente, não-membro, sem auth) → 403
- Não encontrado (id inexistente, recurso removido) → 404
- Limites (lista vazia, contagem zero, página além do fim)

Asserte a **mensagem/código** do erro, não só a faixa do status.

## c. Isolamento de tenant (🔴 CRITICAL para qualquer código que toca o banco)

- Criar dado no workspace A, consultar como usuário do workspace B → **vazio ou 403/404**
- Esse teste é obrigatório para todo endpoint escopado por workspace/project
- Inclua o caso `GUEST` tentando escrever e o de membro com `is_active=False`
- ❌ Pular porque "a permission class cuida disso" — teste mesmo assim

## d. Efeitos colaterais

Se a mutação dispara algo, o teste verifica esse algo:
- Task Celery enfileirada → `mock_delay.assert_called_once_with(...)` com os argumentos certos
- Registro de atividade/notificação criado → conferir os campos
- Webhook disparado → conferir payload
- ❌ Testar só o valor de retorno e ignorar o resto

## e. Disciplina de mock

- ❌ `Mock(return_value={})` — dict vazio esconde bug de campo faltante
- ❌ Mockar o próprio objeto sob teste — você testa o mock, não o código
- ✅ Mocke só dependência externa (HTTP, S3, e-mail, `.delay` de task)
- ✅ O retorno mockado precisa conter **todos** os campos que o código de produção lê
- ✅ Patch no módulo que **usa** o símbolo, não onde ele é definido → skill `test-debugging-pitfalls`

## f. Mínimos por componente

| Componente | Mínimo |
|---|---|
| View / endpoint | ≥4 (sucesso + auth + validação + not-found) e ≥1 de isolamento |
| Serializer | ≥3 (válido + campo inválido + campo read-only ignorado) |
| Model / manager | ≥2 (caminho normal + borda) |
| Task Celery | ≥2 (executa + idempotente/objeto inexistente) |

Um teste por função é sinalizado como ⚠️ IMPORTANT na revisão.

## g. Frontend

`apps/web`, `apps/admin` e `apps/space` **não têm runner de teste**. Não escreva teste
automatizado fictício e não declare cobertura que não existe.

O que vale como verificação:
- `pnpm --filter <app> check:types` passando
- Cenário de browser descrito e executado no Stage UX
- Estados de loading / vazio / erro exercitados nesse cenário

Lógica que **precisa** de teste automatizado deve ser extraída para `packages/*` (testável pelo
consumidor em `apps/api`) ou `apps/live` (vitest).

## h. Estado downstream (🔴 CRITICAL se faltar)

Teste de mutação verifica o estado **depois**, com uma leitura nova — não confia no retorno da
própria mutação. "O write não deu erro" não prova que mudou o que devia.

## i. Ciclo de vida completo (🔴 obrigatório em fluxo multi-etapa)

Feature com sequência (criar → atribuir → mover de estado → fechar) precisa de ao menos um teste
cobrindo a sequência inteira. Testes unitários por etapa não pegam bug de ciclo de vida.

## j. Matriz de cobertura

Antes de escrever, enumere os cenários como docstring no topo do arquivo de teste:

```python
"""
Matriz de cobertura:
| Cenário         | ADMIN | MEMBER | GUEST | Outro workspace |
|-----------------|-------|--------|-------|-----------------|
| Criar           | ✅    | ✅     | ❌403 | ❌404           |
| Listar          | ✅    | ✅     | ✅    | ❌ vazio        |
| Input inválido  | ✅400 | -      | -     | -               |
"""
```
Célula não coberta: `# COVERAGE GAP: [motivo]`.

## k. Pré-condição (🔴 CRITICAL se faltar)

Antes de toda mutação, asserte o **estado inicial**. Sem isso o teste passa mesmo quando a
mutação não faz nada.

```python
assert issue.state.group == "backlog"          # pré-condição
session_client.patch(url, data={"state_id": str(done_state.id)})
issue.refresh_from_db()                         # leitura nova
assert issue.state.group == "completed"
```

`refresh_from_db()` não é opcional: sem ele você asserta o objeto velho em memória.

## l. Aritmética exata

- ❌ `assert count > 0` — passa mesmo se subiu quando devia descer
- ❌ `assert after != before` — passa com o delta errado
- ✅ `assert after == before - 3` — delta exato

## m. Transição de estado inválida (🔴 obrigatório onde há campo de status)

- Tentar a transição proibida a partir do estado errado
- Esperar 4xx
- Asserir que **nenhum** efeito colateral ocorreu (contador intacto, task não enfileirada)

---

## Fluxos de finalização — atenção redobrada

Qualquer operação de "concluir", "fechar", "arquivar" ou "cancelar" precisa verificar tudo:
- O campo terminal mudou
- Todo contador/derivado a jusante foi atualizado com o valor exato
- A variante "não faz nada" (já concluído, quantidade zero) **não** altera contador
- O novo estado aparece no endpoint de **listagem**, não só no detalhe
