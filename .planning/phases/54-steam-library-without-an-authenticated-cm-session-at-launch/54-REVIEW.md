---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
reviewed: 2026-10-27T20:09:51Z
depth: standard
files_reviewed: 51
files_reviewed_list:
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/stdinEofRelease.ts
  - src/backend/sidecar/steamAuthFlowRegistration.ts
  - src/backend/storeManagers/steam/anonymousClient.ts
  - src/backend/storeManagers/steam/authTrigger.ts
  - src/backend/storeManagers/steam/bridge/bridgeVerdict.ts
  - src/backend/storeManagers/steam/bridge/launchTarget.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/installLocation.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/macSteamOffline.ts
  - src/backend/storeManagers/steam/user.ts
  - src/backend/utils.ts
  - src/common/types/ipc.ts
  - src/common/types/steam.ts
  - src/frontend/App.tsx
  - src/frontend/screens/Game/GamePage/components/SteamGoOfflineNotice.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/state/SteamGoOfflineNotice.ts
  - src/preload/api/steam.ts
  - src/backend/__tests__/steamAuthSessionPolicy.test.ts
  - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
  - src/backend/sidecar/__tests__/skeletonFlows.test.ts
  - src/backend/storeManagers/steam/__tests__/anonymousClient.test.ts
  - src/backend/storeManagers/steam/__tests__/authSessionLifecycle.test.ts
  - src/backend/storeManagers/steam/__tests__/authTrigger.test.ts
  - src/backend/storeManagers/steam/__tests__/credentialsMissing.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.selectedFiles.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.sharedRedist.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - src/backend/storeManagers/steam/__tests__/depotLeaseMocks.ts
  - src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/installLocation.test.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts
  - src/backend/storeManagers/steam/__tests__/macSteamOfflineWrap.test.ts
  - src/backend/storeManagers/steam/__tests__/macSteamOnlineDebt.test.ts
  - src/backend/storeManagers/steam/__tests__/probeCredentialPresence.test.ts
  - src/backend/storeManagers/steam/__tests__/removeCopies.test.ts
  - src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts
  - src/backend/storeManagers/steam/__tests__/user.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
  - src/frontend/state/__tests__/SteamGoOfflineNotice.test.ts
findings:
  critical: 1
  warning: 9
  info: 4
  total: 14
status: issues_found
---

# Phase 54: Code Review Report

**Reviewed:** 2026-10-27T20:09:51Z
**Depth:** standard
**Files Reviewed:** 51
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the Phase 54 diff (`51237cbef^..HEAD`) in the 23 listed source files. I read the tests only to judge whether a behaviour was deliberate. The gating structure holds up. Every authenticated logon goes through `ensureAuthenticatedSession` → `wrappedConnect` → `withMacSteamOffline`. Launch, browse and Play reach only `acquireOpenAuthenticated` or the anonymous client. The refresh grant is armed and consumed in the same synchronous tick, so it cannot leak to a later automatic refresh.

The defects are at the edges of the go-offline wrap:

- **Owed-goonline marker lifecycle.** The marker is cleared without confirmation (the item you raised). It is also kept when the LogOff was never seen, which can override an offline mode the user chose. It is matched by PID, which breaks after a reboot. And a shutdown can race an in-flight wrap.
- **Guided-dialog follow-up.** The install retry discards the user's install choices. A Cancel after "ready" leaves Steam offline until quit. The copy tells the user to do something Mac Steam ignores while a game runs.
- **Session lifecycle.** Logout does not stop an in-flight wrapped logon. A stale canary ends a session other leases are still using. The anonymous idle timer can close the client during a bulk read.

## Critical Issues

### CR-01: The guided "Continue" install retry discards the user's install destination and bottle choice

