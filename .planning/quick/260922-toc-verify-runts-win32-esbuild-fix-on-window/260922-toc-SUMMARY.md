---
phase: quick-260922-toc
plan: 01
subsystem: tooling
tags: [windows, esbuild, runTs, tar, verification, todos]
status: complete

requires: []
provides:
  - "runTs.cjs win32 esbuild spawn fix (8ed7b8ccd) confirmed reproduced+fixed on a real Windows 11 box: negative control (pre-fix copy) fails -4058/ENOENT, positive run (current file) passes"
  - "detectVCRedist and tar todos retagged ready: code with dated, reasoned sections now that a Windows box is available"
affects: [windows-single-instance-guard-and-deep-link-registration, windows-release-leg-tar-drive-letter]

tech-stack:
  added: []
  patterns:
    - "Negative-control-then-positive verification: run the pre-fix file via git show <sha>^:<path> > <copy in same dir>, trap-delete it, confirm it reproduces the original failure BEFORE trusting the positive run of the current file"

key-files:
  created: []
  modified:
    - .planning/todos/completed/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md
    - .planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md
    - .planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md

key-decisions:
  - "Task 2 scoped down by orchestrator override to the plain `pnpm download-helper-binaries` run only (F2 evidence); the forced full re-download exercising tar extraction was explicitly excluded from this task and left for the tar todo's own future work."
  - "Because public/bin/.release_tags already matched pinned tags, the plain run printed 'Nothing to download, binaries are up-to-date' and never reached the tar extraction branch -- recorded explicitly as 'tar was NOT exercised' rather than left ambiguous."
  - "runTs todo closed (moved to completed/) because all three CONFIRMED conditions held: negative control REPRODUCED (-4058/ENOENT, exit 1), positive run PASSED (exit 0, expected output line, no failure), and the plain download-helper-binaries runTs phase passed (exit 0, no -4058)."
  - "tar todo's `where tar` / `tar --version` result is explicitly scoped as local-Git-Bash-only, not a measurement of the windows-latest CI runner -- the CI runner's own PATH order remains unmeasured and the todo is left open (not closed) for that reason."

requirements-completed: [QUICK-260922-TOC]

duration: ~20min
completed: 2026-09-22
---

# Quick Task 260922-toc: Verify runTs win32 esbuild fix on Windows Summary

