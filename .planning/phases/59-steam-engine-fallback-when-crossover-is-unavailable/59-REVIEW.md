---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
reviewed: 2026-11-02T00:00:00Z
depth: standard
scope: gap-closure round, plans 59-14 to 59-23 (git diff 546af6c1d..HEAD per file)
files_reviewed: 25
files_reviewed_list:
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/bridge/bridgeVerdict.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/engine/engineDecision.ts
  - src/backend/storeManagers/steam/engine/engineState.ts
  - src/backend/storeManagers/steam/engine/engineSwitch.ts
  - src/backend/storeManagers/steam/engine/fallbackEngine.ts
  - src/backend/storeManagers/steam/engine/launchDeadline.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/tools/index.ts
  - src/backend/utils/aborthandler/aborthandler.ts
  - src/common/types/steam.ts
  - src/frontend/App.tsx
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.scss
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
  - src/frontend/hooks/constants.ts
  - src/frontend/hooks/engineDownloadLabel.ts
  - src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx
  - src/frontend/screens/Game/GamePage/components/EngineBadge.tsx
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
  - src/frontend/screens/Game/GamePage/index.css
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Settings/components/SteamEngineOverride.tsx
  - src/frontend/state/SteamEngineState.ts
findings:
  critical: 3
  warning: 7
  info: 6
  total: 16
status: issues_found
---

# Phase 59: Code Review Report (gap-closure round 59-14 to 59-23)

**Reviewed:** 2026-11-02
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

This round reviews `git diff 546af6c1d HEAD` for the 25 listed files. Surrounding code was read
where a change depends on it: the download queue cancel path, `aborthandler`, `runWineCommand`,
`useSettingsContext` and the `setSetting` sidecar handler.

Most of the previous round's findings are fixed. The DXVK restore is now strict. The engine marker
records DXVK, and records a failed install. The deadline stands down when no monitor starts. The
creation decision no longer reads another bottle's trial clock. Shared bottles refuse an engine
switch. The page preflight no longer kills a wineserver.

Three problems remain at blocker level:

1. **Install cancel (G13).** A cancel during provisioning is lost. The provisioning abort
   controller is deleted before the depot download registers a new one, and nothing checks
   `signal.aborted` in between. This is the G13 root cause.
2. **Reinstall after cancel (G16).** A cancelled bridge download trips the session circuit
   breaker. That is the G16 root cause.
3. **Failed restore.** When the restore to CrossOver fails, the bottle is left half-cleaned, the
   marker still says DXVK is installed, and the game launches on CrossOver anyway. This reproduces
   the G7 end state by a new route.

The sidecar exit contract is honoured only in part. Engine downloads are now registered for the
stdin-EOF abort, but an abort that arrives during verify or unpack is ignored, so the install goes
on to `wineboot` (WR-03). The new code adds no new timer, watcher or socket handles. The one
frontend timer (the launch notice auto-hide) is cleared on unmount.

No child-process spawn sites were added under `src/` or `meta/` that need `createFakeHomeProfile()`.

## Prior-round findings: resolution status

