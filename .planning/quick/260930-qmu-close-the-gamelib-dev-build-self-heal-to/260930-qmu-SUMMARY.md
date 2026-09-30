---
phase: quick-260930-qmu
plan: 01
subsystem: infra
tags: [windows, registry, tauri, powershell, self-heal, gamelib-protocol]

requires:
  - phase: quick-260926-f3l
    provides: the dev-build skip predicate (gamelib_protocol_exe_is_dev_build) that this task
      proves did not also disable the installed-app repair
provides:
  - a reusable, pure-ASCII PowerShell 5.1 instrument (r4-hijack-repair-check.ps1) that hijacks
    HKCU\Software\Classes\gamelib\shell\open\command, launches the installed app, scores 8
    checks plus an invariant, and restores-first in every outcome
  - a live-proven closure of the todo 2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md
affects: [windows-single-instance-guard-and-gamelib-deep-link-registra, future Windows registry
  self-heal work that needs a hijack/restore harness pattern]

actuals:
  tokens: 11478
  tasks: 3
  commits: 3
  plan_head_before: 3903fe7bc
  plan_head_after: 5bf779088

tech-stack:
  added: []
  patterns:
    - "Windows registry hijack/restore test harness: .NET Microsoft.Win32.Registry for reads and
      writes (never reg.exe add, which mangles embedded quotes under PowerShell 5.1 native-arg
      parsing), reg.exe query/export for independent readback and backup, try/finally with
      restore-first-then-teardown ordering, and per-step try/catch so a benign native-command
      stderr line can never abort the safety-critical finally block."

key-files:
  created:
    - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/r4-hijack-repair-check.ps1
    - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-build-identity.txt
    - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-prestate-reg.txt
    - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-prediction.md
    - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-preflight.txt
    - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-live.txt
    - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-new-log-lines.txt
    - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-poststate-reg.txt
  modified:
    - src/backend/__tests__/tauriShellSource.test.ts

key-decisions:
  - "Fixed a live instrument crash (PowerShell 5.1 wraps merged native stderr as a terminating
    ErrorRecord under $ErrorActionPreference='Stop') rather than working around it -- the finally
    block is the operator's hard safety invariant and cannot tolerate a single fragile line."
  - "Committed directly to main (branching_strategy: none, per .planning/config.json, matching
    every prior quick-task commit in this repo's history) rather than treating the generic
    protected-branch guard as applicable here."

requirements-completed: [QUICK-260930-QMU]

coverage:
  - id: D1
    description: "The installed gamelib-shell.exe repairs a hijacked HKCU\\Software\\Classes\\gamelib\\shell\\open\\command
      key on launch, closing verify step 2 of the 2026-09-26 dev-build self-heal todo."
    requirement: "QUICK-260930-QMU"
    verification:
      - kind: manual_procedural
        ref: "evidence/r4-live.txt (VERDICT: PASS, C1-C8 and INV all PASS, restore_write_needed: no)"
        status: pass
      - kind: manual_procedural
        ref: "Task 2 verify block (independent bash post-checks: registry /s diff, tasklist, offset+pid-scoped log grep)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-30
status: complete
---

# Quick Task 260930-qmu: Close the gamelib:// dev-build self-heal todo Summary

**Live-proved that the installed release build of gamelib-shell.exe repairs a hijacked
`HKCU\Software\Classes\gamelib\shell\open\command` key on launch (46-POSTFIX R4), closing the
2026-09-26 todo that the quick-260926-f3l dev-build skip predicate might have over-broadened.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-30T19:10:00+13:00 (planning-time facts recorded in the plan)
- **Completed:** 2026-09-30T19:49:17+13:00
- **Tasks:** 3 / 3
- **Files modified:** 9 (1 script, 7 evidence files, 1 todo move, 1 test-comment re-point)

## Accomplishments

- Built `r4-hijack-repair-check.ps1`, a pure-ASCII PowerShell 5.1 instrument with Preflight
  (read-only preconditions plus a forced same-value round trip, no hijack, no launch) and Live
  (hijack, launch, poll, score, restore-first-then-teardown) modes.