**Ran a negative-control-then-positive verification of the runTs.cjs win32 esbuild spawn fix on a real Windows 11 box (reproduced the pre-fix -4058/ENOENT failure, confirmed the current file passes), closed its todo, and retagged the detectVCRedist and tar todos to `ready: code` now that Windows hardware is available.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3/3 completed (Task 2 scoped down per orchestrator override -- plain run only, forced tar-exercising run explicitly excluded)
- **Files modified:** 3 todo markdown files (one `git mv`'d from pending/ to completed/)

## Accomplishments

- **Negative control REPRODUCED** the original defect: `git show 8ed7b8ccd^:meta/runTs.cjs` run via `meta/runTs.prefix-260922-toc.cjs` (temp copy, deleted by a bash `trap ... EXIT`, never staged) failed with `errno: -4058`, `code: 'ENOENT'`, and both `syscall` and `path` naming the resolved esbuild bin (`...\node_modules\esbuild\bin\esbuild`). Exit code 1.
- **Positive run PASSED**: the current committed `meta/runTs.cjs`, same argv (`pnpm build:decompress-worker-dev`), exited 0 and printed `[build:decompress-worker-dev] esbuild-aliased worker bundle -> build\main\decompressWorker.js` with no failure line.
- **F1 re-confirmed** on this box: `require.resolve('esbuild/bin/esbuild')` bin still begins `"#!/usr/bin/env node\n"`.
- **F2/F3 not falsified**: F2 -- plain `pnpm download-helper-binaries` exited 0, printed `Nothing to download, binaries are up-to-date`, no -4058 (tar phase not exercised, recorded explicitly). F3 -- negative-control error object's `syscall`/`path` both name the resolved esbuild bin exactly.
- runTs todo `git mv`'d to `completed/` with a full dated Resolution section (host, commands, one-commit isolation proof, verdict table, two-profile-rule note, scope caveat).
- detectVCRedist todo retagged `ready: blocked` -> `ready: code` with a dated `## Retag` section citing the pre-push-hook precedent.
- tar todo retagged `ready: blocked` -> `ready: code` with a dated `## Local Windows measurements` section: local `where tar`/`tar --version` result (GNU tar 1.35 wins PATH in local Git Bash), explicitly scoped as NOT a CI-runner measurement; Task 2 plain-run note stating tar was not exercised; the pre-existing `public/bin` provenance observation carried over uninterpreted. Todo left open (not closed) -- the forced tar-exercising run and the `fd7d085fb` negative control remain unrun.
- `git status --porcelain` identical to baseline after both Task 1 and Task 2 -- no tracked file left modified, `public/bin` untouched by the plain run.
- `pnpm planning-gates`: 11/12 passed. The one failure (`planning-envelope-tag-gate.py`) is a **pre-existing, unrelated** defect in an already-committed file (`.planning/quick/260922-p57-make-tar-invocations-drive-letter-safe-o/260922-p57-PLAN.md`, committed `1ece9615f` in an earlier session) -- two trailing orphan closing envelope tags. This file is untouched by this task and outside this task's `files_modified` scope; per the scope-boundary rule it was **not** fixed here. See "Known Issues" below.

## Task Commits

Each task was committed atomically per the plan's staging rules (explicit paths only):

1. **Task 1: Negative control (pre-fix runTs) then positive (current runTs), same argv** -- no commit (measurement-only task; the temporary pre-fix copy was created, run, and deleted within the task, never staged, per plan design).
2. **Task 2: pnpm download-helper-binaries plain run (F2)** -- no commit (measurement-only task, scoped to the plain run by orchestrator override; `public/bin` untouched, nothing to stage).
3. **Task 3: Close/retag todos, run gates, commit** -- `<commit-hash-below>` (docs)

_Note: no separate plan-metadata commit was made for this SUMMARY.md per this task's constraints (orchestrator commits SUMMARY.md/STATE.md)._

## Files Created/Modified

- `.planning/todos/completed/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md` -- Moved from `pending/` via `git mv`. Frontmatter gained `status: completed` / `resolved: 2026-09-22` / `resolved_by: quick-260922-toc`; `needs:` line removed; `ready: blocked` left as-is (closed todos are exempt from triage per plan). Body gained a full `## Resolution` section.
- `.planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md` -- `ready: blocked` -> `ready: code`. Appended `## Retag` section.
- `.planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` -- `ready: blocked` -> `ready: code` (`needs:` left unchanged). Appended `## Local Windows measurements` section.

## Decisions Made

- Task 2 was scoped by explicit orchestrator override to the plain `pnpm download-helper-binaries` run only. The forced full re-download (backup/move/restore `public/bin`, exercise the darwin-onedir tar extraction) was deliberately skipped -- it is the tar todo's own remaining work, tracked there, not conflated with the runTs verdict.
- The runTs todo's CONFIRMED decision rule was applied strictly (negative REPRODUCED AND positive PASSED AND plain-run runTs phase passed) -- all three held, so it was closed.
- The tar todo's local `where tar`/`tar --version` measurement was written with an explicit, same-line "NOT ... CI runner" caveat so it cannot be mistaken for a CI-runner measurement -- the todo stays open specifically because that gap (and the forced-run tar exercise) remain unmeasured.

## Deviations from Plan

None affecting committed scope. One pre-existing, out-of-scope gate failure was discovered and deliberately NOT fixed -- see "Known Issues" below (this is the correct application of the scope-boundary rule, not a deviation from it).

## Known Issues

**`pnpm planning-gates` reports 11/12, not 12/12.** The one failure is `.planning/planning-envelope-tag-gate.py`, which flags `.planning/quick/260922-p57-make-tar-invocations-drive-letter-safe-o/260922-p57-PLAN.md` (2 trailing orphan closing envelope tags). This file:
- was committed in an earlier, unrelated session (`1ece9615f`, 2026-09-22 18:32:18 +1200)
- is not in this plan's `files_modified` list
- was not touched by any command run in this task

Per the scope-boundary rule ("Only auto-fix issues DIRECTLY caused by the current task's changes... Pre-existing... failures in unrelated files are out of scope"), this was left unfixed rather than silently patched. The gate itself names the fix precisely ("DELETE THE STRAY TAG(S) FROM THE FILE — and nothing else") if the orchestrator wants a follow-up quick task or todo for it. This task's own three todo files pass all applicable gates: `todo-frontmatter-gate.py` (PASS) and `planning-frontmatter-gate.py` (PASS).

## Self-Check: PASSED

- FOUND: `.planning/todos/completed/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md`
- MISSING: `.planning/todos/pending/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md` (expected -- moved to completed/)
- FOUND: `.planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md` contains `ready: code`
- FOUND: `.planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` contains `ready: code`
- FOUND: `meta/runTs.prefix-260922-toc.cjs` does not exist (temp file correctly deleted)
- FOUND: `git status --porcelain` shows no `runTs.prefix` entry, no `public/bin` changes
- Working tree at end of Tasks 1-2 identical to pre-task baseline (only the two pre-existing untracked entries: phase-46 `.gitkeep` and this task's own directory)

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- detectVCRedist and tar todos are now `ready: code` and can be picked up as desk work on this Windows box.
- The tar todo's remaining work (forced download-helper-binaries run exercising `:89`/`:138` under real tar, plus the `fd7d085fb` negative control) is unchanged and still the next concrete step -- not attempted here per orchestrator scope.
- The pre-existing `planning-envelope-tag-gate.py` failure in `260922-p57-PLAN.md` is unresolved and or should be handled as its own follow-up (a two-line stray-tag deletion in an unrelated, already-completed quick task's plan file).

---
*Plan: quick-260922-toc*
*Completed: 2026-09-22*
