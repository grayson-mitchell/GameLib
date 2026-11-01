---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
reviewed: 2026-11-02T00:00:00Z
depth: standard
files_reviewed: 42
files_reviewed_list:
  - src/backend/sidecar/steamAuthFlowRegistration.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/bottleProcessMonitor.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/engine/adoptBottle.ts
  - src/backend/storeManagers/steam/engine/demoStatus.ts
  - src/backend/storeManagers/steam/engine/engineDecision.ts
  - src/backend/storeManagers/steam/engine/engineIds.ts
  - src/backend/storeManagers/steam/engine/enginePins.ts
  - src/backend/storeManagers/steam/engine/engineRegistry.ts
  - src/backend/storeManagers/steam/engine/engineState.ts
  - src/backend/storeManagers/steam/engine/engineSwitch.ts
  - src/backend/storeManagers/steam/engine/engineTypes.ts
  - src/backend/storeManagers/steam/engine/fallbackEngine.ts
  - src/backend/storeManagers/steam/engine/launchDeadline.ts
  - src/backend/storeManagers/steam/engine/testedCrossoverVersions.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/tools/index.ts
  - src/common/types.ts
  - src/common/types/ipc.ts
  - src/common/types/steam.ts
  - src/frontend/components/UI/PopoverComponent/index.tsx
  - src/frontend/hooks/constants.ts
  - src/frontend/screens/ConsoleMode/components/ConsoleCard/index.tsx
  - src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx
  - src/frontend/screens/Game/GameContext.tsx
  - src/frontend/screens/Game/GamePage/components/EngineBadge.tsx
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
  - src/frontend/screens/Game/GamePage/components/SteamEngineNotices.tsx
  - src/frontend/screens/Game/GamePage/index.css
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Library/components/GameCard/constants.ts
  - src/frontend/screens/Library/components/GameCard/index.tsx
  - src/frontend/screens/Settings/components/SteamEngineOverride.tsx
  - src/frontend/screens/Settings/components/index.ts
  - src/frontend/screens/Settings/sections/GamesSettings/index.scss
  - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/state/SteamEngineState.ts
  - src/frontend/types.ts
  - src/preload/api/steam.ts
findings:
  critical: 3
  warning: 11
  info: 6
  total: 20
status: issues_found
---

# Phase 59: Code Review Report

**Reviewed:** 2026-11-02
**Depth:** standard
**Files Reviewed:** 42
**Status:** issues_found

## Summary

I reviewed the whole `engine/` directory, plus the Phase 59 hunks in `games.ts`, `bottle.ts`,
`bottleProcessMonitor.ts`, `tools/index.ts`, the IPC and type wiring, and the frontend badge,
notice and override surfaces. The UAT fixes 9e2509cf2, 1a5b750bb, 5a6f4f877, c6b2779ca and
5cc3007a3 are included. Shared files were scoped to the commits from
`git log --grep='(59' c9b31401d..HEAD`. Test files are out of scope.

The decision layer (`engineDecision.ts`, `demoStatus.ts`, `engineIds.ts`) is sound. Its timers
are unref'd, the override grammar is closed, and the probe retry logic is correct. Most defects
sit where the engine choice has to reach code that runs outside `selectLaunchEngine`:

- the launch deadline still arms when the process monitor refuses to start;
- the install-time redist step always runs on stock CrossOver;
- the DXVK restore can record "crossover" while DXVK is still in the bottle.

That last one is a second route into the G7 failure class. The weak failure signal inside
`DXVK.installRemove('restore')` makes it worse (WR-01).

Known gaps G1, G2, G6, G9, G10 and G12 are not reported again. WR-08 and IN-05 sit next to G6
and G1 and say what those gaps leave out.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The launch deadline arms even when no process monitor starts, so it can kill a running game

**File:** `src/backend/storeManagers/steam/games.ts:4735-4750`, `4921-4940`
**Issue:** The deadline is skipped only when `installRoot` is falsy. `startBottleProcessMonitor`
can still return `null` with a truthy `installRoot`: off macOS, or when `deriveWindowsPrefix`
finds the install root outside the bottle's `drive_c` (`bottleProcessMonitor.ts:539-545`). In
that case the deadline is armed but nothing can ever call `onFirstMatch` or `onUnavailable`.
The only other way to cancel it is `launcher-exited`.

