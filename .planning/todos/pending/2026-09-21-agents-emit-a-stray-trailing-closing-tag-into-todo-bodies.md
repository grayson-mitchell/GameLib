---
created: 2026-09-21
title: "Agents emit a stray trailing closing tag into todo bodies — recurring authoring artifact, gate is blind by design"
area: todos
severity: minor
platform: any
ready: human
source: "quick-260921-pvt, surfaced while repairing six pending todos that carried the artifact"
files:
  - .planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md
  - .planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md
  - .planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md
  - .planning/todos/pending/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md
  - .planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md
  - .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
  - .planning/todos/todo-frontmatter-gate.py
---

## What happened

Six pending todos carried a stray XML-style closing tag — split spelling `` `</content` `` +
`` `>` `` so this todo does not reintroduce the literal string it documents — as their FINAL line.
It is a leaked fragment of an agent's own tool-call envelope that got written straight into the
file body instead of being consumed by whatever wraps file-creation output. Affected files:

- `2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md`
- `2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md`
- `2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md`
- `2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md`
- `2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md`
- `2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`

The tag was ORPHANED: there is no opening tag anywhere under `.planning/todos/`, so it was never
half of a pair and nothing ever read it. It sat there inert. `completed/` had zero occurrences —
this is purely a `pending/` phenomenon (which tracks with it being an authoring-time artifact of
recently-filed todos, not something that happens to old, settled ones). Quick task `260921-pvt`
deleted exactly that one trailing line from each of the six files and changed nothing else
(`git diff --numstat` reads `+0/-1` per file).

## It recurred — that is the point

This is not one agent's one-off slip. It happened in TWO INDEPENDENT SESSIONS, on TWO DIFFERENT
DATES:

- `30630b9d2` ("docs(quick-260921-nub): file three adjacent findings and close the parent todo",
  2026-09-21) birthed the three `2026-09-20-*` files with the tag already present at creation.
- `82ac54d86` ("docs(todos): file Linux compile-failure and Windows install-deps todos",
  2026-09-17) — an unrelated, earlier session — birthed the three `2026-09-17-*` files the same
  way.

Four days apart, no shared session state, same defect shape (one stray closing tag, as the exact
final line, in a freshly-authored todo body). That repetition is the entire reason this is worth
filing rather than just quietly fixing: a single occurrence would be a typo; two independent
occurrences four days apart is a recurring artifact of how agents write todo files in this repo.

## Why nothing caught it

`.planning/todos/todo-frontmatter-gate.py` validates `severity`/`platform`/`ready` inside the
FRONTMATTER block only — the text between the first `---` line and the next `---` line. The stray
tag sits in the BODY, well past the closing `---`, so the gate structurally cannot see it. This is
not an oversight in the gate; the gate's own docstring calls it out directly:

> FRONTMATTER-BLOCK-ONLY PARSING IS LOAD-BEARING, NOT A NICETY. Todo BODIES are prose about
> severity and readiness and legitimately contain lines like `Severity: low, and NOT a security
> regression`. A whole-file grep would convict correct files on their own explanatory text — a
> gate that convicts correct code is worse than no gate, because the fix people reach for is
> deleting the gate. Only the text between the first `---` line and the next `---` line is parsed.
> Covered by accept-side self-test cases 11 and 12.

Self-test cases 11 and 12 in `todo-frontmatter-gate.py` are the accept-side controls that pin
exactly this: a body containing prose that *looks* like a triage line must still pass. Widening
the gate to scan the whole file to catch this stray tag would break those controls' entire
purpose. All 11 planning gates were green the entire time the tag sat in six committed files —
this is the repo's recorded "green check proving nothing" family: a gate did exactly what it was
built to do, and that is precisely why it could not see this.

## The self-referential trap facing any future gate

Any gate that matched the literal tag string as a raw pattern would be tripped by the very todo
that documents the tag — this file, sitting under `.planning/todos/`, would fail its own check the
moment it existed. That is this repo's recorded "raw-source gate is satisfied by / broken by the
prose that names it" pattern, playing out here in the mirror direction: instead of prose falsely
*passing* a gate meant to catch something else, prose describing the defect would falsely *fail* a
gate meant to catch exactly that defect. This todo dodges the trap by using a split spelling
(`` `</content` `` followed immediately by `` `>` ``, never joined) rather than the literal string
— stated once, explicitly, here, so a future reader does not "helpfully" rejoin the halves and
reintroduce the very string this todo exists to talk about without repeating.

Any gate design would need either an exemption ledger (a list of paths permitted to contain the
literal string, which is itself a maintenance burden and a thing that can drift stale) or a
narrower match that somehow distinguishes "this is the artifact" from "this is prose describing
the artifact" — which is a real design problem, not a rubber stamp.

## The decision is open — deliberately not made here

Quick task `260921-pvt` repaired the damage in all six files and DELIBERATELY DID NOT add a gate.
Whether a body-level gate should exist at all is a judgement call this todo leaves open, on
purpose, for a human to weigh on its merits rather than default into existing. CLAUDE.md's
sidecar-contract section states the same precedent for a structurally similar situation: "A gate
is not obviously the answer, and is a separate, deliberate decision... Decide it on its merits; do
not add one reflexively."

Worth naming the honest asymmetry too: this repair fixes the damage but does NOT prevent
recurrence — a third session, next week, could write a seventh file with the same trailing
fragment and nothing here would catch it before commit. That is the inverse of this repo's usual
"code fix stops recurrence, leaves damage" shape (see the process-lessons index) — here the damage
is gone but the recurrence path is wide open.

Options, sketched without picking one:

1. A gate that scans todo bodies for a small, explicit set of known raw tool-envelope fragments,
   with a hand-maintained exemption ledger for todos (like this one) that must discuss the
   fragment in prose.
2. A broader "no raw tool-envelope tags in todo bodies" check using a narrower match than a bare
   substring — for example requiring the tag to be the LAST non-blank line of the file, which is
   the actual shape every observed instance took, rather than matching anywhere in the body.
3. A pre-commit or pre-save shape check scoped to newly-added todo files only (diff-scoped, not
   whole-tree), so historical files are never swept in and the self-referential trap only has to
   be solved once, at the moment of authoring.
4. Nothing: accept that the artifact is inert, cheap to spot in review, and cheap to clean up when
   found (as this task just did), and that a gate here risks the "convicts correct code" failure
   mode the frontmatter gate's own docstring warns about.
