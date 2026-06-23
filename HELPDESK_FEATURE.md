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
  - Auto-assign v1:
    - `auto_assignment_enabled` (Boolean)
    - `auto_assignment_type` (`load_balance` no v1, com contrato aberto para novos tipos)
    - `auto_assignment_config` (JSON) com payload versionável, hoje usando principalmente `member_ids`

### 3. Modelos de Formulários Customizados

- `HelpdeskForm`: Define um formulário publicável dentro de um portal.
  - Campos: `portal` (FK), `name`, `description`, `slug`, `visibility` (`public` | `private`), `is_active`, `sequence`, `success_message`.
- `HelpdeskFormField`: Define os campos renderizados no builder e no portal público.
  - Campos: `form` (FK), `key`, `label`, `description`, `field_type`, `placeholder`, `help_text`, `required`, `sequence`, `options` (JSON), `validation` (JSON), `ui_props` (JSON), `is_system`.
  - Tipos v1: `system_title`, `system_description`, `short_text`, `long_text`, `select`, `checkbox`, `date`.

### 4. Modelos de Solicitação (Requests)

- `HelpdeskRequest`: O Ticket em si.
  - Campos: `portal` (FK), `form` (FK nullable), `customer` (FK - nullable se for público), `title`, `description`, `contact_email` (usado se não houver customer), `status`, `source` (Public Form, Internal Form), `form_responses` (JSON).
- `HelpdeskRequestComment`: Histórico de mensagens do ticket.
  - Campos: `request` (FK), `actor` (FK para `User` - agente), `customer` (FK para `HelpdeskCustomer` - cliente), `content`, `is_internal`.

### 5. Modelo de Vinculação com Issues (Integração)

- `HelpdeskRequestIssue`: Tabela pivot (N:N) para issues existentes do Plane.
  - Campos: `request` (FK), `issue` (FK), `created_by` (FK - User).

### 6. Modelo de Vinculação com Intake (Dev Pipeline)

- `HelpdeskRequestIntakeIssue`: Registra que um ticket foi encaminhado para o Intake de um projeto.
  - Campos: `request` (FK), `intake_issue` (FK para `IntakeIssue`), `forwarded_to_project` (FK para `Project`), `created_by` (FK - User nullable).
  - `db_table`: `helpdesk_request_intake_issues`
  - `unique_together`: `["request", "intake_issue", "deleted_at"]`

### 7. Controle de Acesso (RBAC)

- `HelpdeskMember`: Membros do workspace com acesso ao Helpdesk e seu role.
  - Campos: `member` (FK→`AUTH_USER_MODEL`), `role` (PositiveSmallIntegerField: Admin=20, Member=15, Guest=5), `is_active` (BooleanField, default=True).
  - `db_table`: `helpdesk_members`
  - `unique_together`: `["workspace", "member", "deleted_at"]` (soft-delete compatível)
  - Workspace admins (role=20 em `WorkspaceMember`) sempre recebem role ADMIN via bypass em `get_helpdesk_role()` — não precisam de linha explícita.

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

- [x] **Fase 8: Custom Forms v1 + Form Builder**
  - [x] Criar modelos `HelpdeskForm` e `HelpdeskFormField` com migração `0128_helpdesk_forms`.
  - [x] Estender `HelpdeskRequest` com `form` e `form_responses`.
  - [x] Criar data migration para gerar um `Default request form` em todos os portais existentes.
  - [x] Implementar endpoints workspace-level para CRUD/reorder/activate de forms e CRUD/reorder de fields.
  - [x] Implementar endpoints públicos para listar forms disponíveis, buscar schema por slug e submeter requests por form.
  - [x] Adicionar validação backend por tipo de campo, visibilidade (`public`/`private`) e opções obrigatórias de dropdown.
  - [x] Atualizar `@plane/types`, `@plane/services`, `helpdesk.store.ts` e `public-helpdesk.store.ts` para forms dinâmicos.
  - [x] Substituir o fluxo fixo `/helpdesk/p/[publicSlug]/new` por seleção de formulário + rota dinâmica `/helpdesk/p/[publicSlug]/forms/[formSlug]`.
  - [x] Renderizar respostas estruturadas (`form_responses`) na página de detalhe do request para agentes.
  - [x] Evoluir `/{wSlug}/helpdesk/settings` para um builder visual com sub-abas internas (`Portal settings`, `Form builder`, `Statuses`).
  - [x] Adicionar suporte a campo `Dropdown` no builder com gestão explícita de opções (`label` / `value`).

