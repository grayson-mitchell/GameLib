---
quick_id: 260823-rtm
slug: amend-34-9-ledger-items-18-and-19
date: 2026-08-23
description: "Re-point ledger item 19 at the live path and record its fired precondition; de-fuse item 18's ROADMAP restatement"
type: docs
files_touched:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md
  - .planning/ROADMAP.md
---

# Quick task 260823-rtm — amend 34.9 ledger items 18 and 19

Both remaining cycle-2 findings (`C2-05` → item 18, `C2-07` → item 19) are records that have
decayed against the tree since they were written on 2026-08-13. Neither decision is being made
here — this task fixes what the records *say*, so that whoever makes the decisions is reading true
statements.

## Scope correction made during investigation

The stated premise was that **item 18's ledger text** fuses the CI coverage gap with the
auto-publish risk. It does not. Read in full (`deferred-items.md:462-495`), item 18 quotes
`--publish=never` verbatim in detail 1, names `release:mac`'s `-p always` separately in detail 2,
and carries an entire paragraph resolving the apparent tension with item 13, ending "No sentence in
this entry claims the guard has run in CI." The ledger is precise.

**The fused restatement is in `ROADMAP.md:1362`**, the Phase 34.16 entry — which drops
`--publish=never` and closes with "This is live in currently-active CI, not hypothetical." That is
the paragraph 34.16's planner will read. The edit target moves accordingly: ROADMAP, not the
ledger. Item 18 gets only a dated verification note (see Task 2).

## Task 1 — item 19: re-point at the live path, record the fired precondition

Item 19 cites `meta/__tests__/cleanDistMac.test.ts:234-276` and `meta/cleanDistMac.ts`. **Neither
path exists.** `260822-hrf` renamed both on 2026-08-22. Live locations, read at authoring time:

- source under pin: `meta/cleanDist.ts` (via the test's `CLEAN_DIST_SOURCE_PATH`)
- `describe('doc-comment accuracy pins (IN-01/IN-02)')` → `meta/__tests__/cleanDist.test.ts:451-493`
- 4 tests: IN-01 negative `:467-471`, IN-01 positive (2× `toContain`) `:473-477`, IN-02 negative
  `:479-483`, IN-02 positive (3× `toContain`) `:485-492`

**The named precondition fired and no decision was recorded.** It read: "a decision by whoever next
edits `meta/cleanDistMac.ts`'s header comments on whether to drop the positive `toContain`
assertions". `260822-hrf` is that editor — its own closure note says "IN-01/IN-02 doc-comment pins
re-baselined against the new path". The pins were re-baselined; the question was never put.

**Net coupling grew by exactly one assertion**, and this must be stated precisely rather than
alarmingly. The re-baseline added a second describe block, `honesty pin: no win/linux "broken" or
"observed" claim (E-02 discipline)` (`:495-514`), containing:

- `:496-508` — one test looping 6 phrases through `not.toContain`. This is the **protective** kind
  C2-07 explicitly exempts ("The other two assertions (`not.toContain`) ... carry the real
  protection — they are not affected by this concern"). It is **not** new coupling.
- `:510-513` — `expect(source).toContain('UNCONFIRMED generalization')`. This **is** a new positive
  prose pin, and the only one added.

So: 5 positive prose assertions before, 6 now. Any wording stating or implying "two were added" is
wrong and must not be written.

The amendment is **appended as a dated note**, following this ledger's own amend-not-rewrite
discipline (the `ROUTED 2026-08-22:` lines on items 1/2/3/12/13/18 are the precedent). Original
text, including the dead paths, stays as written — it is the evidence of how the record rotted.

**The decision itself stays OPEN.** Whether to drop the positive `toContain` pins is the
developer's call; this task records that it is now overdue, not what the answer is.

## Task 2 — item 18: de-fuse the ROADMAP restatement, correct one line reference

In `ROADMAP.md`'s Phase 34.16 entry, split the single fused claim into the two separate true ones:

1. **CI coverage gap (real, but does not publish):** `build-base.yml:48` runs
   `pnpm dist:mac --x64 --arm64 --publish=never` while the guard runs arm64-only — verified
   unchanged today, the citation still resolves exactly.
2. **Auto-publish path (a human-run release script):** `release:mac`'s `-p always` reaches the
   `electron-updater` feed. This is not CI; it is what someone runs to cut a release.

Preserve the item's force — an unverified x64 build reaching the auto-update channel with the guard
green is still the outcome. Only the mechanism attribution changes. Add the pointer that the
authoritative statement is ledger item 18 itself, which already draws this distinction.

In `deferred-items.md` item 18, append a dated verification note recording that its landmarks were
re-checked on 2026-08-23 and hold — **except** `package.json:44`, which is now `package.json:46`
(`release:linux`/`release:mac`/`release:win` sit at 45/46/47). `build-base.yml:48` still resolves
verbatim. No claim in item 18 changes.

## Acceptance

- [ ] Item 19 carries a dated amendment with live paths + line ranges, the fired-precondition
      record, and the +1 (not +2) coupling count
- [ ] Item 19's decision is explicitly recorded as still OPEN and still the developer's
- [ ] Original item-19 text, dead citations included, is preserved unrewritten
- [ ] ROADMAP 34.16's item-18 bullet names `--publish=never` and separates CI from `release:mac`
- [ ] Item 18 carries a dated landmark re-verification note; `package.json:44` → `:46` corrected
- [ ] `34.9-REVIEW-SWEEP-CHECK.cjs` → 24/24 mapped, unmapped 0, exit 0 (C2-05/C2-07 rows must keep
      mapping to items 18/19 — an amendment that breaks the sweep's ID census is a regression)
- [ ] `pnpm planning-gates` 7/7
- [ ] No file outside `.planning/` modified; no code changes

## Out of scope

Neither deferred decision is made here. Item 18 stays blocked on the default-branch push and owned
by Phase 34.16; item 19's positive-pin question stays open and unowned by any phase.
