---
created: 2026-08-27
title: "The install stall watchdog reports failure but never cancels the download — the depot loop runs on indefinitely"
area: steam-depot
status: OPEN
severity: major
files:
  - src/backend/downloadmanager/installStallWatchdog.ts
  - src/backend/storeManagers/steam/depot.ts
---

## Symptom

`Californium` (402060), native depot install to `/Volumes/blank/SteamLibrary`, observed live during
the 34.13 UAT on electron. The download stalled at 46% with every CDN host returning an empty auth
token (`CdnAuthTokenCache: GetCDNAuthToken ... empty response`, `eresult=1`). The 8-minute stall
watchdog fired correctly and the UI surfaced the error:

```
(21:50:55) [ERROR]: [DownloadManager]: Installation of 402060 failed with:
                    install stalled — no progress observed for 480s (no-progress bound 8m)
(21:50:56) [WARNING]: [DownloadManager]: Installation of 402060 failed!
(21:50:56) [INFO]:    [DownloadManager]: 402060 removed from download manager.
```

**The DownloadManager side is correct** — it declares failure and releases the slot.

**The download itself was never cancelled.** Thirteen minutes after that terminal line, and after
the developer also hit Cancel in the UI, the depot loop was still emitting:

```
[Timing] chunk-stream stats @3083s: percent=46% downSpeedMiBs=0.00 diskSpeedMiBs=0.00
         totalAttempts=6957 rotations=5081
```

51 minutes elapsed, 5081 CDN rotations, 0 B/s, still running. It only stops when the app quits.

## Mechanism

> **Annotated 2026-09-07 (quick 260907-sxp, dividing sha `5623c6c28`) — this section is a correct
> statement about `withStallTimeout` IN ISOLATION but an INCOMPLETE account of the running system.
> Left unedited below for the historical record; see the corrected-mechanism section further down
> this file for the correction.**

`withStallTimeout` (`installStallWatchdog.ts:113`) races the download against the stall timer:

```ts
return await Promise.race([promise, stallPromise])
```

`trip()` calls `rejectStall(...)`, which rejects the RACE. `Promise.race` does not cancel the
losing promise — the real download promise keeps running with no abort signalled to it. The
`finally` block clears the timer and detaches the listener, but touches nothing in the download.

This is the same defect shape already recorded for `withTimeout` elsewhere in the project: the
timeout rejects the OUTER promise only, and the inner work runs on.

Corroborating evidence that an abort path exists but is not reached here — an unrelated install in
the same session logged:

```
[DownloadManager]: No in-flight download to abort for 228280 —
                   the install failed outside its abort controller's lifetime
```

## Impact

- A stalled install keeps consuming network and CPU indefinitely after the user has been told it
  failed, and after the user has cancelled.
- Cancel appears not to work, because for this path it genuinely does not.
- Repeated stalls would accumulate concurrent orphaned loops within one app session.

## Fix direction

`withStallTimeout` needs to signal cancellation to the wrapped work, not merely stop waiting on it
— an `AbortSignal` threaded into the depot download and honoured by the chunk-stream loop, so
`trip()` aborts rather than only rejects. Check whether the DownloadManager's existing abort
controller can be reused rather than introducing a second mechanism.

## Verified at HEAD (2026-09-07, quick 260907-sxp, tree 5623c6c28)

**F1 — an abort was ALREADY signalled on the stall path on 2026-08-27.** `installQueueElement`
(`downloadmanager/utils.ts`) catches the `StallError`, sets `status = 'error'`, returns — and its
`finally` then runs the `if (status === 'error')` branch (~L346-380), which does
`hasAbortController(appName)` then `callAbortController(appName)`, plus `SteamGame.stop(false)` for
`runner === 'steam'`. That branch landed in `c41684299` (2026-08-16, quick 260816-vgc) and was
gated on `hasAbortController` in `7024bc1ad` (2026-08-22, 37-05) — **both five-plus days BEFORE the
2026-08-27 live observation.** So on 2026-08-27 a trip did signal an abort, one microtask after
rejecting, and the depot loop still ran for 51 minutes. The `## Mechanism` section above is a
correct description of `withStallTimeout` in isolation — `Promise.race` really does not cancel the
losing promise — but it is an incomplete account of the running system, which had a second,
caller-side abort path already wired. That is why this section is annotated rather than rewritten:
the correction carries a dividing sha instead of quietly superseding the earlier claim.

**F2 — the abort signal IS threaded and IS honoured, so "nobody honours the signal" is also not the
explanation.** `games.ts:1651` `createAbortController(this.appId)`; `games.ts:1771` passes
`signal: controller.signal` into the depot download; `depot.ts` consults it ~50 times
(`throwIfAborted` between major steps, an abort-interruptible `delay(ms, signal)`, per-chunk
`signal?.aborted` checks, and an `opts.signal?.aborted -> outcome 'cancelled'` forcing at ~L2902).
`depot.ts` had not been touched since 2026-08-22, i.e. that machinery was live and unmodified on
2026-08-27.