- [x] **Fase 9: Automatic Assignment v1**
  - [x] Estender `HelpdeskPortal` com configuração de atribuição automática por portal.
  - [x] Criar migração `0129_helpdeskportal_auto_assignment`.
  - [x] Modelar o contrato de estratégia com tipo `load_balance` e `auto_assignment_config` versionável.
  - [x] Implementar resolver backend dedicado para auto-assign fora das views, preparado para futuras estratégias.
  - [x] Aplicar auto-assign apenas na criação de tickets públicos, autenticados e internos.
  - [x] Definir comportamento de `load_balance` como "agente elegível com menor número de tickets Helpdesk ativos atribuídos".
  - [x] Definir desempate determinístico por menor `member_id` no v1.
  - [x] Manter fallback seguro: se não houver agentes elegíveis, o ticket é criado sem assignee.
  - [x] Adicionar seção "Automatic assignment" dentro de `Portal settings`, com toggle, tipo e multiselect de agentes elegíveis.
  - [x] Atualizar testes contratuais para cobrir persistência da configuração e resolução do assignee.

- [x] **Fase 10: Analytics + SLA**
  - [x] Adicionar `is_terminal: BooleanField(default=False)` em `HelpdeskStatus`.
  - [x] Adicionar `first_responded_at` e `resolved_at` em `HelpdeskRequest` (DateTimeField nullable).
  - [x] Adicionar `sla_first_response_hours` e `sla_resolution_hours` em `HelpdeskPortal` (IntegerField nullable).
  - [x] Criar migração `0130_helpdesk_analytics_fields` com `RunPython` para setar `is_terminal=True` em statuses com nome "resolved" ou "closed".
  - [x] Popular `first_responded_at` no primeiro comentário de agente (override `perform_create` em `comment.py`).
  - [x] Popular/limpar `resolved_at` em transições de status terminal (override `partial_update` em `request.py`).
  - [x] Criar `HelpdeskAnalyticsEndpoint` em `analytics.py` com rota `GET /api/workspaces/<slug>/helpdesk/analytics/`.
  - [x] Endpoint retorna `kpis`, `sla` e `charts` (time series, by_status, by_source, resolution_trend, top_agents).
  - [x] Granularidade automática: `TruncDate` para períodos ≤ 30 dias, `TruncMonth` para ≥ 3 meses.
  - [x] SLA compliance calculado via `ExpressionWrapper` + `DurationField` + `Avg`; retorna `null` quando SLA não configurado no portal.
  - [x] Adicionar tipos de analytics a `packages/types/src/helpdesk.ts`.
  - [x] Adicionar `getAnalytics()` ao `HelpdeskService`.
  - [x] Criar `helpdesk-analytics.store.ts` com cache key `${workspaceSlug}:${dateFilter}:${portalId}`.
  - [x] Registrar `helpdeskAnalytics` no `RootStore` (constructor + `resetOnSignOut`).
  - [x] Criar hook `use-helpdesk-analytics.ts`.
  - [x] Criar componentes em `apps/web/core/components/helpdesk/analytics/`: filtros, KPI cards, SLA card, 5 gráficos, layout.
  - [x] Criar página `/{wSlug}/helpdesk/analytics` com `AppHeader`, filtros inline e grid de 4 linhas.
  - [x] Registrar rota `analytics` em `apps/web/app/routes/core.ts` antes do catch-all `:requestId`.
  - [x] Adicionar botão "Analytics" (BarChart2) no header da listagem de helpdesk.

