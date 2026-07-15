---
phase: 21-steam-native-install
plan: 12
subsystem: steam-native-install-uat
tags: [steam, native-install, uat, real-machine, human-verify, must-validate, deferred]

# Dependency graph
requires:
  - phase: 21-05
    provides: streaming chunk-download loop (positional fs.write) — the
      subject of MUST-VALIDATE item A1 (10GB+ memory-bound)
  - phase: 21-06
    provides: finalizeToSteam / downloadSteamDepots recovery+finalize (1026
      write, cancel-recovery) — subject of Task 1's adoption + D-04 checks
  - phase: 21-07
    provides: install()/stop() opt-in branch + abort (D-02/D-13) — the entry
      point every UAT flow exercises
  - phase: 21-09
    provides: install-location resolution (D-08/D-09) — the target the depot
      download writes into
  - phase: 21-10
    provides: ensureSteamClientReady + startGuidedClientInstall (D-10/D-11) —
      Task 3's three deferred flows (guided install, prompt-to-launch,
      continue-to-download) fold into this plan's UAT list
  - phase: 21-11
    provides: bottle depot-download (D-15) — subject of Task 3's bottle
      adoption check (Assumption A3)
provides:
  - "21-UAT.md — the prepared real-machine test list + recording template
    covering all five MUST-VALIDATE items PLUS Plan 21-10's three deferred
    D-10/D-11/continue-to-download flows: 11 items across 4 groups, all
    PENDING, frontmatter status: partial so it surfaces in /gsd:progress and
    /gsd:audit-uat"
affects: ["/gsd:verify-work 21 (the later session that will execute the 11
  hardware UAT items and record pass/fail/divergence into 21-UAT.md)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "This plan is entirely human-verify (autonomous: false). The only
      autonomous work is assembling the UAT artifact; the three blocking
      checkpoint tasks require real hardware and were DEFERRED to a later
      /gsd:verify-work 21 session by orchestrator decision (persist &
      continue). No result is fabricated — all 11 items stay PENDING."

key-files:
  created:
    - .planning/phases/21-steam-native-install/21-UAT.md
  modified: []

key-decisions:
  - "PERSIST & CONTINUE (orchestrator decision): rather than blocking Phase 21
    completion on real-hardware access, the UAT is persisted as a status:
    partial artifact with all 11 items PENDING and run later via
    /gsd:verify-work 21. Phase CODE is complete (all automated suites green
    across Plans 01-11); only the empirical on-hardware gate is outstanding.
    This is deferral, not a pass — nothing is marked validated."
  - "The 21-UAT.md list includes Plan 21-10's three deferred flows (D-10
    guided install, D-11 prompt-to-launch, continue-to-download) as Group 4,
    per the plan's own affects-note and the orchestrator's explicit
    instruction — 21-10's Task 3 human-verify was deferred INTO this UAT so
    all Phase 21 real-machine validation happens together at end-of-phase."
  - "Group 3 (bottle adoption, Assumption A3) carries an explicit
    'capture-divergence-not-silent-pass' instruction: RESEARCH flagged D-15
    bottle adoption as inference, not tested, so a non-identical bottle
    adoption routes to a follow-up gap plan rather than being marked pass —
    matching this plan's own <verification> clause."

requirements-completed: []
requirements-partial: [SNI-01, SNI-04, SNI-08, SNI-06]

# Metrics
duration: ~15min
completed: 2026-07-16
---

# Phase 21 Plan 12: Steam Native Install — Real-Machine UAT (prep) Summary

