---
phase: 100-game-page-without-the-menu
plan: 03
subsystem: ui
tags: [react, game-page, play-time, status-line, left-card, store-link, i18n]

requires:
  - phase: 100-game-page-without-the-menu
    provides: "plan 02's LeftCard folder, index.css and leftCardSource.test.ts; CONTEXT D-01/D-14/D-17"
provides:
  - "playTimeSummary.ts: pure playTimeFacts, splitDuration, relativeTimeParts and the isStatusIdle predicate"
  - "usePlayTime hook: TimeContainer's data logic returning the status-line text and a first/last played tooltip"
  - "GameStatus play-time span (gameStatus__playTime) shown only while no long action runs"
  - "EditDetailsButton on the art band and StoreBadgeLink in the meta row"
  - "TimeContainer (and the then-unused SmallInfo) deleted"
affects: [100-09, 100-10]

plan_head_before: c750693b43d5468ded85d4bc92202f3a510bdfeb
plan_head_after: 8c3d729b112caafd0d01a6905aae07bb83ed781e

actuals:
  tokens: 14000
  tasks: 2
  commits: 7

tech-stack:
  added: []
  patterns:
    - "Pure facts module plus a thin hook: all arithmetic (duration split, relative time, idle predicate) is testable without React or a DOM"
    - "Hover-revealed control hidden by opacity only, with :focus-visible forcing it visible, so it stays in the focus ring"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/playTimeSummary.ts
    - src/frontend/screens/Game/GamePage/usePlayTime.ts
    - src/frontend/screens/Game/GamePage/__tests__/playTimeSummary.test.ts
    - src/frontend/screens/Game/GamePage/components/LeftCard/EditDetailsButton.tsx
    - src/frontend/screens/Game/GamePage/components/LeftCard/StoreBadgeLink.tsx
  modified:
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.redistSpinner.test.tsx
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts
    - src/frontend/screens/Game/GamePage/components/LeftCard/index.css
    - src/frontend/screens/Game/GamePage/components/LeftCard/__tests__/leftCardSource.test.ts
    - src/frontend/components/UI/index.tsx
    - meta/gameInfoNarrowingBaseline.json
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts
    - public/locales/en/gamelib.json
  deleted:
    - src/frontend/screens/Game/TimeContainer/index.tsx
    - src/frontend/screens/Game/TimeContainer/index.css
    - src/frontend/components/UI/SmallInfo/index.tsx
    - src/frontend/components/UI/SmallInfo/index.css

key-decisions:
  - "The footer line reads 'Played 12 h 40 m · last played 3 days ago'; a game with only a last-played date capitalises it ('Last played ...'), and no data at all reads 'Never played'"
  - "A total of 0 minutes is treated as no total (null), so a Steam game with 0 minutes and no last-played date reads 'Never played' rather than 'Played 0 m'"
  - "The play-time span carries its own inline colour (--text-secondary, non-italic) so it reads as secondary text beside the amber/italic status label, with no CSS file added to Task 1"

patterns-established:
  - "usePlayTime is called unconditionally among GamePage's top-level hooks and returns line null when the game is not installable"

requirements-completed: [D-01, D-14, D-17]

