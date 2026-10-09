---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
verified: 2026-10-09T12:00:00Z
status: passed
score: 10/10 must-haves verified (R1-R7 from 48-SPEC.md; R3 split into R3-core, R3-gamepad, R3-parity and R3-chevron-reach)
covered_files:
  - src/common/focusRowMigration.ts
  - src/common/__tests__/focusRowMigration.test.ts
  - src/backend/sidecar/__tests__/focusRowFirstLaunchHydration.test.ts
  - src/frontend/state/GlobalState.tsx
  - src/frontend/state/__tests__/GlobalStateFocusRowHydration.test.ts
  - src/frontend/index.tsx
  - src/frontend/helpers/inputModality.ts
  - src/frontend/helpers/__tests__/inputModality.test.ts
  - src/frontend/themes.scss
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/__tests__/librarySyncNoticeSource.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
  - src/frontend/screens/Library/components/FocusRowStrip/index.css
  - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowSelectors.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts
  - src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts
covered_digest: "unavailable: verification.fingerprint is not exposed by the installed gsd-sdk/gsd-tools bridge (gsd-sdk falls back to gsd-tools.cjs, which answers 'Unknown command: verification'); not hand-written. covered_files is the phase-attributed source list (plan key-files), not the raw git diff 752b510f8..HEAD, which also carries unrelated work merged in from main (Login, Steam depot, sign-in notice, tauri shell tests)."
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "libraryTopSection: recently_played_installed yields Recently-played focus row with installed-only semantics"
    reason: "Operator ruling in 48-05 Task 1: persisted shape has no modifier slot; recency kept, installed-only dropped; installed-only reachable via the grid's Installed view"
    accepted_by: "operator (48-05 plan checkpoint)"
    accepted_at: "2026-10-05T17:36:51+13:00"
re_verification:
  previous_status: human_needed
  previous_score: 8/10
  gaps_closed:
    - "R3-parity (was PRESENT_BEHAVIOR_UNVERIFIED): measured live, strip and grid first card 355 vs 354 capture px at 1280 and equal at 760 (UAT item 11 / 48-18, macOS WebKit); item 11 passes on Windows by eye with a controller; G-48-8c resolved"
    - "R3-chevron-reach (was PRESENT_BEHAVIOR_UNVERIFIED): UAT item 9 re-run live with a CGEvent pointer through the edge card from above, below and inside, chevron glyph 122 px vs 122 px unhovered, click advanced exactly one grid row every time; G-48-4b / G-48-9 resolved"
    - "G-48-11a (ResizeObserver loop, WR-01): 48-14 moves the width write into a next-frame runner; 0 loop errors live vs 34 on the pre-fix binary"
    - "G-48-11b (WebKit paging past the last card): 48-13 pins the strip card width (index.css:86); two launches walk 0-4, 5-9, 9-13 with 15pt end clearance"
    - "G-48-11c (empty-grid strip +2px): 48-17 scrollbar-allowance hold; 355 vs 355 px in 10 of 10 captures, pre-fix arming control +2 CSS px"
    - "G-48-12a (Tab focus ring lost under a resting pointer, WR-02): 48-16 body.keyboardNav; exactly one ringed tile in 40 of 40 and 41 of 41 captures"
    - "G-48-12b (L3 distinct positions): bar extended to 40 presses by operator, 16 distinct positions, bar at least 10"
    - "G-48-8a (controller mode resizes cards): live pass with a physical controller on Windows 11 (UAT item 12, 2026-10-09)"
    - "G-48-11d (controller-mode tile buttons hidden): traced to a pre-existing upstream rule present at baseline 752b510f8; ruled intended by the operator, no code change"
    - "G-48-4a, G-48-7, G-48-8b: live re-measure, UAT items 10, 7, 12 pass"
    - "UAT file: status complete, 12 of 12 pass, 0 issues, 0 pending, 0 blocked; all 13 Gaps entries status resolved"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
