---
created: 2026-09-30
title: code-review scopes its cross-check to HEAD, so reviewing a closed phase mis-scopes by 9x
area: gsd-tooling
severity: major
platform: any
ready: code
files:
  - ~/.claude/gsd-core/workflows/code-review.md
---

## What

`/gsd-code-review <N>` computes its file scope in three tiers, then runs a cross-check (`#2666`)
that diffs **`DIFF_BASE..HEAD`** and appends anything the SUMMARY extractor missed. `DIFF_BASE` is
derived from the phase's own start commit, but the upper bound is always `HEAD` — never the phase's
end. Reviewing a phase that closed some time ago therefore sweeps in every commit made since,
across unrelated phases.

**Measured 2026-09-30, running `/gsd-code-review 42 --deep`:**

| scope method                                        | files   |
| --------------------------------------------------- | ------- |
| the shipped `DIFF_BASE..HEAD` cross-check           | **590** |
| union of SUMMARY `key_files` + `(42)`-scoped commits | **66**  |

Phase 42 closed 2026-09-09; HEAD was 2026-09-30. The 590 spanned three weeks of phases 43+ and
unrelated quick tasks. Of the correct 66, 49 are one mechanical locale-catalogue family, leaving
**17 real code surfaces**.

The contamination is silent and self-concealing in two further ways:

1. **It defeats the depth the operator asked for.** At >50 files `code-review-depth.cjs` downgrades
   `deep` to `standard`. A 590-file scope guarantees that downgrade, so `--depth=deep` on any
   closed phase quietly becomes `standard` — and the printed reason ("large file count") describes
   the symptom, not the mis-scoping that caused it.
2. **The post-processing deleted-file filter hides real findings.** Step 3 of `compute_file_scope`
   drops any scoped path not on disk, counting them into a bare `Filtered N deleted files from
   review scope` line with no names. On phase 42 that silently dropped three files —
   `Humble/Keys/All/index.tsx`, its test, and `components/HumbleKeyGroup/index.tsx` — all deleted
   by `edec139bd feat(43-08): delete the three Humble Keys tabs and HumbleKeyGroup`. **Plan 42-06's
   entire deliverable lived in those three files.** Whether that behaviour survived its host's
   deletion is the single most important question about phase 42, and a by-the-book run would have
   discarded it without printing a filename. (It did survive — traced to `settleActionFor()` at
   `src/frontend/screens/Humble/Keys/index.tsx:406`, threaded at `:519` — but that was established
   by hand-scoping, not by the workflow.)

This is a `major`: not a crash, but a review that reports `files_reviewed: 590` while actually
covering a phase's 17 real surfaces is a silently contaminated measurement, which is exactly what
the severity vocabulary reserves `major` for.

## Why the existing comments do not already cover this

`compute_file_scope` carries a long comment history (`#3503`, `#2989`/`#3191`, `#3995`, `#3661`)
about getting the **lower** bound right, and admits one residual: `git log -- <dir>` does not follow
renames, so a later milestone reusing both number and slug picks up the previous occupant's
start commit. That is a different failure. This one is the **upper** bound, and no comment in the
file acknowledges it — `#3661` narrows the base to the last review commit for wave-scoped reviews,
which helps re-reviews but does nothing for a phase's first review long after it closed.

## Fix sketch

Bound the cross-check at the phase's end, not `HEAD`. Two candidate anchors, both measured to work
on phase 42:

- **Commit-scope grep** — the newest commit whose subject carries a `(N)` / `(N-MM)` conventional
  scope. On phase 42 this yielded exactly the right 69-file set. Note the workflow's own `#3503`
  comment explains why a *prose* grep for `Phase N` is unsafe; this is a subject-line **scope**
  match, which is the same class of anchor `#3503` moved *to*, not away from.
- **Last artifact commit under `PHASE_DIR`** — simpler, but on phase 42 it landed on
  `e890f658c` (a repo-wide 68-file planning sweep two days after the phase closed) and
  over-collected ~105 files including unrelated Steam/sidecar/shortcuts work from interleaved
  quick tasks.

The commit-scope anchor is the better of the two. Separately, the deleted-file filter should print
the paths it drops — a phase whose files were later deleted is a finding, not noise.

## Where the fix has to live, and the upgrade trap

**`~/.claude/gsd-core/workflows/code-review.md` is outside this repo**, unversioned, shared by
every project on this machine, and **overwritten by a `@opengsd/gsd-core` upgrade** — the same
caveat `CLAUDE.md` already records for the UAT and plan templates. Editing it in place and calling
it done will lose the fix at the next `/gsd-update`.

The supported path is the one `CLAUDE.md` documents: the installer parks locally-modified files in
`~/.claude/gsd-local-patches/` with pristine SHA-256 hashes in `backup-meta.json`, and
`/gsd-update --reapply` merges them back, verified by
`~/.claude/gsd-core/bin/verify-reapply-patches.cjs`. **Reapply is a manual step the operator must
run after every upgrade — nothing runs it automatically.** So the durable fix is an upstream report
against `@opengsd/gsd-core` (currently 1.14.0); the local patch is the stopgap. `ready: code`
reflects that the stopgap is a desk edit, not that the upstream half is.

## Workaround until then

Pass `--files` explicitly, or scope by hand as was done for phase 42:

```bash
PHASE_DIR=.planning/phases/42-.../
# SUMMARY key_files ∪ files touched by (42)/(42-NN)-scoped commits
for c in $(git log --format="%H %s" | grep -E '^[0-9a-f]+ [a-z]+\(42(-[0-9]+)?\):' | cut -d' ' -f1); do
  git show --format= --name-only "$c"
done | sort -u | grep -v '^\.planning/'
```

## Verification

- `pnpm planning-gates` passes (this file's `severity:`/`platform:`/`ready:` frontmatter).
- No formatter check: `.planning/` is prettier-ignored (`npx prettier --file-info` reports
  `{ "ignored": true, "inferredParser": null }`), so `--check` over this path would exit 0 without
  matching a single file. Omitted deliberately rather than carried as a green that proves nothing.