Assembled `21-UAT.md`, the prepared real-machine test list + recording template that closes the
five MUST-VALIDATE items Phase 21 cannot resolve with unit tests (native `.acf` adoption + hard-DRM
launch + cancel-recovery, streaming-to-disk at 10GB+ scale, a real multi-depot game, bottled Windows
Steam adoption) plus the three D-10/D-11/continue-to-download flows deferred here from Plan 21-10's
Task 3 — **11 items across 4 groups, all PENDING**. This plan is entirely human-verify
(`autonomous: false`); its three blocking checkpoint tasks require a real, authenticated Steam
account (and, for the bottle item, a real macOS + CrossOver bottle) and were **DEFERRED to a later
`/gsd:verify-work 21` session** by orchestrator decision (PERSIST & CONTINUE). **No result was
fabricated or self-approved** — hardware validation was NOT performed, and every item remains
`PENDING`.

**Phase 21 CODE is complete** — all eleven code plans (21-01 through 21-11) executed with their
automated suites green (steam backend + frontend jest, `tsc --noEmit`, `eslint`). The only
outstanding work for the phase is the empirical, on-hardware UAT captured in `21-UAT.md`.

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-16
- **Tasks:** 1 of 4 executed (the autonomous UAT-assembly prep); the 3 blocking human-verify tasks deferred to `/gsd:verify-work 21`
- **Files created:** 1 (`21-UAT.md`)

## Accomplishments

- `21-UAT.md` assembled with `status: partial` frontmatter (11 total items, 11 pending, 0 passed) so it surfaces in `/gsd:progress` and `/gsd:audit-uat`
- Group 1 (Task 1 — native adoption, real Steam): 4 sub-items — 1026→4 adoption, launch-after-install, hard-DRM title (Open Question 3), cancel→1026→Steam-repair (D-04)
- Group 2 (Task 2 — streaming@scale + multi-depot): 3 sub-items — 10GB+ memory-bound (A1), byte-correctness SHA1 spot-check, real multi-depot game (A2)
- Group 3 (Task 3 — bottle adoption, macOS): bottled Windows Steam adopts the `1026` manifest identically to native (A3), with an explicit capture-divergence-not-silent-pass instruction routing any divergence to a gap plan
- Group 4 (deferred from Plan 21-10): D-10 guided native client install (consent → non-silent official installer per-OS), D-11 prompt-to-launch (banner + never authoring `libraryfolders.vdf`), continue-to-download (auto-retry once Steam is ready)
- Each item carries explicit preconditions, steps, expected result, and `_(record here)_` placeholders plus a Summary Table mapping every item to its requirement(s); the gate is marked NOT CLOSED until every row is PASS or has a captured divergence

## Task Commits

| Task | Commit | Type |
|------|--------|------|
| Prep: assemble 21-UAT.md test list (11 items, 4 groups) | `2097113b` | docs |
| Prep: status: partial frontmatter + plan close-out (this commit) | (metadata commit) | docs |

- **`2097113b`:** created `21-UAT.md` with all 11 items and recording placeholders.
- **Metadata commit (this):** added `status: partial` frontmatter to `21-UAT.md`, wrote this SUMMARY, updated STATE.md + ROADMAP.md.

The three blocking human-verify checkpoint tasks (Task 1/2/3 of 21-12-PLAN.md) produced **no commits** — they are deferred, not executed.

## Files Created/Modified

- `.planning/phases/21-steam-native-install/21-UAT.md` (new) — the real-machine UAT test list + recording template (11 items, 4 groups), `status: partial`, all PENDING

## Decisions Made

See `key-decisions` in frontmatter for full rationale on: the PERSIST & CONTINUE deferral (code-complete, empirical gate outstanding, run later via `/gsd:verify-work 21`); folding Plan 21-10's three deferred flows into Group 4; and Group 3's capture-divergence-not-silent-pass discipline for bottle adoption (A3, RESEARCH-flagged as inference).

## Deviations from Plan

**Execution-model deviation (orchestrator-directed, not a code deviation):** The plan's three tasks
are `checkpoint:human-verify gate="blocking"`. Under standard checkpoint behavior the executor stops
at the first checkpoint and returns structured state. The orchestrator's PERSIST & CONTINUE decision
directed closing the plan out with the UAT persisted (`status: partial`, all PENDING) and the phase
marked code-complete, deferring the actual hardware execution to a later `/gsd:verify-work 21`
session. No UAT result was fabricated — this is a deferral of the empirical gate, explicitly not an
approval. Recorded here for traceability.

