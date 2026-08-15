---
phase: quick-260815-qf0
plan: 01
subsystem: frontend-library
tags: [library, filters, layout, source-gate, scss]
requires:
  - src/frontend/screens/Library/components/FilterChipRow
  - src/backend/testUtils/stripSourceComments
provides:
  - FilterChipRow rendered as the first visible child of `.listing`
  - filterChipRowPlacement.test.ts render-order gate
affects:
  - src/frontend/screens/Library/index.tsx
tech-stack:
  added: []
  patterns:
    - comment-stripped source gate (no jsdom in this project)
    - one shared predicate driving both real source and known-bad specimen
key-files:
  created:
    - src/frontend/screens/Library/__tests__/filterChipRowPlacement.test.ts
  modified:
    - src/frontend/screens/Library/index.tsx
    - src/frontend/screens/Library/components/FilterChipRow/index.scss
decisions:
  - "Chip row hoisted above RecentlyPlayed despite only partly governing that lane -- above-the-fold visibility wins; making RecentlyPlayed honour the remaining facets is explicitly out of scope"
  - "Task 2 INLINE: added padding-inline: var(--space-md-fixed) -- every other child of .listing already insets by that exact token; the chip row was the only one flush against the container edge"
  - "Task 2 BLOCK: NO CHANGE to padding-block: var(--space-2xs) -- .libraryHeader already pads all four sides, and padding-block is symmetric so raising it would eat the headroom the hoist reclaims"
metrics:
  duration: ~25 min
  completed: 2026-08-15
  tasks: 2
  commits: 2
---

# Quick Task 260815-qf0: Hoist FilterChipRow Above RecentlyPlayed — Summary

Moved `<FilterChipRow />` from fifth position inside `.listing` to first visible child, locked
the order with a RED-proven comment-stripped source gate, and insetted the row to the gutter
every one of its siblings already uses.

## What changed

| # | Commit | Type | Change |
|---|--------|------|--------|
| 1 | `054ee7a71` | feat | Gate first, then the JSX move + call-site nuance comment |
| 2 | `335f0564a` | style | `padding-inline: var(--space-md-fixed)` on `.FilterChipRow`; `padding-block` deliberately unchanged |

Baseline HEAD at dispatch: `245894932`. Branch `fix/steam-native-install-stability` throughout —
no branch created, no branch switched.

### Task 1 — the move

`src/frontend/screens/Library/index.tsx`: `<FilterChipRow />` deleted from between
`{showAlphabetFilter && <AlphabetFilter />}` and `{refreshing && ...}`, re-inserted immediately
after `<span id="top" />` and above the `{showRecentGames && (` block. **Element moved verbatim** —
no wrapper, no new conditional, no prop, no change to the component itself. The row already
self-suppresses at `activeFilterCount === 0`, so the unfiltered tree is unchanged.

A JSX comment at the new call site records the known nuance (the chips now sit above a lane they
only partly govern: `RecentlyPlayed` receives `showHidden` and `onlyInstalled` but not the store
or runnability facets), states that the user was informed and chose the hoist anyway, and states
explicitly that making `RecentlyPlayed` honour the remaining facets is **not** the fix and is out
of scope.

### Task 2 — the spacing decision

See the dedicated section below. Outcome: **one change (inline), one deliberate no-change (block).**

## RED proof — verbatim

The gate was written **before** any edit to `index.tsx`, so the RED is against the genuinely
shipped old order. No deliberate breakage, no mutation, no revert, and therefore **no `git`
operation of any kind was involved in obtaining it**.

