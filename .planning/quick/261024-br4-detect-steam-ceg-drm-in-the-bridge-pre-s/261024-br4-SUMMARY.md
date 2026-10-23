---
phase: quick-261024-br4
plan: 01
status: complete
subsystem: steam-bridge
tags: [steam, bridge, drm, ceg, pe-parser, census]
requires: [TODO-2026-10-22-CEG]
provides:
  - detectSteamDrmInPe / detectSteamDrmInPeBytes / CEG_RESOURCE_NAMES (pure, zero-import)
  - SteamBridgeVerdict.drm + writeBridgeDrmVerdict
  - placeShimForGame result.drm signal
  - resolver row 4 folds verdict.drm 'ceg' into 'drm-wrapped'
  - install/launch 'drm-wrapped' setup-required dead ends
affects: [bridgeCensus, SteamBridgeSetup dialog, gamelib i18n catalog]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/peSteamDrm.ts
    - src/backend/storeManagers/steam/bridge/__tests__/peSteamDrm.test.ts
  modified:
    - meta/bridgeCensus.ts
    - meta/__tests__/bridgeCensus.test.ts
    - src/backend/storeManagers/steam/electronStores.ts
    - src/backend/storeManagers/steam/bridge/bridgeVerdict.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/bridgeRoute.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
    - .planning/todos/completed/2026-10-22-detect-steam-ceg-drm-in-bridge-prescreen.md (moved from pending/)
decisions:
  - "A detected CEG (verdict.drm 'ceg') beats a bundled non-DRM known-bad reason, in both the resolver and the census"
  - "SteamStub .bind is detected and reported only (log line, census detail suffix); it never routes"
  - "bridge.drm lives at the top level of SteamBridgeVerdict, outside scan, so a shim export-set auto-clear cannot drop it"
  - "Install-time CEG removes the per-game bridge bottle; launch-time CEG keeps it"
metrics:
  completed: 2026-10-24
  tasks: 3
  commits: 4
---

# Quick 261024-br4: Detect Steam CEG DRM in the bridge post-install scan — Summary

The bridge now detects Steam CEG automatically. A pure, zero-import PE resource walker looks for the RT_RCDATA names `STEAM_SPLIT_GUID`, `STEAM_GUIDD` and `STEAM_MINSTANCE`. It runs inside `placeShimForGame` once validation passes, and the result is saved as `bridge.drm: 'ceg'`. The resolver sends such a title to bottled Steam as known-bad `drm-wrapped`. Install and launch now show a `drm-wrapped` setup dialog instead of the silent ~30s exit. `pnpm bridge-census` counts CEG titles as DRM misses.

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | `e02dc55a8` | Pure PE CEG / `.bind` detector (`peSteamDrm.ts`) + census classification |
| 2 | `ebcd67c81` | `bridge.drm` persistence, `placeShimForGame` drm signal, resolver row 4 fold |
| 3 | `1fea8427e` | Install/launch DRM dead ends, dialog copy + i18n key, todo close-out |
| fix | `b9240cba8` | Drop three module-local type exports flagged by `pnpm find-deadcode` |

## Live XCOM detector result (declared real-profile read)

This was a read-only scan of the operator's real CrossOver `GameLibSteam` bottle. It used fd-ranged reads, bundled via `node meta/runTs.cjs --bundle`. No child process was spawned, so the fake-HOME rule does not apply. Nothing in the bottle was modified.

| Exe | parsed | cegMarkers (file order) | hasBindSection |
| --- | ------ | ----------------------- | -------------- |
| `XCom-Enemy-Unknown/Binaries/Win32/XComGame.exe` | true | `STEAM_GUIDD`, `STEAM_MINSTANCE`, `STEAM_SPLIT_GUID` | false |
| `XCom-Enemy-Unknown/XEW/Binaries/Win32/XComEW.exe` | true | `STEAM_GUIDD`, `STEAM_MINSTANCE`, `STEAM_SPLIT_GUID` | false |

The detector matched both exes without any loosening. The file order is the PE's own sorted resource-name order.

Live `pnpm bridge-census` (also a read-only real-profile run, exit 0) printed "18 of 19 routed to the bridge; 1 of 19 verified; 14 of 19 fully covered". 200510 shows `known-bad / drm-wrapped`. 200510 is also on the bundled knownBad list, so this row does not by itself prove the detector path; the unit tests prove that. Grim Dawn (219990) and Raft (648800) show the informational `SteamStub .bind section (informational)` suffix, and their class is unchanged (`no-steam-api`).

## Verification results

