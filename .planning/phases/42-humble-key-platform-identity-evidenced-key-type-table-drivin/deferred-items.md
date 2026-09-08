# Deferred Items — Phase 42

Out-of-scope discoveries logged during plan execution (not fixed — see
executor Scope Boundary rule).

## 42-06: `electronUntouched.test.ts` failure (unrelated to this plan)

- **Found during:** Task 3 full-suite verification (`npx jest --selectProjects Backend src/backend/humble`).
- **Failing test:** `src/backend/sidecar/__tests__/electronUntouched.test.ts`
  → `'by-construction gate: keyringTokenStore.ts and bootstrap.ts never reference configStore/TOKEN_STORE_KEY/TOKEN_PREFIX (comments stripped)'`
- **Scope:** Asserts `src/backend/sidecar/keyringTokenStore.ts` and
  `src/backend/sidecar/bootstrap.ts` never reference
  `configStore`/`TOKEN_STORE_KEY`/`TOKEN_PREFIX`. Entirely unrelated to
  Humble Keys / the settle-undo reachability work in plan 42-06 — neither
  file is in this plan's `files_modified` list, and no commit in this plan
  touches `src/backend/sidecar/`.
- **Action taken:** None (Rule 1-3 auto-fix is scoped to defects caused by
  the current task's changes; this predates and is unrelated to this
  plan's diff). Not fixed. Left for a dedicated todo/investigation outside
  this plan's scope.
