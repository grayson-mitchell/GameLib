---
phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
plan: 04
subsystem: infra
tags: [tauri, sidecar, ipc, seam-doc, validation, human-uat, known-defect]

# Dependency graph
requires:
  - phase: 30-01-steam-qr-login-sidecar-port
    provides: "checkSteamInstalled/steamStartQR/steamPollQR channel registration to enumerate and declare"
  - phase: 30-02-install-slice
    provides: "install/uninstall/updateGame/checkGameUpdates/listSteamLibraryTargets/gameStatusUpdate channel registration to enumerate and declare"
  - phase: 30-03-native-dialog
    provides: "dialog_open rustInvoke channel and logged notify() no-op to enumerate and declare"
provides:
  - "30-PORTED-CHANNELS.md — the enumerated declared ported-channel list Phase 31 starts from (REQ-30-08)"
  - "SEAM.md §1/§3/Accepted Constraints updated: Login row closed for the QR branch, dialog row narrowed, D-03/D-05a/D-05b recorded, unported-endpoint count refreshed to ~208 of 220"
  - "30-HUMAN-UAT.md — G-30-01, a known defect (Steam QR login logon button unresponsive under Tauri), not merely a deferred item"
  - "30-VALIDATION.md finalized: status complete, Per-Task Verification Map filled from real results, Approval recorded as partial-pass with one known open defect"
affects: [31-settings-config-cluster, 32-download-manager-queue, any-future-qr-login-debug-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Claim-scope note pattern: a channel being registered + non-fatal (UNPORTED_CHANNEL_MARKER no longer firing) is a distinct, weaker claim than 'the UI flow using it works' — both 30-PORTED-CHANNELS.md and SEAM.md now carry this distinction explicitly after G-30-01 showed the gap between the two in practice"
    - "Gap-ID convention for phase-native defects discovered during a plan's own human checkpoint: G-{phase}-{seq}, consistent with Phase 23's G-23-01/G-23-02"

key-files:
  created:
    - .planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-PORTED-CHANNELS.md
    - .planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-HUMAN-UAT.md
  modified:
    - .planning/phases/27-tauri-shell-walking-skeleton/SEAM.md
    - .planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-VALIDATION.md

key-decisions:
  - "Task 3's checkpoint result is recorded as a split PASS/FAIL (3 of 4 conditions), not rounded up to an approval or down to a full failure — the additive/reversible invariant (no regression to either build) is real and human-verified, and is kept separate from the QR login UI defect, which is also real and human-verified"
  - "G-30-01 is filed as a known defect with a reproduction, not left as a 'deferred, unproven' item — 'known-broken' and 'not yet proven' are different claims, and conflating them would have been the same discipline failure REQ-30-03 exists to prevent, just in the opposite direction (understating a problem instead of overstating a proof)"
  - "The install/uninstall E2E (30-02) is treated as unreached-as-a-consequence-of-G-30-01, not as an independent second gap — every 30-02 acceptance criterion requires a signed-in, populated library, and the QR login button defect blocks that precondition"
  - "The hypothesis that the unresponsive logon button depends on some OTHER (non-QR-channel) code path is recorded explicitly labelled as an untested hypothesis for a future debugger, not investigated — fixing G-30-01 is out of this plan's scope"

patterns-established:
  - "Any *-HUMAN-UAT.md item that is later human-tested and found broken (rather than confirmed working) must be re-titled from a deferred item to a known defect with a gap ID and reproduction steps, not left worded as still-deferred"

requirements-completed: [REQ-30-02, REQ-30-03, REQ-30-04, REQ-30-08, REQ-30-09]

# Metrics
duration: ~25min active work (Tasks 1-2, plus documentation correction after checkpoint resolution); Task 3's own human-verify checkpoint spanned a multi-hour pause before resolution
completed: 2026-07-23
---

# Phase 30 Plan 04: SEAM Documentation Close-out + Both-Builds Checkpoint (Partial Pass) Summary

**Declared the phase's 9 newly-ported sidecar channels in an enumerated list, closed out SEAM.md's Login/dialog deferred-backlog rows and Accepted Constraints, and ran the both-builds smoke checkpoint — which came back a PARTIAL pass: the additive/reversible invariant holds (human-verified), but the Steam QR login flow is now a known, reproducible defect (G-30-01) under Tauri, not merely unproven.**

## Performance

- **Tasks:** 3 (2 auto + 1 checkpoint)
- **Task 1/2 active duration:** ~9 min (documentation authoring)
- **Task 3:** a blocking human-verify checkpoint; automation (sequential `npm start` / `npm run tauri:dev` smoke runs, log capture) completed promptly, but the checkpoint itself paused for a multi-hour span before the coordinator returned the human's observed result
- **Files modified:** 4 (2 created: `30-PORTED-CHANNELS.md`, `30-HUMAN-UAT.md`; 2 modified: `SEAM.md`, `30-VALIDATION.md`)

## Accomplishments

- `30-PORTED-CHANNELS.md` enumerates exactly the 9 sidecar channels this phase ported
  (`checkSteamInstalled`/`steamStartQR`/`steamPollQR`/`install`/`uninstall`/`updateGame`/
  `checkGameUpdates`/`listSteamLibraryTargets`/`gameStatusUpdate`) plus the deliberately-unported
  set with reasons — the artifact Phase 31 starts from (REQ-30-08).
- `SEAM.md` §1 gained a new "Steam QR login + native install slice (real, Phase 30)" subsection;
  §3's Login row closed for the QR branch (credential/guard/logout branches stay deferred per
  D-02) and the `dialog` row narrowed to open-directory-ported/rest-deferred; the unported-endpoint
  count refreshed from ~217 to ~208 of 220; Accepted Constraints gained D-03 (two-token
  divergence), D-05a (install bypass, explicitly noting Phase 32 inherits the boundary), and
  D-05b/D-12 (runner-generic reuse). The Load-Bearing Invariants section was verified untouched by
  diff after every edit in this plan.