**F3 — key alignment is real, ruling out a wrong-key miss for Steam.** `SteamGame`'s `appId` is its
constructor argument (`games.ts:534-539`), and `libraryManagerMap.steam.getGame(appName)`
constructs it from `appName`, so `callAbortController(appName)` and
`createAbortController(this.appId)` address the same registry key. `downloadqueue.ts:379` relies on
the same alignment.

**What 260907-sxp actually changed:** the watchdog's `trip()` now ALSO calls
`callAbortController(appName)` itself, gated on `hasAbortController`, synchronously and before it
rejects — hardening that removes `withStallTimeout`'s dependence on `installQueueElement`'s
`finally` being the ONLY caller that ever aborts on this path (a second caller would previously have
leaked outright). This is redundancy hardening, NOT a fix for the observed symptom: per F1, an abort
already fired on 2026-08-27, one microtask later than this change now fires it, and the loop still
ran for 51 minutes. Moving the abort earlier by one microtask cannot be claimed to close this todo.

**F5 — runner coverage census (settles the "other callers" question below as a finding, not an open
item).** Measured, not assumed:
- `steam`: registers under `appId` for the whole native depot run (`games.ts:1651`, deleted in
  `runNativeDepotDownload`'s own `finally` at ~L1860). Covered while installing.
- `gog`, `legendary`, `nile`, `zoom`: their install work runs as child processes through
  `runRunnerCommand` (`launcher.ts:1723`), where `abortId = options?.abortId || appName` and every
  install call site passes `abortId: this.id` / `abortId: this.appName` — i.e. the appName.
  `deleteAbortController(abortId)` runs at `launcher.ts:1857` when the command ends. So coverage is
  INTERMITTENT: present while a runner command is spawned, absent before the first one and between
  consecutive ones. An abort there kills the spawned child via `spawn`'s `signal`.
- `sideload`: `storeManagerCommon/games.ts:114/174` registers under `abortId: appName` on the
  BROWSER-GAME launch path, not on an install path. A sideload install registers no controller.
  This is why the `hasAbortController` gate in `trip()` is load-bearing, not decorative — an
  ungated `callAbortController` would emit the exact `[ERROR][Backend] Aborting not possible` false
  alarm that 37-05 removed from the sibling caller, on every sideload/CLI-gap trip.

## Narrowed hypotheses (unconfirmed)

Neither hypothesis below is established. What would discriminate them: a log capture showing
whether the `Aborting in-flight download for 402060` INFO line (or the
`No in-flight download to abort` WARNING line) appeared between the 21:50:55 ERROR and the
21:50:56 WARNING in the original session. The todo's quoted excerpt above shows neither line for
402060 itself — only for the unrelated 228280 — which is why this is undetermined rather than
answered.

**Hypothesis A — the registry entry was replaced by a restart.** `createAbortController` does
`abortControllers.set(id, controller)` — add or UPDATE. A SECOND run for the same appId therefore
REPLACES the first run's controller in the registry, and the first run's controller becomes
permanently unreachable: no `callAbortController` can ever abort it again. The todo's own session
notes say several large downloads were started and cancelled. If 402060 was started, cancelled, and
restarted, the surviving loop could belong to the FIRST run — which would survive both the watchdog
trip AND the user's Cancel, matching every observed symptom. Unconfirmed: nothing in the captured
log proves 402060 was restarted.

**Hypothesis B — the abort fired and was honoured everywhere depot.ts checks, but the wedged code
sat outside any checkpoint.** `src/backend/storeManagers/steam/depot/cdnAuth.ts` contains ZERO
occurrences of `AbortSignal` (`grep -c AbortSignal` on that file returns 0), and
`CdnAuthTokenCache.getToken(depotId, host)` (~L403) takes no signal parameter — that module is
abort-blind by construction. The 2026-08-27 stall was specifically a CDN auth-token failure loop
(`GetCDNAuthToken ... empty response`, `eresult=1`, 5081 rotations). Stated at exactly this
strength and no stronger: `cdnAuth.ts` itself never consults an abort signal; whether its CALLERS'
per-chunk/per-attempt checkpoints in `depot.ts` nonetheless bound the rotation loop despite that is
NOT established here, and establishing it was not part of this task.

## Residual

Closing this todo needs a live re-drive under genuine CDN-stall conditions, which cannot be
manufactured on demand and is out of scope for a quick task. The original observation was on the
ELECTRON shell during the 34.13 UAT; the app has since cut over to Tauri (Phase 35, 2026-08-29), so
any re-drive must be performed on the Tauri shell — an Electron-era reproduction cannot be assumed
to transfer.

## Not yet established

- Whether the CDN auth-token failures were self-inflicted. This session started and cancelled
  several large downloads (Baldur's Gate EE, ELEX, Resident Evil Village) and Steam may have been
  throttling. **The stall's CAUSE is unconfirmed; the failure to cancel is not affected by it.**
- ~~Whether other `withStallTimeout` callers (non-Steam runners) leak the same way.~~ Settled by F5
  above (2026-09-07): coverage is intermittent for the four CLI runners and absent for sideload
  installs, not a leak specific to Steam.
