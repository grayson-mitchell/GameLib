---
quick_id: 260913-ty4
date: 2026-09-13
status: complete
description: Write the sidecar's stdin-owned exit contract into CLAUDE.md as a convention
files_modified:
  - CLAUDE.md
  - .planning/STATE.md
scope_closed: item 1 of the exit-contract todo
scope_left_open: item 2 (consider a gate) — deliberate, see below
---

# Quick 260913-ty4 — the sidecar exit contract is now written down once, centrally

## What shipped

A new `### The sidecar's exit contract (stdin owns its lifetime)` convention in `CLAUDE.md`,
immediately after the fake-HOME two-profile rule. 63 insertions, **0 deletions** — a pure addition.

It states the invariant once:

> **No handle may hold a reference to the event loop past stdin EOF.**

and carries, in order: the correction that the absent `'end'` handler is *by design* and that the
Rust shell reaps the child as a backstop; **both halves** of the contract; the three-break evidence
table; an honest statement of what enforces it; the argument against a reflexive gate; and the
grep trap.

**Both halves are stated, which was the point.** Half 1 is `unref()` every handle you create.
Half 2 is *do not leave unbounded in-flight work at boot*, with the explicit note that `unref()` is
the **wrong tool** for that class — parked sockets are already unreferenced and hold nothing, while
in-flight requests are referenced by definition. That is what `260913-m9c` measured, and it is why
the contract needed stating rather than just more `unref()` calls.

## Placement — why a hand edit here is safe

The conventions block is wrapped in `<!-- GSD:conventions-start source:CONVENTIONS.md -->`, which
looks like a generated region. It is not live, verified two ways:

- `.planning/spikes/CONVENTIONS.md` is a 144-line "Spike Conventions" file (Stack / Structure /
  Patterns / Tools & Libraries) containing **none** of CLAUDE.md's conventions text.
- `d7d021a05` hand-wrote the neighbouring two-profile convention straight into this region.

## Facts re-measured rather than copied from the todo — one was wrong

| claim                      | todo said     | measured at this tree                                                    |
| -------------------------- | ------------- | ------------------------------------------------------------------------ |
| `shutdown_child()`         | `main.rs:1158` | **`:1182`** — `:1158` is the doc comment; called at `:9631` under `RunEvent::Exit` (`:9629`) |
| `unref()` call sites       | 13            | **13** (11 in `src/`, 2 in `meta/coldBootTiming.ts`)                     |
| optional-call dominance    | 8 of 13       | **8 of 13**; the other 5 are plain `.unref()`                            |
| `\.unref()` undercount     | returns 5     | **returns 5** real sites                                                 |
| `STARTUP_TIMEOUT_MS`       | 30s           | `30_000` at `sidecarStartupSmoke.cjs:78`                                 |
| CI wiring                  | `test.yml:32` | `run: pnpm smoke:sidecar` at `test.yml:32`                               |
| break SHAs                 | `ef77e4a1e`, `9e8e1b224` | both exist; dates and subjects match                          |

**The census trap fired live during verification**, which is why it is now written into the
convention. A bare `grep -rn 'unref'` returns 45 lines because comment prose mentions `unref()`
constantly, and `grep '\.unref()'` returns 5 because the dominant spelling is `.unref?.()`. My own
first pass reported "7 plain sites" — comment-contaminated. The 13 was only reached by matching
both spellings *and* stripping comment lines.

## What was deliberately NOT done

- **No gate.** Item 2 of the todo says to decide deliberately and not add one reflexively, and the
  reasoning holds: a source gate over timer/watcher creation would have caught none of the three
  breaks cleanly and cannot see the in-flight class at all. That is the
  green-check-proving-nothing shape. The argument is now recorded in CLAUDE.md so the next person
  inherits the reasoning rather than re-deriving it.
- **No source changes.** No `'end'` handler on `startRpcServer()`, no weakening of
  `installUncaughtExceptionGuard()`, no raising `STARTUP_TIMEOUT_MS` — the todo fences all three
  and all three remain untouched.
- **The todo stays in `pending/`.** Item 2 is still open; closing the file would bury it.

## Verification

| check                                   | result                                         |
| --------------------------------------- | ---------------------------------------------- |
| `git diff --numstat -- CLAUDE.md`       | `63  0` — pure addition, no existing line touched |
| `npx prettier --check CLAUDE.md`        | clean (after `--write` reformatted only the new tables) |
| `pnpm planning-gates`                   | 11/11                                          |
| `git diff -- src/ src-tauri/ meta/`     | empty — docs-only                              |
| STATE.md `last_activity`                | 43,901 → 44,495 chars; old value asserted intact as a suffix |

## Process note

Executed inline rather than via `gsd-planner` + `gsd-executor` subagents. Stated plainly because it
is a deviation from the `/gsd-quick` workflow: `workflow.use_worktrees` is `false`, so an executor
would have worked the shared dirty tree, and this repo has a long record of executors writing
`.planning/STATE.md` against explicit prohibition and of scope being scaled down by re-filing
findings. The content was also fully determined by the todo and needed measurement-accurate prose —
an executor re-deriving the census would most likely have hit the `.unref()` grep trap documented
above. All workflow artifacts (PLAN, SUMMARY, STATE row, atomic path-scoped commit) were produced.
