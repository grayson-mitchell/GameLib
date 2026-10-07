---
status: diagnosed
trigger: "Phase 48 UAT test 8 gaps G-48-8a (strip cards shrink/crop when switching mouse -> controller) and G-48-8b (mouse-mode hover border is thin; operator wants the thick controller-mode border in mouse mode too)"
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED. 8a - `.gameCard.gamepad` aspect-ratio overrides (GameCard/index.css:43-53), keyed on the `gamepad` class that GameCard sets from `activeController` (GameCard/index.tsx:498), shorten every card at the strip's pinned 156px width; the surviving 35px store-badge bar (index.css:256-259, from 16560dbdd) then crops the art inside the shorter card. 8b - hover and focus are two deliberately different rules (quick 260926-acw): hover = 2px outline at -1px offset (index.css:65-70), focus-within = 3px at +2px offset plus halo and glow (index.css:72-81); a test pins hover to NOT use the focus-ring tokens.
test: static harness built from the REAL CSS files (Library/index.css, GameCard/index.css, FocusRowStrip/index.css) driven by headless Edge over CDP, real :hover via Input.dispatchMouseEvent, real :focus-within via scripted .focus() (what tauriGamepadInput does)
expecting: n/a - confirmed
next_action: none (diagnose-only). Hand back to caller.

## Symptoms

expected: G-48-8a - switching mouse -> controller does not change a strip card's size. G-48-8b - the strip card's focus/hover border is the thicker controller-mode (console-style) border in mouse mode too.
actual: 8a - "when changing to ther controll the tiles become shorter (tile is cropped) ... I dont want the tiles to 'shrink' - not sure why that happened!". 8b - "when using the mouse there is a 'thin border' around the tile. when changing to the controller the border becomes thick ... I want the thicker border that is in controller mode (like console)"
errors: none
reproduction: UAT 48 test 8 - overflowing Recently-played strip, switch from mouse to gamepad, navigate focus along the strip (Windows 11, pnpm tauri:dev, physical gamepad)
started: found during UAT 2026-10-07

## Eliminated

- hypothesis: the track (`.focusRowTrack`, overflow-x:auto -> overflow-y computes to auto) clips a card that GROWS in controller mode, so "shorter" is clipping rather than resizing
  evidence: measured. Track clientHeight is 280 in mouse mode and 240 in controller mode, i.e. the track SHRINKS with the cards; it is not a fixed height. The `.gameList` carries `margin: 1em 0` (Library/index.css:7) inside the track, giving 16px headroom above and below the 248px card; the 1.05 scale (6.2px) plus the 3px/+2px ring (5.25px scaled) tops out near 11.5px, so the focused ring is NOT clipped vertically. The card box itself is 208px tall (offsetHeight), so it is genuinely shorter, not clipped.
  timestamp: 2026-10-07

- hypothesis: a `body.controllerLayout` rule resizes the card
  evidence: every `controllerLayout` selector in GameCard/index.css (lines 103, 300, 489) only scopes stale-focus suppression; none sets size. The sizing rule keys on the `.gamepad` CLASS instead, so a grep for controllerLayout (which 48-CONTEXT.md:223 evidently relied on) never finds it.
  timestamp: 2026-10-07

## Evidence

- timestamp: 2026-10-07
  checked: GameCard/index.css:43-53 and GameCard/index.tsx:494-500
  found: `.gameCard.gamepad { aspect-ratio: 3/4 }` and `.gameCard.gamepad.justPlayed { aspect-ratio: 328/205 }` versus base `173/275` and `275/205`. The class is applied by `classNames({ gamepad: activeController, justPlayed })`.
  implication: sizing rule keyed on activeController, not body.controllerLayout.

- timestamp: 2026-10-07
  checked: FocusRowStrip/index.css:27-29 (`.focusRowTrack .gameList > * { flex: 0 0 156px }`) and `.gameCard { width: 100% }` (GameCard/index.css:4)
  found: strip card width is pinned at 156px, so height = 156 / aspect-ratio exactly.
  implication: 156 x 275/173 = 248.0 (mouse) versus 156 x 4/3 = 208.0 (controller); first card (isRecent/isFavourite index 0, GamesList/index.tsx:143) 156 x 205/275 = 116.3 versus 156 x 205/328 = 97.5.

- timestamp: 2026-10-07
  checked: harness measurements (scratchpad harness.html + drive.cjs, results.json), layout sizes via offsetWidth/offsetHeight
  found: MOUSE MODE strip card 156 x 248, first (justPlayed) card 156 x 116, `a` (art link) 197 tall against a 208 tall img, icons bar 51, `.gameList` 248, track clientHeight 280. CONTROLLER MODE strip card 156 x 208, first card 156 x 98, `a` 173 against img 208 (35px of art cropped, versus 11px in mouse mode), icons bar 35 (padding 0), `.gameList` 208, track clientHeight 240. Mouse-mode hover rect 163.8 x 260.4 with z-index 2 and outline 2px solid accent at -1px offset reproduces the operator's live UAT item 4 numbers exactly (156 x 248, 163.8 x 260.4, z-index 2), so the harness is faithful.
  implication: the card is genuinely 40px (16%) shorter on activeController, and the art inside it loses a further 24px to the surviving store-badge bar.

- timestamp: 2026-10-07
  checked: same harness, MAIN GRID card (`#grid`, auto-fill minmax(156px,1fr), 158px wide in the harness)
  found: 250.7 -> 210.3 tall on `.gamepad`; `a` 200 -> 175 against img 210 (35px art crop).
  implication: NOT strip-specific. The identical rule shrinks and crops every grid card in controller mode. It is only more visible in the strip because the strip's width is pinned (the grid's width flexes) and the whole row visibly collapses.

