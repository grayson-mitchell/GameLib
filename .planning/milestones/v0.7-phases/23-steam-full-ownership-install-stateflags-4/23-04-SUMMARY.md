---
phase: 23-steam-full-ownership-install-stateflags-4
plan: 04
subsystem: testing
tags: [steam, stateflags, uat, hardware-gate, macos, denuvo, multi-depot, acf]

# Dependency graph
requires:
  - phase: 23-03
    provides: the complete StateFlags=4 native-install path (file-mode fidelity from 23-01, the canWriteFullOwnership completeness gate + buildid threading from 23-02, and sha1-gated resume/reconciliation from 23-03) — this plan is the real-hardware validation gate over all three
provides:
  - "23-UAT.md — the D-07 pre-ship hardware validation record: three gates (multi-depot, hard-DRM, interrupt-resume), each with preconditions, exact steps, expected result, inspection tip, and a result box, in the 21-UAT.md format"
  - "Gate 1 (MULTI-DEPOT) hardware result: PASS on real macOS 2026-07-19 — Cyberpunk 2077 (1091500) wrote StateFlags=4, Steam adopted the multi-depot install with no verify pass and no re-download, and it launched"
  - "Gate 2 (HARD-DRM) hardware result: CONDITIONAL PASS 2026-07-21 — HUMANKIND (1124300, Denuvo) installed to StateFlags=4 and launched to main menu, proving the DRM hypothesis, but only after a manual chmod +x"
  - "Two documented blocking gaps that became the phase's gap-closure work-list: G-23-01 (Blocked depot key aborts the whole install) and G-23-02 (native install applies no execute bits)"