- [x] **Fase 11: Correção de Pendências e Qualidade**
  - [x] **hydrateLinkedIssues determinístico:** substituída hidratação "best effort" por fluxo com `linkedIssueProjectMap` auxiliar (`issueId → projectId`) na store; adicionado `HelpdeskLinkedIssueLookupEndpoint` em `GET /helpdesk/linked-issues/lookup/` para resolver issues ausentes sem endpoint novo de workspace-search.
  - [x] **Polling de Intake:** polling de 20s com Page Visibility API na página de detalhe do ticket — pausa quando aba está oculta, encerra no unmount; ao detectar transição para `Accepted` com `issue_id` novo, dispara `hydrateLinkedIssues` automaticamente.
  - [x] **Statuses ativos configuráveis por portal:** `getHelpdeskActiveStatusIds` extraído para `apps/api/plane/app/helpdesk/statuses.py` (backend) e `apps/web/helpers/helpdesk/statuses.ts` (frontend); UI de settings ganhou seletor "Active ticket statuses" com fallback por nome quando vazio.
  - [x] **SLA configurável no portal:** campos `sla_first_response_hours` / `sla_resolution_hours` expostos na UI de Settings com inputs numéricos; validação no serializer (inteiro positivo ou null); aviso `historical_note` exibido no SLA card quando dados pré-migração 0130 são incluídos.
  - [x] **Auto-assign com estratégias adicionais:** `round_robin` (cursor por portal) e `capacity` (limite por agente) adicionados ao registry em `auto_assignment.py`; `HelpdeskPortal.AutoAssignmentType` expandido com os novos valores; UI de settings libera a seleção das novas estratégias.
  - [x] **Extração de form_core backend:** `validate_helpdesk_form_submission` e `build_default_helpdesk_system_fields` movidos de `form.py` para `apps/api/plane/app/helpdesk/form_core.py`; `form.py` passa a importar do módulo centralizado.
  - [x] **Helpers frontend no path correto:** `statuses.ts` e `form-core.ts` criados em `apps/web/helpers/helpdesk/` (alias `@/helpers/*`) para resolver erros de módulo.
  - [x] **Typecheck zerado:** corrigidos todos os erros TypeScript do módulo helpdesk — `toSorted()` → `.slice().sort()` (ES2022 compat), `showLabel` faltando no `PieChart`, `super()` sem args em `BasePage` (`extended-base-page.ts`).
  - [x] **Pin do sidebar persiste:** `HELPDESK = "helpdesk"` adicionado à enum `WorkspaceUserPreference.UserPreferenceKeys` em `workspace.py` — o GET de sidebar-preferences agora cria a linha no banco e o PATCH consegue encontrá-la para persistir o estado de pin.

---

## Bugs Corrigidos (pós-Fase 11)

- **[2026-06-17] Portais somem após adicionar membros ao workspace:**
  - **Root cause 1 (frontend):** `useEffect` na settings page tinha `workspaceMemberIds` como dependência, causando `fetchPortals` e `fetchStatuses` sempre que um novo membro era adicionado. Se a resposta da API fosse inválida nesse momento, a store era sobrescrita.
  - **Root cause 2 (store):** `fetchPortals`, `fetchStatuses` e `fetchRequests` não validavam se a resposta era um array antes de fazer `set()` na store — `res?.data` podendo ser `undefined` sobrescrevia os dados existentes.
  - **Fix:** Separado o `useEffect` da settings page em dois effects independentes (fetch de helpdesk ≠ fetch de membros). Adicionado guard `Array.isArray(response)` antes de qualquer `set()` nas três actions de fetch de lista.

---

- [x] **Fase 12: Form Builder Resilience + Cascading Categories + Ticket Numbering**
  - [x] **Modelo `cascade_select`:** novo tipo adicionado a `HelpdeskFormFieldType`; `parent_field_key` (CharField) adicionado a `HelpdeskFormField` para declarar hierarquia de campos dependentes.
  - [x] **Modelo ticket ID:** `ticket_id_pattern` (CharField) e `ticket_id_counter` (PositiveIntegerField) adicionados a `HelpdeskForm`; `display_id` (CharField) adicionado a `HelpdeskRequest`.
  - [x] **Migração `0132_helpdesk_phase12`:** AlterField para field_type + AddField para parent_field_key, ticket_id_pattern, ticket_id_counter, display_id.
  - [x] **`form_core.py` expandido:** `build_default_helpdesk_template_fields()` cria Subject + 3 cascade_select (category_1/2/3) + Description; `generate_ticket_display_id()` incrementa counter atomicamente via `F()` e aplica tokens YYYY/YY/MM/DD/#####; validação de cascade_select em `validate_helpdesk_form_submission` resolve valores válidos percorrendo a árvore de opções do campo raiz.
  - [x] **Template padrão em novos portais:** `HelpdeskPortalViewSet.perform_create` cria "Default request form" com os 5 campos do template ao criar um portal.
  - [x] **Geração de display_id na criação:** chamado em `PublicHelpdeskFormSubmitEndpoint` (form.py) e em `HelpdeskRequestViewSet.perform_create` / `PublicHelpdeskRequestEndpoint.create` (request.py) quando o form tem `ticket_id_pattern`.
  - [x] **Serializers:** `ticket_id_counter` somente-leitura em `HelpdeskFormSerializer`; `display_id` somente-leitura em `HelpdeskRequestSerializer`; validação de `cascade_select` adicionada em `HelpdeskFormFieldSerializer`.
  - [x] **Tipos frontend atualizados:** `IHelpdeskFieldType` inclui `"cascade_select"`; `IHelpdeskFormFieldOption` tem `children?: IHelpdeskFormFieldOption[]`; `IHelpdeskFormField` tem `parent_field_key`; `IHelpdeskForm` tem `ticket_id_pattern`; `IHelpdeskRequest` tem `display_id`.
  - [x] **Helpers frontend:** `HELPDESK_CUSTOM_FIELD_TYPES` inclui `cascade_select` com ícone `ListTree`; `createHelpdeskFieldDraft` inicializa `parent_field_key: ""`; nova função `previewTicketIdPattern` para preview ao vivo.
  - [x] **Form builder UI (settings page):**
    - Badge amarelo "Unsaved changes" ao editar campos sem salvar.
    - Botão "Preview" no header do builder abre modal com `HelpdeskFormRenderer` em modo preview (não submissível).
    - Validação client-side ao ativar form: label vazio, dropdown sem opções, cascade com parent_field_key inválido.
    - Campo `ticket_id_pattern` na coluna de settings com preview ao vivo do ID gerado.
    - Editor de tree nodes para campos `cascade_select` raiz (componente `CascadeTreeEditor` recursivo).
    - Seletor de `parent_field_key` para campos `cascade_select` filhos.
  - [x] **`form-renderer.tsx` compartilhado:** criado em `apps/web/core/components/helpdesk/`; renderiza todos os tipos incluindo `cascade_select` com filtragem dinâmica baseada no valor do campo pai; suporta prop `isPreview` para desabilitar inputs.
  - [x] **Portal público atualizado:** `forms/[formSlug]/page.tsx` usa `HelpdeskFormRenderer`; ao mudar um cascade_select, valores descendentes são limpos automaticamente.
  - [x] **Display ID na UI do agente:** `display_id` aparece em fonte mono acima do título no kanban, na list view e no header + seção "Original request" da página de detalhe.

