---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 05
subsystem: steam-crossover-bottle
tags: [steam, crossover, wine, bottle, macos, routing, typescript]

# Dependency graph
requires:
  - phase: 17-02 (Steam bottle foundation)
    provides: isBottleProvisioned, getSteamBottleSettings (bottle.ts)
  - phase: 17-03 (Steam install-state bottle awareness)
    provides: startInstallPolling/startUninstallPolling(appId, { source 'bottle' }) (library.ts)
  - phase: 17-04 (Bottle provisioning + bottled-Steam command surface)
    provides: tellBottledSteamTo{Install,Launch,Uninstall}(appId), steamBottleSetupRequired push channel (bottle.ts, ipc.ts)
provides:
  - "Per-OS confirmed-not-native isNative() on SteamGame — D-11 gated on steamMetadataStore.platformsCaptured===true && is_mac_native===false, macOS only"
  - "install()/launch()/uninstall() branch on isBottleEligible(): un-provisioned emits steamBottleSetupRequired (no native steam://); provisioned dispatches via tellBottledSteamTo* + bottle-scoped ACF polling; non-eligible keeps the native path byte-for-byte"
  - "getSettings() resolves getSteamBottleSettings() for a bottle-eligible game instead of an empty per-appId GameConfig"
  - "runWineCommandOnGame (tools/index.ts) refuses Steam games via an explicit runner==='steam' guard, defense-in-depth against Pitfall 5 now that isNative() can be false for Steam"
