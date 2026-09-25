---
phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra
plan: 07
subsystem: infra
tags: [tauri, windows, live-gate, single-instance, focus-sentinel, requirements-closure]

# Dependency graph
requires:
  - phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra plan 46-06
    provides: "A rebuilt debug NSIS setup .exe carrying the unminimize() fix, sentinel logging, and the secondary foreground grant, ready for re-gate"
provides:
  - "46-LIVE-GATE-RERUN.md: Verdict: PASS, with numeric/verbatim evidence for P0 and Checks 1, 2, 3a, 3b, 4, 5 against the 46-06 build on the operator's Windows 11 machine"
  - "46-LIVE-GATE.md's FAIL record preserved with an additions-only pointer to the re-run"
  - "The Windows single-instance/deep-link todo closed with a phase-46 Resolution section, moved to completed/"
  - "U-34.5-18 CLOSED in 34.5-UNTESTED-ITEMS.md"
  - "REQ-46-09 and REQ-46-10 flipped to Complete in REQUIREMENTS.md"
  - "A new todo documenting that Windows gamelib:// registration is install-time only and can be silently stolen by another app"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A continuous 200ms foreground-poll instrument (GetForegroundWindow + GetWindowThreadProcessId, printing only on change) replaces a flawed single 15s-later sample for measuring whether a foreground-rights grant held, recorded as a reusable pattern for future live gates"

key-files:
  created:
    - .planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-07-SUMMARY.md
    - .planning/todos/pending/2026-09-25-windows-gamelib-registration-is-install-time-only.md
  modified:
    - .planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-LIVE-GATE-RERUN.md
    - .planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-LIVE-GATE.md
    - .planning/todos/completed/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md
    - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UNTESTED-ITEMS.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Check 3b's PASS is decided by Attempt 3's continuous foreground poll, not the file's own prescribed single 15s-later sample — Attempt 2 (the prescribed instrument) returned foreground=False despite the operator's own eyes confirming the window was on top and active, a single-sample flaw rather than a guard defect. Recorded as a script/environment deviation, not a GameLib defect, and the poller is proposed for future gates."
  - "P0's LastWriteTime expectation ('later than the build mtime') is recorded as an expectation defect for NSIS builds, which preserve the binary's original build timestamp rather than stamping install time — the uninstall.exe mtime and the sentinel Select-String check are the valid freshness evidence instead."
  - "REQ-46-09 flipped to Complete as records hygiene, citing plan 46-01 (which already completed it and listed it in requirements-completed), per the plan's own instruction — no new verification was performed for it in this plan."

requirements-completed: [REQ-46-10, REQ-46-11, REQ-46-01, REQ-46-02]

# Metrics
duration: ~45min (Task 1 pre-flight/script authoring, operator live session on 2026-09-25, Task 3 transcription/closure)
completed: 2026-09-25
---

# Phase 46 Plan 07: Windows live-gate re-run and REQ-46-10/U-34.5-18 closure Summary

**Re-ran the Windows single-instance/focus-sentinel live gate against the 46-06 fix on the operator's Windows 11 machine — Verdict: PASS on all seven gating checks (P0, 1, 2, 3a, 3b, 4, 5) — then closed the Windows single-instance todo, ledger row U-34.5-18, and REQ-46-09/REQ-46-10 traceability on the strength of that measured evidence.**

## Performance

