---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
verified: 2026-10-08T12:00:00Z
status: human_needed
score: 8/10 must-haves verified (R1-R7 from 48-SPEC.md; R3 split into R3-core, R3-gamepad, R3-parity and R3-chevron-reach)
covered_files: []
covered_digest: "unavailable: verification.fingerprint is not exposed by the installed gsd-sdk/gsd-tools bridge (Unknown command: verification); not hand-written"
behavior_unverified: 2
overrides_applied: 1
overrides:
  - must_have: "libraryTopSection: recently_played_installed yields Recently-played focus row with installed-only semantics"
    reason: "Operator ruling in 48-05 Task 1: persisted shape has no modifier slot; recency kept, installed-only dropped; installed-only reachable via the grid's Installed view"
    accepted_by: "operator (48-05 plan checkpoint)"
    accepted_at: "2026-10-05T17:36:51+13:00"
re_verification:
  previous_status: human_needed
  previous_score: 7/8
  gaps_closed:
    - "R3 gamepad scroll-into-view: passed live by the operator on Windows with a physical controller (UAT item 8, 2026-10-07); handler also covered by behavioural stub tests including the 48-10 edge-clearance cases"
    - "G-48-8a: controller mode no longer changes any GameCard's box (48-09, source-gated, desk arithmetic); live confirmation owed"
    - "G-48-8b: mouse hover wears the console-style 3px ring on every GameCard (48-09, source-gated); live confirmation owed"
    - "G-48-4b / G-48-9: .focusRowTrack is an isolated stacking context so a hovered card cannot paint over a chevron (48-10, source-gated); real-pointer hit-test owed"
    - "G-48-4a: chevron on one opaque var(--body-background) disc, glyph at least 3:1 in all 10 themes by token census (48-11); live pixel re-measure owed"
    - "G-48-7: dracula and nord-light divider labels use the tier-2 row colour chain, at least 4.5:1 in all 10 themes by token census (48-11); live re-measure owed"
    - "G-48-8c: strip cards take the grid's minmax(156px, 1fr) column width derived from the strip's own content box (48-12); live within-1px parity owed"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
advisory:
  - finding: "No code review exists for the round-2 plans 48-09..48-12 (48-REVIEW.md and 48-REVIEW-DISPOSITION.md cover rounds up to 48-07)"
    category: other
    reason: "Not a must-have; /gsd-code-review 48 would cover the new focusRowOverflow.ts sync/hold logic and the global GameCard CSS change"
    evidence_status: "none provided"
  - finding: "48-UI-SPEC.md still says 'Semi-transparent dark scrim' for the chevron (line 319); the opaque-disc deviation (48-11) is recorded in the plan, the CSS comment and the themeTokens census, not in the UI-SPEC"
    category: other
    reason: "Documentation drift only; the code, its comment and its gate agree with each other"
    evidence_status: "none provided"
behavior_unverified_items:
  - truth: "R3 / chevron reach: with a real pointer crossing the adjacent edge card onto a chevron, the chevron stays on top and a click advances the strip (UAT item 9, G-48-4b, G-48-9)"
    test: "On Windows dev shell with a real mouse, overflowing strip: move the pointer onto each chevron through the adjacent edge card (from above, below and inside), then click"
    expected: "document.elementFromPoint at the chevron centre returns the control (or a descendant); the click advances scrollLeft by one grid row; the chevron stays visible while the edge card is hovered"
    why_human: "48-10 puts isolation: isolate on .focusRowTrack and the source gate pins it plus the control z-index, but whether a CSS engine paints and hit-tests the chevron above a hovered, transformed card is a rendering invariant no jest project can see. UAT item 9 still reads issue (recorded before 48-10)"
  - truth: "R3 / amended criterion: strip cards are the same width as the grid's cards at every window width, within 1px (G-48-8c)"
    test: "At window 1280 and at one narrower width, read getBoundingClientRect().width of the first .focusRowTrack .gameList > * and of the first grid card"
    expected: "Equal within 1px at both widths; strip stays one card tall and at most 20 cards; with a filter yielding zero grid results the strip width is unchanged"
    why_human: "The derivation is proven at the desk (gridColumnWidth over a content box, stylesheet values parsed from Library/index.css and asserted equal), and the assumption that the strip's content box equals the grid's content box rests on layout (viewport bleed -15px against list padding 15px, both under .listing). Only a layout engine confirms the browser resolves it to the same pixels"
