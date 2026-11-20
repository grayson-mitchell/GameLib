---
phase: quick-261109-uv4
plan: 01
status: complete
completed: 2026-11-09
commits: [7fbf0f1af, 68619d4ad, 254853a3e]
---

# Quick 261109-uv4: Version the shared-redists ledger on the store engine

The per-bottle ledger now uses the Phase 68 engine with its existing top-level numeric `version` as the single stamp (chain `steam_bridge/shared-redists`, baseline v1, so adoption rewrites nothing).

## Tasks

1. `7fbf0f1af` codec module `sharedRedistLedgerFile.ts`, chain registered, 8 engine-level tests.
2. `68619d4ad` `readLedger`/`writeLedger` routed through the engine. Newer or failed ledger: untouched, pass skipped with a warning. Unreadable ledger: backed up via `writePreMigrationBackup` before starting empty; if backup fails, pass skipped, file untouched. Six new tests plus the extended corrupt-ledger test.
3. `254853a3e` todo moved to `completed/`, inventory row updated.

## Verification

- jest: storeVersioning + storeMigrations + sharedRedistInstall: 8 suites, 111 tests pass; whole bridge dir run earlier all green.
- `tsc --noEmit -p .`, eslint (changed files), prettier --check (src paths): clean.
- `pnpm planning-gates`: 12/12 pass.

## Deviations

- The new `describe` in `sharedRedistInstall.test.ts` sits before the "Phase 54" block, because that block's last test leaves a never-settling in-flight run for the same appId that would otherwise swallow the first new test. Commented in the file.
- Added `jest.restoreAllMocks()` to that file's `afterEach` (needed for the backup-failure spy).
- Task 1 tests and implementation were committed together (no separate RED commit).

## Self-Check: PASSED
