---
created: 2026-09-11
title: "53 of 2437 frontmatter-bearing `.md` files under `.planning/` fail to YAML-parse -- why `planning-frontmatter-gate.py` is scoped to STATE.md/ROADMAP.md, not repo-wide"
area: planning-records
severity: minor
platform: any
ready: code
source: "quick task 260911-ayu, Task 3 (M-11 in its authoring plan), re-measured at close-out time"
files:
  - .planning/planning-frontmatter-gate.py
resolves_phase: null
---

# 53 of 2437 frontmatter-bearing planning docs do not YAML-parse

## The finding

Quick task 260911-ayu added `.planning/planning-frontmatter-gate.py`, a gate that YAML-parses
`.planning/STATE.md`'s frontmatter (required) and `.planning/ROADMAP.md`'s (optional). While
authoring it, the plan measured (M-11) that a repo-wide version of the same check would be RED at
head: 54 of 2436 frontmatter-bearing `.md` files under `.planning/` failed to parse at planning
time. Re-measured independently at close-out time (same walk-and-parse method, same js-yaml 4.1.1
`load()`): **53 of 2437** now fail -- the corpus moved by one file in the interim, which is
expected (`.planning/` is appended to constantly; see the same caveat in STATE.md's own byte
pins). The two counts are the same finding, not a discrepancy to chase.

Most failures are historical `*-SUMMARY.md` and `*-VERIFICATION.md` files concentrated in phases
14, 21, 23, 28, 29, 34, and the 34.1-34.9 sub-phases, plus a handful outside the phase tree
entirely: `.planning/debug/resolved/*.md`, `.planning/spikes/015-.../README.md`,
`.planning/seeds/macos-steam-native-bridge-lsteamclient.md`, two files under
`.planning/todos/completed/`, and one quick-task summary
(`.planning/quick/260906-hq8-.../260906-hq8-SUMMARY.md`).

## Why this is filed rather than fixed here

`planning-frontmatter-gate.py`'s scope is deliberately `STATE.md` (required) +`ROADMAP.md`
(optional) — see its docstring and D-AYU-04 in quick-260911-ayu's authoring plan. Widening it to
walk all of `.planning/` would make the gate RED at head on landing, against 53 files none of
which this quick task touched. That is out of scope for a quick task whose purpose was "make
STATE.md parse and add the gate that would have caught it" — fixing 53 historical documents is a
different, larger piece of work.

## What widening the gate requires

1. Fix (or intentionally exempt) all 53 current offenders. Likely causes worth checking first:
   unescaped quotes in double-quoted scalars (the same shape as STATE.md's own defect), and stray
   `---` sequences inside a body code block being misread as a second frontmatter fence.
2. Only then raise `planning-frontmatter-gate.py`'s `TARGETS` to a repo-wide walk (or extend it
   with a second table), and only then would that widening be a gate that starts green rather
   than a gate that starts red and gets immediately disabled or ignored.
3. Whoever picks this up should re-run the same walk-and-parse measurement fresh rather than
   trusting either count above -- both are snapshots, and the corpus keeps moving.

## Not urgent

`severity: minor` — none of these 53 files are read by tooling as YAML today; they are only ever
read as prose (the same reason STATE.md's defect went unnoticed for weeks). This is a known gap
being tracked, not a live defect with a blast radius.
