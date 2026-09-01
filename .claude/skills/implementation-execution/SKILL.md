---
name: implementation-execution
description: Protocolo de execução de um plano aprovado no Plane — ciclo TDD RED→GREEN→REFACTOR com pytest, anti-padrões de TDD, paralelização, ordem de implementação backend/frontend e regras críticas. Leia ANTES de escrever a primeira linha de código.
---

# Implementation Execution

Executa o plano aprovado, step a step, com código que segue as convenções que já existem no repo.

> **Padrões de código** não estão aqui — estão nas skills específicas:
> `django-orm-patterns` (backend) · `mobx-swr-patterns` (frontend) ·
> `celery-task-patterns` (async) · `multi-tenancy-security` (escopo) ·
> `test-quality-standards` (qualidade de teste) · `test-debugging-pitfalls` (quando falhar).
> **Comandos**: `.claude/instructions/stack.md` e skill `tdd-commands`.

Use **depois** que o plano foi revisado e aprovado.

## Ciclo TDD (obrigatório onde existe runner)

Runner existe em `apps/api` (pytest) e `apps/live` (vitest). **Não existe** em `apps/web`,
`apps/admin`, `apps/space` — ver "Frontend" abaixo.

Para cada função/endpoint/task:

1. **RED** — escreva o teste, rode, **veja falhar**:
   ```bash
   cd apps/api && python -m pytest plane/tests/.../test_x.py::TestX::test_y
   ```
   Tem que falhar (import error, assertion, 404…). Se passar de primeira, o teste está errado —
   corrija o teste antes de seguir. Você **precisa ver a saída da falha**.

2. **GREEN** — escreva o mínimo de código de produção, rode o mesmo comando, **veja passar**.
   Só o suficiente para o teste passar. Não escreva código de vários componentes entre runs.

3. **REFACTOR** — limpe nomes, extraia repetição, remova debug. Rode de novo para confirmar.

### Anti-padrões de TDD — nenhum é aceitável

- ❌ Escrever teste e código juntos e rodar uma vez só — você nunca provou que o teste pega o bug
- ❌ Todos os testes primeiro, depois todo o código — RED e GREEN têm que se alternar
- ❌ Pular o RED porque "obviamente não vai passar" — rode assim mesmo; a saída revela problema
  de setup cedo
- ❌ Quebrar um teste que passava para alegar um RED — a falha tem que ser natural
- ❌ **Escrever todos os steps e rodar os testes no fim** — a pior violação: os testes viram
  retroativos e travam o comportamento atual, inclusive o bugado; e os bugs se acumulam,
  tornando a causa raiz muito mais difícil de achar
- ❌ Justificar com "escopo grande" ou "eficiência" — tarefa grande precisa **mais** de TDD,
  porque bug composto. "Rodo os testes no fim" e "backend primeiro" são desculpas inválidas

### Gate estrutural (por step do plano)

1. Teste → run → **RED**
2. Código de produção → run → **GREEN**
3. Registre a evidência no step correspondente do plano
4. **Confirme a evidência antes de começar o próximo step**

Com 2+ arquivos de produção escritos desde o último run de teste, você está em violação: pare,
rode o que está pendente, registre, e só então continue.

### Registro dos ciclos

```
Ciclos TDD:
1. RED: test_rejects_unverified_sender → FAIL (esperava 403, veio 201) ✓
   GREEN: verificação de autenticidade em inbound.py:134 → PASS ✓
2. RED: test_scopes_to_workspace → FAIL (retornou dado de outro workspace) ✓
   GREEN: filtro workspace__slug no get_queryset → PASS ✓
```

## Frontend — sem runner

Em `apps/web|admin|space` **não existe** jest, vitest nem Playwright. Não escreva teste
automatizado fictício e não relate run que não aconteceu.

O gate por step é:
```bash
pnpm --filter <app> check:types      # obrigatório
pnpm --filter <app> check:lint
```
mais o **cenário de browser** registrado para o Stage UX. Registre como
`TDD: N/A (sem runner)` + `Validação: check:types ✅` + o cenário.

Lógica que merece teste de verdade deve ser extraída para `packages/*` ou `apps/live`.

## Ordem de implementação

Backend, dentro de `apps/api`: **model → migration → serializer → view → url → task**.
Frontend: **tipos (`packages/types`) → service → store MobX → componente → rota**.

Backend antes de frontend, sempre: o frontend precisa do contrato real, não do planejado.

## Paralelização

Vale paralelizar via subagents quando os steps são **independentes** — módulos diferentes, sem
arquivo compartilhado. Não paralelize steps que tocam o mesmo arquivo ou onde um depende do
contrato do outro; o merge custa mais que o ganho.

## Regras críticas

1. Siga o `## Pattern Sources` do plano — copie a estrutura dos arquivos citados, não invente
2. Toda query filtra por workspace (e membresia do projeto quando aplicável)
3. `permission_classes` explícita; GUEST não escreve
4. `workspace`, `project`, `created_by`, `updated_by` sempre `read_only_fields`
5. NUNCA edite migration existente — crie nova
6. `AddField` com `null=False` precisa de default, senão quebra em base populada
7. NUNCA `print()`/`breakpoint()`/`console.log` em código de produção — conserte o mock
8. Rode o teste alvo primeiro; a suíte completa só depois que o alvo passar
9. Serializer de superfície pública com `fields` explícito, nunca `"__all__"`
10. Componente que lê observable MobX precisa de `observer`
11. Teste falhando: 3 tentativas → skill `test-debugging-pitfalls` → escale
12. A ~50% dos steps, releia a task original e o plano. Desvio → pergunte antes de continuar

## Checklist de finalização

- [ ] Todos os steps do plano implementados (ou os pulados estão documentados com motivo)
- [ ] Ciclos RED→GREEN ≥ steps com código de produção em `apps/api`/`apps/live`
- [ ] Evidência de TDD registrada por step
- [ ] `cd apps/api && python -m pytest` verde
- [ ] `pnpm --filter <app> check:types` verde para cada app de frontend tocado
- [ ] Migration aplica limpo (`python manage.py migrate`)
- [ ] Teste de isolamento cross-workspace escrito para endpoints novos
- [ ] Sem debug statement em código de produção
- [ ] Checkpoint de sessão escrito com arquivos alterados e resultado dos testes
