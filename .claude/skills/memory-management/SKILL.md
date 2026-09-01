---
name: memory-management
description: 'Effective use of the VS Code Copilot memory system to persist context, avoid repeating mistakes, and accelerate future implementations. Covers repo memory, session memory, and user memory strategies.'
---

# Memory Management

## Overview

Use the memory system to persist knowledge across conversations and avoid repeating mistakes. Memory is your most powerful tool for improving efficiency over time — a well-maintained memory system turns every implementation into a learning opportunity.

## When to Use

- **Before starting work**: Check existing memories for relevant context
- **After discovering a pattern**: Record it so you don't have to rediscover it
- **After making a mistake**: Record what went wrong and the fix
- **After completing a task**: Summarize key decisions and outcomes
- **When context is getting long**: Offload working state to session memory

## Memory Scopes

### Repository Memory (`.claude/memories/repo/`)
**Scope**: Persists for the workspace/repository. Shared across all conversations about this codebase.

**What to store**:
- Codebase architecture facts (entity relationships, service dependencies)
- Build commands and environment setup quirks
- Migration gotchas and database schema notes
- Patterns that differ from what documentation suggests
- Bug patterns that recur (e.g., "SQLite doesn't support X, use Y instead")
- API contracts between services
- Test infrastructure notes (which helpers exist, which mocks are needed)

**Naming convention**: `[topic].md` — e.g., `database-schema.md`, `billing-patterns.md`, `test-infrastructure.md`

**Example**:
```markdown
# Database Schema Notes

## apps/api (Django)
- Models herdam `BaseModel` — id UUID, created_at/by, updated_at/by automáticos
- NUNCA editar migration existente; `AddField NOT NULL` precisa de default
- Testes rodam com `--nomigrations`: bug de migration NÃO aparece no pytest
- `--reuse-db`: após mudar model, primeiro run precisa de `--create-db`

## apps/web (React Router v7)
- Estado em MobX; `fetchedMap` distingue "não buscado" de "vazio"
- Componente que lê observable precisa de `observer`, senão não re-renderiza
```

### Session Memory (`SESSION_DIR` — ver `.claude/instructions/memory.instructions.md`)
**Scope**: Current conversation only. Cleared when the conversation ends.

**What to store**:
- Implementation plans and progress tracking
- Files modified so far (for review phases)
- Decisions made during the conversation
- Intermediate findings from codebase exploration
- Error patterns encountered during this session

**Naming convention**: `[task-name].md` — e.g., `add-storage-quota.md`, `fix-billing-bug.md`

**Example**:
```markdown
# Add Storage Quota Feature — Session Notes

## Files Modified
- apps/api/plane/db/models/quota.py (criado)
- apps/api/plane/app/views/quota/base.py (criado)
- apps/api/plane/db/migrations/0092_quota.py (criado)

## Decisões
- `ProjectEntityPermission` em vez de checagem manual de papel
- Campo adicionado como nullable + backfill, para não quebrar base populada

## Problemas encontrados
- `--nomigrations` esconde erro de migration: validada à parte com `manage.py migrate`
```

### User Memory (`~/.claude/projects/[project]/memory/`)
**Scope**: Persists across ALL workspaces and conversations.

**What to store**:
- User preferences (coding style, review thoroughness)
- Common patterns the user likes
- Mistakes that tend to recur across projects
- Tool usage lessons (e.g., "never use terminal for file ops")

**IMPORTANT**: Keep entries very short — user memory is loaded into context automatically, so brevity is critical.

## Workflow Integration

### Phase 1 (Codebase Review) — READ memories
```
1. Check .claude/memories/repo/ for existing architecture notes
2. Check .claude/memories/session/ for any prior context on this task
3. Skip exploration for areas already documented in memory
```

### Phase 4 (Implementation) — WRITE session memory
```
1. After creating files, log them in session memory
2. Record any gotchas discovered during implementation
3. Record decisions that might be questioned in review
```

### Phase 5 (Code Review) — READ session memory
```
1. Review session notes for list of files to check
2. Reference decisions made to validate consistency
```

### Phase 6 (Second Review) — UPDATE repo memory
```
1. If new patterns were discovered, add to repo memory
2. If mistakes were caught, record the lesson
3. If architecture changed, update the schema notes
```

## Anti-Patterns (Don't Do This)

- **Don't dump entire files into memory** — summarize key facts only
- **Don't create a memory for every small action** — only for reusable knowledge
- **Don't forget to check memory before exploring** — avoid redundant work
- **Don't store sensitive data** (passwords, API keys, tokens) in any memory scope
- **Don't create duplicate files** — always check what exists first with `view /memories/`

## Memory Maintenance

- **Periodically review** repo memory files for outdated information
- **Delete or update** memories that are no longer accurate
- **Consolidate** multiple small memory files into organized topic files
- **Keep repo memory files under 50 lines each** — split large files by topic

## Quick Reference

| Action | Command |
|--------|---------|
| List all memories | `view /memories/` |
| Read a memory file | `view .claude/memories/repo/[file].md` |
| Create new memory | `create .claude/memories/repo/[file].md` with content |
| Update a memory | `str_replace` on the specific file |
| Add a line | `insert` at specific line number |
| Delete outdated | `delete .claude/memories/repo/[file].md` |
