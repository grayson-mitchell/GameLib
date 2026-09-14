---
quick_id: 260913-uez
date: 2026-09-13
description: Close the sidecar exit-contract todo — item 1 shipped, item 2 decided against, item 3 was never a work item
follows: 260913-ty4
files:
  - .planning/todos/completed/2026-09-13-sidecar-stdin-owned-exit-contract-is-undocumented-centrally-and-gated-only-by-smoke-sidecar.md
  - .planning/quick/260913-ty4-write-sidecar-exit-contract-into-claude-md/260913-ty4-PLAN.md
---

# Quick 260913-uez: close the sidecar exit-contract todo

## Why it is being closed, not parked

`260913-ty4` shipped item 1 and then left the todo open on item 2. That was wrong, and the
operator caught it. The reasoning that failed: *"item 2 is an explicit deliberate-decision fence"*
conflates **"do not add a gate reflexively"** (a constraint on how to decide) with **"no decision
has been made"** (a claim about state). The decision *was* made — the no-gate argument was written
into `CLAUDE.md` in `67ed8767b` — and then the todo was left open as though it were still pending.
That is the deferral-shuffle: move the reasoning somewhere real, leave an empty placeholder behind.

Item-by-item at HEAD:

| item | state |
| ---- | ----- |
| 1. Write the contract down centrally | **Shipped** — `67ed8767b`, `CLAUDE.md` conventions region |
| 2. Consider a gate | **Decided against**, on the todo's own argument, recorded in `CLAUDE.md` |
| 3. Beware the grep spelling | **Never a work item** — advisory; now in `CLAUDE.md` |

## Three concrete defects this closure fixes

1. **The title is false at HEAD.** It asserts the contract is "documented only in scattered inline
   comments." Since `67ed8767b` it is a `CLAUDE.md` convention. A stale todo making a false claim
   costs the next reader a redundant investigation.
2. **`ready: code` is wrong and pollutes the queried population.** Nothing code-ready remained.
   `grep -l 'ready: code' .planning/todos/pending/*.md` — the exact query CLAUDE.md's triage
   convention exists to serve — was surfacing this as "pick it up now" with nothing to pick up.
   Closing removes it from `pending/` entirely, which is the clean fix; `completed/` is
   deliberately gate-exempt, so the historical triage keys stay as a record.
3. **The body overstated what remained.** Items 1 and 3 were shipped content still written as
   pending work.

## Tasks

1. Rewrite the todo's title to be true at HEAD; set `status: completed`; add `resolved` /
   `resolved_by`. Replace `## What remains` with a resolution section that keeps all three
   original items visible and records the outcome of each — the gate decision in particular must
   be recorded as **decided**, with its reasoning, not as abandoned.
2. Move `pending/` → `completed/` with **plain `mv`, never `git mv`** — `git mv` pre-stages the
   rename the instant it runs, and on this repo a staged rename gets swept into whatever
   concurrent session commits next; it also commits HEAD content rather than unstaged edits.
   Edit first, then move, then `git add` both paths in the same breath as `git commit`.
3. Repoint the one breadcrumb: `260913-ty4-PLAN.md:5` `source_todo:` still names the `pending/`
   path.
   - **verify:** no file outside this task's own directory still cites the old `pending/` path for
     this todo — grep the todo's slug and exclude `.planning/quick/260913-uez-*`, because a plan
     that quotes the grep pattern in its own verify text will match itself forever and make the
     check permanently non-empty; `pnpm planning-gates` green; `git diff -- src/` empty.
   - **done:** file lives in `completed/`, title true at HEAD, gate decision recorded as decided.

## Out of scope

No gate. That is the decision being recorded, not a deferral. No source changes.