**File:** `src/frontend/screens/Game/GamePage/components/SteamGoOfflineNotice.tsx:61-73` (with `src/frontend/state/InstallGameModal.ts:128-144`)
**Issue:** When the go-offline wrap refuses an install, the backend returns `deferredToSetup` and pushes `{ action: 'install', appName }`. The payload does not carry the original `InstallArgs`. Continue then calls `installSteamGame(appName, info)`, which defaults to `path = ''` and `forceWindowsViaBottle = false`. The SteamDialog's real dispatch (`SteamDialog/index.tsx:494-499`) passes `destination` and `gating.forceWindowsViaBottle`. `resolveSteamInstallTarget` turns an empty path into the default library (`installLocation.ts:385`, `resolveOverride(args?.path, …)`).

So the retry installs to a different library, and possibly a different route (native or bridge instead of the bottle the user chose), from what the user confirmed. The live gate shows the guided path is reachable in normal use: any running Steam game makes the wrap fall through to it. The result is a wrong-location install of possibly many GB, which can fill the wrong disk. The retry in `SteamBridgeRouteNotice.tsx:143` has the same shape, but that is pre-existing precedent, not a reason to repeat it here.
**Fix:** Carry the install parameters through the refusal and replay them.
```ts
// common/types/steam.ts
export interface SteamGoOfflinePayload {
  action: SteamGoOfflineAction
  appName?: string
  installPath?: string
  forceWindowsViaBottle?: boolean
}
// user.ts acquireInternal: accept and forward opts.installPath / opts.forceWindowsViaBottle
// games.ts: pass args.path and args.steamForceWindowsViaBottle into acquireAuthenticated
// SteamGoOfflineNotice.tsx:
await installSteamGame(appName, info, installPath ?? '', forceWindowsViaBottle ?? false)
```
Alternatively, keep the deferred `InstallArgs` in a backend map keyed by appName and have Continue call a backend "resume deferred install" handler, so the renderer never rebuilds the args.

## Warnings

### WR-01: runThenGoOnline clears the owed marker on an unconfirmed, possibly dropped goonline

**File:** `src/backend/storeManagers/steam/macSteamOffline.ts:498-503`, `src/backend/platform/index.ts:700-702`
**Issue:** `deps.openUrl` is `shell.openExternal`, which is `async (url) => { transport?.openExternal(url) }`. It is a single stdout frame to the Rust shell, with no acknowledgement. If the transport is unbound, it is a silent no-op. `clearOnlineDebt` runs right after it, so the marker (the only record that Steam is owed a goonline) is deleted whether or not anything reached Steam. Two plausible ways the goonline gets lost:

1. The frame is dropped (shell exiting, or an opener error that Rust only logs with `eprintln!`).
2. Mac Steam ignores the verb. The live gate showed it ignores `gooffline` while a game runs. If a game starts during the logon window (up to `AUTH_LOGON_BOUND_MS` = 35 s plus the 2 s settle), it is likely to ignore `goonline` the same way.

In both cases Steam stays offline (Friends signed out, the exact harm this phase exists to prevent), and nothing will ever retry: boot and shutdown restores both see `not-owed`. The boot path already has the confirmation machinery (`watchConnectionLog(/processing complete/)` plus the `readMacSteamCmStateSince` fallback). Only the in-session path skips it.
**Fix:** Confirm before clearing. Keep the marker if unconfirmed, so the next wrap, the shutdown or the boot pays it.
```ts
} finally {
  if (ok) await deps.sleep(MAC_STEAM_ONLINE_SETTLE_MS)
  const since = deps.now()
  const seen = watchConnectionLog(deps.connectionLogPath(), /processing complete/, MAC_STEAM_RESTORE_CONFIRM_MS, deps)
  deps.openUrl(STEAM_GO_ONLINE_URL)
  void seen.then((confirmed) => {
    if (confirmed || readMacSteamCmStateSince(deps.connectionLogPath(), since) === 'Logged On') clearOnlineDebt(deps)
    else logWarning('[Steam] go-offline wrap: goonline not confirmed, marker kept', LogPrefix.Steam)
  })
}
```
Do not await the confirmation inside `finally`; that would hold the lease holder's result for up to 10 s. A marker that is still owed and has `pid === selfPid` is already treated as owed by `withMacSteamOffline` and `runRestore`.

