---
phase: quick-260916-bes
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md
  - .planning/todos/pending/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md
  - .planning/todos/completed/2026-08-27-stall-watchdog-leaves-the-download-running.md
  - .planning/STATE.md
  - .planning/quick/260916-bes-split-and-close-the-stall-watchdog-todo/260916-bes-SUMMARY.md
autonomous: true
requirements: [QUICK-260916-bes]

must_haves:
  truths:
    - "The closure is justified by the TITLE being false at HEAD, not by the work being finished — the 2026-08-27 wedge's cause is still unidentified and the close says so in those words"
    - "Both surviving open questions leave the closing file as their own pending todos BEFORE the close lands, so closing cannot discard them"
    - "Each new pending todo carries severity/platform/ready bare and lowercase, in that order, or planning-gates goes red"
    - "The closed file names both split-out filenames verbatim, and each split-out file names the closed file verbatim — the breadcrumb resolves in both directions"
    - "No source file is touched: the code half shipped in 260907-sxp, 260908-asd and 260909-q2o and is verified present at HEAD"
    - "STATE.md's last_activity is PREPENDED INSIDE its existing single quotes, apostrophes doubled, with the old value asserted as a suffix of the new one and the length asserted to have GROWN"
  artifacts:
    - path: ".planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md"
      provides: "Survivor 1 — the unidentified cause, stated with its refuted/neutralised hypotheses and the forcing methods already known to fail"
      contains: "ready: human"
    - path: ".planning/todos/pending/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md"
      provides: "Survivor 2 — the never-tested throttling question from the parent's `Not yet established` section"
      contains: "ready: live-gate"
    - path: ".planning/todos/completed/2026-08-27-stall-watchdog-leaves-the-download-running.md"
      provides: "The closed parent, with a closure section recording WHY the title is false and WHERE the survivors went"
      contains: "resolved_by: \"quick-260916-bes\""

verify:
  - "python3 .planning/todos/todo-frontmatter-gate.py exits 0"
  - "pnpm planning-gates exits 0 with every gate green"
  - "git show --stat HEAD names zero files under src/"
---

## Task

Close `.planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md` after
splitting its two surviving open questions into their own pending todos.

## Why this is a close and not a fix

Every code fix the todo prescribes has shipped and is verified present at HEAD:

| quick | what landed | verified at HEAD |
|---|---|---|
| `260907-sxp` | `trip()` calls `callAbortController(appName)` itself, gated on `hasAbortController`, before rejecting | `installStallWatchdog.ts:101-107` |
| `260908-asd` | live gate, Tauri shell, BATTLETECH `637090` — watchdog tripped at 480s, both abort paths took the INFO branch, depot loop died in the same second, stayed dead across a `pf` restore | recorded in the todo body |
| `260909-q2o` | `AbortSignal` threaded through `CdnAuthTokenCache.getToken` | `cdnAuth.ts:441`, `awaitOrAbort` at `:503` |

The title asserts the download is "never cancelled" and "the depot loop runs on indefinitely".
That is **false at HEAD** and was measured false on 2026-09-08.

## What must not be lost

Two questions in the body are NOT answered, and closing on the false title would discard them:

1. **The 2026-08-27 wedge's cause is still unidentified.** Hypothesis A (registry clobber) is
   refuted; Hypothesis B (abort-blind `cdnAuth.ts`) is neutralised in code but was never observed
   as the cause. No runnable experiment is proposed for a third cause.
2. **Whether the CDN auth-token failures were self-inflicted** (Steam throttling after several
   large downloads were started and cancelled in that session) — listed under `Not yet
   established` and never tested.

A third item in that section, the non-Steam runner coverage question, is NOT a survivor: F5
settled it on 2026-09-07 as a measured finding (coverage is intermittent for the four CLI runners
and absent for sideload installs, by design, which is why the `hasAbortController` gate is
load-bearing). It is already struck through in the parent and needs no new file.

## Tasks

1. Write survivor 1 to `pending/`, `ready: human`, `severity: medium`.
2. Write survivor 2 to `pending/`, `ready: live-gate`, `severity: minor`.
3. `git mv` the parent to `completed/`, then edit frontmatter (`status: completed`, `resolved`,
   `resolved_by`) and append a closure section naming both survivors.
4. Update STATE.md: append a Quick Tasks row, prepend `last_activity` in place.
5. Run `pnpm planning-gates`; commit.

## Traps carried into this task

- **`git mv` commits HEAD content, not unstaged edits.** Move FIRST, edit SECOND, and assert the
  staged blob — an `R100` in `git show --stat` means the edits were dropped.
- **The frontmatter gate scopes to `pending/` only.** The moved file stops being gated the moment
  it lands in `completed/`; its triage keys are left intact anyway for the record.
- **STATE.md `last_activity` is a single-quoted single-line scalar, not a `|-` block.** Prepend
  inside the quotes, double apostrophes, assert suffix + growth. A wholesale rewrite silently ate
  29.7k characters on 2026-09-09.
