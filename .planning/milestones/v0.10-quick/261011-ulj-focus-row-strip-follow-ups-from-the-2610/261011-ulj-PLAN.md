---
phase: quick-261011-ulj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Library/components/FocusRowStrip/index.css
  - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
  - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
autonomous: true
requirements: [D-01, D-02, D-03, D-04]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "D-01: with the Recently played (or Favourites) focus row, the strip's first card is the wide just-played hero. Its slot is exactly two tile widths plus one gap, calc(2 * var(--focus-row-card-width, 156px) + 1.5rem), in both the pre-reveal form and the revealed form. The 16:10 art and the PLAY label that GameCard already renders for index 0 therefore appear at hero size, and the hero is about as tall as its portrait neighbours (equal near a 181px tile; +4.1px at 140px, +2.5px at 156px, -0.7px at 188px, -13.7px at 320px), not about half their height"
    - "D-02: paging never measures the hero. measureCardPitch reads the list's second child when one exists, so a hero first card cannot double the pitch. A page is the grid's column count n: never fewer, and n + 1 only inside a sub-1.5px rounding band"
    - "D-03: at scrollLeft 0 the strip's end-side clip edge IS the grid's content edge. A card is fully visible in the strip exactly when the grid can place that column. At a 188px tile with a 3-column grid, the strip shows 3 full cards, not 4. The start-side bleed and the list's 15px inline padding are kept, so the first card stays on grid column 1 to the pixel and end-of-travel ring clearance still comes from the list's trailing padding (G-48-8a/b/c)"
    - "D-04: the forward chevron sits at the same physical position as before the change. The back chevron is unchanged. Only logical properties are used (RTL locales ar, fa and he ship)"
    - "Hero ring (Claude's discretion, see objective): a hovered or focused hero's 3px ring stays inside the strip's 15px start clearance at every slider width (13.43px reach at 320px; the grid's 1.05 scale would reach 21.85px, past even the 16px gutter). Every existing transform: none reset still outranks the strip's hero scale"
    - "The source gates and behaviour tables pin all of the above. The targeted jest set is green. Nothing outside the five files_modified changes"
  artifacts:
    - path: src/frontend/screens/Library/components/FocusRowStrip/index.css
      provides: "hero slot rule, strip-scoped hero hover scale, start-only viewport bleed, offset forward chevron"
      contains: ":is(.justPlayed, :has(.justPlayed))"
    - path: src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
      provides: "measureCardPitch over a uniform card; pageScrollDelta fitAllowance; measureFitAllowance"
      exports: [measureCardPitch, pageScrollDelta, measureFitAllowance]
    - path: src/frontend/screens/Library/components/FocusRowStrip/index.tsx
      provides: "page() passes the measured fit allowance"
      contains: "measureFitAllowance(track)"
    - path: src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
      provides: "hero slot gate, hero ring gate, rewritten bleed/chevron contract (Tests G, G2, H, chevron offset)"
    - path: src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts
      provides: "hero-first pitch cases, rewritten P1 at clientWidth C + 15, measureFitAllowance totality"
  key_links:
    - from: "FocusRowStrip/index.tsx page()"
      to: "focusRowOverflow.ts pageScrollDelta / measureCardPitch / measureFitAllowance"
      via: "pageScrollDelta(m, measureCardPitch(track), measureFitAllowance(track))"
      pattern: "measureFitAllowance\\(track\\)"
    - from: "FocusRowStrip/index.css hero slot rule"
      to: "GameCard/index.tsx pre-reveal div (direct list child) and revealed div > ContextMenu div > .gameCard.justPlayed"
      via: ":is(.justPlayed, :has(.justPlayed)) -- descendant :has, never a child combinator"
      pattern: ":has\\(\\.justPlayed\\)"
    - from: ".focusRowStrip__viewport margin-inline-end: 0"
      to: "canScrollForward / pageScrollDelta (track clientWidth = grid content width + 15)"
      via: "track.clientWidth read in readMeasurement() and page()"
      pattern: "margin-inline-end:\\s*0"
---

<objective>
Two focus-row strip follow-ups from the 261011-t4y live check. Operator decisions locked 2026-10-11: Bug 1 is "Restore wide hero" (chosen over uniform tiles); Bug 2 is "Yes, fix it" with the clip-edge approach.

- **D-01:** restore the wide just-played hero in the strip. Its slot is two tile widths plus one gap. GameCard already renders the 16:10 art and the PLAY label for the strip's index 0 (`GamesList/index.tsx:143` marks it `justPlayed`); only the slot width is wrong.
- **D-02:** the strip's paging math measures a uniform card, not the hero.
- **D-03:** the strip's end-side clip edge becomes the grid's content edge, with the start-side bleed kept. The strip then never shows a full card in a column the grid cannot fit.
- **D-04:** the forward chevron stays where it is, and the source-pinning tests move to the new contract.