coverage:
  - id: D1
    description: "Idle footer status line appends 'Played 12 h 40 m · last played 3 days ago' (Steam uses its own playtime and last-played); tooltip carries first and last played; never-played reads 'Never played'"
    requirement: D-17
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/__tests__/playTimeSummary.test.ts"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.redistSpinner.test.tsx#GameStatus play time (D-17)"
        status: pass
    human_judgment: true
    rationale: "The wording, the dot separator against the amber italic label, and the tooltip dates need a look in the running app; the jest project has no DOM"
  - id: D2
    description: "Play time is hidden while any long action runs (single readout)"
    requirement: D-17
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/__tests__/playTimeSummary.test.ts#isStatusIdle"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.redistSpinner.test.tsx#shows only the action progress while a long action runs"
        status: pass
    human_judgment: false
  - id: D3
    description: "TimeContainer is deleted after its logic moved into usePlayTime, with its narrowing and i18n scope entries"
    requirement: D-17
    verification:
      - kind: other
        ref: "test ! -e src/frontend/screens/Game/TimeContainer/index.tsx; pnpm gameinfo-narrowing-ceiling PASS; i18nGateScope.json has no TimeContainer"
        status: pass
    human_judgment: false
  - id: D4
    description: "Edit details pencil on the art band opens Edit Game, or the install modal for a sideloaded game; hover/focus reveal by opacity"
    requirement: D-01
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/LeftCard/__tests__/leftCardSource.test.ts#EditDetailsButton (D-01)"
        status: pass
    human_judgment: true
    rationale: "Pencil placement over the art, its hover reveal and legibility across themes are visual; the click opening the real dialog is owed live"
  - id: D5
    description: "Store badge is an in-app NavLink with an arrow to the store page when a store URL exists; sideloaded games keep the plain badge"
    requirement: D-01
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/LeftCard/__tests__/leftCardSource.test.ts#StoreBadgeLink (D-01, T-100-08)"
        status: pass
    human_judgment: true
    rationale: "Whether the badge reads as a link and routes to the right store page needs a live click"
  - id: D6
    description: "The ⋮ menu still offers Edit Game and Store: GameSubMenu/index.tsx and DotsMenu.tsx are not edited"
    requirement: D-14
    verification:
      - kind: other
        ref: "git diff --name-only c750693b4..HEAD -- src/frontend/screens/Game/GameSubMenu src/frontend/screens/Game/GamePage/components/DotsMenu.tsx (empty)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-21
status: complete
---

# Phase 100 Plan 03: Play time in the footer, Edit details and the store link Summary

**Play time moves from the left-card block into the footer status line ("Played 12 h 40 m · last played 3 days ago", idle only, Steam's own figures for Steam games) with TimeContainer deleted, plus an "Edit details" pencil on the art band and the store badge as an in-app link with an arrow**

## Performance

- **Duration:** about 10 min (22:57 to 23:06 NZDT, estimated from commit times; start time was not captured in a persisted variable)
- **Completed:** 2026-11-21T10:06:20Z
- **Tasks:** 2
- **Files:** 5 created, 12 modified, 4 deleted

## Accomplishments

- `playTimeSummary.ts` (pure, one type-only import): `playTimeFacts` (Steam wins when given; empty or unparseable dates become null; 0 minutes is no total), `splitDuration`, `relativeTimeParts` (coarsest unit that is at least 1, negative for the past) and `isStatusIdle` over the 16 action flags.
- `usePlayTime` carries TimeContainer's state, its `fetchPlaytimeFromServer` effect (raise-only, deps `[status]`) and its Steam branch unchanged, and builds the localized line and tooltip. Returns a null line when the game is not installable.
- `GameStatus` appends the span only when `playTimeLine` is set, `isStatusIdle(is)` is true and there is no bottle-waiting entry, so during install, update, move, verify, sync, launch, play and uninstall the line shows only that action's progress.
- `EditDetailsButton` (art band, top right) reuses ⋮'s `handleEdit`: install modal for a sideloaded game, otherwise the Edit Game dialog. Revealed by `.gameArtBand:hover` or `:focus-visible` through opacity only.
- `StoreBadgeLink` replaces the meta row's plain badge with a `NavLink` to `/store-page?store-url=…` carrying the logo, store name and an `aria-hidden` arrow; sideloaded games and games with no URL keep the plain `.store-icon`. No `window.open` or external launch.
- Plan-end gates green: full Frontend project (380 suites, 6582 tests), Meta `genI18nGateScope` and `hardcodedStringGate`, codecheck, lint (0 errors), find-deadcode, gameinfo-narrowing-ceiling, DI ceilings (0 frontend failures), `pnpm i18n` and i18n-churn-guard.

## Task Commits

1. **Task 1: Tracer, play time in the footer status line, TimeContainer deleted** - `4ae914609` (feat). Tracer feedback gate: default `human_verify_mode` with an automated-only `<verify>`, so the verify steps were re-run end to end, passed, and expansion continued.
2. **Task 2: Edit details pencil and the store badge link** - `6d06f7b30` (feat); i18n scope bookkeeping `8c3d729b1` (chore)

**Plan metadata:** the docs(100-03) commit that carries this file.

`commits: 7` is the measured `git rev-list --count` over the plan's range. Three are this plan's; the other four (`6453ac05f`, `c72bb25cd`, `4d85125c5`, `8c4a9b66f`) are `quick-261121-vlo` commits that landed on `main` concurrently while this plan ran.

## Decisions Made

- The text is built from literal `t()` calls on the `gamelib` namespace (`gamepage.playTime.*`); a game with a last-played date but no total capitalises "last played" at the start of the line.
- Zero minutes means "no total", so a never-played Steam game reads "Never played".
- The span's colour (`--text-secondary`) and non-italic style are inline, matching the surrounding status `<p>`, because Task 1's file list carries no CSS file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] knip reported SmallInfo as newly unused**
- **Found during:** Task 1
- **Issue:** TimeContainer was SmallInfo's only user; `pnpm find-deadcode` failed on `SmallInfo/index.tsx` default and the `UI/index.tsx` re-export. The plan anticipated this and said to remove the dead code in this task.
- **Fix:** Deleted `components/UI/SmallInfo/index.tsx` and `index.css` and the re-export line. PopoverComponent was not reported (still used elsewhere).
- **Files modified:** `src/frontend/components/UI/SmallInfo/*` (deleted), `src/frontend/components/UI/index.tsx`
- **Commit:** `4ae914609`

