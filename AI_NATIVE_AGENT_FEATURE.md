# Native AI Agent for Plane

## Status

- Proposed
- Not scheduled for implementation yet
- Intended as a follow-up feature after current roadmap items

## Summary

This document describes a future native AI agent experience for Plane. The goal is to let users interact with their workspace in natural language and allow the AI to safely read, analyze, create, and update Plane entities such as work items, projects, cycles, modules, comments, and intake items.

This feature is not intended to be only a text assistant. It is intended to be a real operational agent with controlled access to Plane data and actions.

## Goals

- Provide a native AI experience inside Plane, not only through external MCP clients.
- Allow users to ask questions about workspace data using natural language.
- Allow the AI to create and update entities in Plane through controlled execution.
- Respect user permissions and workspace rules.
- Provide strong auditing, approval flows, and safety boundaries.
- Support multiple model providers, including DeepSeek via the existing LLM configuration path.

## Non-Goals

- Fully autonomous workflow execution across the entire workspace with no controls.
- Bulk destructive operations in the first release.
- Replacing the Plane API, webhooks, or MCP server.
- Acting as a database-level agent with direct DB access.
- Building a generic agent platform for arbitrary third-party tools in the first iteration.

## Why This Feature

Plane already has:

- Rich CRUD APIs for core entities
- API token authentication
- Webhook delivery infrastructure
- Activity logging primitives
- AI-assisted text generation in editor and issue flows

What is missing today is the orchestration layer that turns user intent into safe, explainable, permission-aware actions.

This feature closes that gap.

## Current State

### What already exists in the repository

- AI provider configuration in admin settings
- AI text assistance endpoints for prompt-based responses
- Work item, project, cycle, and module CRUD APIs
- Outbound webhooks with HMAC signatures
- API token-based authentication
- User mention support in editor/comment flows

### What does not exist yet

- A native action-oriented agent runtime
- App or agent mentions
- Inbound webhook consumer for agent triggers
- Scoped agent identity model
- Approval workflow for agent actions
- Retrieval layer strong enough for autonomous decision-making
- Tool execution layer mapped to Plane APIs
- Structured audit trail for AI planning and action execution

## Product Vision

The user should be able to do things like:

- "Summarize blockers in the Mobile project."
- "Create a bug in WEB for the login redirect loop and assign it to me."
- "Move all unresolved items from Sprint 23 to Sprint 24."
- "Create subtasks from this discussion."
- "Review intake items and suggest duplicates."
- "Update this module description based on recent work item comments."

The experience should feel native to Plane:

- accessible from the sidebar AI chat
- contextual inside project views
- aware of current project and selected entities
- consistent with existing permissions
- transparent about what it is going to do

## Proposed User Experience

### 1. Ask Mode

Read-only mode for:

- workspace search
- contextual Q&A
- summaries
- relationship discovery
- progress analysis
- documentation help

Characteristics:

- no mutations
- safe default mode
- available to broader set of users

### 2. Build Mode

Action mode for:

- creating work items
- updating work items
- creating cycles/modules/projects
- adding comments
- linking entities
- triaging intake

Characteristics:

- permission-aware
- action preview before execution when needed
- stronger guardrails

### 3. Contextual Entry Points

- Dedicated AI chat screen
- Sidebar AI panel
- Project-scoped AI entry
- Work item detail AI actions
- Comment composer with future `@agent` support

## Core Functional Requirements

### Conversational Capabilities

- Accept natural language input
- Maintain short-term conversation context
- Understand current workspace/project/entity context
- Resolve references like:
  - issue IDs
  - project identifiers
  - cycle names
  - module names
  - "this issue"
  - "current sprint"

### Read Capabilities

- Search work items
- Search pages and documentation
- Retrieve project/cycle/module summaries
- Inspect comments and relations
- Explain status, blockers, dependencies, and trends

### Write Capabilities

