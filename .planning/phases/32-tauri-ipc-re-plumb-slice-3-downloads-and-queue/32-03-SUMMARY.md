---
phase: 32-tauri-ipc-re-plumb-slice-3-downloads-and-queue
plan: 03
subsystem: docs
tags: [tauri, sidecar, ipc, download-queue, documentation, seam-map]

# Dependency graph
requires:
  - phase: 32-01
    provides: "the five queue-management channels (downloadQueueFlowRegistration.ts) and proof that progressUpdate/changedDMQueueInformation ride the existing frontend_message relay"
  - phase: 32-02
    provides: "install/updateGame re-routed onto addToQueue(), Phase 30 D-05a bypass fully retired, incl. the deviation dropping the non-steam-runner guard"
provides:
  - "32-PORTED-CHANNELS.md: the declared, verified-against-SUMMARY.md channel list for Phase 33 to start from"
  - "32-HUMAN-UAT.md: the doubly-gated deferred live-E2E item (G-30-01 + G-30-02) and the REQ-32-08 dual-build smoke as Manual-Only"
  - "SEAM.md checklist step 5 complete: Phase 32's download-queue cluster moved from deferred backlog into §1 Ported, wired-channel tally updated 21->28, Phase 30 D-05a Accepted Constraint marked closed/superseded"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase N doc-closure triad: <phase>-PORTED-CHANNELS.md (declared channel list + claim-scope note) + <phase>-HUMAN-UAT.md (deferred-UAT log) + SEAM.md §3->§1 move, mirroring the Phase 30/31 precedent"

key-files:
  created:
    - .planning/phases/32-tauri-ipc-re-plumb-slice-3-downloads-and-queue/32-PORTED-CHANNELS.md
    - .planning/phases/32-tauri-ipc-re-plumb-slice-3-downloads-and-queue/32-HUMAN-UAT.md
  modified:
    - .planning/phases/27-tauri-shell-walking-skeleton/SEAM.md

key-decisions:
  - "Doubly-gated deferred-UAT wording (D-06) deliberately does NOT reuse Phase 30/31's single-blocker framing: both G-30-01 (Tauri QR login unresponsive) and G-30-02 (install-hang, parked to Phase 33) are named together everywhere this phase's claim-scope appears, since either alone is sufficient to block the live queue E2E."
  - "The 32-02 deviation (dropping the Phase 30 CR-01 non-steam-runner guard for full Electron ipc_handler.ts parity) is documented in 32-PORTED-CHANNELS.md and SEAM.md as the actual delivered state, not the plan text's literal 'planner discretion' framing — per prior_wave_context guidance to declare what shipped, not what was originally intended."

requirements-completed: [REQ-32-06, REQ-32-07]

# Metrics
duration: ~15min active
completed: 2026-07-24
---

# Phase 32 Plan 03: Ported-Channels + Human-UAT Docs + SEAM.md Update Summary

**Ships the two doc artifacts that make Phase 32's boundary declared, not discovered: the full nine-channel `32-PORTED-CHANNELS.md` list (including the research-surfaced `changedDMQueueInformation` and the D-01 runner-guard-drop deviation) and the doubly-gated `32-HUMAN-UAT.md` deferred item — then completes SEAM.md checklist step 5 by moving the queue cluster from §3 deferred into §1 ported and marking the Phase 30 D-05a bypass boundary closed/superseded.**

## Performance