**Claude's discretion: hero ring clearance.** The scope guard asked for a decision. The decision is a strip-scoped hero hover scale of 1.025. Rationale:
- **Reach at the grid scale.** A hero of width W = 2w + 24 at the grid's 1.05 scale has a ring reach of 0.025·W + 5.25 = 0.05w + 5.85 past its unscaled edge. That is 12.85px at a 140px tile, 13.65 at 156, 15.25 at 188 and 21.85 at 320. So 15px is short above a 183px tile, and the operator's 188px live case is already 0.25px short.
- **Why padding cannot fix it.** Growing the list padding to `max(15px, ...)` does not fix it. The bleed must equal the padding to keep grid alignment (Test G). `.App .content` (`App.css`, the scroll container: `overflow-y: auto`, no inline padding) clips at the outer edge of `.focusRowStrip`'s 16px gutter. So no padding value can buy more than 16px, which is 5.85px short at 320. A `max()` padding would also stop being a px literal, breaking the px-parsed F, G and WR-04 pins for at most 1px of gain.
- **What 1.025 buys.** The hero's reach becomes 0.0125·W + 5.125 = 0.025w + 5.425: 13.43px at 320, with 1.575px spare. That is within 0.175px of a single tile's own reach, and the hero grows by the same number of pixels per side as its neighbours (0.025w + 0.3 against 0.025w). The hero needs no special clearance anywhere, and every px pin stays intact.

Purpose: the operator's two live-check defects. The first strip card renders about half the height of its neighbours. At a 188px tile the strip shows 4 full cards over a 3-column grid.

Output: edits to the five FocusRowStrip files only. No change to the grid's padding, GameCard aspect ratios or CSS, the tile-size slider, or packages.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/261011-t4y-library-tile-size-slider-add-a-tile-size/261011-t4y-SUMMARY.md
@src/frontend/screens/Library/components/FocusRowStrip/index.css
@src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts

Project skills: load `Skill("gamelib-conventions")` before touching any `<verify>` block (scoped `npx prettier --check` over the exact paths written, after `--file-info`). `Skill("sketch-findings-gamelib")` applies the multi-theme survival rule: nothing here touches colour, but the owed live check runs midnightMirage, gruvbox_dark and dracula.

Graphify: run `graphify query` or `graphify explain` before any raw grep for orientation. Never open `graphify-out/GRAPH_REPORT.md` or `graphify-out/graph.json`.

**Live facts the planner verified at HEAD cec63a68c.** Line numbers are at that commit.
- **Hero DOM, pre-reveal.** `GameCard/index.tsx:508-516`: when the card is not yet visible, GameCard returns a single `<div className={wrapperClasses}>`, so `.gameCard.justPlayed` IS the strip list's direct child.
- **Hero DOM, revealed.** `GameCard/index.tsx:522-536`: a plain `<div>` wraps `<ContextMenu>`, and `ContextMenu/index.tsx:47` renders its own `<div onContextMenu>`. So `.gameCard.justPlayed` is a GRANDCHILD of the list child. A child-combinator `:has` misses the revealed form. The old grid rule `Library/index.css:21-23` uses the descendant `:has(.justPlayed)` for the same reason.
- **Strip slot rule.** `FocusRowStrip/index.css:90-97`: every strip child gets `flex: 0 0 var(--focus-row-card-width, 156px)` and the same `width:` (specificity (0,2,0); the universal selector counts 0). `FocusRowStrip/index.tsx:264-269` passes `isRecent`/`isFavourite` but not `isFirstLane`. Keep it that way: `isFirstLane` would add `.firstLane`, whose grid padding rule (`Library/index.css:17-19`) ties `.focusRowTrack .gameList` at (0,2,0), and it would change the card keys.
- **Viewport and controls.** `FocusRowStrip/index.css:12-15`: viewport `position: relative; margin-inline: -15px`. `:72-83`: list `padding-inline: 15px`, `gap: 1.5rem`. `:143-145`: forward control `inset-inline-end: 0`.
- **Paging code.** `focusRowOverflow.ts:93-110`: `measureCardPitch` reads `list.firstElementChild`. `:56-70`: `pageScrollDelta` is `max(1, floor((clientWidth + 1) / pitch)) * pitch`. Its docstring (`:45-54`) asserts the 15px-each-side bleed and clientWidth = C + 30. `:211-250`: `scrollFocusedCardIntoViewHorizontally` reads only the focused element's rect and the list's padding, so it is pitch-free and needs no change.
- **Hover transform specificities** (`GameCard/index.css`):
  - `.gameCard:hover, .gameCard:focus-within { transform: scale(1.05) }` at `:349-352` is (0,2,0).
  - `body.controllerLayout .gameCard:hover:not(:focus-within)` at `:146` and `body.keyboardNav ...` at `:162` set `transform: none` at (0,4,1).
  - The mouse-only stale-focus reset `body:not(.controllerLayout):not(.keyboardNav) .listing:hover .gameCard:focus-within:not(:hover)` at `:366-368` sets `transform: none` at (0,7,1).
  - The strip is inside `.listing` (`Library/index.tsx:1145`, `:1187`).
