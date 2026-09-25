---
phase: quick-260925-pga
plan: 01
subsystem: ui
tags: [css, focus-ring, accessibility, theming, game-card]

# Dependency graph
requires: []
provides:
  - Token-driven accent highlight ring for `.gameCard` and `.gameListItem`, shared by `:hover` AND `:focus-within`, in normal (non-console) mode
  - Stale-focus suppression so exactly one tile highlights at a time when the pointer is over the grid/list ("hover wins while mousing")
  - Source-text gate holding the ring to `var(--accent)`, proving hover+focus share one rule, proving the suppression rules exist, and keeping it in step with `.consoleCard.focused`
affects: [console-mode, game-card, theming]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Focus ring as `outline` + separate glow `box-shadow`, so a webview lacking `color-mix()` loses only the glow"

key-files:
  created:
    - src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts
  modified:
    - src/frontend/screens/Library/components/GameCard/index.css

key-decisions:
  - "Mirrored .consoleCard.focused's exact values (3px, var(--accent, #0080ff), the drop-shadow/glow spelling, z-index: 2) rather than inventing new ones, so normal and console mode read identically."
  - "Split the ring into `outline` (never dropped) and the glow into `box-shadow` with `color-mix()` (may be unsupported), so degradation only ever costs the glow."
  - "List-view row ring uses 2px/-2px (not the grid card's 3px/-1px) and gets no glow or z-index, since `.gameListItem` rows are non-overlapping horizontal strips."
  - "REVERSED after live operator feedback: the plan's design call #3 (hover deliberately excluded from the ring) was wrong for this app. `.gameCard:hover, .gameCard:focus-within { transform: scale(1.05) }` already treats hover and focus as one highlighted state, and the operator's original request covered both. The ring rules were regrouped to `:hover, :focus-within` on both selectors to match."
  - "Round 3: gamepad nav and clicks both move real DOM focus, so :focus-within held a stale ring on the last-landed/last-clicked card even after the pointer moved to hover a different one (operator: one tile 'stuck on'). Operator chose 'hover wins while mousing' -- `.gameList:hover .gameCard:focus-within:not(:hover)` (and the .gameListLayout/.gameListItem equivalent) return a stale focused-but-not-hovered card to resting appearance while the pointer is over the container; gamepad-only use and console mode are unaffected. Accepted edge case: pointer in a gap between cards while one is stale-focused shows zero rings momentarily."

patterns-established:
  - "Source-text gate pattern (readFileSync + stripSourceComments, following Dropdown/__tests__/dropdownDisclosure.test.tsx) applied to a second stylesheet pair, including a read-only cross-file guard against ConsoleMode/index.scss."

requirements-completed: [QUICK-260925-pga]

# Metrics
duration: 25min
completed: 2026-09-25
---

# Quick Task 260925-pga: Accent highlight ring for non-console game cards Summary

