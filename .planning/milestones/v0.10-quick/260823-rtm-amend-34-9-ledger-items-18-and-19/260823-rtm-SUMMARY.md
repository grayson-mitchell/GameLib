---
quick_id: 260823-rtm
slug: amend-34-9-ledger-items-18-and-19
date: 2026-08-23
status: complete
type: docs
commits:
  - 6b6cd0a2b
files_touched:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md
  - .planning/ROADMAP.md
code_changes: none
decisions_made: none
---

# Quick task 260823-rtm — 34.9 ledger items 18 and 19 amended

The two findings still open from `34.9-REVIEW-CYCLE2.md` (`C2-05` → item 18, `C2-07` → item 19)
are records written 2026-08-13 that had decayed against the tree. **Neither deferred decision was
made here** — this task fixes what the records *say*, so whoever makes them reads true statements.

## Scope correction found during investigation

The task was accepted on the premise that **item 18's ledger text** fuses the CI coverage gap with
the auto-publish risk. Reading it in full showed it does not: item 18 quotes `--publish=never`
verbatim in detail 1, names `release:mac`'s `-p always` separately in detail 2, and carries a
paragraph resolving the apparent tension with item 13 that ends "No sentence in this entry claims
the guard has run in CI." The ledger was right.

**The fused restatement was in `ROADMAP.md`'s Phase 34.16 entry** — the paragraph 34.16's planner
would actually read — which dropped `--publish=never` and closed with "This is live in
currently-active CI, not hypothetical." The edit target moved there. Item 18's ledger entry was
*not* rewritten; it received a dated landmark-verification note only.

This is worth recording as its own small lesson: **a summary can be wrong while the thing it
summarises is right, and the summary is what gets planned from.** Checking only the authoritative
record would have found nothing to fix and left the defect exactly where it does damage.

## Item 19 (C2-07) — precondition fired, citations dead

**Its named precondition fired on 2026-08-22 and no decision was recorded.** The precondition read
"a decision by whoever next edits `meta/cleanDistMac.ts`'s header comments on whether to drop the
positive `toContain` assertions". Quick task `260822-hrf` **is** that editor — its own item-11
closure note says "IN-01/IN-02 doc-comment pins re-baselined against the new path". The pins were
re-baselined; the question was never put.

**Both citations were dead.** `meta/cleanDistMac.ts` and `meta/__tests__/cleanDistMac.test.ts` were
renamed by `df7af9f4a`. A reader following the item's `:234-276` reference today finds no file. The
amendment tabulates the live locations:

| What | Was cited as | Is now |
|---|---|---|
| source under pin | `meta/cleanDistMac.ts` | `meta/cleanDist.ts` |
| the pins block | `meta/__tests__/cleanDistMac.test.ts:234-276` | `meta/__tests__/cleanDist.test.ts:451-493` |

Per-test ranges (`:467-471`, `:473-477`, `:479-483`, `:485-492`) are recorded in the item.

**Coupling grew by exactly one assertion — stated precisely, not alarmingly.** The re-baseline
added a second describe block, `honesty pin: no win/linux "broken" or "observed" claim (E-02
discipline)` (`:495-514`). Scored against C2-07's own criterion:

- `:496-508` — one test looping **6 phrases** through `not.toContain`. This is the **protective**
  kind C2-07 explicitly exempts. **Not new coupling.**
- `:510-513` — `toContain('UNCONFIRMED generalization')`. The **only** new positive prose pin.

Five positive prose assertions before, six now. An earlier verbal report in this session said two
were added; that was wrong and the ledger records the corrected count.

**The decision stays OPEN**, unchanged in substance and still unowned by any phase. What changed is
that the trigger has now passed once unanswered, so the next editor of `meta/cleanDist.ts`'s header
is the second trigger, not the first.

## Item 18 (C2-05) — landmarks re-verified, one line reference corrected

Every claim re-checked against the live tree before 34.16 plans from it. **All hold:**

- `.github/workflows/build-base.yml:48` — exact, unchanged: `pnpm dist:mac --x64 --arm64
  --publish=never` on `macos-15`.
- `package.json:44` → **`:46`**. `release:mac`'s `-p always` and the `--arch=arm64` guard over a
  `--x64 --arm64` build are unchanged; only the line moved (release scripts now at 45/46/47).
- Six `PENDING-CI-PUBLISH` sentinels — **still six**. A seventh string match is the file's own
  `_comment` describing them, not a sentinel. (A naive `grep -c` says 7; the recorded "six" is
  correct.)

## ROADMAP fix

The 34.16 bullet now splits the two mechanisms — the CI coverage gap (real, `--publish=never`,
reaches no user) and the auto-publish path (`release:mac`, human-run) — preserves the combined
outcome (an unverified x64 build can reach the auto-update channel with the guard green), and names
**ledger item 18 as authoritative**, including item 13's "wired but never executed" resolution.

## Gates

```
REVIEW-SWEEP-OK 24/24 mapped, unmapped 0     (exit 0 — C2-05/C2-07 still map to items 18/19)
7/7 planning gates passed                    (pnpm planning-gates)
```

The sweep re-run matters specifically: an amendment that broke the C2-05/C2-07 → item 18/19 mapping
would have been a regression in the exact census this phase built the tool to protect.

## Discipline notes

Original text is preserved unrewritten in both items — the dead citations are the evidence of how
the record rotted — following the `ROUTED 2026-08-22:` precedent on items 1/2/3/12/13/18.

One self-caught slip: the first draft of item 19's amendment used `[[wiki-link]]` syntax to
reference a lesson. That is *memory-file* syntax with no resolver in this repo — a reader would hit
an unresolvable token. Replaced with plain prose before commit.

A concurrent session was active throughout; the commit used `git commit --only` with three explicit
paths and was verified to contain exactly those.

## Out of scope

Neither decision is made. Item 18 stays blocked on the default-branch push, owned by Phase 34.16.
Item 19's positive-pin question stays open and unowned.
