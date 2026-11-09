---
spike: 075
name: friends-flip-full-refresh
type: standard
validates: "Given Mac Steam signed in with Friends online, when GameLib's full Refresh sequence runs without the go-offline wrap, then we learn which step, if any, still signs Friends out"
verdict: VALIDATED (no step flips Friends on 2026-11-09, harness or real app)
related: [046a, 046b, 046c, 052, 073, 074]
tags: [steam, macos, friends, offline-mode, steam-user, refresh, live]
---

# Spike 075: Does GameLib's full Refresh still sign Mac Steam's Friends out?

## What This Validates

074 found that a *bare* authenticated logon (steam-vent or steam-user, held 60 s) no longer signs
Mac Steam's Friends out, and left two explanations open: **Steam changed**, or **the trigger is
GameLib's post-logon work** (the debug-era flips always had a library refresh within the same
second). This spike runs that post-logon work unwrapped, first as a staged harness and then as
the real app.

## How to Run

```bash
# Arm A: staged replay of the Refresh calls (Mac Steam online, GameLib NOT running)
node refresh-unwrapped.mjs "$TMPDIR/gamelib-dev-secret-vault.json" a1-full [stopAfter]
# stopAfter = logon|licenses|canary|owned|demos|capture, for bisecting if a flip ever returns

# Arm B: the real app with the wrap bypassed (TEMPORARY, revert afterwards)
git apply .planning/spikes/075-friends-flip-full-refresh/arm-b-nowrap.patch
pnpm tauri:dev        # then press Refresh in the Steam library; watch Friends ~90 s
git checkout -- src/backend/storeManagers/steam/user.ts && pnpm build:sidecar
```

`watch-armb.sh` mirrors Mac Steam's `connection_log.txt` into `runs/b1-realapp.log`. GameLib's
log is `~/Library/Logs/GameLib/gamelib.log` (the script's first version globbed the wrong path;
the GAMELIB lines came from a separate `tail -F` with the same filter).

## Investigation Trail

1. **Mapped the production sequence** for a cold Refresh: `user.ts` connect
   (`enablePicsCache:false, autoRelogin:false`, `logOn({refreshToken})`, steam-user's automatic
   `webLogOn`), canary `getProductInfo([7])`, `library/refresh.ts` `getUserOwnedApps(…,
   {includePlayedFreeGames:true})`, `licensedDemos.ts` (package info with tokens for every
   license, then app info for the licensed-not-owned remainder), the platform-capture pass on the
   held session, then `AUTH_SESSION_IDLE_GRACE_MS` (60 s) before logOff.
2. **Arm A (22:47:41, Mac Steam restarted 22:47:01, Friends confirmed):** logon 1.1 s, 485
   licenses, canary, `webSession` event at 1.4 s, 390 owned, 485 packages → 754
   licensed-not-owned app infos, a worst-case 390-app PICS pass, 60 s hold with 3/3 liveness
   checks, logOff. **Mac Steam's `connection_log` recorded nothing.** Operator: Friends signed
   in, status changeable, no flicker at any point.
3. **Arm B (real app, 22:51):** `user.ts`'s `withMacSteamOffline(...)` replaced by a direct
   `connectSteamUserClient(..., wrap: 'not-darwin')` (`arm-b-nowrap.patch`). Note that today's
   app does **not** log on at launch (`library refresh deferred … trigger=startup`), so the
   debug-era "launch → flip in ~30 s" repro no longer has a launch logon to trigger it; the
   operator pressed Refresh instead. GameLib log: `CM logon mode=authenticated
   reason=user-refresh wrap=not-darwin` 22:51:39 → loggedOn → 390 owned → demos=11 (485
   licenses, 754 licensed-not-owned) → anonymous platform capture + held-session second pass →
   `CM session closed mode=authenticated cause=idle` 22:52:49. **`connection_log` silent
   throughout.** Operator: Friends signed in, status changeable, no flicker. Patch reverted,
   sidecar rebuilt clean (marker count 0), `src/` clean.
4. **Did Mac Steam change since the flips (2026-10-24…27)?** Locally, no: `steamclient.dylib`
   is dated 2026-10-22 11:15. The one update since (2026-10-28, 2.9 MB) replaced only the
   bootstrapper package (`steam_osx_macos-signed-2.zip`), not `steamclient.dylib`. So the
   client code that flipped is the code that doesn't flip now. That points at a **server-side
   change**, or at the one GameLib-side input that also changed: the **refresh token**. The
   stored token was re-minted on 2026-11-08 08:21 UTC (aud `client, web, renew, derive`); the
   debug-era token is gone and can't be compared.

## Results

**VALIDATED: on 2026-11-09 no part of GameLib's Refresh signs Mac Steam's Friends out.** That
holds both for the staged harness (every Refresh call, in order) and for the real app with the
wrap removed. Mac Steam's own CM session never notices: `connection_log` is silent. With 074,
that covers a bare logon from steam-user and steam-vent, the full Refresh, an idle logOff, and
two clients coexisting for 60–120 s.

**What it doesn't prove:** that the flip is gone for good. The local client is unchanged since
the flips. So the cause either changed on Valve's side, which can change back, or lived in the
old token, which wasn't kept. Not exercised: sign-in (a fresh token mint), redeem, depot install,
shared redists, repair, a CM drop with relog, and a session held for many minutes.

**Signal for the build:**

- **Don't delete the wrap. Stop making the user pay for it.** It's cheap when it works (Friends
  drops for a few seconds), but its failure path, the guided "Go Offline" step, blocks the action.
  Recommended shape: keep the wrap behind one switch, and when Mac Steam doesn't go offline in
  5 s, **go ahead with the logon unwrapped** instead of raising `go-offline-required`. On today's
  evidence the downside is nil. If a flip ever comes back, the existing debug doc
  covers the recovery (restart Mac Steam).
- **Add a cheap flip canary instead of guessing:** the flip leaves no `connection_log` trace, so
  the only signal is the operator's. A one-line live-gate item ("Refresh with Mac Steam online;
  Friends still signed in") in each Steam-auth phase's UAT will catch a regression.
- **Spike 078 (owned apps via the running Steam client) loses its main motivation.** It existed
  to avoid the Friends drop. Park it unless the flip returns.
- STEAM-STACK.md's Phase 54 amendment, and the anonymous-by-default design it forced, can be
  relaxed in a phase that also carries the canary above.