- Create work items
- Update work item fields
- Create comments
- Create projects
- Create cycles
- Create modules
- Create and manage issue relations
- Assist intake triage

### Safety Capabilities

- Explain planned actions before execution
- Require confirmation for risky actions
- Prevent unauthorized actions
- Log every agent step
- Support dry-run mode for execution planning

## Proposed Architecture

## High-Level Design

The recommended architecture is split into two parts:

### A. Plane application

Responsibilities:

- UI and interaction surfaces
- settings and feature flags
- user-facing audit history
- approval screens
- contextual triggers
- permissions display and messaging

### B. `plane-ai-service`

Responsibilities:

- agent orchestration
- model provider integration
- retrieval and grounding
- execution planning
- tool invocation
- webhook intake
- audit event generation
- policy enforcement

This service should be separate from the main Plane monorepo runtime, but designed to integrate tightly with it.

## Why a separate service

- keeps the main app simpler
- makes model/runtime upgrades safer
- isolates secrets and provider integrations
- allows separate scaling for AI workloads
- avoids overcoupling agent logic to product UI code

## Identity and Authorization Model

### Problem

Today, API tokens authenticate a user, but they do not provide a clean agent identity with scoped capabilities.

### Proposed solution

Introduce a dedicated agent identity model with one of these approaches:

#### Option 1. Agent service token

- service-owned identity
- scoped to workspace
- explicit allowed actions
- best for first self-hosted rollout

#### Option 2. Agent app installation

- OAuth-style installation model
- per-workspace agent install
- future-aligned with Plane Apps/Agents ecosystem
- better long-term model

### Recommended path

- Start with scoped service tokens for MVP
- Evolve toward installable agent/app identity for broader ecosystem alignment

## Permissions Model

The AI agent must not bypass user permissions.

### Execution rule

The agent may only execute actions if:

- the workspace feature is enabled
- the user has permission to request the action
- the target entity allows the action
- policy rules for that action pass

### Recommended permission modes

#### Delegated mode

The agent acts on behalf of the requesting user.

Pros:

- simpler permission semantics
- easier auditing

Cons:

- token delegation complexity

#### Service mode with policy checks

The agent acts as a service identity but validates the requesting user permissions before execution.

Pros:

- simpler backend control
- easier to operate in self-hosted setups

Cons:

- requires careful policy implementation

### Recommended MVP mode

Service mode with explicit policy checks and detailed audit logs.

## Triggering Model

The agent needs structured ways to start work.

### MVP triggers

- AI chat input
- project AI panel
- work item detail action
- "Generate from context" actions in issue/page views

### Future triggers

- `@agent` mentions in comments
- intake automation hooks
- webhook-driven event responses
- scheduled agent jobs

## Tooling Layer

The agent should never directly mutate application internals. It should use a tool layer that wraps existing Plane APIs.

### Example tool categories

- `search_work_items`
- `get_work_item_detail`
- `create_work_item`
- `update_work_item`
- `create_comment`
- `create_project`
- `update_project`
- `create_cycle`
- `update_cycle`
- `create_module`
- `update_module`
- `manage_relations`
- `triage_intake_item`

### Requirements for each tool

- explicit input schema
- permission checks
- dry-run support
- normalized error handling
- audit event emission

## Retrieval and Grounding

### Current limitation

The current repo has search endpoints, but the groundwork for a high-confidence retrieval layer appears limited for autonomous operation.

### Required improvements

- cross-entity retrieval
- page/document retrieval
- comment-aware grounding
- entity resolution for names and identifiers
- optional semantic/vector retrieval
- ranking and disambiguation for lookalike entities

### Retrieval stages

1. Query interpretation
2. Candidate entity retrieval
3. Context assembly
4. Disambiguation
5. Execution planning

## Execution Pipeline

Recommended execution flow:

1. User submits a request
2. Agent determines mode: Ask or Build
3. Agent retrieves relevant context
4. Agent builds a structured execution plan
5. Policy engine validates proposed actions
6. If needed, user confirms
7. Tool layer executes Plane API calls
8. Audit events are recorded
9. User receives summary and result links

