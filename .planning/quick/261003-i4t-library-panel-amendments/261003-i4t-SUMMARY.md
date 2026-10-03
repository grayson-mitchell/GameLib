---
phase: 261003-i4t
plan: 01
subsystem: ui
tags: [react, i18next, fontawesome, localization, tauri]

# Dependency graph
requires: []
provides:
  - Games tier-2 filter panel's utilities row collapsed from two rows/three button idioms into one six-icon row (console mode, layout toggle, sort A-Z, sort by status, alphabet filter, tour)
  - Sort-by-status glyph badge (faHardDrive + conditional faCircleXmark) replacing the latched FormControl tile fill
  - Icon-only AddGameButton variant, placed at the left of the footer row ahead of the count pill
  - Localized "N games" / "N of M games" count pill in all 49 gamelib.json catalogues
  - Footer row reading plus / count / refresh / Steam-sync-spinner, left to right
affects: [any future Header/index.tsx or AddGameButton change, any future LibraryTour.tsx step reorder, any future gamelib.json library.header key]

# Actuals (#2632)
actuals:
  tokens: 16298
  tasks: 3
  commits: 3
plan_head_before: dd3923372f5788620caafb9e570e63ee0b60ecbc
plan_head_after: 1cbc0494c8e9d478848f1d36fd9b7fbbeeec9415

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composed FontAwesome badge: a position:relative wrapper span holding a base glyph plus a conditionally-rendered, absolutely-positioned smaller glyph, punched out with the panel's own background token so the halo matches every theme by construction (no fa-layers/mask precedent existed in this codebase)."
    - "Icon-only button variant via an opt-in boolean prop (iconOnly?: boolean) that swaps a text child for a FontAwesomeIcon and moves the accessible name to aria-label/title, leaving the no-prop render path byte-identical for existing inline-sentence call sites."
    - "Non-pluralized count-with-noun i18n key, interpolated on {{shown}}/{{total}} (never the i18next-reserved {{count}}), hand-derived per locale from two existing in-repo parallels (the noun from one key, the word order from a sibling key) rather than left stale or machine-filled."

key-files:
  created: []
  modified:
    - src/frontend/components/UI/Header/index.tsx
    - src/frontend/components/UI/Header/index.css
    - src/frontend/components/UI/FormControl/index.css
    - src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx
    - src/frontend/screens/Library/components/AddGameButton/index.tsx
    - src/frontend/screens/Library/components/AddGameButton/index.css
    - src/frontend/screens/Library/components/LibraryTour.tsx
    - src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx
    - src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts
    - public/locales/en/gamelib.json
    - public/locales/*/gamelib.json (all 48 non-English catalogues)

key-decisions:
  - "D-01..D-13 as specified in the plan: one six-icon row in a stated order; sort-by-status gets an x-badge not a tile fill; Add Game becomes a left-placed icon-only plus button; count reads '394 games'/'12 of 394 games'; refresh sits right of the count; badge composed inline with no new component file; FormControl/index.css reverted byte-for-byte to its pre-9ddee2792 state; tour steps swapped to walk the footer left-to-right; all 48 non-English filteredOfTotal values rewritten, never left stale."
  - "Two un-anticipated structural tests broke as a direct, in-scope consequence of this plan's own edits and were re-pointed (never deleted): libraryTourAnchors.test.tsx's full tour-step-order contract (broken by the D-11 swap) and libraryHeaderVisibility.test.tsx's literal-default source gate (broken by D-05's new default string). Both are outside the plan's three named target suites (headerTourAnchors, navTourAnchorCensus, tier2Portal) — the plan's own D-11 measurement checked only navTourAnchorCensus.test.ts, which is uniqueness-only and does not pin order."

patterns-established:
  - "When a plan's verify block names specific target suites, still run the full Frontend suite once before committing a task that touches shared state (tour step order, a translated string's literal default) — a narrower, unrelated test can hard-code the exact thing being changed."

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06]

coverage:
  - id: D1
    description: "Games panel utilities row collapsed into one six-icon row in the stated order, with no FormControl segmented group surviving anywhere in the component"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx"
        status: pass
    human_judgment: true
    rationale: "The structural shape (child count, control order, zero FormControl elements) is unit-tested, but the visual result — spacing, alignment, icon weight parity across themes — has no automated renderer in this repo (testEnvironment: node, no jsdom/CSS engine) and is OUTSTANDING per the plan's own measurement."
  - id: D2
    description: "Sort-by-status signals its ON state with a small x badge on its own glyph instead of a filled tile, keeping aria-pressed"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx"
        status: pass
    human_judgment: true
    rationale: "aria-pressed and the conditional badge element are unit-tested; the badge's visual legibility/contrast across the 11 theme blocks (D-07/D-08) is OUTSTANDING and requires the three-theme live visual check named in the plan."
  - id: D3
    description: "Add Game is an icon-only plus button at the left of the footer row, before the count pill"
    requirement: "D-03,D-04"
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx (D-04/D-06 order test)"
        status: pass
    human_judgment: true
    rationale: "Source order and the iconOnly prop are unit-tested; the plus button's visual weight/contrast against GameCard's reference idiom is OUTSTANDING, no pixel renderer in this repo."
  - id: D4
    description: "Count pill reads '394 games' unfiltered / '12 of 394 games' filtered, localized across all 49 catalogues"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts (literal key/default source gates)"
        status: pass
      - kind: other
        ref: "python3 JSON-validity + placeholder-presence check over all 49 public/locales/*/gamelib.json (inline in Task 3 verify block) — ALL 49 OK"
        status: pass
      - kind: integration
        ref: "pnpm lint-translations (7435 findings, 0 hard failures); pnpm test --selectProjects Meta -- gamelibCatalogParity i18nCatalogChurnGuard (208/208 passing)"
        status: pass
    human_judgment: true
    rationale: "Presence, placeholder-parity and JSON validity are machine-checked for all 49 catalogues, but translation ACCURACY for the 47 locales this agent does not natively read was hand-derived from two in-repo parallels per D-13, not verified by a bilingual reviewer — lint-translations' green is presence/parity only, not a claim of correctness."
  - id: D5
    description: "Refresh button and its Steam-sync-spinner sibling sit to the right of the count pill in the footer row"
    requirement: "D-06"
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx (D-04/D-06 order test)"
        status: pass
    human_judgment: false

