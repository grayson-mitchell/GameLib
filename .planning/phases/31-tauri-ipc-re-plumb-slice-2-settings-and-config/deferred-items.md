# Deferred Items — Phase 31

Out-of-scope discoveries logged during plan execution (not fixed, per the
executor's scope-boundary rule: only auto-fix issues directly caused by the
current task's changes).

## Plan 31-01

- **Pre-existing eslint error in `src/backend/sidecar/electronStub.ts`**
  (`@typescript-eslint/no-redundant-type-constituents`, `'unknown' overrides
  all other types in this union type`) on the `IpcHandler` type's
  `) => unknown | Promise<unknown>` return type. Confirmed pre-existing via
  `git stash` + `npx eslint` against the committed HEAD version of the file
  (error present before any Plan 31-01 change touched this file). Unrelated
  to this plan's `process.getSystemVersion` polyfill addition (which lands
  earlier in the same file but does not touch the `IpcHandler` type). Not
  fixed — out of scope for this plan.