- [x] **Fase 13: SSE Live Reload** (arquitetura final: middleware ASGI puro + tunnel Vite)
  - [x] `apps/api/plane/asgi.py` — **`SSEMiddleware`** (ASGI puro) faz o streaming de `/helpdesk/events/` falando `scope`/`receive`/`send` direto, mantendo a conexão aberta, emitindo heartbeats de 20s e reagindo a `http.disconnect`. **Substitui `StreamingHttpResponse`**, que sob ASGI era drenado e fechado pelo handler em ~10ms (causa raiz do `Error in input stream`). Ver `docs-bugs/2026-06-22-sse-helpdesk-live-reload.md`.
  - [x] `apps/api/plane/app/helpdesk/sse_broker.py` — broker Redis pub/sub **async**; `publish()` síncrono chamado pelas views; `subscribe()` retorna `asyncio.Queue`; um `_listener_task` por slug roda daemon thread com `ps.get_message(timeout=1.0)` (polling, não `listen()` bloqueante — permite hot-reload limpo do uvicorn) e faz fan-out via `loop.call_soon_threadsafe`.
  - [x] `apps/api/plane/app/views/helpdesk/sse.py` — helpers de auth reusados pelo middleware (`_resolve_user_sync`, `_build_request_user_sync`); decode de `bytes` do Redis (`user_id.decode()`); `HelpdeskSSEView` permanece como fallback 503.
  - [x] URLs registradas: `workspaces/<slug>/helpdesk/sse-token/` e `workspaces/<slug>/helpdesk/events/`.
  - [x] `publish()` adicionado em todos os pontos de mutação: `HelpdeskRequestViewSet.perform_create`, `HelpdeskRequestViewSet.partial_update`, `HelpdeskRequestCommentViewSet.perform_create`, `PublicHelpdeskFormSubmitEndpoint.post` e `PublicHelpdeskRequestEndpoint.create`.
  - [x] `vite.config.ts` — **`sseTunnelPlugin()`** (`configureServer`) intercepta `/helpdesk/events/` antes do `http-proxy` interno e faz pipe cru via `http.request` (`res.write` + `res.flush` por chunk; `res.on("close")` destrói o upstream). Bypassa o buffering do `http-proxy` que acumula o body inteiro e quebra o streaming.
  - [x] Hook `apps/web/core/hooks/use-helpdesk-sse.ts` usa `fetch()` com URL relativa (same-origin via tunnel Vite — cookies enviados, sem CORS), parse manual de linhas SSE, reconexão com backoff exponencial (2s → 30s) e Page Visibility API.
  - [x] Integrado nas páginas de listagem e detalhe do agente: `request.created` / `request.updated` → `fetchRequests`; `comment.created` / `request.updated` → `fetchRequestById` + `fetchRequestComments`.