- Ran the live hijack/repair check against the INSTALLED, release-CI build of
  `gamelib-shell.exe` (sha256 `5adce1be...63a9f`, matches quick-260930-o75's record, a descendant
  of the fix commit `28ff2c3e8`). **VERDICT: PASS** -- all of C1-C8 and INV passed, and
  `restore_write_needed: no`, meaning the APP repaired the key, not the harness.
- Closed the todo `2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md` to
  `completed/` with a dated Result and Resolution section, and re-pointed its one live source
  citation in `tauriShellSource.test.ts` (comment-only, 1-line diff).
- Confirmed both of the operator's hard safety invariants hold: the registry ended
  byte-identical to its pre-state, and zero `gamelib-shell.exe`/`gamelib-sidecar.exe` processes
  remain, independently re-verified from bash after the instrument's own internal checks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Preflight -- build the instrument, prove its restore path** - `8ca4b9b25` (docs)
2. **Task 2: Live R4 -- hijack, launch, score, restore** - `e3577f7c1` (docs)
3. **Task 3: Record the result, close the todo (PASS branch)** - `5bf779088` (docs)

_No separate plan-metadata commit -- per this plan's constraints, SUMMARY/STATE/PLAN are handled
by the orchestrator, not this executor._

## Files Created/Modified

- `.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/r4-hijack-repair-check.ps1` - the R4 instrument
- `.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-build-identity.txt` - re-measured build identity (hash, ancestry, literal counts)
- `.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-prestate-reg.txt` - the registry pre-state, diffed against throughout
- `.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-prediction.md` - the pre-registered C1-C8/INV prediction
- `.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-preflight.txt` - PREFLIGHT: PASS record
- `.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-live.txt` - the scored live run, VERDICT: PASS
- `.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-new-log-lines.txt` - the one repair line, offset-scoped
- `.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-poststate-reg.txt` - independent bash post-state capture
- `.planning/todos/completed/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md` - closed todo (moved from `pending/`)
- `src/backend/__tests__/tauriShellSource.test.ts` - Gate 5 comment re-pointed from `pending/` to `completed/` (1-line diff)

## Decisions Made

- **Fixed a live instrument crash rather than working around it.** A first Live-mode attempt
  crashed inside the `finally` block's teardown: PowerShell 5.1 wraps a native command's merged
  stderr (`2>&1`) as a terminating `ErrorRecord` under `$ErrorActionPreference = 'Stop'`, and
  `taskkill` had written a benign "could not be terminated" line for a child process that had
  already exited on its own. The registry restore (which runs before teardown) had already
  completed correctly by that point; the harness independently verified zero registry drift and
  manually cleared the two orphaned processes before touching the instrument. Fixed by discarding
  stderr (`2>$null`) on every native call and wrapping each teardown/restore/INV step in its own
  `try/catch`, so no single unexpected exception can again skip the rest of the safety-critical
  `finally` block. Re-ran Preflight (still PASS) and Live (VERDICT: PASS) after the fix.
- **Committed directly to `main`.** `.planning/config.json` sets `branching_strategy: "none"` and
  `use_worktrees: false`, and every prior quick-task commit in this repo's history (visible in
  `git log`) lands directly on `main`. The orchestrator's own constraints for this run also state
  "running on the main tree (no worktree isolation)". This is the established, deliberate
  convention for this project, not an oversight.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a PowerShell 5.1 stderr-merge crash in the Live-mode teardown**
- **Found during:** Task 2 (first Live-mode run)
- **Issue:** `taskkill.exe /PID <pid> /T 2>&1 | Out-Null` merged a benign stderr diagnostic line
  ("could not be terminated" for an already-exited child) into the success stream. Under
  `$ErrorActionPreference = 'Stop'`, PowerShell 5.1 turns that merged line into a terminating
  `NativeCommandError`, aborting the `finally` block's teardown before the process sweep ran and
  before `r4-live.txt` was ever written.
