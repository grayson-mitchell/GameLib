---
phase: quick-260925-o9b
plan: 01
subsystem: planning-todos
tags: [tooling, gsd-sdk, todo-triage]
requires: []
provides:
  - "Closed report-upstream todo (completed/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md) with a Resolution section explaining why nothing was filed upstream"
  - "New pending decision todo (pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md) framing migrate/fork-and-pin/stay-frozen as an open human call"
affects:
  - ".planning/todos/pending/"
  - ".planning/todos/completed/"
tech-stack:
  added: []
  patterns:
    - "git mv + append-only Resolution section for closing a todo as obsolete without disturbing its original body or frontmatter"
key-files:
  created:
    - .planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md
  modified:
    - .planning/todos/completed/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md (moved from pending/, Resolution section appended)
decisions:
  - "Closed the report-upstream todo as obsolete rather than filing anything: the named repo (gsd-build/get-shit-done) was archived read-only 2026-06-26 with 0 open issues, and get-shit-done-cc on npm is deprecated and frozen at 1.42.3 -- no fix can ever land in the version GameLib runs regardless of who reports what."
  - "Opened a separate decision todo rather than folding the live exposure into the closure, so the migrate/fork-and-pin/stay-frozen question stays visible and undissolved."
metrics:
  duration: "~15 minutes"
  completed: 2026-09-25
---

# Phase quick-260925-o9b Plan 01: Close obsolete report-upstream todo, open successor decision todo Summary

Closed the 2026-09-24 report-upstream todo as obsolete (moved to `completed/` with a Resolution
section recording why nothing was filed) and opened a new `pending/` todo that puts the real
remaining question -- migrate off the deprecated, archived `get-shit-done-cc` line, fork-and-pin
it, or stay frozen -- in front of a human with no recommendation.

## What was done

**Task 1** — `git mv`'d
`.planning/todos/pending/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md` to
`completed/` (confirmed tracked as a rename, `R` in `git status --porcelain`), then appended a
`## Resolution (2026-09-25): closed as obsolete — no reportable upstream exists` section. The
original body and frontmatter (`severity: minor`, `platform: any`, `ready: human`) were left
byte-identical -- verified by the staged-diff check finding zero removed body lines. The appended
section records: the named repo's 2026-06-26 archival (0 open issues, nowhere to file); the npm
package's deprecation and frozen 1.42.3 version; the `open-gsd/gsd-core` successor and its file
relocation (`sdk/src/query/state-document.ts` -> `src/state-document.cts`,
`sdk/src/query/state-mutation.ts` -> `src/state.cts`); the three of four suggested fixes already
fixed upstream (#4243, #1255, ADR-1372 T6, plus already-closed #4481/#4823/#4469/#4419); the
residual suggestions 1-2 tracked by open epic #4629; the deliberate decision not to re-report; the
untouched GameLib-local workaround; and the absent `gh` CLI. The section ends by naming the
successor todo by filename.

**Task 2** — Created
`.planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md`
with `area: tooling`, `severity: medium`, `platform: any`, `ready: human` in that exact adjacent
order (verified by the pipe-joined exact-match check, which fails on reorder/quoting/interleaving).
The body states what GameLib pins, why the pin is a dead end, what the successor is, and frames
migrate / fork-and-pin / stay-frozen as a neutral, un-prejudged decision -- no recommended answer,
no migration steps sketched.

## Gate results (measured, not assumed)

- **`pnpm planning-gates`**: ran successfully via `python3` directly on this invocation -- 13/13
  PASS, including `.planning/todos/todo-frontmatter-gate.py` over the enlarged `pending/` corpus
  and `.planning/state-sdk-field-anchor-gate.py`. Note: this contradicts the environment note that
  `python3` does not resolve in this shell (the note said it hits the Microsoft Store shim); on
  this run `pnpm planning-gates` succeeded directly with no need for the `py` fallback. Reported
  honestly as measured, not reconciled against the prior note.
- **`npx prettier --check`** was run on both exact written paths, per CLAUDE.md's
  formatter-check convention. Both runs printed "All matched files use Prettier code style!" and
  exited 0 -- but this is a **NO-OP, not a passed formatting gate**: `.planning` is listed in
  `.prettierignore`, so prettier never actually read either file's content. Formatting instead
  rests on hand-matching the surrounding todo corpus's wrap width and heading style. Recording
  this explicitly per the plan's instruction, to avoid the green-check-proving-nothing pattern.
- **Zero network verification was performed** in this execution. All upstream facts (archival
  date, npm deprecation/version/dates, gsd-core issue numbers, file relocations) were transcribed
  from research already completed in the parent session on 2026-09-25, per the plan's explicit
  instruction not to re-verify over the network.

## Check 4: other references to the old path

`grep -rn 'report-gsd-sdk-unanchored' .planning --include='*.md' -l` found 4 files:

- `.planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md`
  (the new todo created here) -- correctly points at the new `completed/` path. Not a stale
  pointer.
- `.planning/quick/260925-o9b-close-obsolete-report-upstream-todo-and-/260925-o9b-PLAN.md` -- this
  plan's own specification. Historical/generative, not a live index; left verbatim.
- `.planning/quick/260924-vku-restructure-state-md-so-gsd-sdk-state-ve/260924-vku-SUMMARY.md` and
  `260924-vku-PLAN.md` -- historical records describing the todo's `pending/` location at the time
  that plan executed (it created the file there and its self-check confirmed it at that path).
  Per the plan's instruction to leave historical records verbatim, these were **not** repointed.

No live pointer required repointing.

## Deviations from Plan

### Auto-fixed Issues (Rule 3 -- blocking issue, not architectural)

**1. Removed accidentally-swept concurrent-session changes from Task 1's commit**
- **Found during:** immediately after committing Task 1
- **Issue:** The first `git commit` for Task 1, despite `git add` being scoped only to the todo
  file, produced a commit touching a second file,
  `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md`.
  That file carries live, unrelated work from the concurrently-running quick task `260925-nxt`
  (visible as an untracked plan directory in this same working tree, since worktree isolation is
  disabled for this run and all sessions share the `main` branch directly). The file must have
  been staged by that concurrent process between the conversation-start `git status` snapshot and
  my commit.
- **Fix:** `git reset --soft HEAD~1` (moves HEAD back one commit, index/working tree unchanged --
  no data loss), then `git reset <path>` to unstage the two files that turned out to belong to the
  other session (`38-VERIFICATION.md` and, discovered in the same pass, `34.1-VERIFICATION.md`),
  then recommitted Task 1 with only its own file staged. Verified via `git diff --cached --stat`
  showing exactly one file before each of the two final commits.
- **Files modified:** none beyond the plan's own scope -- the two swept-in files were restored to
  their pre-existing unstaged-modified state, untouched by this task.
- **Commit:** superseded by `356cfd73e` (Task 1) and `4874a5018` (Task 2), both single-file.

No other deviations. Both tasks otherwise executed exactly as written.

## Known Stubs

None. No code was touched; both artifacts are complete prose todos.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes were
introduced -- this plan only moved and created plain-text planning documents under
`.planning/todos/`.

## Self-Check: PASSED

- `.planning/todos/completed/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md` -- FOUND
- `.planning/todos/pending/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md` -- correctly MISSING (moved)
- `.planning/todos/pending/2026-09-25-decide-whether-to-migrate-off-deprecated-get-shit-done-cc.md` -- FOUND
- Commit `356cfd73e` -- FOUND in `git log --oneline --all`
- Commit `4874a5018` -- FOUND in `git log --oneline --all`
- `pnpm planning-gates`: 13/13 PASS (measured, this run)
