# Helpdesk Feature - Plane

Este documento serve como base técnica, histórico de desenvolvimento e rastreador de tarefas (TODO) para a implementação do módulo de Helpdesk no Plane.

## Visão Geral da Feature

O módulo de Helpdesk permite que usuários externos ou internos criem "Requests" (chamados/tickets) através de um formulário. Esses requests podem ser respondidos pelos agentes e vinculados a "Issues" (cards de desenvolvimento) do Plane, garantindo um acompanhamento claro entre a solicitação do cliente e a entrega da equipe técnica.

### Tipos de Acesso

Conforme definido no planejamento:

- **Público:** Formulários abertos onde qualquer pessoa com o link pode enviar um request sem necessidade de autenticação.
- **Autenticado (Clientes):** Formulários que exigem login (apenas e-mail e senha). Os clientes terão um portal básico para visualizar seus próprios chamados e interagir com eles.

---

## Arquitetura Atual (pós redesign workspace-level)

O Helpdesk opera no nível de workspace — um portal central de suporte pode receber tickets e encaminhá-los para qualquer projeto do workspace via integração com o Intake.

```
Workspace
└── Helpdesk (nível workspace)
    ├── Portal A  →  Tickets  →  [Encaminhar para Intake do Projeto X]
    └── Portal B  →  Tickets  →  [Encaminhar para Intake do Projeto Y ou Z]
```

Cada ticket pode ter:

- Referências a **Intake Issues** (geradas pelo "encaminhar para Intake")
- Referências a **Issues** diretamente (vinculação manual ou auto-criada ao aceitar no Intake)

Os sistemas são **independentes**: encaminhar para um projeto cria um IntakeIssue lá, mas status não sincronizam de volta para o ticket do Helpdesk. Quando o dev team aceita um Intake Issue, a issue resultante é automaticamente adicionada em "Linked Issues" do ticket original.

---

## Estrutura de Modelos (Backend - Django)

Todos os modelos herdam de `WorkspaceBaseModel` (workspace FK obrigatório, project nullable).

### 1. Modelos de Autenticação de Cliente

- `HelpdeskCustomer`: Uma nova entidade (separada do `User` do Plane ou uma extensão dele) para clientes.
  - Campos: `email`, `password` (hash), `name`, `is_active`.
- `HelpdeskCustomerToken`: Gerenciamento de sessões/tokens para os clientes do helpdesk.

### 2. Modelos do Portal e Configuração

- `HelpdeskPortal`: Configuração do helpdesk a nível de workspace.
  - Campos: `workspace` (FK), `is_public` (Boolean), `require_login` (Boolean), `public_slug` (SlugField).

### 3. Modelos de Solicitação (Requests)

- `HelpdeskRequest`: O Ticket em si.
  - Campos: `portal` (FK), `customer` (FK - nullable se for público), `title`, `description`, `contact_email` (usado se não houver customer), `status`, `source` (Public Form, Internal Form).
- `HelpdeskRequestComment`: Histórico de mensagens do ticket.
  - Campos: `request` (FK), `actor` (FK para `User` - agente), `customer` (FK para `HelpdeskCustomer` - cliente), `content`, `is_internal`.

### 4. Modelo de Vinculação com Issues (Integração)

- `HelpdeskRequestIssue`: Tabela pivot (N:N) para issues existentes do Plane.
  - Campos: `request` (FK), `issue` (FK), `created_by` (FK - User).

### 5. Modelo de Vinculação com Intake (Dev Pipeline)

- `HelpdeskRequestIntakeIssue`: Registra que um ticket foi encaminhado para o Intake de um projeto.
  - Campos: `request` (FK), `intake_issue` (FK para `IntakeIssue`), `forwarded_to_project` (FK para `Project`), `created_by` (FK - User nullable).
  - `db_table`: `helpdesk_request_intake_issues`
  - `unique_together`: `["request", "intake_issue", "deleted_at"]`

---

## Tasks (Próximos Passos)

- [x] **Fase 1: Backend (Modelos e Autenticação)**
  - [x] Criar app/módulo de banco de dados (`apps/api/plane/db/models/helpdesk.py`).
  - [x] Implementar os modelos `HelpdeskCustomer`, `HelpdeskPortal`, `HelpdeskRequest`, `HelpdeskRequestComment` e `HelpdeskRequestIssue`.
  - [x] Criar as migrações (makemigrations) e aplicar no banco de dados.
  - [x] Implementar endpoints de autenticação (Login/Registro) para `HelpdeskCustomer` em `apps/api/plane/app/views/helpdesk/`.

