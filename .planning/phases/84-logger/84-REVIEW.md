---
phase: 84-logger
reviewed: 2026-11-22T04:52:44Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - src/backend/logger/index.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
  necessity: 0
status: clean
---

# Phase 84: Code Review Report (round 7)

**Reviewed:** 2026-11-22T04:52:44Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** clean

## Summary

Round 7 covers one commit: 53a3418d8 (the IN-15 fix). It rewords the `logErrorSettled` doc comment in
`src/backend/logger/index.ts:66-72`. `forwarder.ts`, `sidecar/processGuards.ts` and
`sidecar/bootstrap.ts:1535-1544` were read only, to check what the doc claims. Nothing else in the tree was
reviewed, and no source file was edited.

**Scope of the change.** `git show 53a3418d8 -U0` changes only `index.ts`: 5 lines added and 3 removed. Every
changed line is a ` *` JSDoc line, and no code token changed. `index.ts` has no uncommitted changes.
`npx prettier --check src/backend/logger/index.ts` is clean.

**Case 1: a target writer's link that never settles (`trackLogSettle`).** The doc is accurate.

- A writer's held link is registered in `#writerLinks` (`forwarder.ts:342-348`) and is not on the general
  chain.
- So `logErrorSettled` → `logGeneral` → `logLine({ kind: 'general' })` finds no general tail. It calls
  `emit` → `enqueue` → `#schedule` at once (`forwarder.ts:316-319`, `:387`).
- The `LOG_BATCH_TICK_MS = 50` timer (`:48`, `:549-562`) pumps the entry to the transport.
- Meanwhile `flush` stays in `#settleChains` (`:458-479`) until the 2 s deadline. The guard's 1.5 s cap
  (`processGuards.ts:102`, `:354`) wins first, so `flush` never reaches the transport wait
  (`:436-448`). The fatal entry therefore reaches stdout on the tick, and its write callback is never
  awaited. That is what the doc says.

**Case 2: a general-log Promise message that never settles.** The doc is accurate.

- `#chains.get('general')` has a tail, so the fatal line is chained behind it through
  `(tail).then(() => body).then(emit, ...)` (`forwarder.ts:320-327`).
- `emit` never runs, so the line is never enqueued, no tick can send it, and it never reaches stdout.
- This matches the round-6 scratch probe (no transport write by the 1,500 ms cap).

The new sentence is the IN-15 fix. It says the fatal entry is lost, and the old wording had said it was
delivered.

**The rest of the paragraph still holds.** `trackLogSettle` is named correctly, and it is the export that
feeds `#writerLinks` (`index.ts:129-131`, `targetWriter.ts:138`). The IN-14 and IN-15 cross-references sit
on the sentences they belong to. The paragraphs around it were not changed. No fixed item from rounds 1 to 6
is regressed: no code changed.

All reviewed files meet quality standards. No issues found.

---

_Reviewed: 2026-11-22T04:52:44Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
