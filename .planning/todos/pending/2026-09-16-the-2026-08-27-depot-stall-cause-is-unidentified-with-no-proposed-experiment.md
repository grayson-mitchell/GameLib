---
created: 2026-09-16
title: "The 2026-08-27 depot-stall wedge's cause is still unidentified, both named hypotheses are off the table, and no runnable experiment has been proposed"
area: steam-depot
status: OPEN
severity: medium
platform: any
ready: human
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

**Nobody knows why.** That is the whole of this todo.

## Why severity is `medium` and not `minor`

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

## Why `ready: human`

There is an open question with **no proposed experiment**. Deciding whether that is worth chasing
— or whether an unreproducible one-off with both hypotheses discharged should simply be accepted
as unexplained — is a judgement call, not a code task. Nobody should pick this up expecting to
edit a file.

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

## The discriminator that would settle it

A re-drive in which the wedge sits inside the **empty-auth-token rotation loop specifically**,
with fallback to the non-token hosts also prevented. Nobody has specified how to prevent that
fallback, which is precisely why this has no runnable gate. The empty-token condition itself is
reproducible on demand for Californium, so that half is free.

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
