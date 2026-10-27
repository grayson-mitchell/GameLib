---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
fixed_at: 2026-10-27T20:37:36Z
review_path: .planning/phases/54-steam-library-without-an-authenticated-cm-session-at-launch/54-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 54: Code Review Fix Report

**Fixed at:** 2026-10-27T20:37:36Z
**Source review:** .planning/phases/54-steam-library-without-an-authenticated-cm-session-at-launch/54-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (CR-01, WR-01 to WR-09; the Info findings IN-01 to IN-04 are out of scope)
- Fixed: 10
- Skipped: 0

Every fix landed in its own commit, carries a unit test that pins it, and was checked with the
directly affected jest files, `tsc --noEmit` and a scoped `npx prettier --check`. No new
authenticated logon site was added. `steamAuthSessionPolicy.test.ts` passes unchanged (13/13),
so Rule A (`logOn({ refreshToken })` only in user.ts) and Rule K (the `CM logon mode=…` literals
once each) still hold. The live gate's scored log literals are byte-identical:
`go-offline wrap: Mac Steam state=<w>, firing gooffline`, `go-offline wrap: firing goonline`,
`go-offline restore trigger=${trigger}: firing goonline`, the boot `marker cleared` and
`marker kept` lines, and `CM logon mode=authenticated reason=… wrap=…`.

Items marked "fixed: requires human verification" change how GameLib drives Mac Steam (the
goonline transport, when the marker is cleared, shutdown timing) or session state. Unit tests
cover their logic, but only a re-run of the Mac live gate (54-LIVE-GATE.md items 5-13) shows
that real Mac Steam still behaves as the gate recorded.

## Fixed Issues

### CR-01: The guided "Continue" install retry discards the user's install destination and bottle choice

**Status:** fixed
**Files modified:** `src/common/types/steam.ts`, `src/backend/storeManagers/steam/user.ts`, `src/backend/storeManagers/steam/games.ts`, `src/frontend/state/SteamGoOfflineNotice.ts`, `src/frontend/screens/Game/GamePage/components/SteamGoOfflineNotice.tsx`, tests `authSessionLifecycle.test.ts`, `games.test.ts`, `SteamGoOfflineNotice.test.ts`
**Commit:** 84c2a046e
**Applied fix:** `SteamGoOfflinePayload` gains optional `installPath` and `forceWindowsViaBottle`. The three install acquires in games.ts (prescreen, bridge, native/bottle depot run) pass `args.path` and `args.steamForceWindowsViaBottle`. `SteamUser` keeps the last target seen for each appName, so a nested depot.ts acquire for the same app, which has no `InstallArgs`, still pushes the right target. The store keeps the target, and Continue calls `installSteamGame(appName, info, installPath ?? '', forceWindowsViaBottle ?? false)`.

### WR-01: runThenGoOnline clears the owed marker on an unconfirmed, possibly dropped goonline

**Status:** fixed: requires human verification
**Files modified:** `src/backend/storeManagers/steam/macSteamOffline.ts`, tests `macSteamOnlineDebt.test.ts`, `macSteamOfflineWrap.test.ts`
**Commit:** 1d91b1e48
**Applied fix:** The in-session goonline now goes through `deps.openUrlDetached` (the existing `spawnOpenDetached`, the justified real-session spawn) instead of the shell's stdout frame. It is confirmed the way the boot restore confirms one: a `watchConnectionLog(/processing complete/)` started before the fire, with `readMacSteamCmStateSince(...) === 'Logged On'` as the fallback. The marker is cleared only on confirmation. If confirmation fails, it stays owed and logs `go-offline wrap: online not confirmed within 10000ms, marker kept`. The wrap does not await the confirmation. The watch polls on the unref'd `deps.sleep` and gives up after `MAC_STEAM_RESTORE_CONFIRM_MS`, so it does not delay the lease holder and does not hold stdin-EOF exit. A `debtGeneration` counter stops a late confirmation from clearing a newer marker. Existing tests that asserted the goonline went through `openUrl` and that the marker cleared immediately were updated to the new contract.

### WR-02: A "LogOff not seen" marker can later force a user's chosen offline mode back online

