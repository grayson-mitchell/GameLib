---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 17
subsystem: ui
tags: [focus-row, strip-width, scrollbar, wkwebview, gap-closure, G-48-11c]

requires:
  - phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
    provides: 48-12 write epsilon and flip-hold, 48-14 next-frame runner, 48-15 live B7 numbers (+2 CSS px in FilterZeroResult)
provides:
  - readScrollerAllowance, StripLayoutContext and syncCardWidth's third parameter (focusRowOverflow.ts)
  - FocusRowStrip gridShown prop, read through a ref by one stable layout context at both sync call sites
  - a WKWebView scroller harness (evidence/48-17) and states A1-A9 before and after the fix
  - G-48-11c diagnosed in 48-UAT.md (still failed, live verdict owed to 48-18)
affects: [48-18]

actuals:
  tokens: 45000
  tasks: 3
  commits: 6
plan_head_before: a2f57882bfe2d56a4bfa550a4dabe0b4530429db
plan_head_after: 6e6ace05a605e6654b7f47be552e0f3f3feb70be

key-files:
  created:
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-17/build-scroller-page.mjs
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-17/page-script.js
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-17/run-webkit.sh
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-17/results-before-fix.json
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-17/results-after-fix.json
  modified:
    - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
    - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
    - src/frontend/screens/Library/index.tsx
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
    - src/frontend/screens/Library/__tests__/librarySyncNoticeSource.test.ts
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-UAT.md

key-decisions:
  - "Strip-only scrollbar-allowance hold: while the grid is hidden the strip uses C - (remembered allowance - current allowance); live C with no reference. Grid, App.css and index.scss untouched."
  - "gridShown reaches the sync through a ref and one stable context, so the observer's next-frame runner reads the live value."
  - "A throwing context reads as grid shown, allowance 0; the remembered allowance is left alone."

requirements-completed: [R3, R4]

coverage:
  - id: D1
    description: "The +2 CSS px is attributed to the main scroller's 10px scrollbar disappearing, measured in WebKit before any fix"
    verification:
      - kind: other
        ref: "evidence/48-17/results-before-fix.json (base a2f57882b): sb 10 to 0, track +10, card +2.0 = 10/5, A3 counterfactual delta 0, A4 grid card = A2 strip card"
        status: pass
    human_judgment: false
  - id: D2
    description: "Strip card width in the empty-result state and list layout equals the grid-state width within 0.5 CSS px"
    verification:
      - kind: other
        ref: "evidence/48-17/results-after-fix.json A2, A5, A6 = 172.391 against A1 172.391"
        status: pass
    human_judgment: false
  - id: D3
    description: "Wherever the grid shows, the strip equals the grid card, including a non-overflowing library"
    verification:
      - kind: other
        ref: "results-after-fix.json A1, A1b, A4 (grid shown, no bar, 174.391 = 174.391), A7 (small library, sb 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A resize while the grid is hidden still follows the live track width"
    verification:
      - kind: unit
        ref: "focusRowOverflow.test.ts Z4"
        status: pass
      - kind: other
        ref: "results-after-fix.json A8: 196.5 = column over C - 100 held at the old bar"
        status: pass
    human_judgment: false
  - id: D5
    description: "The grid is untouched"
    verification:
      - kind: other
        ref: "git diff a2f57882b HEAD -- Library/index.css App.css index.scss is empty"
        status: pass
    human_judgment: false
  - id: D6
    description: "The live empty-grid then list-layout clause of UAT item 11, and no ResizeObserver loop errors, in the real app"
    verification: []
    human_judgment: true
    note: "Owed to 48-18 (live gate)."

status: complete
---

# Phase 48 Plan 17: Strip width holds across the empty grid Summary

The strip no longer jumps when a search empties the grid or the layout switches: while no grid is shown it keeps the grid's scrollbar allowance, a strip-only hold measured and proven in WebKit.

## Result

G-48-11c (live 2026-10-09, 48-15 B7: +2 CSS px in FilterZeroResult) is reproduced, isolated and fixed at the desk. The gap stays `failed` in `48-UAT.md` with a measured `root_cause`; the live verdict is owed to 48-18.

BASE `a2f57882bfe2d56a4bfa550a4dabe0b4530429db`. Green fix commit `d77571f9c`. HEAD at SUMMARY write `6e6ace05a605e6654b7f47be552e0f3f3feb70be`.

The task prompt's one-line title ("move the library top section into the panel and widen it") does not match the plan file, which is the G-48-11c scrollbar plan; the plan file was executed.

## Commits

| Commit | Message |
|--------|---------|
| d9da1e432 | docs: G-48-11c reproduced in WebKit; main scrollbar toggle isolated |
| 2ea01e5ab | test: failing gates for the strip scrollbar-allowance hold (RED) |
| d77571f9c | fix: the strip holds the grid's scrollbar allowance while no grid is shown |
| 83d6b3cec | docs: tracer run, empty-state strip width held in WebKit |
| a4d7639d0 | docs: hold proven against parity, resize-while-hidden and the no-reference edge in WebKit |
| 6e6ace05a | docs: G-48-11c diagnosed (main scrollbar toggle) and desk-fixed |

## H1 measurement (before, base a2f57882b, WKWebView, 5 columns)