## Safety and Guardrails

### Action classes

#### Low risk

- read-only queries
- draft generation
- comment suggestions

#### Medium risk

- create work item
- update description
- add labels
- assign members

#### High risk

- delete entities
- move many items
- modify project-wide settings
- archive/unarchive

### MVP safety rules

- no bulk destructive operations
- no cross-project mass updates
- require confirmation for irreversible actions
- cap number of mutated entities per command
- require entity resolution confidence threshold

## Auditing and Observability

Every AI operation should produce:

- requesting user
- workspace and project context
- selected mode
- prompt metadata
- retrieved context summary
- planned actions
- executed actions
- final result
- provider/model used
- timestamps
- errors and partial failures

### Suggested tables or storage concepts

- `ai_agent_conversations`
- `ai_agent_messages`
- `ai_agent_runs`
- `ai_agent_actions`
- `ai_agent_approvals`
- `ai_agent_errors`

## Feature Flags and Configuration

Suggested configuration options:

- `AI_AGENT_ENABLED`
- `AI_AGENT_BUILD_MODE_ENABLED`
- `AI_AGENT_REQUIRE_CONFIRMATION`
- `AI_AGENT_MAX_MUTATIONS_PER_RUN`
- `AI_AGENT_ALLOWED_ACTIONS`
- `AI_AGENT_DEFAULT_PROVIDER`
- `AI_AGENT_AUDIT_RETENTION_DAYS`

Per-workspace overrides should also be considered.

## Model Provider Strategy

The current admin AI settings are a good starting point for provider configuration.

### MVP requirement

Support:

- OpenAI
- Anthropic
- Gemini
- DeepSeek

### Notes

- Build mode may need model/provider-specific prompt and tool-calling behavior
- Some providers may work better for planning than execution
- The orchestration layer must abstract provider differences

## Suggested Implementation Phases

## Phase 0. Discovery and design

- confirm feature boundaries
- decide identity model
- define tool contracts
- define audit model
- define approval UX

Deliverables:

- approved architecture
- domain model decisions
- API contracts

## Phase 1. Read-only native agent

- AI chat UI improvements
- contextual Ask mode
- retrieval layer over core entities
- conversation persistence
- audit logging for read operations

Deliverables:

- reliable workspace/project Q&A
- contextual summaries
- no write operations yet

## Phase 2. Controlled Build mode MVP

- service token or agent identity
- tool layer over existing CRUD APIs
- create/update work items
- create comments
- create cycles/modules
- approval UI for risky actions

Deliverables:

- action-capable agent for common flows
- clear user trust signals

## Phase 3. Expanded entity support

- project creation/update
- intake triage assistance
- relations and dependency actions
- cross-entity planning workflows

Deliverables:

- broader operational usefulness

## Phase 4. Mentions and automation

- `@agent` support
- webhook-driven triggers
- event-conditioned actions
- policy-driven automation

Deliverables:

- true workspace-native agent behavior

## Phase 5. Ecosystem alignment

- integration with Plane Apps/Agents direction
- future MCP bridging
- external client interoperability

## Technical Work Breakdown

### Backend

- add agent runtime service
- add execution policy engine
- add audit storage
- add scoped agent credential model
- add approval endpoints
- add retrieval service
- add structured tool wrappers

### Frontend

- AI chat screen improvements
- mode selector
- action preview
- approval modal/panel
- run history
- result linking to created/updated entities

### Infrastructure

- deploy `plane-ai-service`
- secret management for providers
- queue handling for async runs
- logging and tracing
- rate limiting per workspace

## Open Questions

- Should MVP act as a service identity or on behalf of the user?
- Should approval be mandatory for all build actions or only high-risk ones?
- Should created content be visibly marked as AI-generated?
- How much conversation history should be retained?
- Do we want one global agent or workspace-specific agents?
- How should entity disambiguation be shown to users?
- Should self-hosted users need an extra AI service container by default?

