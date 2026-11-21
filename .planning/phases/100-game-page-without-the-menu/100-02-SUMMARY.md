---
phase: 100-game-page-without-the-menu
plan: 02
subsystem: ui
tags: [react, game-page, left-card, favourites, categories, hide, themes, contrast, i18n]

requires:
  - phase: 100-game-page-without-the-menu
    provides: "plan 01's --fav theme token and the CONTEXT D-01/D-08/D-09/D-14/D-22 decisions"
provides:
  - "FavouriteHeart beside the game title (aria-pressed, constant 'Favourite' name, --fav when on)"
  - "LibraryRow: outlined category chips with tag icon and hover/focus x, dashed '+ Category' / '+ Add to Category' opener, quiet Hide toggle"
  - "CategoryPopover: checklist of every category plus 'New category…' create-and-assign that stays open"
  - "categoryName.ts: validateNewCategoryName, categoryKeyFor, assignedCategories (pure, tested without mocks)"
  - "HiddenNotice with Unhide, mounted first inside .gameNotices"
  - "--leftcard-warning-text derived token with a 10-theme 4.5:1 contrast spec"
affects: [100-09, 100-10]

plan_head_before: d0b72d350e0bd06e95e4592d418d41ede94adde7
plan_head_after: b6f1c7926f1686985b3f2ebffe7e57ffce22c8ed

actuals:
  tokens: 9800
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Validate-before-write guard for a store setter that replaces (addCategory wipes an existing category), enforced by a source-order gate on the handler body"
    - "State shown by the control (aria-pressed) with a constant noun label; only the tooltip describes the action"
    - "Remove x hidden by opacity, never display, so it stays in the focus ring"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/LeftCard/FavouriteHeart.tsx
    - src/frontend/screens/Game/GamePage/components/LeftCard/LibraryRow.tsx
    - src/frontend/screens/Game/GamePage/components/LeftCard/CategoryPopover.tsx
    - src/frontend/screens/Game/GamePage/components/LeftCard/HiddenNotice.tsx
    - src/frontend/screens/Game/GamePage/components/LeftCard/categoryName.ts
    - src/frontend/screens/Game/GamePage/components/LeftCard/index.css
    - src/frontend/screens/Game/GamePage/components/LeftCard/__tests__/categoryName.test.ts
    - src/frontend/screens/Game/GamePage/components/LeftCard/__tests__/leftCardSource.test.ts
  modified:
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/index.css
    - src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - public/locales/en/gamelib.json
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "The title's bottom margin moved from the h1 to the new .titleRow wrapper so the heart centres on the title text rather than on the title plus its margin"
  - "--leftcard-warning-text is the warning token mixed 60% with --text-default; it cleared 4.5:1 in all 10 themes at that weight, so no theme-specific adjustment was needed"
  - "Category-name matching is exact after trim (case-sensitive), mirroring CategorySettings' own submit guard, so 'rpg' and 'RPG' stay distinct as they already are in the modal"

patterns-established:
  - "The popover's New category field shows an inline hint for an existing name and calls neither addCategory nor addToGame, so retyping a name can never empty that category"

requirements-completed: [D-01, D-08, D-09, D-14, D-22]