human_verification:
  - test: "UAT item 9 re-run, real-pointer chevron reach after 48-10 (see behavior_unverified_items 1)"
    expected: "Chevron stays on top of a hovered edge card; click pages the strip"
    why_human: "Rendering and hit-testing invariant"
  - test: "G-48-8c parity, live (see behavior_unverified_items 2). Also resize the window across a column-count breakpoint and watch for flicker or a ResizeObserver loop error in the console (the 250ms flip-hold, T-48-36)"
    expected: "Strip card width equals grid card width within 1px at 1280 and a narrower width; no console 'ResizeObserver loop' error and no visible flip-flop while dragging"
    why_human: "Pixel measurement and a feedback loop that depends on a real scrollbar toggling"
  - test: "UAT item 10 (now pending): chevron 40-combination re-measure (10 themes x BRIGHT/DARK card x 2 edges) and divider-label measure, C1-C4 rule"
    expected: "Every chevron minimum at least 3:1 and within 0.05 of the census figure (census minimum 3.91, gruvbox_dark); every divider at least 4.5:1 and within about 0.02 of census (minimum 5.43, marine); dracula about 7.48, nord-light about 7.38"
    why_human: "Pixel measurement over real themes and the disc edge against artwork, which the token census cannot see"
  - test: "G-48-8a / G-48-8b live: with a controller, switch mouse to controller and back on a strip and on the grid"
    expected: "Card boxes do not change size or crop on handoff; mouse hover shows the same 3px ring as controller focus; exactly one tile rings at a time (parked cursor in controller mode, stale focus in mouse mode, across strip and grid)"
    why_human: "Input-mode handoff and live :hover/:focus-within interplay; the unit gates parse stylesheet text only"
  - test: "UAT items 5 and 6 re-check at grid-matched widths"
    expected: "Back/forward page by exactly one grid row and end at scrollWidth; at widths 1280, 520 and the narrowest, no title rect exceeds its card, the end cards' rings are not clipped by the track at scrollLeft 0 and at the end of travel; controller focus past the last visible card scrolls it in with ring clearance"
    why_human: "Layout and scroll geometry after 48-10 and 48-12 changed padding, bleed, card width and the scroll-into-view target"
---

# Phase 48: Focus Row Verification Report (re-verification, gap-closure round 2)

**Phase Goal:** The single lane above the games grid stops being a four-option dropdown buried in Settings and becomes a **focus row** chosen from the Games tier-2 panel, pickable from any view, collection, store or runnability value, rendered as a horizontal strip that fills the available width, with the `Recent Games to Show` number setting removed and the row sized by what fits.
**Verified:** 2026-10-08
**Status:** human_needed
**Re-verification:** Yes, after gap-closure round 2 (48-09, 48-10, 48-11, 48-12). HEAD `0a0bfca2d`, branch `quick-261002-b63`. Previous report: 2026-10-07, `human_needed`, 7/8.

## Requirement IDs