- [x] **Fase 14: Filtros + Display na tela inicial (paridade com Work Items)**
  - [x] **Tipos:** `THelpdeskGroupBy`, `THelpdeskOrderBy`, `IHelpdeskRequestFilters`, `IHelpdeskDisplayFilters` adicionados a `packages/types/src/helpdesk.ts`.
  - [x] **Backend (filtros server-side):** `HelpdeskRequestViewSet.get_queryset` ganhou filtros multi-valor por vírgula (`status`, `portal`, `form`, `source`, `assignees` → `__in`), `search_fields` (title/description/display_id/contact_email via `SearchFilter`), intervalo de data (`created_at__gte`/`created_at__lte` por `created_at__date`), `order_by` whitelisted (fallback `-created_at`) e `.distinct()` para a M2M de assignees.
  - [x] **Serviço/store:** `getRequests(workspaceSlug, params?)` e `fetchRequests(workspaceSlug, params?)` repassam query params (guard `Array.isArray` mantido).
  - [x] **Helper:** `apps/web/helpers/helpdesk/filters.ts` com `buildHelpdeskRequestParams` (filtros→query string) e `groupHelpdeskRequests` (agrupamento genérico para list/kanban: status/assignee/portal/form/source/none, com grupo "None" e M2M de assignee).
  - [x] **Componentes (`core/components/helpdesk/filters/`):** `HelpdeskFiltersDropdown`, `HelpdeskDisplayDropdown`, `HelpdeskAppliedFilters` — reutilizam os helpers domain-agnostic dos work items (`FiltersDropdown`, `FilterHeader`, `FilterOption`).
  - [x] **Página:** chips de status únicos substituídos por toolbar (busca debounced + Filters + Display) no `AppHeader`, barra de applied filters abaixo do header, e list/kanban com agrupamento genérico. Filtros/display persistem em `localStorage` (`helpdesk-filters:{slug}` / `helpdesk-display:{slug}`); busca não persiste. Drag-and-drop e "add request" inline ficam ativos só com `group_by === "status"`.
  - [x] **Limpeza:** `toSorted()` (ES2023, incompatível com lib ES2022 do web) → `.slice().sort()` em `helpdesk.store.ts`.

- [x] **Fase 15: Controle de Acesso por Membros (RBAC)**
  - [x] **Modelo `HelpdeskMember`** (WorkspaceBaseModel): campos `member` (FK→User), `role` (Admin=20/Member=15/Guest=5), `is_active`; `unique_together` em `[workspace, member, deleted_at]`; `db_table = "helpdesk_members"`.
  - [x] **Migração `0135_helpdeskmember`:** `CreateModel` padrão com todos os campos de `WorkspaceBaseModel`.
  - [x] **Migração de dados `0136_seed_helpdesk_admins`:** `RunPython` que, para cada workspace com pelo menos um `HelpdeskPortal`, adiciona todos os workspace admins (role=20) como `HelpdeskMember` com role=20. Aplicada retroativamente.
  - [x] **Utilitário de permissão `apps/api/plane/app/helpdesk/permissions.py`:** `get_helpdesk_role(user, workspace_slug)` retorna o role efetivo (int) ou `None`. Workspace admins recebem ADMIN (20) automaticamente como bypass — nunca ficam bloqueados.
  - [x] **`HelpdeskMemberSerializer`:** aninha `member_detail` via `UserLiteSerializer` (nome, avatar, `display_name`). Adicionado ao `apps/api/plane/app/serializers/helpdesk.py`.
  - [x] **`HelpdeskMemberViewSet`** (`apps/api/plane/app/views/helpdesk/member.py`): `list` (≥ GUEST), `create` bulk (ADMIN only — valida que os IDs são workspace members, reativa soft-deleted), `partial_update` (ADMIN), `destroy` soft-delete (`is_active=False`, ADMIN).
  - [x] **URLs:** `workspaces/<slug>/helpdesk/members/` e `workspaces/<slug>/helpdesk/members/<uuid>/` registradas em `apps/api/plane/app/urls/helpdesk.py`.
  - [x] **Enforcement nas views existentes:** todas as views de agente receberam checks inline com `get_helpdesk_role()`:
    - `portal.py`, `status.py`, `form.py` (FormViewSet + FormFieldViewSet): writes → ADMIN, reads → ≥ GUEST.
    - `request.py`: reads → ≥ GUEST; create/update/destroy → ≥ MEMBER.
    - `comment.py`, `issue.py`, `intake.py`: reads → ≥ GUEST; writes → ≥ MEMBER.
    - `analytics.py`: GET → ≥ GUEST.
    - Endpoints `Public*` e `Customer*` **não alterados** — continuam abertos.
  - [x] **Seed automático no primeiro portal:** `HelpdeskPortalViewSet.perform_create` detecta se é o primeiro portal do workspace e, nesse caso, cria registros `HelpdeskMember` (role=20) para todos os workspace admins presentes naquele momento.
  - [x] **Tipos frontend:** `EHelpdeskMemberRole` (enum) e `IHelpdeskMember` (interface com `member_detail` aninhado) adicionados a `packages/types/src/helpdesk.ts`.
  - [x] **Service:** `getMembers`, `addMembers`, `updateMember`, `removeMember` adicionados ao `HelpdeskService` em `packages/services/src/helpdesk/helpdesk.service.ts`.
  - [x] **Store:** observable `members: Record<string, IHelpdeskMember[]>` + actions `fetchMembers`, `addMembers`, `updateMember`, `removeMember` + computed `getWorkspaceMembers` adicionados ao `helpdesk.store.ts`. `fetchMembers` chamado no mount da settings page.
  - [x] **Settings page — aba "Members":** nova aba em `/{wSlug}/helpdesk/settings`; "Add members" abre painel inline com `MemberDropdown` (multi-select de workspace members) + seletor de role (Admin/Member/Guest); lista de membros com avatar, nome, role dropdown editável inline e botão de remoção; `ConfirmModal` antes de remover; sub-component `HelpdeskMemberRow`.