### WR-02: A "LogOff not seen" marker can later force a user's chosen offline mode back online

**File:** `src/backend/storeManagers/steam/macSteamOffline.ts:465-480` (kept deliberately per `macSteamOnlineDebt.test.ts:163`), consumed at `:435-438` and `:512-556`
**Issue:** `recordOnlineDebt('toggled')` runs before `gooffline`. On the not-seen path, `GuidedOfflineRequiredError` is thrown with the marker left in place. The live gate's game-running case is this path: Steam ignored the verb and stayed online. Steam owes nothing, but the marker says it does, and with `pid === selfPid` it counts as owed for the rest of the session. If the user then puts Steam into Offline Mode on purpose (for travel, or for the game), two things override their choice:

- The next wrapped logon reads `Logged Off` plus `debtPresent` and takes the `guided-restore` branch, firing `goonline` afterwards.
- The shutdown restore fires `goonline` unconditionally.

The test pins the "kept" behaviour, but nothing checks whether the LogOff ever happened.
**Fix:** Record why the debt exists and check it before paying. On not-seen, either clear the marker, or rewrite it as `{ by: 'toggled-unconfirmed', since }`. Have `runRestore`/`withMacSteamOffline` treat an unconfirmed marker as owed only if `connection_log` shows a `user initiated logoff` line timestamped after `since`.

### WR-03: The marker's PID ownership check breaks after a reboot (PID reuse), so a kill -9 debt is never paid

**File:** `src/backend/storeManagers/steam/macSteamOffline.ts:169-176, 266-275, 513-520, 436-437`
**Issue:** The marker survives a reboot and keeps the dead sidecar's PID. `debtOwnedByOtherLiveProcess` treats any live process with that PID as "another GameLib". `isPidAlive` also returns `true` on `EPERM`, which means any root or other-user process counts. After a reboot, low PIDs belong to system daemons. So the boot restore returns `kept-owner-alive`, and the wrap reads `debtPresent = false` → `already-offline`, so no goonline is fired. This is the kill -9 case the boot layer is documented as the only cover for (`bootstrap.ts:1102`). Mac Steam's Offline Mode persists across restarts, so the user stays offline. The marker is also never cleaned up while that PID lives.
**Fix:** Make ownership specific to GameLib. Record the process start time as well as the PID, and compare it with `ps -o lstart= -p <pid>`, or check `ps -o comm= -p <pid>` against the sidecar binary name. At minimum, treat `EPERM` as "not ours": a GameLib sidecar runs as the same user.

### WR-04: A shutdown during a wrap's LogOff watch can leave Steam offline with the marker already cleared

**File:** `src/backend/storeManagers/steam/macSteamOffline.ts:465-484, 553-556`; `src/backend/storeManagers/steam/user.ts:811-827, 833`
**Issue:** The shutdown restore runs from `releaseForShutdown` (stdin EOF or routed quit). If it lands while a wrap is between `openUrl(gooffline)` and `await seen` (up to 5 s), this sequence follows:

1. The restore sees a marker owned by `selfPid`, fires `goonline` through `/usr/bin/open`, and clears the marker.
2. The `gooffline` sent earlier through the Rust frame can still be processed after that `goonline`.
3. The wrap then sees the LogOff and enters `runThenGoOnline`, which re-records the marker. `connectSteamUserClient` returns at once because of `shuttingDown`.
4. The wrap waits on the 2 s settle `sleep`, which is unref'd, so the process can drain and exit before the final `goonline`. That `goonline` would be a dead stdout frame anyway.

Depending on timing, Steam ends offline. Either the marker is gone, or it holds the exiting sidecar's PID, and WR-03 can then strand it.
**Fix:** In `withMacSteamOffline`, check a shutdown flag before `connect` and before the settle sleep. If shutdown has begun, fire the `goonline` through `deps.openUrlDetached` immediately (no settle) and leave clearing to the confirmed path. Alternatively, have `restoreMacSteamOnlineIfOwed('shutdown')` await any in-flight wrap first, by tracking the wrap promise in a module variable alongside `restoreInFlight`.

