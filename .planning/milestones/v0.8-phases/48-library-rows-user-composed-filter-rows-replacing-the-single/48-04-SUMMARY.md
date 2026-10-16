---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 04
subsystem: ui
tags: [react, typescript, focus-row, overflow, gamepad, css]

requires:
  - phase: 48-02
    provides: "`FocusRowStrip` with `trackRef` on `.focusRowTrack` and `.focusRowStrip__viewport { position: relative }`"
  - phase: 48-01
    provides: "`gamelib:library.filterPanel.focusRowNext` / `focusRowPrevious` in all 49 catalogues"
provides:
  - "DOM-free paging and scroll-into-view arithmetic (`pageScrollDelta`, `canScrollForward`, `canScrollBack`, `measureCardPitch`, `scrollFocusedCardIntoViewHorizontally`)"
  - "Two real focusable icon-only buttons that mount only when the track can scroll, page by whole cards, and disable natively at the ends"
  - "A capture-phase horizontal scroll-into-view handler for gamepad focus, gated on `activeController`"
affects: [48-05, 48-06]

actuals:
  tokens: 8622 # chars/4 over `git diff 40a8ffc04..HEAD -- src meta` (34486 bytes)
  tasks: 3
  commits: 6
commits: 6
plan_head_before: 40a8ffc049951c96a8946aec13a31c55e8be1b57
plan_head_after: f5af047a1e2e2217ee57de3e9bad06c21891ba98

tech-stack:
  added: []
  patterns:
    - "Measurement-object arithmetic: every exported function takes a plain `{ clientWidth, scrollWidth, scrollLeft }` or a `FocusEvent`, so a `testEnvironment: 'node'` project can test it with hand-built stubs."
    - "Absence as a mount decision: `showControls = forwardEnabled || backEnabled` gates both buttons in JSX, so a source gate can see 'no affordance when content fits' rather than trusting a style."
    - "Rect-relative scroll destinations: `track.scrollLeft + (card edge - track edge)`, never an `offsetParent` offset."

key-files:
  created:
    - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts
  modified:
    - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
    - src/frontend/screens/Library/components/FocusRowStrip/index.css
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "`SUBPIXEL_EPSILON = 1`: under one pixel of remaining travel counts as no travel, so a fractional layout cannot leave an enabled control that scrolls nothing."
  - "Plain-CSS flat selectors for the two focus arms (`.focusRowStrip__control:focus-visible, .focusRowStrip__control:focus:is(body.controllerLayout *)`) rather than SCSS `&` nesting, because `FocusRowStrip/index.css` is plain CSS."
  - "`focusRowOverflow.ts` promoted into the hand-curated i18n gate scope (177 -> 178) on the 48-02 precedent, rather than left as unscanned debt."

requirements-completed: [R3]

duration: 72min
completed: 2026-10-05
status: complete
---

# Phase 48 Plan 04: Focus-row overflow controls and horizontal gamepad scroll Summary

**Two real, i18n-labelled, icon-only buttons now page the focus-row track by whole visible cards, mount only under overflow and natively disable at the ends, backed by a DOM-free paging module and a rect-relative horizontal gamepad scroll-into-view handler.**

## Performance

- **Duration:** ~72 min (first task commit 17:12 +13:00 to summary)
- **Tasks:** 3/3 completed
- **Files:** 6 modified, 2 created

## Accomplishments

- `focusRowOverflow.ts`: `pageScrollDelta` pages `floor(clientWidth / pitch)` whole cards, floored to one card and finite for `NaN`/`Infinity`/`0`; `canScrollForward`/`canScrollBack` are false for content that fits and treat sub-pixel residue as no travel; `measureCardPitch` reads the gap from computed style instead of restating `1.5rem`; `scrollFocusedCardIntoViewHorizontally` resolves `.focusRowTrack` at call time, returns silently when absent, and scrolls by rect difference only. 27 unit tests, including the sub-pixel case as a named test.
- `FocusRowStrip/index.tsx`: both controls render inside `showControls`; the one at the end of travel carries `disabled={...}`; activation is `track.scrollBy({ left: +-pageScrollDelta(...), behavior: 'smooth' })`; a `ResizeObserver` (track and `.gameList`) plus a `scroll` listener keep the measurement current and are removed/disconnected on unmount; the capture-phase `focus` listener is attached to the track under `activeController` with cleanup. No `onWheel`.
- `FocusRowStrip/index.css`: 36px circular overlays, `inset-inline-start/end`, `rgba(0,0,0,0.55)` declared before `color-mix(...)`, icon `var(--accent)`, outset focus ring with the `body.controllerLayout` arm, `:disabled { opacity: 0.38 }`. No new custom property; `cssTokenSweep` and `themeTokens` green and `themeTokens.test.ts` digest unchanged.
- `pnpm i18n` left `public/locales/en/gamelib.json` byte-identical: the labels reuse 48-01's keys.

## Task Commits

