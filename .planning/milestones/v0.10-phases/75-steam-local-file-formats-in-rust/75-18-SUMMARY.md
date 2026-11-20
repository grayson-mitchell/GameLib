---
phase: 75-steam-local-file-formats-in-rust
plan: 18
subsystem: shortcuts
tags: [steam, shortcuts-vdf, rust, steamfiles, parity]
requires: [75-13]
provides:
  - add/remove/is-added of shortcuts.vdf on steamfiles_shortcuts_read/apply behind GAMELIB_STEAMFILES_SHORTCUTS=rust
  - shortcutsValidityFromSummary / titleIndexFromSummary pure helpers
affects: [75-24, 75-34]
key-files:
  created:
    - src/backend/storeManagers/steam/localFiles/__tests__/shortcutsReplay.test.ts
  modified:
    - src/backend/shortcuts/nonesteamgame/nonesteamgame.ts
    - src/backend/shortcuts/nonesteamgame/__tests__/nonesteamgame.test.ts
    - src/backend/sidecar/shortcutsFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/storeManagers/nile/games.ts
    - src/backend/storeManagers/sideload/games.ts
    - src/backend/sidecar/__tests__/shortcutsFlows.test.ts
    - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts
    - src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/overrides/shortcuts.json
key-decisions:
  - "requestRustInvoke threaded via instance deps (NonSteamGameDeps extends RustInvokeDeps; ShortcutsFlowDeps; nile/sideload ManagerDeps Picks); no new static imports"
  - "A thrown or failed Rust read is mapped to an unparsed summary so it reports the same 'corrupted' text rather than throwing"
requirements-completed: [STEAM-03, P75-B, P75-F, P75-E]
duration: 25min
completed: 2026-11-14
---

# Phase 75 Plan 18: shortcuts.vdf on Rust ops Summary

addNonSteamGame, removeNonSteamGame and isAddedToSteam now read shortcuts.vdf through `steamfiles_shortcuts_read` and edit it through `steamfiles_shortcuts_apply` under `GAMELIB_STEAMFILES_SHORTCUTS=rust`. No buffer or tree crosses the pipe. The ts branch is today's code unchanged.

## Tasks

1. Rust branch in nonesteamgame.ts (acb9de9d8). The entry is sent as typed `EntryField[]` in today's key order. The flags and appid are int32, and LastPlayTime is unix seconds. The add mutation sends `createIfMissing: true`, and the config-dir mkdir stays in TS. Validity messages are rebuilt in TS from the summary with the exact strings. Remove uses `removedExe`/`removedAppName` for image cleanup. A rejected invoke is pushed to errors rather than thrown.
2. Tests and replay parity (4c025cb64). The nonesteamgame rust-branch tests cover create-if-missing and entry order, existing-title no-op, corrupted strings, remove, and a rejected invoke. One flow test shows addToSteam reaching the apply op. shortcutsReplay.test.ts checks summary-derived validity and title lookup against the oracle across 24 parse fixtures.

## Deviations from Plan

**[Rule 3 - Blocking] requestRustInvoke dep cascade.** Adding `RustInvokeDeps` to `NonSteamGameDeps` made tsc fail in nile/sideload games.ts (ManagerDeps Picks), `handlers.ts` and `shortcutsFlowRegistration.ts`, and in three test deps literals. I threaded the dep through each and added `logDebug` to the shortcutsFlows logger mock.

**Acceptance note.** The `kind: 'int32'` grep count is 1, not >= 7, because I used a local `int()` helper that builds all seven int32 fields. The behaviour is asserted in the tests.

**Parity findings (not defects).**
- `unknown-type`: the oracle mis-reads the entry and loses Exe (errors: Exe and LaunchOptions missing). Rust keeps Exe (only LaunchOptions missing). Recorded as `shortcuts/validity/unknown-type` in overrides/shortcuts.json with a divergenceNote.
- `truncated`: the old TS path throws uncaught from parseBuffer. Rust reports `parsed: false`, which the rust branch reports as the corrupted-file error. Both are treated as corrupted; no override.
- Sparse arrays: the oracle's holes are compared compactly, since the Rust summary lists real entries only.

## Verification

- `npx tsc --noEmit -p .` clean.
- Jest over shortcuts, sidecar `__tests__` and steam/localFiles: 3136 passed.
- `pnpm backend-di-ceilings` reports only the known pre-existing jestMock baseline entries (none from this plan; no new jest.mock calls).
- Prettier clean on the touched files.
- IPC contract untouched, so `check:ipc-contract` was not run.

## Known Stubs

None.

## Self-Check: PASSED

Both commits (acb9de9d8, 4c025cb64) and shortcutsReplay.test.ts exist.
