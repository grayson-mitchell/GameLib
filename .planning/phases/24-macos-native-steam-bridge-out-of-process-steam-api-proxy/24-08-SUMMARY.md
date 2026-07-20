---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 08
subsystem: infra
tags: [steam, macos, bridge, routing, wine, crossover, install, launch, uninstall]

# Dependency graph
requires:
  - phase: 24-03
    provides: "bridgeAllowlist.has(appId) -- curated AppID allowlist (D-01/D-02)"
  - phase: 24-04
    provides: "provisionBridgeBottle()/getBridgeBottleSettings()/isBridgeBottleReady() -- dedicated GameLibSteamBridge bottle"
  - phase: 24-05
    provides: "placeShimForGame() -- automatic per-bottle steam_api.dll shim placement"
  - phase: 24-06
    provides: "ensureBridgeHelperReady()/steamBridgeSetupRequired (registered on FrontendMessages) -- shared helper lifecycle + readiness gate"
provides:
  - "resolveBridgeLaunchExe(appId) -- Windows launch-exe resolution from PICS appinfo config.launch (bridge/launchTarget.ts, review finding #2)"
  - "SteamGame.isBridgeEligible() -- isBottleEligible() && bridgeAllowlist.has(appId) && !bridgeFailedThisSession.has(appId)"
  - "SteamGame.installBridgeGame()/launchBridgeGame()/uninstallBridgeGame() -- the real bridge routing branches wired into install()/launch()/uninstall()"
  - "markBridgeFailedThisSession(appId) + __resetBridgeFailedSessionForTests() -- session-scoped fallback-bypass tracking (review finding #3)"