advisory:
  - finding: "48-REVIEW.md (2026-10-08) predates the 48-14 (next-frame runner), 48-16 (inputModality / keyboardNav) and 48-17 (scrollbar-allowance hold) code; no review covers those files. Its WR-01, WR-02 and WR-03 are dispositioned fixed in 48-REVIEW-DISPOSITION.md; IN-01 to IN-07 remain open (info)"
    category: other
    reason: "Not a must-have. /gsd-code-review 48 would cover focusRowOverflow.ts (createNextFrameRunner, readScrollerAllowance), helpers/inputModality.ts and the GameCard keyboardNav CSS"
    evidence_status: "none provided"
  - finding: "48-UI-SPEC.md line 319 still says 'Semi-transparent dark scrim' for the chevron; the shipped control is an opaque var(--body-background) disc (48-11)"
    category: other
    reason: "Documentation drift only; code, its CSS comment, the themeTokens census and the live contrast pass (UAT item 10) agree with each other"
    evidence_status: "none provided"
  - finding: "Live evidence is split across engines: width parity, end-of-travel, resize sweep, chevron reach and contrast were measured numerically on macOS WKWebView; controller clauses (R3-gamepad, G-48-8a, item 11 ring clearance and first paint) were judged by eye by the operator on Windows 11 / WebView2 with a physical controller. No numeric parity measurement exists on WebView2"
    category: other
    reason: "The amended R3 criterion (within 1px of the grid) is engine-independent by construction (derived from the track content box) and the Windows by-eye pass found no jump or crop; a numeric Windows run is optional hardening, not a gap"
    evidence_status: "none provided"
  - finding: "48-18 observation: at 1280 the strip's cards 1-4 are 1-2 capture px (at most 1 CSS px) wider than the grid's, card 4's left edge 3 capture px right of the grid's (pitch 403 vs 402.5)"
    category: other
    reason: "The SPEC criterion binds the first card, and it is met (355 vs 354 capture px, left edges equal); sub-pixel pitch drift on later cards is recorded, not a criterion"
    evidence_status: "none provided"
---

# Phase 48: Focus Row Verification Report (re-verification, round 3, after plans 48-13 to 48-18 and the completed UAT)

**Phase Goal:** The single lane above the games grid stops being a four-option dropdown buried in Settings and becomes a **focus row** chosen from the Games tier-2 panel, pickable from any view, collection, store or runnability value, rendered as a horizontal strip that fills the available width, with the `Recent Games to Show` number setting removed and the row sized by what fits.
**Verified:** 2026-10-09
**Status:** passed
**Re-verification:** Yes. HEAD `24d38d58f`, branch `quick-261002-b63`. Previous report: 2026-10-08, `human_needed`, 8/10 (stale: 48-13 to 48-18 changed covered source files after it).

## Requirement IDs

