---
quick_id: 260825-vy5
slug: write-34-11-review-fix-md-to-move-phase-
date: 2026-08-25
status: planned
---

# Quick Task: write `34.11-REVIEW-FIX.md` to move Phase 34.11 off red

## Problem

The Explorer paints Phase 34.11 red. Replaying the real parser
(`~/.vscode/extensions/gsd-phase-status/parse.js`) over the real folder isolates a
single holdback:

| artifact | frontmatter | `resolveArtifactStatus` |
|---|---|---|
| `34.11-REVIEW.md` | `issues_found` + `findings.critical: 4`, **no `-FIX` sibling** | **`blocked`** |
| `34.11-SECURITY.md` | `verified` | `complete` |
| `34.11-UI-SPEC.md` | `approved` | `complete` |
| `34.11-VALIDATION.md` | `approved` | `complete` |
| `34.11-VERIFICATION.md` | `passed` | `complete` |
| 9/9 PLAN+SUMMARY pairs | — | `complete` |

`rollup(all)` = `blocked`; `rollup(plans only)` = `complete`. `STATE.md` names 34.6 /
34.16 / 34.17, not 34.11, so nothing upstream repaints it — and `blocked` is in
`SETTLED` regardless.

## Approach

`reviewStatus(fm, fix)` pairs `REVIEW.md` with a `REVIEW-FIX.md` sibling the way PLAN
pairs with SUMMARY: when the sibling exists, **its** `status:` is read and the review's
own is ignored entirely. `issues_found` is stale by design and must not be edited.

So: write `34.11-REVIEW-FIX.md`, with its `status:` **derived from a per-finding sweep**,
not chosen for the colour it produces.

## Tasks

1. Sweep all 23 findings (CR-01..04, WR-01..19) against live code at `HEAD`, not against
   the working tree — the branch carries unrelated uncommitted Steam edits to
   `Library/index.tsx` and `filterEngine.ts`.
2. Write `34.11-REVIEW-FIX.md`. Dispositions as **table rows**, never `### <ID>` sections
   (a `-REVIEW.*\.md$` closure glob harvests `^### <ID>` headings and mis-ledgers them).
3. Prove the badge moves by `require`-ing the real `parse.js`, **with a fix-status-withheld
   control** — otherwise the attribution is vacuous.
4. Record the residual open Warnings as a pending todo so they are not unledgered.

## Success criteria

- `34.11-REVIEW-FIX.md` exists; `34.11-REVIEW.md` byte-identical to before.
- Every one of the 23 finding IDs appears in exactly one ledger row.
- `status:` is mechanically consistent with the rows.
- Folder rollup moves off `blocked`, proven against the real `parse.js`.