affects: [24-09 (D-05 fallback dialog UI + on-demand Phase-17-bottle provisioning), 24-10 (hardware UAT -- Avernum 4 / Hoard live playability)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Third instance of the isBottleEligible()-composition pattern (after isSteamNativeInstallEnabled()): isBridgeEligible() is the FIRST sub-branch inside install()/launch()/uninstall()'s existing isBottleEligible() block, ahead of the Phase 17 isBottleReady() gate -- the bridge bottle has its own independent readiness/provisioning path"
    - "Session-scoped fallback-bypass Set + test-only reset export (__resetBridgeFailedSessionForTests, mirrors helperProcess.ts's __resetBridgeHelperStateForTests convention)"
    - "Direct is_installed flip (mirrors library.ts pollInstallOnce()'s 'installed' branch) as the bridge path's real completion signal, since no ACF poller can observe the bridge bottle"

key-files:
  created:
    - src/backend/storeManagers/steam/bridge/launchTarget.ts
    - src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts

key-decisions:
  - "resolveBridgeLaunchExe() also resolves config.installdir from the SAME PICS getProductInfo call (not a second lookup) and joins the launch entry's executable onto steamapps/common/<installdir> inside the bridge bottle -- consumable directly as runWineCommand's commandParts[0], closing the plan's <gameExePath> placeholder (finding #2)"
  - "installBridgeGame() resolves the game's install root for markBridgeGameInstalled()/uninstallBridgeGame() via a shared resolveBridgeGameInstallRoot() helper that derives it from resolveBridgeLaunchExe()'s own return value via resolve()+relative() containment (never path.join/string-prefix) rather than a second, divergent path-derivation"
  - "launchBridgeGame() fires its OWN steamBridgeSetupRequired on every failure branch (not-ready helper AND unresolved launch exe) rather than assuming ensureBridgeHelperReady() already fired it -- defensive, matches the plan's <behavior> block literally, and is what the unit tests (helperProcess mocked) actually exercise"
  - "Deviation (Rule 2, discovered while wiring launch()/uninstall()): the shared installDepotDownload() engine installBridgeGame() reuses always starts an ACF poller, but library.ts's AcfSource type ('native'|'bottle') has no bridge-bottle variant -- 'bottle' is hardcoded to the Phase 17 GameLibSteam bottle's steamapps root, so that poller can never observe the bridge bottle's manifest. Rather than forking library.ts's shared AcfSource (out of this plan's file scope), added a direct is_installed flip (markBridgeGameInstalled/markBridgeGameUninstalled) as the real, synchronous completion signal for both install and uninstall -- the mispointed poller is accepted as harmless dead weight, extending finding #10's already-accepted ACF-dead-weight posture to this second instance rather than silently glossing over it"

patterns-established:
  - "Bridge failure surfacing is uniformly defensive: every terminal bridge-failure branch (installBridgeGame's provisioning/download/exe-resolution/shim-placement failures; launchBridgeGame's readiness/exe-resolution/runWineCommand failures) both marks bridgeFailedThisSession AND fires steamBridgeSetupRequired itself, rather than relying on an upstream call to have already done so"

requirements-completed: [R4, R7]

# Metrics
duration: ~45min
completed: 2026-07-20
---

# Phase 24 Plan 08: Bridge Routing Integration (R4/R7) Summary

**Wired the macOS Steam bridge into `SteamGame.install()`/`launch()`/`uninstall()`: an allowlisted title provisions the dedicated `GameLibSteamBridge` bottle inline, depot-downloads the Windows depot into it, auto-places the shim, and launches the game's own PICS-resolved `.exe` directly via `runWineCommand` — with a session-scoped fallback-bypass Set so a bridge failure routes the next attempt straight to the proven Phase 17 bottled path instead of looping.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-07-20T20:52Z
- **Completed:** 2026-07-20T21:35Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `bridge/launchTarget.ts`: `resolveBridgeLaunchExe(appId)` resolves a bridge-eligible game's Windows launch executable from PICS appinfo `config.launch` (filtered `oslist==='windows'`), modeled directly on `installLocation.ts`'s `fetchInstalldir` (numeric-guard, no-second-logon, never-throws) — closes review finding #2's `<gameExePath>` placeholder. 6 unit tests (windows-vs-linux selection, no-windows-entry, empty launch, non-numeric-appId guard, absent client, PICS rejection).
- `games.ts`: `isBridgeEligible()` composes `isBottleEligible() && bridgeAllowlist.has(appId) && !bridgeFailedThisSession.has(appId)` — the third instance of the proven `isSteamNativeInstallEnabled()`-style composition, inserted as the FIRST sub-branch inside each of `install()`/`launch()`/`uninstall()`'s existing `isBottleEligible()` block, ahead of the Phase 17 `isBottleReady()` gate.
- `installBridgeGame()` (BLOCKER 1): the sole caller of `provisionBridgeBottle()` (24-04), invoked inline when `!isBridgeBottleReady()` — a fast `cxbottle --create` with no consent dialog needed. On success, reuses the shared `installDepotDownload()` engine targeting the bridge bottle's steamapps dir (`os:'windows'`), then places the shim via `placeShimForGame()` (24-05) using the exe path `resolveBridgeLaunchExe()` resolves.
- `launchBridgeGame()`: gates on `ensureBridgeHelperReady()` (24-06) first — no game ever launches with no live Steam identity (D-05/D-06). On ready, resolves and runs the game's own `.exe` directly via `runWineCommand` against `getBridgeBottleSettings()` — never `tellBottledSteamToLaunch`/`dispatchToBottledSteam`.
- `uninstallBridgeGame()`: the bridge bottle has no Steam client to dispatch an uninstall verb to (R6) — GameLib removes the game's install root directly, scoped only to the bridge bottle (containment-checked via `resolve()`+`relative()`, never `path.join`/string-prefix).
- `markBridgeFailedThisSession(appId)` (finding #3): called from every terminal bridge-failure branch; `isBridgeEligible()` consults the session Set so a fallback re-invocation of `install()`/`launch()` routes to the existing bottled path instead of looping back into the same failing bridge.
- 12 new unit tests across `games.test.ts` (6 install-routing, 4 launch-routing, 2 uninstall-routing) plus 6 in `launchTarget.test.ts` = 18 total. Full steam suite (23 files, 805 tests) and full repo `pnpm test:ci` (98 suites, 1796 tests) green.

## Task Commits

Each task was committed atomically:

1. **Task 1: launchTarget.ts — resolve the Windows launch .exe from appinfo (finding #2)** - `e4027859` (feat)
2. **Task 2: isBridgeEligible() + install() bridge branch (installBridgeGame, BLOCKER 1, finding #3)** - `ea06d53b` (feat)
3. **Task 3: launch()/uninstall() bridge branches (resolved-exe launch, readiness gate, real uninstall)** - `eb522dc2` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/backend/storeManagers/steam/bridge/launchTarget.ts` - `resolveBridgeLaunchExe(appId)`
- `src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts` - 6 tests
- `src/backend/storeManagers/steam/games.ts` - `isBridgeEligible()`, `bridgeFailedThisSession`/`markBridgeFailedThisSession`/`__resetBridgeFailedSessionForTests`, `installBridgeGame()`, `launchBridgeGame()`, `uninstallBridgeGame()`, `resolveBridgeGameInstallRoot()`, `markBridgeGameInstalled()`/`markBridgeGameUninstalled()`, bridge sub-branches in `install()`/`launch()`/`uninstall()`
- `src/backend/storeManagers/steam/__tests__/games.test.ts` - 12 new tests + updated `../bottle`/new bridge-module mocks

## Decisions Made

See `key-decisions` in frontmatter. Most consequential: the ACF-poller mismatch deviation (Rule 2) — `installDepotDownload()`'s shared engine always starts an ACF poller, but `library.ts`'s `AcfSource` union has no bridge-bottle variant, so that poller silently watches the wrong (Phase 17) bottle's steamapps root and can never observe the bridge install. Rather than forking `library.ts` (outside this plan's declared file scope), a direct, synchronous `is_installed` flip was added as the bridge path's real completion signal, and the mispointed poller documented as accepted dead weight (same posture already locked by finding #10 for the ACF write itself).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Direct is_installed/is_installed:false state flip for the bridge install/uninstall paths**
- **Found during:** Task 3 (wiring launch()/uninstall(), while tracing what actually reconciles install state for the bridge path)
- **Issue:** `installBridgeGame()` (Task 2) passed `pollerSource: 'bottle'` to the shared `installDepotDownload()` engine, which starts an ACF poller — but `library.ts`'s `getBottleSteamappsRoot()` hardcodes the Phase 17 `GameLibSteam` bottle for `source:'bottle'`, not the bridge bottle. That poller can never find the bridge-installed appId's manifest, so a bridge-installed game's UI badge would stay "installing" indefinitely (and symmetrically, uninstall had no completion signal at all since it never used the poller mechanism).
- **Fix:** Added `resolveBridgeGameInstallRoot()` (derives the game's `steamapps/common/<installdir>` root from `resolveBridgeLaunchExe()`'s own return value, containment-checked) plus `markBridgeGameInstalled()`/`markBridgeGameUninstalled()` (mirror `library.ts`'s `pollInstallOnce()` 'installed' branch and `forceUninstall()`'s keep-entry shape respectively) — called synchronously right after depot-download+shim-placement succeed (install) or file removal succeeds (uninstall).
- **Files modified:** `src/backend/storeManagers/steam/games.ts`
- **Verification:** New tests assert `library.get(APP_ID)?.is_installed` flips correctly on both the install-success and uninstall-success paths.
- **Committed in:** `eb522dc2` (Task 3 commit)

**2. [Rule 1 - Bug] Test-file state pollution — module-scoped `bridgeFailedThisSession` and `envMock.isMac` leaking across describe blocks**
- **Found during:** Task 3 (full `games.test.ts` suite run after adding the new describe blocks)
- **Issue:** New bridge-routing describe blocks (a) left `envMock.isMac = true` trailing after their last test, breaking later describe blocks (`stop()`, `install() — GAME-02`, single-flight guard) that rely on the module-mock's `isMac:false` default and never set it themselves; and (b) one test that legitimately drives `installBridgeGame()`'s own provisioning-failure branch called `markBridgeFailedThisSession(APP_ID)` internally using the SAME shared `APP_ID` constant other later tests use, permanently marking it bridge-failed for the rest of the file's test run.
- **Fix:** Added `afterEach` restoration of `envMock` to its declared defaults (`isMac:false`, `isWindows:false`, `isLinux:true`) in all three new bridge-routing describe blocks; added `__resetBridgeFailedSessionForTests()` (exported from `games.ts`, mirrors `helperProcess.ts`'s `__resetBridgeHelperStateForTests` convention) called in each block's `beforeEach`.
- **Files modified:** `src/backend/storeManagers/steam/games.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`
- **Verification:** `pnpm jest .../games.test.ts` went from 7 failing / 151 passing to 158/158 passing.
- **Committed in:** `eb522dc2` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 missing-critical, 1 bug)
**Impact on plan:** Both fixes necessary for correctness (a stuck-forever "installing" badge is a real user-facing defect) and test-suite reliability. No scope creep — no new files beyond the plan's declared `launchTarget.ts`/`launchTarget.test.ts`, no changes to `library.ts` or any other file outside `games.ts`/`games.test.ts`.

## Issues Encountered

None beyond the deviations above — both were discovered and resolved within Task 3's own execution before commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `resolveBridgeLaunchExe()`, `isBridgeEligible()`, and the full install/launch/uninstall bridge routing are ready for 24-09's D-05 fallback dialog UI to consume — 24-09 owns building the actual dialog component that listens for `steamBridgeSetupRequired` and, on the user's "fall back" click, re-invokes the existing non-bridge `install()`/`launch()` branch (which `isBridgeEligible()`'s `bridgeFailedThisSession` check now correctly skips past the bridge for).
- 24-09 also owns the D-11 on-demand `provisionBottle()` (Phase 17 bottle, NOT the bridge bottle) call for a user whose fallback target was never provisioned — that machinery is untouched by this plan.
- **Explicitly NOT proven by this plan** (deferred to 24-10 hardware UAT): real end-to-end bridge install/launch/uninstall on the developer's Apple-Silicon Mac against Avernum 4 / Hoard. This plan's coverage is unit-tested only (mocked `installDepotDownload`/`ensureBridgeHelperReady`/`runWineCommand`/`resolveBridgeLaunchExe`/`placeShimForGame`) — matches every prior 24-0X plan's stated runtime-deferral posture.
- The accepted ACF-poller-mismatch divergence (deviation #1) is a candidate for future cleanup if `library.ts`'s `AcfSource` is ever extended with a `'bridge'` variant — not blocking, since the direct `is_installed` flip is the real source of truth for the bridge path today.

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/bridge/launchTarget.ts`
- FOUND: `src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts`
- FOUND: `src/backend/storeManagers/steam/games.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/games.test.ts`
- FOUND: `.planning/phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-08-SUMMARY.md`
- FOUND: commit `e4027859` (Task 1)
- FOUND: commit `ea06d53b` (Task 2)
- FOUND: commit `eb522dc2` (Task 3)
