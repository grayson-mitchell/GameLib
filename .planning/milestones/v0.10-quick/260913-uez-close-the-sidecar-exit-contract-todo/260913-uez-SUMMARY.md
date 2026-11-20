---
quick_id: 260913-uez
date: 2026-09-13
status: complete
description: Close the sidecar exit-contract todo — item 1 shipped, item 2 decided against, item 3 was never a work item
follows: 260913-ty4
files_modified:
  - .planning/todos/completed/2026-09-13-sidecar-stdin-owned-exit-contract-is-undocumented-centrally-and-gated-only-by-smoke-sidecar.md
  - .planning/quick/260913-ty4-write-sidecar-exit-contract-into-claude-md/260913-ty4-PLAN.md
  - .planning/STATE.md
---

# Quick 260913-uez — the exit-contract todo is closed

## What changed

The todo moved `pending/` → `completed/` with its title corrected, `status: completed`,
`resolved` / `resolved_by` added, and a `## RESOLUTION` section that records the outcome of all
three items. The original `## What remains` text is kept verbatim beneath it, relabelled as
superseded, so the reasoning that produced the convention stays readable.

| item                                 | outcome                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------- |
| 1. Write the contract down centrally | **Shipped** — `67ed8767b`, the `CLAUDE.md` convention                   |
| 2. Consider a gate                   | **Decided against**, with reasoning — not deferred                      |
| 3. Beware the grep spelling          | **Never a work item**; advisory, now living in `CLAUDE.md`              |

## The correction this closure exists to make

`260913-ty4` shipped item 1 and then left the file open on item 2, reasoning that *"item 2 is an
explicit deliberate-decision fence."* That conflated **"do not add a gate reflexively"** (a
constraint on how to decide) with **"no decision has been made"** (a claim about state). The
decision had already been made and written into `CLAUDE.md` in that same commit. The todo was left
holding an empty placeholder — the reasoning moved somewhere real, the ticket stayed open anyway.

The operator caught it. Three concrete defects followed from it, all now fixed:

1. **The title was false at HEAD**, asserting the contract was "documented only in scattered
   inline comments" when it had been a `CLAUDE.md` convention for an hour.
2. **`ready: code` sat in `pending/` with nothing code-ready in it** — polluting the exact
   `grep -l 'ready: code' .planning/todos/pending/*.md` query that CLAUDE.md's triage convention
   exists to serve. Closing removes it from that population entirely; `completed/` is
   deliberately gate-exempt, so the historical triage keys remain as a record.
3. **The body overstated what remained**, with two shipped items written as pending work.

## The gate decision, as recorded

No gate, on the todo's own argument: a source gate over sidecar-reachable
`setInterval`/`setTimeout`/watcher/socket creation would have caught **none of the three real
breaks cleanly** and cannot see the in-flight class at all. A burden-of-proof note is attached for
any future proposal — show it can see the in-flight class, rather than merely observing that the
contract is unguarded, which is already stated in `CLAUDE.md`.

## Two traps hit while doing this

- **`git mv` was avoided deliberately.** It pre-stages the rename the instant it runs, and on this
  repo a staged rename gets swept into whatever concurrent session commits next; it also commits
  HEAD content rather than unstaged edits. Used plain `mv`, edited before moving, and staged both
  paths only in the same breath as the commit. Verified `git status` showed ` D` + `??` with
  nothing in column 1 before staging.
- **A plan that quotes its own grep pattern matches itself forever.** The first verify pass
  returned two "stale reference" hits that were both inside this task's own PLAN.md — one a
  `files:` entry naming the now-nonexistent `pending/` path (real, fixed), one the verify
  instruction quoting the search string (self-referential, reworded). A check that can never come
  back empty is not a check.

## Verification

| check                                              | result                                   |
| -------------------------------------------------- | ----------------------------------------- |
| stale `pending/` citations outside this task's dir | none                                      |
| `pnpm planning-gates`                              | 11/11                                     |
| `git diff -- src/ src-tauri/ meta/`                | empty — docs-only                         |
| todo location                                      | `completed/`, `status: completed`         |
| STATE.md `last_activity`                           | 44,495 → 45,032 chars; old value asserted intact as a suffix |
