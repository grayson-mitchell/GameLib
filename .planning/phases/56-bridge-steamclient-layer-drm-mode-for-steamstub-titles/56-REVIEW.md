---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
reviewed: 2026-10-28T20:24:26Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts
  - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
  - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/games.ts
findings:
  critical: 3
  warning: 7
  info: 6
  total: 16
status: issues_found
---

# Phase 56: Code Review Report

**Reviewed:** 2026-10-28T20:24:26Z
**Depth:** standard (diff scope `cbfa63e17..HEAD`; games.ts changed hunks plus their immediate context)
**Files Reviewed:** 5
**Status:** issues_found

## Summary

The review covered the UE-aware SteamStub resolver (`detectLaunchDrmWrapper`), routing and stamping from that resolver, extraExeDirs cleanup, the registry-mismatch diagnostic and the process listing on a reg timeout, the per-launch wine log with the `GAMELIB_DRM_WINEDEBUG` passthrough, the final install-time `done` status, and the debug fixes for the install-root cwd and the bridge-notice dialog.

Three problems need fixing before this ships:

1. The resolver realpaths the candidate Shipping exe but compares it against a bottle root that was never realpathed. If any part of the path is a symlink, for example a Steam library on an external disk, the exe is rejected without any log line.
2. Only half of the CEG source moved to the Shipping exe. `placeShimForGame` still reads the CEG signal from the bootstrap exe, so it can clear a correct stored `ceg` verdict.
3. A `.wine.log` is deleted only when its paired trace exists. A failed DRM launch that writes no trace leaves a log that is never pruned.

The circular import between shimGenerate and drmScanExe works today only because each binding is read at call time.

## Critical Issues

### CR-01: Shipping-exe containment compares a realpath against a root that was not realpathed, so symlinked libraries silently drop DRM routing, and a partial fix would make bottle-stage fail

**File:** `src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts:49-57` (also `stageDrmBottle.ts:583-588`, `drmLaunchSetup.ts:370-372`, `games.ts:3686-3690`, `shimGenerate.ts:482-487`)
**Issue:** `real = await realpath(candidate)` resolves every symlink on the path. The root it is checked against is `getBottleDir(...)`, which is a plain `join`/`resolve` result and is never realpathed. Two common setups break this:
- The CrossOver Bottles directory is a symlink, for example moved to an external volume.
- `drive_c/.../steamapps/common` is a symlink into another library.

In both cases `isContainedWithin(bottleDir, real)` is false. The candidate is skipped by `continue`, nothing is logged, and the resolver returns `own`, which is `'none'` for the bootstrap. A UE SteamStub title (Ranch Simulator, the D-17 case) is then routed to the TCP bridge, and the stamp in `placeShimForGame` records `drmWrapper: none`. This guard is stricter than the one in `findUnrealLayout` (`bridgeScan.ts:232`), which uses `resolve(full)`, even though drmScanExe's header says it reuses bridgeScan's notion of the runtime exe.

Realpathing only the root does not fix this. `drmExe` (a realpath) flows to `extraExeDirs: [dirname(drmExe)]`, and `stageDrmBottle` checks that against an unresolved `driveC` (`stageDrmBottle.ts:583-588`). Every such launch would then fail with `extra exe dir outside bottle drive_c`.
**Fix:** Realpath both sides for the check, but return the lexical path so downstream containment stays consistent. Also log rejections:
```ts
const rootReal = await realpath(bottleDir).catch(() => resolve(bottleDir))
for (const candidate of layout.shippingExes) {
  if (!candidate.toLowerCase().endsWith('.exe')) continue
  const real = await realpath(candidate).catch(() => null)
  if (!real || !isContainedWithin(rootReal, real)) {
    logWarning(`detectLaunchDrmWrapper: skipped ${basename(candidate)} (escapes bottle)`, LogPrefix.Steam)
    continue
  }
  if (detect(real) === 'steamstub') {
    return { drmWrapper: 'steamstub', drmExe: resolve(candidate) } // lexical, matches driveC
  }
}
```

