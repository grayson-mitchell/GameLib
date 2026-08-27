---
status: partial
phase: 32-tauri-ipc-re-plumb-slice-3-downloads-and-queue
source: [32-RESEARCH.md, 32-VALIDATION.md]
started: 2026-07-23
updated: 2026-08-22
---

## Current Test

[test 1 — UNBLOCKED 2026-08-22, not yet attempted. Both gates named below are dead; see the
CORRECTION under test 1. Run it and test 2 in the same `pnpm tauri:dev` session.]

## Tests

### 1. Live queue E2E (enqueue install → observe progress bar → pause/resume/cancel from the Tauri UI)

**Status: PENDING — unblocked 2026-08-22, not yet attempted.**

### CORRECTION 2026-08-22 — both gates are dead, and one was already dead when this was written

The original deferral (preserved below) is superseded. Neither blocker survives:

- **G-30-01 — CLOSED 2026-07-23, a misdiagnosis, one day BEFORE this file's own
  `updated:` stamp.** `30-HUMAN-UAT.md:10` retitles it *"CORRECTED 2026-07-23, was a
  misdiagnosis"*, `:68` states *"G-30-01 is closed"*, and `:103` states *"A future retest does
  not need to 'fix G-30-01' as a precondition — it can skip sign-in entirely (the session is
  already authenticated)."* There was never a QR-login defect: the Tauri build read a real
  already-authenticated session from the shared on-disk `steamConfigStore.userData` (377 owned
  games), the Steam tile correctly rendered its Logout control, and the tester clicked Logout.
  The QR tab was unreachable **by design while signed in**, not broken. Full record:
  `.planning/debug/resolved/steam-logon-button-tauri.md`.
  **This deferral therefore cited a blocker that had already been closed** — the "doubly-gated"
  framing was never true as of the day it was written.