**2. [Rule 1 - Deviation in detail] usePlayTime narrowing baseline is 1, not 2**
- **Found during:** Task 1
- **Issue:** The plan expected the ceiling to report 2 for usePlayTime.ts. Merging TimeContainer's two `asStoreGame` calls into one (the Steam branch now reads `.extra` once) gives a count of 1.
- **Fix:** Baselined 1 with the plan's reason text; `pnpm gameinfo-narrowing-ceiling` passes.
- **Commit:** `4ae914609`

**3. [Rule 3 - Blocking] i18n scope bookkeeping split into its own commit**
- **Found during:** Task 2
- **Issue:** `pnpm gen-i18n-gate-scope` reads committed history (plans 01 and 02's finding), so the new files had to be committed first.
- **Fix:** Committed Task 2's code, then ran the generator (455 -> 458), hand-edited `meta/i18nGateScope.json` (332 -> 335: four added, TimeContainer removed, `generatedBy` extended) and updated the A0/A2/A3/A4 counts and history comment in `genI18nGateScope.test.ts`.
- **Commit:** `8c3d729b1`

**Other small differences:** the new keys use the `gamelib:` prefix with `useTranslation()` (plan 02's convention), `EditDetailsButton` also reads `edit-game.title` from the `gamepage` namespace as planned, and the redist harness gained two cases with no new `jest.mock`.

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 detail)
**Impact on plan:** None on behaviour. No ⋮ menu file changed.

## Issues Encountered

- A `quick-261121-vlo` agent committed to `main` during this plan, which is why the measured commit count is 7 rather than 3. Nothing from it was staged or touched here.
- Four unrelated modified files (`LanguageSelector`, `ReportProblem`) appeared in the working tree mid-plan; they belong to that quick task and were never staged.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None. T-100-07 (the server playtime logic is moved unchanged and rendered as React text), T-100-08 (StoreBadgeLink is an in-app NavLink; a source gate rejects `window.open` and `createNewWindow`) and T-100-09 (EditGameDialog reused unchanged) hold.

## Next Phase Readiness

- Plan 09 owns deleting ⋮, which still carries Edit Game and Store alongside the new pencil and badge link.
- Owed for plan 10's human UAT: a live look at the footer line (idle, then during an install/update/launch, plus a Steam game and a never-played game) and its tooltip; the pencil's hover and keyboard-focus reveal over the art in at least midnightMirage, gruvbox_dark and dracula; clicking the pencil for a store game and a sideloaded game; clicking the store badge to the store page.

## Self-Check: PASSED

- Created files exist: `playTimeSummary.ts`, `usePlayTime.ts`, `playTimeSummary.test.ts`, `EditDetailsButton.tsx`, `StoreBadgeLink.tsx`; `TimeContainer/index.tsx` and `index.css` do not.
- Commits `4ae914609`, `6d06f7b30`, `8c3d729b1` are ancestors of HEAD.
- Acceptance greps: `<TimeContainer` 0, `../TimeContainer` 0, `usePlayTime(` 1, `gameStatus__playTime` 1, `<EditDetailsButton` 1, `<StoreBadgeLink` 1; `meta/i18nGateScope.json` has no TimeContainer (exit 0).

---
*Phase: 100-game-page-without-the-menu*
*Completed: 2026-11-21*