---

## Pendências Técnicas

- **Core compartilhado para outros módulos**: A fundação de forms já foi criada com foco em reuso, mas ainda vive acoplada ao domínio de Helpdesk. O próximo passo natural é extrair o builder/renderers/contratos para um core realmente compartilhado com Intake e outros módulos.
- **Dados históricos de SLA**: Tickets criados antes da Fase 10 não têm `first_responded_at` nem `resolved_at` populados. O compliance de SLA só é preciso para tickets criados após a migração `0130`. A tela de analytics exibe o aviso `historical_note` retornado pela API, mas não existe script de backfill.
- **Auto-assign: estratégias avançadas**: `round_robin` e `capacity` estão implementados no backend e selecionáveis na UI, mas `skills`, horários e reassignment automático continuam fora do escopo atual.
- **Polling vs. SSE no Dev Pipeline**: A atualização do Dev Pipeline (links Intake) ainda usa polling de 20s — o SSE atual cobre apenas `request.created`, `request.updated` e `comment.created`. Quando conveniente, um evento `intake.updated` pode ser adicionado ao broker sem alterar o frontend do SSE.

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
- **[2026-06-17]**: Custom Forms v1 + Form Builder (Fase 8).
  - **Backend:** novos modelos `HelpdeskForm` e `HelpdeskFormField`; `HelpdeskRequest` agora guarda `form` e `form_responses`; migração `0128_helpdesk_forms` cria um formulário padrão por portal existente.
  - **API pública:** novos endpoints para listar forms do portal, buscar schema por `form_slug` e submeter requests via `/forms/<slug>/submit/`, respeitando visibilidade `public/private` e autenticação do cliente.
  - **Validação:** campos de sistema (`title`/`description`) continuam canônicos; backend valida dropdowns com opções explícitas, booleans, datas e respostas obrigatórias por campo.
  - **Frontend portal:** `/helpdesk/p/[publicSlug]/new` virou seletor de formulários; nova rota `/helpdesk/p/[publicSlug]/forms/[formSlug]` renderiza forms dinâmicos e redireciona forms privados para login.
  - **Frontend agent:** detalhe do request agora mostra `Submitted via form` e renderiza `form_responses`.
  - **Settings / Builder:** a página `/{wSlug}/helpdesk/settings` ganhou sub-abas internas (`Portal settings`, `Form builder`, `Statuses`), layout responsivo mais largo para o builder e suporte explícito a `Dropdown` com edição de opções `label/value`.
- **[2026-06-17]**: Automatic Assignment v1 (Fase 9).
  - **Backend / modelo:** `HelpdeskPortal` passou a armazenar `auto_assignment_enabled`, `auto_assignment_type` e `auto_assignment_config`; migração `0129_helpdeskportal_auto_assignment` criada.
  - **Resolver dedicado:** a lógica foi encapsulada em helper próprio para evitar acoplamento nas views e deixar espaço para futuras estratégias além de `load_balance`.
  - **Comportamento v1:** na criação do ticket, se o portal estiver com auto-assign habilitado, o sistema escolhe o agente elegível com menor número de tickets Helpdesk ativos atribuídos; em empate, usa desempate determinístico por menor `member_id`.
  - **Cobertura de fluxos:** a regra foi aplicada na criação pública por form, na criação pública legada e na criação interna por agente.
  - **Fallback:** quando o pool está vazio ou não há membro elegível válido no workspace, o ticket continua sendo criado sem assignee.
  - **Frontend settings:** `Portal settings` ganhou a seção "Automatic assignment", com toggle, select de tipo e `MemberDropdown` para definir o pool de agentes elegíveis por portal.
  - **Testes:** suíte contratual do Helpdesk expandida para validar persistência da configuração, escolha do agente menos carregado, desempate determinístico e fallback sem responsável.