- **Fix:** Changed all four `reg.exe`/`taskkill.exe` invocations that used `2>&1` to `2>$null`
  (discard stderr instead of merging it), and wrapped the restore step, the graceful/forceful
  taskkill block, the process sweep, the C8 check, the informational webview2 count, and the INV
  re-read each in their own `try/catch` so a future unexpected exception in any one of them can
  never again skip the rest of the `finally` block, the C1-C8/VERDICT lines, or the exit-code logic.
- **Files modified:** `.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/r4-hijack-repair-check.ps1`
- **Verification:** Re-ran Preflight (`PREFLIGHT: PASS`) and Live (`VERDICT: PASS`, all of
  C1-C8/INV PASS) after the fix. No product code (`src-tauri/`) was touched.
- **Committed in:** `e3577f7c1` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix was to the test harness only, not the product under test. Between the
crash and the fix, the registry was independently confirmed already restored (the harness's own
restore-first ordering had already run before the crash), and the two orphaned processes were
independently cleared before any further action. No scope creep; the product's actual repair
behavior was never in doubt during the fix, since the crash occurred entirely after the repair
had already been scored PASS on the first attempt (the crash was in teardown, downstream of the
scoring code).

## Issues Encountered

A `$PSScriptRoot`-in-param-default-value quirk was hit and fixed during Task 1, before any
registry write: with a `[Parameter(Mandatory=$true)]` parameter present in the same `param()`
block, `$PSScriptRoot` is not reliably populated while PowerShell 5.1 evaluates a later
parameter's default-value expression, even though it IS populated once script execution begins.
Fixed by defaulting `$EvidenceDir` to an empty string in the param block and computing the real
default (via `$PSCommandPath`) in the script body. This was caught by the Task 1 `<verify>` block
itself (the mandated `powershell.exe ... -Mode Preflight` invocation, with no explicit
`-EvidenceDir`, failed before the fix) -- no registry write or process launch had occurred.

## Hard Safety Invariants (operator-mandated)

Both invariants hold, checked independently from bash after every task and again just before
writing this summary:

- **Registry:** `HKCU\Software\Classes\gamelib` (all four values: `URL Protocol`, root
  `(Default)`, `DefaultIcon` `(Default)`, `shell\open\command` `(Default)`) is byte-identical to
  the pre-state captured in `evidence/r4-prestate-reg.txt`, confirmed via `diff` immediately
  before this summary was written.
- **Processes:** zero `gamelib-shell.exe` and zero `gamelib-sidecar.exe` processes remain,
  confirmed via `tasklist` immediately before this summary was written.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The todo `2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md` is fully
closed: both of its verify steps are now confirmed live (step 1 by quick-260926-f3l, step 2 by
this task). No follow-up work is required by this task. The reusable hijack/restore harness
pattern (`r4-hijack-repair-check.ps1`) is available as a reference for any future Windows
registry self-heal live-check work, though it is task-specific as written (paths and expected
values are the `gamelib://` scheme's, not parameterized for reuse without edits).

Known, honestly-stated limits (recorded in the todo's Result section, not follow-up work):
- One host, one launch. Not a statistical sample.
- The repair's log line depends on `HOME` being set (inherited here from Git Bash); a normal
  Start-menu launch has no `HOME`, so the line reaches no file in that case. The registry result
  itself does not depend on `HOME`. This is unchanged from 46-POSTFIX Note 2 and not addressed by
  this task.
- A `gamelib://` deep-link delivery after the repair was not exercised in this task (46-POSTFIX
  R4 did exercise it; this todo's step 2 asked only for the repair itself).

---
*Phase: quick-260930-qmu*
*Completed: 2026-09-30*

## Self-Check: PASSED

All 9 created/modified files confirmed present on disk; all 3 task commits (`8ca4b9b25`,
`e3577f7c1`, `5bf779088`) confirmed present in `git log --oneline --all`.