## TDD Gate Compliance

N/A — this plan is a manual real-machine UAT plan (`type: execute`, `autonomous: false`); it adds no
production code and has no `tdd="true"` tasks.

## Deferred Verification

**All three blocking human-verify tasks (Task 1/2/3 of 21-12-PLAN.md) are DEFERRED to a later
`/gsd:verify-work 21` session.** Hardware validation was **NOT performed**; this is deferred, not
passed. The 11 items to validate on real hardware (all PENDING in `21-UAT.md`):

1. **1a** Native adoption — StateFlags 1026→4 with near-zero re-download; game shows Installed in Steam.
2. **1b** Launch after GameLib-owned install runs.
3. **1c** Confirmed hard-DRM title launches after GameLib-owned install (Open Question 3).
4. **1d** Cancel mid-download → 1026 → Steam repairs on next launch (D-04).
5. **2a** 10GB+ real game: main-process RSS stays bounded during download (Assumption A1).
6. **2b** Byte-correctness SHA1 spot-check on the largest files.
7. **2c** Real multi-depot game: correct summed total, all depots download, no collision corruption (A2).
8. **3** Bottled Windows Steam adopts the GameLib-written 1026 manifest identically to native (A3) — or capture divergence for a gap plan.
9. **4a** D-10 guided native install — consent → official installer runs non-silently (Win SteamSetup.exe / macOS steam.dmg) or Linux download page opens.
10. **4b** D-11 prompt-to-launch — "launch Steam once" banner appears; GameLib never writes libraryfolders.vdf.
11. **4c** Continue-to-download — once Steam is ready, install auto-retries and proceeds to the depot download.

## Issues Encountered

None — preparatory work only. The single risk (self-approving manual UAT) was explicitly avoided per the orchestrator's PERSIST & CONTINUE instruction.

## User Setup Required

To run the outstanding UAT later via `/gsd:verify-work 21`: a real, authenticated Steam account with
owned games (including a confirmed hard-DRM title and a real multi-depot game and a 10GB+ game), and
for Group 3 a macOS machine with a provisioned CrossOver bottle (Phase 17 guided setup). The
`enableSteamNativeInstall` opt-in must be ON for every flow.

## Known Stubs

None — `21-UAT.md` is a complete test list with real, executable steps; the PENDING markers are the
deliberate not-yet-run state, not stubs.

## Threat Flags

None — this plan introduces no new code surface. The threat register items it references (T-21-22
real-world install integrity, T-21-02 large-game memory, T-21-SC lzma decompression at scale) are
validated empirically by the deferred UAT items, not by new code in this plan.

## Next Phase Readiness

- **Phase 21 CODE is complete** (Plans 01-11 all executed, automated suites green). The empirical
  MUST-VALIDATE gate is persisted as `21-UAT.md` (`status: partial`, 11 items PENDING) and will be
  executed via `/gsd:verify-work 21`.
- No plan may claim SNI-01/SNI-04/SNI-08/SNI-06 fully complete until the 11 UAT items pass — they are
  marked `requirements-partial` here, not `requirements-completed`.
- Any bottle-adoption divergence found in item 8 (Group 3, A3) routes to a follow-up gap plan per
  this plan's `<verification>` clause.

---
*Phase: 21-steam-native-install*
*Completed (prep): 2026-07-16 — 3 blocking human-verify tasks deferred to /gsd:verify-work 21 (hardware UAT outstanding, NOT passed)*

## Self-Check: PASSED

- FOUND: `.planning/phases/21-steam-native-install/21-UAT.md`
- FOUND: `.planning/phases/21-steam-native-install/21-12-SUMMARY.md`
- FOUND commit `2097113b` (docs: assemble 21-UAT.md)