- Ran the both-builds smoke checkpoint (Task 3) with real automation: sequential `npm start` and
  `npm run tauri:dev` runs (after correcting my own initial mistake of running them concurrently —
  see Deviations), capturing sidecar stderr and Rust shell stdout verbatim. No `is not a
  constructor` error appeared in either build; the sidecar signalled READY cleanly both times.
- **The checkpoint's human-observed result was a split, not a clean pass:** 3 of 4 conditions
  PASS (window painted; no constructor error; the three newly-ported auth/library channels no
  longer emit `UNPORTED_CHANNEL_MARKER` while a deliberately-unported channel still does) — these
  prove the additive/reversible invariant (REQ-30-09) and no-regression claim hold. The 4th
  condition FAILS: the Steam login screen's Manage Accounts UI renders, but its logon button is
  unresponsive, so the QR tab is never reached. This is filed as **G-30-01**, a known defect with
  a reproduction — not a "still deferred, still unproven" item.
- Because the install/uninstall E2E (30-02) is only reachable through a signed-in, populated
  library, G-30-01 blocks it too — recorded as a direct consequence, not a second, independent gap.
- `30-VALIDATION.md` finalized: `status: complete`, every Per-Task Verification Map row filled from
  real results (all green for 30-01/30-02/30-03 and this plan's own Task 1/2; Task 3 marked
  PARTIAL with the exact split above), and Approval changed from "planned" to "partial-pass, with
  one known open defect."

## Task Commits

Each task was committed atomically:

1. **Task 1: Ship the enumerated ported-channel list and update SEAM.md** — `6faab6ee` (docs)
2. **Task 2: Write the single deferred UAT item and finalize 30-VALIDATION.md** — `89b7421e` (docs)
3. **Task 3 checkpoint resolution — record the partial-pass result and file G-30-01** — `cd0c24d9` (docs)

## Files Created/Modified