### WR-05: Cancel after "ready" (or a redeem that is never retried) leaves Mac Steam offline for the rest of the session

**File:** `src/backend/storeManagers/steam/macSteamOffline.ts:604-621`; `src/frontend/screens/Game/GamePage/components/SteamGoOfflineNotice.tsx:74-76, 141`
**Issue:** On "ready", `checkGuidedOfflineReady` records a `guided` marker and arms `guidedArmedAt`. The user has now gone offline because GameLib asked. Only a later wrapped logon, the shutdown restore or a boot restore will fire the goonline. For `action === 'redeem'`, the dialog stops at "Redeem the key again". If the user presses Cancel, or simply never redeems, nothing takes them back online until GameLib quits. Friends stays signed out for the whole session, which contradicts the dialog's own promise: "GameLib sets Steam back online once it has signed in". The same applies to an install retry that fails before its acquire (e.g. `getGameInfo` returns nothing at `:63-71`). The 10-minute `GUIDED_RESTORE_TTL_MS` only expires the arm. Nothing pays the debt when it lapses.
**Fix:** Add a backend `steamGoOfflineCancel` handler that, when a `guided` marker is owed by `selfPid`, fires `goonline` and clears the marker. Call it from the dialog's `close` whenever status is `ready`, and on dialog unmount. Also arm an unref'd timer at `GUIDED_RESTORE_TTL_MS` that does the same, so an abandoned guided step is always repaid.

### WR-06: The guided copy asks for an action Mac Steam ignores while a game is running

**File:** `src/frontend/screens/Game/GamePage/components/SteamGoOfflineNotice.tsx:101-120`; `public/locales/en/gamelib.json:516-519`
**Issue:** The body names the main cause ("This can happen while a Steam game is running"), then the steps tell the user to "choose Steam > Go Offline, then press Continue". The live gate found Mac Steam ignores going offline while a game runs. If the menu item is ignored the same way the URL verb is, then in the main case the user follows the steps, presses Continue, and gets "Steam still shows as online…" again. Nothing tells them the way out is to quit the game first.
**Fix:** Lead with the step that works: "Quit the game that's running in Steam, then choose Steam > Go Offline and press Continue." Make `stillOnline` say the same: "If a game is still running, quit it first." Update the `en` source and re-run the i18n fill.

### WR-07: Logout does not stop an in-flight wrapped logon, so an authenticated session can open after sign-out

**File:** `src/backend/storeManagers/steam/user.ts:649-690, 587-608, 829-849`
**Issue:** `logout()` sets `connectingPromise = null` and `client = null`, but the `wrappedConnect` already running keeps going. After the LogOff watch it calls `connectSteamUserClient(token, …)` with the old token captured in memory. That sets `this.client` to a new client and logs it on. The result is an authenticated CM session for an account the user just signed out of. `acquireOpenAuthenticated` (launch target, installdir, shared redist) will hand it out, because it checks only `client?.steamID`, not `isLoggedIn()`. If the user signs in again during the window, a second wrap runs concurrently. The first wrap's `clearOnlineDebt` and `goonline` can then fire while the second logon is in flight, which is the Friends-signout the wrap exists to prevent.
**Fix:** Add a session generation counter. Bump it in `logout()`, capture it in `ensureAuthenticatedSession`, and check it in `connectSteamUserClient` before `logOn` and again in the `loggedOn` handler. On a mismatch, `logOff()` the new client and do not assign `this.client`.

### WR-08: A stale canary ends the shared session under leases that are still held