| ID | Prior finding (short) | Status this round |
| --- | --- | --- |
| CR-01 | Deadline arms with no monitor, kills running game | **Resolved.** `bindDeadlineToMonitor` (`launchDeadline.ts:129-141`) is wired at `games.ts` monitor start, and `STAGING_MONITOR_MATCH` is removed. |
| CR-02 | Install-time redists always run on stock CrossOver | **Resolved.** `resolveInstallEngineSettings` (`games.ts:2421`) carries the creation engine or runs decide+prepare. IN-04 below notes a status-label side effect. |
| CR-03 | Restore to CrossOver marks success with no DXVK source | **Resolved as stated** (missing source is now `dxvk-failed`, marker untouched, source from marker or pin, pin downloaded). **But see new CR-03:** the launch still proceeds on CrossOver after that failure, and a partly done restore leaves a marker that is wrong. |
| WR-01 | DXVK restore reports success whatever happens | **Resolved.** Strict path in `tools/index.ts:316-421`. It checks `reg delete` and `wineboot -u` codes and removes the version file last and synchronously. |
| WR-02 | Non-timeout CrossOver create failure does not fall back | **Resolved.** `CROSSOVER_CREATE_FAILED` plus partial-dir removal. WR-04 covers the missing wineserver stop. |
| WR-03 | Creation decision probes a different bottle | **Resolved.** Presence and executable check only (`engineDecision.ts:516-537`). |
| WR-04 | Engine state and override on every Steam title | **Resolved, with a gap.** Gated on `findBridgeInstallBottle` and `overrideEligible`. WR-07 covers DRM titles installed before this change. |
| WR-05 | Stored-but-unoffered override shows as Automatic | **Resolved.** `storedExtraOption` adds a disabled "(not installed)" entry. |
| WR-06 | Engine switch on shared bottle kills other titles | **Resolved.** `shared-bottle` refusal at `engineSwitch.ts:371-377`, with an in-app dialog. |
| WR-07 | Page preflight can `wineserver -k` a live game | **Resolved.** `killOnTimeout: false` on page reads, and a monitor-phase guard on launch. WR-02 covers the misleading badge this introduces. |
| WR-08 | Launch failures reported only via `notify()` | **Resolved.** `showEngineDialog` is used for download failure and selection rejection. |
| WR-09 | Failed DXVK install leaves marker on old engine | **Resolved.** `markerFor(n, 'failed')` plus same-identity retry (`engineSwitch.ts:331-363`). |
| WR-10 | Concurrent downloads share one callback and signal; `.tmp-*` leak | **Resolved.** Listener fan-out, all-callers-aborted rule, `.tmp-*` prune when idle. IN-01 and IN-02 cover the remaining edges. |
| WR-11 | Engine download keeps sidecar alive after quit, then spawns wine | **Partially resolved.** The download is registered with `callAllAbortControllers` and provisioning stops on an aborted download. An abort during verify or unpack is ignored and provisioning goes on to `wineboot` (WR-03). |

Info items from the prior round:

- IN-01 is resolved: the constant was removed.
- IN-02 is partly resolved: `resolveCrossoverBinDirForEngine` exists, but `engineSwitch.ts` still
  keeps its own copy (new IN-05).
- IN-03 is resolved through `lastCrossoverInstalled`.
- IN-04 is resolved with a 60 s TTL on unhealthy results.
- IN-05 is resolved with the `onSwitching` "setting-up" status.
- IN-06 is resolved: `args.appId` is now logged.

## Known UAT gaps G13-G19: code analysis

- **G13 is root-caused.** See CR-01.
- **G14 is downstream of G13.** It is not analysed separately.
- **G16 is root-caused.** See CR-02. It is a cancelled depot download, not the provisioning
  cancel.
- **G17 is not root-caused in these files.** The save path reads clean from end to end:
  1. `SteamEngineOverride.tsx:223-228` passes `onChange={setOverride}`.
  2. `useSetting` calls `useSettingsContext.setSetting` (`useSettingsContext.ts:80-88`). Its
     only filter is a JSON-equality no-op check.
  3. The sidecar `ipcMain.on('setSetting')` handler (`settingsFlowRegistration.ts:160-186`) calls
     `GameConfig.setSetting`, which always logs `Setting <key>`.

  No step filters by value. A "pinned saves, automatic/crossover don't" split therefore has to come
  from before `onChange` fires, in the MUI `Select` and `MenuItem` set the view renders. The next
  step is a renderer-side probe: log in `onChange` and in `setSetting`. The cause is not in the
  backend.
- **G18 is root-caused.** See WR-06.
- **G19 is root-caused.** See WR-05.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A cancel during engine or bottle setup is dropped, and the depot download starts anyway (root cause of G13)

**File:** `src/backend/storeManagers/steam/games.ts:2288-2309`, `2327-2416`, `3014`; `src/backend/storeManagers/steam/engine/fallbackEngine.ts:235-257`
**Issue:** The queue cancel (`downloadqueue.ts` `stopCurrentDownload`) calls
`callAbortController(appId)`. During provisioning, that aborts the controller registered at
`games.ts:2292`. Nothing then acts on the abort:

1. **Bottle creation ignores the signal.** `provisionBridgeBottle` / `createFallbackBridgeBottle`
   (`games.ts:2354`, `2359`, `2384`) take no signal. `cxbottle --create` or `wineboot -i` runs to
   completion.
2. **An installed engine never reads the signal.** When the engine is already installed (the usual
   case after the first install of a session, and the Batman case at 17:22),
   `doEnsure` returns `ok` at once and never looks at the signal.
3. **An abort during verify or unpack is ignored.** It is only checked before and after
   `downloadFile`, so `ensurePinnedEngine` returns `ok: true` (`fallbackEngine.ts:235-257`).
4. **The abort is thrown away.** After `provisionBridgeBottleForInstall` returns `{ engine }`, the
   `finally` at `games.ts:2305-2307` deletes the aborted controller. `installBridgeGameLeased` is
   then called with no `signal.aborted` check. `runNativeDepotDownload` registers a fresh,
   un-aborted controller under the same id (`games.ts:3014`).

So the depot stream runs with no queue entry behind it. That matches the 17:22-17:24 trace: the
queue removed the title, `SteamGame.stop` was a no-op (no `nativeInstallsInFlight` entry yet), and
chunk-stream continued.
**Fix:** Check the signal at every hand-off, and do not let the download create a controller that
hides a cancel:
```ts
// games.ts, after provisioning
if (signal?.aborted) {
  sendGameStatusUpdate({ appName: this.appId, runner: 'steam', status: 'done' })
  return { status: 'abort' }
}
// provisionBridgeBottleForInstall: after ensureBuiltInEngineForInstall and after each
// provisionBridgeBottle, `if (signal?.aborted) return { result: { status: 'abort' } }`
// fallbackEngine.installArtifact: `if (opts.signal?.aborted) throw new StageError('aborted', ...)`
// after sha256OfFile and again after extractFiles, before renameSync.
```
Also thread the signal into `provisionBridgeBottle` so `spawnAsync` / `wineboot` can be killed.
Remove the partly created bottle on abort. That also addresses G15 for this path.

### CR-02: A cancelled bridge depot download trips the session circuit breaker, so the reinstall goes to bottled Steam (root cause of G16)

**File:** `src/backend/storeManagers/steam/games.ts:2485-2488` (with `3290-3297`, `3480`, `3717`)
**Issue:** A user cancel during the depot stream returns `{ status: 'abort' }` from
`runNativeDepotDownload` (`games.ts:3290-3297`, after `markSteamInstallIncomplete`).
`installBridgeGameLeased` treats every non-`done` status as a bridge failure:
```ts
if (downloadResult.status !== 'done') {
  markBridgeFailedThisSession(this.appId)
  return downloadResult
}
```
`bridgeFailedThisSession` then feeds `failedThisSession` into `resolveBridgeRoute` (`games.ts:3480`).
The next `install()` in the session is routed off the bridge. On a machine without CrossOver it
stops with "CrossOver is required". That is exactly the G16 trace at 17:30:57, which followed the
G14 Resume-then-cancel at 17:28:55. The UAT's suspicion of `bridgeFailedThisSession` is correct.
The trigger is the depot-stream cancel, not the provisioning cancel.
**Fix:** A user abort is not a bridge failure:
```ts
if (downloadResult.status === 'abort') return downloadResult
if (downloadResult.status !== 'done') {
  markBridgeFailedThisSession(this.appId)
  return downloadResult
}
```

### CR-03: A failed restore to CrossOver still launches on CrossOver, and a partly done restore leaves a marker that claims DXVK is installed

**File:** `src/backend/storeManagers/steam/games.ts:4152-4160`; `src/backend/storeManagers/steam/engine/engineSwitch.ts:390-441`; `src/backend/tools/index.ts:338-421`
**Issue:** There are two linked defects.

1. **The launch goes ahead on CrossOver after a failed restore.** On `dxvk-failed` for a CrossOver
   selection, `selectLaunchEngine` logs "the restore is retried on the next launch" and continues.
   The game then runs on CrossOver over DXVK-macOS DLLs and overrides, which is the G7 failure.
   This is easy to reach. A licensed user never has the pin (D-05), so `resolveRestoreSource`
   downloads it (`engineSwitch.ts:293`). Offline, or after any download failure, it returns null
   (`dxvk-failed`, "no DXVK source"), and every launch runs CrossOver with DXVK fully installed
   until the download succeeds.