R1-R7 are phase-local, defined in `48-SPEC.md`; `.planning/REQUIREMENTS.md` has no Phase 48 rows (expected; the executor's `requirements.mark-complete R3` returned not_found for that reason). Plan frontmatter cross-reference: 48-01 [R2,R3], 48-02 [R1,R3,R4,R5], 48-03 [R2], 48-04 [R3], 48-05 [R7], 48-06 [R6], 48-07 [R7,R1], 48-08 [R1,R2,R3,R6,R7], 48-09 [R3], 48-10 [R3], 48-11 [R2,R3], 48-12 [R3]. Every one of R1-R7 is claimed by at least one plan; none is orphaned, and no plan names an ID absent from the SPEC. R3 is read as amended on 2026-10-07 (recorded in the SPEC 2026-10-08): the "fixed 156px" criterion is struck and the "same width as the grid's cards within 1px" criterion is added (SPEC lines 96, 166, 167). R6 is read as amended 2026-10-04.

## Goal Achievement

### Observable Truths

| # | Truth (48-SPEC.md) | Status | Evidence |
|---|--------------------|--------|----------|
| R1 | One persisted `{kind,value}` selection, or off, survives restart | VERIFIED | Carried from round 1; regression check: `GlobalStateFocusRowHydration`, `focusRowFirstLaunchHydration` (real read path) and `focusRowMigration` suites pass in this run; UAT item 2 live pass |
| R2 | FOCUS ROW section in the Games tier-2 panel, single-select, clearable, fixed group order, no collections group when empty | VERIFIED | `filterFocusRow.test.tsx` passes; `FilterFocusRow` still mounted; UAT item 7 live (structure, order, ellipsis, no raw key). The divider contrast defect (G-48-7) is now fixed in source, see R2 follow-up below |
| R3-core | One horizontal strip, one card tall, max 20, controls reveal remainder, no affordance when content fits, zero-match renders nothing, grid unchanged | VERIFIED | `FocusRowStrip/index.css` (`.focusRowTrack` overflow-x auto, `.gameList` flex nowrap, card basis from `--focus-row-card-width`); `FOCUS_ROW_MAX_CARDS` cap intact; controls mount only when `canScrollForward/Back`; `focusRowStripSource` and `focusRowOverflow` suites pass; UAT items 5 and 6 live pass (measured before 48-10/48-12, re-check owed below). Grid files: `git diff 752b510f8 HEAD` on `Library/index.css` and `GamesList/index.tsx` is empty; `GameCard/index.css` is unchanged since `151e2cba2` and its pre-round-2 delta is the operator-ruled global change (below) |
| R3-gamepad | Gamepad focus past the last visible card scrolls it into view | VERIFIED | UAT item 8: operator, Windows 11, physical controller, "yes that works" (pre-48-10). Handler `scrollFocusedCardIntoViewHorizontally` is exercised behaviourally by Tests A-E and the plain-overhang cases in `focusRowOverflow.test.ts` (stubbed rects, scrollTo spy), and is attached in a capture-phase listener gated on `activeController` (`index.tsx:142-159`). 48-10 later changed its target to leave the list's padding as clearance; that change is unit-proven, live re-check listed under human item 5 |
| R3-parity | Strip cards are the same width as the grid's at every window width, within 1px; where the grid shows no cards, the width a grid column would take (amended 2026-10-07) | PRESENT_BEHAVIOR_UNVERIFIED | Present and wired: `gridColumnCount`/`gridColumnWidth` (`focusRowOverflow.ts:142-172`) implement `repeat(auto-fill, minmax(156px,1fr))` with the 1.5rem gap; `createStripCardWidthSync` derives C from the track's border-box width less the list's computed inline padding, writes `--focus-row-card-width` inline; called from `useLayoutEffect` (first paint, `index.tsx:107`) and the ResizeObserver callback (`:124`); CSS consumes it as `flex: 0 0 var(--focus-row-card-width, 156px)` (`index.css:80-82`). Geometry cross-checked by hand: viewport `margin-inline:-15px` + list `padding-inline:15px` against the grid's `padding: 0 var(--space-md-fixed)` under the same `.listing` flex column gives the same content box. Source gates parse both stylesheets and assert gap text, padding token and the 156 floor equal. Independent of grid mount state by construction. Not measured in a layout engine, so routed to human verification |
| R3-chevron-reach | Forward control reachable by a real pointer through a hovered edge card | PRESENT_BEHAVIOR_UNVERIFIED | `.focusRowTrack { isolation: isolate }` with no z-index, controls `position:absolute; z-index:1` (`index.css:26-31`, `95-121`); source gates pin both (Tests 1-3). UAT item 9 is still `issue` because it predates 48-10; the hit-test re-run is owed |
| R4 | Independent of filters except hidden games | VERIFIED | `focusRowSelectors.test.ts` passes (incl. held-out backstop); unchanged since round 1 |
| R5 | recentlyPlayed by recency, everything else by title, stable tie-break on `app_name` | VERIFIED | `focusRowSelectors.test.ts` passes; unchanged |
| R6 (amended) | `Recent Games to Show` control and its dead code removed | VERIFIED | `git ls-files` finds no `MaxRecentGames`/`LibraryTopSection` component; `git grep -il maxRecentGames -- src` returns nothing; `getRecentGames` is `async () => configStore.get('games.recent', [])`; UAT item 1 live |
| R7 | `Library Top Section` removed; one-time migration; clear-then-relaunch does not restore | VERIFIED | Carried from round 1 (CR-01 closed by 48-07; UAT item 3 legs A-D live); real-read-path suites pass in this run. `recently_played_installed` criterion carried as PASSED (override), not re-litigated |

**Score:** 8/10 truths verified (R3 counted as four sub-truths); 2 present, behavior-unverified (R3-parity, R3-chevron-reach). No truth failed.

### Round-2 gap closure, claim versus code

| Gap | Plan | Code evidence (read in this run) | Gate | Live |
|-----|------|----------------------------------|------|------|
| G-48-8a controller mode resizes cards | 48-09 | `git diff 752b510f8 HEAD -- GameCard/index.css`: `.gameCard.gamepad` (3/4) and `.gameCard.gamepad.justPlayed` (328/205) aspect-ratio rules deleted; only `.gameCard.gamepad > .icons` remains | `gameCardControllerGeometry.test.ts`: no `.gamepad` selector declares a sizing property (comment-stripped brace walk), plus art-fits arithmetic over values parsed from the shipped CSS at the 156px floor and every wider card | owed |
| G-48-8b hover thinner than controller ring | 48-09 | one grouped `.gameCard:hover, .gameCard:focus-within` rule consuming `--focus-ring-width/-color/-halo`, +2px offset, halo and glow; z-index 2 / 3 in separate single-selector rules; stale-focus rules re-scoped to `.listing:hover`; `body.controllerLayout .gameCard:hover:not(:focus-within)` returns a parked cursor to rest; `.gameListItem` split untouched; `themes.scss` note updated | `gameCardFocusRing.test.ts` Tests A-G rewritten | owed |
| G-48-4b / G-48-9 hovered card paints over chevron | 48-10 | `isolation: isolate` on `.focusRowTrack` (`index.css:27`); control z-index 1 | `focusRowStripSource.test.ts` Tests 1-3 | owed (R3-chevron-reach) |
| strip-end ring clipping | 48-10, 48-12 | list `padding-inline:15px`, `width:max-content`, viewport `margin-inline:-15px`, `margin-block: max(var(--space-md), calc(var(--focus-row-card-width,156px)*0.04 + 6.5px))`; `scrollFocusedCardIntoViewHorizontally` reads the list's computed padding at call time | Tests F, G, H, V and the ring-reach non-vacuity test (13.65px / 18.60px at the 336px supremum); clearance Tests A-E | owed |
| G-48-4a chevron contrast | 48-11 | `.focusRowStrip__control { color: var(--accent); background: var(--body-background) }`, no `color-mix`/`rgba`/`transparent` | `themeTokens.test.ts` chevron census reads the shipped declarations through the shared var() resolver for all 10 themes (desk minimum 3.91, gruvbox_dark) and fails on translucency; `focusRowStripSource` "opaque disc" test | owed (UAT item 10) |
| G-48-7 divider contrast | 48-11 | `FilterFocusRow/index.scss`: nested `body.dracula &, body.nord-light & { color: var(--navbar-inactive, var(--navbar-accent)) }` | divider census over 10 themes at 4.5:1 (desk minimum 5.43, marine; dracula 7.48, nord-light 7.38) | owed (UAT item 10) |
| G-48-8c strip narrower than grid | 48-12 | see R3-parity row; `pageScrollDelta` floors `(clientWidth + 1) / pitch` so a page is exactly one grid row in the zero-slack geometry; `measureCardPitch` reads the live card rect; flip-hold (`FLIP_WINDOW_MS = 250`, per-track two-write history, 0.5px write epsilon) in `createStripCardWidthSync` | W1-W6, S1-S4, P1, G1-G4 behaviour tables in `focusRowOverflow.test.ts`; parity gates in `focusRowStripSource.test.ts` | owed |

Records of the amendment: `48-SPEC.md` carries the dated R3 note, the struck criterion (line 166), the added parity criterion (line 167) and a `Revised:` header line; `48-UI-SPEC.md` carries dated notes at lines 75, 242, 415 and 441. CONTEXT.md is deliberately not rewritten; D-01 and D-02 are superseded for the strip by the operator's "match the grid" ruling, as recorded.

A note on "grid unchanged" (SPEC R3 criterion, boundary "Any change to the games grid"): `GameCard/index.css` did change in 48-09, and the card is shared with the grid (controller-mode geometry, hover ring, stale-focus scope). That is the operator's explicit ruling of 2026-10-07 ("global, not strip-only", recorded in the 48-09 plan objective and in the CSS comments), not a silent divergence. The grid's own stylesheet (`Library/index.css`) and its renderer (`GamesList/index.tsx`) are byte-identical to the pre-phase baseline, and what the grid shows and in what order is unchanged.

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| FocusRowStrip cards | `selectFocusRowGames(...)` | library state, `games.recent`, `customCategories` | Yes | FLOWING |
| Strip card width | `--focus-row-card-width` | `track.getBoundingClientRect()` and computed list padding/gap, through `gridColumnWidth` | Yes (not a literal; fallback 156px only before first measurement or when unmeasurable) | FLOWING |
| Chevron colours | `--accent` on `--body-background` | theme tokens | Yes | FLOWING |
| Context `focusRow` | mirror seed, else migrated `requestAppSettings()` | `store/config.json` / `config.json` | Yes (UAT item 3) | FLOWING |

### Behavioral Spot-Checks and Automated Checks

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Phase suites | `npx jest FocusRowStrip FilterFocusRow themeTokens GameCard focusRowMigration GlobalStateFocusRowHydration focusRowFirstLaunchHydration` | 12 suites, 349 tests passed | PASS |
| Type check | `npx tsc --noEmit` | no output, clean | PASS |
| Grid files untouched | `git diff --stat 752b510f8 HEAD -- Library/index.css GamesList/index.tsx`; `git diff --stat 151e2cba2 HEAD` on those two plus `GameCard/index.css` | empty | PASS |
| R6 greps | `git grep -il maxRecentGames -- src`; `git ls-files` for the deleted components | 0 hits | PASS |
| Debt markers | added lines in `git diff 752b510f8 HEAD -- src` matching `TBD`, `FIXME`, `XXX` | none | PASS |
| Lint, prettier, codecheck | not re-run; reported clean by the executors and the orchestrator | n/a | accepted |
| Full `npm test` | not re-run; orchestrator reports 39 failed suites / 109 failed tests of 10444, all in the known Windows-only set touching none of this phase's files (CI is ubuntu-only) | n/a | accepted, not a phase regression |

Probes: none declared for this phase (Step 7c not applicable). Debt marker gate: no unreferenced marker. The `deferred-items.md` entry (`overlayDismiss` red in isolation) is pre-existing and outside this phase.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| R1 | 48-02, 48-07, 48-08 | SATISFIED | truths table |
| R2 | 48-01, 48-03, 48-08, 48-11 | SATISFIED (divider contrast fix owed a live re-measure, not a requirement) | |
| R3 | 48-01, 48-02, 48-04, 48-08, 48-09, 48-10, 48-11, 48-12 | SATISFIED in code; the amended parity criterion and chevron pointer reach are human-verification items | |
| R4 | 48-02 | SATISFIED | |
| R5 | 48-02 | SATISFIED | |
| R6 (amended) | 48-06, 48-08 | SATISFIED | |
| R7 | 48-05, 48-07, 48-08 | SATISFIED | |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `focusRowOverflow.test.ts` S1 | comment "982 - 2 x 12 = 958" uses the superseded 12px padding in a fixture description | Info | Test fixture, not shipped; the CSS and the source gates use 15px |
| `48-UI-SPEC.md:319` | "Semi-transparent dark scrim" survives; the opaque disc is not noted there | Info | Documentation drift (advisory above) |
| `focusRowMigration.ts` `hydrateFocusRowSelection` | WR-03 `onError` could throw | Warning, not blocking | Unchanged from round 1; todo filed (`.planning/todos/pending/...hydrate-focus-row-selection...`) |
| `config.ts` | `libraryTopSection: 'disabled'` kept in factory defaults | Info | Intentional migration source |

No stub, placeholder or empty-implementation patterns in the files this round touched; no TBD/FIXME/XXX added.

## Human Verification Required

1. **Real-pointer chevron reach (UAT item 9 re-run).** Test: on Windows with a real mouse and an overflowing strip, move the pointer onto each chevron through the adjacent edge card (above, below, inside) and click. Expected: the chevron stays on top and the click pages the strip by one grid row. Why human: rendering/hit-testing invariant; 48-10 is source-gated only.
2. **Grid parity live (G-48-8c).** Test: at 1280 and one narrower width compare the first strip card and the first grid card widths; also drag-resize across a column-count breakpoint with the console open. Expected: within 1px; no `ResizeObserver loop` error and no flip-flop. Why human: layout engine and scrollbar feedback.
3. **UAT item 10, contrast re-measure.** Test: the C1-C4 40-combination chevron measurement and the per-theme divider measurement. Expected: at least 3:1 and 4.5:1, near the census figures (3.91 / 5.43 minimum). Why human: pixels, disc edge against art.
4. **G-48-8a / G-48-8b live with a controller.** Expected: no card resize or crop on handoff in strip or grid; hover shows the thick ring; exactly one tile rings.
5. **UAT items 5 and 6 at grid-matched widths.** Expected: one-row paging, unclipped end rings at `scrollLeft` 0 and at the end, no title overflow at 1280, 520 and the narrowest width, controller scroll-into-view with ring clearance.

All five route through `/gsd-verify-work 48` against `48-UAT.md` (status `diagnosed`; its `## Gaps` entries G-48-4a, 4b, 7, 8a, 8b, 9, 8c still read `failed` as recorded before the fixes, and items 4, 7 and 9 still read `issue` until the live re-run updates them; item 10 is `pending`).

## Gaps Summary

No requirement R1-R7 fails and no must-have is FAILED. Round 2 closes all seven recorded UAT gaps in source, each with a stylesheet or behaviour gate that passes in this run (12 suites, 349 tests, tsc clean), and the one open item of the prior report (R3 gamepad scroll) is now closed by the operator's live controller pass. Status stays `human_needed` rather than `passed` because the closures are desk-proven, not live-proven: two R3 sub-truths (grid-width parity and real-pointer chevron reach) depend on a CSS engine, and the contrast, handoff and resize checks are explicitly owed to the live re-run. If the live re-run contradicts a source gate (for example the chevron still loses a hit-test to a hovered card, or parity is off by more than 1px), promote that sub-truth to a gap against R3.

---

_Verified: 2026-10-08_
_Verifier: Claude (gsd-verifier)_
