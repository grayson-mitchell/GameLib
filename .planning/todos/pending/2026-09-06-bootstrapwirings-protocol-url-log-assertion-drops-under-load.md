---
created: 2026-09-06
title: "`bootstrapWirings` protocol-url log assertion fails ~1 in 8 full-suite runs"
source: /gsd-debug anticheat-response-frame-drop — observed during that session's post-fix measurement loops
severity: unknown
status: pending
---

# `bootstrapWirings` protocol-url log assertion fails ~1 in 8 full-suite runs

## What was observed

While measuring the fix for the `getAnticheatInfo` frame drop (debug session
`anticheat-response-frame-drop`), `bootstrapWirings.test.ts` failed in **1 of 8 runs** of
`npx jest --selectProjects Backend` — and it did so in BOTH independent 8-run loops, run
~14 hours apart on the same tree.

Failing test:

```
FAIL Backend src/backend/sidecar/__tests__/bootstrapWirings.test.ts
  ● sidecar bootstrap protocol-url wiring (Phase 34.5 gap cycle 6 plan 44, F-34.5-G6-09)
    › Test A (behaviour, real log file): deliverStartupProtocolUrl makes real LogWriter
      write [ProtocolHandler] Received line
```

The suite also emitted `Cannot log after tests are done. Did you forget to wait for something
async in your test?` in the same run.

## Why this is filed rather than dismissed

It is a **different suite** from the one that session fixed and had no bearing on that
diagnosis. But it is plausibly the **same defect class**: an assertion about REAL file I/O
(the test's own name says "real log file", "real LogWriter") sitting behind a wait that may be
a fixed delay rather than a poll. That is exactly the shape that made the `getAnticheatInfo`
frame drop intermittent — a fixed wait sized for the common case, unbounded under full-suite
CPU contention, because the completion time is set by OS thread scheduling and not by the JS
event loop.

The `getAnticheatInfo` drop survived **eight separate sightings** (34.5-05, 34.5-17, 34.5-49,
35-08, D-35-10-01, 35-18, Phase 39 deferred-items, quick 260814-r2d) — each recorded as
"pre-existing flake", none measured — before it was finally diagnosed as a real, reproducible
harness defect. This is filed now specifically so this one does not repeat that history.

Note the "Cannot log after tests are done" warning is a genuine signal here, not noise: it
means something async outlived the test, which is consistent with the same mechanism.

## Suggested next step

1. Establish a rate — repeated `npx jest --selectProjects Backend`, recording which suite fails
   each run. Confirm suite/test counts are non-trivial per run; `--selectProjects` fails open
   and a green exit from a run that selected nothing proves nothing.
2. Read Test A's wait: if it awaits a fixed `setTimeout`/`setImmediate` chain before asserting
   on the log file's contents, it is the same class, and the remedy is the same — poll until
   the expected line is present or a timeout expires, rather than assuming a fixed delay
   sufficed. See `waitForResponse()` in `src/backend/sidecar/__tests__/enrichmentFlows.test.ts`
   for the established pattern and the reasoning behind rejecting a longer fixed delay.
3. Do NOT simply lengthen a fixed timer. That was tried in the `getAnticheatInfo` case
   (`flushWithIo()`, a 20ms real tick) and measurably narrowed the window without closing it —
   a fixed timer of any length is not a valid upper bound on real I/O under arbitrary load.