2. **A partly done restore leaves the marker wrong.** The strict restore is destructive before it
   knows the outcome. It deletes the overrides (`reg delete` loop), then the DLLs (`rmSync` with
   `force`), and only then judges failure, usually from `wineboot -u` (`tools/index.ts:405-415`).
   When `wineboot -u` fails, DLLs and overrides are already gone, but `current_dxvk-macOS` stays
   and the marker stays `pinned` with `dxvk: {dir, version}`. If the next launch picks the pinned
   engine again (for example, CrossOver expired meanwhile), `identityOf(prev) === identityOf(next)`
   and `prev.dxvk !== 'failed'`. `prepareBottleForEngine` returns `changed: false`, and the game
   runs on Wine-Staging with no DXVK DLLs. Writing `'failed'` would not fix it either: the
   `backup` path short-circuits on `currentVersion === globalVersion` ("already installed") and
   does not copy the DLLs back.

**Fix:**
- Treat `dxvk-failed` on a CrossOver selection as a launch blocker. Call `clearEngineSelection`,
  then `showEngineDialog` ("GameLib couldn't finish switching this game back to CrossOver"), and
  return `{ ok: false }`.
- On a strict restore failure, rewrite the previous marker with `dxvk: 'failed'`.
- In `installRemove('backup', source)`, skip the `currentVersion === globalVersion` short-circuit
  when the caller passes `source` (or a `force` flag), so the retry recopies the DLLs and
  re-registers the overrides.

## Warnings

### WR-01: A user cancel during the engine download is reported as an install error

**File:** `src/backend/storeManagers/steam/games.ts:2208-2228`, `2347-2351`, `2378-2383`
**Issue:** When the provisioning signal aborts the download, `ensurePinnedEngine` resolves
`{ ok: false, reason: 'aborted' }`. `ensureBuiltInEngineForInstall` maps every failure to
`{ status: 'error', error: "GameLib couldn't download its built-in engine (aborted). Check your
connection…" }`. That result goes back through `installBridgeGame` to the queue, whose `'error'`
branch (`downloadmanager/utils.ts`) raises the failure dialog and logs "No in-flight download to
abort". A deliberate cancel therefore shows up as a connection failure.
**Fix:** Return `{ status: 'abort' }` when `result.reason === 'aborted'`, before building the error
result.

### WR-02: A single page-read timeout shows "Built-in engine · CrossOver isn't working" for a healthy CrossOver

**File:** `src/backend/storeManagers/steam/engine/engineDecision.ts:244-252`; `src/backend/storeManagers/steam/engine/engineState.ts:169-180`, `242`, `285-290`
**Issue:** With `killOnTimeout: false`, the first `--demo-status` timeout returns
`{ kind: 'broken', inconclusive: true }`. `getSteamEngineState` correctly declines to cache it, but
still passes it to `compute`, which maps any non-healthy preflight to `engine: 'builtin',
reason: 'cx-broken'`. The new visible-reason badge (59-19) then states as fact something the probe
itself calls inconclusive. Separately, `recordLaunchDecision` caches `decision.preflight` with no
`inconclusive` filter, so a launch-time inconclusive result (game running) is kept for up to 60 s.
**Fix:** In `getSteamEngineState`, set `preflight = null` when `r.inconclusive` (no badge rather
than a wrong one). Apply the same `inconclusive` guard to the cache write in
`recordLaunchDecision`.

### WR-03: An abort during verify or unpack is ignored, so a quit mid-install still runs `wineboot` (WR-11 remainder)

