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

## The abort path EXISTS and WORKS — the failure path just doesn't call it

Measured the same session, 2026-08-16, cancelling a Cyberpunk 2077 (`1091500`) install by hand:

```
(21:50:44) [INFO]:    [Steam]: SteamGame: aborting in-flight native depot download for appId 1091500
(21:50:44) [WARNING]: [DownloadManager]: Installation of 1091500 aborted!
```

`chunk-stream stats` stopped immediately (last line `@51s`), and the on-disk file count froze at 24
and stayed there. **An explicit user Cancel aborts the in-flight depot download correctly.**

So this is not a missing-abort-mechanism defect. The machinery is present and effective; the
`install did not settle — connection may be stale` failure path simply never invokes it. That should
make the fix small: route the failure path through the same abort that Cancel already uses. Contrast
the two runs directly — same build, same session, ~14 minutes apart:

| Path | Abort log line | chunk loop | Outcome |
|---|---|---|---|
| Failure (`1124300`, 21:36:40) | **absent** | ran ~5 more minutes | 4,486 orphaned files, no `.acf` |
| User Cancel (`1091500`, 21:50:44) | present | stopped same second | 24 files, frozen |

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

## Resolution

Addressed by quick task `260816-vgc` (`fix(steam): abort in-flight depot download on install
failure`), commit `d33300b62` (implementation) and `604bf99f2` (RED regression specs).

**Files changed:**
- `src/backend/downloadmanager/utils.ts`
- `src/backend/downloadmanager/__tests__/utils.test.ts`

**"What good looks like" bullets — closed:**

- "A `DownloadManager` install failure aborts the underlying depot download deterministically"
  — CLOSED. `installQueueElement`'s `finally` block now issues `callAbortController(appName)`
  for every runner, and `getGame(appName).stop(false)` for the steam runner, from the single
  convergence point all three failure shapes (watchdog trip, resolved `{status:'error'}`,
  thrown/rejected `install()`) reach.
- "The abort is verified by absence of further `chunk-stream stats` lines after the failure
  line, not by the canceller's own report" — the unit specs prove the failure path INVOKES
  the abort primitives. The absence-of-further-activity property itself is a live-only
  verification (see recipe below) — **not run as part of this quick task**.
- "`nativeInstallsInFlight` is released on the failure path so a retry is immediately
  possible" — CLOSED. `SteamGame.stop()` flips the in-flight entry's `aborted` flag; the
  unwinding `runNativeDepotDownload` run's `finally` deletes the `nativeInstallsInFlight`
  entry, so an immediate retry starts a fresh run instead of joining a tearing-down one.

**"What good looks like" bullet — deferred:**

- "Partial bytes left by an aborted run are either cleaned up or made reconcilable" — NOT
  closed. Split into
  `.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md` with an explicit,
  reasoned deferral (touches `depot.ts`'s manifest-write ordering, which Phase 23 hardened
  over ten plans; not safe to bolt onto an abort-routing fix).

**Bonus, confirmed but not code-changed:** routing the failure through the abort also makes
`downloadSteamDepots` return `'cancelled'`, so `runNativeDepotDownload`'s cancelled branch
(`games.ts` L1509-1518) calls `markSteamInstallIncomplete(appId)` — the persisted library
entry becomes incomplete/resumable rather than silently stale on a failure, not just on a
user Cancel.

**Live verification recipe (NOT run — the only proof the chunk loop actually stops):**

The fix cannot be proven by the canceller's own report. Prove it by absence.

1. Start a native Steam install and let it fail (or force a watchdog trip).
2. In the app log, find the failure line `Installation of <appId> failed with:`.
3. Assert the new `Aborting in-flight download for <appId> after terminal install failure`
   line appears within the same second, followed by `SteamGame: aborting in-flight native
   depot download for appId <appId>`.
4. Assert ZERO `[Timing] chunk-stream stats` lines for that appId appear AFTER the failure
   line. This absence is the proof — not the abort log line, which is a mutating call's
   self-report.
5. Assert the on-disk file count under `steamapps/common/<installdir>` freezes: run
   `find <dir> -type f | wc -l` twice, 60s apart, same number.
6. Assert an immediate retry starts a NEW run (a fresh `[Timing]
   runNativeDepotDownload: ensureSteamClientReady` line) rather than returning instantly.

`jest` cannot reach the properties in steps 4-6 — the unit specs prove the failure path
*invokes* the abort primitives; only this log-absence check proves the chunk loop *actually
stops*. This todo stays in `pending/` until that live gate is run.
