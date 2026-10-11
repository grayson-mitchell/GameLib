---
created: 2026-10-10T13:35:00.000Z
title: 'Steam sync-notice banner falsely shows "failed" during the post-sign-in CM reconnect window'
area: ui
severity: medium
platform: any
ready: code
found_by: "live macOS verification of F-49-R1-2 fix (quick-261010 session), 2026-10-10"
files:
  - src/frontend/screens/Library/librarySyncIndicator.ts
  - src/frontend/screens/Library/components/SteamSyncNotice/index.tsx
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/user.ts
completed: 2026-10-11
status: "RESOLVED 2026-10-11 (premise refuted; code half fixed; sign-in handoff split out). Debug session .planning/debug/steam-sync-false-failed-banner.md: the log shows no reconnect in flight. Steam CM refused the stored-refresh-token logon with AccessDenied, which steam-user 5.3.0 treats as terminal (no retry scheduled), so the failed banner was a true report, not a race. Two code defects were fixed: ensureConnected() attached its grace-window listeners after the terminal error had already fired and waited out the full 20 s (331988302), and library.ts exit path 1 reported the opaque client-not-ready reason; it now emits logon-rejected via SteamUser.getLogonFailure() (b08c6c2ec). Both fix directions proposed here were eliminated: retry replays the refusal, routing to syncing resurrects the never-ending spinner 34.15 D-06 killed. Remaining product defect (banner copy/Retry wrong for a refused token; refusal never reaches the sign-in surface) filed as 2026-10-11-steam-cm-refused-token-never-reaches-sign-in-surface.md. Live confirmation of the new log lines pending on macOS."
resolved_by: 331988302 b08c6c2ec
---

# SteamSyncNotice shows a generic "failed" banner during a benign post-login CM reconnect

Found while live-verifying the fix for F-49-R1-2 (stale Library sign-in row). After clearing an
expired Steam sign-in, the `LibrarySignInNotice` row correctly disappeared immediately (no remount
needed — F-49-R1-2 confirmed fixed). But 5-10s later, with no further user action, the Library
showed a DIFFERENT banner: `SteamSyncNotice`'s `'failed'` mode ("Couldn't sync your Steam library" /
"Try again, or check that Steam is reachable").

`gamelib.log` shows why:

```
13:30:01  SidecarKeyringSlotStore(steam-refresh-token).getToken(): keyring_get ok present=true len=493
13:30:02  [WARNING] Steam client error, username unavailable: Error: AccessDenied
            at SteamUser._handleLogOnResponse (steam-user/components/09-logon.js:847)
13:30:02  [Timing] SteamUser.ensureConnected: cold-connect path took 779ms
13:30:22  [Timing] SteamUser.ensureConnected: grace-window wait took an additional 20002ms, connected=false
13:30:22  [WARNING] Steam client not ready, skipping library refresh
```

The refresh token read succeeds (credentials present, not missing), but the CM logon itself gets
`AccessDenied` and has to cold-reconnect. A library refresh fires during that ~20s reconnect window
(`library.ts:944`, `'Steam client not ready, skipping library refresh'`), which surfaces as
`steamSyncStatus: 'failed'`.

`resolveSteamSyncIndicator` (`librarySyncIndicator.ts`) only suppresses the generic failed banner
when `steamCredentialsMissing` is true (branch 1b, Phase 49 D-19) — that branch exists specifically
for the "credential provably missing" case and correctly does NOT apply here, since credentials
*are* present. So branch 2 fires unconditionally on any `'failed'` status, including this benign,
self-resolving reconnect race, and shows a banner whose copy ("check that Steam is reachable") and
Retry button are both actively wrong for this cause — Steam is reachable, the session is just
mid-reconnect.

## Suspected fix direction (verify, don't assume)

- Distinguish "CM reconnect in progress after a very recent credential refresh" from a genuine,
  terminal sync failure — e.g. a short grace/backoff before reporting `'failed'` to the frontend
  when the failure immediately follows a `steam verdict=cleared`/credential-restore event, or retry
  the library refresh internally once the reconnect completes rather than surfacing failure
  immediately.
- Alternatively (simpler): `resolveSteamSyncIndicator` could accept a "reconnecting" signal
  (distinct from `steamCredentialsMissing`) and route it to `'syncing'` rather than `'failed'`,
  since the real state is "briefly not ready," not "could not sync."
