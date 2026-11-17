---
phase: 64-ui-to-edit-themes
plan: 05
subsystem: ui
tags: [themes, gallery, svg-thumbnail, appearance, i18n]

requires:
  - phase: 64-02
    provides: "BUILTIN_TOKENS and builtinSeed (the frozen token map each built-in thumbnail is drawn from)"
  - phase: 64-04
    provides: "resolveThemeKey (decides the active card), settingsState customThemes slice, applyTheme behind window.setTheme"
  - phase: 64-01
    provides: "safeColour / normaliseColour (every thumbnail colour is sanitised through them)"
provides:
  - "thumbnailPalette.ts: token map -> sanitised ThumbnailPalette via the real consumer fallback chains, plus BASE_PREVIEW_OVERRIDES, BASE_OVERRIDDEN_TOKENS and PREVIEW_TOKENS"
  - "ThemeThumbnail: a 160x100 SVG mini-launcher drawn from real token values, no <text>"
  - "ThemeCard / ThemeGallery: the Built-in group of 10 cards, click applies, active card marked"
  - "ThemeSelector now renders the gallery; the dropdown and #theme_selector are gone"
  - "Appearance layout: full-width (960px) gallery block above the 513px controls column"
  - "customThemes.active / builtInReadOnly / groupBuiltIn en strings"
affects: [64-06, 64-07, 64-08, theme gallery, theme editor preview]

actuals:
  tokens: 21000
  tasks: 3
  commits: 5
plan_head_before: 09c37f70c80622cbaccdedaab66577fc24470aaf
plan_head_after: 72cbdcf49de532f5eb55ebed0442dbc4e16464fb

tech-stack:
  added: []
  patterns:
    - "Thumbnail colours resolve through the same fallback chains the consumer CSS uses, then safeColour; an invalid value draws the base built-in's colour for that element, never the raw text"
    - "Base-theme nested CSS rules that beat the generic chains are mirrored in one declarative table (BASE_PREVIEW_OVERRIDES) and pinned by a source-text test against themes.scss"
    - "Gallery markup avoids bare span/label (Accessibility forces those to --text-xl !important); transitions rely on the app-wide body:has(.disableAnimations) rule"

key-files:
  created:
    - src/frontend/customThemes/thumbnailPalette.ts
    - src/frontend/components/UI/ThemeSelector/ThemeThumbnail.tsx
    - src/frontend/components/UI/ThemeSelector/ThemeCard.tsx
    - src/frontend/components/UI/ThemeSelector/ThemeGallery.tsx
    - src/frontend/components/UI/ThemeSelector/index.scss
    - src/frontend/customThemes/__tests__/thumbnailPalette.test.ts
    - src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx
    - src/frontend/components/UI/ThemeSelector/__tests__/ThemeGallery.test.tsx
  modified:
    - src/frontend/components/UI/ThemeSelector/index.tsx
    - src/frontend/screens/Accessibility/index.tsx
    - src/frontend/screens/Accessibility/index.css
    - public/locales/en/gamelib.json
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "An invalid or half-typed token value falls back to the BASE built-in's value for the same element (via builtinSeed), then to #00000000, so a draft never draws raw text and never goes blank"
  - "The active-card ring is a 1px accent border plus an inset 1px accent shadow (2px visible, no layout shift); hover uses :has(.themeCard__apply:hover) so the action row does not trigger it"
  - "Nord Light's selected-tab label (NavTabs, var(--accent)) is deliberately not mirrored, per UI-SPEC OD-2; the active-tab label stays on the --navbar-active chain"

requirements-completed: [THEME-01]

coverage:
  - id: T1
    description: "The Appearance screen shows a gallery of the 10 built-in themes in defaultThemes order, each with a lock cue; clicking a card applies it; the active card carries aria-current; the dropdown id is gone"
    requirement: THEME-01
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/ThemeSelector/__tests__/ThemeGallery.test.tsx#ThemeSelector gallery"
        status: pass
    human_judgment: false
  - id: T2
    description: "Each thumbnail is drawn from the theme's real tokens through the consumer fallback chains; Dracula's navbar paints from its own token; a half-typed or hostile value draws the fallback and never reaches the markup"
    requirement: THEME-01
    verification:
      - kind: unit
        ref: "src/frontend/customThemes/__tests__/thumbnailPalette.test.ts#thumbnailPalette consumer fallback chains"
        status: pass
      - kind: unit
        ref: "src/frontend/customThemes/__tests__/thumbnailPalette.test.ts#thumbnailPalette sanitising"
        status: pass
      - kind: unit
        ref: "src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx#never lets a hostile token value reach the markup"
        status: pass
    human_judgment: false
  - id: T3
    description: "Nord Light thumbnails draw the success button #81a1c1 with --text-default labels and primary text in --text-default, pinned by a source-text test against body.nord-light"
    requirement: THEME-01
    verification:
      - kind: unit
        ref: "src/frontend/customThemes/__tests__/thumbnailPalette.test.ts#Nord Light base overrides (OD-2)"
        status: pass
    human_judgment: true
    rationale: "The pin proves the override table matches themes.scss text; whether the thumbnail matches the real Nord Light buttons in the running app is a live visual check (Plan 10)"
  - id: T4
    description: "Gallery visual contract on the real Appearance screen: 208px auto-fill grid, active ring, focus ring, 48px gap above the controls column, legible on midnightMirage, gruvbox_dark and dracula"
    requirement: THEME-01
    verification:
      - kind: unit
        ref: "src/frontend/screens/Accessibility/__tests__/windowSettingsPlacement.test.ts#both render after ThemeSelector and inside the provider-wrapped page body"
        status: pass
    human_judgment: true
    rationale: "jsdom has no layout or paint; the grid, ring and the three-theme survival check are verified live in Plan 10's UAT"