- timestamp: 2026-10-07
  checked: git log / git show for the two sizing rules
  found: `.gameCard.gamepad { aspect-ratio: 3/4 }` is inherited from upstream Heroic (commits c555988b7 "hide icons ... when controller is being used" with `.gameCard > .icons.gamepad { display: none }`, then 709626082 / b9f80ced7 for the aspect-ratio rules). Upstream hid the WHOLE bar in controller mode, so a 3/4 card equalled the 3/4 art exactly: shorter but uncropped. GameLib commit 16560dbdd (2026-10-02, "play icon leads the card icons bar, store badge trails it") moved the store badge into that bar and changed the rule to keep the bar (`background: transparent; padding: 0; .svg-button { display: none }`) without revisiting the 3/4 ratio, so the 35px badge now eats 35px of a card sized for art alone.
  implication: the shrink is inherited upstream behaviour; the CROP is a GameLib regression from 16560dbdd. The operator wants neither.

- timestamp: 2026-10-07
  checked: helpers/gamepad.ts:729-760 (`emitControllerEvent`)
  found: `controller-changed` fires with the pad id on the first controller action and, in the same function, registers a one-shot `mousemove` listener that sets `currentController = -1` and dispatches `controller-changed` with '' (clears activeController). GlobalState.tsx:1808-1816 toggles body.controllerLayout and sets activeController from it.
  implication: the `gamepad` class, and therefore the card height, flips on EVERY mouse <-> controller handoff, not once. The strip (and the grid under it, 40px) visibly jumps each time. That is the "when changing to the controller the tiles become shorter" the operator saw.

- timestamp: 2026-10-07
  checked: counterfactual in the harness, controller mode with `.gameCard.gamepad{aspect-ratio:173/275}` and `.gameCard.gamepad.justPlayed{aspect-ratio:275/205}` injected (no source edit)
  found: strip card 156 x 248 (same as mouse mode), first card 116, track clientHeight 280, `a` 213 against img 208 (art no longer cropped), grid card 251.
  implication: the two aspect-ratio overrides are necessary and sufficient for the height change and the art crop. Falsification test passed (hypothesis could have failed here and did not).

- timestamp: 2026-10-07
  checked: harness computed style and screenshots (S2 hover vs S4 controller focus vs S6 mouse-mode focus), plus GameCard/index.css:65-81, ConsoleMode/index.scss:303-311
  found: mouse hover = `outline: 2px solid accent; outline-offset: -1px` (straddles the border edge, reads as a hairline), box-shadow drop only, z-index 2. Controller focus (`:focus-within`) = `outline: 3px solid var(--focus-ring-color); outline-offset: 2px`, box-shadow two-tone halo 2px (page background) + drop + 22px accent glow, z-index 3. Both scale 1.05. The console-mode card ring is the same family (3px accent ring + 22px glow, scale 1.06). A mouse-CLICKED (focused) card in mouse mode also gets the thick ring (S6), except while the pointer is over the grid and not on that card, where `body:not(.controllerLayout) .gameList:hover .gameCard:focus-within:not(:hover)` (index.css:103, 300) removes it.
  implication: 8b is a deliberate design split, not a defect in the sense of broken code.

- timestamp: 2026-10-07
  checked: .planning/quick/260926-acw-*/PLAN and GameCard/__tests__/gameCardFocusRing.test.ts:62-127
  found: quick 260926-acw SUPERSEDED pga's unification on purpose ("Hover stays SUBTLE ... Focus is LOUD and TWO-TONE ... hover rules must never consume these tokens", themes.scss:78-79). gameCardFocusRing.test.ts:106-112 asserts `.gameCard:hover` is "a plain 2px accent outline, no --focus-ring tokens"; :89-104 asserts hover and focus are not grouped except for the shared scale rule.
  implication: G-48-8b reverses a documented, test-pinned decision (for the strip, or for all GameCards, which is the caller's call). The fix will have to change that test.

- timestamp: 2026-10-07
  checked: screenshot S4b (controller focus on the FIRST strip card at scrollLeft 0) and measured rect x=12.1 against track left x=16
  found: the first card's scaled body and its ring are cut off at the track's left edge (`.focusRowTrack .gameList { padding: 0 }`, overflow-x: auto), about 4px of card and the whole left side of the 3px ring. The last card at max scroll clips the same way on the right.
  implication: a SECOND, smaller "cropped" effect on the end cards (also present for the thin hover outline). It is not the height change, but a fix for 8b that thickens hover would make it more visible, and it interacts with G-48-9 (chevron stacking).

## Resolution

root_cause: |
  8a - `.gameCard.gamepad { aspect-ratio: 3/4 }` and `.gameCard.gamepad.justPlayed { aspect-ratio: 328/205 }` (GameCard/index.css:43-53) override the base ratios 173/275 and 275/205 whenever the `gamepad` class is present (GameCard/index.tsx:498, from activeController). The strip pins the card width at 156px (FocusRowStrip/index.css:27-29) so height follows: 248 -> 208 and 116 -> 97.5. The class (and so the height) flips on every mouse/controller handoff (gamepad.ts:729-760). The crop is the surviving 35px store-badge bar (index.css:256-259, commit 16560dbdd) taking 35px out of the now art-sized card. Applies to the main grid too.
  8b - Deliberate split (quick 260926-acw): `.gameCard:hover` (index.css:65-70) is 2px at -1px offset; `.gameCard:focus-within` (index.css:72-81) is 3px at +2px with halo and glow; test gameCardFocusRing.test.ts:106-112 forbids hover using the focus-ring tokens.
fix: (not applied - diagnose only)
verification: (not applied)
files_changed: []