coverage:
  - id: D1
    description: "A heart right after the title toggles favourite; pressed/unpressed with the constant name 'Favourite', outline when off, --fav when on"
    requirement: D-01
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/LeftCard/__tests__/leftCardSource.test.ts#FavouriteHeart (D-01, D-22)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts#L6: the body reads meta, title, notices, description, time played"
        status: pass
    human_judgment: true
    rationale: "Heart size, alignment against the title and the 0.3 s pulse need a look in the running app across themes"
  - id: D2
    description: "Category chips are outlined with a tag icon (never filled like genre chips), x removes, dashed '+ Category' opens a checklist popover"
    requirement: D-08
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/LeftCard/__tests__/leftCardSource.test.ts#LeftCard/index.css: category chips (D-01)"
        status: pass
    human_judgment: true
    rationale: "Whether the chips read as the user's own labels beside the filled genre chips is a visual call"
  - id: D3
    description: "Create-and-assign from the popover: a blank or existing name never reaches addCategory, a new name creates and assigns in one step and the popover stays open"
    requirement: D-09
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/LeftCard/__tests__/categoryName.test.ts"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/LeftCard/__tests__/leftCardSource.test.ts#CategoryPopover: create-and-assign (D-09, T-100-04)"
        status: pass
    human_judgment: true
    rationale: "The jest project has no DOM, so the Enter key flow and the popover staying open are proven by source order only; a live press of Enter in the popover is owed"
  - id: D4
    description: "The game page never opens the per-game Categories modal"
    requirement: D-08
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/LeftCard/__tests__/leftCardSource.test.ts#LeftCard never opens the Categories modal (D-08)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Hide toggle at the row end (aria-pressed, constant label) and a hidden notice with Unhide; amber on state clears 4.5:1 in all 10 themes"
    requirement: D-01
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts#left card Hide toggle (--leftcard-warning-text)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/LeftCard/__tests__/leftCardSource.test.ts#Hide toggle and hidden notice (D-01)"
        status: pass
    human_judgment: true
    rationale: "The notice wording against the real card and whether the amber reads as 'on' rather than 'warning' are visual"
  - id: D6
    description: "The ⋮ menu still offers Favourites, Hide and Categories: GameSubMenu/index.tsx and DotsMenu.tsx are not edited"
    requirement: D-14
    verification:
      - kind: other
        ref: "git diff --name-only d0b72d350..HEAD -- src/frontend/screens/Game/GameSubMenu src/frontend/screens/Game/GamePage/components/DotsMenu.tsx (empty)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-11-21
status: complete
---

# Phase 100 Plan 02: Left card library row Summary

**Favourite heart beside the title, outlined category chips with a "+ Category" checklist popover whose "New category…" field creates and assigns in one step behind a validate-before-addCategory guard, and a quiet Hide toggle with a hidden-state notice**

## Performance

- **Duration:** about 25 min (start time was not captured; estimated from commit times)
- **Completed:** 2026-11-21T09:56:00Z
- **Tasks:** 3
- **Files modified:** 16 (8 created, 8 modified)

## Accomplishments

