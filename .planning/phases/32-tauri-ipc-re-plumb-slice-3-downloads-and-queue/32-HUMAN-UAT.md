---
status: deferred
phase: 32-tauri-ipc-re-plumb-slice-3-downloads-and-queue
source: [32-RESEARCH.md, 32-VALIDATION.md]
started: 2026-07-23
updated: 2026-07-24
---

## Current Test

[deferred — doubly-gated, cannot be exercised this phase]

## Tests

### 1. Live queue E2E (enqueue install → observe progress bar → pause/resume/cancel from the Tauri UI)

**Status: DEFERRED — doubly-gated by two pre-existing, out-of-scope blockers:**

- **G-30-01** — Tauri QR login is unresponsive (Manage Accounts renders, but the logon button
  never reaches the QR tab), blocking any path to a signed-in library under `tauri:dev`. Without a
  signed-in library there is nothing to enqueue.
- **G-30-02** — install-hang (parked to Phase 33), blocking a running install for the queue
  channels (pause/resume/cancel/progress) to act on. Even if G-30-01 were fixed, an enqueued
  install cannot be relied on to progress far enough to exercise pause/resume/cancel.

Both blockers must be resolved before this item can move from deferred to attempted. This is a
**doubly-gated** deferral, not the single-blocker framing Phase 30/31 used for their own deferred
items — do not read this as "same as slice 1/2."

expected (once unblocked): Enqueuing an install via `install`/`updateGame` populates the queue;
`getDMQueueInformation` reflects it; the Download Manager screen renders progress via
`progressUpdate`/`changedDMQueueInformation`; `pauseCurrentDownload` aborts the in-flight download
and marks it paused; `resumeCurrentDownload` restarts it via `initQueue()`'s cheap
`reconcilePartialState` (not a true in-flight suspend — see `32-PORTED-CHANNELS.md`'s D-04 note);
`cancelDownload` removes it from the queue.

result: [deferred — blocked on G-30-01 + G-30-02, not attempted]

**Claim-scope statement (D-06):** every channel this phase ported is **"wired and unit-proven,"
NEVER "hardware-proven,"** and specifically **NOT "the live queue was exercised."** Jest coverage
(`downloadQueueFlows.test.ts`, the unmodified `downloadqueue.test.ts` contract, the existing
`depot.test.ts` throttle suite) proves registration and re-routing reach the real backend
functions. It does not prove the Download Manager screen works end-to-end under `tauri:dev`
against a real running download. Re-run this test only after Phase 33 lands the install-hang fix
(G-30-02) and the QR login interaction bug (G-30-01) is fixed.

## Manual-Only Verifications

### 2. Dual-build smoke (REQ-32-08)

expected: `npm start` (Electron) and `npm run tauri:dev` (Tauri) both boot unchanged after every
plan in this phase — no automated dual-build harness exists in this repo (Phase 30/31 precedent,
not a new gap). Unported queue-adjacent channels stay non-fatal (Invariant B) under both builds.

result: [pending — not run this session; no display / long-running dev server available in this
environment, same as 32-01/32-02's own carried-forward note]

## Summary

total: 2
passed: 0
issues: 0
pending: 1 (dual-build smoke)
skipped: 0
blocked: 1 (live queue E2E — doubly-gated, G-30-01 + G-30-02)

## Gaps

- **G-30-01** (pre-existing, tracked in `30-HUMAN-UAT.md`) — Tauri QR login unresponsive; blocks
  reaching a signed-in library under `tauri:dev`.
- **G-30-02** (pre-existing, parked to Phase 33) — install-hang; blocks a running install for the
  queue channels to act on.

Neither gap originates in this phase; both are named here only because they jointly gate this
phase's own live-E2E verification (D-06).
