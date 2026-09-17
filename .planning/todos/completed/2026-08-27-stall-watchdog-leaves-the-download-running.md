---
created: 2026-08-27
title: "The install stall watchdog reports failure but never cancels the download — the depot loop runs on indefinitely"
area: steam-depot
status: completed
severity: major
platform: any
ready: human
resolved: 2026-09-16
resolved_by: "quick-260916-bes"
resolution: "CLOSED ON A FALSE TITLE, DELIBERATELY. The download IS cancelled at HEAD (measured 2026-09-08). The two questions this file left unanswered were split into their own pending todos BEFORE the close — see the closure section at the foot of this file."
files:
  - src/backend/downloadmanager/installStallWatchdog.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/cdnAuth.ts
  - src/backend/storeManagers/steam/depot/decompress.ts
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


## LIVE GATE — 2026-09-08, quick 260908-asd: PASSED, and it settles the discriminator above

**A stall WAS manufactured on demand, contradicting this file's own Residual claim that it could
not be.** Run on the **Tauri** shell (satisfying the shell requirement below), sidecar carrying
`e08997f35`, against **BATTLETECH `637090`**, a mac-native native-depot install.

**Forcing method (third attempt; the first two measured nothing — see "Forcing methods that
failed" below).** `pf` packet-drop on the ten CDN IPs, loaded with `block drop out quick` plus
`pfctl -k` to kill existing states. Verified BEFORE blocking by listing the sidecar's own
`ESTABLISHED` sockets (`lsof -nP -p <sidecar> -i TCP`) and confirming every peer IP the download
was actually using was in the block set — 22 sockets to `23.52.70.65`, plus `203.26.79.2`,
`101.53.220.134/135`, `65.8.136.33`, `199.232.211.82`, `199.232.215.82`.

**Measured timeline.**

| Time | Observation |
|---|---|
| 07:33:31 | `chunk-stream stats @135s: percent=8% downSpeedMiBs=4.73 ... timeouts=38` |
| 07:33:46 | `@150s: percent=9% downSpeedMiBs=0.00 diskSpeedMiBs=0.00 ... timeouts=41` — last advance |
| 07:34:01 | `@165s: percent=9%` — flat, stall established |
| **07:41:41** | **watchdog trips at 480s**, and BOTH abort paths take their **INFO** branch |
| 07:41:41 | `@625s: percent=9% ... rotations=1375` — **one final line, same second** |
| 07:41:41+ | zero further stats lines; all CDN sockets torn down |
| 07:44:xx | pf restored, network reachable again — **no revival** |
| 07:45:18 | `SILENT for 180s — depot loop is genuinely dead` |

The two abort lines, verbatim:

```
(07:41:41) [INFO]: [DownloadManager]: Stall watchdog aborting in-flight download for 637090 after a trip (no progress for 480s)
(07:41:41) [INFO]: [DownloadManager]: Aborting in-flight download for 637090 after terminal install failure
```

**THIS ANSWERS THE DISCRIMINATOR QUESTION POSED ABOVE.** On the STALL path
`hasAbortController(appName)` is **TRUE** — the INFO branch fired, not the WARNING. That is
mechanically necessary and now confirmed: a stall means `install()` never settled, so
`runNativeDepotDownload`'s own `finally` (which does `deleteAbortController`) has not run, and the
controller is still registered. Both the watchdog's own new abort AND `installQueueElement`'s
pre-existing `finally` abort found and used the live controller.

**The 180s silence spans the pf restore, which is the load-bearing control.** Had the loop merely
been wedged on dropped packets rather than genuinely cancelled, restoring the network would have
revived 22 hung fetches and resumed logging. Nothing resumed. Contrast 2026-08-27: 5081 rotations
and 51 minutes of continued streaming AFTER the terminal line.

### Hypothesis A is REFUTED for the stall path

The registry-clobber theory predicted the abort would be delivered to a stranded controller while
the live run kept running. Measured: the controller was live, the abort was delivered, the loop
died in the same second. **Separately, the `No in-flight download to abort` WARNING was reproduced
twice** (2026-09-07, appId 402060, at 21:34:50 and 21:40:20) — but ONLY on **resolved-error**
paths, where `runNativeDepotDownload`'s `finally` has already deleted the controller before the
result reaches `installQueueElement`. That is by design and is exactly what `utils.ts`'s 37-05
comment predicts. It is NOT evidence of a clobber, and the original todo's citation of that warning
for 228280 should not be read as one.

### Hypothesis B is NARROWED, not settled

`cdnAuth.ts` is still abort-blind by construction. But this gate shows the enclosing `depot.ts`
checkpoints DO bound the loop for a packet-drop wedge. Whether they also bound a wedge sitting
inside the auth-token path specifically remains untested.

> **Annotated 2026-09-09 (quick 260909-q2o).** The code-side gap named in this paragraph is
> closed — see `## Code-side abort-blindness CLOSED — 2026-09-09, quick 260909-q2o` below. This
> paragraph is left as-is because it correctly describes the state as of 2026-09-08; the closure
> neutralises the hypothesis rather than settling whether it was ever the 2026-08-27 cause.

### The empty-auth-token condition is REPRODUCIBLE — and is NOT sufficient to stall

Californium `402060`, 2026-09-07 21:32-21:34, unprompted and with no network manipulation:

```
CdnAuthTokenCache: empty token field in decoded GetCDNAuthToken response
  for depot=402062 host=alibaba.cdn.steampipe.steamcontent.com eresult=1
```

Same game, same error, same `eresult=1` as the 2026-08-27 capture, across every host
(`alibaba.cdn`, `fastly.cdn`, `steampipe.akamaized.net`) and both depots (402062, 402064).
**The download ran straight through it at 7-9 MiB/s and reached 100% in 105 seconds** — it falls
back to hosts that do not require token auth. So this condition is a CONSTANT for this title, not
the one-off outage this file implies, and **it cannot by itself be the cause of the 2026-08-27
wedge.** Whatever turned it into a stall that night is still unidentified.

### Forcing methods that failed, recorded so they are not retried

- **`/etc/hosts` blackhole CANNOT stall an in-flight depot download.** It only affects NEW DNS
  lookups; the download had already resolved its hosts and holds keep-alive connections, so it
  never re-resolves. Measured: all six hosts returned `curl` **exit 28 (timed out)** while Disco
  Elysium `632470` downloaded 9.7 GB to completion at full speed with the block active for 18
  minutes. A forcing method that verifies clean and changes nothing about the thing under test —
  the [[a-pass-can-cover-an-unreachable-surface]] shape.
- **Blocking BEFORE the install starts produces a terminal error, not a stall.** Plan build fetches
  manifests over the CDN: `fetchDepotPlanEntry: couldn't get manifest for depot 402062 ...
  attempt 1/3`, then `Installation of 402060 failed with: The Steam download failed.` The block
  must land AFTER plan build and DURING chunk streaming.
- **Blocking mid-download on a small title just corrupts it.** Californium is 105s end-to-end; the
  block landed at ~100% and produced `A downloaded file failed verification`. Use a title large
  enough to give a wide window — BATTLETECH is 45,679 files.
- **`SIGSTOP` on the decompress workers is not available.** `decompressPool.ts` uses
  `node:worker_threads`, so they are in-process; stopping them would freeze the watchdog timer too.

## Code-side abort-blindness CLOSED — 2026-09-09, quick 260909-q2o

`CdnAuthTokenCache.getToken` now takes an optional third `AbortSignal`, and `fetchChunk`
(`decompress.ts`) forwards the signal it already held — the SAME signal that traces back to
`createAbortController(this.appId)` (`games.ts:1651`). No second cancellation mechanism was
introduced.

Six design decisions, one line each:
- Abort degrades `getToken` to `''` — it never throws.
- An abort never writes a `CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS` entry into `negativeCache`.
- The shared in-flight `_send` fetch is never cancelled on an aborting caller's behalf — only
  stopped being awaited by that caller.
- The `pending` single-flight entry's lifetime now tracks the fetch's own settlement, not the
  awaiting caller's, so an aborting caller can no longer strand the key for a concurrent one.
- `callGetCDNAuthToken` (the manual `_send` bypass) is deliberately left un-threaded — it is
  Steam-CM protocol plumbing, not the cancellation surface.
- The `abort` listener registered in the mid-flight path is always removed in a `finally`,
  whether the race is won by the fetch or by the abort.

**The honest size of the win.** `getToken` was already hard-bounded at
`CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS` (3000ms) per attempt. This closed a bounded latency window, one
unobserved `await` inside an otherwise abort-aware `fetchChunk` — NOT an unbounded loop. What it
actually buys is that Hypothesis B can no longer produce an orphaned loop even if it was true —
the hypothesis is **neutralised**, not tested. No live reproduction of the 2026-08-27 wedge was
attempted or achieved by this task.

**What verified it:** unit tests in `cdnAuth.test.ts` (28 tests, up from 20 at the prior commit)
and wiring tests in `depotPrimitives.test.ts` (73 tests, up from 70) — all green, plus a clean
`npx tsc --noEmit` and a green run of the wider Steam backend suite. **No live gate was run for
this change, and none is claimed.**

**Gate-hygiene note:** the original evidence cited above (`grep -c AbortSignal cdnAuth.ts` == 0)
is now a dead measurement — the file legitimately contains the string `AbortSignal` in prose
(parameter names, doc comments) regardless of whether the call site is wired. Anyone re-checking
this should grep the `decompress.ts` call-site expression instead:
`grep -q 'cdnAuth\.getToken(depotId, host, signal)' src/backend/storeManagers/steam/depot/decompress.ts`.

## Residual (rewritten 2026-09-09 — supersedes the 2026-09-08 section below)

- **Hypothesis A (registry clobber) — REFUTED** for the stall path, 2026-09-08 live gate.
- **Hypothesis B (abort-blind CDN auth path) — NEUTRALISED in code, 2026-09-09.** It was never
  directly observed as the 2026-08-27 cause, and this task made no attempt to observe it live. It
  can no longer produce the symptom regardless.
- **What is genuinely left:** the 2026-08-27 wedge's cause is STILL unidentified. Both named
  hypotheses are now off the table (one refuted, one neutralised), and no one has specified a
  runnable gate for what remains. There is an open question with no proposed experiment — which
  is precisely why the decision to close or keep this todo is the operator's, not a code task.
- The abort machinery itself is proven on two paths by the 2026-09-08 live gate (watchdog-trip
  abort and `installQueueElement`'s pre-existing finally-abort, both hitting a live controller),
  and nothing further about cancellation delivery is known to be missing.

## Residual (rewritten 2026-09-08 — SUPERSEDED 2026-09-09 by the section above — left for the record)

**What the gate proves:** at HEAD, on the Tauri shell, a stalled native depot install IS aborted by
the watchdog and the depot loop DOES stop promptly, with the abort delivered to a live controller.
The redundancy shipped by 260907-sxp is real and both paths fire.

**What remains unproven, and why this todo stays OPEN:** whether the 2026-08-27 run had a THIRD
cause not reachable by a packet-drop wedge. This gate reproduced *a* stall, not *the* stall. The
discharge condition is now narrower and better specified than "genuine CDN-stall conditions": a
re-drive in which the wedge sits inside the **empty-auth-token rotation loop** specifically — the
one code path measured here to be abort-blind (`cdnAuth.ts`, zero `AbortSignal` occurrences) and
not exercised by dropping packets at the socket layer. Since the empty-token condition is now known
to be reproducible on demand for Californium, the missing ingredient is whatever additionally
prevented fallback to the non-token hosts that night.

**Annotated 2026-09-09 (quick 260909-q2o):** the "one code path measured here to be abort-blind"
clause above is now stale — that path is no longer abort-blind, see the 2026-09-09 Residual above.
## Residual (SUPERSEDED 2026-09-08 by the gate section above — left for the record)

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

## CLOSED — 2026-09-16, quick 260916-bes

**This file is closed because its TITLE is false at HEAD, not because the work it describes is
finished.** Read that sentence before citing this closure for anything.

### What the title claims, and what is true

The title says the watchdog "never cancels the download" and "the depot loop runs on
indefinitely". On the **2026-09-08 live gate** (Tauri shell, BATTLETECH `637090`, stall forced by
`pf` packet-drop on the in-use CDN IPs) the watchdog tripped at 480s, **both** abort paths took
their INFO branch against a live controller, the depot loop emitted one final stats line in the
same second and then nothing, and it did **not revive** when the network was restored three
minutes later. Contrast the observation this file was opened for: 5081 rotations and 51 minutes of
continued streaming after the terminal line.

A `major` todo whose title asserts a defect that provably does not exist at HEAD costs more than
it carries. That is the whole justification for the close.

### What shipped, and where to verify it

| quick | change | verify at HEAD |
|---|---|---|
| `260907-sxp` | `trip()` calls `callAbortController(appName)` itself, gated on `hasAbortController`, synchronously and BEFORE it rejects | `src/backend/downloadmanager/installStallWatchdog.ts:101-107` |
| `260908-asd` | the live gate above; refuted Hypothesis A | this file's `LIVE GATE` section |
| `260909-q2o` | `AbortSignal` threaded through `CdnAuthTokenCache.getToken`; neutralised Hypothesis B | `cdnAuth.ts:441` and `awaitOrAbort` at `:503`; call-site check is `grep -q 'cdnAuth\.getToken(depotId, host, signal)' src/backend/storeManagers/steam/depot/decompress.ts` |

### What was NOT resolved, and where it went

**The 2026-08-27 wedge's cause is still unidentified.** Both named hypotheses are off the table —
A refuted, B neutralised-but-never-tested — and no runnable experiment has been proposed for a
third. Closing this file does not answer that, and must not be read as answering it.

Both surviving questions were written to `pending/` **before** this move, so the close discards
nothing:

- `.planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md`
  — `severity: medium`, `ready: human`. Carries the refuted/neutralised table, the four forcing
  methods already measured to fail, and the `pf` method that worked.
- `.planning/todos/pending/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md`
  — `severity: minor`, `ready: live-gate`. The never-tested throttling question from the
  `Not yet established` section below.

The third item in `Not yet established` — whether other `withStallTimeout` callers leak the same
way — is **not** a survivor and got no file: F5 settled it on 2026-09-07 as a measured finding, and
it is already struck through below.

### Gate hygiene for anyone auditing this later

This file is now under `completed/`, which `todo-frontmatter-gate.py` **deliberately does not
scan**. Its `severity`/`platform`/`ready` keys are left intact for the record, but nothing checks
them from here on. The `severity: major` it retains describes the grade the defect was filed
under in August, not a live assessment — the residual carries `medium`, with its reasoning written
out in that file.
