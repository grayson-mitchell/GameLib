---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
reviewed: 2026-10-29T00:30:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
  - src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts
  - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
  - src/backend/storeManagers/steam/bridge/drm/stageWineLog.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/macArchKnownFix.ts
  - meta/machineFillGamelib.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 56: Code Review Report (gap-closure round 56-27..56-32)

**Reviewed:** 2026-10-29T00:30:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

**Diff scope:** only the hunks introduced by these commits. Other commits in `73782b5db..HEAD` that touch games.ts belong to a different session and were not reviewed.

- `3e7d63dfb`, `59f1dd9a2` (56-27): terminal `done` after a DRM setup or launch failure
- `15fa338f8` (56-28): CEG signal read from the resolver's `drmExe`
- `0ddd86e35` (56-29): symlink-safe Shipping-exe containment
- `5fbd769a4` (56-30): plural order, isIntelMac literal
- `21b69f0b5` (56-31): id-grouped trace and wine-log retention
- `5028e07e7`, `6cdafa4a9` (56-32): stage wine log, listing before the kill, forced first timeout, unref of the listing children

For games.ts, only the changed hunks and their immediate context were read.

## Summary

Most of the targeted fixes work. CR-02, CR-03, WR-06 and IN-06 are closed. The new stage wine log (`stageWineLog.ts`) is sound:
- the open uses `wx` (O_EXCL), so it will not follow a planted symlink
- the directory is 0700 and is lstat-checked
- size and file count are both capped
- its retention regex cannot collide with the games.ts per-id regex

The four touched DRM test suites pass (117 tests).

Three fixes are incomplete:

1. **The WR-03 "unref" fix does nothing measurable.** I measured it: an unref'd `execFile` child that has a `timeout` still holds the event loop for the child's whole lifetime. The stdio pipes and execFile's internal kill timer both stay ref'd.
2. **The IN-01 terminal `done` in games.ts only fires when `drm.progressSent` is true.** `fireBridgeWineLaunch` sends its own `winetricks`/`redist` statuses and then has DRM-only `return false` exits. On a launch where the downloads were already cached (the normal case since the install-time prefetch), the card is left on a stale status.
3. **CR-01 is fixed for a symlinked Bottles directory but not for a symlinked `steamapps/common` library.** That second case is now logged instead of silent, but it still drops DRM routing.

No blockers. Nothing here loses data or opens a security hole.

## Prior-finding disposition (old 56-REVIEW.md)

| Prior | Targeted by | Disposition | Notes |
| ----- | ----------- | ----------- | ----- |
| CR-01 | 0ddd86e35 | **Partially resolved** | Both sides are now realpathed, `drmExe` stays lexical, so `stageDrmBottle`'s driveC check still holds, and rejections are logged. A Bottles directory that is a symlink now works. A `steamapps/common` (or game folder ancestor) symlinked into a library outside the bottle is still rejected: `real` leaves `rootReal`. The bootstrap in that same folder is still scanned with no containment check. See WR-03. |
| CR-02 | 15fa338f8 | **Resolved** (stated case) | `drm` now comes from `launchWrapper?.drmExe`, so a Shipping exe with `.bind` plus CEG gives a `ceg` verdict and the dead-end dialog. The residual case, CEG on a Shipping exe that has no `.bind`, is IN-01 below. |
| CR-03 | 21b69f0b5 | **Resolved** | `^<appId>-(\d{1,16})(\.wine)?\.log$` groups the trace and the wine log by id. An orphan wine log now counts as its own id and is pruned. `.stage.wine.log` cannot match. Launch ids are ms timestamps (13 digits), so `Number()` loses no precision. Each unlink failure is logged and the loop continues. |
| IN-01 | 3e7d63dfb, 59f1dd9a2 | **Partially resolved** | `fail()` now sends `done` after `drm-setup` progress, and `body()` is wrapped so an unexpected throw also goes through `fail()`. The games.ts post-launch `done` is gated on `drm.progressSent`, which misses statuses sent by `fireBridgeWineLaunch` itself. See WR-01. |
| IN-06 | 15fa338f8 | **Resolved** (documented) | The comment at shimGenerate.ts:560 states that `exeArch` describes the launch exe and that `drmWrapper`/`drm` describe `drmExe`. |
| WR-03 | 6cdafa4a9 | **Still open** (fix ineffective) | `child.unref?.()` was added at stageDrmBottle.ts:535 and :638, but an execFile child still keeps the loop alive. See WR-02 for the measurement. |
| WR-06 | 0ddd86e35 | **Resolved** | Each candidate has its own try/catch, the order is sorted, and every skip is logged. |