| State | sb | track W | C | strip card | grid card |
|-------|----|---------|---|-----------|-----------|
| A1 grid, 14 cards | 10 | 988 | 958 | 172.391 | 172.391 |
| A2 empty (FilterZeroResult) | 0 | 998 | 968 | 174.391 | none |
| A3 empty plus a spacer keeping the scroller overflowing | 10 | 988 | 958 | 172.391 | none |
| A5 list layout, empty | 0 | 998 | 968 | 174.391 | none |
| A6 list layout, 14 rows | 10 | 988 | 958 | 172.391 | none |
| A1b grid again | 10 | 988 | 958 | 172.391 | 172.391 |
| A4 grid, scroller `overflow-y: hidden` | 0 | 998 | 968 | 174.391 | 174.391 |

H1 holds on every written threshold: scrollbar 10 to 0, track delta 10 equals the bar, card delta 2.0 equals 10 / 5, the A3 counterfactual moves nothing, and the A4 grid card equals the A2 strip card. The +2 is the width a grid column has over the scrollbar-less container, so the strip matched a grid that is never shown.

## After the fix (HEAD d77571f9c, `call: context`)

| State | sb | strip card | reference | note |
|-------|----|-----------|-----------|------|
| A1 / A1b grid | 10 | 172.391 | grid 172.391 | parity |
| A2 empty | 0 | 172.391 | A1 | held |
| A3 empty, overflowing | 10 | 172.391 | A1 | no change |
| A5 list, empty | 0 | 172.391 | A1 | held |
| A6 list, 14 rows | 10 | 172.391 | A1 | held |
| A4 grid, no bar | 0 | 174.391 | grid 174.391 | grid shown resets the reference to 0 |
| A7 small library, grid shown | 0 | 174.391 | grid 174.391 | parity where the grid does not overflow |
| A8 narrowed 100px while hidden | 0 | 196.500 | expected 196.500 | column over C - 100 at the old bar; live C would give 199 |
| A9 fresh track into the empty state | 0 | 174.391 | expected 174.400 | the documented no-reference edge |

## Documented limit

A track that has never seen the grid (a launch straight into a persisted zero-result filter) has no reference, so the strip takes the column over the live scrollbar-less container (A9). Once the grid shows, the reference exists. A shown grid with no scrollbar resets the reference to 0 (A4), so a later hidden state follows that.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] An existing source gate pinned the `refreshingInTheBackground` occurrence count at 3**
- **Found during:** Task 1 green run, `librarySyncNoticeSource.test.ts` G3
- **Issue:** the plan's `gridShown` expression mirrors the GamesList gate and so adds a fourth occurrence of the token. The gate exists to catch a surviving old guard; the new site is not that.
- **Fix:** repinned 3 to 4 and rewrote the docblock and message to name the `FocusRowStrip` gridShown prop as the fourth site (a fifth would still trip it).
- **Files modified:** `src/frontend/screens/Library/__tests__/librarySyncNoticeSource.test.ts`
- **Commit:** d77571f9c

**2. [Rule 1 - Bug] `pnpm lint` production error `no-unnecessary-type-assertion` in my new `readScrollerAllowance`**
- **Fix:** `track.closest<HTMLElement>('main.content')` in place of a cast. Folded into d77571f9c before commit.

**3. [Plan tolerance] Harness file split**
- The page script lives in `evidence/48-17/page-script.js`, inlined by `build-scroller-page.mjs` (the 48-13 idiom). The plan listed only the builder and `run-webkit.sh`. `run-webkit.sh` takes an optional `--extended` second argument for A7-A9. Task 1 saved A1-A6/A4 and Task 2 re-ran with `--extended` into the same `results-after-fix.json`.

No requirement or acceptance criterion changed. Chromium substitute and `run-chromium.sh` were not needed: the WebKit instrument read sb 10 and 0.

## Known Stubs

None.

## Threat Flags

None. No new network, auth or file surface; the change reads layout geometry and writes the same inline custom property (T-48-56: a held width produces no write, Z2; the observer still writes only in the next frame).

## For the live gate (48-18)

- Re-run item 11's empty-grid then list-layout clause: search `zzzz`, then switch to list layout, and compare the strip card to the grid state (was +2 CSS px, 354-355 to 358-359 capture px).
- Watch the transition frames into the empty state: the `gridShown` flip re-syncs in the layout effect before paint, so no one-frame jump is expected; the rig cadence (about 121 ms) cannot exclude a sub-frame change.
- Record scrollbar presence in each state (grid with bar, empty without, list with and without).
- Re-run B3's resize sweep and count `ResizeObserver loop` errors (T-48-56); expected 0.
- Also check the one-result search and the refresh state, and the A9 edge (launch straight into a persisted zero-result filter).

## Verification run

- `npx jest --selectProjects Frontend src/frontend/screens/Library src/frontend/helpers`: 200 suites, 3572 tests, green. `npx jest --selectProjects Meta`: 46 suites, 1357 passed, 1 skipped.
- `pnpm codecheck`, `pnpm lint` (production and tests PASS), `pnpm planning-gates` (12/12): green.
- Scoped `npx prettier --check` over the six source and test paths: clean, each confirmed not ignored via `--file-info`. The `.planning` evidence and records are prettier-ignored by design and hand-matched.
- `graphify update .`: ran.

## Self-Check: PASSED

All created files exist on disk and all six plan commits are present in git history.
