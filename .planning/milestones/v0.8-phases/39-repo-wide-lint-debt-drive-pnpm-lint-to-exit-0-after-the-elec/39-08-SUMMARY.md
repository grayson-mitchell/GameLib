---
phase: 39
plan: "08"
subsystem: planning-gates
tags: [planning-gates, seam-parity, safeStorage, dead-code-disposition, mutation-testing]
requirements-completed: [REQ-39-02]
dependency-graph:
  requires: ["39-01"]
  provides: ["all-7-planning-gates-passing"]
  affects: [".planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py"]
tech-stack:
  added: []
  patterns: ["D-35-14-02 disposition vocabulary (RE-POINT / RE-DERIVE / INVERT / RETIRE)", "mutation-control gate testing (mutate -> RED -> revert -> GREEN)"]
key-files:
  created: []
  modified:
    - ".planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py"
    - ".planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-SEAM-PARITY-SWEEP.md"
    - ".planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-GATE-DISPOSITIONS.md"
    - ".planning/REQUIREMENTS.md"
decisions:
  - "Applied Rule 1/3 auto-fixes to two previously-hidden defects beyond the plan's written scope (Axis B import regex staleness; stale main.ts reachability prose) because both directly blocked the plan's stated 7/7 success criterion and stemmed from the same Phase 35 rearchitecture already sanctioned for repair."
  - "Left EXPECTED_AXIS_B_SAFESTORAGE_IMPORTERS (the Axis B expectation list) untouched per threat T-39-38 -- only the import-detection walk (ELECTRON_IMPORT_RE) was re-pointed."
metrics:
  duration: "~3.5h (across session, including compaction/continuation)"
  completed: "2026-09-02"
  tasks-completed: 3
  files-modified: 4
---

# Phase 39 Plan 08: Disposition the seam-parity-sweep gate -- close the second failing planning gate Summary

Re-pointed, inverted, and retired four stale assertions inside `34.4.1/seam-parity-sweep-gate.py` (plus a fifth, previously-hidden Axis B import-regex defect discovered mid-execution) so `python3 meta/runPlanningGates.py` reports `7/7 planning gates passed.` for the first time since the Electron-to-Tauri cutover.

## What Changed

`seam-parity-sweep-gate.py` was failing for two independent reasons layered on top of each other: (1) `ELECTRON_STUB_PATH` still pointed at the pre-`git mv` location of `electronStub.ts` (fixed in Task 1, plan-anticipated), and (2) once that `FileNotFoundError` cleared, the gate's Axis A/Axis B census logic itself was stale against REQ-39-03's dead-seam collapse (7 of 8 `getLoginWindowSeam()` call sites deleted, only `humbleLoginFlowRegistration.ts:457` kept) and against Phase 35's `safeStorage` import re-point from `'electron'` to `'backend/platform'`. Task 2 dispositioned all of this using the D-35-14-02 vocabulary, regenerated the committed sweep report, and proved every kept/inverted assertion can still fail via mutation-control tests. Task 3 recorded the full disposition rationale in `39-GATE-DISPOSITIONS.md`.

### Accomplishments