1. **Task 1 RED:** `619df17c0` (test) - 24 cases against a signature-only stub; 12 failed on assertions, 12 passed trivially (the stub's `false`/`0` coincide with expected values for the no-overflow and no-throw cases)
2. **Task 1 GREEN:** `c26d5e1a4` (feat) - implementation; 27/27 (3 `measureCardPitch` cases added alongside)
3. **Task 2 RED:** `2f012677f` (test) - 11 of 23 source-gate cases failing
4. **Task 2 GREEN:** `29de7f523` (feat) - controls, observers, handler, and the stylesheet import
5. **Task 2 follow-up:** `ba8f8eaae` (fix) - i18n-gate-scope refresh for the new file
6. **Task 3:** `f5af047a1` (feat) - control CSS plus its source-gate assertions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `FocusRowStrip/index.css` was never imported by anything**
- **Found during:** Task 2
- **Issue:** The stylesheet 48-02 landed has no importer (`GamesList`, `GameCard` and `Library/index.tsx` import their own CSS; nothing imported this one). Every `FocusRowStrip` rule, including the whole `.focusRowTrack` flex strip, was dead in a real build; the controls would have rendered unstyled and un-positioned.
- **Fix:** Added `import './index.css'` to `FocusRowStrip/index.tsx`, with a source-gate test so it cannot regress.
- **Files modified:** `FocusRowStrip/index.tsx`, `__tests__/focusRowStripSource.test.ts`
- **Commit:** `29de7f523`

**2. [Rule 3 - Blocking] Meta gate scope and fork-touched snapshot went stale for the new file**
- **Found during:** Task 2 (full `Meta` project run)
- **Issue:** `focusRowOverflow.ts` is a new fork-touched `.ts` file, tripping the A-17 anti-rot test and the A-03 declared-debt ratchet.
- **Fix:** Regenerated `meta/i18nForkTouchedFiles.json` (227 -> 228), added the file to the hand-curated `meta/i18nGateScope.json` (177 -> 178), repinned the count assertions.
- **Commit:** `ba8f8eaae`

**3. [Rule 1 - Bug] Plan-specified `grep` negatives needed a harness-level adjustment**
- `FocusRowStrip/index.tsx` uses `<button` on separate lines from `type="button"`, so the literal `grep -c '<button type="button"'` form in the acceptance criteria reads 0; the equivalent structural checks (two `<button`, two `type="button"`, two `aria-label=`, two `disabled={`) are asserted in the source gate instead.

**Total deviations:** 3 (2 x Rule 1, 1 x Rule 3). No scope creep.

## TDD Gate Compliance

`workflow.tdd_mode` is not enabled, but both `tdd="true"` tasks were run RED then GREEN with separate `test(48-04)` and `feat(48-04)` commits. Task 1's RED used a signature-only stub so failures were on assertions, not a missing module; 12 of 24 failed, the other 12 passed against the stub for coincidental reasons (stub return values `false`/`0`/`undefined` already match the no-overflow and no-throw expectations). That is weaker evidence than a fully-failing RED and is stated here rather than implied away. No `tdd-red-evidence` record was persisted.

## Flagged for a future accessibility pass

| Item | Detail |
|------|--------|
| 36px control diameter | Named exception to the 44px icon-only touch-target default, carried forward from UI-SPEC. The controls sit over full-height card art and 44px would collide with the card's corner radius and hover outline at 156px. Recorded as a flagged row, not a settled best practice. |

## Live gate owed

The Frontend jest project is `testEnvironment: 'node'` -- no CSS engine, nothing mounted, and rAF never fires -- so none of the following is proven by this plan and all of it is owed to a live run:

1. The chevron is legible over real artwork at both edges in all 10 themes (a contrast claim that needs pixel measurement; "not red" has been wrong in this repo when asserted from inspection).
2. The control does not visually collide with the card's corner radius or hover outline at 156px.
3. The back control appears and the forward control disables at the true end of travel.
4. **UI-SPEC E4 backstop:** no game title overflows its card bounds or overlaps a neighbour at the narrowest supported window width.
5. **UI-SPEC E7 backstop:** a long title on a 156px card clips with `overflow: hidden` and no ellipsis/nowrap/line-clamp (this plan adds no override; `GameCard/index.css` digest unchanged), verified against the longest title in the test library.
6. Gamepad focus moving past the last visible card actually brings it fully into view, measured on a real controller rather than by reading the handler.

Also not exercised live: that the `ResizeObserver` re-measures when the pick changes the card count, and that `measureCardPitch` returns 180 against the real computed `column-gap` (it is unit-tested against a stub only).

## Known Stubs

None.

## Threat Flags

None. No network, auth or persisted-data surface added. T-48-10, T-48-11 and T-48-12 are mitigated as planned (total arithmetic; call-time silent-return handler with cleanup; real `<button aria-label>` over landed keys).

## Verification

- `npx jest --selectProjects Frontend`: 188 suites, 3293 tests, 0 failed.
- `npx jest --selectProjects Meta`: 46 suites, 1347 passed, 1 skipped, 0 failed.
- `pnpm codecheck`: no `error TS`. `pnpm lint`: exit 0, `production: PASS | tests: PASS` (0 errors; one pre-existing `import-x/no-named-as-default-member` warning on `React.memo` at `FocusRowStrip/index.tsx`, from 48-02).
- `pnpm i18n`: `Restored keys: 0`, `Unreferenced keys: 0`, `gamelib.json` unchanged.
- Scoped `npx prettier --check` over every `src/**` and `meta/**` path written: clean.
- Plan's comment-stripped CSS contract script: `CONTROL CSS CONTRACT OK`.
- Byte identity by `shasum -a 256 -c` against digests recorded before the first edit: `themeTokens.test.ts`, `GamesList/index.tsx`, `GameCard/index.css` all OK.

## Self-Check: PASSED

- `focusRowOverflow.ts`, `focusRowOverflow.test.ts` - FOUND
- Commits `619df17c0`, `c26d5e1a4`, `2f012677f`, `29de7f523`, `ba8f8eaae`, `f5af047a1` - FOUND on `quick-261002-b63`