## Risks

### Product risks

- user trust erosion if actions are surprising
- confusion between Ask mode and Build mode
- overpromising autonomy before retrieval is strong enough

### Technical risks

- poor entity resolution causes wrong mutations
- insufficient permission modeling
- provider instability or rate limits
- expensive context assembly

### Operational risks

- runaway write loops
- weak auditability
- hard-to-debug partial execution failures

## Success Metrics

### Adoption

- percentage of active workspaces using AI chat
- percentage of AI sessions entering Build mode
- number of agent-created work items per week

### Quality

- approval acceptance rate
- action success rate
- rollback/correction rate after AI actions
- disambiguation failure rate

### Trust and safety

- unauthorized action attempts blocked
- destructive action confirmation rate
- user-reported incorrect action rate

## MVP Acceptance Criteria

- User can open a native AI chat in Plane
- User can ask project/workspace questions and get grounded answers
- User can create a work item through Build mode
- User can update an existing work item through Build mode
- Agent respects Plane permissions
- Risky actions require confirmation
- Every action is audited
- Failures are explained clearly to the user

## Recommended Next Step When This Returns to Roadmap

Start with a short technical design sprint focused on:

1. Agent identity model
2. Ask vs Build execution model
3. Tool wrapper design over existing APIs
4. Audit schema
5. Approval UX

Do not begin with autonomous bulk actions.

## Final Recommendation

Build this feature as a native Plane experience backed by a separate `plane-ai-service`, using the existing Plane APIs as the execution surface.

This provides the best balance of:

- maintainability
- security
- provider flexibility
- future compatibility with Plane's broader AI ecosystem

## Delivery Plan

This section translates the proposal into a practical implementation plan for future execution.

## Suggested Delivery Strategy

Use an incremental rollout with clear gates:

1. Design and foundations
2. Read-only AI experience
3. Controlled write actions
4. Native triggers and automation
5. Hardening and expansion

The feature should not be built in one large release.

## Epic Breakdown

## Epic 1. Agent Foundations

Objective:

- establish the technical base for all future AI agent work

Scope:

- create `plane-ai-service`
- define runtime boundaries
- define environment variables and secrets model
- define provider abstraction
- define audit schema
- define tool interface contract

Deliverables:

- standalone AI service scaffold
- provider abstraction layer
- structured run/action logging schema
- internal RFC or ADR for architecture choices

Dependencies:

- product alignment on service boundary
- decision on identity model

## Epic 2. Native Ask Mode

Objective:

- ship a reliable read-only AI assistant with grounded context

Scope:

- conversation persistence
- workspace/project contextual chat
- issue/project/cycle/module/page retrieval
- result summarization
- source/context trace in responses

Deliverables:

- dedicated AI chat experience
- contextual project AI panel
- read-only execution path
- retrieval telemetry

Dependencies:

- Epic 1
- retrieval interface design

## Epic 3. Controlled Build Mode

Objective:

- allow safe creation and updates for core entities

Scope:

- create work item
- update work item
- create comment
- create cycle
- create module
- optional project creation in later part of this epic
- dry-run planning
- approval layer

Deliverables:

- first action-capable agent flows
- action preview UI
- mutation audit trail

Dependencies:

- Epic 1
- Ask mode context sufficient for grounded execution
- approval and permission rules

## Epic 4. Agent Identity and Permissions

Objective:

- ensure the AI acts with controlled authority

Scope:

- define scoped service credential or installation model
- workspace-level enablement
- action allowlist
- permission validation engine
- user-request attribution

Deliverables:

- agent identity model
- policy engine
- permission-aware action executor

Dependencies:

- parallel with Epic 3, but must be complete before broad write rollout

## Epic 5. Native Triggers

Objective:

- let users invoke the agent naturally from real workflows

Scope:

- AI entry points in issue detail
- AI entry points in project views
- future `@agent` mention support
- comment-based action requests
- contextual deep links to AI conversations

Deliverables:

- intuitive invocation model
- contextual execution flows

Dependencies:

- Ask mode and Build mode stable enough for real usage

## Epic 6. Automation and Event-Driven Flows

Objective:

- allow the agent to react to workspace events

Scope:

- webhook consumer endpoints in `plane-ai-service`
- event routing
- safe event-triggered execution
- intake triage suggestions
- recurring summarization/reporting

Deliverables:

- event-driven agent workflows
- limited autonomous automations

Dependencies:

- outbound webhook coverage already present
- policy engine maturity

## Epic 7. Hardening and Scale

Objective:

- make the feature operationally safe and production-ready

Scope:

- observability
- rate limits
- retries and idempotency
- partial failure handling
- provider fallback behavior
- security review
- performance tuning

Deliverables:

- SLOs and monitoring
- production readiness checklist

Dependencies:

- at least one stable end-to-end user flow

## MVP Definition

The MVP should be intentionally narrow.

### Included in MVP

- dedicated AI chat
- Ask mode
- workspace/project/context-aware responses
- Build mode for:
  - create work item
  - update work item
  - add comment
- permission-aware execution
- action preview for write operations
- audit logs for all runs and actions

### Explicitly excluded from MVP

- delete project
- bulk destructive actions
- mass cross-project updates
- full automation with no review
- `@agent` mentions
- autonomous webhook-driven mutation flows
- semantic vector search if it delays shipping

## Recommended MVP User Stories

### Read stories

- As a user, I can ask what is blocking a project and receive a grounded summary.
- As a user, I can ask for the status of a work item by identifier.
- As a user, I can ask for a summary of recent activity in a cycle.

### Write stories

- As a user, I can ask the AI to create a work item in the focused project.
- As a user, I can ask the AI to rewrite or expand a work item description and approve the change.
- As a user, I can ask the AI to add a comment to a work item after reviewing the proposed text.

### Trust stories

- As a user, I can see what the AI plans to do before it mutates data.
- As an admin, I can review logs of what the AI did and on whose request.

## Backlog by Layer

## Backend Backlog

### Foundation

- Create `plane-ai-service` repository or package
- Add provider abstraction interface
- Add structured run state machine
- Add action execution abstraction
- Add workspace configuration loading

### Identity and policy

- Add agent credential model
- Add workspace-level enablement rules
- Add action capability model
- Add permission validation service
- Add request attribution fields

### Retrieval

- Add workspace/project/entity resolver
- Add issue retrieval adapter
- Add cycle/module/project retrieval adapters
- Add page retrieval adapter
- Add comment retrieval adapter
- Add disambiguation response format

### Execution

- Add `create_work_item` tool
- Add `update_work_item` tool
- Add `create_comment` tool
- Add dry-run executor
- Add approval token flow
- Add idempotency keys for actions

### Audit and telemetry

- Add run log persistence
- Add action log persistence
- Add provider latency/error metrics
- Add approval result logging
- Add failure categorization

## Frontend Backlog

### Core UI

- Create AI home/chat route
- Add mode selector
- Add conversation list/history
- Add contextual entry points
- Add result cards linking to affected entities

### Approval UX

- Action preview card
- approval/reject modal
- mutation summary display
- warning states for risky changes

### Admin and settings

- workspace-level AI agent enablement
- action policy visibility
- future service health status

### Audit UI

- run history page
- per-run detail page
- filters by user, workspace, action type, status

## Infrastructure Backlog

- Add `plane-ai-service` to local docker compose
- Add service to production compose/deployment model
- Add secrets management for provider credentials
- Add queue or async job processing
- Add monitoring dashboards
- Add tracing or correlation IDs across services

## Data Model Suggestions

These are proposed internal records for the new feature.

### `ai_agent_run`

