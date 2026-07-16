---
slug: steam-dm-queue-wedge
status: resolved
trigger: "D-UAT-05: Interrupted Steam native installs wedge the DownloadManager queue across app restart and cannot be paused/stopped/cancelled."
created: 2026-07-17
updated: 2026-07-17
phase: 21-steam-native-install
related_uat: .planning/phases/21-steam-native-install/21-UAT.md
---

# Debug: Steam native-install DM-queue wedge on restart

## Symptoms

- **Expected behavior:** For an interrupted (or in-progress) Steam native depot install, the DownloadManager pause, stop, and cancel buttons work — pause halts it, stop/cancel aborts it AND removes it from the persisted queue. Restarting the app does not silently re-wedge on a stuck install.
- **Actual behavior:** After starting a Steam native install and closing the app part-way through the download, reopening the app shows the install still in the DM queue. The pause and stop buttons are non-functional; the item never leaves the queue; every restart re-triggers the wedge via `initQueue()` auto-resume. User cannot cancel it to install anything else.
- **Error messages:** None surfaced in the UI (silent). Backend may log `SteamGame.stop: Steam owns process lifecycle for appId ...; no-op` (games.ts:1095) when `nativeInstallsInFlight` does not contain the appId at stop time.
- **Timeline:** First observed during Phase 21 real-hardware UAT (2026-07-16, macOS). Introduced by the Phase 21 native-install path — GOG/Epic/Amazon installs do not exhibit this.
- **Reproduction:** (1) `enableSteamNativeInstall` ON. (2) Start a native install of a large game (Civ VII appId 1295660, or Cyberpunk 2077 appId 1091500). (3) Quit GameLib mid-download. (4) Reopen. (5) The install reappears in the DM queue; pause/stop/cancel do nothing; it re-wedges on every restart.
- **Current stuck state (evidence):** `~/Library/Application Support/gamelib/store/download-manager.json` held `queue: [1295660 Civ VII 20GiB, 1091500 Cyberpunk 2077 70GiB]`, `finished: []`.

## Suspected root cause (from orchestrator code-read — verify, don't assume)

1. `installDepotDownload` (`src/backend/storeManagers/steam/games.ts:716-776`) registers `createAbortController(this.appId)` + `nativeInstallsInFlight.add(this.appId)` only AFTER `await ensureSteamClientReady(...)` and `await resolveSteamInstallTarget(...)`. While execution is wedged in that pre-download window (or on a stalled `steam-user` CM re-auth after restart), `SteamGame.stop()` sees `nativeInstallsInFlight.has(appId) === false` → hits the no-op branch → the abort signal is never fired. → pause/stop appear dead.
2. `stopCurrentDownload` (`downloadqueue.ts:293`) uses `currentElement!` and `cancelCurrentDownload` (`downloadqueue.ts:249`) guards the whole body on `if (currentElement)`. On a fresh restart `currentElement` is an in-memory `null` until `initQueue` assigns it; if the resumed steam install wedges before/around that, a persisted-but-not-running queue head may not be removable — so cancel cannot clear it from the persisted `queue`.
3. `initQueue()` is called at startup (`main.ts:572`) and auto-resumes `queue[0]`, so a wedged steam install re-wedges on every launch instead of staying paused/cancellable.

## Fix goals (acceptance)