On the built-in engine the `wine` launcher lives as long as the game. So 180 s in,
`onBridgeLaunchDeadline` kills the wineserver under a game that is running, and the user gets
"Game didn't start". This is the G3 outcome (the deadline stopping a game nobody can see)
through a path the G3 fix did not close.
**Fix:**
```ts
handle = startBottleProcessMonitor({ ... })
if (!handle) {
  logInfo(`SteamGame: appId ${this.appId} no process monitor started; standing the launch deadline down`, LogPrefix.Steam)
  deadline?.cancel('monitor-unavailable')
}
```
A better fix is to arm the deadline only after a non-null monitor handle exists. The redist
step would then need its own bound.

### CR-02: The install-time shared-redist step always runs on stock CrossOver, even on a bottle the built-in engine created

**File:** `src/backend/storeManagers/steam/games.ts:2553-2558`
**Issue:** `installSteamBridgeSharedRedists(this.appId, getBridgeBottleSettings(this.appId), …)`
runs right after `installBridgeGame` creates the bottle. No engine selection is registered at
install time, so `getBridgeBottleSettings` returns `stockBridgeBottleSettings`, which is CrossOver.

- **No CrossOver (the D-01 path):** every redist entry fails on a missing binary. The failures
  go into the redist ledger, and `backoffUntil` can then defer the same redists on the first
  built-in-engine launch.
- **CrossOver installed but expired or broken:** `decideCreationEngine` picked the pinned
  engine. The redist step then runs CrossOver's `wine` against the fallback-made bottle anyway.
  That puts the install behind CodeWeavers' Expired Bottle dialog (the same block as G10, at
  install time). It also runs CrossOver's first-use `setup --upgrade` adoption on the bottle
  and leaves no `.gamelib-engine.json` marker to show what touched it.
**Fix:** Carry the creation decision through the rest of the install. When the bottle was
created, or would be launched, on a non-CrossOver engine, pass
`buildFallbackGameSettings(bridgeBottleName, engine)`. You could also register the selection
with `setEngineSelection` for the length of the install and clear it in a `finally`. For a
bottle that already exists, run the same `decideLaunchEngine` + `prepareBottleForEngine` pair
the launch uses before any install-time wine spawn.

### CR-03: Moving back to CrossOver records the switch as done when no DXVK source is available

**File:** `src/backend/storeManagers/steam/engine/engineSwitch.ts:272-302`
**Issue:** When the bottle still has `current_dxvk-macOS` but `deps.currentPinEngine()` returns
null or has no `dxvk`, the code logs "leaving DXVK in place" and falls through to
`writeMarker(bottleDir, nextMarker)`. The marker then says `crossover`. Every later launch takes
the `identityOf(prev) === identityOf(nextMarker)` early return, so the restore is never tried
again. CrossOver keeps running the bottle with DXVK-macOS DLLs and overrides in place. This is
the G7 end state, and 5a6f4f877 does not cover it.

It happens whenever the current pin is not installed. Licensed users never download it (D-05).
After a release bumps the pin, `pruneUnpinnedEngines` deletes builds outside current and
previous, and `currentPinEngine` only ever looks at `ENGINE_PINS.current`. A bottle that ran on
an older pin, launched later by a licensed user, hits this path.
**Fix:** Treat a missing source as a failed restore and leave the marker alone. Also restore
from the DXVK build recorded in the bottle, not the current pin:
```ts
if (!pin?.dxvk) {
  return { ok: false, reason: 'dxvk-failed', detail: `no DXVK source to restore "${bottleName}"` }
}
```
To make that work, record the installed DXVK `dir`/`version` in `.gamelib-engine.json`. Then
resolve the source from `pinById(marker.id)` (current or previous), and download that pin when
it is missing.

## Warnings

### WR-01: The DXVK restore reports success whatever happens, so the "surviving marker" check from G7 cannot catch a real failure

**File:** `src/backend/tools/index.ts:316-391`; `src/backend/storeManagers/steam/engine/engineSwitch.ts:291-298`
**Issue:** The restore branch deletes `current_<tool>` first, using the async callback `rm`. It
then runs the `reg delete` and `wineboot -u` steps without checking their results, logs and
skips each `rmSync` error, and returns `true` without exception. The only failure the
`!ok || existsSync(dxvkMarkerPath)` check in engineSwitch can see is the early invalid-prefix
return. Several real failures leave DLLs or overrides behind and still pass:

- a `reg delete` that fails, or one cancelled at CodeWeavers' Expired Bottle dialog (G10);
- a `wineboot -u` that exits non-zero;
- a DLL that cannot be removed.

In each case the marker is gone, so the bottle is marked `crossover`. The async `rm` also races
the `existsSync` check.
**Fix:** For the `source` (Phase 59) path, remove the version file last and synchronously, only
after every step has succeeded. Return `false` when any `runWineCommand` result has a non-zero
`code` or any `rmSync` throws.

### WR-02: A CrossOver bottle-create failure other than a timeout does not fall back to the built-in engine

**File:** `src/backend/storeManagers/steam/bottle.ts:2324-2348`; `src/backend/storeManagers/steam/games.ts:2252-2275`
**Issue:** `installBridgeGame` falls back only on `CROSSOVER_CREATE_TIMEOUT` or
`CROSSOVER_MISSING`. When `cxbottle --create` exits non-zero, or leaves no `cxbottle.conf`, the
result has no `errorCode`. The install then fails outright, which is the most likely way a
broken CrossOver shows itself. With `probed: false` (no ready bottle to probe), nothing upstream
can call that CrossOver broken. D-09 routes a broken CrossOver to the fallback. This path also
leaves the partial bottle directory behind (`createdHere` is computed but only used on the
timeout path), and the leftover can make the next `--create` fail too.
**Fix:** Give this failure its own code (for example `CROSSOVER_CREATE_FAILED`) and add it to
the fallback condition in `installBridgeGame`. Call `removeCreatedBottleDir(bottleName)` when
`createdHere` is set.

### WR-03: The creation decision probes a different bottle's trial clock

**File:** `src/backend/storeManagers/steam/engine/engineDecision.ts:484-499`
**Issue:** `decideCreationEngine` runs `--demo-status` against `listReadyBridgeBottleNames()[0]`.
The trial clock is per bottle (spike 060; UAT item 6 showed one bottle's backdate leaving the
others untouched). An expired, backdated or fallback-made bottle at index 0 therefore decides
the engine for a new, unrelated bottle. The choice is also arbitrary: it depends on directory
order. In the other direction, a healthy index-0 bottle says nothing about what
`cxbottle --create` will do.
**Fix:** Do not take trial state from another bottle. Use only "is CrossOver present and
executable" plus the create cap (the `probed: false` path), and rely on WR-02 for real failures.
If a probe is still wanted, pick a bottle CrossOver created (`Timestamp` in its conf) and log
which one was used.

### WR-04: Engine state, the no-CrossOver note and the override appear on every Steam title, including native Mac games

**File:** `src/backend/storeManagers/steam/engine/engineState.ts:150-206`; `src/frontend/screens/Game/GamePage/index.tsx` (engine-state effect); `src/frontend/screens/Settings/sections/GamesSettings/index.tsx:267-271`
**Issue:** `getSteamEngineState` accepts any numeric appId on macOS, because `bridgeBottleNameFor`
never returns null for one. With CrossOver absent, `showNoCrossoverNote` is true for every Steam
game page. Native macOS games and titles that are not installed then show "GameLib runs Windows
games on its built-in engine". The override select appears for every Steam title on macOS, but
only the TCP bridge launch reads it. Setting it on a native, bottled-Steam or DRM-mode title
does nothing, yet the page shows the "Unsupported engine" badge. The state also uses
`bridgeBottleNameFor` rather than `resolveBridgeBottleName`, so a title that lives in the legacy
shared bridge bottle is never probed.
**Fix:** Return `null` from `getSteamEngineState` unless the title has a bridge install. Use
`findBridgeInstallBottle(appId)` or `resolveBridgeBottleName(appId)`, and probe that bottle.
Gate `<SteamEngineOverride />` on the same eligibility, for example through a backend flag
included in the engine state.

### WR-05: A stored override that is no longer offered shows as Automatic and cannot be cleared