- **Pins that WILL break** and are rewritten in this plan:
  - `focusRowStripSource.test.ts`: Test G `:273-276` (bleed == padding over `margin-inline: -Npx`).
  - Test H `:278-283`: the bleed regex no longer matches. It is kept as start bleed < 16.
  - The logical-properties test `:595-608`: it pins `inset-inline-end:\s*0` on the forward control, and `-15px` fails that regex. The orchestrator's diagnosis did not list this pin.
  - The describe comment `:152-162`.
  - `focusRowOverflow.test.ts` P1 `:70-107`: it feeds clientWidth C + 30 / C + 24 and expects n or n + 1.
- **Pins checked and NOT affected:**
  - `themeTokens.test.ts:282`'s `inset-inline-end: 0` is `.NavShell__tier2::after`, unrelated.
  - themeTokens and cssTokenSweep read only the `.focusRowStrip__control` block and custom-property declarations.
  - `gameCardControllerGeometry.test.ts:164-168` pins `.gameCard.justPlayed` at 275/205, which is untouched.
  - `libraryTileSize.test.ts` has no strip-geometry pin.
- **Stale "bleed" prose** exists only at `focusRowOverflow.ts:46`, `FocusRowStrip/index.css:5-11` and `:60`, `focusRowOverflow.test.ts:73`, and `focusRowStripSource.test.ts:159-160`.
- **Prettier.** `npx prettier --file-info` reports `"ignored": false` for all five files_modified (css, typescript x4).

**Targeted baseline measured at HEAD cec63a68c by the planner (src/ clean):**
- TARGETED set (command in Task 1 verify): `Test Suites: 7 passed, 7 total`, `Tests: 312 passed, 312 total`.
- BROAD set (`pnpm jest src/frontend/screens/Library src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts --selectProjects Frontend`): `Test Suites: 47 passed, 47 total`, `Tests: 1239 passed, 1239 total`.
- About 40 unrelated suites fail on this Windows box (operator memory), so never run the whole jest suite. Any red inside these two sets after an edit is this change's regression.

<interfaces>
Current signatures (focusRowOverflow.ts), which the executor extends and must not break:
- `pageScrollDelta(m: TrackMeasurement, cardPitch: number): number`. Task 3 adds a third optional `fitAllowance = 0`; existing 2-arg callers and tests keep today's result.
- `measureCardPitch(track: Element | null, getStyle?: (el: Element) => { columnGap: string }): number`. Signature unchanged.
- `readEdgeClearance(list, getStyle)` is module-private and returns `{ left, right }` from computed paddingLeft/paddingRight, with 0 on any failure. Reuse it.
- `FALLBACK_CARD_GAP = 24` and `SUBPIXEL_EPSILON = 1` are module-private constants.
- In focusRowStripSource.test.ts, helpers `read`, `cssBlock` (first `${selector} {` match, brace-counted), `cssBlocks`, `parsed` and `reach(side)` exist. In the strip-end clearance describe, `ringWidth`, `ringOffset`, `scale`, `cardRatio`, `inlinePadding`, `minWidth` and `supremumWidth` are already parsed.
</interfaces>
</context>

<tasks>

<task type="tracer">
  <name>Task 1: End-to-end wide hero in the strip -- slot width through to the paging pitch (D-01, D-02)</name>
  <files>src/frontend/screens/Library/components/FocusRowStrip/index.css, src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts, src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts, src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts</files>
  <read_first>
    - src/frontend/screens/Library/components/FocusRowStrip/index.css (whole file, 163 lines)
    - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts lines 87-110
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts lines 395-428
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts lines 1-56 and 286-356
    - src/frontend/screens/Library/components/GameCard/index.tsx lines 493-536 (pre-reveal vs revealed structure)
    - src/frontend/screens/Library/components/ContextMenu/index.tsx lines 46-49
    - src/frontend/screens/Library/components/GamesList/index.tsx lines 141-170
    - src/frontend/screens/Library/index.css lines 1-23
  </read_first>
  <action>
**Step 0 (baseline, before any edit).** Run the Task 1 jest command from `<verify>` and record its `Test Suites:` and `Tests:` lines in the SUMMARY. The expected result at cec63a68c is 7 of 7 suites and 312 of 312 tests. If anything is red at baseline, record which suite and treat it as pre-existing.