**Status:** fixed: requires human verification
**Files modified:** `src/backend/storeManagers/steam/macSteamOffline.ts`, test `macSteamOnlineDebt.test.ts`
**Commit:** fef093f0b
**Applied fix:** On the not-seen path the marker is rewritten as `by: 'toggled-unconfirmed'`, with `since` set to the gooffline fire time. The wrap and both restores treat that marker as owed only if connection_log shows a `user initiated logoff` line within `MAC_STEAM_LATE_LOGOFF_WINDOW_MS` (60 s) of the fire, which means the gooffline landed late. Otherwise the marker is stale: it is cleared, no goonline fires, and the restore returns `not-owed` without logging a `trigger=` line, so item 13's absence oracle still holds. A plain "any LogOff after since" check, as the review suggested, would not work: a Go Offline the user chooses from Steam's own menu writes the same `user initiated logoff` text. The bounded window is the distinguishing signal, and its 60 s value is a judgement call worth confirming live.

### WR-03: The marker's PID ownership check breaks after a reboot (PID reuse), so a kill -9 debt is never paid

**Status:** fixed: requires human verification
**Files modified:** `src/backend/storeManagers/steam/macSteamOffline.ts`, test `macSteamOnlineDebt.test.ts`
**Commit:** 967f5ae2c
**Applied fix:** The default `isPidAlive` is now `isOwnUserPidAlive`, where EPERM means "not ours" because a GameLib sidecar always runs as the same user. A new optional dep, `systemBootMs` (default `Date.now() - os.uptime() * 1000`), makes any marker written before the current boot count as not owned by a live process. Remaining gap: PID reuse without a reboot, by a same-user process, still reads as alive. Recording the process start time would close it, but that needs a `ps` spawn on this path, and that was judged out of proportion here.

### WR-04: A shutdown during a wrap's LogOff watch can leave Steam offline with the marker already cleared