affects: [23-05, 23-06, 23-07, 23-08, 23-09, 23-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hardware-gate UAT documents record the failure branch as a first-class outcome: a gate whose hypothesis is proven but whose flow needed a manual workaround is recorded as a CONDITIONAL PASS with a named blocker gap, never as an unqualified PASS"
    - "Gate results are inspected via .planning/spikes/003-stateflags4-full-ownership/inspect-acf.mjs against the written appmanifest_{appId}.acf rather than trusting Steam's UI, so StateFlags/BytesToDownload/SizeOnDisk/buildid consistency is read directly"

key-files:
  created:
    - .planning/phases/23-steam-full-ownership-install-stateflags-4/23-UAT.md
  modified: []

key-decisions:
  - "Task 2 closed via its own second acceptance branch ('OR failures documented for gap closure') rather than the all-PASS branch — Gate 1 PASS, Gate 2 CONDITIONAL PASS, Gate 3 PENDING, with both failures documented as structured gap entries (G-23-01, G-23-02) in 23-UAT.md's ## Gaps block"
  - "The outstanding gate work (Gate 2 clean re-run without the manual chmod, and Gate 3's first run) is NOT owned by this plan — it transfers to gap-closure plan 23-10, which was authored against these documented gaps in commit 1555d29ec"
  - "Windows/Linux coverage explicitly deferred, not dropped (per D-07 in 23-CONTEXT.md) — 23-UAT.md states this in-document so a later reader cannot mistake macOS-only scope for full OS coverage"
  - "Gate 1's launch half is recorded as trustworthy-with-an-open-question: 23-TRACE.md later established that it was never determined whether that launch was a GameLib cold launch or Steam-UI-mediated (which would re-apply modes), so REQ-23-07 does not rest on it alone"

requirements-completed: []  # REQ-23-07 remains OPEN. This plan authored and ran the D-07 gate, but the requirement only closes when Gate 2 re-runs clean and Gate 3 passes — both owned by plan 23-10.

# Metrics
duration: ~15min (Task 1 authoring); Gates 1-2 run on hardware across 2026-07-19 / 2026-07-21
completed: 2026-07-21
---

# Phase 23 Plan 04: D-07 Real-Hardware Validation Gate Summary

**Authored `23-UAT.md` (three D-07 hardware gates in the 21-UAT.md format) and ran it on real macOS: Gate 1 multi-depot PASS, Gate 2 Denuvo CONDITIONAL PASS — proving Steam trusts a GameLib-authored `StateFlags=4` and that hard-DRM launches under it, while surfacing the two blocking gaps (G-23-01, G-23-02) that became the phase's entire gap-closure work-list.**

## Performance

- **Duration:** ~15 min (Task 1 authoring, 2026-07-17); Task 2 gates run on hardware 2026-07-19 and 2026-07-21
- **Tasks:** 1 auto (Task 1) complete + Task 2 human-verify checkpoint closed via its documented-failures branch
- **Files modified:** 1 (1 created, 0 modified)

## Accomplishments

- **`23-UAT.md` authored** with three numbered D-07 gates — MULTI-DEPOT, HARD-DRM, INTERRUPT-RESUME — each carrying preconditions, exact steps, expected result, an `inspect-acf.mjs` inspection tip, and a result box. macOS-first scope stated in-document; Windows/Linux recorded as a deferred follow-up rather than silently omitted. No `yarn vitest` command carried over from `23-VALIDATION.md`'s known error.
- **Gate 1 (MULTI-DEPOT) PASS on real macOS hardware, 2026-07-19.** Cyberpunk 2077 (appId 1091500) installed via the native path: the written `appmanifest_1091500.acf` carried `StateFlags=4`, Steam showed the game Ready with no verify pass and no re-download across its three depots, and it launched. This is the load-bearing proof that Steam actually trusts a GameLib-authored `4` — the core premise of the whole phase, and the reversal of the pre-Phase-23 "write 1026, never 4" constraint.
- **Gate 2 (HARD-DRM) CONDITIONAL PASS, 2026-07-21.** HUMANKIND (appId 1124300, Denuvo) installed to `StateFlags=4` with no verify/re-download and **launched to main menu** — the DRM hypothesis is proven, closing spike-001's outstanding DRM caveat. The launch, however, only succeeded after a manual `chmod +x`.
- **Two blocking gaps documented as structured YAML entries**, each with truth, reason, severity, surfaced-by, artifacts, decisive diagnostic, and what's missing — the format that let gap-closure plans 23-06..23-10 be authored directly against them.

## Task Commits

1. **Task 1: Author 23-UAT.md with the three D-07 hardware gates** — `c1dc0fe60` (docs), 2026-07-17
2. **Task 2: Execute the three D-07 real-hardware gates (macOS)** — human-verify checkpoint; results recorded across:
   - `e05250f9c` (docs) — in-progress status awaiting the D-07 human-verify checkpoint
   - `b7ebf7e2a` (docs) — Gate 1 multi-depot `StateFlags=4` PASS on real macOS hardware (2026-07-19)
   - Gate 2's CONDITIONAL PASS + both gap entries recorded in `23-UAT.md` (last updated 2026-07-21)

**Plan metadata:** this summary (retroactive close-out, 2026-08-14 — see "Issues Encountered")

## Files Created/Modified

- `.planning/phases/23-steam-full-ownership-install-stateflags-4/23-UAT.md` — the D-07 hardware validation record: three gates, their results, the summary table, and the `## Gaps` block carrying G-23-01 and G-23-02

## Decisions Made

- **Task 2 closed via its documented-failures branch, not the all-PASS branch.** The task's own acceptance criterion reads *"All three gates recorded PASS in 23-UAT.md, **OR** failures documented for gap closure."* Gate 1 passed, Gate 2 passed conditionally, Gate 3 was never reached — and both failures were documented as structured gap entries. The plan is therefore complete on its own terms; the requirement it serves is not.
- **The outstanding gate work transfers to 23-10, it is not re-owned here.** Gate 2's clean re-run (no manual chmod) and Gate 3's first run are explicit `must_haves` of gap-closure plan 23-10, authored in `1555d29ec`. Re-running them under 23-04 would duplicate that plan's blocking human gates.
- **Gate 2's conditional status was recorded honestly rather than rounded up.** The Denuvo hypothesis genuinely passed; the install flow genuinely did not. Recording it as an unqualified PASS would have concealed a blocker that makes every native macOS game unlaunchable.

## Deviations from Plan

None — plan executed as written. Task 1 produced the artifact specified; Task 2's checkpoint resolved through the second of its two documented acceptance branches.

## Issues Encountered

- **G-23-02 (blocker, open):** HUMANKIND installed to `StateFlags=4` cleanly but **0 of 18,809 files carried `+x`**. The main binary `Humankind.app/Contents/MacOS/Humankind` landed `-rw-r--r--`; macOS launch fails with `os error 256`. Because the `StateFlags=4` path deliberately skips Steam's own verify pass, nothing downstream applies the manifest's `EDepotFileFlag` modes — GameLib must, and did not. Every native macOS (and likely Linux) game is unlaunchable via the native install path until this is fixed. Routed to 23-06 (trace) → 23-07 (live census) → 23-08 (the gated fix).
- **G-23-01 (severity unknown, open):** Gate 2 attempt 1 (Kingdom Come: Deliverance II, appId 1771300) diverged before adoption — Steam returned EResult 40 (`Blocked`) for depot 1771304's decryption key, and `classifyDepotError` treats 40 as non-retryable, aborting the **whole** install. Owning a depot is not the same as Steam granting its key. Cannot be classified as a GameLib defect versus a genuine region block until the decisive diagnostic (install KCD2 in the official Steam client on this account/region) is run — owned by 23-10. User-facing messaging improvement owned by 23-09.
- **Gate 1's launch half carries an open question.** Cyberpunk 2077 is also a native macOS title, yet its launch succeeded where HUMANKIND's failed. `23-TRACE.md` records that it was never established whether that launch was a GameLib cold launch or Steam-UI-mediated — the latter would re-apply modes itself and make the launch half of Gate 1 uninformative about G-23-02. Resolving this is a `must_have` of 23-07.
- **Retroactive close-out.** This SUMMARY was written on 2026-08-14, after the plan's work had already landed. The plan's commits (`c1dc0fe60`, `e05250f9c`, `b7ebf7e2a`) existed without a SUMMARY, so `phase-plan-index` reported 23-04 as incomplete and `/gsd-execute-phase 23` tripped its safe-resume gate. The file was authored from the plan, the commits, and `23-UAT.md`'s recorded results rather than from a live execution session; the dates above are the dates of the underlying work, not of this write-up.

## User Setup Required

None — no external service configuration required. The gates require a real macOS machine, a real authenticated Steam client, and owned copies of the target titles.

## Next Phase Readiness

**REQ-23-07 is NOT closed and Phase 23 is NOT completable on this plan's results.** What this plan established, and what it left:

- **Established:** Steam trusts a GameLib-authored `StateFlags=4` (Gate 1, hardware). Hard-DRM titles launch under it (Gate 2's hypothesis, hardware).
- **Blocked on:** G-23-02 must be root-caused (23-07) and fixed (23-08) before Gate 2 can re-run clean. Gate 3 (interrupt-resume) has never run and will hit G-23-02 at its own launch step until the fix lands. G-23-01's severity is unresolved pending the official-client diagnostic.
- **Successor plans:** 23-06 (trace instrumentation, complete) → 23-07 (live census, blocking human) → 23-08 (the gated fix) → 23-09 (G-23-01 messaging) → 23-10 (Gate 2 re-run + Gate 3 + G-23-01 diagnostic, blocking human).

---
*Phase: 23-steam-full-ownership-install-stateflags-4*
*Completed: 2026-07-21 (summary written retroactively 2026-08-14)*
