---
name: multi-tenancy-security
description: Isolamento e segurança no Plane — escopo por workspace/project em toda query, permission classes do DRF, papéis ADMIN/MEMBER/GUEST, superfícies pública (space/helpdesk) vs autenticada, e API externa por X-Api-Key. Leia ANTES de criar ou modificar qualquer endpoint, queryset ou serializer.
---

# Multi-Tenancy & Segurança — Plane

> Padrões de ORM e views: skill `django-orm-patterns`. Caminhos: `.claude/instructions/stack.md`.

## 1. Regra de ouro

> **Toda query que retorna dado de domínio filtra por workspace — e, quando for de projeto,
> também por membresia do usuário naquele projeto.**

Violação = usuário de um workspace lendo dado de outro. É a falha mais grave possível aqui.

O `slug` do workspace e o `project_id` vêm da **URL**, mas isso não autoriza nada por si só:
qualquer pessoa pode digitar outro slug. Quem autoriza é a permission class + o filtro de
membresia no queryset. Os dois, sempre.

## 2. Escopo em queryset

```python
# ❌ vaza entre workspaces
MyEntity.objects.all()
MyEntity.objects.filter(project_id=self.kwargs["project_id"])   # não prova que o user é membro

# ✅
MyEntity.objects.filter(workspace__slug=self.kwargs["slug"])
    .filter(project_id=self.kwargs["project_id"])
    .filter(project__project_projectmember__member=self.request.user,
            project__project_projectmember__is_active=True)
    .distinct()
```

Para entidade de workspace (sem projeto), o filtro de membresia é em `WorkspaceMember`.

Em mutação (`update`/`destroy`), não confie no id do corpo: recarregue o objeto pelo queryset já
escopado — `get_object_or_404(self.get_queryset(), pk=...)`, nunca `Model.objects.get(pk=...)`.

## 3. Permission classes

Não escreva checagem de papel na mão. Use as de `plane/app/permissions/`:

| Classe | Garante |
|---|---|
| `WorkSpaceBasePermission` | operações sobre o próprio workspace |
| `WorkSpaceAdminPermission` | só admin do workspace |
| `WorkspaceEntityPermission` | leitura para membro; escrita para admin/member |
| `WorkspaceViewerPermission` / `WorkspaceUserPermission` | leitura por membro ativo |
| `ProjectBasePermission` | membro do projeto; criação restrita |
| `ProjectMemberPermission` | membro ativo com papel de escrita |
| `ProjectEntityPermission` | leitura para qualquer membro ativo; escrita para ADMIN/MEMBER |
| `ProjectAdminPermission` | só admin do projeto |
| `ProjectLitePermission` | checagem leve de pertencimento |

Papéis (`plane/app/permissions/base.py`): `ADMIN = 20`, `MEMBER = 15`, `GUEST = 5`.
**GUEST não escreve** — `ProjectEntityPermission` já exclui guest em métodos não-seguros.

Toda permission exige `is_active=True`: membro removido do projeto continua com a linha em
`ProjectMember`. Esquecer isso dá acesso a ex-membro.

## 4. Serializers

- `workspace`, `project`, `created_by`, `updated_by` → **sempre `read_only_fields`**. Se o cliente
  puder enviá-los, ele escolhe o tenant onde grava.
- Nunca derive tenant do corpo do request. Derive da URL (já validada pela permission).
- Serializer de superfície pública precisa de `fields` explícito. `fields = "__all__"` num
  endpoint público vaza campos internos assim que alguém adicionar uma coluna ao model.
- Nunca serialize senha, token, secret, hash, nem e-mail de terceiro em contexto público.

## 5. Superfícies — cada uma tem regra própria

| Superfície | Rota | Auth | Cuidado |
|---|---|---|---|
| App web | `/api/` (`plane/app/`) | sessão | escopo por membresia, como acima |
| API externa | `/api/v1/` (`plane/api/`) | `X-Api-Key` | contrato público — mudança é breaking change |
| Portal público / space / helpdesk | endpoints de portal | **anônimo ou token de portal** | maior risco do repo |

Nos endpoints públicos (portal de helpdesk, páginas publicadas, webhooks de entrada):
- Identificador vindo do cliente (e-mail, id de request, token de portal) **não prova
  identidade**. Valide contra o registro correspondente antes de associar qualquer ator.
- Nunca promova dado de entrada a `actor`/usuário do workspace sem verificação independente.
- Segredo compartilhado de webhook autentica o **transporte**, não o remetente.
- Anexo recebido por canal público não herda a procedência de quem alega ter enviado.

## 6. Tarefas assíncronas

Task Celery roda **fora** do request: não há `request.user` nem permission class. Passe
`workspace_id`/`project_id` explicitamente e reaplique o escopo dentro da task. Ver skill
`celery-task-patterns`.

## 7. O que testar

Todo endpoint novo precisa de teste de isolamento, não só do caminho feliz:

```python
@pytest.mark.contract
def test_nao_acessa_entidade_de_outro_workspace(session_client, other_workspace_entity):
    r = session_client.get(f"/api/workspaces/{other_workspace_entity.workspace.slug}/entities/")
    assert r.status_code in (403, 404)
```

Cubra: usuário de outro workspace, não-membro do projeto, `GUEST` tentando escrever, e membro com
`is_active=False`.

## Checklist antes de fechar

- [ ] Queryset filtra por workspace **e** por membresia ativa
- [ ] Mutação recarrega o objeto pelo queryset escopado, não por id cru
- [ ] `permission_classes` explícita e correta para o nível da operação
- [ ] GUEST não consegue escrever
- [ ] Campos de tenant e auditoria `read_only` no serializer
- [ ] Endpoint público: `fields` explícito, identidade verificada, sem campo sensível
- [ ] Mudou `plane/api/`? avaliou impacto no contrato externo
- [ ] Teste de isolamento cross-workspace escrito e passando
