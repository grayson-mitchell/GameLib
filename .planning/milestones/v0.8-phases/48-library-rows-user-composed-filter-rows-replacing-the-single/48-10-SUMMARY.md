---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 10
subsystem: ui
tags: [css, stacking-context, focus-row, scroll-into-view, controller-mode, source-gate, jest]
gap_closure: true
gap_ids: [G-48-4b, G-48-9]

requires:
  - phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
    provides: FocusRowStrip, its chevron controls (48-04) and the 3px/+2px hover ring (48-09) whose clearance this plan provides
provides:
  - "`.focusRowTrack` is its own stacking context (`isolation: isolate`), so a hovered or focused edge card never paints over a chevron (G-48-4b, G-48-9)"
  - "The strip list pads 12px inline (`width: max-content`) and the viewport bleeds out 12px, so end cards keep room for the 1.05-scaled 3px/+2px ring and still line up with the grid"
  - "`scrollFocusedCardIntoViewHorizontally(ev, getStyle?)` brings a controller-focused card in by the list's computed inline padding, with a zero-clearance fallback"
affects: [48-11, 48-12, FocusRowStrip, gap G-48-8c]

plan_head_before: 791c4dc80dd3d2d3059f40446d29ed39a175aaa6
plan_head_after: 78cd69511226a553a238f9e20181283f5a532b48

actuals:
  tokens: 4000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Stacking contract by containment: isolation on the scroller instead of a larger control z-index, so card-internal z-indexes (up to 5) cannot compete with the positioned controls"
    - "Clearance read from computed style at call time with an injectable getStyle and a total zero fallback (same rule measureCardPitch follows for the gap), so the CSS stays the one place the value is written"

key-files:
  created: []
  modified:
    - src/frontend/screens/Library/components/FocusRowStrip/index.css
    - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts

key-decisions:
  - "Chevron stacking is fixed by `isolation: isolate` on the track, not by raising the control's z-index: a resting card has no stacking context, so its children's z-indexes up to 5 escape into the shared one"
  - "Strip-end clearance is 12px inline padding on the list, with the viewport bleeding out 12px the other way; `width: max-content` is what makes the padding count toward scrollWidth in both WKWebView and WebView2"
  - "The scroll-into-view handler reads the list's computed padding (never a constant) and treats any unreadable, negative or non-finite value, a missing list, or a throwing getStyle as zero clearance"

patterns-established:
  - "Source gate parses N from the shipped CSS and asserts the list padding equals the viewport bleed and stays under the strip's 16px gutter"

requirements-completed: [R3]

coverage:
  - id: D1
    description: "G-48-4b / G-48-9: a hovered or focused edge card never paints over a strip chevron; the chevron stays clickable and a click pages the strip"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts#Test 1: .focusRowTrack declares isolation: isolate"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts#Test 2: .focusRowTrack declares no z-index"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts#Test 3: .focusRowStrip__control is position: absolute with an integer z-index of at least 1"
        status: pass
      - kind: manual_procedural
        ref: "Operator, Windows 11, dev shell, real mouse, 2026-10-07/08: chevron stays on top through the hovered edge card and the click pages the strip (UAT item 9 re-run) -- PASS"
        status: pass
    human_judgment: true
    rationale: "Operator-observed live: jest has no CSS engine, so the paint order and the real-pointer hit-test are only provable in the running shell. The operator ran it and reported PASS (\"checked chevron, is working\"). Recorded through /gsd-verify-work 48."
  - id: D2
    description: "Pairs with G-48-8a / G-48-8b (owned by 48-09): the list pads 12px inline with width: max-content and the viewport bleeds 12px, so the first card at scrollLeft 0 and the last at end of travel keep at least 10px beside their outer edge and the strip stays aligned with the grid"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts#Test F: the list declares width: max-content, padding-block: 0 and padding-inline of at least 10px"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts#Test G: the viewport bleeds out by exactly the list padding, so cards stay aligned with the grid"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts#Test H: the strip keeps its 16px gutter, and the bleed stays inside it"
        status: pass
    human_judgment: true
    rationale: "Pending live re-check. Whether the ring is actually uncut on the LEFT edge at scrollLeft 0 and the right edge at end of travel (3px ring at +2px, scale 1.05, for hover as well as focus), and whether the first strip card's left edge equals the first grid card's within 1px, needs a rendering engine. Operator separately reported 'in the focus row the border is trimmed off on the left edge of the leftmost tile' (2026-10-07/08), which is exactly this defect; the fix is committed but not yet re-observed. Harvested at end-of-phase UAT with items 5 and 6."
  - id: D3
    description: "Controller focus moving past either track edge scrolls the card in by the list's computed inline padding (not flush), a card already inside the clearance does not scroll, and any unreadable padding is zero clearance"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts#Test A: a card flush with the right edge scrolls by the right clearance"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts#Test B: a card flush with the left edge scrolls back by the left clearance"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts#Test C: a card at least the clearance inside both edges does not scroll"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts#Test D: a card past the right edge scrolls by the overhang plus the clearance"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts#Test E (unreadable padding, no list, throwing getStyle)"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-10-07
