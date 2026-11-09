---
spike: 046c
name: reconnect-reflip
type: standard
validates: "Given Mac Steam online and GameLib connected from a wrapped logon, when GameLib's CM connection drops and it logs on again, then see whether Friends flips"
verdict: PARTIAL
related: [046a, 046b]
tags: [steam, macos, friends, steam-user, autorelogin, relog, steam-auth]
---

# Spike 046c: reconnect-reflip

## What This Validates

Question 5 of the todo: does a GameLib re-logon while Mac Steam is online flip Friends again? If
so, the wrap must cover reconnects too.

## Research

Code-level, not live. `steam-user` 5.3.0 and `src/backend/storeManagers/steam/user.ts`:

- `new SteamUserLib({ enablePicsCache: false })` (`user.ts:615`) leaves `autoRelogin` at its
  default `true` (`node_modules/steam-user/resources/default_options.js:27`).
- `_handleLogOff` (`components/09-logon.js:631-686`): on a non-fatal result (`0`, `Fail`,
  `NoConnection`, `ServiceUnavailable`, `TryAnotherCM`) it emits `disconnected`, then after a
  1 s exponential-backoff tick calls `this.logOn(true)`. That reuses the stored logon details
  (refresh token) and sends a full `CMsgClientLogon`. A connection closing mid-connect
  (`02-connection.js:50`) also reconnects after 1 s.
- `user.ts:287`: the `ensureConnected` canary calls `client.relog()` when the socket looks stale.
  `relog()` is `logOff()` + `_relogging`, which takes the same `logOn(true)` path.
- So GameLib has **three logon sites**: `connectSteamUserClient`'s `client.logOn({ refreshToken
  })` (`user.ts:689`), the canary `relog()`, and steam-user's silent autoRelogin. Only the first
  is a call GameLib makes directly.

## Investigation Trail

1. Looked for anything in a re-logon that differs from the first logon. There is none: same
   refresh token, same `logonID` (default 0), same `chat_mode` 2, same SteamClient platform.
2. The debug session already ruled out every logon-message lever (`chat_mode`, `logonID`,
   persona Online/Invisible) and showed every authenticated logon flips. Nothing marks a
   re-logon as different.
3. A live repro was not run. Forcing only GameLib's CM socket to drop needs `pfctl` (root) or a
   network blip, and a network blip also drops and auto-reconnects Mac Steam, which confounds the
   result. A flip costs a Mac Steam restart.

## Results

**PARTIAL**: mechanism-level answer, not observed live. A GameLib reconnect is a fresh
authenticated `CMsgClientLogon`, the same as the logon the debug session showed flips Friends
every time, so it should be expected to flip if Mac Steam is online.

Consequence for the wrap: wrapping `connectSteamUserClient`'s single `logOn` is **not enough**.
Either

- (preferred) construct the client with `autoRelogin: false`, treat `disconnected` as session
  ended, and route every reconnect, including the canary's `relog()`, back through the wrapped
  connect, so each CM logon gets its own offline window; or
- hook `disconnected` and fire `gooffline` inside steam-user's 1 s backoff. This is racy:
  offline takes ≈ 0.25 s, but the backoff is not a contract.

Open for a live check, if wanted: drop only the sidecar's CM socket (for example `pfctl` block on
the sidecar's CM address, with root) while Mac Steam is online, and watch for a `loggedOn`
without a preceding `gooffline`.
