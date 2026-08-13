# Deferred items (out of scope, discovered during execution)

## 34.1-13

Discovered while running `npx eslint` against `src/backend/__tests__/tauriShellSource.test.ts`
as part of verifying this plan's own edits to that file. Both pre-date this plan (confirmed via
`git show HEAD:src/backend/__tests__/tauriShellSource.test.ts`) and are unrelated to the tray
icon template work — left unfixed per the scope boundary rule (only auto-fix issues directly
caused by the current task's changes).

- `src/backend/__tests__/tauriShellSource.test.ts:47` -- `CARGO_TOML_PATH` is assigned a value
  but never used (`@typescript-eslint/no-unused-vars`).
- `src/backend/__tests__/tauriShellSource.test.ts:1424` -- an unnecessary type assertion
  (`@typescript-eslint/no-unnecessary-type-assertion`).