### CR-02: The CEG signal is still read from the bootstrap exe while `drmWrapper` now comes from the Shipping exe, so a correct `ceg` verdict can be cleared

**File:** `src/backend/storeManagers/steam/bridge/shimGenerate.ts:476` (consumed at `games.ts:2335-2338` and `games.ts:3855-3858`)
**Issue:** Commit c592ba1eb changes the `drmWrapper` stamp to use the resolver's `drmExe`, and changes launch routing to read CEG markers from `drmExe` (T-56-21-02). `placeShimForGame` still computes `const drm = detectExeSteamDrm(appId, resolve(gameExePath))` from the bootstrap exe. Take a UE title whose Shipping exe has `.bind` and CEG markers:
- `resolveBridgeMode` sees the CEG markers and does not choose steamclient-layer, so the launch falls through to the TCP path.
- `placeShimForGame` scans the bootstrap and gets `drm = null`.
- `persistBridgeDrmSignal(null)` calls `writeBridgeDrmVerdict(appId, undefined)`, which clears any stored `ceg` verdict, and the CEG dead-end dialog is skipped.
- The title launches into the silent ~30 s CEG exit that quick 261024-br4 exists to prevent. The install path (`games.ts:2335`) misses the dead end in the same way.

The stamped record also mixes two exes: `drmWrapper` comes from the Shipping exe, while `drm` and `exeArch` come from the bootstrap.
**Fix:** Use one exe for all DRM signals:
```ts
const launchWrapper = ...
const drmSource = launchWrapper?.drmExe ?? resolve(gameExePath)
const drm = detectExeSteamDrm(appId, drmSource)
```

### CR-03: A `.wine.log` is pruned only through its paired trace, so a launch with no trace leaves a log that grows without bound

**File:** `src/backend/storeManagers/steam/games.ts:986-1003`, `games.ts:4290-4292`
**Issue:** Retention looks only for names matching `^<appId>-<id>\.log$` (the regex rejects `.wine.log`), and it removes a wine log only as a side effect of deleting its trace. `prepareDrmTraceFile` never creates the trace; lsteamclient writes it from the game process (`setKey(DRM_TRACE_ENV, ...)`). The wine log is opened for every DRM launch (`createDrmWineLogAppender` opens with `'a'`, which creates the file). So a launch where the game dies before Steam init, or the helper fails, writes a wine log and no trace. That wine log never enters `mine` and is never deleted. Those are exactly the failure cases the log is for, and users retry them repeatedly. Each orphan can reach 8 MiB, and `+relay`-style channels from `GAMELIB_DRM_WINEDEBUG` will hit that cap. Nothing bounds the total count.
**Fix:** Prune wine logs on their own, by the same id ordering:
```ts
const re = new RegExp(`^${appId}-([0-9]{1,16})(\\.wine)?\\.log$`)
// group by id; keep the newest DRM_TRACE_KEEP_PER_APP - 1 ids; for older ids remove both <id>.log and <id>.wine.log
```

## Warnings

### WR-01: The new launch cwd is never checked to exist or to match exePath's install, so a bad stored target turns into a spawn ENOENT that is only console.logged

**File:** `src/backend/storeManagers/steam/games.ts:4283-4289` (with `launcher.ts:1673-1675`)
**Issue:** `launchCwd` now prefers `resolveBridgeLaunchWorkingDir(appId)`. That path is rebuilt from the stored launch target's `installdir` and `workingdir` under `getBottleSteamappsDir(...)`, independently of `exePath`. The old `dirname(exePath)` always existed. The stored path does not:
- the stored target can be stale after a reinstall or installdir change,
- the game can live in a different library folder,
- `workingdir` can name a directory the game creates on first run.

If `cwd` does not exist, `spawn` fails with a misleading `spawn <wine> ENOENT`. `runWineCommand`'s `'error'` handler only does `console.log(error)`, so neither the DRM path nor the TCP path reports a useful failure. This applies to every bridge launch, not only DRM.
**Fix:** Accept the stored directory only if `lstatSync(dir).isDirectory()` and `isContainedWithin(resolveBridgeGameInstallRoot(exePath, ...), dir)`, or if it equals that install root. Otherwise fall back to the install root, then `dirname(exePath)`, and log the fallback.