```
FAIL Frontend src/frontend/screens/Library/__tests__/filterChipRowPlacement.test.ts
  source-gate stripper integrity
    ✓ carries the chip-row tag before the RecentlyPlayed tag BEFORE stripping
    ✓ a tag appearing ONLY inside line and block comments does not satisfy the ordering predicate (1 ms)
    ✓ real code on the same specimen survives -- the stripper is not simply deleting everything
  predicate non-vacuity -- known-bad and known-good specimens
    ✓ SANITY: the OLD shipped order (chips last) does NOT satisfy the predicate
    ✓ SANITY: the NEW order (chips first) DOES satisfy the predicate -- so it is not false unconditionally
    ✓ SANITY: a source naming neither tag is false rather than throwing
  Library/index.tsx -- FilterChipRow renders above RecentlyPlayed
    ✕ renders both the chip row and the RecentlyPlayed lane, with the chip row FIRST (1 ms)
    ✕ satisfies the SAME predicate the known-bad specimen fails
    ✓ mounts the chip row exactly once
    ✓ keeps the back-to-top anchor above the chip row

  ● Library/index.tsx -- FilterChipRow renders above RecentlyPlayed › renders both the chip row and the RecentlyPlayed lane, with the chip row FIRST

    expect(received).toBeLessThan(expected)

    Expected: < 23110
    Received:   23881

      169 |     expect(source.indexOf(CHIP_ROW_TOKEN)).toBeGreaterThan(-1)
      170 |     expect(source.indexOf(RECENTLY_PLAYED_TOKEN)).toBeGreaterThan(-1)
    > 171 |     expect(source.indexOf(CHIP_ROW_TOKEN)).toBeLessThan(
          |                                            ^
      172 |       source.indexOf(RECENTLY_PLAYED_TOKEN)
      173 |     )
      174 |   })

      at Object.<anonymous> (src/frontend/screens/Library/__tests__/filterChipRowPlacement.test.ts:171:44)

  ● Library/index.tsx -- FilterChipRow renders above RecentlyPlayed › satisfies the SAME predicate the known-bad specimen fails

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      175 |
      176 |   it('satisfies the SAME predicate the known-bad specimen fails', () => {
    > 177 |     expect(chipRowPrecedesRecentlyPlayed(source)).toBe(true)
          |                                                   ^
      178 |   })

      at Object.<anonymous> (src/frontend/screens/Library/__tests__/filterChipRowPlacement.test.ts:177:51)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 8 passed, 10 total
```

**Why this RED is not vacuous.** `ts-jest` in this repo is transpile-only
(`tsconfig.json` sets `isolatedModules: true`), so a type-error RED would prove nothing and a
load-error RED would prove nothing. Neither happened:

- The suite **loaded** — 8 of its 10 specs ran and passed in the same run.
- Both failures are **assertion** failures with concrete received values: `toBeLessThan` reporting
  the chip-row token at character offset `23881` against `RecentlyPlayed` at `23110` (i.e. the chip
  row was 771 characters *later* in the file), and `toBe(true)` receiving `false` from the shared
  predicate.
- The stripper-integrity specs (3) and the known-bad/known-good specimen specs (3) passed in RED,
  exactly as the plan required.

After the move: **10/10 pass.**

## Stripper load-bearing proof

The gate's `describe('source-gate stripper integrity')` block runs a specimen that carries
`<FilterChipRow />` before `<RecentlyPlayed` **only** inside a `//` line comment, inside a
multi-line `/* */` block, and inside a single-line `/* ... */`:

1. **Before stripping**, the specimen genuinely satisfies the raw ordering — asserted directly
   (`indexOf(CHIP_ROW_TOKEN) < indexOf(RECENTLY_PLAYED_TOKEN)` on the unstripped string). Without
   this the "stripper works" claim would be unfalsifiable, since a specimen that never had the
   token would pass trivially.
2. **After stripping**, the token is gone and the shared predicate returns `false`.
3. **Real code on the same specimen survives** — both `const real = 1` and the genuine
   `<RecentlyPlayed showHidden={showHidden} />` line are still present after stripping. This is the
   half that proves the stripper is not simply deleting everything, which would make every
   "not.toContain" gate in the file vacuously green.

Additionally, the predicate itself is proven non-vacuous in both directions: the OLD-order
specimen returns `false`, the NEW-order specimen returns `true`, and a source naming neither tag
returns `false` rather than throwing. A predicate hardwired to `false` would satisfy the known-bad
spec alone; the positive control closes that.

Both the real-source spec and the known-bad specimen spec are driven through the **identical**
function `chipRowPrecedesRecentlyPlayed(gatedSource)` — not a re-implementation. A specimen checked
by a hand-rebuilt copy of the assertion is a replica and drifts silently.

## Task 2 — the spacing decision, with reasoning

Both questions answered explicitly, as required.

### Q1 — INLINE alignment: **CHANGED.** Added `padding-inline: var(--space-md-fixed)`.

`.listing` (`Library/index.css:91`) is `display:flex; flex-direction:column; flex-grow:1` with **no
padding and no gap**, so every child supplies its own horizontal inset — and they all agree on the
same token:

| Child of `.listing` | Rule | Inline inset |
|---|---|---|
| `.libraryHeader` (the "Played Recently" h5) | `Library/index.css:42` | `padding: var(--space-md-fixed)` |
| `.gameList` (the grid) | `Library/index.css:6` | `padding: 0 var(--space-md-fixed) var(--space-3xl)` |
| `.gameListLayout` (list view) | `Library/index.css:24` | `margin: 0 var(--space-md-fixed)` |
| `.alphabet-filter-container` | `AlphabetFilter/index.css:22` | `margin: 8px var(--space-md-fixed)` |
| `.FilterChipRow` | `FilterChipRow/index.scss` | **none — flush at x=0** |

