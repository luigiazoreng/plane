---
name: second-review
description: 'Final quality gate: holistic review of the complete change as a whole. Checks consistency across files, test adequacy, user experience, and commit readiness. The last check before delivering.'
---

# Second Review (Final Quality Gate)

## Overview

Final holistic review of the entire implementation as a complete change. This review looks at the big picture — how all the pieces fit together and whether the change is production-ready.

## When to Use

Use this skill **after** the first code review is complete and all issues are fixed.

## Holistic Review Checklist

### 1. Consistency Across Files

- [ ] Naming is consistent across entity, service, controller, route, tests
- [ ] Error messages use the same tone and format
- [ ] Response shapes are consistent with existing API endpoints
- [ ] TypeScript types are reused (not duplicated across files)

### 2. Complete Feature Validation

- [ ] The feature works end-to-end (from route to DB and back)
- [ ] All CRUD operations work if applicable (create, read, update, delete)
- [ ] Pagination follows existing patterns if listing endpoints added
- [ ] Sorting and filtering work if applicable
- [ ] WebSocket events emitted where the frontend expects them

### 3. Test Adequacy

- [ ] Happy path tests exist for all new endpoints/services
- [ ] Error case tests exist (404, 400, 403, 409)
- [ ] Multi-tenancy isolation test exists (account A can't see account B's data)
- [ ] Tests actually assert meaningful behavior (not just "doesn't throw")
- [ ] All tests pass: `npm test`

### 4. Migration Safety

- [ ] Migration `up()` creates the correct schema
- [ ] Migration `down()` properly reverts
- [ ] No changes to existing tables' timestamp defaults
- [ ] Works with both PostgreSQL and SQLite
- [ ] Indexes created for common query patterns

### 5. Production Readiness

- [ ] No TODO/FIXME comments left in production code
- [ ] No `console.log` statements (use Pino logger)
- [ ] No hardcoded values that should be configurable
- [ ] No debug code left behind
- [ ] Error handling covers realistic failure scenarios
- [ ] Graceful degradation for external service failures

### 6. Commit Readiness Assessment

Would this pass a senior engineer's review?

- [ ] Changes are focused (one logical change)
- [ ] No unnecessary refactoring mixed in
- [ ] Code is self-explanatory (minimal comments needed)
- [ ] No dead code or unused imports

## Final Verification Steps

1. **Run full test suite**: `npm test` in affected service(s)
2. **Check for errors**: Review problems panel for TypeScript/lint errors
3. **Verify no regressions**: Existing tests still pass
4. **Review the diff mentally**: Imagine reading this as a code reviewer

## Output Format

```markdown
## Final Review Results

### Overall Assessment: ✅ Ready / ⚠️ Minor Issues / 🔴 Not Ready

### Summary
[1-2 sentences on the quality of the implementation]

### Remaining Issues (if any)
1. [Issue] — [severity: critical/minor]

### Verification
- Tests: ✅ All passing (X suites, Y tests)
- TypeScript: ✅ No errors
- Lint: ✅ Clean

### Files Changed
- [list of files with brief description of changes]
```
