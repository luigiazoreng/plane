---
name: "Feature - Seed"
description: "Stage H-Seed: prepara o ambiente de teste para o Stage H-UX — garante usuário, workspace e dados de projeto no Plane local via management commands do Django, e salva as credenciais em SESSION_DIR/ux-test-credentials.md."
---

# Feature - Seed (Stage H-Seed)

Você prepara o **estado de teste** que o Stage H-UX vai exercitar no browser, e registra as
credenciais para ele.

> **📂** Escrita em `.claude/memories/` só via **Memory Organizer** — uma chamada no handoff.
> **🇧🇷** Português (pt-BR). **🧰** Comandos e portas: `.claude/instructions/stack.md`.
> **⛔** Você opera **somente no ambiente local**. Nunca em produção, nunca via SSH.

## Boot

```bash
S=$(cat .claude/memories/current-fix-session.txt 2>/dev/null) && M=fix || \
  { S=$(cat .claude/memories/current-session.txt) && M=feat; }
D=.claude/memories/${M}-sessions/$S; echo "SESSION_DIR=$D"; ls "$D"
```

**Guard**: exige um checkpoint de build ou de fix (`stage-b1-build-backend.md`,
`stage-b2-build-frontend.md`, `stage-f-fix.md` ou `stage-c-fix.md`). Se `stage-h-seed.md` já
existir com status DONE e o workspace ainda responder, **mostre as credenciais existentes e
pare** — não recrie ambiente à toa.

Leia `final-plan.md` (ou `fix-plan.md`) e o checkpoint de build para saber **que dados a feature
precisa**: projeto com ciclos? request de helpdesk? membro GUEST? Seed genérico que não cobre o
cenário da feature não serve para nada.

## Phase 1 — Infra

```bash
docker compose -f docker-compose-local.yml ps
curl -s -o /dev/null -w 'api: %{http_code}\n' --max-time 3 http://localhost:8000/api/
```

`plane-db` ou `api` fora do ar → STOP e peça ao dev:
```bash
docker compose -f docker-compose-local.yml up -d
```
Não tente subir em foreground; bloqueia o terminal.

## Phase 2 — Usuário

O seed exige um usuário **que já tenha feito login** no Plane. Verifique:

```bash
cd apps/api && python manage.py shell -c "
from plane.db.models import User
print(User.objects.filter(email='<email>').values('id','email','is_active').first())"
```

- **Existe e ativo** → siga.
- **Existe e inativo** → `python manage.py activate_user <email>`
- **Não existe** → o usuário precisa se cadastrar pela UI (`http://localhost:3000`) uma vez.
  Peça ao dev o e-mail e a senha de um usuário local existente. ⛔ Não invente credencial nem
  crie usuário por caminho que pule o fluxo de signup.

Senha esquecida: `python manage.py reset_password <email>`.

## Phase 3 — Workspace e dados

`python manage.py create_dummy_data` é **interativo** (usa `input()`) e não funciona por tool.
Use a função do bgtask direto, que aceita kwargs:

```bash
cd apps/api && python manage.py shell -c "
from plane.db.models import User, Workspace, WorkspaceMember
from plane.bgtasks.dummy_data_task import create_dummy_data

slug, email = 'ux-<feature-slug>', '<email-do-usuario>'
user = User.objects.get(email=email)
ws, created = Workspace.objects.get_or_create(
    slug=slug, defaults={'name': 'UX <Feature>', 'owner': user})
WorkspaceMember.objects.get_or_create(workspace=ws, member=user, defaults={'role': 20})
if created:
    create_dummy_data(slug=slug, email=email, members=[],
                      issue_count=15, cycle_count=2, module_count=2,
                      pages_count=3, intake_issue_count=2)
print('slug:', ws.slug, '| id:', ws.id, '| criado agora:', created)"
```

- Ajuste as contagens ao que a feature precisa — não gere 200 issues para testar um botão.
- `get_or_create` mantém a operação **idempotente**: rodar de novo não duplica workspace.
- Papéis: `20` ADMIN, `15` MEMBER, `5` GUEST. Se a feature envolve permissão, crie também um
  membro GUEST — é o cenário que mais revela bug de autorização.
- Adicionar membro a projeto: `python manage.py create_project_member --project_id <id> --user_email <email>`

Dado específico da feature (helpdesk request, estimate, KPI…) que o `create_dummy_data` não
cobre: crie pelo shell usando os models, seguindo a skill `django-orm-patterns`.

## Handoff

Uma chamada ao Organizer: `WRITE_UX_CREDENTIALS` → `WRITE_SESSION_FILE` (`stage-h-seed.md`) →
`UPDATE_PHASE`.

`ux-test-credentials.md`, no mínimo:
```markdown
# Credenciais de Teste UX
## Acesso
- App: http://localhost:3000/<workspace-slug>
- E-mail: <email> | Senha: <senha> | Papel: ADMIN
## Membros adicionais
- <email> | <senha> | Papel: GUEST   (se criado)
## Workspace
- Slug: <slug> | ID: <uuid>
## Dados criados
- Projetos: N | Issues: N | Ciclos: N | Módulos: N | Páginas: N
## Específico da feature
- [o que foi criado sob medida e onde encontrar na UI]
## URLs úteis
- <rota da feature>
```

> ⛔ Credenciais ficam **só** em `SESSION_DIR`. Nunca em `.claude/memories/repo/`.

```markdown
# Stage H-Seed
- Workspace: <slug> (novo | reaproveitado)
- Usuário: <email> — ADMIN | GUEST adicional: sim/não
- Dados: [resumo]
- Cenário da feature coberto: ✅/❌ — [o que faltou, se algo]
- Próximo: Stage H — UX
```

Se algum dado necessário **não** pôde ser criado, diga explicitamente no handoff — o Stage H
precisa saber que aquele cenário não é testável, em vez de reportar falha falsa.
