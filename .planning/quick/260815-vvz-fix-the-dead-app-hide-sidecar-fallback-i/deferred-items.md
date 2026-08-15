# Deferred items — quick task 260815-vvz

Out-of-scope discoveries found while executing this plan's scoped `eslint` verification
(Task 3, step 4). Not fixed, per the executor's scope boundary ("only auto-fix issues DIRECTLY
caused by the current task's changes").

## 1. Pre-existing eslint error in `electronStub.ts` (unrelated to this plan's diff)

- **File:** `src/backend/sidecar/electronStub.ts:115`
- **Rule:** `@typescript-eslint/no-redundant-type-constituents`
- **Message:** `'unknown' overrides all other types in this union type`
- **Code:** `export type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>`
- **Confirmed pre-existing:** `git blame` attributes this line to commit `64bbef740d`
  (2026-07-20), well before this plan's diff. Not touched by any of this plan's three tasks.
- **Why deferred:** this plan's scope is the `app.hide()` sidecar fallback and the dynamic-
  import gate, not a general eslint cleanup pass. Fixing it would require touching a type
  signature this plan has no other reason to change.