- **Task 1 (`4e534c46f`):** RE-POINTed `ELECTRON_STUB_PATH` to `electronStub.ts`'s post-`git mv` location, clearing the `FileNotFoundError` that had masked every downstream defect since the Phase 35 rearchitecture.
- **Task 2 (`0a6998d95`):** Dispositioned the full Axis A/Axis B census:
  - **INVERT**: renamed `EXPECTED_AXIS_A_SITES` to `EXPECTED_AXIS_A_SURVIVOR_SET`, replacing a "these sites must still exist" floor with a "the live walk must equal exactly this one-site survivor set" bidirectional assertion naming `humbleLoginFlowRegistration.ts:457`.
  - **RETIRE-in-place**: removed the two dead `SITE_PROFILES` entries (`humble/user.ts::watchForLogin`, `humble/library.ts::revealTransportLabel`) whose call sites REQ-39-03 deleted outright, replaced with a `RETIRED-IN-PLACE Phase 39 Plan 08` explanatory comment block; confirmed via `grep -c 'getLoginWindowSeam()'` returning 0 for both source files that the comparison mechanism can never run again for these entries.
  - **RETIRE**: shrank `EXPECTED_SILENT_DROP_SITES` from a stale set to just `steamgrid/secureKey.ts` (S-12), the only silent-drop pin still reachable.
  - **RE-POINT (previously-hidden defect #3)**: broadened `ELECTRON_IMPORT_RE` from matching only `from 'electron'` to matching `from '(?:electron|backend/platform)'`. Root cause: Phase 35 moved every real `safeStorage` importer's specifier to `'backend/platform'`; the gate's Axis B walk was silently failing to find `secretStore.ts` and `tokenStore.ts` as importers (they only "passed" via a stale explanatory comment in `secureKey.ts` containing the old import text as a false positive). This regex-only fix leaves `EXPECTED_AXIS_B_SAFESTORAGE_IMPORTERS` (the Axis B *expectation*) completely untouched, satisfying T-39-38.
  - **RE-DERIVE (previously-hidden defect #4, cosmetic)**: made `steamgrid_reachability_evidence()`'s conclusion sentence conditional on `main_ts_path.exists()`. The prose was self-contradictory -- it printed a mechanically-derived "(none found)" importer list immediately followed by a hardcoded claim that the file "is only reached from `src/backend/main.ts`," but `src/backend/main.ts` was deleted outright by Phase 35 plan 35-14's commit `5643c7583` ("POINT OF NO RETURN"). Confirmed via `find src -iname "main.ts"` (no results) and `git log --diff-filter=D -- src/backend/main.ts`.
  - Regenerated `34.4.1-SEAM-PARITY-SWEEP.md` via `--write` to match the corrected walk (4 total findings: 1 Axis A survivor, 3 Axis B importers, 1 silently-dropped).
  - Ran two mutation-control tests, both cleanly reverted via `cp` (never `git checkout --`) and confirmed identical via `diff`:
    1. Reintroduced a `getLoginWindowSeam() === null` predicate in `library.ts` -> triggered `run_axis_a()`'s hard-fail-on-unmatched-site check (T-39-37).
    2. Added a fake DECLARED-shaped doc comment to `secureKey.ts` -> triggered `silent_drop_violations()`'s "pin now overstates the gap" branch, proving the kept S-12 pin can still fail.
- **Task 3 (`750a70422`):** Recorded the full disposition rationale, mutation-RED evidence, the `MINIMUM_EXPECTED_GATES = 7` constraint (why RETIRE-by-deletion is unavailable), and the final `7/7 planning gates passed.` gate run output in `39-GATE-DISPOSITIONS.md`.
- **REQUIREMENTS.md update (this commit):** Marked REQ-39-02 complete -- confirmed via a genuine, unmutated `python3 meta/runPlanningGates.py` run printing `7/7 planning gates passed.` with `EXIT=0` and zero `[FAIL]` lines.

## Task Commits

| Task | Description | Commit |
| ---- | ------------------------------------------------------------------- | --------- |
| 1 | Re-point `ELECTRON_STUB_PATH` to post-`git mv` location | `4e534c46f` |
| 2 | Disposition Axis A census + Axis B import drift (+2 hidden defects) | `0a6998d95` |
| 3 | Record seam-parity gate resolution in `39-GATE-DISPOSITIONS.md` | `750a70422` |
| final | Close REQ-39-02 in REQUIREMENTS.md, add this SUMMARY.md | (this commit) |

## Files Created/Modified

- `.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py` -- 4 dispositions applied (RE-POINT, INVERT, RETIRE x2, RE-POINT, RE-DERIVE)
- `.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-SEAM-PARITY-SWEEP.md` -- regenerated via `--write`
- `.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-GATE-DISPOSITIONS.md` -- disposition record completed
- `.planning/REQUIREMENTS.md` -- REQ-39-02 marked complete (traceability table row + checklist entry)

## Decisions Made

1. **Rule 1/3 auto-fixes for two previously-hidden defects beyond written plan scope.** The plan's `<threat_model>` addressed the `ELECTRON_STUB_PATH` re-point and the Axis A census staleness explicitly, but stated Axis B was "untouched by this phase" (T-39-38). During execution, fixing the Axis A census surfaced a second, independent defect: Axis B's import-detection regex (not its expectation list) was stale against the same Phase 35 rearchitecture. This was judged in-scope under deviation Rule 1 (bug fix) / Rule 3 (blocking issue) because: (a) it directly blocked the plan's stated 7/7 success criterion, (b) it stemmed from the identical root cause (Phase 35's `electron` -> `backend/platform` import re-point) already sanctioned for repair elsewhere in this same gate, and (c) the gate's own error message text ("fix the walk, never the expectation") explicitly invited this class of fix. `EXPECTED_AXIS_B_SAFESTORAGE_IMPORTERS` itself was left untouched, preserving T-39-38's constraint.
2. **A second cosmetic RE-DERIVE (reachability prose) applied in the same task.** Since the sweep report was already being regenerated in this exact task, shipping a self-contradictory conclusion sentence (claiming reachability from a file already deleted by Phase 35) would have been sloppy and against the plan's spirit of leaving the sweep report internally consistent.
3. **INVERT chosen over RE-DERIVE for the Axis A floor.** `EXPECTED_AXIS_A_SITES` asserted "these sites must still exist" -- but REQ-39-03's entire purpose was deliberate deletion of 7 of 8 sites. Per the D-35-14-02 vocabulary, this is INVERT (assert the opposite: "the live walk must equal exactly this one-site survivor set"), not RE-DERIVE (which would imply the census number/list should simply move together while preserving the original "must exist" polarity).
4. **RETIRE-in-place, never delete, for dead `SITE_PROFILES`/`EXPECTED_SILENT_DROP_SITES` entries.** `meta/runPlanningGates.py` enforces `MINIMUM_EXPECTED_GATES = 7`, so gate files themselves can never be deleted. The same in-place-retirement discipline was extended to dead dict/set entries within a kept gate file: removed from the live structure, but the retirement is documented via an explanatory comment rather than silently vanishing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Bug, previously-hidden] Axis B import-detection regex stale against Phase 35's `backend/platform` re-point**
- **Found during:** Task 2, after the Axis A census fix cleared the way for the gate to reach Axis B's comparison logic for the first time since Phase 35.
- **Issue:** `ELECTRON_IMPORT_RE` matched only `import { ... } from 'electron'`. Phase 35 plans 35-13/35-15 moved every real `safeStorage` importer's specifier to `from 'backend/platform'`. The gate was silently failing to detect `secretStore.ts` and `tokenStore.ts` as Axis B importers; `secureKey.ts` only appeared to pass because of a stale explanatory comment containing the literal string `from 'electron'` inside a comment block -- a false-positive match, not a real import.
- **Fix:** Broadened `ELECTRON_IMPORT_RE` to `r"import\s*\{([^}]*)\}\s*from\s*'(?:electron|backend/platform)'"`. Left `EXPECTED_AXIS_B_SAFESTORAGE_IMPORTERS` untouched (T-39-38 constraint).
- **Files modified:** `.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py`
- **Commit:** `0a6998d95`

