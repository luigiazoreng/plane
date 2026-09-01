---
name: test-debugging-pitfalls
description: Falhas comuns em testes pytest/Django no Plane — --nomigrations vs schema, --reuse-db desatualizado, fixtures e factories, isolamento de transação, mock no alvo errado, tasks Celery e tempo/timezone. Consulte ANTES de gastar mais de 2 tentativas num teste falhando.
---

# Test Debugging Pitfalls — pytest + Django

> Comandos e layout dos testes: `.claude/instructions/stack.md` e skill `tdd-commands`.
> `pytest.ini` já aplica `--reuse-db --nomigrations -vs --strict-markers`.

## 1. `--reuse-db` com schema velho (🔴 o mais comum)

**Sintoma**: `column ... does not exist`, `relation ... does not exist`, ou o teste não enxerga um
campo que você acabou de adicionar ao model.

**Causa**: o banco de teste é reaproveitado entre execuções. Model novo/alterado não chega nele.

**Correção**:
```bash
python -m pytest --create-db          # recria o banco de teste
python -m pytest --create-db -m unit  # só o subconjunto, mais rápido
```
Toda vez que mexer em model, o primeiro run é com `--create-db`.

## 2. `--nomigrations`

O schema de teste vem dos models, **não** das migrations. Consequência prática: um bug que só
existe na migration (default faltando, backfill errado, constraint) **não aparece nos testes**.

Migration precisa ser validada à parte:
```bash
python manage.py migrate            # em base com dados
python manage.py makemigrations --check --dry-run   # detecta model sem migration
```

## 3. Faltou marcar acesso ao banco

**Sintoma**: `Database access not allowed, use the "django_db" mark`.

```python
@pytest.mark.django_db          # em função de teste
class TestX:
    pytestmark = pytest.mark.django_db   # na classe inteira
```
Teste que usa `session_client`/`api_key_client` toca o banco — precisa da marca.

## 4. Marker inexistente

**Sintoma**: `'xyz' not found in markers configuration option`.

`--strict-markers` está ligado: só valem os markers declarados no `pytest.ini` —
`unit`, `contract`, `smoke`, `slow`, `e2e`. Novo marker exige entrada no `pytest.ini`.

## 5. Isolamento entre testes

**Sintoma**: passa isolado, falha na suíte (ou vice-versa).

- Cada teste roda em transação revertida ao final. O que **não** é revertido: cache
  (`django-redis`), arquivo no MinIO, estado de módulo e variável global.
- `pytest.fixture(scope="module"/"session")` que cria objeto de banco vaza entre testes. Prefira
  escopo de função para dados.
- Teste que depende da ordem é bug do teste. Confirme com `-p no:randomly` / rodando só ele.
- Contadores e sequências não voltam: não asserte `id == 1`.

## 6. Fixtures e factories

`plane/tests/conftest.py` e `plane/tests/factories.py` já oferecem o essencial. Antes de montar
objeto na mão, **procure a factory existente** — recriar setup diverge do resto da suíte.

**Sintoma**: `fixture 'x' not found` → a fixture está num `conftest.py` de outro diretório.
Fixture só é visível no próprio diretório e abaixo.

Objeto criado direto pelo ORM em teste não passa pelo `BaseModel.save()` com usuário de request —
`created_by` fica nulo. Se o teste depende disso, passe explicitamente.

## 7. Mock no lugar errado

Patch onde o objeto é **usado**, não onde é definido:

```python
# ❌ não intercepta: a view já importou o símbolo
@patch("plane.bgtasks.my_task.do_the_thing")

# ✅
@patch("plane.app.views.my_module.do_the_thing")
```

Task Celery: mocke `.delay` e asserte a chamada. Chamar a task de verdade no teste esconde o
enfileiramento e deixa o teste lento.

## 8. Permissão e escopo

**Sintoma**: esperava 200, veio 403 (ou o contrário).

- O usuário da fixture é membro **daquele** workspace/projeto? Com `is_active=True`?
- O papel permite a operação? `GUEST` (5) não escreve.
- 403 inesperado costuma ser fixture incompleta, não bug da view — confira antes de "corrigir" a
  permission class. Afrouxar permissão para o teste passar é como se cria falha de segurança.

## 9. Tempo e timezone

- `USE_TZ` ativo: use `django.utils.timezone.now()`, nunca `datetime.now()`.
- Congele o tempo em vez de dormir: `freezegun` ou monkeypatch do `timezone.now`.
- Não asserte igualdade exata de timestamp gerado pelo banco; use janela ou ordenação.

## 10. Circuit breaker

1. **1ª tentativa**: leia o erro de verdade — a linha do `assert` e o valor recebido.
2. **2ª**: percorra as seções acima (`--create-db`, `django_db`, alvo do patch, fixture).
3. **3ª**: isole — rode só o teste com `-x`; imprima o objeto em questão.
4. **Escale**: documente o erro e o que já tentou, e peça ajuda.

> ⛔ Nunca passe de 3 tentativas no mesmo teste sem escalar.
> ⛔ Nunca use `skip`/`xfail` para "seguir em frente" — isso apaga o sinal.
> ⛔ Nunca relaxe o assert até passar. Se a asserção certa falha, o código é que está errado.

## Checklist

- [ ] `--create-db` após mudar model
- [ ] `django_db` marcado onde há banco
- [ ] Marker declarado no `pytest.ini`
- [ ] Fixtures de dados em escopo de função
- [ ] Factory existente reaproveitada
- [ ] Patch no módulo que **usa** o símbolo
- [ ] `.delay` mockado em vez de executar a task
- [ ] Fixture de usuário com membresia e papel corretos
- [ ] `timezone.now()` e tempo congelado, sem `sleep`
- [ ] Migration validada fora do pytest (`--nomigrations` não a cobre)
