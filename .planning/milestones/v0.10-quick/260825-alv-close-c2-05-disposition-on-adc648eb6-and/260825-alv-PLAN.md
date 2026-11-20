---
quick_id: 260825-alv
slug: close-c2-05-disposition-on-adc648eb6-and
description: "Close C2-05's disposition on adc648eb6, re-home the x64 residual to ledger items 12/13, and take 34.9's folder green"
mode: quick
created: 2026-08-25
status: planned
---

# Quick Task 260825-alv: Close C2-05 and re-home its residual

## Why

Phase 34.9's explorer folder is yellow, and the full parser pipeline (replayed against the real tree
before writing anything) says exactly one artifact causes it:

| input | resolved |
|---|---|
| 33/33 PLAN+SUMMARY pairs | `complete` |
| VERIFICATION `passed`, SECURITY `verified`, VALIDATION `approved` | `complete` |
| REVIEW.md (`issues_found`, `findings.critical: 1`) paired with REVIEW-FIX `all_fixed` | `complete` |
| REVIEW-CYCLE3/4/5 (`disposition: closed`) | `complete` |
| **REVIEW-CYCLE2 (`disposition: partial`)** | **`inprogress`** |

`rollup()` returns `inprogress` the moment the set holds `complete` and anything else. ROADMAP yields
`unknown` for 34.9 (upgradeable) and STATE.md names **34.16** active, so no upstream override is in
play — the folder decides, and one field decides the folder.

**The disposition is closeable on the record, not by fiat.** C2-05's subject is *"`--arch=arm64`-only
guard coverage … and `release:mac` amplifies it via auto-publish"*. Commit `adc648eb6` (phase 34.16
plan 01) added a hardcoded `pnpm verify:runner-bundle build --arch=x64` step to both `dist:mac`
(`package.json:51`) and `release:mac` (`:46`), before `electron-builder`. That is C2-05's own
prescribed fix, and it closes both mechanisms the finding named.

What remains — no x64 onedir leg exists, and the guard has never been observed passing against a real
one — was **never C2-05's finding**. It is ledger items 1/12/13, already owned by Phase 34.16. Leaving
C2-05 `partial` makes 34.9 report "cycle-2 review unresolved" when what is actually unresolved is the
x64 leg, which lives elsewhere. User decision, this session: take path B.

## Tasks

### Task 1: Close C2-05 in the ledger and re-home its residual

**Files:** `.planning/phases/34.9-.../deferred-items.md`

**Action:** Flip the gap-cycle-2 disposition table row for C2-05 from `DEFERRED (ledger only,
D-C3-05)` to CLOSED, citing `adc648eb6` — following the same row-flip-plus-prose-note convention the
C2-07 row and the IN-03 precedent already set in this file (the table states where a finding stands
NOW; the prose note carries the history). Supersede the "C2-05 remains DEFERRED" paragraph in place.
Append a dated CLOSED block to item 18 recording what closed, what did NOT, and the explicit
re-homing of the residual to items 12/13 — the residual must be named and routed, never dropped.

Do NOT add any `### <ID>` heading: `34.9-REVIEW-SWEEP-CHECK.cjs` harvests those into its list A.

**Verify:** sweep still reports 24/24 mapped, unmapped 0, exit 0.

**Done:** A reader of item 18 learns the exposure is closed, and lands on items 12/13 for the part
that is not.

### Task 2: Flip REVIEW-CYCLE2's disposition to closed

**Files:** `.planning/phases/34.9-.../34.9-REVIEW-CYCLE2.md`

**Action:** `disposition: partial` → `closed`; extend `dispositioned_by`; rewrite `disposition_note`
to record 8 of 8 closed and where the residual went. Preserve every superseded note verbatim, per
this file's annotated-never-replaced convention. `status: issues_found` stays untouched — it records
what the review FOUND and is stale by design.

**Verify:** replay `parse.js` end-to-end (`classifyPlans` + `folderArtifactStatuses` + `rollup` +
`applyFolderState` over the real ROADMAP/STATE) and show 34.9 resolves `complete`, **with a control**
that withholds the flip and still resolves `inprogress` — otherwise the attribution is vacuous.

**Done:** 34.9's folder reads green for a reason its own ledger supports.