- [x] **Fase 2: Backend (Endpoints da API e Testes de Contrato)**
  - [x] Endpoints para configuração do `HelpdeskPortal` (CRUD para os admins do projeto).
  - [x] Endpoints públicos para visualização do formulário (`GET` public portal info).
  - [x] Endpoints para criação de `HelpdeskRequest` (anônimo e autenticado).
  - [x] Endpoints para agentes do Plane visualizarem, comentarem e linkarem requests a Issues.
  - [x] Desenvolver suíte de testes de contrato (`test_helpdesk.py`) e validar 100% dos fluxos.

- [x] **Fase 3: Frontend (Painel do Agente)**
  - [x] Criar aba "Helpdesk" no menu lateral do projeto no Plane.
  - [x] Implementar Kanban/List View para exibir os `HelpdeskRequests`.
  - [x] Criar página de detalhes do Request com chat (comentários) e aba lateral para vinculação de Issues.

- [x] **Fase 4: Frontend (Portal do Cliente)**
  - [x] Criar rota pública para acesso ao portal do Helpdesk.
  - [x] Implementar fluxo de Login/Cadastro por e-mail para clientes.
  - [x] Implementar formulário de envio de tickets.
  - [x] Implementar listagem e visualização de tickets do próprio cliente logado.

- [x] **Fase 5: Redesign para Nível de Workspace + Dev Pipeline**
  - [x] Migrar todos os modelos de `ProjectBaseModel` para `WorkspaceBaseModel`.
  - [x] Criar modelo `HelpdeskRequestIntakeIssue` para integração com Intake.
  - [x] Criar e aplicar migração Django (`0126_helpdeskrequestintakeissue_workspace_level`).
  - [x] Atualizar URLs de `workspaces/<slug>/projects/<id>/helpdesk/` para `workspaces/<slug>/helpdesk/`.
  - [x] Atualizar Views, Serializers e `__init__.py` do módulo helpdesk.
  - [x] Criar `HelpdeskRequestIntakeIssueViewSet` com endpoint POST (cria IntakeIssue no projeto destino).
  - [x] Atualizar tipos em `packages/types/src/helpdesk.ts` (remover `project`, adicionar `IHelpdeskRequestIntakeIssue`).
  - [x] Atualizar serviço em `packages/services/src/helpdesk/helpdesk.service.ts` (novas URLs + métodos de intake).
  - [x] Refatorar `helpdesk.store.ts` para chaves workspace-level + observables de intake links.
  - [x] Criar páginas workspace-level: `/{wSlug}/helpdesk/` e `/{wSlug}/helpdesk/{requestId}`.
  - [x] Adicionar seção "Dev Pipeline" na página de detalhe (encaminhar para Intake, listar links, remover link).
  - [x] Adicionar Helpdesk ao sidebar workspace (`WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS`).
  - [x] Adicionar ícone `Headset` em `getSidebarNavigationItemIcon` (`ce/components/workspace/sidebar/helper.tsx`).
  - [x] Remover item "Helpdesk" do sidebar de projeto (`project-navigation.tsx`).
  - [x] Remover rotas antigas de projeto de `apps/web/app/routes/core.ts`.
  - [x] Deletar arquivos de páginas antigas (`projects/(detail)/[projectId]/helpdesk/`).

- [x] **Fase 6: Integração Intake → Linked Issues (auto-link ao aceitar)**
  - [x] `HelpdeskRequestIntakeIssueSerializer` expõe `intake_status`, `issue_id` e `project_identifier` via `SerializerMethodField`.
  - [x] `select_related` expandido para `intake_issue__issue` no ViewSet.
  - [x] `IntakeIssueSerializer.update` auto-cria `HelpdeskRequestIssue` quando status muda para ACCEPTED (1).
  - [x] Tipo `IHelpdeskRequestIntakeIssue` atualizado com `intake_status`, `issue_id`, `project_identifier`.
  - [x] Dev Pipeline card mostra badge de status (Pending / Accepted / Rejected / Duplicate).
  - [x] Quando aceito, card exibe link "View issue →" direto para o work item no projeto.

