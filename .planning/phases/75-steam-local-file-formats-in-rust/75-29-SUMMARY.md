---
phase: 75-steam-local-file-formats-in-rust
plan: 29
subsystem: steam-local-files
tags: [test-double, caller-tests, p75-g-prep]
requires: [75-27]
provides: [seven caller tests with no @node-steam/vdf or TS-shortcuts-path dependency]
key-files:
  modified:
    - src/backend/storeManagers/steam/__tests__/acfInstalldir.test.ts
    - src/backend/storeManagers/steam/__tests__/bridgeRouteVerdict.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts
    - src/backend/storeManagers/steam/__tests__/removeCopies.test.ts
    - src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts
    - src/backend/sidecar/__tests__/shortcutsFlows.test.ts
    - meta/backendDiCeilings/storeManagers.steam.json
    - meta/backendDiCeilings/storeManagers.steam.macArch.json
requirements-completed: [STEAM-03, P75-G]
completed: 2026-11-14
---

# Phase 75 Plan 29: Remaining caller tests off @node-steam/vdf / TS shortcuts Summary

Six steam tests and shortcutsFlows no longer mock or import `@node-steam/vdf` or depend on the TS shortcuts path; they run the Rust path (`GAMELIB_STEAMFILES_TEXT=rust` / `GAMELIB_STEAMFILES_SHORTCUTS=rust`, pinned per file with a plan-34 removal comment).

## Commit

- cdb8e89e2 test(75-29): all seven files plus the two baseline shards in one commit (the ceilings gate requires the baseline drop with the mock removal).

## What changed

- bridgeRouteVerdict, macArchKnownFixRouting, steamStartupKeyringDeferral, removeCopies, games: `jest.mock('@node-steam/vdf')` removed; `requestRustInvoke: mockedFsSteamFiles().requestRustInvoke` injected into the deps (removeCopies/games use the fixture's programmable `vdf.parse`); `logDebug: jest.fn()` added to the existing logger mock factories.
- games.test.ts: the "delegates when the ACF is Steam-adopted" case now feeds `readAcfSnapshot` the Rust-path snapshot fields (`stateFlags: 4, buildid: '123'`) instead of a programmed vdf parse; the assertion is unchanged.
- acfInstalldir.test.ts: ts-branch describe deleted (graceful-fs/vdf mocks gone); the rust describe stays as the whole file.
- shortcutsFlows.test.ts: it never imported steam-shortcut-editor (only comments named it), but the SET/UNSET/EMPTY and RPC-frame describes ran the TS write path. They now run on stubRustSteamFiles handlers (`steamfiles_shortcuts_read`/`_apply`) via a file-level pin and a `programShortcutsRust()` helper.

## Deviations from Plan

**Tests removed (acfInstalldir.test.ts, 8 ts-branch cases)**, each with a Rust twin in the same file:
- returns installdir when manifest exists -> "returns the installdir and reads the manifest path through steamfiles"
- missing manifest -> "returns undefined for a missing manifest"
- parse throws / readFileSync throws -> "returns undefined when the invoke rejects, never throwing"
- installdir absent -> "returns undefined when the record has no installdir"
- empty string and whitespace-only -> "returns undefined for a blank installdir"
- D-03 literal traversal value -> "returns the raw traversal-shaped value unsanitised (D-03)"

**shortcutsFlows assertion shape changed (not removed):** byte-level checks on a written shortcuts.vdf (unchanged bytes for UNSET/EMPTY, Exe substring for SET) became "no `steamfiles_shortcuts_apply` call" and "the apply `add` mutation's Exe field contains the quoted pinned shell path and not `process.execPath`". Byte layout is covered by the Rust crate (plans 09/11). Notification/dialog/image flow assertions untouched.

Also removed two now-unused imports (writeFileSync, readdirSync) in shortcutsFlows.

## Gates

- jestMock baselines lowered: bridgeRouteVerdict 14->13, macArchKnownFixRouting 27->26, removeCopies 27->26, steamStartupKeyringDeferral 29->28, acfInstalldir entry removed (games.test.ts baseline was already 47 matching its post-removal count). backend-di-ceilings: 20 FAIL lines (all pre-existing, none in these files), down from 21.
- grep `@node-steam/vdf` in the six steam files: 0; `steam-shortcut-editor` in shortcutsFlows: 0.
- Jest: the seven files plus localFiles/__tests__: 19 suites, 874 tests pass. tsc clean. eslint 0 errors on touched files. find-deadcode: only pre-existing humble/WebView findings. steam-line-ceiling exit 0. Prettier clean.

## Self-Check: PASSED