**Status:** fixed: requires human verification
**Files modified:** `src/backend/storeManagers/steam/macSteamOffline.ts`, test `macSteamOnlineDebt.test.ts`
**Commit:** ce8231b79
**Applied fix:** `restoreMacSteamOnlineIfOwed('shutdown')` now resolves a module-level shutdown signal. A wrap in its LogOff watch or its 2 s settle (both on unref'd timers) is cut short and fires its own goonline at once, before the loop can drain. user.ts already makes `connect` a no-op once `shuttingDown` is set. A `goofflinePending` counter covers a shutdown that lands after a wrap's gooffline has fired but before its LogOff is seen: the restore still fires goonline but keeps the marker (outcome `restore-unconfirmed`, logging `go-offline restore trigger=shutdown: a gooffline is still in flight, marker kept`), so the boot restore pays it. A shutdown during the connect itself still clears the marker. That is live-gate item 10's path, and a test pins it.

### WR-05: Cancel after "ready" (or a redeem that is never retried) leaves Mac Steam offline for the rest of the session

**Status:** fixed: requires human verification
**Files modified:** `src/backend/storeManagers/steam/macSteamOffline.ts`, `src/backend/sidecar/steamAuthFlowRegistration.ts`, `src/common/types/ipc.ts`, `src/preload/api/steam.ts`, `src/frontend/screens/Game/GamePage/components/SteamGoOfflineNotice.tsx`, tests `macSteamOnlineDebt.test.ts`, `flowRegistrationCensus.test.ts`
**Commit:** 6ffff959b
**Applied fix:** There is a new sidecar-only invoke, `steamGoOfflineCancel`, which calls `payAbandonedGuidedOffline('cancel')`. The census goes from 22 to 23 invokes for steamAuthFlowRegistration.ts. The function fires goonline (detached, cleared on confirmation) only when the guided step is still armed and the marker is this process's own `guided` record. A Cancel before Continue, or after the retried logon consumed the step, does nothing. The dialog's Cancel button, header close and backdrop close all call it. Programmatic closes after a successful re-dispatch do not. `checkGuidedOfflineReady` arms an unref'd timer at `GUIDED_RESTORE_TTL_MS` that pays an arm that lapses unused. Arming or consuming the step clears that timer. Not done: the review's "on dialog unmount" call. The dialog is mounted for the app's lifetime, so the TTL timer and the shutdown restore cover that case instead.

### WR-06: The guided copy asks for an action Mac Steam ignores while a game is running

**Status:** fixed
**Files modified:** `public/locales/*/gamelib.json` (49 catalogs), `src/frontend/screens/Game/GamePage/components/SteamGoOfflineNotice.tsx`
**Commit:** 520ef632a
**Applied fix:** The en source and the TSX defaults now lead with the step that works:
- `steam.goOffline.steps`: "If a Steam game is running, quit it first: Steam ignores Go Offline while a game runs. In the Steam app, choose Steam > Go Offline, then press Continue. GameLib sets Steam back online once it has signed in."
- `steam.goOffline.stillOnline`: "Steam still shows as online. If a Steam game is still running, quit it first. Choose Steam > Go Offline in the Steam app, then press Continue again."

As in plan 54-02, the other 48 catalogs were updated with translations written in this session rather than through machine-fill-gamelib. Each locale's existing reviewed text was kept verbatim. Only the new sentence was translated and inserted (prefixed to `steps`, and placed after the first sentence of `stillOnline`). `Steam > Go Offline` and `Go Offline` stay literal, per 54-02's convention. Edits were exact string replacements in the raw JSON, and every catalog was re-parsed to check the result. `pnpm lint-translations:gamelib`: 0 hard failures (the same 1632 soft findings as before). `pnpm i18n-churn-guard`: clean. `54-i18n-fill.json` (54-02's provenance record) was left as is. A native speaker has not reviewed the new sentences.

### WR-07: Logout does not stop an in-flight wrapped logon, so an authenticated session can open after sign-out

**Status:** fixed: requires human verification
**Files modified:** `src/backend/storeManagers/steam/user.ts`, tests `authSessionLifecycle.test.ts`, `user.test.ts`
**Commit:** b043537b3
**Applied fix:** `logout()` bumps a `sessionGeneration` and calls `abandonPendingLogon` (logOff, then settle the pending connect). The wrapped connect captures the generation. `connectSteamUserClient` issues no `logOn` on a mismatch, and its `loggedOn` handler logs off and never keeps a client from a superseded generation. `wrappedConnect` reports `not-signed-in` on a mismatch. Wraps are serialised (`wrapTail`), so a fresh sign-in's wrap cannot overlap the old wrap's goonline. The `connectingPromise` cleanup only clears its own slot. The `logOn({ refreshToken })` site and the `CM logon mode=authenticated` literal did not move. The test harnesses reset the two new statics between tests.

### WR-08: A stale canary ends the shared session under leases that are still held

**Status:** fixed: requires human verification
**Files modified:** `src/backend/storeManagers/steam/user.ts`, test `authSessionLifecycle.test.ts`
**Commit:** 166ce5cdc
**Applied fix:** `ensureAuthenticatedSession` takes `callerLeases` (`acquireInternal` passes 1, `ensureConnected` 0). If the canary fails while other leases still hold the session, it returns `client-not-ready` for this caller only and does not call `endSession`. The review's "retiring client list" alternative was not used: a second authenticated logon on the same account replaces the first anyway, so it would not protect the holders. With no other holder, the stale session is still ended and reopened through the wrap. The existing test for that path still passes, and a new test pins it too.

### WR-09: The anonymous client's idle timer can close it during a 90 s bulk PICS read

**Status:** fixed: requires human verification
**Files modified:** `src/backend/storeManagers/steam/anonymousClient.ts`, test `anonymousClient.test.ts`
**Commit:** 9135c2c50
**Applied fix:** `getAnonymousPicsClient` now returns a view whose `getProductInfo` counts reads in flight. The idle timer is armed only when no read is running, and is re-armed 60 s after the last one settles, whether it resolved or rejected. Logout and shutdown still close the client at once. Callers and their test doubles needed no change, since every caller uses `getProductInfo` only. With no read in flight, the 60 s idle close that items 3 and 4 of the live gate wait for is unchanged.

## Verification

- `npx jest src/backend/storeManagers/steam src/backend/__tests__/steamAuthSessionPolicy.test.ts src/backend/sidecar src/frontend/state`: 4888 passed, 4 failed, 173 suites. The 4 failures are the known pre-existing ones in `installFlows`, `runnerSliceRegistration` and `testContainment`. They fail identically with these changes stashed.
- `pnpm codecheck` (`tsc --noEmit && tsc -p tsconfig.meta.json --noEmit`): exit 0.
- `npx prettier --check` over the 18 non-catalog files changed: all formatted. The 49 `public/locales/*/gamelib.json` files are prettier-ignored (`--file-info` reports `"ignored": true`), so a check over them would prove nothing. They were edited in place without reformatting.
- Not part of this battery: `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT fails, and it fails identically on the base commit. It derives from git against the upstream merge-base, so it is unrelated to these fixes.

---

_Fixed: 2026-10-27T20:37:36Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
