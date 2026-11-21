---
status: resolved
trigger: "Retest (a) of bridged-launch-steam-signed-out: Steam > Sign out, Play Schedule I, sign in during the hold -> 'Steam bridge unavailable ... Reason: not-inited' dialog instead of a launch."
created: 2026-11-21
updated: 2026-11-21
related: .planning/debug/resolved/bridged-launch-steam-signed-out.md (fix e5fc84b8c)
---

# Debug: a slow WHOAMI right after sign-in reads as not-inited

## Symptoms

- **expected:** Signing in to Steam during the bridged-launch hold launches the game (passed in
  round 2 of bridged-launch-steam-signed-out).
- **actual:** 2026-11-21 20:21, Schedule I 3205720: the hold ran (in-app notice pushed 20:21:05),
  the operator signed in, and the first helper after sign-in (20:21:17) logged `READY init=ok`, then
  `full-AppID WHOAMI failed` -> identity-only (480) fallback -> `READY init=ok appid=480` ->
  "identity-only fallback also failed" -> `not-inited` dialog (offers bottled Steam). Game did not
  launch.
- **errors:** dialog "Steam bridge unavailable ... Reason: not-inited".
- **repro:** timing-dependent: sign in to Steam during the hold, so a fresh helper starts while
  Steam is still delivering its post-login callback burst.

## Current Focus

hypothesis: the readiness probe's WHOAMI timed out and was read as an answered "not inited".
next_action: none -- resolved 2026-11-21 (operator confirmed both retests live).

## Evidence

- timestamp: 2026-11-21
  checked: gamelib.log 20:21:17-20:21:18
  found: neither helper logged `INIT user` before the backend decided. The only `INIT   user
  loggedOn=1 accountPresent=1` line appears at 20:21:18 AFTER `identity-only fallback also failed`
  and `bridge-wait-end`, i.e. the 480 helper answered WHOAMI signed-in, but too late. ~20 CBQ
  callback lines per helper show Steam's post-login burst.
- timestamp: 2026-11-21
  checked: helperProcess.ts probeHealthAndWhoami / probeHelperReadiness; bridge_helper.c WHOAMI
  found: PROBE_TIMEOUT_MS = 250 covers HEALTH + HELLO + WHOAMI on one socket. WHOAMI first runs
  pump_callbacks() = 3 x usleep(50 ms) = >= 150 ms plus draining the burst, then GetSteamID +
  BLoggedOn. On timeout, finish({ healthOk, authOk, whoamiOk: false }) carries healthOk && authOk
  true and no reason, which probeHelperReadiness maps to `not-inited` on the FIRST poll (no retry),
  sending the launch to the 480 fallback, which times out the same way.
  implication: a pre-existing race (250 ms since 24-06 on 2026-07-20; pump in WHOAMI since 24-02)
  that the sign-in-during-hold path now hits, because the hold respawns helpers exactly while Steam
  is busiest.

- timestamp: 2026-11-21 20:23-20:25 (operator retest, old sidecar)
  checked: gamelib.log 20:23:55-20:25:16
  found: first Play (20:23:55) spawned nothing: it reused the identity-only (480) helper left
  registered by the 20:21:18 failure (init=ok, so the no-reuse rule kept it). Steam had been
  signed out since; the reused helper died on `CCrossProcessPipe::BWrite: Broken pipe` / `Fatal
  assert`, and the identityOnly-reuse branch reported `not-inited` at once -- bridge-error dialog,
  no hold. Second Play (20:24:14) spawned a fresh full-AppID helper -> InitFlat failed -> the
  in-app wait notice -> 60 s -> steamNotSignedIn dialog (correct).
  implication: second defect: a leftover 480 helper's failure bypasses the signed-out hold.

## Eliminated

## Resolution

root_cause: (1) the readiness probe used one 250 ms timer for HEALTH + HELLO + WHOAMI; WHOAMI
  pumps callbacks >= 150 ms first, and Steam's post-login burst pushes it past the timer; a
  timed-out WHOAMI was read as an answered not-inited on the first poll -> 480 fallback -> same ->
  not-inited dialog. (2) the 480 helper left by (1) was reused by the next Play; once Steam was
  signed out it failed, and the reuse branch reported not-inited without the hold.
fix: helperProcess.ts: (1) WHOAMI gets its own WHOAMI_TIMEOUT_MS = 1500 timer, and a timed-out
  WHOAMI (`whoamiTimedOut`) polls again instead of returning not-inited; (2) a reused identity-only
  helper whose probe is not ready is stopped and replaced by a fresh full-AppID helper before any
  outcome is decided.
verification: 3 new helperProcess tests (late WHOAMI counts; unanswered WHOAMI re-polls, no 480;
  leftover 480 replaced -> hold -> ready); each fails with its change reverted. steam suites +
  fakeHomeIsolation 179 suites pass; tsc clean; prettier clean; eslint 0 errors (1 pre-existing
  warning). Sidecar rebuilt 20:27. Live: pass 2026-11-21 -- (1) sign-in during the hold launched the game; (2) an immediate re-Play while signed out showed the wait notice, then the steamNotSignedIn dialog.
files_changed:
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