The last two rows of that table are the finding. `--space-md-fixed` (16px) is not merely what two
neighbours happen to use, it is the *universal* gutter for this container, and the chip row was the
only child not honouring it. In its old fifth position — sandwiched mid-column between
`AlphabetFilter` and the grid — a flush-left band was tolerable. As the container's **first visible
child** it is now the element that establishes the top-left reading edge, sitting directly above a
heading whose text starts 16px in. A flush-left chip band over a 16px-inset heading reads as broken
alignment, and it is the first thing on screen.

Used exactly the token the plan permitted (`var(--space-md-fixed)`). No new value, no new custom
property.

### Q2 — BLOCK separation from the "Played Recently" heading: **NO CHANGE.**

`padding-block: var(--space-2xs)` stays. Reasoning from the tabulated rules:

- `.libraryHeader` carries `padding: var(--space-md-fixed)` on **all four sides**, so 16px of the
  heading's own padding already sits between the chips and the heading's text — separation the
  chip row does not need to supply a second time. Total optical gap is ~22px
  (`--space-2xs` ≈ 6px + 16px), already more than one full `--space-md-fixed` step.
- The asymmetric risk that settles it: `padding-block` is **symmetric**. Increasing it to improve
  separation *below* the chips would equally push the chips *down* from the top of the scroll
  container — eating precisely the above-the-fold headroom this entire task exists to reclaim.
  There is no one-sided win available from this declaration, and the one-sided alternative
  (`padding-block-end` only) would be a new asymmetry solving a gap that is already adequate.

A rationale comment sits above **both** declarations in the stylesheet, so neither the added inset
nor the deliberately-retained block value is later "cleaned up" back to the pre-hoist tuning.

### Constraint compliance

- Both declarations live on `.FilterChipRow` itself. **Nothing** was added to `.listing` or
  `RecentlyPlayed` — those apply when the chips are absent and would open a gap at the top of an
  unfiltered library, the one regression this change could plausibly cause.
- `index.scss:29`'s `--filter-active-color: var(--navbar-active, var(--accent-overlay, var(--accent)))`
  is **byte-identical**: `git diff` on the file is insertions-only (`1 file changed, 21 insertions(+)`,
  zero deletions), and `git diff | grep filter-active-color` returns empty.
- Verified the compiled output with `npx sass`: every emitted selector is nested under
  `.FilterChipRow`, the new declaration lands on the root only, and the fallback chain is emitted
  unchanged. No unscoped selector (the 34.10 `.MuiTabs-root` leak class).
- No new colour, no new custom property, no hard-coded length.

## Verification

| Gate | Result |
|---|---|
| `npx jest .../filterChipRowPlacement.test.ts` | **10/10 pass** |
| `npx jest .../libraryPipeline .../libraryHeaderVisibility .../tier2Portal` | **63/63 pass** |
| `npx jest src/frontend/screens/Library/__tests__/` (all 6 suites) | **117/117 pass** |
| `npx jest .../NavShell/__tests__/themeTokens.test.ts` | **pass** (census undisturbed) |
| `npx tsc --noEmit` | **exit 0** |
| `npx eslint` on both changed source files | **0 errors**, 21 pre-existing warnings, none at the edited lines |
| `npx sass` compile of the stylesheet | **exit 0**, all selectors scoped |
| Full `npx jest` (all 5 projects) | **274/274 suites, 5408 passed / 1 pre-existing skip, exit 0** |

The full-suite figure is exactly the prior baseline plus this task: STATE.md records 273 suites /
5398 passed at dispatch; this run is 274 suites (+1, the new gate) / 5408 (+10, its ten specs).
**Zero regressions.** The "worker process has failed to exit gracefully" line is the repo's
pre-existing teardown warning, not a failure.

## Deviations from Plan

**None.** No Rule 1/2/3 auto-fix was needed and no Rule 4 architectural question arose. The plan
executed exactly as written, including its prediction that writing the gate first would yield a
genuine RED for free.

## Git safety

- No forbidden command was run: **no** `git stash` (any form), **no** `git clean`, **no**
  `git checkout`, **no** `git restore` without `--staged`, **no** `git reset --hard`.
- `git stash list` is **empty** at hand-off.
- No revert was ever needed, so the scratchpad backup path was not exercised.
- Both commits staged **explicit paths only** — never `git add -A`, `git add .`, or `git commit -a`.
- Post-commit deletion check ran on both commits: `git diff --diff-filter=D HEAD~1 HEAD` empty
  both times. Nothing was deleted.