- [x] **Fase 7: UI Polish + Bug Fixes + Página de Settings**
  - [x] **Bug fix crítico:** páginas do Helpdesk usavam `<Header>` do `@plane/ui` (puro Row estilizado) — substituído por `AppHeader` do core em `page.tsx` e `[requestId]/page.tsx`. O `AppHeader` injeta o `ExtendedAppHeader` que renderiza o `AppSidebarToggleButton` quando a sidebar está collapsed, restaurando o botão de expandir.
  - [x] Dashboard refatorado: layout full-width sem sidebar de portal embutida, `AppHeader` com stats inline (total/active/resolved) e botão "Settings".
  - [x] Kanban card redesenhado: `border-l-2` colorida por status, título, descrição truncada, footer com avatar/email e data.
  - [x] List view redesenhada: chips de filtro por status no topo, rows com border-left colorida, badge de status clicável com dropdown inline para alteração sem navegar para o detalhe.
  - [x] `deletePortal` adicionado à interface e implementação do `helpdesk.store.ts`.
  - [x] Nova página `/{wSlug}/helpdesk/settings` com gestão completa de portais: criar, editar slug inline, toggles de visibilidade/login/chat, deletar com confirmação.
  - [x] Rota `helpdesk/settings` registrada em `apps/web/app/routes/core.ts` antes do catch-all `:requestId`.

---

## Pendências Técnicas

- **`hydrateLinkedIssues` na store**: Implementação simplificada que silenciosamente ignora issues não encontradas na store. Pode ser melhorada para buscar detalhes da issue via search de workspace aceitando o `projectId` como parâmetro adicional.
- **Atualização em tempo real do status do Intake**: O status refletido no Dev Pipeline só atualiza quando o usuário navega de volta ao ticket (re-fetch no `useEffect`). WebSocket/polling não implementado.

---

## Histórico de Desenvolvimento (Changelog)

- **[2026-06-15]**: Definição da arquitetura e criação deste documento base de planejamento. Aceite do modelo de acesso misto (público e com login via e-mail).
- **[2026-06-15]**: Conclusão das Fases 1 e 2. Modelos, Serializers, Views e URLs criados em `apps/api/plane/`.
- **[2026-06-16]**: Criação da suíte completa de testes de contrato para o Helpdesk. Correção do campo `deleted_at` para read-only para evitar erros de validação de unicidade no DRF. Habilitação do campo `request` gravável no serializer de request/issue e inclusão do método `perform_create` nas views para associar `project_id`. Todos os 10 testes de contrato passando com sucesso no ambiente Docker.
- **[2026-06-16]**: Conclusão da Fase 4 (Portal do Cliente).
  - Implementada a arquitetura completa no Frontend (Vite/React Router v7) sob a rota `/helpdesk/p/[publicSlug]`.
  - Construído a store MobX global (`public-helpdesk.store.ts`) utilizando Singleton isolado do estado principal para evitar vazamento de sessões.
  - Ajuste nas configurações do React Router explícito no projeto Plane (`apps/web/app/routes/core.ts`) garantindo precedência de rotas estáticas (`new`, `login`, `register`) em relação aos identificadores dinâmicos de ticket.
  - Melhorias de UX no envio anônimo de tickets para bloquear acessos 404 de recursos restritos via mensagens de sucesso diretas no componente.
- **[2026-06-17]**: Conclusão da Fase 3 (Painel do Agente). Bugs e gaps funcionais identificados e corrigidos:
  - Aba "Helpdesk" já existia no sidebar (`project-navigation.tsx`). Adicionado badge de contagem de requests ativos (open + in_progress + waiting), seguindo o padrão do Intake.
  - Kanban e List View já implementados com drag-and-drop entre colunas de status e stats rápidas (Total / Active / Resolved).
  - Página de detalhe do request com timeline de conversa (replies vs. internal notes) e sidebar de vinculação de issues já existentes.
  - **Correção crítica:** `fetchRequestIssues` na store buscava todas as request-issues do projeto sem filtrar por request. Corrigido adicionando `filterset_fields = ["request"]` no `HelpdeskRequestIssueViewSet` (backend) e passando `?request={requestId}` na chamada do serviço frontend.
  - **Funcionalidade nova:** Desvincular issues — adicionada action `deleteRequestIssue` na `HelpdeskStore` e botão "×" em cada card de linked issue na página de detalhe.
  - **Funcionalidade nova:** Seletor de status na página de detalhe — substituído `<Badge>` somente-leitura por `<select>` que chama `updateRequest` diretamente, permitindo alterar o status sem precisar do Kanban.
  - **Funcionalidade nova:** Seletor de assignees na página de detalhe — integrado o `MemberDropdown` (padrão Plane) no sidebar de detalhes, chamando `updateRequest({ assignees })`.