affects: [17-06 (frontend guided setup — subscribes to steamBottleSetupRequired emitted here), 17-07 (manual UAT of the real bottle install/launch/uninstall flow)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isBottleEligible() as the single private source of truth for D-11 confirmed-not-native routing, reused by isNative(), getSettings(), install(), launch(), and uninstall() — no duplicated gating logic"
    - "Branch-at-the-top-of-method pattern: each of install/launch/uninstall checks isBottleEligible() first, then isBottleProvisioned() inside that branch, before falling through unchanged to the pre-existing native steam:// path"
    - "Test-file convention: fully jest.mock('../bottle', ...) rather than spy — modules with heavy transitive dependency chains (backend/config, lazily-imported backend/launcher) that the test under exercise never needs to actually run"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/tools/index.ts

key-decisions:
  - "isBottleEligible() checks isMac first, then steamMetadataStore.get(appId): confirmedNotNative = platformsCaptured===true && is_mac_native===false. A never-synced entry (platformsCaptured not true) or a game with no metadata at all resolves to native (D-11) — the ambiguous is_mac_native:false default in library.ts is never enough on its own to trigger bottle routing"
  - "Un-provisioned bottle-eligible install()/launch()/uninstall() all emit sendFrontendMessage('steamBottleSetupRequired', { appName }) and return WITHOUT firing shell.openExternal — applied uniformly across all three verbs per the plan's <action> text (the <behavior> bullet only explicitly called this out for install/launch, but the action text generalizes the gate to all three; uninstall's un-provisioned case is a defensive no-op since nothing would be installed in an un-provisioned bottle anyway)"
  - "install()'s un-provisioned return is { status: 'done' } (not 'error' or 'abort') — downloadqueue.ts's processNotification suppresses the DM completion toast entirely for runner==='steam' on 'done', avoiding a misleading 'Installation Canceled'/'Installation Failed' toast while the guided-setup listener (17-06) handles the actual UX"
  - "getSettings() branches on isBottleEligible() before falling back to GameConfig.get(appId) — this is the mechanism that makes launcher.ts's pre-launch checkWineBeforeLaunch (which now runs for these games since isNative() is false) see the dedicated bottle's real wineVersion/wineCrossoverBottle rather than an empty per-appId config (Pitfall-6 phantom-config guard)"
  - "runWineCommandOnGame's new runner==='steam' guard runs BEFORE the existing game.isNative() check — defense-in-depth so a bottle-eligible Steam game (isNative()===false) can never reach a per-game Winetricks/Verify action, since Steam has no per-game Wine prefix (the bottle is shared across all bottled Steam titles)"

requirements-completed: [MACSTEAM-01, MACSTEAM-04]

# Metrics
duration: ~25min
completed: 2026-07-10
---

# Phase 17 Plan 05: Bottle Install/Launch/Uninstall Routing Summary

**Reversed Phase 3's blanket `SteamGame.isNative()===true` for macOS only and only for a CONFIRMED not-native game (D-11); install/launch/uninstall now route through the bottled Steam client (`tellBottledSteamTo*` + bottle-scoped ACF polling) for those games, with a `steamBottleSetupRequired` signal when the bottle isn't provisioned yet, while every other case (Mac-native, not-yet-synced, Linux, Windows) keeps the exact native `steam://` path.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3/3 completed
- **Files modified:** 3

## Accomplishments

- `SteamGame.isNative()` is now per-OS: always `true` on Linux/Windows; on macOS, `true` unless the game is CONFIRMED not-native (`steamMetadataStore.get(appId)?.platformsCaptured === true && is_mac_native === false`) — a never-synced entry is never misrouted into the bottle (D-11 nuance around `library.ts`'s ambiguous `is_mac_native: false` default)
- New private `isBottleEligible()` is the single source of truth for this gate, reused everywhere routing decisions are made (isNative, getSettings, install, launch, uninstall)
- `install()`/`launch()`/`uninstall()` each branch on `isBottleEligible()` at the top: un-provisioned emits `steamBottleSetupRequired` and returns without touching `shell.openExternal`; provisioned dispatches to `tellBottledSteamTo{Install,Launch,Uninstall}` and starts the bottle-scoped ACF poller (`{ source: 'bottle' }`); non-eligible games are byte-for-byte unchanged
- `getSettings()` resolves `getSteamBottleSettings()` for a bottle-eligible game — this is what `launcher.ts`'s pre-launch `checkWineBeforeLaunch` (which now runs since `isNative()` is false) actually sees, so the dedicated bottle's Wine engine governs, never a phantom per-appId `GameConfig`
- `tools/index.ts::runWineCommandOnGame` now refuses any `runner==='steam'` call before the `isNative()` check — Pitfall 5 defense-in-depth, since Steam has no per-game Wine prefix and `isNative()` can now be `false` for Steam
- 21 new tests added to `games.test.ts` (82 total in the suite, up from 61) covering all four `isNative()` branches, un-provisioned/provisioned bottle dispatch for all three verbs, the D-11 not-yet-captured blocker, and the D-10 scope-fence regression guard (non-eligible games keep the native path)

## Task Commits

Each task was committed atomically:

1. **Task 1: Per-OS confirmed-not-native isNative()** - `7092b92e` (feat)
2. **Task 2: Route install/launch/uninstall through the bottle for confirmed-not-native macOS games** - `35e4371f` (feat)
3. **Task 3: Pitfall-5 safety guard — keep runWineCommandOnGame unreachable for Steam** - `cc185d5f` (fix)

## Files Created/Modified

- `src/backend/storeManagers/steam/games.ts` - `isMac` import + `./bottle` imports (`isBottleProvisioned`, `tellBottledSteamTo{Install,Launch,Uninstall}`, `getSteamBottleSettings`); new private `isBottleEligible()`; rewritten `isNative()`; bottle-branching in `install()`/`launch()`/`uninstall()`/`getSettings()`
- `src/backend/storeManagers/steam/__tests__/games.test.ts` - `backend/constants/environment` mutable-double mock (defaults non-mac so pre-existing tests are unaffected); full `../bottle` module mock; replaced the platform-blind `isNative()` test with a 5-case describe block; new describe blocks for install/launch/uninstall bottle routing (un-provisioned, provisioned, D-11 blocker, D-10 scope-fence) and getSettings() bottle-eligible resolution
- `src/backend/tools/index.ts` - `runWineCommandOnGame` gains an explicit `runner === 'steam'` short-circuit before the `game.isNative()` check

## Decisions Made

See `key-decisions` in frontmatter above. Additionally:

- **save_sync.ts audit (Task 3 acceptance criterion):** all four `isNative()` call sites in `save_sync.ts` (`getDefaultSavePath`, `getDefaultGogSavePaths`) only ever operate on `libraryManagerMap['legendary']`/`['gog']` games — `runner` is never `'steam'` in that file, so no code change was needed there.
- **Launch-path finding (required by the plan's `<output>` spec):** `launch()` is invoked from `launcher.ts:launchEventCallback` (not self-contained like install/uninstall). Since `isNative()` is now `false` for a bottle-eligible game, `launchEventCallback` runs `checkWineBeforeLaunch(gameInfo, gameSettings, logWriter)` BEFORE calling `game.launch()`, using the `gameSettings` this plan's `getSettings()` now resolves via `getSteamBottleSettings()`. The Pitfall-6 phantom-config risk (`checkWineBeforeLaunch`'s Wine-version auto-recovery writing to `GameConfig.get(gameInfo.app_name)` keyed on the real numeric appId) is avoided because the bottle's authoritative Wine settings are sourced from the dedicated `steamBottleConfigStore` path (17-02/17-04's `provisionBottle()` already validates/recovers the bottle's engine there) — `getSettings()` never falls through to an empty per-appId `GameConfig` for a bottle-eligible game, so even if a recovery write did fire at launch it would not become the bottle's source of truth.
- **Steam autoSyncSaves finding:** confirmed unaffected by the `getSettings()` change — both the native `GameConfig.get(appId)` path and the new `getSteamBottleSettings()` path spread `GlobalConfig.get().getSettings()` when no per-game override exists, so `autoSyncSaves` resolves to the same global default either way. `launcher.ts`'s `if (autoSyncSaves && isOnline())` syncSaves gate behavior is unchanged.

## Deviations from Plan

None - plan executed exactly as written. The only interpretive choice was applying the `isBottleProvisioned()` un-provisioned gate uniformly to `uninstall()` as well as `install()`/`launch()` (the `<behavior>` bullet for uninstall only explicitly listed the provisioned case, but the task's `<action>` text generalizes the gate to "each of `install()`, `launch()`, `uninstall()`" — implemented per that broader, authoritative instruction as defense-in-depth; does not violate any acceptance criterion, all of which are lower-bound `grep -c ... >= N` thresholds).

## Issues Encountered

None. All three tasks' acceptance criteria were verified directly:
- `grep -c "platformsCaptured" games.ts` = 7 (>=1 required)
- `grep -c "tellBottledSteamTo" games.ts` = 6 (>=3 required)
- `grep -c "steamBottleSetupRequired" games.ts` = 3 (>=2 required)
- `grep -c "runner === 'steam'" tools/index.ts` = 1, positioned before the `game.isNative()` check (source order confirmed)
- `npm run codecheck` exits 0 after every task
- `npm test -- --testPathPattern=steam/games` → 82/82 passing; full `npm test -- --testPathPattern=steam` → 242/242 passing (no regression to library/bottle/user)
- `npx eslint` on all three touched files: 0 errors (pre-existing warning patterns only — `no-unsafe-*`/`require-await`/`unbound-method` consistent with the rest of the codebase)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 17-06 (frontend guided setup) can rely on `steamBottleSetupRequired` being emitted from all three backend entry points (install/launch/uninstall) whenever a bottle-eligible game is un-provisioned — the payload shape is `{ appName: this.appId }`, matching the channel declared in 17-04's `ipc.ts`.
- 17-06's global listener is the single consumer that opens the guided setup flow for every frontend install/play entry point (game-details MainButton, Library GameCard, InstallGameModal) — no further backend wiring is required since all of those funnel through `window.api.install`/`launch` → `SteamGame`.
- 17-07 (manual UAT) can now exercise the real end-to-end flow: a confirmed-not-native macOS Steam game's Install/Play/Uninstall buttons should route through the bottled Steam client once the bottle is provisioned, and should trigger the guided setup flow when it isn't.
- No blockers. Native/Linux/Windows behavior and Mac-native/not-yet-captured macOS games are verified byte-for-byte unchanged (242/242 steam-suite tests green, `npm run codecheck` exit 0).

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/games.ts
- FOUND: src/backend/storeManagers/steam/__tests__/games.test.ts
- FOUND: src/backend/tools/index.ts
- FOUND commit: 7092b92e (Task 1)
- FOUND commit: 35e4371f (Task 2)
- FOUND commit: cc185d5f (Task 3)
- `npm run codecheck` exits 0
- `npm test -- --testPathPattern=steam` — 242/242 tests pass (7 suites)
