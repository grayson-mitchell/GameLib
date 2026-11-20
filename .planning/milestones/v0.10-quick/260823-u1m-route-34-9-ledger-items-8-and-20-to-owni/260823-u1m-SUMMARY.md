---
quick_id: 260823-u1m
description: Route 34.9 ledger items 8 and 20 to owning phases 34.17 and 39
completed: 2026-08-23
status: complete
commits:
  - 7a38cea28  # ROADMAP entries for Phases 34.17 and 39 + phase directories
  - a85bbd4de  # ROUTED notes appended to deferred-items.md items 8 and 20
---

# Quick Task 260823-u1m — Summary

## What was asked

Route phase 34.9's two genuinely unowned deferred items to phases that exist.

## What was done

**Phase 34.17** (`### Phase 34.17: PathSelectionBox input commit — Enter-to-commit and the
unconfirmed paste failure`) and **Phase 39** (`### Phase 39: Repo-wide lint debt — drive
`pnpm lint` to exit 0 after the Electron cutover`) added to ROADMAP.md, each with a phase
directory carrying a `.gitkeep`, per commit `386b2f497`'s precedent. Routing notes appended
under each ledger item's OWNER line, per commit `870da83c8`'s precedent.

## Findings that shaped the outcome

**1. This is a different failure mode from the one 34.16 fixed, and the same tool misses both.**
Items 1/2/3/12/13/18 named "a follow-up phase" that did not exist. Items 8 and 20 named *nobody*:
`OWNER: UNASSIGNED — no UI-owning phase remains after 34.11; developer decision owed` and
`OWNER: unassigned (pre-existing repo-wide lint debt...)`. Both rot identically, and
`34.9-REVIEW-SWEEP-CHECK.cjs` sees neither — it scores whether a finding maps to a *row*, not
whether that row's owner resolves to anything real. This is the same class of blind spot
`260823-tcu` recorded for open-vs-closed items: the sweep is a mapping check, not a staleness
detector.

**2. Item 8 was re-verified live before routing, not taken on faith.**
`src/frontend/components/UI/PathSelectionBox/index.tsx:84` still reads
`onBlur={(e) => onPathChange(e.target.value)}` with no `onKeyDown`. The useful new fact:
`src/frontend/components/UI/TextInputWithIconField/index.tsx:17` **already declares an `onKeyDown`
prop** that `PathSelectionBox` never passes — the seam exists, so the fix does not require widening
the primitive's interface. The item is live, not moot.

**3. Two phases, not one.** A single phase owning a UI input-commit defect and a 3544-problem lint
sweep would have an incoherent goal, which GSD's goal-backward verification handles badly.

**4. Phase 38 was considered and rejected as the destination for both.** It is chartered for items
that cannot run on this machine for want of hardware or an OS the project lacks, and its own rule 2
requires every relocated item to carry a source-level gate rather than a prose blocker. Item 8 is a
code fix; item 20 is a lint sweep. Both are runnable here today, so parking either in 38 would have
been a category error that its own entry warns against.

**5. Phase 39's placement after Phase 35 is the substance of the routing, not a formality.** The
Electron cutover deletes an as-yet-unmeasured share of the 3544 problems. Sweeping lint first throws
that work away and produces a diff that collides with the cutover. The entry records the
`3544 problems (53 errors, 3491 warnings)` figure as a **2026-08-14 snapshot to be re-measured at
plan time**, not a target, and carries the four recorded ways this measurement misleads: `pnpm
codecheck` is a `tsc` gate and says nothing about lint; only `severity === 2` is an error; a finding
can name the wrong file with the right lines; the `prettier --check` gate is separately red and must
not be swept into a behavioural commit.

**6. 34.17 must not fix the paste half by assumption.** The ledger explicitly records that the
repeating-unrenderable-glyph paste failure was *not* independently re-confirmed, and only names
`navigator.clipboard` no-opping under Tauri/WKWebView as a *likely* cause. The phase entry requires
the paste half to be reproduced on the real host before any fix, and to be closed VERIFIED-ABSENT if
it does not reproduce.

## Verification

- `node 34.9-REVIEW-SWEEP-CHECK.cjs` → `REVIEW-SWEEP-OK 24/24 mapped, unmapped 0`, exit 0, after
  the ledger edit.
- ROADMAP diff is **89 insertions, 0 deletions** — nothing existing was rewritten.
- Ledger diff is **4 insertions, 0 deletions** — both OWNER lines survive verbatim, per this
  ledger's amend-in-place rule.
- Both commits made with `git commit --only <paths>`; a concurrent session's uncommitted Library
  and Steam changes were present throughout and were not absorbed (commit 1 = 3 files, commit 2 =
  1 file).

## Not done — flagged, not fixed

**Phase 34.16's ROADMAP entry is stale.** Its "Read before planning" paragraph still instructs a
planner to fix ledger items 14, 15 and 16 before re-running `34.9-GUARD-PROOF.md`. All three closed
2026-08-23 (`260823-seg`, `260823-suw`), and the correct instruction is now to read that document's
§2.5 CONTRACT AMENDMENT v2 first. Correcting it properly requires reproducing AMENDMENT v2's
distinctions (§A1 retires §3's PASS bar (d) for **Direction A only**; §5's identical-looking (d) is
load-bearing and marked do-NOT-retire), so a one-line edit risks misleading the next planner. Left
for a deliberate pass. This is the sixth instance in two days of a record outliving its own fix.