- **[2026-06-17]**: Redesign para nível de workspace (Fase 5). Motivação: Helpdesk acoplado a um único projeto não faz sentido operacionalmente — um agente de suporte precisa de visão global e capacidade de rotear tickets para diferentes equipes.
  - **Backend:** Todos os modelos migrados de `ProjectBaseModel` para `WorkspaceBaseModel`. Novo model `HelpdeskRequestIntakeIssue` criado. URLs movidas de `workspaces/<slug>/projects/<id>/helpdesk/` para `workspaces/<slug>/helpdesk/`. Novo ViewSet `HelpdeskRequestIntakeIssueViewSet` implementa a criação de Intake Issues no projeto destino (reutilizando padrão de triage state do `IntakeIssueListCreateAPIEndpoint`). Migração `0126` criada e aplicada no Docker.
  - **Frontend (packages):** Tipos atualizados em `@plane/types` — removido `project` dos portais/requests, adicionado `IHelpdeskRequestIntakeIssue`. Serviço em `@plane/services` atualizado com novas URLs e métodos de intake linking.
  - **Frontend (store):** `helpdesk.store.ts` refatorado para chaves `workspaceSlug` (era `workspaceSlug_projectId`). Adicionado observable `requestIntakeIssues` e actions `fetchRequestIntakeIssues`, `createRequestIntakeIssue`, `deleteRequestIntakeIssue`.
  - **Frontend (pages):** Novas páginas workspace-level em `/(all)/[workspaceSlug]/helpdesk/`. Página de detalhe inclui seção "Dev Pipeline" — botão "Encaminhar para Intake" abre modal com seleção de projeto destino, título e descrição; lista links existentes com badge do projeto e botão de remoção.
  - **Frontend (sidebar):** Helpdesk adicionado ao sidebar workspace via `WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS` com ícone `Headset` (lucide-react). Item removido do sidebar de projeto. Rotas antigas de projeto removidas de `core.ts` e arquivos deletados.
- **[2026-06-17]**: Integração Intake → Linked Issues (Fase 6).
  - `HelpdeskRequestIntakeIssueSerializer` passou a expor `intake_status` (int: -2 pending, -1 rejected, 1 accepted, 2 duplicate), `issue_id` (UUID da issue criada ao aceitar) e `project_identifier` via `SerializerMethodField`.
  - `IntakeIssueSerializer.update` agora detecta quando o status muda para ACCEPTED (1) e auto-cria um `HelpdeskRequestIssue` ligando a issue ao(s) ticket(s) do Helpdesk que encaminharam para esse Intake Issue — aparece automaticamente em "Linked Issues".
  - Dev Pipeline card redesenhado: exibe badge de status colorido (Pending/Accepted/Rejected/Duplicate) e, quando aceito, link "View issue →" direto para o work item no projeto de destino.
- **[2026-06-17]**: UI Polish + Bug Fixes + Página de Settings (Fase 7).
  - **Bug fix:** `<Header>` do `@plane/ui` substituído por `AppHeader` do core nas duas páginas do Helpdesk. Isso faz o `AppSidebarToggleButton` aparecer quando a sidebar está minimizada, restaurando o fluxo de expandir a sidebar.
  - **Dashboard redesenhado:** layout full-width sem sidebar de portal embutida; header com stats inline (total/active/resolved) e botão "Settings"; kanban card com `border-l-2` colorida por status, footer com email e data; list view com chips de filtro por status e dropdown inline de alteração de status por row.
  - **Página de Settings** (`/{wSlug}/helpdesk/settings`): gestão completa de portais — criar com slug sanitizado, editar slug inline, toggles individuais para is_public/require_login/enable_chat, botão de deletar com modal de confirmação. `deletePortal` adicionado à store e registrado nas actions do MobX.
