---
quick_id: 260823-sok
slug: shorten-cleandist-doc-comment-pins-to-th
date: 2026-08-23
description: "Item 19 decision: shorten the positive doc-comment pins from six assertions to three anchors, then close the item"
type: code
files_touched:
  - meta/__tests__/cleanDist.test.ts
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md
---

# Quick task 260823-sok — item 19 decided: three anchors

**The decision (developer, 2026-08-23):** option 3 — keep the positive `toContain` pins but reduce
them to **one distinctive anchor phrase per claim**, three in total.

## Why this and not C2-07's own proposal

C2-07 proposed dropping the positives entirely, on the grounds that only the `not.toContain`
assertions carry real protection. That reasoning has a hole: **`not.toContain` passes trivially
against a deleted comment.** The negatives prove the *retired, misleading* framings are gone; they
cannot detect that the corrected claim was removed altogether. The positives are the only assertion
that a correct replacement still exists.

So the real trade is not coupling-vs-nothing, it is:

- negatives alone → protected against regression-to-wrong, **unprotected against
  deletion-to-nothing**
- both → protected against both, at the cost of a tripwire on prose

Three anchors keep the deletion protection while halving the reword-breakage surface, and each
surviving anchor is a short technical term rather than a sentence, so a reword that preserves the
claim is far likelier to preserve the anchor.

## Task 1 — reduce six positive assertions to three

| Claim | Keep | Drop |
|---|---|---|
| IN-01 | `'symlink literally named'` | `'matches no branch and is left in place'` |
| IN-02 | `'defense-in-depth against a currently-unreachable input'` | `'never contain a path separator'`, `'no test exercises it'` |
| E-02 (honesty) | `'UNCONFIRMED generalization'` | — already a single anchor |

**All three `not.toContain` assertions are untouched** — they carry the regression protection and
were never in scope for this concern.

**Test names must be corrected in the same edit.** `'IN-01: the corrected comment names the
unreachable shape and states it is left in place'` describes two assertions; after this change it
asserts one. A test whose name overstates what it checks is the same defect class this phase has
been fighting all week. Rename to match exactly what remains.

**Note on matching mode, verified before editing:** the IN-01/IN-02 pins assert against
`normalisedSource()` (comment markers stripped, whitespace collapsed), so an anchor may span a line
wrap in `meta/cleanDist.ts`. The E-02 pin asserts against the **raw** source. Both anchor choices
were checked against the live file — `'symlink literally named'` at `:92`,
`'defense-in-depth against a currently-unreachable input'` at `:138`, `'UNCONFIRMED generalization'`
at `:21`.

## Task 2 — RED-prove all three surviving anchors

A shortened pin is worthless if it cannot fail. For **each** of the three anchors, independently:

1. Mutate `meta/cleanDist.ts` to remove or reword only that anchor phrase.
2. Run the suite; the corresponding test **must** go red, and the other two must stay green
   (proving the anchors are independent, not one assertion wearing three hats).
3. Restore `meta/cleanDist.ts` and confirm byte-identical via `git diff --quiet`.

Then run the full file green. **`meta/cleanDist.ts` is not modified by this task** — every mutation
is temporary and restored, and the restore is verified rather than assumed.

## Task 3 — close item 19

Append a dated closure note recording the decision, its rationale (including the
deletion-to-nothing hole in C2-07's reasoning), exactly which assertions went and which stayed, and
the RED-proof outcome. Record that this discharges the precondition that fired unanswered on
2026-08-22.

## Acceptance

- [ ] Exactly three positive `toContain` assertions remain across both describe blocks
- [ ] All three `not.toContain` assertions untouched
- [ ] Test names describe exactly what they assert
- [ ] Each anchor independently RED-proven; other two stay green during each mutation
- [ ] `meta/cleanDist.ts` byte-identical at end (`git diff --quiet`)
- [ ] Full `cleanDist.test.ts` green; `pnpm codecheck` clean
- [ ] Item 19 closed with the decision and rationale recorded
- [ ] Sweep 24/24 unmapped 0 exit 0

## Out of scope

No doc comment in `meta/cleanDist.ts` is reworded. This task changes what the tests assert, not
what the source says.
