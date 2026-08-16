---
created: 2026-08-16T09:45:00.000Z
title: "A failed Steam depot install does not cancel its own download — chunk loop keeps running and writing"
area: steam-depot
files:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/downloadmanager/downloadqueue.ts
---

## Problem

Observed live on 2026-08-16 during Phase 23's 23-07 hardware trace (Electron build, branch
`fix/steam-native-install-stability`), installing HUMANKIND (appId `1124300`):

```
(21:36:40) [ERROR]:   [DownloadManager]: Installation of 1124300 failed with: install did not settle — connection may be stale
(21:36:40) [WARNING]: [DownloadManager]: Installation of 1124300 failed!
```

**The depot chunk-stream loop did not stop.** `[Timing] chunk-stream stats` lines continued past the
reported failure through at least `@696s` (21:40:20, `percent=17%`), and the on-disk file count kept
climbing — 4,297 files were present under `steamapps/common/Humankind` well after the install had
been declared failed. The UI reported a failed install while bandwidth and disk continued to be
consumed by a worker nobody was tracking.

No `appmanifest_1124300.acf` was ever written, so the orphaned run also cannot be resumed or
reconciled through the normal path — it is invisible to every code path that keys off the `.acf`.

## Suspected trigger (inference — not investigated)

The failure timestamp coincides with a concurrent library sync on the same Steam connection:

```
(21:36:40) [INFO]: [Steam]: [Timing] SteamUser.ensureConnected: already connected (fast path, canary OK)
(21:36:41) [INFO]: [Steam]: Steam: fetched 378 owned games
(21:36:43) [INFO]: [Steam]: Steam library sync complete: 378 games
```

The "install did not settle — connection may be stale" check plausibly lost a race with the
connection canary fired by the sync. **No mechanism was confirmed.**

## Why this is not covered by existing work

Adjacent to 23-05's single-flight guard, but a **distinct shape**. 23-05 fixed *two concurrent
installs of one appId* (`nativeInstallsInFlight` was added but never checked on entry). This is *one
install whose failure path fails to cancel its own worker* — the guard 23-05 added does not abort
anything, it only prevents double entry. An install that fails after passing the guard leaves the
chunk loop running and, presumably, leaves the appId in `nativeInstallsInFlight` (which would then
also block a legitimate retry until the fail-safe cleanup fires).

## What good looks like

- A `DownloadManager` install failure aborts the underlying depot download deterministically —
  the chunk-stream loop observes the abort signal and stops within a bounded time.
- The abort is verified by *absence of further* `chunk-stream stats` lines after the failure line,
  not by the canceller's own report (a mutating call's self-report is not proof).
- `nativeInstallsInFlight` is released on the failure path so a retry is immediately possible.
- Partial bytes left by an aborted run are either cleaned up or made reconcilable — today there is no
  `.acf`, so 23-03's reconciler cannot see them.

## Provenance

Recorded in `.planning/phases/23-steam-full-ownership-install-stateflags-4/23-TRACE.md`
("Incidental defect found during run 2"). Explicitly **out of scope** for G-23-02 and for plan 23-07,
which is why it is filed here rather than closed inline.