- **[2026-06-17]**: Analytics + SLA (Fase 10).
  - **Backend / modelo:** `HelpdeskStatus` ganhou `is_terminal` para identificar estados de resolução sem depender de nomes; `HelpdeskRequest` ganhou `first_responded_at` e `resolved_at` para cálculo de SLA; `HelpdeskPortal` ganhou `sla_first_response_hours` e `sla_resolution_hours` para configurar thresholds de SLA por portal. Migração `0130` aplica dados iniciais com `RunPython`.
  - **Timestamps automáticos:** `first_responded_at` é populado via `perform_create` no ViewSet de comentários na primeira resposta do agente; `resolved_at` é gerenciado via `partial_update` no ViewSet de requests — setado ao entrar em status terminal, limpo ao reabrir.
  - **Endpoint de analytics:** `GET /api/workspaces/<slug>/helpdesk/analytics/` aceita `date_filter` e `portal_id` opcional. Retorna `kpis` (5 métricas com comparativo de período anterior), `sla` (compliance % de primeira resposta e resolução), e `charts` (5 séries: volume ao longo do tempo, por status, por origem, tendência de tempo de resolução, top agentes). Granularidade automática por período.
  - **Frontend:** tipos completos em `@plane/types`, método `g+etAnalytics` no service, store `helpdesk-analytics.store.ts` com cache por `workspaceSlug:dateFilter:portalId`, hook dedicado. Tela `/[wSlug]/helpdesk/analytics` com KPI cards coloridos (`text-3xl font-bold`), SLA card com barra de progresso, 5 gráficos via `@plane/propel/charts`, filtros no `AppHeader`. Design alinhado com o resto da aplicação: `bg-custom-background-90` na página, `bg-custom-background-100 rounded-xl border-custom-border-200` nas seções.
  - **Roteamento:** rota `analytics` registrada em `core.ts` antes do catch-all `:requestId` — evita que `/helpdesk/analytics` seja capturado como um `requestId` dinâmico. Botão "Analytics" adicionado ao header da listagem.
- **[2026-06-17]**: Correção de pendências e qualidade (Fase 11).
  - **hydrateLinkedIssues:** substituída hidratação silenciosa por fluxo determinístico com mapa auxiliar `linkedIssueProjectMap` (`issueId → projectId`) na store; novo `HelpdeskLinkedIssueLookupEndpoint` resolve issues ausentes sem depender do search workspace.
  - **Polling de Intake:** implementado polling de 20s com Page Visibility API na página de detalhe — pausa em aba oculta, encerra no unmount, dispara `hydrateLinkedIssues` ao detectar nova `issue_id` em intake aceito.
  - **SLA configurável na UI:** campos SLA expostos em Portal settings com validação de inteiro positivo no serializer; aviso de janela histórica exibido no SLA card quando o endpoint sinaliza dados pré-migração.
  - **Statuses ativos configuráveis:** helper `getHelpdeskActiveStatusIds` centralizado em módulo próprio (backend e frontend); UI de settings inclui seletor "Active ticket statuses" com fallback por nome.
  - **Auto-assign expandido:** estratégias `round_robin` (com cursor persistido por portal) e `capacity` (limite por agente) adicionadas ao registry backend e selecionáveis na UI de settings.
  - **Extração form_core:** lógica de validação e criação de campos extraída de `form.py` para `helpdesk/form_core.py`; helpers frontend movidos para `helpers/helpdesk/` (alias correto `@/helpers/*`).
  - **Typecheck zerado:** todos os erros TS do módulo helpdesk corrigidos — `toSorted()` → `.slice().sort()`, `showLabel` no PieChart, `super()` sem args em `BasePage`.
  - **Pin do sidebar persistente:** `HELPDESK` adicionado a `WorkspaceUserPreference.UserPreferenceKeys` — o GET agora cria a linha no banco e o PATCH consegue salvar o estado de pin após reload.