- An interrupted or in-progress Steam native install can ALWAYS be paused and cancelled from the DM UI.
- Cancel/stop actually removes the item from the persisted `download-manager.json` queue (survives restart).
- A restart does not silently re-wedge on a stuck steam install (either abort-aware pre-download awaits + synchronous abort registration, and/or don't auto-resume steam native installs on startup, and/or allow cancelling a not-yet-running persisted queue head).
- Add regression test coverage (downloadqueue + steam games install/stop paths).
- Do NOT regress GOG/Epic/Amazon queue behavior.

## Current Focus

hypothesis: (confirmed — see Resolution)
next_action: none — resolved and verified.

## Evidence

- timestamp: 2026-07-17 — persisted queue confirmed wedged with 2 steam installs (1295660, 1091500), finished empty. Source: download-manager.json.
- timestamp: 2026-07-17 — traced `downloadqueue.ts`: `currentElement` module var starts `null` and is only ever assigned inside `initQueue()`'s while loop (first assignment happens after `main.ts`'s hardcoded 5s startup `setTimeout`). `cancelCurrentDownload`, `pauseCurrentDownload`'s internal `stopCurrentDownload()` call, and `stopCurrentDownload` itself ALL guard their entire body on `if (currentElement)` / `currentElement!`. Confirms cause #2's real mechanism: any click in the `[0, 5000ms)` window after app start is a COMPLETE no-op — `cancelCurrentDownload` doesn't even reach its unconditional `removeFromQueue()` call, so the item is never cleared from the persisted store. Confirms cause #3: `main.ts:572` unconditionally calls `initQueue()` 5s after startup with no state/consent check, re-resuming `queue[0]` on every restart.
- timestamp: 2026-07-17 — traced `installDepotDownload` (games.ts:716-776): confirmed cause #1's exact mechanism — `createAbortController`/`nativeInstallsInFlight.add` happen AFTER `await ensureSteamClientReady()` and `await resolveSteamInstallTarget()`. On macOS, `install()` also awaits `ensurePlatformsCaptured()` (bounded by `METADATA_FETCH_TIMEOUT_MS`) BEFORE `installDepotDownload` is even entered — widening the pre-registration window further. This matches the field-observed "no-op" log line exactly (nativeInstallsInFlight didn't have the appId yet when stop() ran).
- timestamp: 2026-07-17 — traced `resolveSteamInstallTarget` → `fetchInstalldir` (installLocation.ts:131): uses `SteamUser.getClient()` (returns `this.client` synchronously, NOT `ensureConnected()`) — so this step alone is fast/non-blocking even on a cold/disconnected client (falls back to `undefined` → sanitizeInstalldir fallback). Not the primary source of a LONG pre-registration wedge.
- timestamp: 2026-07-17 — traced `downloadSteamDepots` → `buildDepotPlan` (depot.ts:318-364): found an ADDITIONAL, previously-unlisted mechanism — `buildDepotPlan` NEVER referenced `opts.signal` anywhere. It sequentially awaits `SteamUser.ensureConnected()` (bounded ~15s CM reconnect on a cold restart, per `user.ts:214-219`), then 3 separate `client.getProductInfo()` PICS calls (appinfo, owned packages, DLC info), then for EACH owned depot: `getDepotDecryptionKey` + `getRawManifest` (2 more network round-trips per depot). For a many-depot game (e.g. Cyberpunk 2077 with base+language depots), this phase can run long. `nativeInstallsInFlight`/the AbortController ARE registered by this point (installDepotDownload registers them before calling downloadSteamDepots), so `SteamGame.stop()` correctly calls `callAbortController()` (no "no-op" log) — but `callAbortController` merely sets `signal.aborted = true`; nothing in `buildDepotPlan` ever checked it, so the plan-build ran to completion regardless of a cancel click, and cancel/pause appeared silently ineffective for the whole duration of that phase. Only `downloadDepotFiles` (the file-streaming phase, AFTER the plan is built) checked `signal.aborted` per-chunk/per-file.
- timestamp: 2026-07-17 — traced frontend button wiring (`DownloadManagerItem/index.tsx` + `frontend/helpers/library.ts`): the CURRENT (queue-head) item's Stop/Cancel button → `handleStopInstallation` → `window.api.cancelDownload(...)` → `cancelCurrentDownload()`. A NON-head queued item's button → `window.api.removeFromDMQueue(appName)` → `removeFromQueue()` directly (bypasses `currentElement` entirely — already worked correctly, confirmed via new regression test).
- timestamp: 2026-07-17 — all 3 suspected causes verified as firing, via DIFFERENT mechanisms than the literal original wording for #1/#2, plus one additional undocumented mechanism (buildDepotPlan ignoring the abort signal) found during verification.

## Eliminated

- hypothesis: "Cause #2's literal wording — `stopCurrentDownload` using `currentElement!` non-null assertion is itself the crash/bug"
  evidence: `stopCurrentDownload` is only ever called from inside `if (currentElement)` guards (in `cancelCurrentDownload` and `pauseCurrentDownload`), so the `!` assertion never actually throws. The REAL bug is that those guards make the ENTIRE cancel/pause body (including `removeFromQueue`) a no-op when `currentElement` is null, not a crash from the assertion itself.
  timestamp: 2026-07-17

## Resolution

