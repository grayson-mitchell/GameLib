---
phase: 75-steam-local-file-formats-in-rust
plan: 28
subsystem: steam-local-files
tags: [test-double, caller-tests, p75-g-prep]
requires: [75-27]
provides: [thirteen library.* tests with no @node-steam/vdf dependency]
key-files:
  created:
    - src/backend/storeManagers/steam/localFiles/__tests__/fixtures/mockedFsSteamFiles.ts
  modified:
    - the thirteen library.*.test.ts files listed in the plan
    - meta/backendDiCeilings/storeManagers.steam.json
    - meta/backendDiCeilings/storeManagers.steam.macArch.json
requirements-completed: [STEAM-03, P75-G]
completed: 2026-11-14
---

# Phase 75 Plan 28: Library caller tests off @node-steam/vdf Summary

All thirteen library.* tests no longer mock or import `@node-steam/vdf`; they run the Rust path (`GAMELIB_STEAMFILES_TEXT=rust`, pinned per file with a plan-34 removal comment) through a new `mockedFsSteamFiles` double.

## Commit

- 04f86b7ee test(75-28): all thirteen files, the fixture and the two baseline shards (one commit: the ceilings gate requires the baseline drop in the same commit as the mock removal)

## Deviations from Plan

**[Design] `mockedFsSteamFiles` instead of `fsBackedSteamFiles`.** These tests mock `graceful-fs` and feed file state through `existsSync`/`readdirSync`/`readFileSync` mocks plus programmed `vdf.parse` return objects; none write real files, so the plan 27 real-file double (which reads node `fs`) cannot see their state. The new fixture exports `vdf = { parse: jest.fn() }` (a plain programmable result source, not a jest.mock and not a parser) and handlers for read_acf, find_acf, scan_acfs, read_running_app_id that walk the same mocked filesystem the removed TS branches walked and shape the programmed `{ AppState }` / `{ Registry }` objects into the crate result structs. Test bodies are otherwise untouched. Unstubbed channels reject loudly.

**Tests removed (library.test.ts, four TS-finalize-only cases)**, each asserting `finalizeToSteam` from the TS branch that the Rust path replaced with `depot_finalize`:
- "finalizes an interrupted GameLib depot download to a 1026 manifest" (twin: rust describe "a failed verify sends outcome null with the sanitised installdir")
- "finalizes BEFORE it starts watching" (replaced by a depot_finalize ordering twin added to the rust describe, so the ordering assertion is kept)
- "WR-03 hostile installdir ... honest-empty 1026 fallback" (twin: "a hostile installdir finalizes the fallback installdir")
- "a verify failure ... passive honest-empty 1026 fallback" (twin: "a failed verify sends outcome null")

No ts-branch describes existed in acfState/installedMap/resumeBreadcrumbs (the TS path ran only through the jest.setupContainment default), so nothing else was deleted. Also added `logDebug: jest.fn()` to the existing logger mock factories (no new jest.mock).

## Gates

- jestMock baselines: 12 files 19 -> 18, runningPoll 3 -> 2 (one `jest.mock('@node-steam/vdf')` removed each); backend-di-ceilings 21 FAIL lines, all pre-existing (none in files this plan touched).
- `grep @node-steam/vdf` over library*.test.ts: 0.
- Jest library suites + localFiles/__tests__: 29 suites, 461 tests pass. tsc clean. Lint 0 errors. find-deadcode: only pre-existing humble/WebView findings. steam-line-ceiling exit 0. Prettier clean.

## Self-Check: PASSED