status: complete
---

# Phase 48 Plan 10: Chevron stacking and strip-end clearance Summary

**The focus-row track is an isolated stacking context so chevrons paint above any hovered or focused card (operator-verified live), and the strip list pads 12px inline with a matching viewport bleed so end-card rings are not clipped, with controller scroll-into-view reading that padding as clearance.**

## Performance

- **Duration:** ~15 min for the Task 2 continuation (Task 1 and its live checkpoint ran in the earlier session)
- **Started:** 2026-10-07T18:20Z (continuation)
- **Completed:** 2026-10-07T18:36Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- **G-48-4b / G-48-9 (Task 1, tracer):** `.focusRowTrack` declares `isolation: isolate`, so every card-internal z-index (hover 2, focus 3, title 3, icons bar 4, badges 5) stays inside the track and the z-index 1 controls paint above the whole track. The operator confirmed it live: "checked chevron, is working" (chevron stays on top through the hovered edge card; the click pages the strip).
- **Strip-end clearance (Task 2):** `.focusRowTrack .gameList` now has `width: max-content`, `padding-block: 0`, `padding-inline: 12px`; `.focusRowStrip__viewport` has `margin-inline: -12px`. The ring reach is (78 + 5) x 1.05 - 78 = about 9.15px, so 12px clears it on hover (48-09's grouped ring) as well as focus, on both the left edge at `scrollLeft` 0 and the right edge at end of travel. The operator's separate live report, "the border is trimmed off on the left edge of the leftmost tile", is this defect; the fix is committed and the left-edge re-check is owed (see Human checks below).
- **Controller scroll-into-view (Task 2):** `scrollFocusedCardIntoViewHorizontally(ev, getStyle?)` reads the list's computed `paddingLeft` / `paddingRight` at call time and scrolls a card in to sit inside the track by that clearance. Missing list, unreadable (`''`, `'auto'`, `'NaN'`), negative or non-finite padding, or a throwing `getStyle` is zero clearance, which is the previous flush behaviour exactly. The listener attachment in `index.tsx` is unchanged.

## Task Commits

1. **Task 1 (tracer, TDD): chevron stacking contract**
   - RED `acd866035` test(48-10): add failing gate for chevron stacking context
   - GREEN `39b15f31a` feat(48-10): focus-row track is a stacking context so chevrons paint above hovered cards
2. **Task 2 (TDD): strip-end clearance and clearance-aware scroll-into-view**
   - RED `987854f36` test(48-10): add failing gates for strip-end clearance (overflow Tests A, B, D and the padding-sharing case; source Tests F, G, H failed; `gsd_run check tdd-red-evidence` returned `RED_EVIDENCE_OK` for the overflow target Test A and the source target Test F)
   - GREEN `78cd69511` feat(48-10): strip ends keep room for the ring; controller scroll stops short of the edge

**Plan metadata:** the `docs(48-10)` commit that carries this file (see git log).

## Files Created/Modified

- `src/frontend/screens/Library/components/FocusRowStrip/index.css` - track `isolation: isolate`; list `width: max-content` + `padding-inline: 12px`; viewport `margin-inline: -12px`; comments name G-48-4b, G-48-9, G-48-8a, G-48-8b and the 9.15px arithmetic
- `src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts` - clearance-aware `scrollFocusedCardIntoViewHorizontally`, with `readEdgeClearance` and `clearanceFrom` helpers
- `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts` - stacking-contract describe (Tests 1-3) and strip-end-clearance describe (Tests F-H)
- `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts` - edge-clearance describe (Tests A-E plus per-side padding and zero-clearance cases)

## Decisions Made

- Containment over a bigger z-index for the chevrons (see key-decisions). Both numbers stay untouched: the control's `z-index: 1` is unchanged.
- The 12px is written once in CSS; the handler never restates it. Tests inject `getStyle`, so the arithmetic is covered without a CSS engine.
- Tests F and G parse N from the shipped stylesheet and assert equality rather than hard-coding 12, so a later change to the padding must move the bleed with it.

## For 48-12 (gap G-48-8c) to revisit

The operator ruled (G-48-8c, amending D-01) that strip cards must match the grid's card width. Nothing in this plan hard-codes a card width, but two existing values from earlier plans still assume 156px and are 48-12's to change:

- `FocusRowStrip/index.css` `.focusRowTrack .gameList > * { flex: 0 0 156px }`, pinned by the existing source gate ("declares a fixed flex: 0 0 156px" and the `minmax(`/`1fr` negative). Both the rule and its gate move together.
- `focusRowOverflow.ts` `FALLBACK_CARD_WIDTH = 156` (and `FALLBACK_CARD_GAP = 24`) in `measureCardPitch`, plus its "falls back to 156 + 24" tests. `measureCardPitch` already reads the real card width from the DOM, so the constant is only the no-measurement fallback.

This plan's clearance reads the list's padding from computed style and is width-independent. If 48-12 changes the strip's card width, the 9.15px ring-reach arithmetic in the CSS comment (which uses the 78px half-width) must be recomputed: reach is (halfWidth + 5) x 1.05 - halfWidth, which grows with card width, and 12px has only about 2.85px of headroom at 156px. A wider card could need a larger N, and Tests F-H will force the bleed to follow.

## Deviations from Plan

None - plan executed exactly as written. (Four extra overflow cases beyond Tests A-E were added: per-side padding, a throwing `getStyle`, `-8px` padding, and a plain-overhang case with a `null` list; all fall inside Test E's zero-clearance contract and T-48-32's mitigation.)

## Issues Encountered

None.

## Human checks owed (end-of-phase UAT, not stopped for)

- **Task 1 (done, PASS):** UAT item 9 re-run, operator on Windows 11, dev shell, real mouse.
- **Task 2 (pending live re-check, via `/gsd-verify-work 48`):**
  1. At `scrollLeft` 0: hover the first card; the whole 3px ring is visible on the LEFT (the operator's reported trim) and the top and bottom. At end of travel hover the last card; the right ring is visible.
  2. Controller: move focus right past the last fully visible card and keep going; each newly focused card's ring sits inside the track by at least 3px each side (DOM probe against `track.getBoundingClientRect()`).
  3. UAT item 5 recheck: forward control enabled at `scrollLeft` 0 and `disabled` once `scrollLeft + clientWidth >= scrollWidth - 1`; a 2-card collection shows neither control.
  4. UAT item 6 recheck at 1280 and 520px: no title rect exceeds its card rect.
  5. The strip's first card left edge equals the first grid card's left edge within 1px (the bleed equals the padding).

## Verification

- `npx jest --selectProjects Frontend --testPathPattern "focusRowStripSource|focusRowOverflow|focusRowSelectors"`: 3 suites, 109 tests passed. Same count with `FocusRowStrip`.
- `pnpm codecheck`: exit 0, no `error TS`.
- `pnpm lint`: 0 errors (638 pre-existing warnings), `production: PASS | tests: PASS`.
- `npx prettier --check` over the 4 written paths (all `"ignored": false`): all matched files use Prettier code style.
- `git diff 791c4dc80..HEAD -- .../FocusRowStrip/index.tsx`: empty (not modified by this plan).
- `pnpm planning-gates` was not run: python3 is not installed on this Windows machine.

## Threat Flags

None. T-48-31 (control under a hovered card) is mitigated by the isolation and pinned by Tests 1-3, with the live proof recorded above. T-48-32 (a throw in the capture-phase listener) is mitigated by the total clearance fallback and Test E.

## Known Stubs

None.

## Next Phase Readiness

- 48-11 (chevron contrast) edits the same `FocusRowStrip/index.css` and its source gate; this plan's blocks (`.focusRowTrack`, `.focusRowTrack .gameList`, `.focusRowStrip__viewport`) are in place and independent of the control's colour rules.
- 48-12 (G-48-8c, card width parity) has the notes above.

## Self-Check: PASSED

- `FocusRowStrip/index.css`, `focusRowOverflow.ts` and both test files exist on disk; all four commits (`acd866035`, `39b15f31a`, `987854f36`, `78cd69511`) are present in `git log`.
- Every `<acceptance_criteria>` item re-run: Task 1 (jest passes, Test 1 failed before the CSS edit, pre-existing tests unmodified) PASS; Task 2 (jest passes with 3 suites, Tests A, B, D and F, G failed before implementation, pre-existing `scrollFocusedCardIntoViewHorizontally`/`measureCardPitch`/`pageScrollDelta`/`canScroll*` tests pass unmodified, `index.tsx` not modified) PASS.

---
*Phase: 48-library-rows-user-composed-filter-rows-replacing-the-single*
*Completed: 2026-10-07*