**2. [Rule 1 - Bug, previously-hidden] Self-contradictory reachability prose citing a deleted file**
- **Found during:** Task 2, while regenerating the sweep report and reviewing the resulting diff for the F-1b finding.
- **Issue:** `steamgrid_reachability_evidence()`'s hardcoded conclusion sentence claimed `secureKey.ts` "is only reached from `src/backend/main.ts`," directly contradicting the mechanically-derived "(none found)" importer list printed one line earlier. `src/backend/main.ts` was deleted outright by Phase 35 plan 35-14's commit `5643c7583`.
- **Fix:** Made the conclusion clause conditional on `main_ts_path.exists()`, producing an accurate sentence when the file is absent (explains it has no importer at all because `main.ts` was deleted by Phase 35).
- **Files modified:** same file, regenerated report `34.4.1-SEAM-PARITY-SWEEP.md`
- **Commit:** `0a6998d95`

No other deviations. Task 1's `ELECTRON_STUB_PATH` re-point and the Axis A census disposition were both explicitly anticipated in the plan.

## Issues Encountered

- **Self-corrected test-capture mistake (not a plan/code defect):** An initial attempt to capture full `pnpm test --selectProjects Backend` output used stdout-then-stderr redirect ordering (`2>&1 > file`), which sent stderr (where jest writes most output) to the terminal instead of the file, producing a near-empty capture and briefly causing a misread of which suites failed. Corrected by reordering to `> file 2>&1`. Final, verified result: `Test Suites: 2 failed, 188 passed, 190 total; Tests: 4 failed, 2 skipped, 4383 passed, 4389 total` -- both failing suites (`downloadmanager/__tests__/utils.test.ts`, `storeManagers/steam/__tests__/decompressPool.test.ts`) are on the pre-briefed, pre-existing known-failure list and are not regressions from this plan.
- **Bash tool output display artifact (not real corruption):** Some Bash outputs reading the large gate script or `39-GATE-DISPOSITIONS.md` appeared to have garbled/dropped words. Confirmed via the `Read` tool that underlying file content was clean and correct in every case -- purely a rendering artifact in tool-output display, not actual file damage. Worked around by preferring `Read` for precision verification and a Bash heredoc append (rather than `Edit`'s string-match) for the final `39-GATE-DISPOSITIONS.md` append, out of caution.

## Verification Evidence

- `python3 seam-parity-sweep-gate.py` (standalone): self-test 15/15 passes both before and after the disposition changes; exits 0 with `OK: 34.4.1-SEAM-PARITY-SWEEP.md is current and the silent-drop set is unchanged -- 1 Axis A site(s) + 0 supplementary finding(s) + 3 Axis B importer(s) = 4 total finding(s), 1 SILENTLY-DROPPED: ['S-03']`.
- `python3 meta/runPlanningGates.py` (full suite, genuine unmutated final run): all 7 gates report `[PASS]`, final line reads literally `7/7 planning gates passed.`, `EXIT=0`, zero `[FAIL]` lines, zero tracebacks. This is the plan's core success criterion and the first time this has been true since the Phase 35 Electron cutover.
- `git status --short src/` was empty immediately before the Task 2 commit -- confirms both mutation-control tests were fully reverted with zero residual `src/` changes shipped in this plan.
- Mutation-control evidence (both tests independently confirmed RED, then reverted to confirmed GREEN):
  1. `library.ts` reintroducing `getLoginWindowSeam() === null` -> `run_axis_a()` hard-fails on the unmatched site (proves T-39-37's hard-fail mechanism and the Axis A survivor set's anti-regrowth protection are both reachable).
  2. `secureKey.ts` fake DECLARED-shaped doc comment -> `silent_drop_violations()` fails with "pin now overstates the gap" (proves the kept S-12 silent-drop pin can still fail).

## Next Phase Readiness

REQ-39-02 is complete. All 7 planning gates pass. Remaining phase 39 scope is REQ-39-01 (lint debt drive, plan `39-09`), which was explicitly out of scope for this plan and is unaffected by these changes -- no lint figures appear anywhere in `39-GATE-DISPOSITIONS.md`'s seam-parity section, and `pnpm codecheck`/`pnpm lint` were not re-run as part of this plan (only `pnpm test --selectProjects Backend` was run, as directed, to confirm no test regressions from the gate script changes). Plan `39-09` can proceed independently.

## Self-Check: PASSED

- FOUND: `.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-08-SUMMARY.md`
- FOUND: `.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-GATE-DISPOSITIONS.md`
- FOUND: `.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-SEAM-PARITY-SWEEP.md`
- FOUND commit: `4e534c46f` (Task 1)
- FOUND commit: `0a6998d95` (Task 2)
- FOUND commit: `750a70422` (Task 3)
- FOUND commit: `4331368a2` (SUMMARY.md + REQUIREMENTS.md)
- Re-ran `python3 meta/runPlanningGates.py` after all commits landed: still prints `7/7 planning gates passed.` with `EXIT=0`, zero `[FAIL]` lines -- the plan's core success criterion holds against the final committed state, not just an in-progress working tree.
