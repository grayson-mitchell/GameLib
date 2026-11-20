---
phase: 75-steam-local-file-formats-in-rust
plan: 32
subsystem: steam-local-files
tags: [delete-gate, p75-g, bridge, shortcuts]
requires: [75-30, 75-31]
provides: [Rust-only bridge readers and shortcuts.vdf handling]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/drm/valveClient.ts
    - src/backend/storeManagers/steam/bridge/sharedRedists.ts
    - src/backend/shortcuts/nonesteamgame/nonesteamgame.ts
    - package.json
requirements-completed: [STEAM-03, P75-G, P75-A, P75-B]
completed: 2026-11-14
---

# Phase 75 Plan 32: Bridge readers and shortcuts.vdf Rust-only Summary

`parseKv1`, `parseInstallScript`, `KvNode` and helpers, `parseValveClientManifest`, `FORBIDDEN_KEY_RE` and the `@node-steam/vdf` import in valveClient.ts are deleted. The Valve manifest is always written into the run's `.partial-` dir and validated by `parseValveClientManifestFile` (Rust, after the TS fetch bound). `readInstallScript` is Rust-only. nonesteamgame.ts has only the Rust read/apply path: no `steam-shortcut-editor`, no `writeFileSync`, no in-place write (T-75-80). The `steam-shortcut-editor` dependency is removed from package.json and the lockfile (no importer is left).

## Commits

- a3f93e43f refactor(75-32): bridge readers Rust-only (Task 1)
- 653a338b1 refactor(75-32): nonesteamgame.ts Rust-only (Task 2; also carries the package removal and one test fix, below)

## Deviations from Plan

1. **[Rule 3] `own()` kept in valveClient.ts.** The plan said remove it; it is still used for the extracted-metadata `files` lookup.
2. **[Rule 3] Test doubles for removed in-process parsing.** Tests that relied on the TS parse now use programmed Rust doubles (never a parser):
   - sharedRedists/sharedRedistInstall tests read recorded entries from a new fixture `bridge/__tests__/fixtures/sharedRedists/entries.json`, generated once from the old TS parser (identical to what the Rust reader returns per bridgeReplay).
   - depot.sharedRedist.test.ts and rustInstall.test.ts (shared-redist case) answer `steamfiles_read_installscript` from those recorded entries (bytes equal a committed fixture, else the "does not parse" null); logger mock gained `logDebug`.
   - valveClient.test.ts: a stub answers `steamfiles_parse_valve_manifest` from the fixture text's bins_win64 fields; the former rust-flag describe is renamed "manifest hand-off".
3. **[Rule 3] steam-shortcut-editor removed from package.json/pnpm-lock.yaml** (plan 35 owned this): find-deadcode would otherwise report it as a new unused dependency. The `src/common/typedefs/steam-shortcut-editor.d.ts` file is left for plan 35. Local `ShortcutEntry` interface added to nonesteamgame.ts (it previously came from that typedef).
4. **Acceptance grep deviation:** `parseInstallScript/` and `parseValveClientManifest/` remain as string case ids in bridgeReplay.test.ts; they key the recorded oracle goldens (renaming fails with "no oracle case"). fixtureCopy.ts comment no longer names `parseKv1`.
5. test_data under nonesteamgame/__tests__ was NOT removed: shortcutsFixtures.test.ts still reads it as the fixture source, and the rust describe uses copyTestFile.
6. GAMELIB_STEAMFILES_* env pins in the touched tests were left for plan 34.

## Test cases deleted (ts-branch-only, Rust twin exists)

- sharedRedists.test.ts: `parseKv1` describe (all cases), `parseInstallScript` describe (5 cases), readInstallScript "ts flag parses the file in process" case. Twins: bridgeReplay and Rust readers.rs tests.
- valveClient.test.ts: `parseValveClientManifest` describe (reject table, forbidden keys, oversize/non-string cases). Twins: Rust readers.rs guard tests (plan 08) and bridgeReplay reasons.
- nonesteamgame.test.ts: the whole ts-flow `NonSteamGame` describe (5 tests: already exists, add/remove, create if missing, one corrupted user, user-provided files). Twins: the rust-branch describe (existing title no-op, corrupted summary strings, createIfMissing) and shortcutsReplay.

## Gates

- tsc clean. lint:src and lint:tests: 0 errors (no "error(s)" line). Prettier clean on touched files.
- find-deadcode: 5 findings, all pre-existing humble/* and WebView/storeExitRefresh.ts.
- steam-line-ceiling exit 0. backend-di-ceilings: 20 FAIL lines. No `jest.mock(` added or removed.
- Jest steam + sidecar + shortcuts + meta: failures are not from this plan: shimCoverage/shimGenerate, tauriShellSource, gamelibCatalogParity and lintTranslations (other session's public/locales/en/gamelib.json), rustTestWorkflow, x86CallbackWineHarness. rustInstall (caught and fixed here) passes.

## Self-Check: PASSED