### WR-02: Circular import between shimGenerate.ts and drm/drmScanExe.ts

**File:** `src/backend/storeManagers/steam/bridge/shimGenerate.ts:105`, `src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts:19`
**Issue:** shimGenerate imports `detectLaunchDrmWrapper` and drmScanExe imports `detectDrmWrapper` back. This works only because both bindings are read inside function bodies. In TS-to-CJS output (jest), whichever module loads second sees a partially initialised `exports`. Any future top-level use breaks it with an `undefined is not a function` that depends on load order, for example `const DEFAULT_DETECT = detectDrmWrapper`, a re-export, or moving `deps.detect ?? detectDrmWrapper` into a module-level constant. `jest.mock('../shimGenerate')` in a drmScanExe test also replaces the whole 1,483-line module.
**Fix:** Move `detectDrmWrapper` (and `PE_SECTION_SCAN_BYTES` and the section-name helpers it needs) into a leaf module such as `bridge/drmWrapperScan.ts`, imported by both shimGenerate and drmScanExe. Re-export it from shimGenerate if existing callers need it.

### WR-03: The `/bin/ps` child in `defaultListBottleProcesses` is not unref'd (sidecar exit contract)

**File:** `src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts:498-506`
**Issue:** gamelib-conventions rule 1 says to `unref()` every timer, watcher, socket or child handle created in the sidecar. The `ChildProcess` that `execFile` returns is dropped without `unref()`, so a stdin EOF during the diagnostic waits up to 3 s for `ps`. The impact is small because of the 3 s bound, but it breaks the stated contract, and `smoke:sidecar` does not catch slow exits.
**Fix:** `const child = execFile(...); child.unref?.()`. The callback still fires while the loop is alive.

### WR-04: The registry-mismatch diagnostic re-reads user.reg with no size bound

**File:** `src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts:708-719`
**Issue:** The staged check reads user.reg only when `regStat.size <= MAX_USER_REG_BYTES` (line 693). The new diagnostic does `readFileSync(user.reg)` whenever `regStat.isFile()`. For an oversized file it loads the whole file just to log `user.reg:unparseable`. It also reads the file a second time, so the logged mismatch list can describe different content from what `alreadyStaged` evaluated.
**Fix:** Read once inside the bounded branch and compute `const mismatches = drmRegistryMismatches(text)`. Set `alreadyStaged = mismatches.length === 0` and log `mismatches` in the `!alreadyStaged` branch. When the size is over the cap, log `user.reg:oversize` without reading.

### WR-05: Launch routing and stamping use different containment roots for the resolver

**File:** `src/backend/storeManagers/steam/games.ts:3686-3690` vs `src/backend/storeManagers/steam/bridge/shimGenerate.ts:479-487`
**Issue:** The stamp path passes `resolve(getBottleDir(sanitizeBottleName(...)))`. The launch path passes `getBottleDir(bridgeBottleSettings.wineCrossoverBottle)`, which is not sanitized. A bottle name of `..` or one containing a `/` makes `getBottleDir` produce a wider root, so the Shipping-exe containment check is looser on launch than on stamp, and the two can disagree. The commit message says routing and stamping come "from the same resolver", but the inputs differ. `drmScanExe` also runs `detect(exePath)` on the launch exe without any containment check, which contradicts `detectDrmWrapper`'s documented precondition (`shimGenerate.ts:503-505`).
**Fix:** In games.ts, sanitize and resolve the same way the stamp path does. If sanitizing fails, skip the UE probe, as shimGenerate already does.

### WR-06: The resolver gives up on all remaining candidates after one throw, and its choice depends on readdir order

