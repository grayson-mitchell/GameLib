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

## Not yet established

- Whether the CDN auth-token failures were self-inflicted. This session started and cancelled
  several large downloads (Baldur's Gate EE, ELEX, Resident Evil Village) and Steam may have been
  throttling. **The stall's CAUSE is unconfirmed; the failure to cancel is not affected by it.**
- Whether other `withStallTimeout` callers (non-Steam runners) leak the same way.
