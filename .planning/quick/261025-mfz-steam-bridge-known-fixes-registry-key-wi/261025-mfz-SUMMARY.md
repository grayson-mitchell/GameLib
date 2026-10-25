---
phase: quick-261025-mfz
plan: 01
subsystem: steam-bridge
tags: [known-fixes, registry, wine, trust-layers]
key-files:
  created:
    - src/backend/__tests__/knownFixesLayered.test.ts
    - public/fixes/284100-steam.json
  modified:
    - src/common/types.ts
    - src/backend/constants/paths.ts
    - src/backend/knownFixes.ts
    - src/backend/storeManagers/steam/bridgeKnownFixes.ts
    - src/backend/__tests__/steamBridgeKnownFixes.test.ts
    - src-tauri/tauri.conf.json
    - .planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md
metrics:
  completed: 2026-10-25
---

# Quick 261025-mfz: Steam bridge `registry` known-fix key

A source-aware known-fixes reader (local > bundled > remote, `registry` stripped from remote) plus a validated, timed `reg add /f` applier, and a bundled 284100 profile that sets the WMP Active Setup marker.

## Commits

- 1001d05a7 Task 1: types, `bundledFixesPath`/`localFixesPath`, `readKnownFixesLayered`, tauri resource `build/fixes`
- b891dee11 Task 2: `validateRegistryFixes`, `buildRegistryFixCommandParts`, registry application, `public/fixes/284100-steam.json`
- 01c8efa7d lint cleanup (two warnings)
- ad0e64438 Task 3: todo updated

## Verification

- `npx jest` on knownFixes, knownFixesLayered, steamBridgeKnownFixes, tauriConf: 122 passed. Whole `src/backend/storeManagers/steam` tree plus those: 2500 passed (run before the test-path fix; the one failure then was the deleted profile, see deviation). The final focused rerun was green.
- `pnpm codecheck` clean, `pnpm planning-gates` 12/12, eslint clean on the touched source files.
- `prettier --check` clean on all written paths; all were prettier-seen (`ignored:false`) except the todo, which is ignored (check omitted per convention).
- jest printed "A worker process has failed to exit gracefully" in the wide steam-tree run. Not investigated; the timeout test uses fake timers and the applier's timer is unref'd and cleared.

## Deviations

**1. [Rule 1 - Bug] Plan assumed bundledFixesPath is a tmp dir under jest.** It is not: the platform mock's `getAppPath()` is tmpdir but the electron automock resolves it to the repo root, so `bundledFixesPath` was the real `<repo>/public/fixes`. My first test run's cleanup `rmSync` deleted the freshly created shipped profile. Fix: both test files `jest.mock('../constants/paths')` to point `bundledFixesPath` at a per-pid tmp dir; the profile was recreated. The real-profile test reads the repo file directly, as planned. Commit b891dee11 (layered test fix included there).

**2. TDD red phase not observed separately.** I wrote the tests before the implementation but did not run them red before implementing; they were green on first run after implementation (apart from deviation 1).

## Known Stubs

None.

## Notes

- Ledger/reversal (decision 5) remains deferred; the live bottle and `~/Library/Application Support/gamelib` were not touched.
- `getKnownFixes` IPC and launcher.ts callers still use `readKnownFixes`.

## Self-Check: PASSED