**(a) Hero slot rule (D-01).** In `FocusRowStrip/index.css`, directly after the `.focusRowTrack .gameList > *` rule, add a rule whose selector is exactly `.focusRowTrack .gameList > :is(.justPlayed, :has(.justPlayed))`. Declare two things, with identical value text:
- `flex: 0 0 calc(2 * var(--focus-row-card-width, 156px) + 1.5rem)`
- `width:` the same calc. Pin the width as well as the basis for the same G-48-11b reason the `> *` rule gives: WKWebView sizes the max-content list from the items' intrinsic width.

Precede the rule with a comment that states all of the following:
- **Selector arms.** Why both arms exist: the pre-reveal GameCard is the `.gameCard.justPlayed` div itself, a direct list child. The revealed GameCard is a plain div, then ContextMenu's own div, then `.gameCard.justPlayed`. So the `:has` must be a descendant test, never a child-combinator one, exactly like the grid's `Library/index.css` span-2 rule.
- **Why `:is()`.** It takes a forgiving selector list, so an engine without `:has()` keeps the pre-reveal arm instead of dropping the whole rule.
- **Specificity.** The hero rule is (0,3,0), because `:is()` takes its most specific argument, (0,1,0). That beats the `> *` rule's (0,2,0) regardless of source order.
- **What it mirrors.** `grid-column: span 2` in a 1.5rem-gap grid: two tracks plus one gap. The 1.5rem must stay the same text as the list's `gap` and the grid's `grid-gap`.
- **Pitch slots.** The hero is only ever the list's first rendered card (`GamesList` marks index 0 of the Recently played and Favourites views). Its slot plus the following gap is exactly two pitches, so every later card stays on a grid column.
- **Height.** With GameCard's untouched 275/205 hero ratio against the 173/275 portrait ratio, the heights are equal near a 181px tile. The hero is +4.1px at 140, +2.5px at 156, -0.7px at 188 and -13.7px at 320, the same residual the old span-2 lane had.

Do NOT pass `isFirstLane` to GamesList in `index.tsx`; the reason is in the `<context>` facts.

**(b) Uniform-card pitch (D-02).** In `focusRowOverflow.ts` `measureCardPitch`, measure the list's second child when it exists, otherwise the first child, otherwise the default. Implement it as the first child's `nextElementSibling`, falling back to `firstElementChild`, falling back to the existing default. Keep the signature and the gap read unchanged.

Rewrite its docstring to cover:
- In the Recently played and Favourites views the first child is the double-width hero (D-01), so measuring it would double the pitch and page by an even number of columns, one short whenever the grid's column count is odd.
- Every other child is a uniform card.
- A strip with only one card falls back to it. A lone hero only overflows when the grid fits one column; an oversized pitch then pages to the end of travel, which the browser clamps.

**(c) Tests.**

In `focusRowOverflow.test.ts`'s `measureCardPitch` describe, add:
- **Hero-first case.** A stub list whose first child measures 336 and whose `nextElementSibling` measures 156, with `columnGap '24px'`, gives a pitch of 180.
- **Lone-child case.** A stub with only a first child of 156 and no sibling gives 180.

Leave the three existing cases unchanged; their stubs have no `nextElementSibling`, so they exercise the fallback.

In `focusRowStripSource.test.ts`, add a describe named for 261011-ulj D-01 that parses with the existing `read` and `cssBlock` helpers and asserts:
1. A block exists for the exact selector above.
2. Its `flex: 0 0 calc(2 * var(--focus-row-card-width, Npx) + G)` and its `width: calc(...)` carry identical calc text.
3. N equals the `> *` rule's fallback and `LIBRARY_TILE_WIDTH_DEFAULT`.
4. G equals the strip list's `gap` text and the grid's `grid-gap` text from `Library/index.css`.
5. Every `:has(` argument in the comment-stripped strip CSS opens with `.justPlayed` (descendant form). Explain the GameCard and ContextMenu nesting in a test comment, and assert it with a positive regex for the descendant spelling plus a count of all `:has(` occurrences equal to the descendant-spelling count. No literal of the rejected form is needed.
6. The block has no `minmax(` and no `1fr`.
  </action>
  <verify>
    <automated>pnpm jest src/frontend/screens/Library/components/FocusRowStrip src/frontend/screens/Library/__tests__/libraryTileSize.test.ts src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts --selectProjects Frontend</automated>
    <automated>npx eslint src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts && pnpm codecheck</automated>
    <automated>for p in src/frontend/screens/Library/components/FocusRowStrip/index.css src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || { echo "prettier ignores $p"; exit 1; }; done && npx prettier --check src/frontend/screens/Library/components/FocusRowStrip/index.css src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts</automated>
    <automated>grep -c ':is(.justPlayed, :has(.justPlayed))' src/frontend/screens/Library/components/FocusRowStrip/index.css</automated>
  </verify>
  <done>
