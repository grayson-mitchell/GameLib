---
created: 2026-09-16
title: "The 2026-08-27 depot-stall wedge's cause is still unidentified, both named hypotheses are off the table, and no runnable experiment has been proposed"
area: steam-depot
status: RESOLVED
resolved: 2026-09-25
resolved_by: "debug/depot-stall-bound-did-not-fire — root cause found at the desk; run-scoped no-progress bound added to depot.ts's file-worker loop"
severity: medium
platform: any
ready: code
found_by: "quick-260916-bes, 2026-09-16 — split out of 2026-08-27-stall-watchdog-leaves-the-download-running.md when that todo was closed on a title that had gone false at HEAD"
files:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/cdnAuth.ts
  - src/backend/downloadmanager/installStallWatchdog.ts
---

## What this is

This is the **residual** of
`.planning/todos/completed/2026-08-27-stall-watchdog-leaves-the-download-running.md`, which was
closed on 2026-09-16 because its title ("never cancels the download — the depot loop runs on
indefinitely") is **false at HEAD**, proven by a live gate on 2026-09-08. Read that file for the
full history; this file carries only what it did not answer.

**The parent's symptom was real and is documented, not speculative.** On 2026-08-27, `Californium`
(402060) stalled at 46%, the 8-minute watchdog tripped and declared failure, and the depot loop
then ran for **51 more minutes and 5081 CDN rotations at 0 B/s** — surviving both the terminal
failure and the user hitting Cancel. It stopped only when the app quit.

**Nobody knew why. That was the whole of this todo — and it is now answered.** See "Why this WAS
`ready: human`" below for the root cause, and "The discriminator" for the test that pins it. The
one-line version: the depot run's own 180s no-progress bound **was live and did fire**, but its
only consequence was failing ONE FILE, and the file-worker loop swallowed that and pulled the next
job. The run ground through its remaining file queue at ~132s per file per worker slot instead of
stopping. Fixed 2026-09-25.

## Why severity is `medium` and not `minor`

> **2026-09-25: `medium` is retained and is now better supported than when it was assigned.** The
> grade was originally argued from *ignorance* ("unknown cause means it is not known to be
> fixed"). It now rests on a measured defect instead: a real bug with a known-bad outcome,
> bounded blast radius (one grinding run per app session, reaped by quitting), and an existing
> workaround (quit the app) — `medium` exactly. The original argument is preserved below.

`minor` would mean "a latent trap with no live consequence". That asserts more confidence than
anyone has. A real defect was observed once with a known-bad outcome; its cause is unknown;
unknown cause means it is **not known to be fixed**. Blast radius is bounded (one orphaned loop
per app session, reaped by quitting) and a workaround exists (quit the app), which is `medium`
exactly.

It is not `major` because the mechanism the original `major` grade was assigned for — "the abort
is never signalled" — has been measured false.

## What has been ruled out — do not re-run these

| hypothesis | status | how |
|---|---|---|
| **A — registry clobber.** A restart replaces the appId's controller in `abortControllers`, stranding the first run's. | **REFUTED** | 2026-09-08 live gate: the controller was live, the abort was delivered, the loop died in the same second. The `No in-flight download to abort` WARNING was separately reproduced twice but ONLY on resolved-error paths, where `runNativeDepotDownload`'s `finally` has already deleted the controller by design. It is not clobber evidence. |
| **B — abort-blind CDN auth path.** `cdnAuth.ts` consulted no `AbortSignal`, so the empty-token rotation loop could not be cancelled. | **NEUTRALISED, never tested** | quick 260909-q2o threaded the existing signal through `getToken`. It can no longer produce the symptom *even if it was true*. No live reproduction was attempted. Neutralised is not the same as settled. |
| **Non-Steam runners leak the same way.** | **SETTLED as a finding** | F5, 2026-09-07: coverage is intermittent for the four CLI runners and absent for sideload installs, by design. This is why the `hasAbortController` gate in `trip()` is load-bearing. |
| **C — account/IP throttling.** The 2026-08-27 session had started and cancelled several large downloads (Baldur's Gate EE, ELEX, Resident Evil Village) beforehand, so Steam was throttling the account or IP and that produced the wall of empty auth tokens. | **ELIMINATED** | quick 260923-vnv, 2026-09-23, desk measurement over five preserved captures spanning three titles, four depots and three dates. `CDN auth token acquired` appears **zero** times in any capture ever preserved — there is no working baseline to have been throttled away from. The control log has all three hosts returning empty tokens at `17:46:46`, the FIRST token request of a cold-connect session with no prior cancel in it. And every response is `eresult=1` (`k_EResultOK`) with a constant `rawBodyBytes=8` body — a deliberate tokenless OK, not a rejection; a throttle would surface as a non-OK `eresult`. See the sibling's Resolution section. |

**The condition the parent blamed is a constant, not an outage.** The empty-auth-token error
(`eresult=1`, every host, both depots) was reproduced unprompted on Californium on 2026-09-07 —
and the download **ran straight through it at 7-9 MiB/s to 100% in 105 seconds**, falling back to
hosts that need no token auth. So the missing ingredient is whatever *additionally* prevented that
fallback on 2026-08-27. That is the open question, stated as precisely as it can currently be.

## Why this WAS `ready: human` — and why that rationale was wrong

> **REWRITTEN 2026-09-25 (debug/depot-stall-bound-did-not-fire). The original text of this section
> claimed "There is an open question with no proposed experiment ... Nobody should pick this up
> expecting to edit a file." That was rotten, and it is replaced rather than ticked so the bad
> rationale does not outlive the todo.**

The `ready: human` grade rested on framing the question as *"what network condition produced the
wedge?"* — which genuinely does need a live re-drive nobody could specify. But that was never the
question that mattered. **The question that mattered was answerable at the desk in one sitting,
with no Steam account, no `pf`, and no reproduction of the original conditions:**

> The depot run already had its OWN 180-second whole-run no-progress bound on 2026-08-27
> (`depot/stallTracker.ts`, landed in `33c108a0e` on **2026-07-18**, forty days before the wedge,
> and behaviourally untouched since). **Why did that bound not terminate a 51-minute, 0 B/s run?**

Nothing in this file, or in its completed parent, had ever noticed the bound existed. Once it is
noticed, the answer is a `grep`:

**`hasStalled()` was consulted at exactly ONE site** — `downloadFileChunks`' per-chunk `catch`
(`depot.ts:1448`) — whose entire power is to stop re-queuing one chunk and fail **ONE FILE**. That
per-file throw lands in `downloadDepotFiles`' per-file `catch` (`depot.ts:2577`), which pushes a
`DepotDownloadFailure` and **pulls the next job**. `failures.length` is never a loop-exit
condition anywhere (census: `grep -n 'failures.length' src/backend/storeManagers/steam/depot.ts`
→ `:1228 :2596 :2602 :2673 :2711 :2746 :3229`; `2596`/`2602` are the `FAILURE_LOG_CAP=10` logging
cap, every other hit is a POST-loop verdict; **none is inside the worker loop**).

So a genuinely dead run did not stop. It **walked its entire remaining file queue**, burning one
full `CHUNK_FETCH_ATTEMPTS` exhaustion — `8 × CHUNK_FETCH_TIMEOUT_MS(15s)` plus ~12s of backoff,
≈132s — per file per worker slot, bounded only by `TARGET_INFLIGHT_CHUNKS=32`. The bound fired the
whole time; **nothing acted on it at run scope.** The 51 minutes were not a wedge. They were a
grind.

The arithmetic corroborates: index-0 attempts = `6957 − 5081 = 1876` `fetchChunk` invocations,
mean 3.71 attempts each; solving `8x + 1(1−x) = 3.71` gives `x = 0.387`, i.e. ~726 full
exhaustions; `726 × 132s / 32 slots ≈ 2995s` against the observed **3083s**. The predicted grind
rate accounts for essentially the entire run.

**And it was never a one-off.** This file's own 2026-09-08 `pf` live gate records the last
progress advance at **07:33:46** and the depot loop still emitting stats at **07:41:41** — **475
seconds** of established zero progress, on Tauri, with the 180s bound live — dying only when the
EXTERNAL abort arrived. The gate reproduced this defect on demand and it was read as "abort works"
instead of "the self-bound still does not".

## Forcing methods already measured to FAIL — do not retry

- **`/etc/hosts` blackhole cannot stall an in-flight depot download.** It affects new DNS lookups
  only; the download already resolved and holds keep-alive connections. Measured: all six hosts
  returned `curl` exit 28 while Disco Elysium `632470` downloaded 9.7 GB to completion at full
  speed with the block active for 18 minutes.
- **Blocking BEFORE the install starts yields a terminal error, not a stall.** Plan build fetches
  manifests over the CDN and fails with `The Steam download failed.` The block must land AFTER
  plan build and DURING chunk streaming.
- **Blocking mid-download on a small title just corrupts it.** Californium is 105s end-to-end;
  the block landed near 100% and produced `A downloaded file failed verification`.
- **`SIGSTOP` on the decompress workers is unavailable.** `decompressPool.ts` uses
  `node:worker_threads`, so they are in-process — stopping them freezes the watchdog timer too.

**What DID work**, if anyone does design an experiment: `pf` packet-drop on the CDN IPs, loaded
with `block drop out quick` plus `pfctl -k` to kill existing states, verified beforehand by
listing the sidecar's own `ESTABLISHED` sockets (`lsof -nP -p <sidecar> -i TCP`) and confirming
every peer IP in use is in the block set. Use a title large enough to give a window — BATTLETECH
`637090` is 45,679 files.

## The discriminator — REPLACED 2026-09-25, and it was on the wrong axis

> **The original text proposed "a re-drive in which the wedge sits inside the empty-auth-token
> rotation loop specifically, with fallback to the non-token hosts also prevented", and admitted
> nobody had specified how to prevent that fallback. Replaced, not ticked.**

That discriminator was aimed at the **network condition**, which is (a) not the defect and (b) was
independently eliminated on 2026-09-23 as a constant rather than an outage (row C above). The real
discriminator was a **deterministic unit test**, and it is now in the repo:

`src/backend/storeManagers/steam/__tests__/depot.test.ts` →
`downloadDepotFiles › run-scoped no-progress bound (depot/stallTracker.ts)`.

A 40-file plan (deliberately more than `FILE_CONCURRENCY=32`, so the queue cannot be drained in
one pass) with an injected `StallTracker`. **Measured red before the fix:**

```
● a run with ZERO forward progress stops taking new files instead of grinding
  the rest of the queue — the 2026-08-27 non-termination
    Expected number of calls: 32
    Received number of calls: 40
```

40 = every file in the plan attempted, on a run whose forward-progress clock had been dead for ten
simulated minutes. That single number **is** the defect. Green after the fix, with a control arm
(hour-long window, healthy run) proving the new check never fires on a run that is progressing.

**What is STILL not known, stated honestly:** whether `recordProgress()` was or was not still
firing on 2026-08-27 — i.e. whether there was a sub-1%-per-13-minutes trickle behind the
`downSpeedMiBs=0.00` line. That cannot be settled from the preserved evidence (`bytes:
getFileSize(doneBytes)` is a rounded string, and the rate is a rolling one-second window, so
neither the watchdog trip nor the `0.00` strictly excludes a trickle).

**It no longer needs to be, and that is why this todo closes rather than staying open.** The fix is
correct under **both** branches:

- **No trickle** → the run-scoped bound now fires at `STALL_TIMEOUT_MS` and ends the run honestly.
- **Trickle** → the bound correctly never fires (the run IS progressing), and the separate 480s
  DownloadManager watchdog still trips and aborts, which is proven working on two paths by the
  2026-09-08 live gate.

> **CORRECTION, 2026-09-25 (TypeScript specialist review of `62f916e58`, follow-up commit).** The
> "Trickle" bullet above was true only by luck, and the sentence "the bound correctly never fires
> (the run IS progressing)" was WRONG as written. `recordProgress()` had exactly ONE call site in
> the whole repo — `depot.ts:1419`, immediately after `await fd.write(...)` — so the clock could
> only see DECOMPRESSED CHUNK BYTES, never work completed. `downloadSingleFile` finishes a planned
> file via four paths that never reach it: directory entries, symlinks, zero-byte entries, and its
> entire post-chunk tail (a whole-file `sha1File` re-read, `applyEDepotFileModes`, the Mach-O
> fallback). A run doing only that kind of work is progressing perfectly and was invisible to the
> bound. Before this todo's fix that was harmless, because `hasStalled()` was advisory — read only
> inside a per-chunk catch that a healthy file never enters. **The fix is what made it dangerous:**
> sampled unconditionally at the top of the worker loop, a stale clock is terminal and
> unrecoverable, so e.g. 32 concurrent whole-file SHA1 re-reads of multi-GB paks on a slow or
> external disk could kill a run that was completing every single file. The follow-up commit adds
> `stallTracker.recordProgress()` after a successful `downloadSingleFile` return — measured
> RED→GREEN on a plan of zero-byte entries where `fetchChunk` is provably never called — and
> rewrites the in-code comment that carried the false claim. Full detail in
> `.planning/debug/resolved/depot-stall-bound-did-not-fire.md`, section "Post-resolution".

Either way there is no longer a branch in which a Steam depot run can continue indefinitely after
being told it has failed. The unknown was not dissolved; it was made not worth knowing.

## What was changed

- `src/backend/storeManagers/steam/depot.ts` — run-scoped `stallTracker.hasStalled()` check at the
  top of `downloadDepotFiles`' file-worker loop: records ONE honest failure naming how many files
  were abandoned (one-shot latch, not one per worker) and stops taking new jobs.
  `DownloadDepotFilesOpts.stallTracker` added as an optional, caller-supplied tracker — same
  testability rationale as the existing `hosts` param — defaulting to the exact `new
  StallTracker()` that line has always constructed.
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` — the two-arm test above.

**Residual, named not fixed:** the new check stops the run taking NEW files. Files already in
flight are not interrupted; they drain through their own per-chunk guard within one ~132s
exhaustion. Interrupting them needs an abort signal `downloadDepotFiles` does not own, which is a
larger change than this fix was entitled to make.

## What is NOT in question

The abort machinery is proven on two paths by the 2026-09-08 live gate — the watchdog's own abort
in `trip()` and `installQueueElement`'s pre-existing `finally` abort, both reaching a live
controller. Nothing about cancellation *delivery* is known to be missing. Do not reopen that.

## Related

- `.planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md`
  — the sibling split out of the same parent, **CLOSED 2026-09-23** as REFUTED at the desk. Its
  Resolution section carries the five-capture census behind row C above, and corrects a trap worth
  knowing before reading any depot log: the empty-token WARNING is emitted at most once per
  depot+host per 60s (the `negativeCache` cooldown), **not** once per attempt.