- A heart right after the h1 (`FavouriteHeart`): `aria-pressed`, constant accessible name "Favourite", outline in `--text-secondary` off, filled in the per-theme `--fav` on, with a 0.3 s pulse that is off under `prefers-reduced-motion`. It makes the same `favouriteGames.add/remove` calls the ⋮ menu makes, and stays visible when an art logo hides the h1.
- `LibraryRow` under the title: one outlined chip (transparent background, `--border-color` border, tag icon) per assigned category with a hover/focus × (hidden by opacity so it stays in the focus ring), a dashed `+ Category` chip (`+ Add to Category` when none), and the Hide toggle pushed to the row end.
- `CategoryPopover` (MUI Popover): a checkbox per category (tick assigns, untick removes) and a "New category…" field. Enter runs `validateNewCategoryName` then `addCategory` then `addToGame`, clears the field and leaves the popover open. A blank name does nothing; an existing name shows "That category already exists — tick it above." and calls neither setter, so retyping a name cannot empty a category (T-100-04). No LeftCard file references `openGameCategoriesModal`.
- `HiddenNotice` mounted first in `.gameNotices` (null when not hidden, so the container's `:empty` rule keeps it invisible) with an Unhide button.
- `--leftcard-warning-text` (warning token 60% mixed with `--text-default`, declared on `.mainInfoBody`) is measured at >= 4.5:1 against `--body-background` in all 10 themes, with an in-memory sabotage check proving the spec can fail.
- Plan-end gates green: full Frontend project (378 suites, 6539 tests), codecheck, lint (0 errors), find-deadcode, gameinfo-narrowing-ceiling, DI ceilings (0 frontend failures), `pnpm i18n` + i18n-churn-guard, and the Meta i18n suites.

## Task Commits

1. **Task 1: Tracer, Favourite heart** - `fd80593c1` (feat). Tracer feedback gate: default `human_verify_mode` with an automated-only `<verify>`, so the verify was re-run end to end, passed, and expansion continued.
2. **Task 2: Category chips and the popover** (TDD)
   - RED `95e75513c` (test) - both specs failed: `Cannot find module '../categoryName'` and the source gate could not read `CategoryPopover.tsx`
   - GREEN `6de001922` (feat)
3. **Task 3: Hide toggle, hidden notice, contrast spec** - `959343f4a` (feat); i18n scope bookkeeping `b6f1c7926` (chore)

**Plan metadata:** the docs(100-02) commit that carries this file.

## Decisions Made

- `.titleRow` owns the 0.8rem bottom margin that the h1 used to carry, so the heart centres on the title text.
- The new-category match is exact after trim and case-sensitive, matching `CategorySettings`' submit guard, so the page and the modal agree on what "exists" means.
- The popover uses MUI `Popover` (not the app Dropdown) as planned; it anchors to the "+ Category" chip's ref, which is set by the time the popover opens.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Heart would sit low against the title**
- **Found during:** Task 1
- **Issue:** The h1 carries `margin-bottom: 0.8rem`; inside a centring flex row the heart would centre on the title plus its margin, not on the text.
- **Fix:** Set the h1's `margin-bottom` to 0 and put the 0.8rem on `.titleRow`. Layout in the card is unchanged (the row ends where the h1's margin box did).
- **Files modified:** `src/frontend/screens/Game/GamePage/index.css` (not listed in the plan's `files_modified`), `LeftCard/index.css`
- **Verification:** gamePageActionDock source gates and the full Frontend project pass; a live look at the title row is owed.
- **Committed in:** `fd80593c1`

**2. [Rule 3 - Blocking] i18n scope bookkeeping split into its own commit**
- **Found during:** Task 3
- **Issue:** `pnpm gen-i18n-gate-scope` reads committed history (plan 01's finding), so the new files had to be committed before the generator would list them. The plan places this step inside Task 3.
- **Fix:** Committed Task 3's code first, then ran the generator (450 -> 455), hand-inserted the five paths into `meta/i18nGateScope.json` (327 -> 332, sorted, `generatedBy` extended) and updated the A0/A2/A3/A4 counts and history in `genI18nGateScope.test.ts`.
- **Committed in:** `b6f1c7926`

**3. [Rule 1 - Deviation in detail] Translation keys written with the `gamelib:` prefix**
- **Found during:** Task 1
- **Issue:** Plan 01's files use `useTranslation('gamelib')` with bare keys; this plan's text and its source gate name `gamelib:gamepage.leftCard.*`.
- **Fix:** Followed this plan (`useTranslation()` plus `t('gamelib:...', default)`); `pnpm i18n` extracts them into the same `gamepage.leftCard` group in `gamelib.json`.

**Other small differences:** `LibraryRow` takes `gameInfo` and `title` only in Task 3 (Task 2 needed no title); the source gate also covers `dangerouslySetInnerHTML` (T-100-05) across every LeftCard `.tsx`; `gamelib.json` carried no unrelated uncommitted hunks, so each task staged its own keys directly.

---

**Total deviations:** 3 auto-fixed (2 bug/detail, 1 blocking)
**Impact on plan:** None beyond one extra file touched (`GamePage/index.css`, one declaration). No ⋮ menu file changed.

## Issues Encountered

- The in-jest checks cannot render: Enter-in-popover, the popover staying open and the chip/heart appearance are proven by source order and CSS gates only. A live look is owed (see below).

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None. T-100-04 (validate before `addCategory`), T-100-05 (names render as React text; no `dangerouslySetInnerHTML` in LeftCard) and T-100-06 (`categoryKeyFor` builds the same `${appName}_${runner}` key as `CategorySettings`) are each covered by a test.

## Next Phase Readiness

- Plan 09 owns deleting ⋮: `GameSubMenu/index.tsx` and `DotsMenu.tsx` are untouched, so ⋮ still carries Favourites, Hide and Categories alongside the new left-card controls.
- Owed for plan 10's human UAT: a live look at the heart, chips, popover (create a category with Enter, retype an existing name, untick) and Hide/Unhide in at least midnightMirage, gruvbox_dark and dracula; and the title row alignment with and without an art logo.

## Self-Check: PASSED

- Created files exist on disk: LeftCard/{FavouriteHeart,LibraryRow,CategoryPopover,HiddenNotice}.tsx, categoryName.ts, index.css, and both tests.
- Commits `fd80593c1`, `95e75513c`, `6de001922`, `959343f4a`, `b6f1c7926` are ancestors of HEAD; `git rev-list --count d0b72d350..HEAD` = 5.
- Acceptance greps: `<FavouriteHeart` 1, `className="titleRow"` 1, `<LibraryRow` 1, `<HiddenNotice` 1 in `GamePage/index.tsx`; the five LeftCard paths are in `meta/i18nGateScope.json` (exit 0); `GameSubMenu/` and `DotsMenu.tsx` unchanged.

---
*Phase: 100-game-page-without-the-menu*
*Completed: 2026-11-21*