- The strip CSS has the hero slot rule (the grep prints 1), and the new D-01 source describe passes.
- `measureCardPitch` returns 180 for a 336-then-156 list with a 24px gap, and 180 for a lone 156 card.
- The targeted set is 7 of 7 suites green, with the test count at or above 312 and every pre-existing test still present.
- eslint reports 0 errors; codecheck exits 0; prettier prints "All matched files use Prettier code style!" after `--file-info` confirmed `ignored: false` for all four paths.
- Committed as `feat(quick-261011-ulj): restore the wide just-played hero in the focus-row strip; pitch measures a uniform card`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Hero ring stays inside the strip's start clearance at every slider width (D-01 follow-through, Claude's discretion)</name>
  <files>src/frontend/screens/Library/components/FocusRowStrip/index.css, src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts</files>
  <read_first>
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts lines 151-284 (the strip-end clearance describe and its parsed geometry)
    - src/frontend/screens/Library/components/GameCard/index.css lines 41-56, 124-133, 144-166, 345-370
    - src/frontend/App.css lines 59-101 (.App .content is the scroll container, no inline padding)
  </read_first>
  <behavior>
    - The hero hover scale parsed from the strip CSS is strictly below the grid's parsed 1.05.
    - The hero ring reach at the widest slider tile (side 2 x LIBRARY_TILE_WIDTH_MAX + 24 = 664) is at or below the list's parsed inline padding (expected 13.425 against 15).
    - Non-vacuity: at the grid scale, the same 664px hero reaches above 16 (expected 21.85), so no padding inside the 16px gutter could clear it. This proves the override is load-bearing.
    - The hero's vertical reach at the widest tile (side 664 x 205/275, ratio parsed from GameCard's `.gameCard.justPlayed` rule) is covered by the list's margin-block linear term K x w + B at both slider bounds.
    - The hero scale rule carries no `!important`.
  </behavior>
  <action>
**Write the failing assertions first** (RED). In the strip-end clearance describe:
- Generalise `reach` to take an optional scale, defaulting to the parsed grid scale.
- Parse the hero ratio from GameCard's `.gameCard.justPlayed` block with the existing `cssBlock` helper.
- Parse the hero scale from the new strip rule with `cssBlocks` or `cssBlock`, matching the rule body's `transform: scale(S)`.
- Derive the hero side as 2 × width + 24. Here 24 is the 1.5rem gap at the 16px root that `styles/_typography.scss` sets on `:root`; restate it with that citation, the same convention `focusRowOverflow.ts`'s `FALLBACK_CARD_GAP` comment uses.
- Add the `<behavior>` assertions. Run jest and see them fail because the rule is absent.

**Then add the rule** (GREEN). In `FocusRowStrip/index.css`, right after the Task 1 hero slot rule, add `.focusRowTrack .gameCard.justPlayed:hover, .focusRowTrack .gameCard.justPlayed:focus-within { transform: scale(1.025); }`.

Its comment must carry the decision record:
- **Reach at 1.05.** 0.05w + 5.85, which is 12.85 / 13.65 / 15.25 / 21.85px at 140 / 156 / 188 / 320.
- **Why padding cannot fix it.** The bleed must equal the padding to keep grid alignment, and `.App .content` clips at the outer edge of the strip's 16px gutter, so padding cannot buy more than 16px.
- **Reach at 1.025.** 0.025w + 5.425, which is 8.93 / 9.33 / 10.13 / 13.43px: within 0.175px of a single tile's reach, and the same per-side pixel growth as a neighbour.
- **Specificity table.** This rule is (0,4,0). It beats `.gameCard:hover` / `.gameCard:focus-within` at (0,2,0). It loses to `body.controllerLayout` and `body.keyboardNav` `.gameCard:hover:not(:focus-within)` at (0,4,1), and to the mouse-only stale-focus reset at (0,7,1). Every existing `transform: none` therefore still wins, and only the scale value changes.
- **No `!important`.**

Also extend the list clearance comment (`index.css` around lines 51-71) by one sentence: the hero is cleared by its own scale (next rule), not by this padding.

Do not edit `GameCard/index.css` (scope guard).
  </action>
  <verify>
    <automated>pnpm jest src/frontend/screens/Library/components/FocusRowStrip src/frontend/screens/Library/__tests__/libraryTileSize.test.ts src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts --selectProjects Frontend</automated>
    <automated>npx eslint src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts && pnpm codecheck</automated>
    <automated>for p in src/frontend/screens/Library/components/FocusRowStrip/index.css src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || { echo "prettier ignores $p"; exit 1; }; done && npx prettier --check src/frontend/screens/Library/components/FocusRowStrip/index.css src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts</automated>
    <automated>git diff --quiet cec63a68c -- src/frontend/screens/Library/components/GameCard && echo "GameCard untouched"</automated>
  </verify>
  <done>