**File:** `src/frontend/screens/Settings/components/SteamEngineOverride.tsx:51-56`, `73`; `src/backend/storeManagers/steam/engine/engineDecision.ts:389-398`
**Issue:** `effectiveValue` maps any stored id that is not in `options` to `'automatic'`. One
example is `wine-manager:<v>` after that build is uninstalled. `parseEngineOverride` still
accepts the id, so the launch returns `unavailable` and tells the user to "Choose Automatic".
But the select already shows Automatic, and MUI `Select` does not fire `onChange` when the same
value is chosen again. The user has to pick some other engine and then Automatic. The page
meanwhile shows "Unsupported engine". This is separate from G12(b), which covers only the
window while the options load. Here the mismatch never ends.
**Fix:** When `stored` is not in `options` (after they load), show a disabled
"`<stored>` (not installed)" entry selected, so choosing Automatic is a real change. You could
also have `listEngineOverrideOptions` include the stored id with `available: false`.

### WR-06: An engine switch on the legacy shared bridge bottle can kill another title's running game

**File:** `src/backend/storeManagers/steam/engine/engineSwitch.ts:231-253`
**Issue:** The "never kill a wineserver under a running game" guard checks
`getMonitorPhase(appId)` for the launching title only. `bottleName` comes from
`getBridgeBottleSettings`, which can resolve to the legacy shared `GameLibSteamBridge` bottle.
Launching title B there on a different engine from title A, which is already running, calls
`killPrevious`. That runs `wineserver -k` on the shared prefix and kills A. It also installs or
removes DXVK for every title in that bottle.
**Fix:** Refuse switches on any bottle other than the title's own per-game bottle
(`bottleName !== bridgeBottleNameFor(appId)`). Use CrossOver there, or return `invalid-bottle`.
Alternatively, check every active monitor whose `bottleDir` equals this bottle.

### WR-07: A page-load preflight can `wineserver -k` a bottle whose game is running

**File:** `src/backend/storeManagers/steam/engine/engineDecision.ts:203-238`; `src/backend/storeManagers/steam/engine/engineState.ts:179-197`
**Issue:** `preflightCrossover` kills the bottle's CrossOver wineserver after each probe
timeout. `getSteamEngineState` calls it from the game page on the first view of a bottle in a
session, which is a display-only read. A game can still be live while that happens, for example
one that outlived a sidecar restart, or one launched outside this session's
`recordLaunchDecision`. A slow probe would then kill it. The read is supposed to be passive.
**Fix:** Add a `killOnTimeout` option and keep it off for the page preflight. On the launch
path, skip the kill when `getBottleProcessMonitorPhase(appId)` is not null.

### WR-08: Two launch failures are reported only by a system notification or not at all

**File:** `src/backend/storeManagers/steam/games.ts:3953-3968`
**Issue:** When the built-in engine download fails at launch, the only report is `notify()`.
When `setEngineSelection` rejects a selection (missing `wineBin`/`wineserverBin`), nothing is
reported to the user. In both cases Play does nothing visible in dev builds, or in a packaged
build with notifications off. G6 covers the informational fallback toast. These are hard
failures, and the user has no other way to learn why Play did nothing.
**Fix:** Use `this.showEngineDialog(title, body, tag)`, which is in-app plus notify, for both,
as the `unavailable` branch already does.

### WR-09: A failed DXVK install on the switch to the built-in engine leaves the marker on the old engine

**File:** `src/backend/storeManagers/steam/engine/engineSwitch.ts:256-271`; `src/backend/storeManagers/steam/games.ts:3976-3984`
**Issue:** On `dxvk-failed`, `prepareBottleForEngine` returns before `writeMarker`, and
`selectLaunchEngine` launches on the built-in engine anyway ("continuing"). The bottle has now
been run by Wine-Staging, but `.gamelib-engine.json` still says `crossover`. The next CrossOver
launch therefore sees `crossover === crossover` and skips the switch entirely. It does not stop
the Staging wineserver, and it does not clean up any DXVK DLLs or overrides the failed install
left behind.
**Fix:** Once `killPrevious` has run and the launch goes ahead on `next`, write the next marker
with a `dxvk: 'failed'` field. The reverse switch then still runs its cleanup.

### WR-10: Concurrent engine downloads share one progress callback and one signal, and interrupted downloads leak `.tmp-*` directories