- **Duration:** ~15 min (both tasks were pure documentation edits against already-verified 32-01/32-02 delivered state)
- **Tasks:** 2 (both `type="auto"`, no TDD gate — documentation-only plan)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `32-PORTED-CHANNELS.md` declares all nine channels this phase ported/re-routed: the five queue-management channels (`getDMQueueInformation`, `removeFromDMQueue`, `pauseCurrentDownload`, `resumeCurrentDownload`, `cancelDownload`), `install`/`updateGame` (re-routed onto `addToQueue()`, replacing the Phase 30 D-05a direct bypass), and the two push channels (`progressUpdate`, `changedDMQueueInformation`) riding the existing generic relay with zero new code — each row cites its registration module/real code reached and requirement ID.
- The D-04 pause/resume nuance is stated explicitly and separately from the channel table: real behavior, implemented as abort-then-reconciled-restart (Phase 23 `reconcilePartialState`), never true in-flight suspend — never claimed as "true pause."
- The D-05 boot-time auto-resume deferral is documented in its own "Deliberately NOT ported" section, citing `main.ts:579`'s `initQueue(isStartup=true)` call as the one NOT replicated, while noting pre-`initQueue` cancelability (`downloadqueue.ts:49`'s module-scope `currentElement` seed) is preserved regardless.
- The claim-scope note names **both** G-30-01 (Tauri QR login unresponsive) and G-30-02 (install-hang, parked to Phase 33) as the doubly-gated live-E2E blockers, deliberately not reusing Phase 30/31's single-blocker wording (D-06).
- `32-HUMAN-UAT.md` logs exactly one deferred-UAT item (live queue E2E: enqueue → progress → pause/resume/cancel) marked blocked on both G-30-01 and G-30-02, plus the REQ-32-08 dual-build smoke recorded as Manual-Only per the Phase 30/31/32-01/32-02 precedent (no automated dual-build harness exists in this repo).
- `SEAM.md` gained a new `### Download-queue cluster (real, Phase 32)` subsection under §1 Ported (mirroring the existing Phase 30/31 subsections' shape), the endpoint tally paragraph was updated from "21 wired total" to "28 wired/re-routed total" citing Phase 32's contribution, and the §"Accepted Constraints" D-05a entry (the Phase 30 direct-bypass boundary explicitly delegated to "whichever future phase builds a curated queue port") is now struck through and marked **CLOSED/SUPERSEDED by Phase 32**, cross-referencing both the new §1 subsection and `32-PORTED-CHANNELS.md`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write 32-PORTED-CHANNELS.md (all channels + D-04/D-05 boundaries)** - `0455047d` (docs)
2. **Task 2: Write 32-HUMAN-UAT.md + move SEAM.md §3→§1 rows** - `69a88cca` (docs)

_Documentation-only plan (`type: execute`, no `tdd="true"` tasks) — no RED/GREEN/REFACTOR gate applies._

## Files Created/Modified

- `.planning/phases/32-tauri-ipc-re-plumb-slice-3-downloads-and-queue/32-PORTED-CHANNELS.md` (NEW) - Declared ported-channel list, mirroring `31-PORTED-CHANNELS.md`'s shape
- `.planning/phases/32-tauri-ipc-re-plumb-slice-3-downloads-and-queue/32-HUMAN-UAT.md` (NEW) - Doubly-gated deferred-UAT log, mirroring `26-HUMAN-UAT.md`'s section shape
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` (MODIFIED) - New §1 download-queue cluster subsection, updated wired-channel tally, D-05a marked closed/superseded

## Decisions Made

- **Doubly-gated wording, not reused single-blocker framing:** every claim-scope statement in both new docs and the SEAM.md edit names G-30-01 AND G-30-02 together, per the plan's own D-06 instruction not to reuse Phase 30/31's wording verbatim (each of those phases had exactly one live-E2E blocker; this phase has two, and either alone is sufficient to block verification).
- **Documented the 32-02 deviation as delivered, not as planned:** per `prior_wave_context`, both new docs and the SEAM.md edit state that the Phase 30 CR-01 non-steam-runner guard was dropped ENTIRELY (full Electron parity, all runners enqueue) rather than describing the plan text's more conservative "Steam-only or runner-generic, planner's call" framing — this matches what `32-02-SUMMARY.md` actually reports shipping.

## Deviations from Plan

None - plan executed exactly as written. Both tasks were pure documentation authoring/editing against already-verified 32-01/32-02 delivered state; no code changes, no test changes, no blocking issues encountered.

## Issues Encountered

None.

## Known Stubs

None — this plan produced only planning-documentation artifacts (`.planning/` files), no application code, no UI, no data-flow surface.

## Threat Flags

None. Per the plan's own `<threat_model>`, T-32-06 (claim-scope overstatement) and T-32-07 (undeclared `changedDMQueueInformation`) are the mitigations this plan itself delivers — both are satisfied by the claim-scope notes and the full nine-channel table. T-32-SC (package-manager installs) is not applicable; no packages were installed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 33 (or whichever future phase closes G-30-02's install-hang and/or G-30-01's Tauri QR login unresponsiveness) can re-run this phase's own deferred `32-HUMAN-UAT.md` item once both blockers are fixed — the doc names the exact re-test trigger.
- SEAM.md's Incremental-Port Checklist step 5 (§3→§1 move + re-verify dual-build) is satisfied for this phase's own channel set; the dual-build smoke itself remains Manual-Only/not run this session (no display / long-running dev server in this environment), consistent with 32-01/32-02's own carried-forward note.
- This closes Phase 32 (`tauri-ipc-re-plumb-slice-3-downloads-and-queue`) — all three plans (32-01, 32-02, 32-03) now have SUMMARY.md on disk.

---
*Phase: 32-tauri-ipc-re-plumb-slice-3-downloads-and-queue*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: .planning/phases/32-tauri-ipc-re-plumb-slice-3-downloads-and-queue/32-PORTED-CHANNELS.md
- FOUND: .planning/phases/32-tauri-ipc-re-plumb-slice-3-downloads-and-queue/32-HUMAN-UAT.md
- FOUND: .planning/phases/27-tauri-shell-walking-skeleton/SEAM.md
- FOUND commit: 0455047d (Task 1)
- FOUND commit: 69a88cca (Task 2)
