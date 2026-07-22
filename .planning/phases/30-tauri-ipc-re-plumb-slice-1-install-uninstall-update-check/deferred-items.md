# Deferred Items — Phase 30

Out-of-scope discoveries logged during plan execution, per the executor's scope-boundary
rule (only auto-fix issues directly caused by the current task's changes).

## Plan 30-02

- **Pre-existing eslint errors in `src/backend/sidecar/handlers.ts` (lines 144, 182),
  `@typescript-eslint/no-unnecessary-type-assertion`.** Discovered while running
  `npx eslint` against files touched by Task 2 (`registerInstallFlows()`
  registration). Both flagged lines (`cacheBackedStore.store as Record<string,
  unknown>` and `(STORE_UNIVERSE as readonly string[]).includes(storeName)`) predate
  this plan — confirmed via `git diff HEAD~2 -- src/backend/sidecar/handlers.ts`,
  which shows this plan's own diff touches only the docstring, one import line, and
  one call-site addition. Not fixed here (out of scope, unrelated to the
  install-slice registration this plan adds).
