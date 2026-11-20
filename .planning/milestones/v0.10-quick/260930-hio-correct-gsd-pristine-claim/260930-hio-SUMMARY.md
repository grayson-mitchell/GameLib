---
phase: quick-260930-hio
plan: 01
subsystem: docs
tags: [claude-md, gsd-conventions, prose-correction]
status: complete
dependency-graph:
  requires: []
  provides: [corrected-gsd-pristine-scope-claim, disambiguated-get-shit-done-count]
  affects: [CLAUDE.md]
tech-stack:
  added: []
  patterns: [measured-fact-with-date prose voice]
key-files:
  created: []
  modified:
    - CLAUDE.md
decisions:
  - "gsd-pristine paragraph rewritten to state it is a per-patched-file baseline (2 files, matching backup-meta.json's files array), not a snapshot of the release; the 1.14.0->1.15.0 outcome is described as indistinguishable from a verbatim restore without asserting a three-way merge either way."
  - "get-shit-done '17 entries' clause rewritten to name find ~/.claude/get-shit-done -type d as the source, separating it from the 5 top-level entries and 16 descendants, since the existing claim measured out correct and only needed disambiguation, not correction."
actuals:
  tokens: 9000
  tasks: 2
  commits: 1
  plan_head_before: 53e43a4cd
  plan_head_after: 05157ecf5
metrics:
  duration: "~25 min"
  completed: 2026-09-30
---

# Quick Task 260930-hio: Correct gsd-pristine claim, disambiguate get-shit-done count Summary

Two precision prose edits to `CLAUDE.md`: corrected an overstated claim that `~/.claude/gsd-pristine/`
is a full release snapshot (it is a per-patched-file baseline covering only the 2 files already known
to be locally modified), and named the measuring command behind a correct-but-ambiguous "17 entries"
figure in the UAT subsection so it cannot be misread against a plain `ls`.

## What Was Done

**Task 1 (gsd-pristine paragraph, formatter-check subsection):** Replaced the 9-line paragraph that
claimed the next `gsd-core` upgrade "can do a real three-way merge" because `gsd-pristine/` is "seeded
with the untouched 1.14.0 originals." Measured: the tree holds exactly 2 files under 5 directories,
matching `backup-meta.json`'s `files` array exactly — a baseline only for files already known to be
locally modified, not a release snapshot. Any `gsd-core` file modified locally for the first time
before the next upgrade still has no baseline, the same hole the 1.42.3 -> 1.14.0 move fell into. The
rewrite states the 1.14.0 -> 1.15.0 outcome as "indistinguishable from a verbatim restore" without
asserting a three-way merge happened or did not. The directory's existence (not absence) and the
MANUAL-reapply / unversioned-and-overwritten caveats and closing durable-copy sentence all survive.

**Task 2 (UAT subsection, "What changed, and when." paragraph):** This was a disambiguation, not a
correction — `find ~/.claude/get-shit-done -type d | wc -l` really does return 17, and "every one a
directory and not one a file" was already true. The only fix: name the measuring command so the figure
is checkable and distinguishable from a top-level entry count (5 top-level entries, 16 descendants,
17 directories counting the root).

## Deviations from Plan

**Wrap-discipline rework (not a plan deviation, but worth recording):** several first-pass line wraps
split literal grep-target phrases (e.g. `MANUAL step the operator must run after every upgrade`,
`a tree with no files in it cannot be run`, `durable copy of the requirement`) across two lines,
which `grep -cF` cannot match across a newline. Also, two rewrapped lines happened to reproduce an
original line byte-for-byte, which caused `git diff -U0` to report 3 hunks instead of 2 (a real,
unchanged line splitting the hunk). Fixed by rewording those two lines with harmless synonyms
(`gsd-core` backticked, "shared by" -> "shared across") so they differ from the original text while
preserving meaning, merging the diff back to exactly 2 hunks. None of this is a deviation from the
plan's intent — it is the mechanical cost of satisfying the plan's own literal-substring verify gates
under a hard 100-column wrap with no `proseWrap` help from prettier.

## Durable Lesson

An ambiguous census figure whose measuring command is not named invites a real misread: a plain `ls`
of 5 (top-level entries) was taken as contradicting a `find -type d` of 17 (all directories including
the root) on the exact same, unchanged tree. Naming the command that produced a count is what makes
it checkable — and what would have prevented the misread in the first place.

## Self-Check: PASSED

- `CLAUDE.md` modified as intended; all task `<verify>` automated commands re-run and passing
  (`npx prettier --check CLAUDE.md` exits 0; all required literal substrings present exactly once;
  `missing|absent` near `gsd-pristine` returns 0; `17 entries` returns 0; `(17 items)` returns 1).
- `git diff -U0 -- CLAUDE.md` shows exactly 2 hunks; `git diff --name-only` shows only `CLAUDE.md`
  changed outside `.planning/`.
- No line added by this plan exceeds 100 columns (byte length, measured the same way the plan's
  `<verification>` step 4 measures it).
- Lines 408-418 (the "7 hits / 1 hit", `/gsd-update --reapply`, "2 checked, 0 failures, 0 drifted"
  paragraph) confirmed byte-identical to before via `git diff` (no `-`/`+` markers in that range).
- Commit `05157ecf5` contains `CLAUDE.md` only (`git show --stat` / `git status --short` confirmed
  clean working tree aside from this plan's untracked `.planning/quick/` directory).