duration: 10min
completed: 2026-11-18
status: complete
---

# Phase 64 Plan 05: Theme gallery with real-token thumbnails Summary

**The Appearance dropdown is replaced by a gallery of SVG thumbnails drawn from each built-in theme's own token values (consumer fallback chains, `safeColour`-sanitised, Nord Light's base-owned buttons mirrored), where clicking a card applies it and the active card is marked.**

## Performance

- **Duration:** about 10 min of wall time (557 s from the commit ledger to the SUMMARY)
- **Started:** 2026-11-17T19:30:56Z
- **Completed:** 2026-11-17T19:41:00Z
- **Tasks:** 3 (one tracer, one TDD, one auto)
- **Files modified:** 15 (8 new, 7 modified)

## Accomplishments

- Task 1 (tracer): `thumbnailPalette`, `ThemeThumbnail`, `ThemeCard`, `ThemeGallery`; `ThemeSelector` renders the gallery and the `SelectField`/`MenuItem` dropdown with its `#theme_selector` id is gone. The jsdom test proves 10 cards in `defaultThemes` order inside the group named "Built-in", `aria-current` on the stored theme only, click sets the theme and calls `window.setTheme`, and Dracula's tab-bar fill equals its `--navbar-background` and differs from its body fill. `windowSettingsPlacement.test.ts` still passes. The tracer was verified end to end (jest, codecheck, prettier) before any expansion.
- Task 2 (TDD): consumer chains pinned case by case (inactive labels, active label, search fill and stroke, success and danger fallbacks), sanitising (`#12`, `var(--x)`, `"/><script>`, free text all draw the base colour; the raw text is absent from palette and markup), and `BASE_PREVIEW_OVERRIDES` / `BASE_OVERRIDDEN_TOKENS` / `PREVIEW_TOKENS` for Plan 08. A source-text pin reads `themes.scss` through `stripSourceComments` and `cssBlock` and asserts both nord-light button rules.
- Task 3: gallery styles (208px auto-fill grid, active inset ring, focus ring, logical properties only), the Appearance layout (gallery block up to 960px above the 513px column, 48px apart), the three en strings, and the gate scope for the four new modules.

## TDD Gate Compliance

| Task | RED commit | GREEN commit |
| ---- | ---------- | ------------ |
| 2 | `1adc9c32f` test(64-05): add failing tests for Nord Light thumbnail base overrides | `4aabc02e9` feat(64-05): thumbnails honour Nord Light base-owned button colours |

RED evidence: run directly with jest, 6 tests failed of 24 in the two new suites. The target, `draws the success button #81a1c1 whatever --success-button holds`, failed on its assertion (`Expected: "#81a1c1"`, `Received: "#ff0000"`); the Nord Light markup test failed on the same value; the override-table, `BASE_OVERRIDDEN_TOKENS` and `PREVIEW_TOKENS` tests failed with `TypeError: Cannot read properties of undefined` because those exports did not exist yet (no ts-jest diagnostic stopped the suites, so the tests ran). The 18 chain, sanitising, and markup tests passed because Task 1's tracer already implemented the generic chains. Semantic assessment: every failure was the planned behaviour being absent (the override and its exports), none a load, syntax or fixture fault. `gsd_run check tdd-red-evidence` was tried once and returned `INVALID_RED (invalid_record)` because jest's report is not one of its supported formats (TAP, JUnit XML, go test, swift-testing, unittest) and no jest-junit/TAP reporter is installed; this plan is `type: execute` (not `type: tdd`) and the repo does not run with `workflow.tdd_mode`, so the classifier is advisory here and the assessment above stands in. Pin non-vacuity was checked by applying the test's own regexes to a mutated copy string: changing `#81a1c1` or `--text-default` in the fixture text fails the match. No REFACTOR commit was needed.

