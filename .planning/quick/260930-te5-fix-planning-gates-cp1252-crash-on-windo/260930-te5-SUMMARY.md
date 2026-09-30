---
phase: quick-260930-te5
plan: 01
subsystem: planning-gates
tags: [python, windows, cp1252, subprocess, encoding]
requires: []
provides:
  - plain `pnpm planning-gates` passes 12/12 on Windows with no env var
  - UTF-8-exact node pipe in the frontmatter gate, pinned by two self-test cases
key-files:
  created:
    - .planning/quick/260930-te5-fix-planning-gates-cp1252-crash-on-windo/te5-ablate.py
  modified:
    - .planning/planning-frontmatter-gate.py
    - .planning/todos/completed/2026-09-30-planning-frontmatter-gate-crashes-on-windows-cp1252.md
decisions:
  - "Fix is the encoding declaration at both ends of the node pipe plus an error handler on stdout; no interpreter-mode env var, runner unchanged"
status: complete
completed: 2026-09-30
commits: 3
plan_head_before: 26c6d1458ec9c5bd4fcaf5f8a7ecc54cba1fd1e0
plan_head_after: 9bbc5d0e0ecda4cfc2d9dfd132a948609335ecba
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
---

# Phase quick-260930-te5 Plan 01: Fix planning-gates cp1252 crash on Windows Summary

Plain `pnpm planning-gates` on Windows now reports 12/12. The frontmatter gate declares UTF-8 at both ends of its node pipe and prints through a `backslashreplace` stdout, and the change is pinned by self-test cases that an ablation harness shows can fail.

## Before / after

Measured on this host (`utf8_mode 0`, cp1252, `PYTHONUTF8` and `PYTHONIOENCODING` unset).

- Pre-edit plain run: exit 1, `11/12 planning gates passed.`, and `UnicodeEncodeError: 'charmap' codec can't encode character` for U+2192, raised from `run_parser`.
- Post-edit plain run: exit 0, `12/12 planning gates passed.`, 0 matches for Traceback, UnicodeEncodeError or UnicodeDecodeError. Re-run after every task, including after the final one.
- `PYTHONUTF8=1 pnpm planning-gates`: 12/12.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 (tracer) | 1077019aa | `.planning/planning-frontmatter-gate.py` |
| 2 | 13779d81f | `.planning/planning-frontmatter-gate.py`, `te5-ablate.py` |
| 3 | 9bbc5d0e0 | todo moved from `pending/` to `completed/` |

## The three edits (in the gate)

- (a) `run_parser` passes `encoding="utf-8", errors="strict"`. The old cp1252 default both crashed on U+2192 and silently corrupted cp1252-encodable characters such as the em-dash.
- (b) `NODE_YAML_PARSE_JS` calls `process.stdin.setEncoding("utf8")` so a character split across a stdin chunk is not replaced.
- (c) `main()` reconfigures stdout with `errors="backslashreplace"`, encoding unchanged. Needed because js-yaml renders a TAB as U+2192 in error text and the gate prints that to a cp1252 pipe.

## Ablation results (`te5-ablate.py`)

```
control: exit=0 marker_found=n/a OK
no-utf8-pipe: exit=1 marker_found=yes OK
no-setEncoding: exit=1 marker_found=yes OK
no-stdout-backslashreplace: exit=1 marker_found=yes OK
```

## Audit verdicts (brief)

FIX: the gate's `run_parser` subprocess, its node stdin handling, and its stdout. NO CHANGE, each with a written reason in the todo: the runner's `subprocess.run(text=True)`, the envelope-tag gate's `git ls-files` (ASCII-only output under default `core.quotePath`) and `git init`/`git add` (no capture), and the 34.4.1 `git diff --stat` (ASCII path and counts only). Every `read_text`/`write_text` already specifies `encoding="utf-8"`. No bare `open(`, `check_output`, `Popen`, `universal_newlines` or `os.popen` exists.

## Residuals (recorded, not fixed)

- The envelope-tag gate's `git ls-files` discovery would silently exclude a non-ASCII tracked path (git quotes it and the quoted form fails the `.md` suffix test). Discovery-class defect, latent at 0 instances.
- When the runner echoes a failing gate's output into a cp1252 pipe read by a UTF-8 terminal, non-ASCII displays as U+FFFD. Display-only, never a crash.

## Honest limits

- macOS and Linux were not run; PYTHONUTF8=1 pnpm planning-gates reporting N/N is the stand-in, and ubuntu CI will be the first real non-Windows run.
- Self-test Case A cannot discriminate on a UTF-8-locale host, so CI cannot see the cp1252 half of this defect; only a Windows run can.
- The runner was deliberately left unchanged.

Case B's discrimination was measured on this Windows machine only, not in CI.

## Deviations from Plan

**1. [Verify-block defect, not a code change] Literal glyph grep for the tab marker.**
- **Found during:** Task 1 verify.
- **Issue:** The Task 1 verify and done text grep the piped gate output for the glyph `→ACTIVE`. The plan's own must-have truth, and `backslashreplace` itself, say a piped run prints the escaped form instead (the output contains the ASCII text `u2192ACTIVE` preceded by a backslash, and no glyph). The glyph grep therefore cannot pass with the fix correctly in place.
- **Resolution:** Confirmed by `od -c` that the piped output carries the backslash-escaped form and 0 glyph occurrences, and verified that form (matched on `u2192ACTIVE`; a `grep -F` with a leading backslash also failed to match in this Git Bash, so the match was done without the backslash). All other Task 1 verify clauses passed: 12/12 tally, no Unicode error or Traceback, runner byte-unchanged, 0 `env=` occurrences in the gate.

**2. [Tooling note] `\u` escapes in written files.** The Write tool and a Bash heredoc both turned `→` into the literal glyph on first write. The inserted self-test region was corrected to ASCII `\u` escapes (verified: 0 non-ASCII characters in the diff's added lines) before commit.

**3. [Side effect] `git checkout -- <gate file>`** used to discard a mangled uncommitted edit fired the repo's husky post-checkout hook (`pnpm install`, helper-binary check). The tree stayed clean, and nothing was committed from it.

**4. Branch.** Commits were made on `main`, matching the repo's existing practice and the orchestrator's instruction. `git.allow_default_branch_commits` is not set in `.planning/config.json`, so the generic protected-branch assertion was not applied.

## Known Stubs

None.

## Threat Flags

None. The harness prints no paths or environment, the full pre-fix capture stayed in the session scratchpad, and no package was installed.

## Self-Check: PASSED

- `te5-ablate.py`, the modified gate and the completed todo exist; the pending todo path is gone.
- Commits 1077019aa, 13779d81f and 9bbc5d0e0 exist on `main`, and `git rev-list --count 26c6d1458..HEAD` is 3.
- `meta/runPlanningGates.py` is unchanged (`git diff --quiet HEAD` exits 0).
