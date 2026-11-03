---
phase: quick-261104-9ou
plan: 01
subsystem: tools/dxvk
tags: [dxvk, wine, reg, 59-REVIEW-WR-01]
requirements: [59-REVIEW-WR-01]
key-files:
  modified:
    - src/backend/tools/index.ts
    - src/backend/tools/__tests__/dxvkInstallRemove.test.ts
    - src/backend/__tests__/launcher_runWineCommandResolveOnExit.test.ts
  moved:
    - .planning/todos/completed/2026-11-03-strict-dxvk-restore-tolerance-reads-truncated-output.md
decisions:
  - "Per-override `reg query KEY /v <dll>` judged by exit code; user.reg rejected (CrossOver saves it only when the wineserver stops, after the restore returns)"
  - "Exit code 1 means absent only after a successful reg import"
completed: 2026-11-04
---

# Quick 261104-9ou: Strict DXVK restore judges already-absent by exit code

`restoreDxvkStrict` now verifies each override with `reg query KEY /v <dll>` and decides from the exit code alone (0 = still set, 1 = absent, anything else including null fails closed), so late-flushed "Unable to find" text can no longer fail a retried restore. It also removes the false-success path where stdout truncated after the key header passed with overrides still set.

## Commits
- e3852a220 test: RED tests (7 new/rewritten strict-restore cases, plus a launcher test pinning that late stderr is lost while the exit code survives)
- 1249a076f fix: exit-code verdict in restoreDxvkStrict
- docs commit: todo moved to completed/ with a Resolution section

## Verification
- jest: dxvkInstallRemove, launcher_runWineCommandResolveOnExit, engineSwitch: 3 suites, 72 tests pass. RED run confirmed 9 strict-restore failures before the fix.
- restoreDxvkStrict body has 0 reads of stdout/stderr or "unable to find".
- prettier, eslint (0 errors, 6 pre-existing i18next warnings), tsc --noEmit clean; `pnpm planning-gates` 12/12.
- No prettier check on the todo: it is prettier-ignored, so a check would be vacuous.

## Deviations
None. Verify queries are skipped when the import failed (no `/v` query runs), as planned. Cost is about 5 sequential wine processes per restore, noted in the docblock.

## Self-Check: PASSED