- `.planning/phases/30-.../30-PORTED-CHANNELS.md` — new: enumerated ported/not-ported channel
  table, with a claim-scope note (added after Task 3) distinguishing "registered and non-fatal"
  from "the UI flow works"
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` — §1 new Phase 30 subsection (updated
  after Task 3 to name G-30-01 explicitly), §3 Login/dialog rows narrowed, Accepted Constraints
  gained D-03/D-05a/D-05b, unported-endpoint count refreshed
- `.planning/phases/30-.../30-HUMAN-UAT.md` — new: originally written as a single deferred item
  (G-30-01, live QR scan gating the install E2E), then rewritten after the Task 3 checkpoint
  resolved as a **known defect** with the exact human-observed split, a reproduction, and an
  explicitly-labelled untested hypothesis for a future debugger
- `.planning/phases/30-.../30-VALIDATION.md` — `status: complete`, Per-Task Verification Map
  filled from real results, Approval rewritten as partial-pass

## Decisions Made

- Recorded Task 3's result as an honest split (3/4 PASS, 1/4 FAIL) rather than rounding either
  direction — the additive/reversible invariant is real and separable from the QR login defect.
- Treated G-30-01 as a **known defect**, not a re-deferred item — "known-broken" is strictly worse
  than "unproven," and REQ-30-03's claim-discipline requirement applies symmetrically: neither
  overstating proof nor understating a confirmed break is acceptable.
- Did not investigate or attempt to fix the logon-button defect — out of this plan's scope per the
  coordinator's explicit instruction. Recorded the "some other channel, not the QR channels
  themselves" theory as a clearly labelled hypothesis for whoever debugs this next, since the QR
  channels are proven silent (condition 4) and therefore are not the most likely culprit.
- Corrected `30-PORTED-CHANNELS.md` and `SEAM.md`'s Phase 30 subsection so neither can be
  misread as claiming the QR login flow works end-to-end — channel registration and UI-flow
  correctness are now explicitly distinguished in both documents.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ran `npm start` and `npm run tauri:dev` sequentially after an initial
concurrent run raced on `build/main`**
- **Found during:** Task 3's own automation (the both-builds smoke pass)
- **Issue:** I initially launched both dev servers concurrently. Both write to the same
  `build/main` output directory (SEAM.md's own documented D-07 cross-process-write-clobber
  constraint), and the race produced a spurious `Cannot find module './chunks/index-D9pQGYMu.js'`
  error in the Electron build — a false signal, not a real regression.
- **Fix:** Killed both processes, cleared `build/`, and re-ran `npm start` and
  `npm run tauri:dev` sequentially (with a clean `build/` between them). Both then launched
  without error.
- **Files modified:** None (no source change — a test-methodology correction only).
- **Verification:** Both sequential runs captured clean; the sequential result is what is recorded
  in `30-VALIDATION.md` and this summary.
- **Not logged as a Phase 30 regression** per the coordinator's explicit process note.

**2. [Process, not a plan deviation] Killed a stray, unrelated `gamelib-shell`/`tauri dev` process
pair found running from an earlier, unrelated session (~10:40PM) before starting the clean
sequential runs.** No files affected; noted for completeness only.

---

**Total deviations:** 1 auto-fixed (methodology correction, not a code fix) + 1 process note.
**Impact on plan:** No code changed by this plan at all — 30-04 is purely a documentation-close-out
and verification plan. The one real, load-bearing finding — G-30-01 — is a genuine product defect
discovered by the plan's own verification step, not a deviation from how the plan was executed.

## Issues Encountered

- **G-30-01 (Steam QR login logon button unresponsive under Tauri) — OPEN, filed in
  `30-HUMAN-UAT.md`.** Reproduction: `npm run tauri:dev` → reach the Steam login screen → Manage
  Accounts renders → click the logon button → no response, QR tab never reached. Untested
  hypothesis (not investigated here): since the three ported Steam auth channels are confirmed
  silent (no `UNPORTED_CHANNEL_MARKER` warning), the button's own click-handler path likely depends
  on some other channel that is still unported or erroring, not the QR channels this phase ported.
- Carried forward from `30-02-SUMMARY.md`, still open and out of scope for this plan: 2
  pre-existing eslint errors (`@typescript-eslint/no-unnecessary-type-assertion`) in
  `src/backend/sidecar/handlers.ts`, logged in `.planning/phases/30-.../deferred-items.md`,
  confirmed to predate Plan 30-02's own diff.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 30 exits with one known open defect (G-30-01) and is NOT fully validated end-to-end.**
  The additive/reversible invariant holds (both builds start clean, no regression), and every
  channel's registration + jest coverage is proven, but the Steam QR login UI flow under Tauri is
  known-broken at the interaction layer, and the install/uninstall E2E it gates was not reached
  this session as a direct consequence.
- Phase 31 (settings/config cluster) can still start from `30-PORTED-CHANNELS.md`'s declared list
  — the channel registrations themselves are real and unaffected by G-30-01.
- Whoever picks up G-30-01 should start from the untested hypothesis above (a non-QR channel
  likely gates the click handler) rather than re-suspecting the three QR channels this phase
  proved silent.
- Claim level for this entire phase, unchanged by this plan's own scope: **wired and
  unit-proven**, never "hardware-proven" — and now, additionally, the QR login UI flow
  specifically is **known-broken**, which is a stronger (worse) statement than "unproven."

---
*Phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check*
*Completed: 2026-07-23*

## Self-Check: PASSED

- FOUND: .planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-PORTED-CHANNELS.md
- FOUND: .planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-HUMAN-UAT.md
- FOUND: .planning/phases/27-tauri-shell-walking-skeleton/SEAM.md
- FOUND: .planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-VALIDATION.md
- FOUND commit: 6faab6ee
- FOUND commit: 89b7421e
- FOUND commit: cd0c24d9