- **[2026-06-23]**: RBAC — Controle de Acesso por Membros (Fase 15).
  - **Modelo `HelpdeskMember`** (`WorkspaceBaseModel`): `member` (FK→User), `role` (Admin=20/Member=15/Guest=5), `is_active`; `unique_together = ["workspace", "member", "deleted_at"]`; `db_table = "helpdesk_members"`. Exportado via `plane.db.models`.
  - **Migração `0135_helpdeskmember`:** `CreateModel` com todos os campos de `WorkspaceBaseModel`; depende de `0134`.
  - **Migração de dados `0136_seed_helpdesk_admins`:** `RunPython` retroativo — para cada workspace com portais existentes, cria `HelpdeskMember` (role=20) para todos os workspace admins ainda não presentes. Aplicada com sucesso.
  - **`permissions.py` (`apps/api/plane/app/helpdesk/`):** `get_helpdesk_role(user, workspace_slug)` — workspace admins (role=20) recebem ADMIN (20) como bypass sem depender de `HelpdeskMember`; não-membros recebem `None`.
  - **`HelpdeskMemberSerializer`:** aninha `member_detail` (nome/avatar/display_name) via `UserLiteSerializer`. Adicionado a `serializers/helpdesk.py`.
  - **`HelpdeskMemberViewSet`** (`views/helpdesk/member.py`): `list` (≥ GUEST), `create` bulk (ADMIN — reativa soft-deleted), `partial_update` de role (ADMIN), `destroy` soft-delete (ADMIN).
  - **URLs:** `helpdesk/members/` e `helpdesk/members/<uuid>/` registradas em `urls/helpdesk.py`.
  - **Enforcement em todas as views existentes:** checks inline com `get_helpdesk_role()` adicionados a `portal.py`, `status.py`, `form.py`, `request.py`, `comment.py`, `issue.py`, `intake.py`, `analytics.py`. Endpoints `Public*` e `Customer*` não alterados.
  - **Seed no primeiro portal:** `HelpdeskPortalViewSet.perform_create` detecta primeiro portal e cria `HelpdeskMember` (role=20) para todos os workspace admins.
  - **Frontend:** `EHelpdeskMemberRole` + `IHelpdeskMember` em `@plane/types`; 4 métodos de serviço em `HelpdeskService`; observable `members` + 4 actions + computed `getWorkspaceMembers` na `helpdesk.store.ts`; aba "Members" completa na settings page com `MemberDropdown` multi-select, role select, lista editável e `ConfirmModal` de remoção.
- **[2026-06-22]**: SSE Live Reload (Fase 13). Doc completa do debug em `docs-bugs/2026-06-22-sse-helpdesk-live-reload.md`.
  - **Causa raiz final — `StreamingHttpResponse` sob ASGI:** o sintoma persistente (`[SSE] error: Error in input stream`, conexão fechando em ~10ms) era o `ASGIHandler` do Django drenando o async generator da `StreamingHttpResponse` e fechando a requisição imediatamente. `StreamingHttpResponse` não serve para streams infinitos sob ASGI.
  - **Solução — middleware ASGI puro:** `SSEMiddleware` em `apps/api/plane/asgi.py` intercepta `/helpdesk/events/` antes do ciclo request/response do Django e fala `scope`/`receive`/`send` diretamente — mantém o stream aberto, emite heartbeats de 20s e reage a `http.disconnect`. A `HelpdeskSSEView` virou fallback 503.
  - **Broker Redis pub/sub async:** `sse_broker.py` com `publish()` síncrono e `subscribe()` async (`asyncio.Queue`); `_listener_task` por slug roda daemon thread com `ps.get_message(timeout=1.0)` (polling, não `listen()` — permite hot-reload limpo do uvicorn) e faz fan-out via `loop.call_soon_threadsafe`.
  - **Bug fix — `redis.get()` retorna bytes:** `User.objects.get(pk=user_id)` recebia `bytes`, causando 500. Corrigido com `user_id.decode()` antes da query ORM.
  - **Bug fix — `PublicHelpdeskFormSubmitEndpoint` sem publish:** tickets criados pelo portal público não disparavam SSE. Adicionado `sse_publish()` após a criação.
  - **Vite SSE tunnel:** `sseTunnelPlugin()` em `vite.config.ts` (`configureServer`) intercepta `/helpdesk/events/` antes do `http-proxy` interno e faz pipe cru via `http.request`, encaminhando cada chunk com `res.flush`. O `http-proxy` interno bufferiza o body inteiro e quebra o streaming — daí o tunnel.
  - **Hook frontend:** `use-helpdesk-sse.ts` usa `fetch()` com URL relativa (same-origin via tunnel Vite — cookies enviados, sem CORS), parse manual de linhas SSE, reconexão com backoff exponencial e Page Visibility API. Integrado nas páginas de listagem e detalhe.