**File:** `src/backend/storeManagers/steam/user.ts:456-468, 611-625`
**Issue:** Each `acquireAuthenticated` on an open session runs a 5 s canary. A timeout calls `endSession('stale-canary')`, which runs `client.logOff()` regardless of `leaseCount`. Holders of the old lease (a long native or bridge download, `installBridgeGameLeased`'s shim and redist steps) keep a reference to a client that has been logged off underneath them. `getDepotClient()` then returns the new client, or throws if the cold connect was refused. A refresh or redeem started during a busy install can trigger this whenever the CM is merely slow, and that also fires a second go-offline/go-online toggle mid-install. Before Phase 54, `relog()` reused the same client object, so holders were not cut off.
**Fix:** When `leaseCount > 0` and the canary fails, do not end the session. Either return a `client-not-ready` refusal for this acquire only, or keep the old client alive until its leases are released (a retiring-client list that logs off on the last release).

### WR-09: The anonymous client's idle timer can close it during a 90 s bulk PICS read

**File:** `src/backend/storeManagers/steam/anonymousClient.ts:49-53, 136-155`; `src/backend/storeManagers/steam/library.ts:1122-1138`
**Issue:** `armIdle()` starts a 60 s close timer when `getAnonymousPicsClient` returns. It does not track in-flight use. `captureOwnedAppPlatforms` issues one bulk `getProductInfo` bounded by `STEAM_PICS_BULK_TIMEOUT_MS = 90000`, so on a large or slow library, `closeAnonymousClient('idle')` logs the client off mid-request. The anonymous pass then fails, and the whole capture repeats on the authenticated session. That costs an extra round trip and quietly moves the "anonymous first" work back to the authenticated client. The same race applies to concurrent launch-target and installdir reads that started more than 60 s after the client was obtained.
**Fix:** Refcount use. Have callers go through `withAnonymousPicsClient(reason, fn)`, which increments a counter, clears the idle timer, and re-arms it only when the counter returns to 0. At minimum, make `ANON_IDLE_CLOSE_MS` larger than `STEAM_PICS_BULK_TIMEOUT_MS`.

## Info

### IN-01: Joining an in-flight connect ignores a sign-in's fresh token and can latch "expired" right after a successful sign-in

**File:** `src/backend/storeManagers/steam/user.ts:476-579`
**Issue:** When `resolveSignInProfile` calls `acquireAuthenticatedWithToken(newToken)` while a refresh's connect with the old, revoked token is still in flight, it joins that `connectingPromise`. Its `epochAtStart` is captured after `noteSignInSucceeded` bumps the epoch. The old token's `AccessDenied` then passes the epoch fence, `reportLogonVerdict('expired', …)` latches `credentialsMissing`, and the persona falls back to the placeholder.
**Fix:** If `tokenOverride` is set and a connect is in flight, wait for it to settle, then start a fresh connect with the override token rather than joining.

### IN-02: checkGuidedOfflineReady arms the guided restore when Steam is not running

**File:** `src/backend/storeManagers/steam/macSteamOffline.ts:614-620`
**Issue:** With Steam not running, it writes no marker but still sets `guidedArmedAt`. That arm is not consumed by the `not-running` wrap (`:422-425`). If the user then starts Steam and goes offline on purpose within 10 minutes, the next wrapped logon forces it back online.
**Fix:** Set `guidedArmedAt` only inside the `running` branch, alongside `recordOnlineDebt('guided')`.

### IN-03: The guided dialog shows only one pending action at a time, and a re-open resets an in-flight Continue

**File:** `src/frontend/state/SteamGoOfflineNotice.ts:31-32`
**Issue:** `open()` overwrites `action`/`appName` and resets `status` to `idle`. A second refusal (two installs, or install plus refresh) drops the first action. A push that arrives while Continue is `busy` re-enables the button mid-flight.
**Fix:** Queue the payloads (or merge them per action), and ignore `open()` while `status === 'busy'`.

### IN-04: A plan-retry refusal gets no guided dialog and surfaces as a generic error

**File:** `src/backend/storeManagers/steam/depot.ts:533-536, 416-427`
**Issue:** The `plan-retry` acquire passes no `guidedAction`. If the reconnect hits `go-offline-required`, no dialog opens, and the next attempt throws "no authenticated steam-user client available", which reads as a connection failure.
**Fix:** Pass `guidedAction: 'install'` and `appName`, and map a `go-offline-required` refusal to the same `deferredToSetup` result the outer acquire uses.

---

_Reviewed: 2026-10-27T20:09:51Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