# Metrics
duration: ~45min (across two sessions, split by a context compaction; measured from first task commit 13:30:57 to last task commit 13:44:19 NZT plus this session's Task 3 implementation and deviation-fix work)
completed: 2026-10-03
status: complete
---

# Phase 261003-i4t: Library Panel Amendments Summary

**Collapsed the Games tier-2 panel's two-row, three-idiom utilities into one six-icon row, swapped sort-by-status's tile fill for an x-badge, made Add Game an icon-only plus button, and localized "N games"/"N of M games" across all 49 catalogues.**

## Performance

- **Duration:** ~45 min of active commit-spanning work (see `duration` note above — this execution spanned a context compaction, so wall-clock elapsed time is longer than commit-timestamp span)
- **Tasks:** 3/3 completed
- **Files modified:** 58 (9 source/test files, 49 locale catalogues)
- **Commits:** 3 (measured via `git rev-list --count dd39233..HEAD`)

## Accomplishments

- One six-icon row (console mode, layout toggle, sort A-Z, sort by status, alphabet filter, tour), dissolving the FormControl segmented group entirely so all six controls share one button idiom (D-01).
- Sort-by-status now renders a composed badge (`faHardDrive` + conditional `faCircleXmark`, punched out with `--navbar-background`) instead of a latched tile fill, keeping `aria-pressed` as the sole non-visual state carrier (D-02, D-07, D-08, D-09).
- `FormControl/index.css` reverted byte-for-byte to its pre-9ddee2792 combined `:active, .active` rule now that the tile fill has no remaining consumer (D-10).
- `AddGameButton` gained an opt-in `iconOnly` variant (plus glyph, `aria-label`/`title` carrying the existing `add_game` string) and moved to the left of the footer row, ahead of the count pill; `EmptyLibrary`'s inline-sentence usage is untouched (D-03, D-04).
- Footer row now reads plus / count / refresh / Steam-sync-spinner left to right; `LibraryTour`'s `library-add-game` and `library-refresh` steps were swapped to match, with the anchor manifest itself unchanged (D-06, D-11).
- The count pill resolves through `tGamelib` on both branches now: a new `library.header.totalGames` key (`'{{total}} games'`) for the unfiltered reading, and `library.header.filteredOfTotal`'s default changed to `'{{shown}} of {{total}} games'` for the filtered reading. Both keys are filled, non-empty, and placeholder-correct in all 49 `gamelib.json` catalogues, with all 48 non-English `filteredOfTotal` values rewritten (not left stale) to carry the noun in each locale's own word order (D-05, D-12, D-13).

## Task Commits

Each task was committed atomically:

1. **Task 1: One row of six icons, end to end** - `b6b685cb9` (feat)
2. **Task 2: Icon-only plus button, left of the count, and the tour step that follows it** - `785c8b885` (feat)
3. **Task 3: "games" on the count, in all 49 catalogues** - `1cbc0494c` (feat)

No separate plan-metadata commit was made per this execution's explicit constraint: the orchestrator handles the docs commit (SUMMARY.md, STATE.md) separately, and ROADMAP.md is deliberately not touched for quick tasks.

## Files Created/Modified

- `src/frontend/components/UI/Header/index.tsx` - Collapsed utilities row, badge composition, footer reorder, both count-pill branches now keyed
- `src/frontend/components/UI/Header/index.css` - Removed dead `Header__utilitiesRight`/`Header__sortRow` rules, added `Header__statusGlyph`/`Header__statusGlyphBadge`, removed `.numberOfgames`'s now-wrong `margin-inline-start`, extended `tabular-nums` to the base pill
- `src/frontend/components/UI/FormControl/index.css` - Reverted to pre-9ddee2792 combined `:active, .active` rule
- `src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx` - Re-pointed four structural assertions to the five-child/six-control shape; added a D-04/D-06 footer-order test
- `src/frontend/screens/Library/components/AddGameButton/index.tsx` - Added `iconOnly?: boolean` prop
- `src/frontend/screens/Library/components/AddGameButton/index.css` - Added additive `.sideloadGameButton--iconOnly` modifier
- `src/frontend/screens/Library/components/LibraryTour.tsx` - Swapped `library-add-game`/`library-refresh` step order
- `src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx` - Re-pointed `EXPECTED_ELEMENTS` to the swapped step order (deviation, see below)
- `src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts` - Re-pointed the stale literal-default source-gate assertion; added a matching gate for the new `totalGames` key (deviation, see below)
- `public/locales/en/gamelib.json` - Added `totalGames`, rewrote `filteredOfTotal`'s default to include "games"
- `public/locales/{ar,az,be,bg,br,bs,ca,cs,da,de,el,es,et,eu,fa,fi,fr,ga,gl,he,hr,hu,id,it,ja,ka,ko,lt,ml,nb_NO,nl,pl,pt,pt_BR,ro,ru,sk,sl,sr,sv,ta,th,tr,uk,uz,vi,zh_Hans,zh_Hant}/gamelib.json` - Added `totalGames`, rewrote `filteredOfTotal` (48 catalogues, hand-derived per D-13)

## Decisions Made

All of D-01 through D-13 as specified in the plan (see `key-decisions` in frontmatter for the condensed form). No decision was narrowed or widened from the plan's prescription. Two notable implementation choices made where the plan left room:

- **`.numberOfgames`'s `margin-inline-start` was REMOVED**, not kept. It was written for a count pill that sat first in the footer row; with the icon-only `AddGameButton` now ahead of it, `Header__footerRow`'s own `gap` spaces all three items evenly, and restating a start margin would have double-spaced the pill against that gap. This matches the plan's own stated default ("Remove it ... or state in the SUMMARY why it was kept") — it was removed.
- For Task 3's Group-B languages (az, ja, ko, ml, ta, tr, uz, zh_Hans, zh_Hant — the nine locales whose existing `filteredOfTotal` puts `{{total}}` before `{{shown}}`), the "games" noun was inserted immediately after `{{total}}` rather than at the string's end, preserving each locale's existing grammatical attachment point rather than mechanically appending to the tail.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `libraryTourAnchors.test.tsx`'s hardcoded step-order contract, broken by the D-11 tour-step swap**
- **Found during:** Task 2, after running the full `pnpm test --selectProjects Frontend` suite beyond the plan's three named target suites
- **Issue:** This test independently hard-codes the LibraryTour component's full ordered step list (`EXPECTED_ELEMENTS`) and still reflected the pre-swap order (`library-refresh` before `library-add-game`). The plan's own D-11 measurement checked `navTourAnchorCensus.test.ts` (uniqueness-only, pins no order) and concluded anchors could move freely — it did not catch this second, independent test file, which is outside the plan's three named target suites.
- **Fix:** Updated `EXPECTED_ELEMENTS` to the new swapped order and added a comment explaining the 261003-i4t change, so the contract documents why the order changed rather than silently reflecting it.
- **Files modified:** `src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx`
- **Verification:** Full `pnpm test --selectProjects Frontend` returned to green (182/182 suites) immediately after this fix.
- **Committed in:** `785c8b885` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed `libraryHeaderVisibility.test.ts`'s stale literal-default source gate, broken by Task 3's new default string**
- **Found during:** Task 3, after re-running the full Frontend suite as a final check (the same discipline that caught deviation #1)
- **Issue:** This source-gate test asserts the exact literal string `'{{shown}} of {{total}}'` appears, unstripped, in `Header/index.tsx`'s source — pinning the pre-Task-3 default. It is outside the plan's three named target suites for both Task 2 and Task 3's verify blocks.
- **Fix:** Updated the assertion to the new literal `'{{shown}} of {{total}} games'`, added a new test pinning the new `totalGames` key's literal key/default pair (the gate's whole purpose — proving i18next-parser can statically resolve both calls), and corrected one test's description string that had gone stale ("renders exactly what it renders today" no longer describes the unfiltered branch, which now also resolves through `tGamelib`).
- **Files modified:** `src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts`
- **Verification:** Full `pnpm test --selectProjects Frontend` green at 182/182 suites, 3127/3127 tests; `pnpm codecheck` and `pnpm lint` (`production: PASS | tests: PASS`) re-run clean after the fix.
- **Committed in:** `1cbc0494c` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs directly caused by this plan's own edits to files these tests gate, surfaced only by running the full suite beyond the plan's named target suites; both are "re-point, never delete" fixes that preserve the original assertion's intent against the new, intended shape)
**Impact on plan:** Both fixes were necessary for correctness (a red CI suite is not shippable) and neither widened or narrowed any of D-01..D-13. No scope creep — both fixes are confined to test files that directly gate the exact lines this plan's tasks changed.

## Issues Encountered

None beyond the two deviations documented above. Every planned verify-block item across all three tasks passed on first or second attempt; no architectural question arose; no package install was needed; no authentication gate was hit.

## Outstanding / Not Covered By Any Automated Check

**The three-theme visual check (midnightMirage / gruvbox_dark / dracula) over the merged six-icon row, the D-07/D-08 x-badge and its `--navbar-background` punch-out, and the icon-only plus button is OUTSTANDING BY CONSTRUCTION.** `src/frontend/jest.config.js` runs `testEnvironment: 'node'` with no jsdom and no CSS engine, so nothing in this repo renders a pixel. No test anywhere in this plan's verify battery renders a pixel, and none is claimed to. This must be confirmed by a human looking at the running app in all three themes before this is considered visually shipped.

**`lint-translations`' green (7435 findings, 0 hard failures) is presence/placeholder-parity only, not a claim of translation accuracy.** All 48 non-English `filteredOfTotal` values were re-derived (not left stale) per D-12/D-13's method — the "games" noun taken from each locale's own `library.filterPanel.viewAll`, inserted at the word-order position that locale's existing `filteredOfTotal` already established. This agent is not a native speaker of 47 of these 48 languages; the derivation is a careful mechanical/linguistic best effort, cross-checked grammatically where this agent has reasonable confidence (noun case/number conventions for counted nouns in Slavic, Turkic, and CJK languages), but it has NOT been reviewed by a native or fluent speaker of any of the 48 locales. If precision on specific locales matters before shipping, route those catalogues through `pnpm machine-fill-gamelib` once its gateway-scoped key is available again, or a native-speaker review pass.

**No new stubs, no skipped tests, and no un-run `<verify>` line exist in this plan's scope** — every automated check named in the plan's three tasks and its overall `<verification>` section was run and passed; see the `coverage:` block above for the per-deliverable human_judgment split between what is unit-proven and what remains a live visual/linguistic check.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The panel is shippable as a code change. Before it is considered DONE end-to-end: (1) a human must look at the running app in midnightMirage, gruvbox_dark, and dracula themes to confirm the badge, the plus button, and the collapsed row read correctly; (2) if translation precision on any of the 48 locales is a concern, route that catalogue through a native-speaker or MT-provenance review — none of the 48 `filteredOfTotal` rewrites in this plan are MT-sourced or listed in any `.mt.json` sidecar, per the plan's own instruction to leave those sidecars untouched.

---
*Phase: 261003-i4t*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: `.planning/quick/261003-i4t-library-panel-amendments/261003-i4t-SUMMARY.md`
- FOUND commit: `b6b685cb9` (Task 1)
- FOUND commit: `785c8b885` (Task 2)
- FOUND commit: `1cbc0494c` (Task 3)
- FOUND: `src/frontend/components/UI/Header/index.tsx`
- FOUND: `src/frontend/screens/Library/components/AddGameButton/index.tsx`
- FOUND: `src/frontend/screens/Library/components/LibraryTour.tsx`
- FOUND: `public/locales/en/gamelib.json`
- FOUND: `public/locales/ja/gamelib.json`