- **Duration:** ~45 min (Task 1 script authoring + Task 3 transcription/closure; operator's live session on 2026-09-25 is not included in agent wall-clock)
- **Completed:** 2026-09-25
- **Tasks:** 3 completed (Task 1: auto, Task 2: operator checkpoint, Task 3: auto)
- **Files modified:** 5 (1 new SUMMARY, 1 new todo, 5 modified — see key-files)

## Accomplishments

- **Verdict: PASS**, recorded in `46-LIVE-GATE-RERUN.md`, against the debug NSIS build from plan 46-06 (commit `5b6201e26`, confirmed representative of HEAD at re-run time — only an irrelevant macOS `app`-bundle config change and unrelated frontend files changed since).
- **Check 3a (terminal second launch)** — decisive measurement: `IsIconic($h)` went `True` → `False`, `GetForegroundWindow() -eq $h` went `True`, with window A logging `received single-instance focus sentinel -- raising the main window` then `focus sentinel raise: unminimize=ok, show=ok, set_focus=ok`, and the secondary logging `granted foreground rights to the running instance (pid=4988)`.
- **Check 3b (Start-menu launch, the real user path)** — the check that failed the first gate. Decided by a continuous 200ms foreground poll after the script's own prescribed single-sample instrument proved flawed on Attempt 2 (a transient console holder produced a false `foreground=False` despite the operator visually confirming the window was on top). Attempt 3's poll showed `gamelib-shell` (pid 4988) holding the foreground handle continuously from 20:55:13.763 through the end of the ~20s sampling window, `iconic=False` throughout. Attempt 1 was invalid — a leftover, identically-named Electron-era GameLib install (`C:\Program Files\GameLib\GameLib.exe`) launched instead of the Tauri build.
- **Checks 4 and 5 (never run before this phase)** both PASS: two near-simultaneous cold launches produced exactly one shell/one sidecar/one visible window; a force-killed primary left `0` orphan sidecars (no orphan todo needed) and did not block the next launch's warm ping delivery.
- **S1 (non-gating tray left-click)** was not run (operator skipped it); recorded as "not run (skipped, non-gating)" per the plan's own rule that a skip does not require a todo.
- **Closure on PASS, exactly as gated:**
  - `.planning/todos/pending/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` → moved to `completed/` with a `## Resolution (phase 46, 2026-09-25)` section citing the 46-01 through 46-07 chain and the re-run's measured values.
  - `U-34.5-18` in `34.5-UNTESTED-ITEMS.md` → `CLOSED`, citing both the first FAIL gate and the PASS re-run.
  - `REQUIREMENTS.md`: `REQ-46-10` flipped to `Complete (46-LIVE-GATE-RERUN.md)`; the stale `REQ-46-09` row flipped to `Complete (plan 46-01)` as records hygiene (it was already satisfied and listed in plan 46-01's `requirements-completed`, just never reflected in the traceability table).
  - `46-LIVE-GATE.md` received an additions-only `## Superseded by re-run (2026-09-25)` pointer; every prior line stays byte-identical (`git diff HEAD~2 -- 46-LIVE-GATE.md | grep '^-'` is empty).
- **New todo filed** (operator-requested deviation): `.planning/todos/pending/2026-09-25-windows-gamelib-registration-is-install-time-only.md`, `severity: medium`, `platform: windows`, `ready: human` — Windows `gamelib://` registration is a write-once installer artifact with no runtime self-assertion, so any other app that writes `HKCU\Software\Classes\gamelib` (observed live during this re-run: a leftover Electron-era GameLib install re-registered it at runtime, then left it dangling after uninstall) silently steals or breaks deep links until GameLib is reinstalled. Cites phase 46 decision point (a) as the mechanism and names candidate mitigations for an operator decision.
- **STATE.md and ROADMAP.md untouched**, as required — verified via `git diff --quiet HEAD~2 -- .planning/STATE.md` and `.planning/ROADMAP.md`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pre-flight + write 46-LIVE-GATE-RERUN.md** — `1779f7532` (docs, from continuation-carried context)
2. **Task 2: OPERATOR live re-gate** — no commit (checkpoint:human-verify, operator-only actions)
3. **Task 3: Record the verdict; close the todo, U-34.5-18, REQ-46-10** — `01e5bd98e` (the todo rename + new todo) and `747b4a368` (the re-gate record, `46-LIVE-GATE.md` pointer, `U-34.5-18` closure, and `REQUIREMENTS.md` flips — split into a second commit after a bad pathspec in an earlier `git add` call aborted before staging those four files; no content differs from what Task 3's action specified)

## Files Created/Modified

- `.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-LIVE-GATE-RERUN.md` — every Observed/Result cell filled from the operator's report, `Verdict: PASS`, plus a `## Notes (re-run deviations, 2026-09-25)` section covering the five script/environment deviations (a-e: the `$sidecars` helper's blank-for-single-match behavior, the NSIS LastWriteTime expectation defect, the flawed single-sample foreground check, the leftover Electron-install collision, and the re-run-time build-freshness re-check)
- `.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-LIVE-GATE.md` — additions-only `## Superseded by re-run (2026-09-25)` pointer
- `.planning/todos/completed/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` — moved from `pending/`, with a `## Resolution` section
- `.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UNTESTED-ITEMS.md` — `U-34.5-18` row marked `CLOSED`
- `.planning/REQUIREMENTS.md` — `REQ-46-09`/`REQ-46-10` traceability rows and checkboxes flipped to Complete
- `.planning/todos/pending/2026-09-25-windows-gamelib-registration-is-install-time-only.md` — new todo (deviation, operator-requested)
- `.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-07-SUMMARY.md` — this file

## Decisions Made

See `key-decisions` in the frontmatter: (1) Check 3b's PASS rests on the continuous-poll instrument, not the file's own prescribed single-sample check, which is recorded as a script defect; (2) the P0 LastWriteTime expectation is recorded as wrong for NSIS builds, not as evidence of a stale binary; (3) REQ-46-09 was flipped as records hygiene, citing prior evidence rather than new verification.

## Deviations from Plan

**1. [Rule 3-adjacent, operator-directed] New todo filed outside the plan's own two auto-file rules.** The plan's Task 3 only auto-files a todo for an observed orphan sidecar (none observed) or an S1 iconic=True observation (not run). The orchestrator's instructions for this continuation explicitly requested a third todo, filed as a deviation: Windows `gamelib://` registration being install-time-only and stealable, evidenced by this session's own Electron-install collision. Filed with `ready: human` since it requires an operator decision among mitigation options, not a code-only fix.

**2. [Process, self-corrected] A bad pathspec aborted the first `git add` invocation before four of Task 3's five files were staged.** The initial `git add` command listed the pending-todo path after it had already been renamed by `git mv`, producing a `fatal: pathspec ... did not match any files` error that silently skipped staging `REQUIREMENTS.md`, `34.5-UNTESTED-ITEMS.md`, `46-LIVE-GATE-RERUN.md`, and `46-LIVE-GATE.md` for the first commit (`01e5bd98e`). Caught by re-running `git status --short` after the commit and finding those four files still modified; staged and committed correctly in a second commit (`747b4a368`) with no content changes. All Task 3 acceptance criteria were re-verified against the final committed state (`HEAD~2` diffs) after this correction.

No other deviations — Task 3 was otherwise executed exactly as written, transcribing the operator's report verbatim into every Observed/Result cell with no inference.

## Issues Encountered

None beyond the process issue recorded as Deviation 2 above, which was caught and corrected before the plan's verification step ran.

## User Setup Required

None. The live gate itself was the operator-driven step (Task 2, already complete before this continuation began).

## Next Phase Readiness

Phase 46's Windows single-instance guard and `gamelib://` deep-link registration are now shipped, measured, and closed: REQ-46-01 through REQ-46-11 are all Complete in `REQUIREMENTS.md`. The one open follow-up is the new todo about install-time-only registration being stealable by another app — `ready: human`, not blocking, and explicitly scoped as a future decision rather than a phase-46 gap.

---

_Phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra_
_Completed: 2026-09-25_

## Self-Check: PASSED