These earlier findings were not targeted by this round and were not re-reviewed: WR-01 (launch cwd), WR-02 (circular import), WR-04 (unbounded user.reg re-read), WR-05 (unsanitized bottle on the launch path), WR-07 (install `done`), and IN-02..IN-05. Treat them as still open.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: The post-launch terminal `done` is gated on `drm.progressSent`, but `fireBridgeWineLaunch` sends its own non-terminal statuses before its DRM-only `return false` exits

**File:** `src/backend/storeManagers/steam/games.ts:3943-3958` (the exits are at `games.ts:4393` and `games.ts:4456`; the statuses come from `games.ts:4306` and `games.ts:4334`)

**Issue:** `drm.progressSent` is true only when `drmLaunchSetup`'s own download steps sent `drm-setup` (drmLaunchSetup.ts:315). Quick 261029-e2t prefetches those downloads at install time, so on a normal Play `ensureDrmDownloads` hits the cache and `progressSent` is false. Inside `launchDrmModeGame` → `fireBridgeWineLaunch`, two steps run before any DRM check:
- `applySteamBridgeKnownFixes` sends `status: 'winetricks'` and `'redist'` (bridgeKnownFixes.ts:229, :279).
- `installSteamBridgeSharedRedists` sends `status: 'redist'` (sharedRedistInstall.ts:481, :659).

After those, two DRM-only failure exits return `false` without a status:
- `buildDrmLaunchEnvironment` returns an error (4393).
- A DLL-override registry write fails or times out (4456).

The `'launching'` status that normally supersedes these statuses is sent only by `startBottleProcessMonitor`, which runs after both exits. The `!launched && drm.progressSent` gate therefore skips the `done`, and the card stays on `redist`/`winetricks`. This is the same stale-status bug IN-01 described, reached through a different producer. The new unit test covers only the `progressSent: true` case.

**Fix:** `done` is idempotent and nothing else ends a Steam launch's status (`dispatchSteamLaunch` bypasses `launchEventCallback`), so send it on every failed DRM launch:
```ts
const launched = await this.launchDrmModeGame(exePath, drmInstallRoot as string, drm)
if (!launched) {
  sendGameStatusUpdate({ appName: this.appId, runner: 'steam', status: 'done' })
  logInfo(`SteamGame: drm launch appId ${this.appId} sent terminal status done after launch failure`, LogPrefix.Steam)
}
return launched
```
Also consider a `try/finally` so that an exception thrown out of `launchDrmModeGame` still ends the status. Add a test with `progressSent: false` where the launch returns false after a `redist` status.

### WR-02: The WR-03 `child.unref?.()` does not release the event loop, because the execFile stdio pipes and the `timeout` kill timer stay ref'd

**File:** `src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts:528-535`, `stageDrmBottle.ts:631-638`

**Issue:** `ChildProcess.unref()` unrefs only the process handle. `execFile` also creates ref'd `stdout`/`stderr` pipe sockets. When `timeout` is set, it also arms a ref'd `setTimeout` that kills the child. Measured with Node v22.23.4 in the scratchpad:

| Setup | Process exits after |
| --- | --- |
| `execFile('/bin/sleep',['2'],{timeout:3000}); c.unref()` | 2008 ms |
| same, plus `c.stdout.unref(); c.stderr.unref()` | 2012 ms (the timeout timer still holds) |
| no `timeout`, `c.unref()` plus both stdio unrefs | 3 ms |

So at stdin EOF the sidecar still waits for `ps`/`lsof` (bounded at 3 s), exactly as before the fix. The new comment "never hold the event loop open" is false. The gamelib-conventions skill (sidecar exit contract, half 1) records two prior incidents where an `unref()` that looked right did not move the number.

**Fix:** Drop execFile's `timeout` option. Bound the child yourself with an unref'd timer, and unref the stdio:
```ts
const child = execFile(file, argv, { maxBuffer: 16 * 1024 * 1024 }, (_e, out) => {
  clearTimeout(kill)
  resolveOut(String(out ?? ''))
})
const kill = setTimeout(() => child.kill('SIGKILL'), 3000)
kill.unref?.()
child.unref?.()
;(child.stdout as { unref?: () => void } | null)?.unref?.()
;(child.stderr as { unref?: () => void } | null)?.unref?.()
```
Factor this into one helper that both listing sites use. Add a test that asserts the loop drains: spawn a node child that calls the helper on `sleep 2` and assert it exits in well under 2 s.

### WR-03: CR-01 is only half closed: a game library reached through a symlinked `steamapps/common` (or any ancestor of the game folder) still fails the Shipping-exe check, while the bootstrap in the same folder is scanned with no check

**File:** `src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts:38-43`, `drmScanExe.ts:50-70`

