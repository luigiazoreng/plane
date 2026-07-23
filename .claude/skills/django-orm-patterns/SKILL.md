---
name: django-orm-patterns
description: Padrões Django/DRF do backend Plane (apps/api) — models sobre BaseModel, migrations seguras, querysets escopados por workspace/project, serializers e viewsets. Leia ANTES de criar ou modificar qualquer model, migration, serializer ou view.
---

# Django ORM & DRF — `apps/api`

> Caminhos e comandos: `.claude/instructions/stack.md`. Escopo de tenant: skill `multi-tenancy-security`.

## Models

Tudo herda de `BaseModel` (`plane/db/models/base.py`), que já dá `id` UUID (PK),
`created_at`/`updated_at` e `created_by`/`updated_by` preenchidos automaticamente via `crum`.

```python
from django.db import models
from plane.db.models.base import BaseModel

class MyEntity(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="my_entities")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="my_entities")
    name = models.CharField(max_length=255)

    class Meta:
        unique_together = ["name", "project"]
        verbose_name = "My Entity"
        db_table = "my_entities"
        ordering = ("-created_at",)
```

Regras:
- ⛔ Não declare `id`, `created_at`, `updated_at`, `created_by`, `updated_by` — vêm do `BaseModel`.
- Toda entidade de domínio tem FK para `Workspace` (e para `Project`, quando for de projeto).
- `related_name` sempre explícito; `on_delete` sempre consciente (`CASCADE` vs `SET_NULL`).
- Registre o model em `plane/db/models/__init__.py`.
- Campo textual opcional: `null=True, blank=True`. Evite `null=True` em `CharField` sem motivo.

## Migrations

```bash
cd apps/api
python manage.py makemigrations
python manage.py migrate
python manage.py showmigrations db | tail -20
```

O que quebra em produção:
- `AddField` com `null=False` **sem** `default` numa tabela populada → erro na migração.
  Correto: adicionar com `null=True`/default → backfill em `RunPython` → só então apertar.
- Rename/remove de coluna ainda consumida pela versão anterior do código → deploy quebra.
  Separe em duas releases.
- Índice em tabela grande: prefira `AddIndexConcurrently` (requer `atomic = False` na migration).
- Todo `RunPython` precisa de função reversa (ou `migrations.RunPython.noop` explícito).
- Nunca edite migration já aplicada em produção — crie uma nova.

## Querysets

O `BaseViewSet` (`plane/app/views/base.py`) já aplica `permission_classes`, filtros e paginação.
Sobrescreva `get_queryset` e **escope sempre**:

```python
def get_queryset(self):
    return (
        MyEntity.objects.filter(workspace__slug=self.kwargs["slug"])
        .filter(project_id=self.kwargs["project_id"])
        .filter(project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True)
        .select_related("project", "workspace")
        .prefetch_related("labels")
        .distinct()
    )
```

- `select_related` para FK/OneToOne; `prefetch_related` para M2M e reverse FK. Sem isso →
  N+1 em listagem.
- Use `.only()`/`.values()` quando a serialização não precisa do objeto inteiro.
- Filtro que cruza M2M pode duplicar linhas → `.distinct()`.
- Escrita em lote: `bulk_create`/`bulk_update` com `batch_size`. ⚠️ ambos **não** disparam
  `save()`, logo não preenchem `created_by`/`updated_by` — passe explicitamente.
- Operação multi-tabela → `transaction.atomic()`.

## Serializers

```python
from plane.app.serializers.base import BaseSerializer

class MyEntitySerializer(BaseSerializer):
    class Meta:
        model = MyEntity
        fields = "__all__"
        read_only_fields = ["workspace", "project", "created_by", "updated_by"]
```

- Campo derivado do request (`workspace`, `project`, `created_by`) é **sempre** `read_only` —
  senão o cliente escolhe o tenant dele.
- Validação de negócio em `validate_<campo>` / `validate`, não na view.
- Serializer público (portal `apps/space`, helpdesk) precisa de lista de `fields` explícita —
  nunca `"__all__"`.

## Views

```python
class MyEntityViewSet(BaseViewSet):
    model = MyEntity
    serializer_class = MyEntitySerializer
    permission_classes = [ProjectEntityPermission]
```

Permissions disponíveis em `plane/app/permissions/`: `WorkSpaceBasePermission`,
`WorkSpaceAdminPermission`, `WorkspaceEntityPermission`, `WorkspaceViewerPermission`,
`ProjectBasePermission`, `ProjectMemberPermission`, `ProjectEntityPermission`,
`ProjectAdminPermission`, `ProjectLitePermission`. Escolha a existente; não escreva checagem
manual de papel dentro da view.

Duas superfícies distintas:
- `plane/app/` → `/api/`, autenticação por sessão, consumida por `apps/web|admin|space`
- `plane/api/` → `/api/v1/`, autenticação por `X-Api-Key`, contrato **externo** — mudança aqui
  é breaking change para integrações de terceiros

## Testes

Ver `.claude/skills/tdd-commands/SKILL.md`. Resumo: `plane/tests/unit/` (models, serializers),
`plane/tests/contract/app/` (fixture `session_client`), `plane/tests/contract/api/`
(fixture `api_key_client`).

## Checklist antes de fechar

- [ ] Model herda de `BaseModel` e tem FK de workspace/project
- [ ] Migration aplica limpo em base populada (default/backfill)
- [ ] Queryset escopado por workspace **e** por membresia do usuário
- [ ] `select_related`/`prefetch_related` onde há acesso a relação
- [ ] Campos de tenant e auditoria como `read_only` no serializer
- [ ] `permission_classes` explícita e adequada à operação
- [ ] Mudou `plane/api/`? Confirmou impacto no contrato externo