R1-R7 are phase-local, defined in `48-SPEC.md`; `.planning/REQUIREMENTS.md` has no Phase 48 rows (confirmed again: its only R1-R7 hits are Phase 24's REQ-24-xx text). That is expected, not an orphaned-requirement finding. Plan frontmatter cross-reference, all 18 plans: 48-01 [R2,R3], 48-02 [R1,R3,R4,R5], 48-03 [R2], 48-04 [R3], 48-05 [R7], 48-06 [R6], 48-07 [R7,R1], 48-08 [R1,R2,R3,R6,R7], 48-09 [R3], 48-10 [R3], 48-11 [R2,R3], 48-12 [R3], 48-13 [R3], 48-14 [R3], 48-15 [R3], 48-16 [R3], 48-17 [R3,R4], 48-18 [R3,R4]. Every one of R1-R7 is claimed by at least one plan, no plan names an ID absent from the SPEC, none is orphaned. R3 is read as amended 2026-10-07 (fixed-156px struck; "same width as the grid's cards within 1px" added); R6 as amended 2026-10-04. CONTEXT D-01/D-02 are superseded for the strip by the operator's "match the grid" ruling, as recorded in the SPEC and UI-SPEC.

## Goal Achievement

### Observable Truths

| # | Truth (48-SPEC.md) | Status | Evidence |
|---|--------------------|--------|----------|
| R1 | One persisted `{kind,value}` selection, or off, survives restart | VERIFIED | `GlobalStateFocusRowHydration`, `focusRowFirstLaunchHydration` (real read path), `focusRowMigration` pass in this run; UAT item 2 live (collection pick round trip) |
| R2 | FOCUS ROW section in the Games tier-2 panel, single-select, clearable, fixed group order, no collections group when empty | VERIFIED | `filterFocusRow.test.tsx` passes; UAT item 7 live pass; divider contrast fix (G-48-7, `FilterFocusRow/index.scss`) re-measured live in item 10 |
| R3-core | One horizontal strip, one card tall, max 20, controls reveal remainder, no affordance when content fits, zero-match renders nothing, grid unchanged | VERIFIED | `FocusRowStrip/index.css` (overflow-x auto track, nowrap list, card width from `--focus-row-card-width`); UAT items 5 and 6 live (20 cards one row, track 982/222/0 at 1280/520/87), item 11 clauses 3 and 5 live on Windows; end of travel with disabled forward chevron and about 15pt clearance live (48-15/48-18). Grid files: `git diff 752b510f8 HEAD` on `Library/index.css` and `GamesList/index.tsx` is empty |
| R3-gamepad | Gamepad focus past the last visible card scrolls it into view | VERIFIED | UAT item 8 (operator, Windows 11, physical controller) and again UAT item 11 clause 1 on HEAD def5f1d29 at 1280 and the narrow width, whole ring clear of the track edge; handler behavioural tests in `focusRowOverflow.test.ts` pass |
| R3-parity | Strip cards same width as the grid's, within 1px, at every window width; where the grid shows no cards, the width a grid column would take (amended) | VERIFIED | Code: `gridColumnCount`/`gridColumnWidth`, `createStripCardWidthSync` (with `StripLayoutContext`, `readScrollerAllowance`, `FLIP_WINDOW_MS = 250`, next-frame runner) wired from `useLayoutEffect` and the observer in `FocusRowStrip/index.tsx`; `gridShown` passed from `Library/index.tsx:1165`. Live: 355 vs 354 capture px at 1280 (left edges 544/544), 438 vs 438 at 760 (48-18); empty grid 355 vs W0 355 in 10 of 10 captures and in list layout (G-48-11c), pre-fix arming control +2 CSS px; cold-relaunch first paint showed no narrow-then-wide jump (Windows, item 11 clause 2). Former behavior_unverified item closed |
| R3-chevron-reach | Forward control reachable by a real pointer through a hovered edge card | VERIFIED | `.focusRowTrack { isolation: isolate }` (`index.css:27`), controls z-index 1; `focusRowStripSource` gates pass. UAT item 9 re-run live with a real pointer from above, below and inside: glyph 122 px vs 122 px with the edge card hovered, click advanced exactly one grid row every time. Former behavior_unverified item closed. Method note: pixels and click effect rather than `document.elementFromPoint` (devtools console took no typed lines in the rig); the click result is the behavioural proof |
| R4 | Independent of filters except hidden games | VERIFIED | `focusRowSelectors.test.ts` passes; `gridShown` (48-17) is a layout input only and does not alter the selected games |
| R5 | recentlyPlayed by recency, everything else by title, stable tie-break on `app_name` | VERIFIED | `focusRowSelectors.test.ts` passes |
| R6 (amended) | `Recent Games to Show` control and its dead code removed | VERIFIED | `git grep -il maxRecentGames -- src` returns nothing; UAT item 1 live (Settings > General probe) |
| R7 | `Library Top Section` removed; one-time migration; clear-then-relaunch does not restore | VERIFIED | Migration suites pass in this run (WR-03 guard added in `0cecb87b1`, `focusRowMigration.ts:192-219`); UAT item 3 legs A-D live. `recently_played_installed` carried as PASSED (override) |

**Score:** 10/10 truths verified (R3 counted as four sub-truths); 0 present-but-behavior-unverified; 0 failed.

### Gap closure since the previous report, claim versus code

| Gap | Plan | Code evidence (read this run) | Gate | Live |
|-----|------|-------------------------------|------|------|
| G-48-11b strip scrolls past last card in WebKit | 48-13 (`c747af0a6`) | `index.css:86` `width: var(--focus-row-card-width, 156px)` on strip cards, with comment on WKWebView max-content sizing | source gates | two launches 0-4, 5-9, 9-13, forward disabled, 15pt clearance (48-15, 48-18) |
| G-48-11a ResizeObserver loop (WR-01) | 48-14 (`1cc619836`) | `createNextFrameRunner` (`focusRowOverflow.ts:388`), imported and used in `index.tsx:148`; ticket guard against late frames | `focusRowOverflow`, `focusRowStripSource` | 0 loop errors vs 34 pre-fix (721 samples, 34 sizes) |
| G-48-12a Tab ring under resting pointer (WR-02) | 48-16 (`0c3d2ad23`, `a0a3211f1`) | `helpers/inputModality.ts` `KEYBOARD_NAV_CLASS`, installed from `src/frontend/index.tsx`; `GameCard/index.css` scopes the stale-focus suppression with `:not(.keyboardNav)` (lines 129, 365, 560) and adds the parked-cursor rule (line 162) | `inputModality.test.ts`, `gameCardFocusRing.test.ts` | 40/40 and 41/41 captures one ringed tile |
| G-48-11c empty-grid strip +2px | 48-17 (`d77571f9c`) | `StripLayoutContext`, `readScrollerAllowance`, `FLIP_WINDOW_MS` in `focusRowOverflow.ts`; `gridShown` prop and ref in `FocusRowStrip/index.tsx:44-96`; `Library/index.tsx:1165` | `focusRowOverflow`, `focusRowStripSource`, `librarySyncNoticeSource` | 355 vs 355 px, 10/10 captures, list layout, one-result search |
| G-48-8a, G-48-11d, G-48-12b | 48-18 plus operator session | no code change (G-48-11d is the baseline rule `.gameCard.gamepad > .icons > .svg-button { display: none }`) | n/a | UAT items 11 and 12, operator, Windows 11, controller |

Plans 48-15 and 48-18 are live-gate plans (no source change); their evidence lives in `48-UAT.md` and `evidence/48-13`, `48-14`, `48-16`, `48-17`.

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| FocusRowStrip cards | `selectFocusRowGames(...)` | library state, `games.recent`, `customCategories` | Yes | FLOWING |
| Strip card width | `--focus-row-card-width` | track rect, computed list padding/gap and, when no grid, the scroller allowance through `gridColumnWidth` | Yes (156px is only the pre-measurement fallback) | FLOWING |
| `gridShown` | `libraryToShow.length > 0 && (!refreshing or refreshingInTheBackground) && layout === 'grid'` | Library state | Yes | FLOWING |
| Keyboard mode | `body.keyboardNav` | trusted Tab keydown / real pointer events | Yes | FLOWING |
| Context `focusRow` | mirror seed, else migrated `requestAppSettings()` | config store | Yes (UAT item 3) | FLOWING |

### Behavioral Spot-Checks and Automated Checks

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Phase suites | `npx jest FocusRowStrip FilterFocusRow themeTokens GameCard focusRowMigration GlobalStateFocusRowHydration focusRowFirstLaunchHydration inputModality` | 13 suites, 392 tests passed | PASS |
| Type check | `npx tsc --noEmit` | no output, clean | PASS |
| Grid files untouched | `git diff --stat 752b510f8 HEAD -- Library/index.css GamesList/index.tsx` | empty | PASS |
| R6 grep | `git grep -il maxRecentGames -- src` | 0 hits | PASS |
| Debt markers | added lines in the phase diff of FocusRowStrip, inputModality, GameCard, FilterFocusRow matching TBD/FIXME/XXX | none | PASS |
| UAT file | `48-UAT.md` status complete, summary 12/12/0/0/0/0, every Gaps entry resolved | consistent with per-item results | PASS |
| Full `npm test` | not run (about 40 suites fail on this Windows machine independent of any change; CI is ubuntu-only) | n/a | accepted, per instruction |
| Lint, prettier | not re-run; executors reported clean | n/a | accepted |

Probes: none declared (Step 7c not applicable).

### Requirements Coverage

| Requirement | Source Plans | Status |
|-------------|--------------|--------|
| R1 | 48-02, 48-07, 48-08 | SATISFIED |
| R2 | 48-01, 48-03, 48-08, 48-11 | SATISFIED |
| R3 | 48-01, 48-02, 48-04, 48-08 through 48-18 | SATISFIED, parity and chevron reach now live-proven |
| R4 | 48-02, 48-17, 48-18 | SATISFIED |
| R5 | 48-02 | SATISFIED |
| R6 (amended) | 48-06, 48-08 | SATISFIED |
| R7 | 48-05, 48-07, 48-08 | SATISFIED (one override) |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `48-UI-SPEC.md:319` | "Semi-transparent dark scrim" survives | Info | Documentation drift (advisory) |
| `focusRowOverflow.test.ts` S1 | fixture comment cites superseded 12px padding | Info | Test only |
| `config.ts` | `libraryTopSection: 'disabled'` kept in factory defaults | Info | Intentional migration source |

No stub, placeholder or empty-implementation patterns in files touched this round; no unreferenced TBD/FIXME/XXX.

## Human Verification Required

None. Every item of the previous report's human list is closed by a recorded live pass: chevron reach (UAT 9), parity and resize (UAT 11), contrast (UAT 10), controller handoff and ring (UAT 12), end-of-travel and narrow width (UAT 5, 6, 11).

## Gaps Summary

No requirement R1-R7 fails, no must-have is FAILED or behavior-unverified, and the UAT is complete with 12 of 12 passing and every recorded gap resolved. Status is `passed`. Remaining items are advisory only: the code review predates the 48-14/16/17 code, the UI-SPEC chevron wording is stale, seven info-level review findings are open, and parity was measured numerically on WebKit but only by eye on Windows WebView2. The `covered_digest` could not be generated because the installed tooling does not expose `verification.fingerprint`.

---

_Verified: 2026-10-09_
_Verifier: Claude (gsd-verifier)_
