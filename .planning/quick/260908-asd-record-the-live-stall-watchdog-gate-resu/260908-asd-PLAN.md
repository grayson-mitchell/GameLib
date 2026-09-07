---
phase: quick-260908-asd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md
autonomous: true
requirements: [TODO-260827-STALL]
baseline_sha: d2e44a712
---

## Objective

Record the 2026-09-08 live stall-watchdog gate against the 2026-08-27 todo. Docs-only, zero source
change.

The gate PASSED and settles the discriminator question the todo itself posed, but it does NOT close
the todo: it reproduced a packet-drop stall, not the original empty-auth-token stall.

## Task 1: Record the gate, refute hypothesis A, rewrite the Residual

**Files:** `.planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md`

**Action.** Add a `## LIVE GATE — 2026-09-08` section carrying the measured timeline, both verbatim
abort lines, the 180s-silence control, the refutation of hypothesis A for the stall path, the
narrowing of hypothesis B, the reproducible-but-insufficient empty-auth-token finding, and the four
failed forcing methods. Rewrite the Residual with a narrower discharge condition; demote the old one
to SUPERSEDED rather than deleting it, so the correction carries a date instead of quietly replacing
the earlier claim. Keep `status: OPEN` and leave the file in `pending/`.

Written by the orchestrator inline rather than delegated to a `gsd-executor`: the measured values
existed only in the live session's context, and a records task whose entire value is measurement
accuracy is the wrong place to risk an agent paraphrasing numbers it cannot see.

**Verify.**

```
grep -c "^status: OPEN"        <todo>   # 1
grep -c "LIVE GATE — 2026-09-08" <todo>  # 1
npx prettier --check <todo>              # clean
git diff --stat -- src/                  # empty (docs-only)
ls .planning/todos/completed/2026-08-27-stall-watchdog-*  # No such file
```

**Done.** Todo carries the gate result, stays OPEN in `pending/`, prettier clean, `src/` untouched.

## Success criteria

- The record states plainly that the gate does NOT close the todo, and why.
- Hypothesis A is marked refuted *for the stall path only*, with the resolved-error warning
  explained as by-design rather than as corroboration.
- Hypothesis B is narrowed, not declared settled.
- The failed forcing methods are recorded so they are not retried.