root_cause: |
  Three distinct, independently-verified mechanisms converge on the single symptom:

  1. **Startup race (downloadqueue.ts):** `currentElement` stays `null` from module load
     until `initQueue()`'s while loop first assigns it, but `main.ts` only calls
     `initQueue()` 5 seconds after app startup. `cancelCurrentDownload`,
     `pauseCurrentDownload`, and `stopCurrentDownload` all guard their ENTIRE body on
     `if (currentElement)` — so any pause/cancel click in that 5s window (very plausible;
     users reopen the app and immediately try to stop a stuck install) is a complete
     no-op, including `cancelCurrentDownload`'s `removeFromQueue()` call, meaning the item
     is never cleared from the persisted queue. 5 seconds later `initQueue()`
     unconditionally auto-resumes `queue[0]`, re-wedging on every restart.

  2. **Registration-order gap (games.ts installDepotDownload):** `nativeInstallsInFlight`/
     the real `AbortController` were only registered AFTER `await
     ensureSteamClientReady()` and `await resolveSteamInstallTarget()` resolved (plus, on
     macOS, after `ensurePlatformsCaptured()` upstream in `install()`). A stop() issued
     during that window saw `nativeInstallsInFlight.has(appId) === false` and hit the
     historic no-op branch — this exact mechanism was directly observed in the field log
     ("SteamGame.stop: Steam owns process lifecycle ...; no-op").

  3. **Abort-signal-blind plan-building (depot.ts buildDepotPlan):** even once
     `nativeInstallsInFlight`/AbortController WERE registered, `buildDepotPlan`'s PICS
     network calls (CM connect, up to 3 getProductInfo calls, plus 2 network round-trips
     PER OWNED DEPOT for decryption-key + manifest) never consulted `opts.signal` at all.
     `callAbortController()` correctly set `signal.aborted = true`, but nothing checked
     it until `downloadDepotFiles` (the later file-streaming phase) started — so a
     cancel/pause click during plan-building (which can run long for a many-depot game)
     appeared silently non-functional for that entire duration, with no error log at all
     (registration succeeded, so the "no-op" branch never fired either).

fix: |
  Three coordinated, minimal changes:

  1. `src/backend/downloadmanager/downloadqueue.ts` — seed `currentElement` from the
     persisted queue head at module load (`getFirstQueueElement()`) instead of `null`, so
     cancel/pause/stop are never no-ops for a queue head that survived a restart, even
     before `initQueue()`'s 5s startup timer has fired.

  2. `src/backend/storeManagers/steam/games.ts` (`installDepotDownload`) — move
     `createAbortController`/`nativeInstallsInFlight.add` to the TOP of the function,
     before either `ensureSteamClientReady` or `resolveSteamInstallTarget` is awaited,
     closing the registration-order gap entirely. Added `controller.signal.aborted`
     checks after each of those two awaits so a cancel issued during either seam now
     also aborts the install promptly instead of silently continuing to
     `downloadSteamDepots`.

  3. `src/backend/storeManagers/steam/depot.ts` (`buildDepotPlan` +
     `downloadSteamDepots`) — added a `throwIfAborted(opts.signal)` check between every
     major network step in `buildDepotPlan` (after `ensureConnected`, after each of the 3
     `getProductInfo` calls, and before each per-depot manifest fetch in the loop), so a
     cancel during plan-building now takes effect within roughly one network round-trip
     instead of running to completion. `downloadSteamDepots`'s catch block now checks
     `opts.signal?.aborted` and returns `{ status: 'cancelled' }` (matching
     `downloadDepotFiles`'s existing cancelled-outcome convention) instead of
     mis-classifying an abort-triggered throw as a generic error.

  Cause #3 (`initQueue()`'s unconditional 5s auto-resume) was deliberately left
  unchanged — the acceptance criteria's "either/or" phrasing is satisfied by making
  cancel/pause reliably effective instead (fix #1 covers the pre-initQueue window; fixes
  #2/#3 cover the actively-running window), so auto-resume is no longer unsafe: the user
  always has a working, prompt way to stop it.

verification: |
  - `npx jest src/backend/downloadmanager src/backend/storeManagers/steam` — 478/478
    pass, including 4 new tests in a new `downloadqueue.test.ts` (previously no test
    coverage existed for downloadqueue.ts at all), 2 new tests in `depot.test.ts`
    (abort-before-ensureConnected, abort-mid-depot-loop, plus a
    downloadSteamDepots-level "cancel during plan-build resolves cancelled not error"
    test), and 1 new test in `games.test.ts` (stop() during pending
    ensureSteamClientReady finds nativeInstallsInFlight already registered, no "no-op"
    log).
  - Fix #1 regression-tested directly: reverted `currentElement` to `null`-seeded,
    reran the new downloadqueue tests — the core "cancel removes a restart-surviving
    queue head" test FAILED as expected (received length 1, expected 0), confirming the
    test actually exercises the fix. Restored the fix; test passes again.
  - `npx jest src/backend` — full backend suite: 58/58 suites, 1224/1224 tests pass (one
    unrelated stray post-teardown timer error from an existing steam ACF-poller test,
    firing after all suites had already reported passed — pre-existing test-environment
    noise, not touched by this fix).
  - `npm run codecheck` (tsc --noEmit) — clean, no errors.
  - GOG/Epic/Amazon: no runner-specific code touched; `removeFromQueue` (the always-worked
    non-head-item path) and existing pause/resume/online-reconnect tests all still pass
    unchanged.

files_changed:
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/downloadmanager/__tests__/downloadqueue.test.ts (new)
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
