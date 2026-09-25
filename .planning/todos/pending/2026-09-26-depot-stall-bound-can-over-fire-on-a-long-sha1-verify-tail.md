---
created: 2026-09-25T21:53:43.000Z
title: "The depot run-scoped stall bound can over-fire on a long SHA1 verify tail and kill a healthy download"
area: steam-depot
severity: medium
platform: any
ready: code
source: "debug/depot-stall-bound-did-not-fire, 2026-09-26 — named there as 'residual, named not fixed' under finding W-1, and documented in situ at depot.ts:2593-2602"
files:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
---

## Problem

**This existed only inside an archived debug session, which is why it is being filed.** It is
named in `.planning/debug/resolved/depot-stall-bound-did-not-fire.md` as "residual, named not
fixed" under finding W-1, and it is documented in situ at
`src/backend/storeManagers/steam/depot.ts:2593-2602`, directly above the check it describes at
`:2610`. Nothing was tracking it.

`62f916e58` gave `StallTracker`'s 180s bound a **run-scoped** effect: `downloadDepotFiles`'
file-worker loop now samples `stallTracker.hasStalled()` at the top of `while (queue.length)` and
stops taking new jobs. The corrective `3e97cf582` then added `recordProgress()` on a successful
`downloadSingleFile` return, because four success paths complete a file without writing a chunk
byte — the directory entry (`:1532`), the symlink entry (`:1575`), the zero-byte/zero-chunk entry
(`:1621`), and the whole post-chunk tail (`:1653-1686`).

That closed the common case and left exactly one open:

> **If every worker is simultaneously inside one file's post-chunk verify tail for longer than
> `STALL_TIMEOUT_MS` (180s), the run is still misread as stalled and killed.**

The tail is a whole-file `sha1File(dest)` re-read plus `applyEDepotFileModes` and
`applyMachOExecutableFallback`. Thirty-two concurrent SHA1 re-reads of multi-GB pak files on a slow
or external disk is the shape that arms it — the debug session's own words were "not exotic".

**Why this matters now and did not before.** Before the fix, `hasStalled()` was advisory: it was
read only inside a per-chunk `catch` that a healthy file never enters, so a stale clock during a
verify tail had no effect whatsoever. Sampled unconditionally at the top of the worker loop it is
**terminal and unrecoverable** — once every worker has returned, nothing is left to reset the
clock. So the exposure is one the fix itself introduced, and what it kills is a download that is
completely healthy.

## Solution

Report forward progress from inside `sha1File` (`src/backend/storeManagers/steam/depot.ts:1136`)
so that a long verify tail counts as work being done. The debug session named this fix and
declined it as a larger change than that follow-up was entitled to make — it is not an open design
question, just unbuilt.

**This is desk work and there is a worked pattern to copy.** The W-1 regression test already in
`src/backend/storeManagers/steam/__tests__/depot.test.ts` demonstrates the technique: a 40-file
plan plus a `StallTracker` subclass on a **virtual** clock advancing 1000ms per `hasStalled()`
consult, with the window chosen to sit strictly between the consult counts of the two arms —
deterministic, not wall-clock racy. No live run, no hardware, no Steam account.

**Do not reopen** `.planning/todos/completed/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md`.
This is a follow-up to its fix, not a reversal of it: the run-scoped bound is correct and was
measured red-to-green. Guard against weakening it — the Californium case it was built for had
**zero** files complete, so any progress signal added here must be unreachable on the failure path.
