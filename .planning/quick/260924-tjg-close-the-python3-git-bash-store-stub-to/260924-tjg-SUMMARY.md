---
phase: quick-260924-tjg
plan: 01
subsystem: planning-docs
tags: [todo-closeout, git-bash, python3, no-code-change]
dependency-graph:
  requires: []
  provides: [python3-git-bash-store-stub-todo-closed]
  affects: [.planning/todos]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - .planning/todos/completed/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md
decisions:
  - "Closed the python3/Git-Bash Store-stub todo as VERIFIED-NOT-A-DEFECT with no code change."
  - "Direction item 4 (a CLAUDE.md conventions note) decided AGAINST by the operator; not added."
  - "Direction item 3 (disabling the Store app-execution alias) left unverified and untested by design."
metrics:
  duration: "~15 minutes"
  completed: 2026-09-24
---

# Quick 260924-tjg: Close the python3 Git-Bash store-stub todo Summary

Closed `.planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md` as VERIFIED-NOT-A-DEFECT by re-measuring its four Verification bullets, recording a `## Resolution` section, and `git mv`-ing it to `.planning/todos/completed/`. No code, config, or gate was touched.

## What Was Done

**Task 1 — Recorded the resolution in place (commit `f0996e2d4`).** Edited the todo while still in `pending/`:
- Frontmatter: `status: OPEN` → `status: RESOLVED`, added `resolved: 2026-09-24`, `resolved_by: quick-260924-tjg`, and an optional `resolution:` one-liner stating this was closed without a fix.
- Left `## Problem`, `## Why it matters`, `## Direction`, and `## Verification` byte-identical.
- Added a `## Resolution` section (before `## Related`) covering, per the plan's four required points:
  1. All four original Verification bullets re-measured 2026-09-24, reproducing exactly (Store-stub text + exit 49 under Bash `python3`; `Python 3.12.10` under Bash `python`; `python3.cmd` still ordered before the WindowsApps stub under cmd; `pnpm planning-gates` still 12/12) — plus the extra `type -a` evidence naming the mechanism: Bash's `python3` resolves to *only* the WindowsApps stub because Bash will not resolve a bare name to a `.cmd` file.
  2. The decision: no code change to `package.json:42`, and no CLAUDE.md conventions note (Direction item 4 decided against).
  3. A plain statement that enforcement is now essentially nil — the completed todo file is the entire durable record, and nothing prevents a repeat of the exact misreading that happened in quick `260924-pm3`.
  4. A plain statement that Direction item 3 (disabling the Store app-execution alias) remains unverified and untested.

**Task 2 — Moved to completed/ (commit `758cb600e`).** Ran `git mv .planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md .planning/todos/completed/`. Git recorded a clean 100% rename with zero content diff (the edit had already landed in Task 1's commit).

## Verification Results (actual values observed this run)

- `pnpm planning-gates` → **12/12 planning gates passed** (observed directly; matches the plan's expected value, not assumed).
- `git status --porcelain -- .planning/todos` showed `R  ...pending/... -> ...completed/...` — a rename, not a delete+add.
- `git status --porcelain -- package.json CLAUDE.md src meta src-tauri .github .planning/ROADMAP.md .planning/STATE.md` returned empty both before and after the move — no out-of-scope file touched.
- `git diff --name-only` after Task 1 named exactly one file, the todo itself.
- The completed file's `## Resolution` section grep-verified to contain: `exit 49` context (Store-stub text), `Python 3.12.10`, `python3.cmd` ordering, `12/12`, `type -a`, `260924-pm3`, and the CLAUDE.md-note-decided-against statement.
- `npx prettier --check` was run over both the pending-path and completed-path forms of the file, per CLAUDE.md's formatter convention. **Both runs were vacuous, as the plan flagged in advance**: `.planning` is in `.prettierignore`, so prettier matched zero files and printed "All matched files use Prettier code style!" having checked nothing. This is not counted as a formatting guarantee — it is reported here as a no-op, exactly as instructed.

## Deviations from Plan

None. The plan's pre-gathered evidence table matched what I re-derived from reading the todo file itself, and the `pnpm planning-gates` value I observed (12/12) matched the plan's stated expectation exactly — I ran it myself rather than trusting the plan's number.

## Known Stubs

None — this plan changed no code, no UI, no data flow.

## Threat Flags

None — no new network endpoint, auth path, file-access pattern, or schema change was introduced. This plan is a planning-document edit and a `git mv`.

## Self-Check: PASSED

- `.planning/todos/completed/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md` — FOUND (confirmed via `test -f`).
- `.planning/todos/pending/2026-09-24-python3-in-git-bash-is-a-store-stub-exiting-49-not-a-missing-python.md` — CONFIRMED ABSENT (confirmed via `test ! -e`).
- Commit `f0996e2d4` — FOUND in `git log`.
- Commit `758cb600e` — FOUND in `git log`.
