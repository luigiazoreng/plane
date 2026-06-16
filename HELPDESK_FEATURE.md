# Helpdesk Feature - Plane

Este documento serve como base técnica, histórico de desenvolvimento e rastreador de tarefas (TODO) para a implementação do módulo de Helpdesk no Plane.

## Visão Geral da Feature

O módulo de Helpdesk permite que usuários externos ou internos criem "Requests" (chamados/tickets) através de um formulário. Esses requests podem ser respondidos pelos agentes e vinculados a "Issues" (cards de desenvolvimento) do Plane, garantindo um acompanhamento claro entre a solicitação do cliente e a entrega da equipe técnica.

### Tipos de Acesso

Conforme definido no planejamento:

- **Público:** Formulários abertos onde qualquer pessoa com o link pode enviar um request sem necessidade de autenticação.
- **Autenticado (Clientes):** Formulários que exigem login (apenas e-mail e senha). Os clientes terão um portal básico para visualizar seus próprios chamados e interagir com eles.

---

## Estrutura de Modelos (Backend - Django)

Para evitar vazamento de contexto com os usuários internos do Plane (agentes/membros da equipe), criaremos entidades específicas:

### 1. Modelos de Autenticação de Cliente

- `HelpdeskCustomer`: Uma nova entidade (separada do `User` do Plane ou uma extensão dele) para clientes.
  - Campos: `email`, `password` (hash), `name`, `is_active`.
- `HelpdeskCustomerToken`: Gerenciamento de sessões/tokens para os clientes do helpdesk.

### 2. Modelos do Portal e Configuração

- `HelpdeskPortal`: Configuração do helpdesk de um Projeto ou Workspace.
  - Campos: `project` (FK), `is_public` (Boolean), `require_login` (Boolean), `public_slug` (SlugField).

### 3. Modelos de Solicitação (Requests)

- `HelpdeskRequest`: O Ticket em si.
  - Campos: `portal` (FK), `customer` (FK - nullable se for público), `title`, `description`, `contact_email` (usado se não houver customer), `status`, `source` (Public Form, Internal Form).
- `HelpdeskRequestComment`: Histórico de mensagens do ticket.
  - Campos: `request` (FK), `actor` (FK para `User` - agente), `customer` (FK para `HelpdeskCustomer` - cliente), `content`, `is_internal`.

### 4. Modelo de Vinculação com Issues (Integração)

- `HelpdeskRequestIssue`: Tabela pivot (N:N).
  - Campos: `request` (FK), `issue` (FK), `created_by` (FK - User).

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

- [ ] **Fase 3: Frontend (Painel do Agente)**
  - [ ] Criar aba "Helpdesk" no menu lateral do projeto no Plane.
  - [ ] Implementar Kanban/List View para exibir os `HelpdeskRequests`.
  - [ ] Criar página de detalhes do Request com chat (comentários) e aba lateral para vinculação de Issues.

- [ ] **Fase 4: Frontend (Portal do Cliente)**
  - [ ] Criar rota pública para acesso ao portal do Helpdesk.
  - [ ] Implementar fluxo de Login/Cadastro por e-mail para clientes.
  - [ ] Implementar formulário de envio de tickets.
  - [ ] Implementar listagem e visualização de tickets do próprio cliente logado.

---

## Histórico de Desenvolvimento (Changelog)

- **[2026-06-15]**: Definição da arquitetura e criação deste documento base de planejamento. Aceite do modelo de acesso misto (público e com login via e-mail).
- **[2026-06-15]**: Conclusão das Fases 1 e 2. Modelos, Serializers, Views e URLs criados em `apps/api/plane/`.
- **[2026-06-16]**: Criação da suíte completa de testes de contrato para o Helpdesk. Correção do campo `deleted_at` para read-only para evitar erros de validação de unicidade no DRF. Habilitação do campo `request` gravável no serializer de request/issue e inclusão do método `perform_create` nas views para associar `project_id`. Todos os 10 testes de contrato passando com sucesso no ambiente Docker.