**File:** `src/backend/storeManagers/steam/engine/fallbackEngine.ts:222-257`; `src/backend/storeManagers/steam/games.ts:2343-2358`
**Issue:** Registering the download under `steam-engine-download:<pin>` lets the stdin-EOF release
abort it. `installArtifact`, however, only checks `signal.aborted` before and after `downloadFile`.
An abort during the SHA-256 pass or the `tar` extract (tens of seconds for the about 228 MB Wine
archive) finishes, renames into place and returns `ok`. `provisionBridgeBottleForInstall` has no
`signal.aborted` check of its own, so it goes on to `createFallbackBridgeBottle` and spawns
`wineboot` after the shell has gone. That breaks half 2 of the exit contract: in-flight work
started after quit. The same applies to the cancel path (CR-01, point 3).
**Fix:** Check `opts.signal?.aborted` after `sha256OfFile` and after `extractFiles` (throw
`StageError('aborted')`). In `provisionBridgeBottleForInstall`, check `signal?.aborted` before
each `provisionBridgeBottle` call.

### WR-04: The new create-failed path deletes the bottle directory without stopping the wineserver `cxbottle` started

**File:** `src/backend/storeManagers/steam/bottle.ts:2331-2361`
**Issue:** The timeout branch runs `killBottleWineServer(bottleName, binDir, 15_000)` before
`removeCreatedBottleDir`. The two new `CROSSOVER_CREATE_FAILED` branches (non-zero exit with no
conf, and throw) delete the directory straight away. A `cxbottle --create` that got as far as
`wineboot` leaves a CrossOver wineserver bound to a prefix that no longer exists. The install then
falls back immediately and creates the same bottle name with the built-in engine. The orphan
outlives the install and the app.
**Fix:** Run `await killBottleWineServer(bottleName, binDir, 15_000)` before
`removeCreatedBottleDir` in both new branches, as the timeout branch does.

### WR-05: The restore stops the previous wineserver with a binary that may not exist yet, then downloads the engine with no progress (root cause of G19)

**File:** `src/backend/storeManagers/steam/engine/engineSwitch.ts:386`, `390-393`, `293`, `96-108`
**Issue:**
- **Ordering.** `killPrevious(bottleName, prev, deps)` runs at line 386, using
  `prev.wineserverBin`. Only after that does `resolveRestoreSource` (line 392) find the pinned
  engine missing and call `deps.ensurePinEngine(pin)` to download it. When the pin was pruned or
  never downloaded, the kill spawns a missing `wineserver`. That is the 17:57:50
  `killBottleWineServerWith … failed` line in item 20.
- **Silent download.** `defaultEnsurePinEngine` passes no `onProgress` and no caller signal. The
  roughly 228 MB download runs under a single "Setting up built-in engine" label, cannot be
  cancelled by the user, and only the shutdown abort can bound it.
- **Stale process.** If a stale Staging wineserver from the missing pin were still running, it
  would not be stopped.

**Fix:**
- Resolve the restore source before `killPrevious`.
- Skip the kill when `!existsSync(prev.wineserverBin)`, and log that nothing was running.
- Pass a progress callback through `EngineSwitchDeps.ensurePinEngine`, so `selectLaunchEngine` can
  reuse the `downloading:<n>` status, or download the pin in `selectLaunchEngine` before
  `prepareBottleForEngine`, as the `needsDownload` path already does.

### WR-06: A forced CrossOver override reports "CrossOver" whatever the preflight found (root cause of G18)

**File:** `src/backend/storeManagers/steam/engine/engineState.ts:165-168`
**Issue:** `compute` maps `override === 'crossover'` to `engine: 'crossover'` before it looks at
`preflight`. `getSteamEngineState` still runs the preflight for that override and gets
`expired`, but the state it returns has no field that carries it. The page therefore shows a plain
CrossOver badge on a bottle that will open CodeWeavers' expired nag at launch. That is G18.
**Fix:** Keep `engine: 'crossover', reason: 'override'`. When `preflight.kind` is `expired` or
`broken`, also emit a flag (for example `overrideWarning: 'cx-expired' | 'cx-broken'`) that the
GamePage notices render, so the forced choice comes with a warning.

### WR-07: DRM-mode titles installed before this change are offered the override until their next launch