**Replaced the near-invisible 1px `-webkit-focus-ring-color` hairline with a 3px `var(--accent)` outline plus glow shared by BOTH `.gameCard:hover` and `.gameCard:focus-within` (mirroring console mode's `.consoleCard.focused`), added a matching 2px ring shared by `.gameListItem:hover`/`:focus-within` for list view, then added stale-focus suppression so a card left focused by gamepad nav or a click doesn't keep ringing once the pointer hovers a different card — all backed by a source-text gate. Task 3's human visual re-check is pending after two rounds of live-feedback fixes (round 1: mouse hover invisible; round 2: stale "stuck on" ring).**

## Performance

- **Duration:** ~60 min total across three rounds (initial pass, hover-extension follow-up, stale-focus-suppression follow-up)
- **Started:** 2026-09-25T06:05:00Z (approx)
- **Completed (auto tasks):** 2026-09-25T07:05:00Z (approx, after round-3 stale-focus follow-up)
- **Tasks:** 2 of 3 executed three times (initial + two follow-up revisions); Task 3 is a blocking human-verify checkpoint, still pending re-check
- **Files modified:** 1 modified, 1 created (both further revised in each follow-up round)

## Accomplishments
- `.gameCard:hover, .gameCard:focus-within` (grouped selector, matching the file's existing `scale(1.05)` idiom) now paints a 3px `var(--accent, #0080ff)` outline (`outline-offset: -1px`), a two-layer `box-shadow` (drop shadow + `color-mix()` accent glow), and `z-index: 2` — replacing the old 1px system hairline, and firing for mouse hover as well as keyboard/gamepad focus.
- `.gameListItem:hover, .gameListItem:focus-within` (new rule) paints a 2px `var(--accent, #0080ff)` outline at `-2px` offset for list view, which previously had only a text-colour change.
- `.gameList:hover .gameCard:focus-within:not(:hover)` and `.gameListLayout:hover .gameListItem:focus-within:not(:hover)` suppress a stale ring (and, for the grid card, the shared `scale(1.05)` pop) on a card/row that still carries DOM focus from a prior gamepad landing or click, while the pointer hovers a *different* card — so exactly one tile highlights at a time while mousing.
- Console mode is untouched: `git diff --name-only -- src/frontend/screens/ConsoleMode/` reports 0 files (re-confirmed after all three rounds).
- The source-text gate (`gameCardFocusRing.test.ts`, now 12 assertions, all passing) holds the ring to the `--accent` token, confirms the hairline is gone, confirms no bare hex literal survives outside a `var()` fallback slot, proves hover and focus share ONE rule per selector, proves both stale-focus suppression rule bodies exist (ring+box-shadow+z-index restoration, and scale restoration) with the correct box-shadow literal restored (not `box-shadow: none`), and cross-checks that `ConsoleMode/index.scss`'s `.consoleCard.focused` still spends the same token.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace the hairline focus ring with the console-mode accent ring** - `b38c5b6fc` (feat)
2. **Task 2: Source-text gate keeping the ring token-driven and in step with console mode** - `b223c2bdc` (test)
3. **Task 3: Human visual check** - round 1 PARTIAL PASS, round 2 PARTIAL PASS (see Deviations below); re-check still PENDING (blocking `checkpoint:human-verify`, not executed by this agent)
4. **Round 2 follow-up fix: extend the ring to mouse hover** - `f6b1063e0` (fix)
5. **Round 2 follow-up test update: assert hover+focus share one rule** - `9d8252171` (test)
6. **Round 3 follow-up fix: suppress stale focus ring/scale while mousing** - `0475e74bd` (fix)
7. **Round 3 follow-up test update: assert stale-focus suppression rules exist** - `108c65c92` (test)

**Plan metadata:** to be committed by orchestrator (SUMMARY.md, STATE.md not committed by this agent per constraints)

## Files Created/Modified
- `src/frontend/screens/Library/components/GameCard/index.css` - Ring rules for `.gameCard` and `.gameListItem` key on the grouped `:hover, :focus-within` selector shape (previously `:focus-within` only). `.gameCard`'s ring: 3px `var(--accent)` outline, two-layer box-shadow (drop shadow + glow), `z-index: 2`. `.gameListItem`'s ring: 2px `var(--accent)` outline, no glow/z-index. Added `.gameList:hover .gameCard:focus-within:not(:hover)` (restores resting outline/box-shadow/z-index) and a second rule of the same selector restoring `transform: none` against the shared `scale(1.05)` rule; added `.gameListLayout:hover .gameListItem:focus-within:not(:hover)` (restores resting outline). Explanatory comments above each new/changed rule.
- `src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts` - Source-text gate, now 12 tests across two describe blocks: original 8 (ring presence/token-driven-ness, hairline absence, no-bare-hex, hover+focus grouping, console-mode cross-file guard) plus 4 new (both stale-focus-suppression rule bodies exist for `.gameCard`, the box-shadow restoration uses the literal drop shadow rather than `none`, the scale suppression restores `transform: none`, and the list-item suppression clears its outline). Docstring rewritten across both rounds to state current scope.

## Decisions Made
- Followed the plan's investigation findings verbatim for the base ring values: reused `.consoleCard.focused`'s exact pixel/colour/z-index values so the two modes match exactly, kept `:focus-within` (not `:focus-visible`) since gamepad nav relies on it, and kept the `outline`/`box-shadow` split for `color-mix()` degradation safety.
- REVERSED the plan's design call to exclude `:hover` from the ring, after a live operator check reported "gamepad is working but mouse is not." This app already treats hover and focus as one "highlighted" state (the pre-existing `.gameCard:hover, .gameCard:focus-within { transform: scale(1.05) }` rule proves it), and the operator confirmed their original request ("make highlighted games ... have a border") meant both input paths.
- Round 3: after hover was added, gamepad/click-driven real DOM focus could linger as a second, stale ring once the pointer moved elsewhere. The coordinator asked the operator to choose between "hover wins while mousing" and alternatives; operator chose hover-wins. Implemented as pointer-container-scoped `:not(:hover)` suppression, extended to the shared scale transform as a deliberate scope decision (leaving the scale would have only relocated the "stuck on" symptom from the ring to the pop-out size). Accepted, not fixed: pointer resting in a gap between cards while another card is stale-focused shows zero rings momentarily.
- See Deviations below for both live-feedback-driven reversals in full.

## Deviations from Plan

### Coordinator-directed revision (post-checkpoint, live operator feedback)

**1. [Design call reversal] Ring extended to `:hover`, not just `:focus-within`**
- **Found during:** Task 3 (human visual check), first pass
- **Issue:** The plan's investigation findings deliberately scoped the ring to `:focus-within` only. The operator ran the app and reported the ring worked under gamepad navigation but was completely invisible under mouse hover ("ok, gamepad is working but mouse is not"; earlier, while moving with the mouse: "cant see any effect from this update, games not highlighted in grid view, cant see any effect in listview either"). The coordinator diagnosed that the plan's focus-only scope was wrong for this app's actual "highlighted" semantics, since `.gameCard:hover, .gameCard:focus-within { transform: scale(1.05) }` already unifies hover and focus as one state, and confirmed directly with the operator that their original request meant both.
- **Fix:** Regrouped both ring rules (`.gameCard` and `.gameListItem`) onto the `:hover, :focus-within` grouped-selector shape already used by the `scale(1.05)` rule; updated the explanatory comment to state hover+focus parity instead of a focus-only rationale; updated the source-text gate's regexes (which keyed on `:focus-within` alone and stopped matching once the CSS was regrouped) to match the new grouped shape, and added explicit assertions proving hover and focus share one rule rather than two.
- **Files modified:** `src/frontend/screens/Library/components/GameCard/index.css`, `src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts`
- **Verification:** `npx prettier --check` on both explicit paths (pass), the node source-text assertions (pass), `git diff --name-only -- src/frontend/screens/ConsoleMode/` (0 files, re-confirmed), `npx jest .../gameCardFocusRing.test.ts` (8/8 pass), `npx tsc --noEmit` (clean).
- **Committed in:** `f6b1063e0` (CSS), `9d8252171` (test)

---

**2. [Design extension] Stale-focus suppression added: "hover wins while mousing"**
- **Found during:** Task 3 (human visual check), round 2 (after the hover fix from deviation 1 landed)
- **Issue:** Round-2 human check reported the hover ring worked, but flagged a new symptom: "works but there is one tile that is 'stuck on'." Diagnosis (established by the coordinator, not re-investigated here): gamepad navigation (`gamepad.ts`'s simulated tab/arrow nav) and a plain click both move real DOM focus, and `:focus-within` holds the ring on that card until focus moves elsewhere -- so the last gamepad-landed or last-clicked card kept ringing even while the pointer hovered a different card, producing two simultaneous rings, one of them stale. The coordinator asked the operator to choose a resolution; the operator chose "hover wins while mousing": while the pointer is over the library, only the hovered card highlights, and the stale focus highlight is suppressed. Gamepad-only use (pointer not over the library) and console mode were required to be unaffected.
- **Fix:** Added `.gameList:hover .gameCard:focus-within:not(:hover)` restoring the resting `outline: none` / base `box-shadow: 0px 0px 12px 4px #00000055` (the literal from the `.gameCard` base rule -- deliberately NOT `box-shadow: none`, which would also drop the card's normal resting drop shadow) / `z-index: auto`; a second rule of the same selector restoring `transform: none` against the shared `scale(1.05)` rule (a deliberate scope extension beyond the ring alone -- leaving the stale card visibly scaled up would only relocate the "stuck on" complaint from the ring to the pop-out size); and `.gameListLayout:hover .gameListItem:focus-within:not(:hover)` restoring `outline: none` for list view. Extended the source-text gate with 4 new assertions proving both `.gameCard` suppression rule bodies exist with the correct properties (including the box-shadow-restored-not-cleared check) and that the list-item suppression clears its outline. Comments added to each new rule explaining the stale-DOM-focus cause and the "pointer present = mouse is active input" rationale.
- **Files modified:** `src/frontend/screens/Library/components/GameCard/index.css`, `src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts`
- **Verification:** `npx prettier --check` on both explicit paths (pass), `git diff --name-only -- src/frontend/screens/ConsoleMode/` (0 files, re-confirmed), `npx jest .../gameCardFocusRing.test.ts` (12/12 pass, up from 8/8), `npx tsc --noEmit` (clean).
- **Committed in:** `0475e74bd` (CSS), `108c65c92` (test)
- **Accepted edge case, not fixed:** if the pointer sits in a gap between cards (nothing hovered) while a different card is stale-focused, the stale ring is still suppressed, so zero rings show momentarily. This was explicitly named and accepted by the coordinator/operator, not treated as a defect.

---

**Total deviations:** 2 coordinator-directed (both design reversals/extensions based on live operator feedback across two checkpoint rounds, not auto-fixes under Rules 1-3/executor discretion)
**Impact on plan:** Both necessary corrections — the plan's own success criteria require the highlight to be "identifiable at a glance" and (implicitly, per "exactly one highlighted tile") unambiguous. Neither introduced unrelated scope creep; console mode remains untouched and the `--accent` token requirement is preserved throughout.

### Minor self-correcting fix (within original Task 2, before first commit)

One self-correcting fix during Task 2 authoring: the test's relative path to `ConsoleMode/index.scss` initially used three `..` segments (`ENOENT`), corrected to four to match the actual directory depth from `GameCard/__tests__/` — caught immediately by the task's own `<verify>` jest run before commit, so no separate deviation entry is warranted (Rule 1, fixed inline within the same task, before any commit).

## Issues Encountered
None beyond the items already documented above (the path-depth fix, the hover-scope reversal, and the stale-focus-suppression extension, both driven by live operator feedback).

## Known Stubs
None. No hardcoded empty values, placeholder text, or unwired data introduced by this plan.

## Threat Flags
None. This plan edits one stylesheet and adds one source-text test; no new network endpoint, auth path, file access pattern, or schema surface was introduced. Consistent with the plan's own threat model (T-pga-01, accepted; T-pga-SC, n/a).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

**Task 3 (checkpoint:human-verify, gate="blocking") is NOT complete.** Round 1 returned PARTIAL PASS (gamepad focus ring worked; mouse hover showed no ring). Round 2, after the hover fix, returned PARTIAL PASS again (hover ring confirmed working, but a stale focus ring from prior gamepad/click use stayed "stuck on" while mousing). The ring has since been extended to `:hover` (commits `f6b1063e0`, `9d8252171`) and stale-focus suppression has been added (commits `0475e74bd`, `108c65c92`). This agent stopped before self-approving Task 3 per explicit instruction, in all three rounds. The operator needs to re-run the app and re-check, in order, reporting the verdict (or which step failed):

1. Grid view, **hover a card with the MOUSE only** (no click, no keyboard focus). CONFIRM the hovered card carries an obvious coloured ring — the round-1 failure point.
2. **Reproduce the round-2 "stuck on" scenario and confirm it is now fixed:** use the gamepad/keyboard to move focus onto a card (it rings), then move the MOUSE to hover a DIFFERENT card without touching the gamepad/keyboard again. CONFIRM the gamepad-focused card's ring AND scale-up disappear (returns to resting size and shadow) the moment the mouse starts hovering a different card, and only the newly-hovered card rings. This is the specific defect reported in round 2 ("one tile that is 'stuck on'").
3. With the mouse hovering one card, move keyboard/gamepad focus to hover over the SAME card the mouse is on (i.e., hover and focus coincide). CONFIRM exactly one ring shows (no doubled/thicker ring, no flicker).
4. Move the mouse to hover a card in the MIDDLE of a row and one in the LAST row (with no stale focus elsewhere). CONFIRM the ring is complete on all four sides and not clipped or covered by a neighbour.
5. Switch to LIST view: use gamepad/keyboard to focus one row, then hover a DIFFERENT row with the mouse. CONFIRM the same stale-suppression behavior — only the hovered row rings, the previously-focused row's outline is gone.
6. Rest the mouse pointer in a GAP between cards (not over any card) while a different card is still gamepad/click-focused. CONFIRM zero rings show in that moment — this is the accepted edge case, not a bug; do not flag it as a failure.
7. Change theme to at least three with different accents (suggested: `gruvbox_dark` `#b57614`, `dracula-classic` `#bd93f9`, `high-contrast` `#00ddff`). CONFIRM the ring recolors per theme and stays legible under both hover and focus.
8. Enter CONSOLE mode and move the highlight between cards (gamepad/keyboard only, as before this whole task). CONFIRM it looks exactly as it always has — scale-up, accent ring, accent glow, nothing new, nothing missing, no stale/stuck tiles. (`git diff --name-only -- src/frontend/screens/ConsoleMode/` still returns 0 after all three rounds.)
9. With the pointer OFF the library entirely (e.g. over the sidebar or another screen), use ONLY the gamepad/keyboard to move between cards. CONFIRM focus alone still rings the current card normally — the pre-round-3 behaviour is unaffected when the mouse isn't hovering the container at all.

Resume signal: type "approved", or describe which step failed and what was seen. Until that happens, this quick task is not complete per its own `<verification>` and `<success_criteria>` sections (both require the Task 3 human check to return "approved").

---
*Phase: quick-260925-pga*
*Completed: 2026-09-25 (Tasks 1-2 executed three times across two live-feedback rounds; Task 3 re-check pending)*

## Self-Check: PASSED

- FOUND: `src/frontend/screens/Library/components/GameCard/index.css`
- FOUND: `src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts`
- FOUND: `.planning/quick/260925-pga-make-highlighted-game-cards-in-non-conso/260925-pga-SUMMARY.md`
- FOUND commit: `b38c5b6fc`
- FOUND commit: `b223c2bdc`
- FOUND commit: `f6b1063e0`
- FOUND commit: `9d8252171`
- FOUND commit: `0475e74bd`
- FOUND commit: `108c65c92`
