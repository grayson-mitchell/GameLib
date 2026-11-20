---
quick_id: 260823-sok
slug: shorten-cleandist-doc-comment-pins-to-th
date: 2026-08-23
status: complete
type: code
commits:
  - 4befc3446
files_touched:
  - meta/__tests__/cleanDist.test.ts
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md
items_closed: [19]
---

# Quick task 260823-sok — item 19 decided and closed

**Decision (developer, 2026-08-23):** option 3 — keep the positive `toContain` doc-comment pins,
reduced to **one distinctive anchor phrase per claim**. Six positive assertions → three. All three
`not.toContain` assertions untouched.

## Why C2-07's own proposal was not taken

C2-07 argued the `not.toContain` assertions "carry the real protection" and the positives are pure
coupling. They do carry protection — against *regression to the retired framing*. But
**`not.toContain` passes trivially against a deleted comment.** The negatives cannot detect that
the corrected claim was removed altogether; the positives are the only assertion that a correct
replacement still exists. The trade was never coupling-vs-nothing:

- negatives alone → protected against regression-to-wrong, **unprotected against deletion-to-nothing**
- both → protected against both, at the cost of a prose tripwire

Three short anchors keep the deletion protection while halving the breakage surface, and a
technical term survives an incidental reword far better than a sentence does.

| Claim | Kept | Dropped |
|---|---|---|
| IN-01 | `'symlink literally named'` | `'matches no branch and is left in place'` |
| IN-02 | `'defense-in-depth against a currently-unreachable input'` | `'never contain a path separator'`, `'no test exercises it'` |
| E-02 | `'UNCONFIRMED generalization'` | — already single |

Test names were corrected in the same edit: `'…names the unreachable shape **and states it is left
in place**'` described two assertions and now describes one.

## RED-proof — each anchor independently

```
RED-PROOF IN-01: own test red 1/1, pin tests red overall 1  → anchors independent
RED-PROOF IN-02: own test red 1/1, pin tests red overall 1
RED-PROOF E-02:  own test red 1/1, pin tests red overall 1
GREEN control: Tests: 33 passed, 33 total
final sha256 matches snapshot; git agrees meta/cleanDist.ts unmodified
RED-PROOF-OK 3/3 anchors independently proven
```

The "other two stay green" half is what proves these are three independent checks rather than one
assertion wearing three hats. `tsc --noEmit` clean, `eslint` exit 0, `Meta` project 22 suites /
521 passed / 1 pre-existing skip. **`meta/cleanDist.ts` is not modified by this task.**

## Two method notes worth carrying forward

**1. `git checkout --` is not a safe restore in this repo.** The first RED-proof attempt restored
that way, which fired the **post-checkout hook** → `pnpm install` → `download-helper-binaries` →
which re-downloaded the linux/win runner binaries and then threw on the six `PENDING-CI-PUBLISH`
sentinels. **No damage resulted** — all three darwin onedir trees were verified intact afterwards
(109/67/108 files, sizes matching the phase's recorded 30M/25M/29M, `Versions/Current` still a
symlink in each, which is the exact F-34.9-01 property) — but the lesson stands: **a restore
mechanism must not have side effects on the tree it restores into.** Re-run with `cp`-from-snapshot
and `shasum` verification. This is the same hazard as the standing "do not run
`download-helper-binaries`" note, reached by an unexpected route: a plain `git checkout` of one
source file.

**2. The sweep tool caught a defect in the very edit that closes its own finding.** The closure
note's first draft laid the kept/dropped anchors out as a markdown table whose rows began with bare
finding IDs. `34.9-REVIEW-SWEEP-CHECK.cjs` parses any such row as a disposition row and correctly
failed with `DUPLICATE-ROW IN-01`, since the anchor row's disposition cell resolved to no category
while the real IN-01 row says FIXED. Rewritten as a list, with the reason recorded inline so the
next author doesn't re-introduce it. Exactly the "editing an artifact breaks the pins that guard
it" hazard — caught by the pin, which is the system working.

## 34.9 ledger state after this task

Closed: 11, 14, 15, **19**, 21, 22, 23, 24. Still open: 16 (needs a hardware run),
1/2/3/12/13/18 (Phase 34.16, blocked on the default-branch push), 5 (packaged Tauri), 7 (Phase 35),
9 (security pass), 17 (likely moot, unverified), 8 and 20 (unowned — decision still owed). Items
4/10 and 6 remain deliberately fenced out.
