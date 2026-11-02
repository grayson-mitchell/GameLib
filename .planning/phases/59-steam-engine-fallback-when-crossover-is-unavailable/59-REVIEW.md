---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
reviewed: 2026-11-02T00:00:00Z
depth: standard
scope: gap-closure round 2, plans 59-24 to 59-30 plus 8e7f931f8 and f63afb1f3 (git diff 4cf305b51..HEAD per file; phase-60 commits ignored)
files_reviewed: 26
files_reviewed_list:
  - src/backend/game_config.ts
  - src/backend/sidecar/gameSettingWrite.ts
  - src/backend/sidecar/settingsFlowRegistration.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/engine/engineState.ts
  - src/backend/storeManagers/steam/engine/engineSwitch.ts
  - src/backend/storeManagers/steam/engine/fallbackEngine.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/tools/index.ts
  - src/common/types/steam.ts
  - src/frontend/hooks/useSettingsContext.ts
  - src/frontend/screens/Game/GamePage/components/SteamEngineNotices.tsx
  - src/frontend/screens/Settings/components/SteamEngineOverride.tsx
  - src/backend/__tests__/gameConfigFirstWrite.test.ts
  - src/backend/sidecar/__tests__/gameSettingWrite.test.ts
  - src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts
  - src/backend/sidecar/__tests__/testContainment.test.ts
  - src/backend/storeManagers/steam/__tests__/bottle.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts
  - src/backend/storeManagers/steam/engine/__tests__/engineSwitch.test.ts
  - src/backend/storeManagers/steam/engine/__tests__/fallbackEngine.test.ts
  - src/backend/tools/__tests__/dxvkInstallRemove.test.ts
  - src/frontend/hooks/__tests__/useSettingsContext.setSetting.test.ts
  - src/frontend/screens/Game/GamePage/components/__tests__/SteamEngineNotices.test.tsx
  - src/frontend/screens/Settings/components/__tests__/SteamEngineOverride.save.test.tsx
findings:
  critical: 0
  warning: 6
  info: 10
  total: 16
status: issues_found
---

# Phase 59: Code Review Report (gap-closure round 2)

**Reviewed:** 2026-11-02
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

This round closes the prior round's three criticals. CR-01 (a cancel during provisioning is
dropped), CR-02 (a cancel trips the bridge circuit breaker) and CR-03 (a failed restore still
launches on CrossOver) are each fixed in the code paths they named. WR-01 through WR-06 and IN-06
are also fixed. The synchronous `GameConfig.load()` (8e7f931f8) is correct:

- `load()` has no awaiting caller.
- Every caller that reads `.config` already falls back with `config || await getSettings()`.
- Class-field order means `version`/`isExplicit` are set before `load()` runs.
- The explicit-mode flush writes the merged `readSettings()` result, so it drops no stored key.

No blockers were found. The remaining defects are listed below.

- **WR-07's fix is incomplete.** A persisted `mode` takes precedence over the CEG signal. The
  install prefetch writes `mode: 'tcp'` for every CEG title, so new CEG installs are still offered
  the override.
- **The controller handoff still drops cancels.** IN-03's replacement controller is deleted by the
  tearing-down run it replaced. The depot run also overwrites the provisioning controller after it
  awaits a prior run.
- **A failed per-game write is only logged.** The renderer and the in-memory `GameConfig` keep the
  new value while the file keeps the old one, and the launch reads the file.
- **The forced-CrossOver "broken" notice is wrong.** It says the launch "may fail", but
  `decideLaunchEngine` always refuses that launch.

Four open Info items from the prior review are carried forward: old IN-01, IN-02, IN-04 and IN-05.

## Warnings

### WR-01: CEG titles are still offered the engine override, because a persisted `mode: 'tcp'` beats the CEG signal

**File:** `src/backend/storeManagers/steam/engine/engineState.ts:131-139`; writer at `src/backend/storeManagers/steam/games.ts:4395-4400` and `4608`
**Issue:** The WR-07 rationale says CEG launches are refused, so the override has no effect.
`isDrmModeFromVerdict` checks the CEG signal only when `mode` is undefined:

```ts
if (verdict.mode !== undefined) return verdict.mode === 'steamclient-layer'
return verdict.drm === 'ceg' || verdict.scan?.drmWrapper === 'steamstub'
```

`prefetchBridgeDrmDownloads` (install) and the launch path both persist
`resolveBridgeMode(drmWrapper, cegMarkers)`. That returns `'tcp'` whenever CEG markers are present
(`steamclientLayerMode.ts:32-39`). As a result:

- Every CEG title installed after 59-15 has `mode: 'tcp'` and `drm: 'ceg'`, and is treated as
  eligible.
- Only legacy verdicts get the exclusion.

The same title therefore flips eligibility depending on when it was installed.

**Fix:** Check CEG first, independent of mode:
```ts
if (!verdict) return false
if (verdict.drm === 'ceg') return true
if (verdict.mode !== undefined) return verdict.mode === 'steamclient-layer'
return verdict.scan?.drmWrapper === 'steamstub'
```
Add a test with `{ mode: 'tcp', drm: 'ceg' }`.

### WR-02: The IN-03 replacement controller is deleted by the tearing-down run it replaced, so a cancel during provisioning is dropped again

**File:** `src/backend/storeManagers/steam/games.ts:2316-2322` (reuse decision); `3216-3221` (prior run's `finally`)
**Issue:** IN-03's scenario is a previous depot run that was cancelled and is still tearing down,
with its aborted controller in the map. The new install now calls `createAbortController(appId)`,
which overwrites that map entry with its own controller.

The prior run's `runNativeDepotDownload` `finally` then calls `deleteAbortController(this.appId)`
unconditionally, which removes the **new** controller. A cancel issued during the new install's
engine download or bottle creation calls `callAbortController(appId)`. That logs "Could not find a
matching abort controller" and does nothing. Provisioning and the depot download continue: the
CR-01 symptom, in the reinstall-right-after-cancel case.

This round's ownership guard in `install()`'s own `finally` (`getAbortSignal(id) === signal`) is
correct, but the depot run's `finally` has no equivalent.

**Fix:** Make the depot run's cleanup ownership-checked too:
```ts
} finally {
  nativeInstallsInFlight.delete(this.appId)
  if (getAbortSignal(this.appId) === controller.signal) {
    deleteAbortController(this.appId)
  }
}
```
Alternatively, wait for `nativeInstallsInFlight.get(appId)?.promise` to settle before registering
the provisioning controller.

### WR-03: A cancel that lands while the depot run waits for a prior run to settle is overwritten

**File:** `src/backend/storeManagers/steam/games.ts:3062-3081`, `3099`
**Issue:** The CR-01 comment in `installBridgeGameLeased` relies on `installDepotDownload` reaching
`createAbortController` synchronously. That holds only when no `nativeInstallsInFlight` entry
exists. When an aborted entry exists, `installDepotDownload` first awaits
`existing.promise.catch(...)`. During that await the provisioning controller is still the
registered one, and a cancel aborts it.

`runNativeDepotDownload` then calls `createAbortController(this.appId)` unconditionally. A fresh,
un-aborted controller replaces the aborted one, and the download starts despite the cancel.

**Fix:** Pass the install signal into `installDepotDownload` and re-check it after the await:
```ts
await existing.promise.catch(() => undefined)
if (opts.signal?.aborted) return { status: 'abort' }
```
Alternatively, have `runNativeDepotDownload` refuse to start when the currently registered signal
is already aborted.

### WR-04: A per-game write that fails both attempts leaves the renderer, the in-memory config and the file disagreeing, with only a log line

**File:** `src/backend/sidecar/gameSettingWrite.ts:16-27`; `src/frontend/hooks/useSettingsContext.ts:56-64`; `src/backend/game_config.ts:331-345`
**Issue:**
- **The renderer.** `createSettingSetter` updates React state before the fire-and-forget `send`.
- **The in-memory config.** `GameConfigV0.setSetting` assigns `this.config[key] = value` before
  `flush()`. When `writeFileSync` throws (ENOSPC, EACCES, a read-only volume), the in-memory
  `GameConfig` already holds the new value.
- **The file.** It still holds the old one.

After two failures:

- The Settings screen shows the new value.
- `config || getSettings()` callers see the new value.
- `readStoredEngineOverride` / `readStoredOverlayOverride` read the file, which the launch path
  uses, and see the old value.

The user believes the engine override changed, but the launch runs the old engine. The only trace
is a `logError`. This is the G17 symptom ("the change vanished") with a log line added.

**Fix:** On final failure, drop the cached instance so memory matches disk, and tell the renderer.
For example, `GameConfig.instances.delete(appName)` through a small static `evict(appName)`, plus a
`sendFrontendMessage('settingWriteFailed', { appName, key })` that makes `useSettingsContext`
re-fetch. At minimum, make `setSetting` roll back `this.config[key]` when `flush()` throws.

### WR-05: The forced-CrossOver "broken" notice says the launch "may fail", but a broken preflight always refuses the launch

**File:** `src/frontend/screens/Game/GamePage/components/SteamEngineNotices.tsx:101-105`; `src/backend/storeManagers/steam/engine/engineState.ts:187-190`; cf. `src/backend/storeManagers/steam/engine/engineDecision.ts:459-466`
**Issue:** With `override === 'crossover'`, `decideLaunchEngine` returns `kind: 'unavailable'` for
any `broken` (or `missing`) preflight. `launchSteamGame` then shows `overrideUnavailable` and does
not start. The new notice tells the user that CrossOver "isn't working for it. The launch may
fail", and the badge for the same state still reads `engine: 'crossover'`.

59-28's goal was truthful state, but this notice understates the outcome: the launch will not
start at all.

**Fix:** Reword `cxBroken` to say the game will not start on CrossOver until it is fixed or the
user chooses Automatic. Optionally, set `engine` to `null` (or a distinct value) for forced
CrossOver plus a conclusive broken preflight, so the badge does not claim CrossOver.

### WR-06: `load()` resets the per-game file when the global `config.json` is missing (pre-existing, data loss), and the first-write test is order-dependent on it

**File:** `src/backend/game_config.ts:165-168`; `src/backend/__tests__/gameConfigFirstWrite.test.ts:66-80`
**Issue:**
- **The production bug.** `if (!existsSync(configPath)) this.resetToDefaults()` tests the
  **global** config path (`appFolder/config.json`), not `this.path`. If the global file does not
  exist yet, the first `GameConfig.get(appId)` flushes `{ [appId]: {}, version, explicit }` over
  the per-game file. That wipes a stored `steamEngineOverride`, `targetExe` and the rest. This
  round made `load()` the code path every first write goes through, and the explicit-mode flush is
  what wipes the keys. The bug was inherited, but it sits in the function this round changed.
- **The test.** The second test seeds `38400.json` but does not write `config.json`. It passes
  only because the first test wrote that file. Run alone (`-t 'late load'`), it takes the reset
  path, wipes the seed, and still passes, so it no longer proves the scenario.

**Fix:** Change the guard to `if (!existsSync(this.path)) this.resetToDefaults()`. Confirm that a
new game still gets `disableUMU: false` from `readSettings`, which it does, because the file is
absent at read time. In the test, write `config.json` in a `beforeEach` (or in the second test
itself), and add a case asserting that a missing global config does not clear a per-game file.

## Info

### IN-01: `setSetting`'s `this.config === undefined` fallback cannot be reached, and its comment describes a state that does not occur

**File:** `src/backend/game_config.ts:332-336`
**Issue:** `GameConfigV0_1`'s field initializers run after `super()` returns, so `load()` always
sees `version === 'v0'` (equal to `currentGameConfigVersion`) and always loads. When the version is
invalid, `reload` never constructs an instance. No instance reaches `setSetting` with `config`
unset. The comment ("outdated version awaiting upgrade") will mislead the next reader.
**Fix:** Delete the branch, or keep it with a comment that it is purely defensive. Also remove the
now-stale `@ts-expect-error TODO: Somehow figure out how to synchronously load the config` at
line 27, by using a definite-assignment `config!: GameSettings`.

### IN-02: A corrupt per-game JSON file now makes `GameConfig.get` throw synchronously, so its corrupt-file fallback does nothing

**File:** `src/backend/game_config.ts:55-63`, `177-179`
**Issue:** `get()` catches the parse error, logs "Config file is corrupted" and falls back to
`'v0'`. The V0 constructor's synchronous `readSettings()` then calls `JSON.parse` on the same file
and throws out of the constructor. No instance is cached, and every `GameConfig.get(appId)` throws.
Callers today are async, so the effect is still a rejection, the same as before. The fallback still
logs the corruption but no longer yields a working instance, and the corruption is now logged twice.
**Fix:** In `readSettings`, catch the parse error and treat the file as empty, or recover by
resetting. Either way, `get()` should return a usable instance for a corrupt file.

### IN-03: Two comments still say `GameConfig.get(id).config` "is filled asynchronously after construction"

**File:** `src/backend/storeManagers/steam/bridge/overlay/overlayPolicy.ts:36-38`; `src/backend/storeManagers/steam/engine/engineDecision.ts:348-352`
**Issue:** That is no longer true after 8e7f931f8. The file-direct readers remain justified,
because `GameConfig.get` creates a missing file and pins defaults, but the stated reason is now
false.
**Fix:** Update both comments to give the reason that still applies.

### IN-04: `restorePinEngine` steals `resolveInstallEngineSettings`'s JSDoc and reports an aborted download as a restore failure

**File:** `src/backend/storeManagers/steam/games.ts:2473-2485`
**Issue:**
- **The JSDoc.** The new arrow property sits between `resolveInstallEngineSettings`'s doc comment
  and the method, so that comment now attaches to `restorePinEngine`.
- **The abort.** `'status' in result ? null : result` collapses `abort` into `null`. If the
  download is aborted (for example after joining a dead in-flight entry, see IN-06), the launch
  shows "couldn't finish switching back to CrossOver… check your connection" instead of stopping
  quietly the way the direct launch download at line 4192 does.
**Fix:** Move the property above the doc comment. Let `ensurePinEngine` signal abort distinctly,
for example by returning `'aborted'`, and have `prepareBottleForEngine` return a new `aborted`
reason that the launch treats as a silent `{ ok: false }`.

### IN-05: `applyGameSetting`'s retry runs in the same tick, so it cannot recover from the transient it was written for

**File:** `src/backend/sidecar/gameSettingWrite.ts:16-27`
**Issue:** The documented transient is "a GamesConfig file read while it is being rewritten". The
sidecar writes per-game configs with synchronous `writeFileSync`, so no in-process reader can
observe a half-written file. An external writer would still be mid-write on an immediate
synchronous retry. The retry test proves only that a mocked first throw is retried.
**Fix:** Either drop the retry and keep the log (plus WR-04's renderer notification), or write
`flush()` atomically (temp file plus `renameSync`, as `writeMarker` in `engineSwitch.ts` does). The
atomic write removes the truncated-read class entirely.

### IN-06: (carried, prior IN-01) Joining an aborted engine download returns `aborted`; abort listeners are never removed

**File:** `src/backend/storeManagers/steam/engine/fallbackEngine.ts:322-385` (listener at `368`)
**Issue:** Unchanged by this round. With the CR-03 launch block, this now also surfaces through
IN-04: a launch-time restore that joins a dead entry shows the restore-failed dialog.
**Fix:** As before: start a fresh entry when `entry.controller.signal.aborted`, and remove the
listener when the shared promise settles.

### IN-07: (carried, prior IN-02) `activeArtifactInstalls++` runs before `mkdtempSync` and outside the `try`

**File:** `src/backend/storeManagers/steam/engine/fallbackEngine.ts:186-187`
**Issue:** Unchanged. A `mkdtempSync` throw leaks the counter, and `pruneUnpinnedEngines` then
skips `.tmp-*` cleanup for the rest of the session.
**Fix:** Increment after `mkdtempSync` succeeds.

### IN-08: (carried, prior IN-04) Install-time engine prep for an existing bottle ignores cancel

**File:** `src/backend/storeManagers/steam/games.ts:2509-2519`
**Issue:** `ensureBuiltInEngineForInstall(decision.pin)` is still called without the install
signal. The new `restorePinEngine` dep has no signal either, so a restore download during install
is not cancellable.
**Fix:** Thread the install signal through `resolveInstallEngineSettings` and `restorePinEngine`.

### IN-09: (carried, prior IN-05) `engineSwitch.ts` still resolves the CrossOver bin dir inline

**File:** `src/backend/storeManagers/steam/engine/engineSwitch.ts:113-114`
**Issue:** `defaultDeps.resolveCrossoverBinDir` still calls `resolveCrossoverBinDirAsync(...)`
directly instead of `resolveCrossoverBinDirForEngine`.
**Fix:** Use the shared helper.

### IN-10: A failed healthy restore leaves CrossOver's wineserver unstopped while the marker names the built-in engine

**File:** `src/backend/storeManagers/steam/engine/engineSwitch.ts:450-469`
**Issue:**
- **Before the CR-03 block.** The healthy branch ran the restore through CrossOver's wine and never
  stopped CrossOver's wineserver, because the launch continued on CrossOver anyway.
- **What happens now.** A failed restore writes `{ ...prev, dxvk: 'failed' }` and the launch is
  blocked.
- **The next attempt.** If the next attempt selects the built-in engine (same identity as `prev`),
  `installNextDxvk` retries "with no wineserver kill". It runs the built-in Wine against a bottle
  that a CrossOver wineserver may still serve, if it has not idled out.

**Fix:** On the failure path with `crossoverHealthy`, stop CrossOver's wineserver (via `killWith`
with `join(binDir, 'wineserver')`) before returning `dxvk-failed`.

---

_Reviewed: 2026-11-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
