---
created: 2026-09-30
title: code-review's DIFF_HEAD anchor bounds a range, not a per-phase-exact union — interleaved commits still leak in
area: gsd-tooling
severity: medium
platform: any
ready: code
files:
  - ~/.claude/gsd-core/workflows/code-review.md
---

## What

Quick task `260930-ivj` bounded `/gsd-code-review`'s file scope at the phase's own end
(`DIFF_HEAD`, the newest commit whose subject carries the phase's conventional-commit scope)
instead of always `HEAD`. That is a real fix — measured on this repo: phase 41 goes 625 files
(bound at `HEAD`) to 23 (bound at `DIFF_HEAD`); phase 34.6 goes 1040 to 194.

But a range is still a range. `git diff DIFF_BASE..DIFF_HEAD` contains **every commit in that
window**, including ones scoped to a *different* phase that happened to land between this
phase's start and end (concurrent phases, interleaved quick tasks, a stray sweep commit). The
anchor narrows the window; it does not make the scope per-phase exact.

The originating todo (now closed, see below) measured a tighter alternative on phase 42: the
**union of each `(42)`-scoped commit's own file set** —

```bash
for c in $(git log --format="%H %s" | grep -E '^[0-9a-f]+ [a-z]+\(42(-[0-9]+)?\):' | cut -d' ' -f1); do
  git show --format= --name-only "$c"
done | sort -u | grep -v '^\.planning/'
```

— which yielded 66 files (69 before the `.planning/` filter) against the range-bound
mechanism's 602 on the same phase. The union algorithm is a *different* mechanism: it visits
only commits that carry the phase's own scope tag and takes the union of their touched files,
rather than diffing between two endpoints. It is also more expensive (one `git show` per
scoped commit rather than one `git diff`) and has its own edge cases (a scoped commit that
touches unrelated files via a repo-wide sweep still pollutes the union).

## Why this is out of scope for 260930-ivj

The operator explicitly ruled the union algorithm out of scope for that task: implement D-01's
range anchor only, and file this residual separately rather than partially implementing the
union. See `.planning/quick/260930-ivj-bound-code-review-scope-to-phase-end/260930-ivj-SUMMARY.md`
for the full context and the measured numbers this todo is derived from.

## Fix sketch

Replace (or offer as an alternative tier to) the `DIFF_BASE..DIFF_HEAD` range diff with the
union-of-scoped-commits algorithm above, generalized past phase 42's hardcoded `42`: reuse the
same `DIFF_HEAD_ALT` scope-token regex quick task `260930-ivj` added, but iterate `git log`
matches instead of taking `head -1`, and union each match's `git show --name-only` output
instead of diffing two endpoints. Needs its own measurement pass across phase 41, 34.6, and 42
before shipping, since the union method's cost profile (N `git show` calls vs. one `git diff`)
and edge cases (a scoped commit landing inside a repo-wide sweep) are unverified past the one
phase-42 sample above.

## Verification

- `pnpm planning-gates` passes (this file's `severity:`/`platform:`/`ready:` frontmatter).
- No formatter check: `.planning/` is prettier-ignored (`npx prettier --file-info` reports
  `{ "ignored": true, "inferredParser": null }`), so `--check` over this path would exit 0
  without matching a single file. Omitted deliberately rather than carried as a green that
  proves nothing.
