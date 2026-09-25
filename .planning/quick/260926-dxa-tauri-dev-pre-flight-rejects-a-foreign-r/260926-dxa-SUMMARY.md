---
phase: quick-260926-dxa
plan: 01
subsystem: dev-tooling
tags: [tauri, powershell, proc, jest, cjs, dev-workflow]

# Dependency graph
requires: []
provides:
  - "meta/tauriDevPreflight.cjs: cross-platform pre-flight that blocks tauri:dev* when a foreign gamelib-shell is running"
  - "Closed todo 2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md with both LOCKED decisions recorded"
  - "38-HUMAN-UAT.md Sitting 4 final disposition (inference accepted, evidence rotated away)"
affects: [tauri-dev-workflow, phase-38-human-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure classifier / thin impure collector split for OS process-table queries (win32 Get-CimInstance, linux /proc, darwin/posix ps), same shape as findDeadcode.cjs"
    - "Fail-safe-WARN-not-block asymmetry: any query failure/timeout/unreadable path warns and exits 0; only a positively-read foreign match blocks"

key-files:
  created:
    - meta/tauriDevPreflight.cjs
    - meta/__tests__/tauriDevPreflight.test.ts
  modified:
    - package.json
    - .planning/todos/completed/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
    - .planning/debug/knowledge-base.md

key-decisions:
  - "D-01: Decision 2 = option (c), a tauri:dev pre-flight script. Option (b) (touching Phase 46 single-instance code in src-tauri/src/main.rs) was explicitly declined and that file is untouched."
  - "D-02: the Phase 38 Sitting 4 commit-date inference is accepted as FINAL -- the GAMELIB_SHELL_EXE received= log lines that could have settled it have rotated off the Windows machine (gamelib.log.old now starts 09:38, gamelib.log 09:40, both 2026-09-26)."
  - "ownDebugDir's relative-CARGO_TARGET_DIR branch uses path.join, not path.resolve, against repoRoot -- resolve() would prepend the CWD's drive letter on win32 when repoRoot is a POSIX-style absolute path, which is exactly the shape tests exercise on a Windows host."

patterns-established:
  - "Pattern: OS-process-table pre-flight scripts stay CommonJS .cjs run by bare node (not meta/runTs.cjs, which breaks on Windows), export pure classifier/parser functions guarded by require.main === module && !process.env.JEST_WORKER_ID, and take platform as an explicit function argument so every OS branch is testable from any host."

requirements-completed: [QUICK-260926-dxa]

duration: ~55min
completed: 2026-09-26
---

# Quick Task 260926-dxa: Tauri Dev Pre-flight Rejects a Foreign Running Shell Summary

**A cross-platform `meta/tauriDevPreflight.cjs` pre-flight, wired at the head of `tauri:dev:run`, that fails loudly (exit 1, naming pid + exe path + stop command) when a running `gamelib-shell` is not the repo's own debug binary -- verified live against the operator's installed shell (pid 24764) on this Windows machine, which it correctly failed on and left running untouched.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 (Task 1 auto+tdd, Task 2 auto/live-check, Task 3 auto/docs)
- **Files modified:** 6 (2 created, 4 modified/moved)

## Accomplishments

- `meta/tauriDevPreflight.cjs` with a pure, fully-tested classifier (`classifyShellProcesses`, `parseWindowsCimJson`, `parsePsComm`, `ownDebugDir`) and thin win32/linux/darwin process-table collectors that never throw out -- 14/14 unit tests green, TDD RED confirmed before implementation existed.
- Wired at the head of `tauri:dev:run`, so `tauri:dev`, `tauri:dev:vault`, and `tauri:dev:keyring` all get the check before any build step runs (before a multi-minute build, per the plan's ordering rationale).
- Live-verified against the real installed shell on this machine: `node meta/tauriDevPreflight.cjs` exited 1, named `C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe` and pid 24764 with a `Stop-Process -Id 24764` instruction, and pid 24764 was confirmed still running immediately afterward (the script never signals or kills anything).
- Todo `2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md` closed with both operator-locked decisions recorded, plus the re-occurrence, the unaffected `636d0788c` verification, and the out-of-scope drain-exit observation.
- `38-HUMAN-UAT.md` Sitting 4 now records the commit-date inference as accepted FINAL, with the measured log-rotation evidence.

## Task Commits

1. **Task 1a: RED -- failing tests for the pre-flight classifier** - `627f71f6f` (test)
2. **Task 1b: GREEN -- pre-flight implementation + package.json wiring** - `203780622` (feat)
3. **Task 2: Live check against pid 24764** - no files modified (observation only; results below)
4. **Task 3: Close the todo, record D-02 in Sitting 4, repoint live references** - `7a1ad7aa8` (docs)

_TDD task: RED confirmed by temporarily removing the implementation file and re-running jest (`Cannot find module '../tauriDevPreflight.cjs'`), then restoring it for GREEN._

## Files Created/Modified

- `meta/tauriDevPreflight.cjs` - Pre-flight CLI: pure classifier/parsers + win32 (`Get-CimInstance`)/linux (`/proc`)/darwin (`ps`) collectors + `main()`
- `meta/__tests__/tauriDevPreflight.test.ts` - 14 unit tests for the pure surface (Tests 1-14 from the plan's behavior block)
- `package.json` - `tauri:dev:run` now starts with `node meta/tauriDevPreflight.cjs &&`
- `.planning/todos/completed/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md` - moved from `pending/`; `status`/`closed_by` added; `## Resolution` section added covering D-01, D-02, the pid-24764 re-occurrence, the unaffected `636d0788c` check, and the out-of-scope drain-exit note
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md` - Sitting 4: added "Inference accepted as final" paragraph; repointed the todo reference to `completed/`
- `.planning/debug/knowledge-base.md` - repointed the closed todo's reference from a bare filename to the full `completed/` path

## Live Check Output (Task 2, verbatim)

Precondition query (read-only):

```
> powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='gamelib-shell.exe'\" | Select-Object ProcessId, ExecutablePath"

ProcessId ExecutablePath
--------- --------------
    24764 C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe
```

Pre-flight run:

```
> node meta/tauriDevPreflight.cjs
[tauri-dev-preflight] FAIL: a non-dev GameLib shell is running. tauri dev would hand focus to it and exit -- you would be testing THAT build, not this tree.
  pid 24764  C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe
To fix: stop the foreign process, then re-run.
  pid 24764: Stop-Process -Id 24764 (PowerShell), or quit GameLib from its tray icon
EXIT_CODE:1
```

Post-run liveness re-check:

```
> powershell.exe -NoProfile -Command "if (Get-Process -Id 24764 -ErrorAction SilentlyContinue) { Write-Output 'ALIVE' } else { Write-Output 'GONE' }"
ALIVE
```

pid 24764 was not stopped, killed, or signaled at any point.

## Decisions Made

- **D-01 (Decision 2 = option (c)):** implemented as described above. Option (b) (touching `src-tauri/src/main.rs`) was declined by the operator; confirmed untouched via `git diff --stat -- src-tauri/src/main.rs` (empty).
- **D-02 (Decision 1 residual):** the sitting-4 commit-date inference is accepted as FINAL. The `GAMELIB_SHELL_EXE received=` lines that could have settled it are gone -- `%LOCALAPPDATA%\GameLib\logs\gamelib.log.old` now starts 09:38 and `gamelib.log` 09:40, both 2026-09-26 (measured during this session), rotated past the sitting-4 window.
- `ownDebugDir`'s relative-`CARGO_TARGET_DIR` resolution uses `path.join(repoRoot, cargoTargetDir)` rather than `path.resolve`, discovered while making Test 14 pass on this Windows host: `path.resolve('/repo', 'x')` prepends the current working directory's drive letter when `repoRoot` is a POSIX-style absolute string, which `join` does not do. Documented inline in the source.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `ownDebugDir`'s relative-target-dir resolution used `path.resolve` instead of `path.join`**
- **Found during:** Task 1, running Test 14 for the first time (GREEN phase)
- **Issue:** `path.resolve(repoRoot, cargoTargetDir)` silently prepended the current working directory's drive letter on win32 whenever `repoRoot` was a POSIX-style absolute path (e.g. `/repo`), producing `C:\repo\x\debug` instead of the expected `\repo\x\debug` -- a real bug that would have misclassified the own-debug directory on any Windows host where the script's caller passed a POSIX-shaped `repoRoot`.
- **Fix:** Switched to `path.join(repoRoot, cargoTargetDir)` for the relative branch, which concatenates and normalizes without any cwd/drive dependency; the absolute-path branch was unaffected.
- **Files modified:** meta/tauriDevPreflight.cjs
- **Verification:** All 14 unit tests green after the fix.
- **Committed in:** `203780622` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Necessary for correctness of the `ownDebugDir` behavior the plan's own Test 14 specifies. No scope creep.

## Issues Encountered

- `pnpm planning-gates` reports 12/13 passing; the one failure (`planning-envelope-tag-gate.py`) is a pre-existing, unrelated defect in three files from a different, already-committed quick task (`.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/*`, last touched 2026-09-25, before this session). None of those files are in this plan's scope or were touched by any task here. Per the deviation rules' scope boundary ("only auto-fix issues directly caused by the current task's changes"), this was left unfixed and is reported here rather than papered over. `pnpm codecheck`, both jest suites, eslint, and prettier are all clean; the plan's own `git diff --stat -- src-tauri/src/main.rs` and package.json wiring checks both pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `pnpm tauri:dev` / `tauri:dev:vault` / `tauri:dev:keyring` now refuse to silently hand off to a stale installed shell; the operator gets a named pid/path and stop instruction instead of one easily-missed scrollback line.
- Phase 38's Sitting 4 UAT record is now permanently settled (INFERRED, not measured) rather than left open pending Windows log evidence that no longer exists.
- Pre-existing `planning-envelope-tag-gate.py` failure in `260925-uok`'s files remains open and unrelated to this task; worth a separate quick task if not already tracked.

---
*Phase: quick-260926-dxa*
*Completed: 2026-09-26*

## Self-Check: PASSED

- FOUND: meta/tauriDevPreflight.cjs
- FOUND: meta/__tests__/tauriDevPreflight.test.ts
- FOUND: .planning/todos/completed/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md
- CONFIRMED: .planning/todos/pending/2026-09-26-tauri-dev-silently-hands-off-to-a-stale-installed-build.md no longer exists
- FOUND commit: 627f71f6f
- FOUND commit: 203780622
- FOUND commit: 7a1ad7aa8