## Task Commits

1. Task 1 (tracer): `6c17bb22e` feat(64-05): theme gallery with real-token thumbnails replaces the dropdown
2. Task 2 RED `1adc9c32f`, GREEN `4aabc02e9`
3. Task 3: `1de1da1cd` feat(64-05): gallery visual contract, full-width Appearance layout and en strings
4. Gate scope: `72cbdcf49` chore(64-05): record the theme gallery modules in the i18n gate scope

`actuals.commits: 5` is the measured `rev-list --count` from the ledger base; all five are this plan's own commits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `genI18nGateScope.test.ts` count pins**
- **Found during:** Task 3 (gate scope)
- **Issue:** The test pins the hand-curated scope at 298 files and the fork-touched set at 419; adding the four modules (302 / 423) turns it red. The plan did not list the file.
- **Fix:** Updated the pins and added the dated log paragraph, following the 64-02 and 64-04 precedent; appended a `generatedBy` clause to `i18nGateScope.json`.
- **Files modified:** `meta/__tests__/genI18nGateScope.test.ts`, `meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json`
- **Commit:** `72cbdcf49`

**2. [Plan premise already met] `export { defaultThemes }` from `ThemeSelector/index.tsx`**
- **Found during:** Task 1
- **Issue:** The plan says to keep `export { defaultThemes }`, but 64-04 already removed that dead re-export (it had no importer and tripped knip).
- **Fix:** None needed; `index.tsx` keeps the `ThemeSelector` named export only, which is all `windowSettingsPlacement.test.ts` and `Accessibility/index.tsx` use.

**3. [Rule 2 - Missing critical] Sanitising fallback is the base theme's value, not a bare transparent**
- **Found during:** Task 1
- **Issue:** The plan says each chain result goes through `safeColour(value, fallback)` with `#00000000` as the last resort. A half-typed draft in the editor (Plan 07) would then punch a transparent hole in the preview.
- **Fix:** The fallback for each element is the base built-in's value for the same chain (`builtinSeed(base)`), with `#00000000` only when the base has none. Matches UI-SPEC's "draws the previous good value".
- **Files modified:** `src/frontend/customThemes/thumbnailPalette.ts`
- **Commit:** `6c17bb22e`

**Total deviations:** 3 (1 Rule 3, 1 Rule 2, 1 plan premise already satisfied). **Impact:** none on the delivered contract.

## Auth Gates

None.

## Issues Encountered

- Verification results: `pnpm codecheck` exit 0; `pnpm lint:src` exit 0 (0 errors, ratchet PASS); jest over `ThemeSelector`, `customThemes` and `screens/Accessibility` 231 passed, plus `meta/__tests__/genI18nGateScope.test.ts`, `hardcodedStringGate.test.ts` and `gamelibCatalogParity.test.ts` passing; `pnpm find-deadcode` prints only the two pre-existing `NativePort*` findings; prettier is clean over every non-ignored written path (`public/locales/en/gamelib.json` is prettier-ignored, so its shape was hand-matched: 4-space indent, alphabetical position between `consoleMode` and `discounts`, keys sorted).
- Known pre-existing failures left alone: the `pnpm planning-gates` preload-surface-gate (phase-81 channels) and the two `NativePort*` knip findings. `public/locales/en/gamelib.json` was clean at the start, so no foreign hunks were staged.
- Live, not provable in jsdom (owed to Plan 10): the gallery on a real WKWebView in midnightMirage, gruvbox_dark and dracula, the active ring and focus ring appearance, Appearance layout at narrow widths, the Nord Light thumbnail against the real Nord Light buttons, and a visual reconcile of the thumbnail geometry against the 2026-11-05 artifact (UI-SPEC says the artifact could not be opened). Operator UAT can drive themes from the console through `window.setTheme(key)` and the `data-theme-key` on each card.

## Known Stubs

None. The gallery has only the Built-in group; the "Your themes" group and the card action row (`ThemeCard`'s `actions` slot, currently unused) are Plan 06's scope, not stubs of this plan's goal.

## Threat Flags

None. The only new trust boundary (token values to SVG attributes, T-64-15) is mitigated and tested as planned.

## Self-Check: PASSED

- Files: `thumbnailPalette.ts`, `ThemeThumbnail.tsx`, `ThemeCard.tsx`, `ThemeGallery.tsx`, `index.scss` and the three test files all present.
- Commits: `6c17bb22e`, `1adc9c32f`, `4aabc02e9`, `1de1da1cd`, `72cbdcf49` all ancestors of HEAD.