- `grep -c '^import' peSteamDrm.ts` printed 0.
- Jest: `games.test.ts` + the whole `bridge/__tests__` directory + `bridgeCensus.test.ts` + `bridgeRouteDisplay.test.ts` gave **16 suites, 691 tests, all passed** (Task 3 verify set). I re-ran after the deadcode fix: 15 suites, 680 tests, all passed (same set minus `bridgeRouteDisplay`).
- `pnpm codecheck` (src + meta) passed.
- `pnpm find-deadcode`: `unreachable: 46 OK | used-in-module: 0 OK`. It reported 3 FAIL before commit `b9240cba8`.
- `npx prettier --check` over every code path written passed. `public/locales/**` and `.planning/**` are prettier-ignored, so I matched their formatting by hand.
- `pnpm lint-translations:gamelib`: 0 hard failures, after regenerating the presence baseline. Before that it reported 48 hard failures for the new key.
- `pnpm i18n-churn-guard`: clean.
- **`pnpm lint`: FAILED (pre-existing, not caused by this task).** The production scope passes. The tests scope fails with `✖ 660 problems (2 errors, 658 warnings)` / "ESLint found too many warnings (maximum: 657)". The 2 errors are `no-regex-spaces` in `meta/__tests__/gen_vtables.test.ts:645,648`. I ran `node meta/lintScoped.cjs --tests` in a temporary detached worktree at `e8420f960`, the commit before this task. It printed the identical `660 problems (2 errors, 658 warnings)`, so the tests-scope failure was there before this task. The rule tally for `games.test.ts` is unchanged (56 unbound-method). I did not fix it because it is out of scope.
- **`pnpm planning-gates`: 11/12 (pre-existing failure).** `preload-surface-gate.py` reports that `getSteamBridgeRoute` and `setSteamBridgeUserRoute` are missing from `IPC-PORT-INVENTORY.md`. It fails the same way at `e8420f960`, and this task touched no preload or IPC surface. The todo-frontmatter gate passes.
- Todo checks: the file is in `completed/` and gone from `pending/`, and it has a `## Closed` heading. All pass.
- `graphify update .` ran after the code changes.

## Departures from the orchestrator's design direction (carried from the plan)

1. **SteamStub `.bind` is detected and reported, never routed.** It shows up only as a backend `logInfo` line and a census detail suffix. This follows the 2026-10-23 sibling todo and the narrow-fallback rule: only DRM that needs a Windows Steam client (CEG) justifies a new route into bottled Steam.
2. **A detected CEG beats a bundled non-DRM known-bad reason.** The effective reason is `verdict?.drm === 'ceg' ? 'drm-wrapped' : knownBadReason` in `resolveBridgeRoute`, and the census uses the same order (new step 0 ahead of the bundled reason).
3. **No separate fs-wrapper module.** The fd reader is a private `detectExeSteamDrm` in `shimGenerate.ts`, with a twin `scanExeSteamDrm` in `meta/bridgeCensus.ts`. The parser is its own zero-import module.
4. **No type-union edits.** `common/types/steam.ts`, `ipc.ts` and `frontend/state/SteamBridgeSetup.ts` are untouched. `'drm-wrapped'` already existed in the unions and in `bridgeRouteDisplay.ts`.

## Deviations from Plan

1. **[Rule 3 - Blocking] Regenerated `meta/i18nCatalogPresenceBaseline.json`** (not in `files_modified`). `lint-translations:gamelib` hard-failed on 48 locales missing `steam.bridge.setup.drmCeg`, and its own message says "fill it or regenerate the baseline". I followed the most recent precedent, quick 261023-og0 (`6ab44d3c9`), and regenerated with `LINT_TRANSLATIONS_WRITE_BASELINE=1`. That adds 48 pairs and removes none. The 48 non-English catalogs still lack a translation for this key, and the baseline records that gap. Committed in `1fea8427e`.
2. **[Rule 1 - Bug] Dropped `export` from `PeReader`, `PeSteamDrmResult` (peSteamDrm.ts) and `SteamExeDrmSignal` (shimGenerate.ts).** The plan listed `PeSteamDrmResult` / `SteamExeDrmSignal` as exported types. They have no importer outside their own module, and `pnpm find-deadcode` failed `used-in-module` on all three. The exported functions keep their exact signatures. Commit `b9240cba8`.
3. **Install/launch dead-end logic is factored into a private `persistBridgeDrmSignal(drm, caller)` method** in `games.ts`, so install and launch share one persistence and forced-bridge check. Behaviour is as the plan describes.
4. **Test fixture choice for "drm null clears a persisted 'ceg'" (install):** the fixture also carries `userRoute: 'bridge'`. Without it, row 4 routes a stored `drm: 'ceg'` title to bottled Steam before `installBridgeGame` runs, which is the intended behaviour. So the forced route is the only way such a title reaches the clear path.
5. **One added detector test beyond `<behavior>`:** duplicate CEG names are reported once.

### Pre-existing assertions narrowed in Task 2

**None.** No existing `shimGenerate.test.ts` assertion needed narrowing. The non-PE fixture exes do hit the new "could not parse the exe as a PE" `logWarning`, but no existing test asserted `logWarning` was never called, so all 37 pre-existing tests passed unchanged.

## Threat model coverage

- T-br4-01: every read is bounds-checked (a short read throws internally and comes back as unparsed). Caps: 96 sections, 4096 entries per directory, 256-unit names. A cycle guard rejects a zero subdirectory offset, and the whole body sits in try/catch. Tests cover garbage, empty, non-MZ, a truncated section table, an `e_lfanew` past EOF, an out-of-section RVA and a self-referencing subdirectory.
- T-br4-02: reads go through `readSync` in ranges. The exe is never read whole, and the fd is closed in `finally`.
- T-br4-03: detection runs only on non-`error` results. A test shows that a non-numeric appId or an out-of-bottle CEG exe yields no `drm` key and no DRM log line.
- T-br4-05: only CEG routes. `.bind` never does, and `userRoute: 'bridge'` is honoured at the resolver, install and launch (all tested).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/bridge/peSteamDrm.ts
- FOUND: src/backend/storeManagers/steam/bridge/__tests__/peSteamDrm.test.ts
- FOUND: .planning/todos/completed/2026-10-22-detect-steam-ceg-drm-in-bridge-prescreen.md
- FOUND commits: e02dc55a8, ebcd67c81, 1fea8427e, b9240cba8
