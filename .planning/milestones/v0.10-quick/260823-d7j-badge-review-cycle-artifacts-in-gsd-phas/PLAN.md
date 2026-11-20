---
quick_id: 260823-d7j
slug: badge-review-cycle-artifacts-in-gsd-phas
date: 2026-08-23
status: complete
---

# Quick task 260823-d7j — badge the review-cycle artifacts

## Problem

`artifactKind()` (`~/.vscode/extensions/gsd-phase-status/parse.js:259-263`) matches a file name
only when `name === kind || name.endsWith('-' + kind)`. A cycle review is named
`34.2-REVIEW-GAP-CYCLE-1.md` or `34.9-REVIEW-CYCLE2.md`, which ends in neither `-REVIEW.md` nor
`-REVIEW-FIX.md`, so it matches **nothing**: no Explorer badge, and — since v0.7.0 wired artifacts
into `scanFolders()` — no contribution to the folder colour either. Eight reviews are invisible:

- `34.2-REVIEW-GAP-CYCLE-{1,2,3,4}.md`
- `34.9-REVIEW-CYCLE{2,3,4,5}.md`

Both phases' own documents already record the hole verbatim (`34.2-REVIEW-FIX.md:67-70`,
`34.9-REVIEW-FIX.md:60-64`).

## Why the status cannot simply be read

All eight carry `status: issues_found`, and that is correct and permanent — a REVIEW's status
records what the review FOUND and is never rewritten when fixes land (`reviewStatus()`'s own doc
comment, `parse.js:204-213`). The actual disposition lives elsewhere and differs per cycle:

| Review | Dispositioned in | Result |
|---|---|---|
| `34.2-REVIEW-GAP-CYCLE-1.md` | `34.2-PORTED-CHANNELS.md` §7 *Gap cycle 2 reconciliation* | CR-01/02/03 closed per cycle 2's own summary; 11 of 14 unaccounted |
| `34.2-REVIEW-GAP-CYCLE-2.md` | §7 *Gap cycle 3 reconciliation*, pinned by `currency-gate.py` | 9 closed, 5 deferred, IN-04 unaccounted |
| `34.2-REVIEW-GAP-CYCLE-3.md` | §7 *Gap cycle 4 reconciliation*, pinned by `currency-gate.py` | 14 of 14 closed |
| `34.2-REVIEW-GAP-CYCLE-4.md` | §7 *Gap cycle 5 reconciliation*, pinned by `currency-gate.py` | 20 of 20 closed, deferred none |
| `34.9-REVIEW-CYCLE2.md` | `34.9/deferred-items.md` C2 table | 6 FIXED, 2 DEFERRED (items 18, 19) |
| `34.9-REVIEW-CYCLE3.md` | `34.9/deferred-items.md` C3 table | 3 of 3 FIXED |
| `34.9-REVIEW-CYCLE4.md` | `34.9/deferred-items.md` C4 table | 5 of 5 FIXED |
| `34.9-REVIEW-CYCLE5.md` | `34.9/deferred-items.md` C5 table | 2 of 2 FIXED |

Neither location is reachable by the extension: `PORTED-CHANNELS.md` and `deferred-items.md` are
in the deliberately-excluded, frontmatter-free "inputs, not gates" set. Deriving the answer
structurally ("cycle N is done once cycle N+1 exists") is a guess and is already wrong — cycle 4
is dispositioned by a *Gap cycle 5 reconciliation* section with no cycle-5 file behind it. That is
the `explorer-phase-colour-needs-a-strong-marker` failure mode.

## Approach — declare it, don't derive it

**T1.** `parse.js`: add a `REVIEW-CYCLE` artifact kind matched by regex (`-REVIEW-GAP-CYCLE-<n>`,
`-REVIEW-CYCLE<n>`, separator-tolerant) rather than by list suffix. `resolveArtifactStatus()` for
that kind reads a new top-level `disposition:` frontmatter field through the existing
`artifactStatus()` vocabulary — `closed` → complete, `partial`/`open` → inprogress, no new words —
and falls back to `reviewStatus(fm, null)` when the field is absent, so an undispositioned cycle
review reads red on an unaddressed critical and yellow otherwise. Never white.

The cycle kind **ignores the folder's `REVIEW-FIX.md`**, unlike `REVIEW.md`. Both fix ledgers in
the tree scope themselves explicitly to their round-1 review and disclaim the cycles
(`34.2-REVIEW-FIX.md:53`, `34.9-REVIEW-FIX.md:54-58`); inheriting `partial` from them would
attribute a status its own author refused to give.

**T2.** `test-parse.js`: tests for the matcher, the `disposition:` read, and the fallback — each
red-proofed against the pre-change behaviour.

**T3.** Add `disposition:` (plus a `dispositioned_by:` pointer, so the claim is auditable) to the
eight files, at the values evidenced in the table above. `status:` is left untouched on all eight.

## Out of scope, deliberately

`34.13-REVIEW.iter{1,2,3}*.md` and `34.13-REVIEW.part{A,B,C}.md` are also unbadged and were named
as candidates when this task was proposed. They are **excluded**: they pair with
`34.13-REVIEW-FIX2.md` / `34.13-REVIEW-FIX3.md`, which the extension does not recognise either.
Badging the reviews without the fix passes would paint 34.13 red on criticals those siblings may
already discharge — asserting an unaddressed Critical that has not been checked. Doing it honestly
means auditing eleven files, which is a separate task. Recorded as a follow-up.

## Blast radius (measured before the change)

`34.2`, `34.9` and `34.13` all currently roll up to `inprogress`. No folder can regress from green.
Full 54-folder before/after diff is required evidence for T3.

## Tasks

1. T1 — `parse.js`: `REVIEW-CYCLE` kind + `disposition:` resolver. Commit.
2. T2 — `test-parse.js`: red-proofed coverage. Commit.
3. T3 — eight `disposition:` declarations + 54-folder diff. Commit.
