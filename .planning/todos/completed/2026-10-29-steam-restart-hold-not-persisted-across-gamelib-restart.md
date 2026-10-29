---
created: 2026-10-29
title: "D-UAT-13 follow-up: the 'Restart Steam to finish' hold is in-memory only, so restarting GameLib while the old Steam still runs brings Play (and Steam's install dialog) back"
source: .planning/debug/resolved/steam-waiting-for-restart-windows.md (open_edge)
area: steam
files:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/steamClientProcess.ts
severity: medium
platform: any
ready: code
---

The D-UAT-13 fix (128148bf3) holds a finished native install in `steam-waiting-for-restart` for as long
as the Steam client that was running at finalize is still alive. The hold, and the recorded Steam
PID(s), live in the sidecar's memory only. If the user restarts GameLib (or the sidecar restarts) while
that same Steam process is still running, nothing remembers the hold: install state is re-derived from
`appmanifest_<id>.acf` (StateFlags 4), the game shows Play, and Play opens Steam's install dialog again
because the running client never re-read the manifest.

Verified working live on Windows 2026-10-29 for the single-session case (hold at finalize, release when
the old Steam exited). This edge was left open deliberately and not exercised.

Direction to consider: persist the hold (app id plus the Steam PID(s) and their start time, so PID reuse
cannot pin it) somewhere the sidecar re-reads at boot, and re-arm `steamHold: 'holding'` for that app
when the recorded process is still the live Steam client; otherwise drop it. Alternatively derive it
from the manifest's mtime against the live Steam process start time, which needs no extra state.

Related, accepted and not part of this todo: a held game reports `installing`, so the frontend keeps
the system-sleep assertion until Steam restarts (bounded by the existing ~6 h poll cap); bottle and
bridge roots never hold; the Library tile hint and the alt-tab persistence were unit-tested but not
separately observed live.

## Resolution (quick 261029-pkp)

Chose the persisted-record approach. When the hold arms, `library.ts` stores the app id plus each Steam
PID and an opaque per-process start-time token (`steam_restart_hold` store, `steamRestartHold.ts`;
`readSteamProcessStartTokens` in `steamClientProcess.ts`). At boot `rearmPersistedSteamRestartHolds()`
re-arms the hold only while that same process (PID and start token) is still the live Steam and the
native manifest is still StateFlags 4; otherwise the record is dropped. An inconclusive probe arms
nothing and keeps the record. The record is deleted on every hold-ending path (Steam exit, Steam
rewriting the manifest, the 6 h cap, the manifest vanishing, stopInstallPolling).

The manifest-mtime alternative was rejected for provenance: a running Steam rewrites
`appmanifest_*.acf` for its own installs and updates, so "manifest newer than Steam start" cannot tell
GameLib's native handoff from Steam's own writes, and it still needs the same per-OS start-time probe.

Honest limit: unit-tested against all three platforms' probe shapes (mocked execFile); the live
cross-restart case on Windows (and macOS/Linux) has not been exercised.