**File:** `src/backend/storeManagers/steam/engine/engineState.ts:111-114`, `221-222`; `src/backend/storeManagers/steam/games.ts:4285-4292`, `4501`
**Issue:** `overrideEligible` excludes DRM-mode titles only through `readBridgeModeVerdict(id) ===
'steamclient-layer'`. That verdict is written only by an install prefetch or a launch made after
59-15. Every existing DRM-mode bridge install has `mode === undefined`, so it is treated as
eligible and shows the override, which has no effect on the DRM route (the original WR-04
complaint). The same is true for a fresh install where the prefetch returned early before
`writeBridgeModeVerdict`.
**Fix:** Treat `undefined` as unknown and not eligible when the persisted verdict carries `drm` or
a steamstub signal. You could also have `getSteamEngineState` resolve the mode lazily, through the
same `resolveBridgeMode` inputs the launch uses, when the verdict is absent, and persist it.

## Info

### IN-01: A caller that joins an engine download after every earlier caller aborted gets `aborted`; abort listeners are never removed

**File:** `src/backend/storeManagers/steam/engine/fallbackEngine.ts:316-382`
**Issue:**
- **Joining a dead download.** The aborted entry stays in `inFlight` until its promise settles. A
  reinstall right after a cancel joins it and receives `aborted`.
- **Listener leak.** `signal.addEventListener('abort', onAbort)` is never removed when the shared
  promise settles. A later abort on the same install signal bumps `aborted` on a dead entry. This
  is harmless today but leaks a closure.

**Fix:** When `entry.controller.signal.aborted`, start a new entry instead of joining. Remove the
listener in a `finally` on the returned promise.

### IN-02: `activeArtifactInstalls++` runs before the `try`, so a `mkdtempSync` throw leaks the counter

**File:** `src/backend/storeManagers/steam/engine/fallbackEngine.ts:186-187`
**Issue:** If `mkdtempSync` throws (disk full, permissions), the counter is never decremented. From
then on, `pruneUnpinnedEngines` never removes `.tmp-*` directories for the rest of the session.
**Fix:** Increment after `mkdtempSync` succeeds, or move both inside the `try`.

### IN-03: The provisioning controller can reuse a stale, already-aborted controller

**File:** `src/backend/storeManagers/steam/games.ts:2289-2307`
**Issue:** When `hasAbortController(appId)` is true (for example, a previous run still tearing
down after pause), its possibly aborted signal is reused. Provisioning then fails at once with
`aborted`.
**Fix:** Reuse only when `!getAbortSignal(id)?.aborted`. Otherwise register a fresh controller.

### IN-04: Install-time engine prep for an existing bottle shows the engine label through "finishing" and ignores cancel

**File:** `src/backend/storeManagers/steam/games.ts:2421-2466`, `2691-2714`
**Issue:**
- **Stale label.** `resolveInstallEngineSettings` runs after `sendFinishing()`. Its
  `ensureBuiltInEngineForInstall(decision.pin)` sends `engine-download` and `setting-up` statuses,
  which replace "finishing" until the next `sendFinishing()`.
- **No signal.** The download has no signal, so a cancel in that window is ignored.

**Fix:** Pass the install signal, and call `sendFinishing()` again after the engine is ready.

### IN-05: `engineSwitch.ts` still resolves the CrossOver bin dir itself

**File:** `src/backend/storeManagers/steam/engine/engineSwitch.ts:113-114`
**Issue:** The old IN-02 asked for one helper. `resolveCrossoverBinDirForEngine` now exists in
`engineDecision.ts`, but `defaultDeps.resolveCrossoverBinDir` still calls
`resolveCrossoverBinDirAsync({ hintWineBins: persistedWineBins() })` inline.
**Fix:** Use `resolveCrossoverBinDirForEngine`.

### IN-06: An unhealthy restore fails for good when only the DXVK half of a pin is on disk

**File:** `src/backend/storeManagers/steam/engine/engineSwitch.ts:269-283`, `409-415`
**Issue:**
- **How the half pin arises.** `doEnsure` installs DXVK first. If the Wine artifact then fails,
  the DXVK directory stays but `isPinnedEngineInstalled` is false.
- **What the restore then does.** `resolveRestoreSource` returns the marker's DXVK dir with
  `wineBin: ''`. The unhealthy branch then returns "no built-in engine to restore" on every launch.
  It never tries `ensurePinEngine`.

**Fix:** When the source has no `wineBin` and CrossOver is unhealthy, fall through to
`deps.ensurePinEngine(pin)` and take the Wine paths from it.

---

_Reviewed: 2026-11-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