**File:** `src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts:46-64`
**Issue:** `detect(real)` runs inside the outer `try`, so an injected or future detector that throws on one candidate returns `own` without trying the rest. When there are several Shipping exes (for example a DX11/DX12 pair or a `-Win64-Shipping` plus `-Server-Win64-Shipping`), the first `.bind` hit in `readdir` order wins. `drmExe` drives both the CEG markers (`games.ts:3700`) and `extraExeDirs`, so routing can change between filesystems. Every rejection is silent, which makes field failures like CR-01 impossible to diagnose from logs.
**Fix:** Wrap each `detect(real)` in its own try/catch. Sort `shippingExes` for determinism, or prefer `<ueRoot-basename>-Win64-Shipping.exe`. Log one line per candidate skipped for realpath or containment reasons.

### WR-07: The install-time final `done` skips the dynamic import and fires even when the install has moved on

**File:** `src/backend/storeManagers/steam/games.ts:2402-2425`
**Issue:** `await import('./bridge/sharedRedistInstall')` is outside the `try/finally`. If that import rejects (a missing chunk in the SEA bundle, for example), `installBridgeGame` throws and the lingering `redist` status this change was meant to clear stays. The `finally` also sends `done` unconditionally after a long redist step. If the user started an uninstall or a cancel while the redist was running, `done` overwrites that operation's status on the card.
**Fix:** Put the dynamic import inside the `try`. Before sending `done`, check that the game is still installed and that no other operation owns its status, for example by checking the current status is still `redist`/`installing`.

## Info

### IN-01: Pointer for the known stale 'redist' after a DRM-setup failure

**File:** `src/backend/storeManagers/steam/games.ts:3738-3742`, `src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts:228-259`
**Issue:** `progress()` sends `status: 'redist'`, and `fail()` never sends a terminal status, even when `progressSent` is true. games.ts depends on "the launcher's own 'done' status after launch() returns false", which the live finding shows does not arrive. The obvious fix is for `fail()`, or the `drm.status === 'error'` branch in games.ts, to send `done` when `progressSent`, as e2592448f did for install.

### IN-02: Pointer for the known winebus/IOHID reg-add timeout: the timed-out child is left running

**File:** `src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts:541-545`
**Issue:** On `'timeout'`, `runRegArgv` returns without killing the `reg add` wine child or its wineboot. The new process listing records the spin but nothing ends it, so each retry adds another hung session to the same bottle. Consider an `onSpawn` capture and `kill()` (or `wineserver -k` for the bottle) on timeout.

### IN-03: The wine-log appender follows symlinks and applies its mode only on create

**File:** `src/backend/storeManagers/steam/games.ts:925`
**Issue:** `openSync(path, 'a', 0o600)` follows a pre-existing symlink, and if the file already exists the 0600 mode is not applied. The launch id is fresh every time, so `'wx'` (O_EXCL, which refuses symlinks) states the intent exactly and costs nothing.

### IN-04: The "Dev-only" `GAMELIB_DRM_WINEDEBUG` passthrough is not gated to dev builds

**File:** `src/backend/storeManagers/steam/games.ts:4184-4198`
**Issue:** The comment says dev-only, but packaged builds honour the variable too. The allowlist regex keeps it from being an injection risk. Either gate it behind a dev or packaged check or change the comment. The value also overrides a user's own WINEDEBUG in `enviromentOptions`, because later entries win in `setupEnvVars`. That is intended, but undocumented.

### IN-05: The process-listing filter is broader than the bottle, and the exe-name capture can include several words

**File:** `src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts:510-521`
**Issue:** `command.includes('steam-bridge/drm/runners/')` matches DRM runner processes for every title, not just this bottle. The lazy `([^/\\]+?\.exe)` match is anchored to the first character after a separator, so `/usr/bin/wine start.exe ...` is captured as `wine start.exe`. This is diagnostic-only.

### IN-06: `exeArch` is stamped from the bootstrap while `drmWrapper` comes from the Shipping exe

**File:** `src/backend/storeManagers/steam/bridge/shimGenerate.ts:556-558`
**Issue:** `readFileEffectiveArch(resolvedExe)` reads the bootstrap, so the stamp describes two different binaries. This is harmless when both are x64, but it should be documented or sourced consistently together with CR-02.

---

_Reviewed: 2026-10-28T20:24:26Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
