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