- The new assertions failed before the rule existed and pass after it.
- The hero reach at 664px is 13.425 or below against the parsed 15px padding.
- The grid-scale non-vacuity reach is above 16.
- The targeted set is green with the count at or above Task 1's.
- GameCard is untouched ("GameCard untouched" prints).
- eslint, codecheck and the scoped prettier check pass.
- Committed as `feat(quick-261011-ulj): keep the strip hero's hover ring inside the 15px start clearance at every tile size`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Clip the strip's end at the grid content edge, hold the forward chevron, page by the grid's column count (D-03, D-04, D-02)</name>
  <files>src/frontend/screens/Library/components/FocusRowStrip/index.css, src/frontend/screens/Library/components/FocusRowStrip/index.tsx, src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts, src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts, src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts</files>
  <read_first>
    - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts lines 21-85 and 252-277
    - src/frontend/screens/Library/components/FocusRowStrip/index.tsx lines 160-174 and 241-287
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts lines 1-108
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts lines 151-284, 554-573, 582-608
  </read_first>
  <behavior>
    - **Source, Test G:** the viewport declares `margin-inline-start: -Npx` with N equal to the list's parsed `padding-inline`.
    - **Source, Test G2:** the viewport declares `margin-inline-end: 0`, with no `margin-inline` shorthand and no physical margin-left or margin-right in that block.
    - **Source, Test H:** the strip keeps its 16px gutter, and the start bleed N stays below 16.
    - **Source, chevron:** the forward control declares `inset-inline-end: -Mpx` with M equal to N, so it sits where it sat when the viewport bled at both ends. The back control keeps `inset-inline-start: 0`. Neither uses `left:` or `right:`.
    - **Source, index.tsx:** `page()` passes `measureFitAllowance(track)` to `pageScrollDelta`.
    - **Overflow, bare count:** `pageScrollDelta(m(531, 2000, 0), 180)` is 360, because the bare count pages one short. `pageScrollDelta(m(531, 2000, 0), 180, 9)` is 540. Here C = 516 is an exact 3-column fit at 156px, so clientWidth = C + 15 = 531.
    - **Overflow, P1 rewritten.** Iterate w in LIBRARY_TILE_WIDTH_MIN, LIBRARY_TILE_WIDTH_DEFAULT, 188 (the operator's live tile) and LIBRARY_TILE_WIDTH_MAX, with pitch = w + 24 and allowance 9 (gap 24 minus lead padding 15). For C from w to 3000 in 0.37 steps, set n = floor((C + 24) / pitch). For clientWidth in round(C + 15) and floor(C + 15), the paged card count must be an integer, at least n, at most n + 1, and n + 1 only when (n + 1) x pitch - (C + 24) is 1.5 or less.
    - **Overflow, non-vacuity.** The same sweep with allowance 0 yields n - 1 at least once, so the allowance is load-bearing.
    - **Overflow, allowance totality.** `pageScrollDelta` treats a non-finite allowance as 0.
    - **measureFitAllowance:**
      - A list with columnGap 24px and padding 15px on both sides gives 9.
      - No track, or no list, gives 0.
      - An unreadable gap gives 0.
      - A getStyle that throws gives 0, not a throw.
  </behavior>
  <action>
**Write the behaviour assertions first** (RED), then implement.

**Source test rewrites** (D-03, D-04):
- Replace Test G and Test H in place with the new contract above.
- Add Test G2 and the chevron-offset assertion to the strip-end clearance describe.
- Update the forward-control half of the "places the edges with logical properties" test (`:595-608`) to the negative-offset contract, keeping its no-left/right assertions.
- Rewrite the describe comment at `:152-162` so it no longer says the viewport bleeds by the list padding on both sides.
- In the overflow-controls describe of index.tsx, extend "pages with scrollBy over pageScrollDelta, smooth" to assert the `measureFitAllowance(track)` argument.

**Overflow test changes:**
- Rewrite P1 and its comment (`:70-107`) to the C + 15 geometry described in `<behavior>`, and add the cases listed there.
- Leave every existing 2-argument `pageScrollDelta` case unchanged: the default allowance 0 keeps their results.

**CSS (D-03).** In `.focusRowStrip__viewport`, replace the `margin-inline` shorthand with `margin-inline-start: -15px` and `margin-inline-end: 0`. Keep `position: relative` and logical properties only, since ar, fa and he ship. Replace the comment above it (`:5-11`) with the new rationale:
- **Start side.** The start bleed equals the list's 15px leading padding, so the first card stays on grid column 1 to the pixel and keeps its ring room.
- **End side.** The end has no bleed, so the track's end clip is `.focusRowStrip`'s content edge. That is the grid's content edge, because both boxes carry the same `--space-md-fixed` inline padding inside `.listing`.
- **Visibility rule.** At scrollLeft 0, card k is fully visible exactly when k x pitch + w <= C, which is the grid's own placement test. The 15px window that showed a column the grid cannot fit is gone.
- **End-of-travel clearance.** Ring clearance at the end of travel still comes from the list's trailing padding (G-48-8a/b/c).
- **Consequence for the controls.** `canScrollForward` now reads clientWidth = C + 15. The controls mount when the cards plus their 15px trailing ring room pass the grid content edge. The band where every card is visible yet the forward control nudges by up to 15px keeps its width: it moves from a card span in (C+1, C+15] to (C-14, C+1].

**Chevron (D-04).** Set `.focusRowStrip__control--forward` to `inset-inline-end: -15px`. Comment why:
- The viewport no longer bleeds at the end, so this offset puts the disc back at the same physical spot. It ends 15px past the content edge, 1px inside the 16px gutter.
- Nothing clips it: the viewport and `.focusRowStrip` are not overflow-clipped, and `.App .content` clips only at the gutter's outer edge.

Leave `.focusRowStrip__control--back` at `inset-inline-start: 0`; the start bleed is unchanged. Update the list clearance comment's sentence about the bleed (around line 60) to say START bleed.

**focusRowOverflow.ts (D-02).**
- Give `pageScrollDelta` a third parameter, `fitAllowance = 0`. The count becomes `max(1, floor((clientWidth + allowance + SUBPIXEL_EPSILON) / pitch))`, with a non-finite allowance treated as 0. Every existing guard (non-positive or non-finite pitch gives 0; non-positive or non-finite width gives one pitch) is unchanged.
- Rewrite its docstring (`:39-55`):
  - The track is now the viewport box bleeding only at the start, so clientWidth = C + 15.
  - The whole cards visible from the list's leading padding are floor((clientWidth - lead + gap) / pitch), which equals the grid's column count n = floor((C + 24) / pitch). With lead 15 and gap 24 the allowance is 9.
  - The bare count floor((clientWidth + 1) / pitch) pages one card short in an 8px band per pitch.
  - The epsilon still defends the integer-rounded read, at the cost of paging n + 1 only when card n is within about 1.5px of fitting.
- Add an exported `measureFitAllowance(track, getStyle)`:
  - It reads the list (`track.firstElementChild`): the computed `columnGap`, and `paddingLeft`/`paddingRight` via the existing `readEdgeClearance`.
  - It returns gap minus the larger of the two paddings. The inline padding is a single symmetric `padding-inline` value, pinned by Test F, so left equals inline-start in both LTR and RTL.
  - It is total: no track, no list, a non-finite gap, or a throwing getStyle all give 0, which is the bare count.
  - Its default `getStyle` follows the same `typeof getComputedStyle === 'function'` shape the other two readers use.

**index.tsx.** Import `measureFitAllowance` and change `page()` to `pageScrollDelta(m, measureCardPitch(track), measureFitAllowance(track))`. Nothing else in index.tsx changes.

**After green.** Run `graphify update .` (AST-only; `graphify-out/` is gitignored, so commit nothing from it).
  </action>
  <verify>
    <automated>pnpm jest src/frontend/screens/Library/components/FocusRowStrip src/frontend/screens/Library/__tests__/libraryTileSize.test.ts src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts --selectProjects Frontend</automated>
    <automated>pnpm jest src/frontend/screens/Library src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts --selectProjects Frontend</automated>
    <automated>npx eslint src/frontend/screens/Library/components/FocusRowStrip/index.tsx src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts && pnpm codecheck</automated>
    <automated>for p in src/frontend/screens/Library/components/FocusRowStrip/index.css src/frontend/screens/Library/components/FocusRowStrip/index.tsx src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || { echo "prettier ignores $p"; exit 1; }; done && npx prettier --check src/frontend/screens/Library/components/FocusRowStrip/index.css src/frontend/screens/Library/components/FocusRowStrip/index.tsx src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts</automated>
    <automated>git diff --name-only cec63a68c -- src | sort</automated>
  </verify>
  <done>
- The new behaviour assertions failed before the implementation and pass after it.
- The targeted set is green, at or above Task 2's count.
- The BROAD set is 47 of 47 suites green, with the test count at or above 1239.
- eslint reports 0 errors; codecheck exits 0; the scoped prettier check over the five paths passes after `--file-info` confirmed `ignored: false` for each.
- `git diff --name-only cec63a68c -- src` prints exactly the five files_modified paths.
- `graphify update .` ran.
- Committed as `fix(quick-261011-ulj): clip the focus-row strip at the grid content edge, hold the forward chevron, page by the grid's column count`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| live DOM geometry -> paging arithmetic | `getBoundingClientRect` and computed style values from the strip feed `measureCardPitch`, `measureFitAllowance` and `pageScrollDelta`, then `scrollBy` |
| stylesheet -> rendered layout | the hero selector and scale rely on engine support for `:is()` / `:has()` in WKWebView and WebView2 |

No user input, network, storage or IPC path is added or changed. This is CSS and React layout only.

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261011-ulj-01 | D (layout availability) | hero slot selector in `FocusRowStrip/index.css` | low | mitigate | `:is()` takes a forgiving list: an engine without `:has()` keeps the pre-reveal arm instead of dropping the rule. `:has()` is already load-bearing in `Library/index.css:21` on both shipped engines. The selector is pinned by the Task 1 source gate |
| T-261011-ulj-02 | T (malformed geometry input) | `measureCardPitch`, `measureFitAllowance`, `pageScrollDelta` | low | mitigate | Every read is finite-checked with a fallback: the default tile plus a 24px gap for the pitch, and 0 (the bare count) for the allowance. `pageScrollDelta` stays finite and at least one card. Pinned by the NaN, Infinity, empty-track and throwing-getStyle cases in Task 3 |
| T-261011-ulj-03 | I (information disclosure) | strip header label and collection names | low | accept | No data path changes. Labels still render as text only; the existing purity tests (no dangerouslySetInnerHTML, no customCategories read) are untouched |
| T-261011-ulj-04 | D (layout availability) | hero hover scale override | low | mitigate | The (0,4,0) rule is outranked by every existing `transform: none` reset ((0,4,1) and (0,7,1)), so controller, keyboard and stale-focus behaviour is unchanged. It carries no `!important`, which the Task 2 gate pins |
| T-261011-ulj-SC | Tampering | npm/pip/cargo installs | low | accept | This plan has no package-manager task (scope guard: no new packages), so the legitimacy gate has nothing to check |
</threat_model>

<verification>
- **Step-0 baseline** recorded before any edit. The planner measured 7 of 7 suites and 312 of 312 tests for the targeted set, and 47 of 47 suites and 1239 of 1239 tests for the broad set, at cec63a68c.
- After Task 3, both sets are green with counts at or above baseline, and no pre-existing test is deleted. Rewritten tests are G, H, P1, the forward half of the logical-properties test, and the clearance describe comment.
- Scope: `git diff --name-only cec63a68c -- src` lists exactly the five files_modified.
- `git diff cec63a68c -- src/frontend/screens/Library/components/GameCard src/frontend/screens/Library/index.css src/frontend/screens/Library/libraryTileSize.ts src/frontend/components/UI/NavShell/components/LibraryTileSizeSlider` is empty. This covers the scope guard: no grid padding, GameCard ratio or slider change.
- No `package.json` or lockfile change.
- **Owed live check (recorded as owed, not a checkpoint).** The operator re-tests at tile 188px with the Recently played strip, under midnightMirage, gruvbox_dark and dracula. Checks:
  - the hero is two columns wide with 16:10 art and PLAY, about the height of its neighbours;
  - the strip shows exactly as many full cards as the grid has columns;
  - the forward chevron has not moved;
  - paging advances by one grid row's worth of cards;
  - hovering the hero at scrollLeft 0 shows its full ring on the start side;
  - an RTL locale mirrors the strip.

  Also worth a glance: the 140px and 320px slider ends.
</verification>

<success_criteria>
- **D-01:** the strip's first card in the Recently played and Favourites views occupies two tile widths plus one gap in both GameCard forms, and the source gate pins it.
- **D-02:** a hero first card cannot change the paging pitch, and a page equals the grid's column count (pinned by the hero-first pitch cases and the rewritten P1).
- **D-03:** the strip's end clip equals the grid's content edge, with the start bleed and 15px padding unchanged. Tests G, G2 and H pin this.
- **D-04:** the forward chevron's offset equals the start bleed, so its position is unchanged, using logical properties only.
- The hero ring clears 15px at every slider width without any change to GameCard.
- The SUMMARY carries the following residuals:
  - the hero is up to 13.7px shorter than its neighbours at 320px and 4.1px taller at 140px, as in the old span-2 lane;
  - a lone hero wider than a one-column grid overflows the strip, as it did the old lane;
  - the controls' nudge band keeps its width but moves;
  - the live check above is owed.
</success_criteria>

<output>
Create `.planning/quick/261011-ulj-focus-row-strip-follow-ups-from-the-2610/261011-ulj-SUMMARY.md` when done.
</output>
