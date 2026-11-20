---
phase: quick-260916-bes
status: complete
date: 2026-09-16
files_changed:
  - .planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md
  - .planning/todos/pending/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md
  - .planning/todos/completed/2026-08-27-stall-watchdog-leaves-the-download-running.md
  - .planning/STATE.md
---

## What shipped

Docs only. **Zero files under `src/` were touched** — the code half of the parent todo had already
shipped across three earlier quicks and was verified present at HEAD before anything was written.

1. **Two split-out pending todos**, written BEFORE the close so the move could not discard them.
2. **The parent closed** to `completed/`, with `status: completed`, `resolved: 2026-09-16`,
   `resolved_by: "quick-260916-bes"`, a `resolution:` line that says the close is on a false title,
   and a closure section naming both survivors by filename.
3. **STATE.md** — one Quick Tasks row, `last_activity` prepended in place.

## The justification, stated honestly

The parent was closed because its **title is false at HEAD**, not because its subject was resolved.
The title asserts the depot loop "runs on indefinitely" after a watchdog trip. The 2026-09-08 live
gate measured the opposite — trip at 480s, both abort paths on their INFO branch against a live
controller, one final stats line in the same second, no revival across a `pf` restore three minutes
later — and the code that produces that behaviour is still at HEAD
(`installStallWatchdog.ts:101-107`, `cdnAuth.ts:441`).

**What this close does NOT claim:** that the 2026-08-27 wedge is explained. It is not. Hypothesis A
refuted, Hypothesis B neutralised-in-code but never observed as the cause, no experiment proposed
for a third. That is now `2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-...md`,
`severity: medium`, `ready: human`.

## Survivor accounting

The parent's body was read for rival candidates before the move, because closing on a false title
is exactly how untested siblings get discarded. Three candidates, three dispositions:

| candidate | disposition |
|---|---|
| The 2026-08-27 wedge's unidentified cause | **Split out** — `medium`, `ready: human`. No runnable experiment exists, so it is a decision, not a code task. |
| Whether the CDN auth-token failures were self-inflicted (throttling after several cancelled large downloads) | **Split out** — `minor`, `ready: live-gate`. Never tested. `minor` because the condition is known benign on its own: reproduced unprompted 2026-09-07 while the download ran through it at 7-9 MiB/s to 100% in 105s. |
| Whether other `withStallTimeout` callers leak the same way | **Not a survivor.** F5 settled it 2026-09-07 as a measured finding; already struck through in the parent. No file. |

## Grading note, because a downgrade is a claim

The residual carries `medium`, not `minor`. `minor` means "a latent trap with no live consequence",
which would assert more confidence than anyone has: a real defect was observed once with a known-bad
outcome, its cause is unknown, and unknown cause means it is **not known to be fixed**. Bounded blast
radius (one orphaned loop per session, reaped by quitting) plus an existing workaround is `medium`
exactly. It is not `major` because the mechanism that grade was assigned for — "the abort is never
signalled" — has been measured false.

## Verification

- `pnpm planning-gates` — **11/11 passed**, run twice (after the todo writes, and again after the
  STATE.md edit).
- `npx prettier --check` on all four changed/created markdown files — clean.
- **`git mv` trap checked explicitly.** `git mv` commits HEAD content, so the edits were asserted
  against the **staged blob**, not the worktree file:
  `git show :.planning/todos/completed/...md | grep -c "CLOSED — 2026-09-16"` returned 1, and the
  staged frontmatter shows `status: completed`.
- **STATE.md invariants asserted, not assumed.** `last_activity` 60,675 -> 61,593 chars, old value
  confirmed a **suffix** of the new one (growth alone does not prove the middle survived);
  `stopped_at` byte-identical. Both parsers re-read it clean — `gsd-sdk query frontmatter.get` and
  `js-yaml` (61,517 chars after doubled apostrophes fold back, the expected divergence).
- An unrelated pre-existing modification to
  `completed/2026-09-11-humble-keys-...md` was staged by a broad `git add` and **unstaged** before
  the commit. It is not part of this task.

## What was NOT done

No live gate was run and none is claimed. No source file was read for correctness beyond confirming
the three shipped changes are present at the cited lines.
