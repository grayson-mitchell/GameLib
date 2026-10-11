---
created: 2026-10-11T02:10:00.000Z
title: 'Steam CM refusing the stored refresh token (AccessDenied) shows the generic "Couldn''t sync" banner with a Retry button instead of the sign-in row'
area: ui
severity: medium
platform: any
ready: code
found_by: "debug session steam-sync-false-failed-banner (2026-10-11), split out of the 2026-10-10 false-failure todo"
files:
  - src/backend/storeManagers/steam/user.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/signInProbe/pass.ts
  - src/frontend/screens/Library/librarySyncIndicator.ts
  - src/frontend/screens/Library/components/SteamSyncNotice/index.tsx
---

# A CM-refused Steam token never reaches the sign-in surface

Split out of `2026-10-10-steam-sync-notice-false-failure-after-signin-reconnect.md` (now in
`completed/`) by the debug session `.planning/debug/steam-sync-false-failed-banner.md`.

## What is true now (after 331988302 and b08c6c2ec)

- When Steam's CM refuses the stored-refresh-token logon with `AccessDenied`, steam-user treats it as
  terminal: no retry is scheduled. `SteamUser.ensureConnected()` now returns false at once instead of
  waiting out the 20 s grace window, and `SteamUser.getLogonFailure()` exposes `{message, eresult}`.
- `library.ts` sync exit path 1 (34.15 D-07) now emits `steamSyncStatus` with `reason:
  'logon-rejected'` for this case, `'client-not-ready'` otherwise. The renderer still drops `reason`.
- So the user sees the `SteamSyncNotice` `'failed'` banner about 1 s after the keyring read. Its copy
  ("Try again, or check that Steam is reachable") and its Retry button are both wrong for this cause:
  Steam is reachable and Retry replays the same refusal.

## Why the sign-in row does not fire

Phase 49 D-21's Steam probe reads only the keyring, so `verdict=cleared` proves the token is present
(len=493 in the live log), not that Steam accepts it. `steamCredentialsMissing` therefore stays false
and the D-19 suppression branch in `resolveSteamSyncIndicator` correctly does not apply.

## Design recorded by the debug session (verify, then build)

- After `ensureConnected()` returns false, consult `getLogonFailure()`. On a terminal refusal, latch
  Steam `credentialsMissing` and fence the sign-in epoch so the existing D-19 branch renders "Your
  Steam sign-in expired" with the Sign in action, and the generic failed banner is suppressed.
- Clear the latch on a successful cold-connect logon.
- This changes cross-store sign-in semantics (a probe outcome set from a CM response rather than the
  keyring), which is why it was not built inside the debug session. Read 49-CONTEXT.md D-19/D-21 and
  the T-49-10 epoch fence before changing them.

## Live check first (macOS)

The reason Steam refused the token is inferred (revoked or expired), not observed. Before building:
confirm `gamelib.log` shows `Steam: the CM rejected the stored-credential logon (AccessDenied)` and no
`grace-window wait took ... 20002ms` line, then sign out and back in with QR. If sync then succeeds,
the token was dead and this todo stands. If `AccessDenied` repeats on a fresh token, the logon path
itself is broken and that is a different bug; re-open the debug session with the new log.

## Fix (2026-10-11, quick 261011-rj0, commit `7390a245a`)

Built the design above as recorded, at the one place the CM verdict is observed:
`SteamUser.ensureConnected()` (`src/backend/storeManagers/steam/user.ts`), next to the `absent`
branch that already latched `credentialsMissing` directly (260822-vov).

- **Latch.** When `getLogonFailure()` names a refusal of the *credential* -- EResult
  `InvalidPassword` (5), `AccessDenied` (15), `Revoked` (26), `Expired` (27) or
  `AccountLogonDenied` (63) -- `ensureConnected()` calls
  `applySignInVerdict('steam', 'expired', epochAtStart)` and, when that returns `latched`, records
  the `expired` outcome and publishes the outcome map. `resolveSignInState` branch 1 then renders the
  D-19 "Your Steam sign-in expired" row with Sign in, and `resolveSteamSyncIndicator` branch 1b
  suppresses the generic banner. The latch runs **before** `ensureConnected()` returns false, so
  `library.ts`'s `failed/logon-rejected` emit (exit path 1) follows the flag on the same pipe.
- **Fence.** `epochAtStart = captureSignInEpoch('steam')` is taken before the connect attempt, as
  `pass.ts` does. A sign-in that completes while the logon is in flight bumps the epoch
  (`noteSignInSucceeded`) and the old attempt's refusal is `stale` -- no write, no publish
  (T-49-10). Proven by mutation: passing a fresh epoch at the verdict call reds test C only.
- **Not a credential refusal, not latched.** `LogonSessionReplaced` (34), `RateLimitExceeded` (84)
  and every other terminal EResult still return false at once but write nothing; for those the
  generic banner is the truth.
- **Clear on success.** A successful cold-connect logon (`client.steamID` populated), including one
  that lands late inside the grace window, reports `healthy` through the same fenced verdict; a
  latched flag is cleared and `healthy` re-published; a clean flag writes and publishes nothing.
- **Renderer unchanged.** `librarySyncIndicator.ts`, `SteamSyncNotice`, `GlobalState.tsx` and
  `pass.ts` were listed as context and needed no edit. D-21 is unchanged: `probeCredentialPresence()`
  still reads the keyring only. This is the first verdict site fed by a CM response rather than a
  keyring read; it goes through `applySignInVerdict` and nothing else so the fence, write-if-changed
  and logging are the probe's own.

Tests: `user.test.ts` gained five cases (A latch+publish, B non-credential control, C epoch fence,
D clear-on-success, E nothing-latched control); RED observed on A and D before the source edit.
`user`, `library`, `verdict`, `pass` suites: 416/416. Whole Backend project: 5793 passed, 1 failed
(`dxvkInstallRemove.test.ts`, passes alone, imports nothing this change touched -- a load flake).
`pnpm codecheck` exit 0; scoped `prettier --check` green on both written paths.

**Owed live checks (macOS):**

1. The "Live check first" above was NOT run -- it needs the operator to sign out and back in with
   QR. Today's `gamelib.log` (11:17:40 and 11:20:30) still shows `AccessDenied` followed by the
   20002 ms grace wait, so the running release bundle predates 71b05c28d as well as this fix.
   Rebuild, launch: expect `the CM rejected the stored-credential logon (AccessDenied)` and
   `[signInProbe] steam verdict=latched` within ~1 s of the keyring read, the expired row with Sign
   in, and no "Couldn't sync" banner. Then sign in with QR; if `AccessDenied` repeats on the fresh
   token the logon path itself is broken and that is a different bug -- re-open
   `.planning/debug/steam-sync-false-failed-banner.md` with the new log.
2. After the QR sign-in succeeds, the row must clear (`noteSignInSucceeded` + `finishAuth`'s
   `credentialsMissing` delete) and the library must sync.