- `id`
- `workspace_id`
- `project_id`
- `requested_by`
- `mode`
- `provider`
- `model`
- `status`
- `input_text`
- `context_snapshot`
- `started_at`
- `completed_at`

### `ai_agent_action`

- `id`
- `run_id`
- `action_type`
- `target_entity_type`
- `target_entity_id`
- `planned_payload`
- `executed_payload`
- `status`
- `error_message`
- `approved_by`
- `executed_at`

### `ai_agent_conversation`

- `id`
- `workspace_id`
- `created_by`
- `title`
- `context_type`
- `context_entity_id`

## Suggested API Surface

The exact route structure can evolve, but the system likely needs endpoints like:

- `POST /api/ai/runs/`
- `GET /api/ai/runs/:id`
- `POST /api/ai/runs/:id/approve`
- `POST /api/ai/runs/:id/reject`
- `GET /api/ai/conversations/`
- `POST /api/ai/conversations/`
- `GET /api/ai/actions/`

If the AI service is external, the Plane app may instead expose internal service endpoints or proxy routes.

## Dependency Map

### Hard dependencies

- LLM provider configuration
- CRUD APIs for target entities
- authentication model for agent execution
- audit storage
- feature flags

### Soft dependencies

- improved search
- page retrieval quality
- richer issue relationship reasoning
- better UI polish

## Recommended Sequence of Work

### Track 1. Architecture and service foundation

- define runtime ownership
- scaffold `plane-ai-service`
- define audit contracts

### Track 2. Retrieval and context

- implement project/work item/page resolvers
- add disambiguation behavior

### Track 3. Minimal execution

- implement read-only runs
- implement create/update work item actions
- implement approval path

### Track 4. Native UI

- ship AI chat
- ship preview/approval UI
- ship run history

### Track 5. Rollout

- internal testing
- restricted workspace beta
- wider enablement

## Estimated Delivery Shape

These are rough planning buckets, not commitments.

### Discovery and design

- 1 to 2 weeks

### Foundations and Ask mode

- 2 to 4 weeks

### Build mode MVP

- 3 to 5 weeks

### Hardening and beta rollout

- 2 to 3 weeks

### Total MVP range

- approximately 8 to 14 weeks depending on team size, retrieval quality expectations, and whether infrastructure already exists for a separate AI service

## Team Shape Recommendation

Minimum effective team:

- 1 backend engineer
- 1 frontend engineer
- 1 product-minded technical lead

Ideal team:

- 1 backend engineer
- 1 frontend engineer
- 1 infra/platform engineer part-time
- 1 design/product partner part-time

## Milestones

### Milestone 1. Architecture approved

Exit criteria:

- identity model chosen
- service boundary approved
- initial data model approved

### Milestone 2. Ask mode internal demo

Exit criteria:

- contextual Q&A works for a project
- runs are logged
- no mutation path yet

### Milestone 3. Build mode MVP internal demo

Exit criteria:

- can create and update work items
- preview and approval working
- permissions enforced

### Milestone 4. Limited beta

Exit criteria:

- selected workspaces can use the feature safely
- observability and rollback plan in place

### Milestone 5. General availability candidate

Exit criteria:

- reliability acceptable
- support playbook ready
- clear self-host setup documentation available

## Acceptance Checklist for Starting Implementation

Before engineering starts, confirm:

- Do we want service-mode or delegated-mode execution first?
- Do we require approval for every write in MVP?
- Which exact entities are in MVP write support?
- Is page retrieval required in MVP or phase 2?
- Will `plane-ai-service` live in a new repo or sibling package?
- What operational budget is acceptable for provider usage?

## Implementation Notes for Future Resume

- Reuse existing CRUD endpoints whenever possible rather than adding bespoke mutation paths early.
- Keep the tool layer thin and explicit.
- Avoid “free-form autonomous” execution in the first release.
- Do not implement mentions and automation before approval and audit are stable.
- Build observability early; debugging agent mistakes late is much more expensive.