- The concurrent Phase 34.13 session made no changes to the tree during this run; the only
  untracked entry at hand-off is this task's own planning directory, left for the orchestrator's
  docs commit.

## Human gate — ✅ ALL 5 PASSED (live UAT 2026-08-15), item 3 re-worded first

This project has **no jsdom, no react-test-renderer and no CSS engine**. Nothing in the automated
section mounts a component or evaluates a single declaration. The source gate proves **render
ORDER in the source text and nothing else** — it is silent on whether the row renders, what it
looks like, whether the inset reads correctly, and whether an unfiltered library is unchanged.
**The live run below is therefore the sole evidence for every item here.** Operator-confirmed
under `pnpm tauri:dev` on macOS; not self-approved.

1. **PASS — Chips visible above the fold on relaunch.** The chip row renders at the very top of
   the library, above all other text in the column, with no scrolling.
2. **PASS — No gap when unfiltered.** No empty row and no extra whitespace once filters are
   cleared. This was the one regression the change could plausibly have caused, and it is now
   observed rather than merely reasoned from the `activeFilterCount === 0` self-suppression.
3. **PASS — but the item as originally written was REJECTED BY THE OPERATOR AS A BAD CRITERION,
   and the wording below is the correction.** It originally read: *"the chips … read as their own
   band, clearly separated from the 'Played Recently' heading below, and their left edge lines up
   with that heading's text."* The operator's objection is correct and worth preserving: the
   "Played Recently" heading sits **far down the column**, so asking whether a row at the very top
   "shares its left edge" with a distant heading is incoherent as a visual check — an observer
   naturally reads it as a claim about *proximity*, which is not what was meant and not what the
   Task 2 decision was about.

   **What the check should have said:** is the chip row inset from the left edge of the content
   column by the **same gutter as the column's other children** (`--space-md-fixed`), rather than
   sitting flush against the window edge? The heading was only ever a proxy for that shared
   gutter, and a poor one.

   **What was actually observed:** the chips sit at the very top, above all text in the column,
   and **no misalignment was reported**. Recorded as a pass on that basis.

   ⚠ **Attestation limit:** the specific property "inset equals the sibling gutter" was not
   separately measured — the window was closed before an instrumented check could run
   (`System Events` reported 0 windows; the process stays alive after the window closes). It is
   verified *mechanically* instead: the declaration uses the identical `--space-md-fixed` token as
   `.libraryHeader`, `.gameList`, `.gameListLayout` and `.alphabet-filter-container`, and `sass`
   confirms the emitted selector. That is the reason to expect alignment, not an observation of it.
4. **PASS — Chips still work from the new position.** Removing a single filter via a chip's x and
   clearing them all via `Clear all` both behave correctly from the hoisted position.
5. **PASS — Theme survival.** Confirmed in the token-poor themes (`gruvbox_dark` / `dracula`
   define neither `--text-hover` nor `--navbar-active`); chips render with visible text and
   borders.

**Process lesson for future gates in this repo:** an appearance check must name the property
directly (*"is this inset by the same gutter as its siblings?"*) rather than routing it through a
landmark element that may be nowhere near the thing being judged. The landmark form reads as a
proximity claim and wastes an operator's turn on clarification.

### Known nuance — recorded, not fixed

The chips now sit above `RecentlyPlayed`, a lane they only **partly** govern: that lane receives
`showHidden` and `onlyInstalled` but **not** the store or runnability facets. The user was informed
and chose the hoist anyway — above-the-fold visibility is the point. Do not make `RecentlyPlayed`
honour the remaining facets, and do not move the row back on this basis. The nuance is recorded at
the call site in `index.tsx` so a future contributor sees it before "correcting" the placement.

## Known Stubs

None. No placeholder, hardcoded-empty value, or unwired data source was introduced — this task
moved one existing element and added two CSS declarations.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern, or schema change. The plan's
`T-QF0-01` (chip labels now above the fold) stands accepted as written: the labels are the user's
own filter selections and were already rendered in the same window one screen lower.

## Self-Check: PASSED

- `src/frontend/screens/Library/__tests__/filterChipRowPlacement.test.ts` — FOUND (198 lines)
- `src/frontend/screens/Library/index.tsx` — FOUND, modified
- `src/frontend/screens/Library/components/FilterChipRow/index.scss` — FOUND, modified
- Commit `054ee7a71` — FOUND in `git log`
- Commit `335f0564a` — FOUND in `git log`