**Issue:** `rootReal = realpath(bottleDir)` and `real = realpath(candidate)`. If `drive_c/.../steamapps/common` is a symlink to another volume, which was the second scenario in CR-01, `real` resolves outside `rootReal`. The candidate is then skipped as `escapes bottle` and the resolver returns `own` (`'none'` for a UE bootstrap). The title still goes to the TCP bridge and is stamped `drmWrapper: none`. It is now logged, but the behaviour is unchanged. `findUnrealLayout` lets this layout through, because its intermediate `isRealDir` checks start below `ueRoot`.

The containment policy is also inconsistent. `detect(exePath)` at line 40 opens the bootstrap exe in that same symlinked folder with no containment check at all, contradicting `detectDrmWrapper`'s documented precondition (shimGenerate.ts:503-505). Either out-of-bottle bytes may be read, or they may not. Today the code reads the bootstrap's bytes and refuses the Shipping exe's.

**Fix:** Pick one policy and apply it to both exes:
- Strict (reject out-of-bottle reads): realpath-check `exePath` against `rootReal` before `detect(exePath)` as well. When either check fails, surface a user-visible diagnostic, not only a log line.
- Library-aware (accept a symlinked library the user set up): realpath `dirname(exePath)` once to get `ueRootReal`, and require each candidate's `real` to be inside `ueRootReal`, the game's own folder, rather than inside the bottle root. Keep returning the lexical `resolve(candidate)` so `stageDrmBottle`'s driveC check still passes.

## Info

### IN-01: CEG on a UE Shipping exe without `.bind` is still read from the bootstrap

**File:** `src/backend/storeManagers/steam/bridge/shimGenerate.ts:489-490`

**Issue:** `drmSource` is the Shipping exe only when the resolver found `.bind` on it. A UE title whose Shipping exe carries CEG markers but no SteamStub section resolves to `own`, so CEG is read from the bootstrap. The result is `null` and the verdict is cleared, which is the CR-02 failure on a narrower set of titles. CEG on UE4+ Shipping exes is rare, so this is Info. A complete fix would read CEG from every in-bottle Shipping candidate, not only the one with `.bind`.

### IN-02: Every unexpected throw in `runSetup` is reported as `bottle-stage`

**File:** `src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts:474-478`

**Issue:** The new `body()` wrapper maps any throw, including one from the Mac Steam check or the downloads, to `fail('bottle-stage', ...)`. The user-facing D-13 notice and the `stopped at` log line then name the wrong stage. The known steps catch their own errors, so this only affects unforeseen throws, but the log will mislead whoever debugs one. Track the current stage in a `let` and pass it to `fail`.

### IN-03: The resolver scans the realpath but returns the lexical path, so callers reopen a path that was never scanned

**File:** `src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts:72-73`

**Issue:** `detect(real)` scans the resolved file, but `drmExe: resolve(candidate)` is what `readLaunchExeCegMarkers` (games.ts) and `detectExeSteamDrm` (shimGenerate.ts:490) open afterwards, following symlinks with no re-check. `findUnrealLayout` rejects a symlinked leaf, so only an ancestor swapped between the two opens can redirect the read. The window is small and only a local same-user attacker could use it. Note it in the module header, or have callers re-run containment on `drmExe`.

### IN-04: The `.sort()` in the resolver is redundant

**File:** `src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts:51`

**Issue:** `findUnrealLayout` already sorts `shippingExes` and caps them at `UE_SHIPPING_MAX` (bridgeScan.ts:236-237). The extra sort is harmless. It also gives a lexical order, so a `-Server-Win64-Shipping.exe` can still win over the client exe. The old WR-06 suggestion to prefer `<ueRoot-basename>-Win64-Shipping.exe` was not taken, so routing can still depend on which `.bind` exe sorts first.

## Files with no findings

- `stageWineLog.ts`: the open uses `wx` at 0600, the trace dir is 0700 and lstat-checked, the appId is validated before it goes into the regex, retention keeps 8, and size is capped at 2 MiB. After `close()` the fd is nulled, so output from a timed-out wine child that is still running is dropped safely.
- `stageDrmBottle.ts` (56-32 wiring, apart from WR-02): the sink is closed in `finally` on every exit, including `aborted`. The listing now runs before each kill. `GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS` is limited to 3-5 digits and ignored when the sidecar is packaged (`isPackagedSidecar` fails closed).
- `meta/machineFillGamelib.ts`: `PLURAL_SUFFIXES` lists all six CLDR categories in canonical order, so filtering through it loses nothing.
- `macArchKnownFix.ts`: comment-only change.

---

_Reviewed: 2026-10-29T00:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