- **G-30-02 — CLOSED, and hardware-proven.** Bounded by `30-07`, then fixed and live-gated by
  Phase 33 (`33-01` terminal-error surface, `33-02` CM-socket revalidation, `33-05` the D-13
  live-hardware gate, 2026-07-24 — REQ-33-01/02/10). Re-confirmed repeatedly since by real
  native installs under `tauri:dev` (e.g. Borderlands 2, 528s, during Phase 37's live gates).

**Additionally, `WR-01` is no longer outstanding.** `32-VERIFICATION.md` flagged the retired
Phase 30 bypass leaving a genuine Steam `status === 'error'` with a stuck badge, noting it
*"should be fixed before or alongside the Phase 33 G-30-02 install-hang fix."* It was — that is
exactly REQ-33-02 (`installQueueElement`'s finally-guard extended to push a terminal update on
Steam error, plus the failure dialog). Do not re-file it off this document.

**Surface note (34.10 nav redesign):** the queue badge is no longer in a sidebar. The live
consumers of `changedDMQueueInformation` are
`src/frontend/components/UI/NavShell/components/DownloadsRing/index.tsx:66` and
`src/frontend/screens/DownloadManager/index.tsx:39`, both via the preload method
`handleDMQueueInformation` (`src/preload/api/downloadmanager.ts:7`). Watch the DownloadsRing,
not a sidebar badge.

**Cost note:** this does not require a fresh multi-GB download. Move the title's `.acf` aside and
resume over content already on disk — a prior live gate closed KCD2 in 71.5s with zero bytes
moved. Pause/resume/cancel all execute on that path.

---

**Original deferral, preserved for the record — superseded by the correction above:**

> **Status: DEFERRED — doubly-gated by two pre-existing, out-of-scope blockers:**
>
> - **G-30-01** — Tauri QR login is unresponsive (Manage Accounts renders, but the logon button
>   never reaches the QR tab), blocking any path to a signed-in library under `tauri:dev`. Without a
>   signed-in library there is nothing to enqueue.
> - **G-30-02** — install-hang (parked to Phase 33), blocking a running install for the queue
>   channels (pause/resume/cancel/progress) to act on. Even if G-30-01 were fixed, an enqueued
>   install cannot be relied on to progress far enough to exercise pause/resume/cancel.
>
> Both blockers must be resolved before this item can move from deferred to attempted. This is a
> **doubly-gated** deferral, not the single-blocker framing Phase 30/31 used for their own deferred
> items — do not read this as "same as slice 1/2."

expected: Enqueuing an install via `install`/`updateGame` populates the queue;
`getDMQueueInformation` reflects it; the Download Manager screen renders progress via
`progressUpdate`/`changedDMQueueInformation`; `pauseCurrentDownload` aborts the in-flight download
and marks it paused; `resumeCurrentDownload` restarts it via `initQueue()`'s cheap
`reconcilePartialState` (not a true in-flight suspend — see `32-PORTED-CHANNELS.md`'s D-04 note);
`cancelDownload` removes it from the queue.

result: [pending — unblocked 2026-08-22, not yet attempted]

**Claim-scope statement (D-06):** every channel this phase ported is **"wired and unit-proven,"
NEVER "hardware-proven,"** and specifically **NOT "the live queue was exercised."** Jest coverage
(`downloadQueueFlows.test.ts`, the unmodified `downloadqueue.test.ts` contract, the existing
`depot.test.ts` throttle suite) proves registration and re-routing reach the real backend
functions. It does not prove the Download Manager screen works end-to-end under `tauri:dev`
against a real running download. ~~Re-run this test only after Phase 33 lands the install-hang fix
(G-30-02) and the QR login interaction bug (G-30-01) is fixed.~~ **Both preconditions are
discharged as of 2026-08-22 (see the CORRECTION above); this test is runnable now.** The
claim-scope statement itself stands unchanged until it is actually run.

## Manual-Only Verifications

### 2. Dual-build smoke (REQ-32-08)

expected: `npm start` (Electron) and `pnpm tauri:dev` (Tauri) both boot unchanged after every
plan in this phase — no automated dual-build harness exists in this repo (Phase 30/31 precedent,
not a new gap). Any channel still unported stays non-fatal (Invariant B) under both builds — that
is, it rejects with `UNPORTED_CHANNEL_MARKER` rather than crashing the shell.

**CORRECTED 2026-08-22 — the original expectation is STALE BY BEHAVIOUR, not just by line
number.** It read: *"Unported queue-adjacent channels (DownloadDialog channels) stay non-fatal."*
The DownloadDialog channel this named, `getInstallInfo`, **has since been ported** by plan
34.5-43 and is registered at `src/backend/sidecar/gameDetailsFlowRegistration.ts:191`. Asserting
that it still marker-rejects would now FAIL against a correct build, and "fixing" that failure
would mean un-porting a working channel. **The surviving check is Invariant B itself** — no
previously-non-fatal channel has become a crash — not a specific named channel. Do not re-derive
a DownloadDialog channel list for this item; if you want one, take it from
`.planning/IPC-PORT-INVENTORY.md`, and note that document's own ⚠ caveat that it is not exhaustive.

**Command note:** run the Tauri leg as `pnpm tauri:dev`. `tauri dev` serves a stale static bundle
and will not reflect the current tree.

result: [pending — not run; no display / long-running dev server available in the verifying
environment, same as 32-01/32-02's own carried-forward note]

## Summary

total: 2
passed: 0
issues: 0
pending: 2 (dual-build smoke; live queue E2E — unblocked 2026-08-22, not yet attempted)
skipped: 0
blocked: 0

## Gaps

**None open. Both entries struck 2026-08-22 — see the CORRECTION under test 1 for the evidence.**

- ~~**G-30-01** (pre-existing, tracked in `30-HUMAN-UAT.md`) — Tauri QR login unresponsive; blocks
  reaching a signed-in library under `tauri:dev`.~~ **CLOSED 2026-07-23** as a misdiagnosis
  (`30-HUMAN-UAT.md:10,68,103`) — one day *before* this file's original `updated:` stamp, so this
  gap was never live for a single day of this deferral.
- ~~**G-30-02** (pre-existing, parked to Phase 33) — install-hang; blocks a running install for the
  queue channels to act on.~~ **CLOSED 2026-07-24**, hardware-proven by Phase 33's `33-05` D-13
  live gate (REQ-33-01/02/10).

Neither gap originated in this phase; both were named here only because they were believed to
jointly gate this phase's own live-E2E verification (D-06). That gating premise no longer holds,
and this document should not be read as evidence that either defect is still open.