**File:** `src/backend/storeManagers/steam/engine/fallbackEngine.ts:293-307`, `321`
**Issue:** `ensurePinnedEngine` hands a second caller the first caller's promise. The second
caller's `onProgress` and `signal` are dropped, so a second title installed at the same time
never receives `engine-download` status, and aborting the first install aborts both. Also,
`pruneUnpinnedEngines` skips every `.tmp-*` directory, so a download or extract interrupted by a
crash or quit leaves its temp tree (archive plus partly extracted Wine, hundreds of MB) behind
for good.
**Fix:** Keep a set of listeners per pin and fan progress out to all of them. Abort only when
every caller has aborted. In `pruneUnpinnedEngines`, delete `.tmp-*` entries when no download
for any pin is running.

### WR-11: An engine download in progress keeps the sidecar alive after quit, then goes on to spawn wine

**File:** `src/backend/storeManagers/steam/games.ts:2167-2183`; `src/backend/storeManagers/steam/engine/fallbackEngine.ts:197-209`
**Issue:** `ensureBuiltInEngineForInstall` calls `ensurePinnedEngine` with no `signal`, and
`downloadFile`'s sockets are not unref'd. The sidecar exit contract expects the process to exit
when the event loop drains at stdin EOF. Quitting during the about 228 MB download keeps the
sidecar running until the download and extract finish. The install then continues into
`createFallbackBridgeBottle`, which runs `wineboot -i` after the app has gone. UAT item 12 only
measured exit with nothing running.
**Fix:** Pass an `AbortSignal` that is wired to sidecar shutdown (stdin EOF) or to the
install's own cancel. On abort, stop before bottle creation.

## Info

### IN-01: `STAGING_MONITOR_MATCH` is a constant `true`, so its branch can never run

**File:** `src/backend/storeManagers/steam/games.ts:1116`, `4740-4745`
**Issue:** The `!STAGING_MONITOR_MATCH` branch can never run. Its comment cites the 59-01
`C:\` measurement, which G8 showed was incomplete.
**Fix:** Remove the constant and the branch, or update the comment to cite 1a5b750bb.

### IN-02: The CrossOver bin-dir resolution is copied three times

**File:** `src/backend/storeManagers/steam/engine/engineSwitch.ts:89-92`; `engineDecision.ts:124-129`; `engineState.ts:166-175`
**Issue:** Three copies of the same `resolveCrossoverBinDirAsync({ hintWineBins: persistedWineBins() })`
call. engineSwitch reimplements `persistedWineBins` inline.
**Fix:** Export one `resolveCrossoverBinDirForEngine()` and use it in all three places.

### IN-03: `recordLaunchDecision` publishes `crossoverInstalled: true` when it has no preflight

**File:** `src/backend/storeManagers/steam/engine/engineState.ts:223-231`
**Issue:** An override launch on the pinned or Wine Manager engine has no preflight. The state
it pushes then hides the no-CrossOver note even when CrossOver is absent.
**Fix:** Resolve the bin dir, or carry the previous state's `crossoverInstalled` forward.

### IN-04: The page preflight cache lasts the whole session

**File:** `src/backend/storeManagers/steam/engine/engineState.ts:161`, `184`
**Issue:** After the user buys or renews CrossOver, the "Built-in engine" badge and the trial
notice stay until the next launch of that title. D-06 says the badge shows "while the condition
lasts".
**Fix:** Drop a cached non-healthy preflight after a short TTL, or when the page refetches after
the settings modal closes.

### IN-05: After a download at launch, the label stays at "Downloading built-in engine (100%)" through the engine switch

**File:** `src/backend/storeManagers/steam/games.ts:3953-3959`
**Issue:** No status is sent between the end of the download and the monitor's `launching`, so
the engine switch and DXVK install (about 40 s) run under a stale "Downloading" label. G1 covers
the verify and extract phases. This is the step after them.
**Fix:** Send a "setting up" status (the phase label G1 proposes) before
`prepareBottleForEngine`.

### IN-06: `decideCreationEngine` takes an unused `args` parameter

**File:** `src/backend/storeManagers/steam/engine/engineDecision.ts:476-500`
**Issue:** `args.appId` is never read. `void args` only silences the linter.
**Fix:** Drop the parameter, or use it in the decision log line.

---

_Reviewed: 2026-11-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
