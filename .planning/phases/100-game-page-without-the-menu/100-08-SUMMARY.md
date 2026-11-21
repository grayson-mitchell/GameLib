---
phase: 100-game-page-without-the-menu
plan: 08
subsystem: ui
tags: [react, game-page, install-caret, ratings-tab, protondb, i18n]
status: complete

requires:
  - phase: 100-game-page-without-the-menu
    provides: "plans 01-07: the Install tab rows, InstallTab wrapper with .legacyRows holding only AppleWikiInfo, the Logs tab"
provides:
  - "actions/installCaret.ts: installCaretItem() returns 'steamOptions' | 'locate' | null for the footer Install caret (D-20)"
  - "MainButton: one Dropdown serves Steam (Install with options...) and every other store (Locate existing installation...); the main Install button still opens the install modal; the caret is unmounted, not disabled, while installing, importing or queued"
  - "Tabs read Install, Achievements, Ratings, Requirements via gamelib:gamepage.tabs.{install,ratings}; .extraInfoTabs scrolls sideways as a clipping backstop (D-01)"
  - "AppleWikiInfo mounted in the Ratings panel outside the hasWikiInfo ternary, so bottle/bridge/GameLib rows show with no wiki scores (D-04)"
  - "components/ProtonDbLink.tsx: Linux, store-catalog games keep a ProtonDB row on Ratings without a compatibility tier"
  - "The InstallTab .legacyRows wrapper and its .extraInfo selector are removed"
affects: [100-09, 100-10]

plan_head_before: 6e2ea2209319a04f12d7152a4a01fc2aa2553081
plan_head_after: bb855725c5687098c47db064ae7dd232a0cbb545

actuals:
  tokens: 13132
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "One Dropdown, one item whose onClick and label vary by a pure selector (installCaretItem), keeping a single is-text literal in MainButton"
    - "A Ratings row is a clickable iconWithText anchor like CompatibilityInfo's, not an is-text button, so the themeTokens is-text census stays at 39"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/actions/installCaret.ts
    - src/frontend/screens/Game/GamePage/actions/__tests__/installCaret.test.ts
    - src/frontend/screens/Game/GamePage/components/ProtonDbLink.tsx
    - src/frontend/screens/Game/GamePage/__tests__/gamePageTabs.test.ts
  modified:
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/MainButton.importDemotion.test.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/MainButton.steamSplitButton.test.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.css
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/index.css
    - src/frontend/helpers/__tests__/steamInstallOptionsEntry.test.ts
    - public/locales/en/gamelib.json
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "installCaretItem's 'locate' branch is gated on hasCapability(runner, 'winePrefixToolsAvailable') plus not installed / queued / installing / importing, and deliberately NOT on installDisabled, so unsupported third-party games keep their only import door"
  - "ProtonDbLink is an iconWithText anchor (role=button, onClick -> createNewWindow) rather than the plan's link-styled is-text button, because a second is-text site breaks the themeTokens census of 39"
  - "Tab labels now come from the gamelib catalog; the upstream game.install_info and game.extra_info keys are no longer referenced by index.tsx"

patterns-established:
  - "The ▾ is unmounted (not disabled) via a null selector result, extending the WR-14 / S4 rule from Steam to all stores"

requirements-completed: [D-01, D-04, D-14, D-20]

coverage:
  - id: D1
    description: "A not-installed non-Steam game's footer Install button still opens the install modal and its ▾ offers Locate existing installation...; Steam's ▾ keeps Install with options...; the ▾ is unmounted while installing, importing or queued"
    requirement: D-20
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/actions/__tests__/installCaret.test.ts"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/__tests__/MainButton.importDemotion.test.tsx#R1-R6"
        status: pass
    human_judgment: true
    rationale: "Seeing the ▾ beside Install and pointing GameLib at an existing folder needs the running app"
  - id: D2
    description: "The right panel tabs read Install, Achievements, Ratings, Requirements and the tab bar scrolls sideways instead of clipping"
    requirement: D-01
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/__tests__/gamePageTabs.test.ts#game page tabs (D-01)"
        status: pass
    human_judgment: true
    rationale: "Whether the labels fit unclipped at 3fr/2fr is a layout question no jsdom-less test can answer"
  - id: D3
    description: "The Apple compatibility block and an always-available Linux ProtonDB row live on the Ratings tab, even with no wiki scores; the Install tab holds only the new rows"
    requirement: D-04
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/__tests__/gamePageTabs.test.ts#Ratings tab content (D-04, D-01)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts"
        status: pass
    human_judgment: true
    rationale: "ProtonDB opening in a window on Linux and the Apple rows showing on an unscored Mac game need the running app"

duration: 38 min
completed: 2026-11-22
---

# Phase 100 Plan 08: Install caret door, Ratings tab and legacy rows removal Summary

**The footer Install ▾ now offers "Locate existing installation..." for every non-Steam game (Steam keeps "Install with options..."), the right panel reads Install · Achievements · Ratings · Requirements with the Apple compatibility block and a Linux ProtonDB row on Ratings, and the rollout's .legacyRows wrapper is gone.**

## Performance

- **Duration:** 38 min
- **Completed:** 2026-11-22
- **Tasks:** 2 (Task 1 tracer, Task 2 auto)
- **Files:** 4 created, 13 modified

## Accomplishments

- `installCaretItem` (pure) chooses the one item the ▾ carries; MainButton keeps a single Dropdown and a single `is-text` literal (census still 39).
- `MainButton.importDemotion.test.tsx` rewritten for D-20: R1-R3 assert the Dropdown holds exactly one item routing `openInstallGameModal` with `action: 'import'` and no button outside it does; R4 Steam, R5 installed, R6 installing (unmounted).
- Tabs relabelled through `gamelib:gamepage.tabs.{install,ratings}`; `.extraInfoTabs { overflow-x: auto }` as the backstop.
- `AppleWikiInfo` and `ProtonDbLink` mount after the `hasWikiInfo` ternary on Ratings; `ProtonDbLink` stays out of the way when `CompatibilityInfo` already shows its tier row.
- `InstallTab` dropped `AppleWikiInfo` and the `.legacyRows` wrapper; the CSS selector was removed.
- i18n bookkeeping: fork-touched 472 -> 474, scope 349 -> 351 for `installCaret.ts` and `ProtonDbLink.tsx` (gate showed 0 violations).

## Task Commits

1. **Task 1: footer Install caret (tracer)** - `6d683c054` (feat)
2. **Task 2: Install/Ratings tabs, Ratings content, legacy rows removed** - `55b8aff90` (feat)
3. **Fix: E5 source gate follows MainButton to installCaretItem** - `918c666ce` (fix)
4. **i18n gate scope bookkeeping** - `bb855725c` (chore)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] S2 in MainButton.steamSplitButton.test.tsx asserted no caret for non-Steam runners**
- **Found during:** Task 1
- **Issue:** The suite's S2 ("D-28: renders NO caret for gog/legendary/nile/sideload") contradicts D-20; the plan named only S9 for edits.
- **Fix:** S2 now asserts a caret exists for those runners and that its item never calls `openSteamInstallOptions`; S9's title and comment say the door lives in the ▾.
- **Files modified:** MainButton.steamSplitButton.test.tsx
- **Commit:** `6d683c054`

**2. [Rule 1 - Bug] steamInstallOptionsEntry.test.ts E5 expected MainButton to call showSteamMainButtonInstallOptions directly**
- **Found during:** Task 2 (full Frontend jest run)
- **Issue:** MainButton now reaches the predicate through `installCaretItem`; E5 failed. Task 1's verify had not included this suite.
- **Fix:** E5 asserts MainButton calls `installCaretItem({` and `installCaret.ts` calls the shared predicate, and the pre-fix inline form is absent from both.
- **Files modified:** src/frontend/helpers/__tests__/steamInstallOptionsEntry.test.ts
- **Commit:** `918c666ce`

**3. [Rule 3 - Blocking] installTabSource.test.ts anchored on `className="legacyRows"`**
- **Found during:** Task 2
- **Issue:** Six ordering specs used the removed wrapper as their "after the facts" anchor.
- **Fix:** Anchor moved to `<IntegrationRows`, the element that followed the wrapper; added assertions that `legacyRows` and `AppleWikiInfo` are absent from InstallTab; the stale comment in InstallTab/index.css was reworded.
- **Files modified:** InstallTab/__tests__/installTabSource.test.ts, InstallTab/index.css
- **Commit:** `55b8aff90`

**4. [Rule 1 - Bug] ProtonDbLink as an `is-text` button broke the themeTokens census (39 -> 40)**
- **Found during:** Task 2
- **Issue:** The plan asked for a link-styled button; any new `is-text` literal adds a render site.
- **Fix:** Rendered as a clickable `iconWithText` anchor with `role="button"`, the same shape as CompatibilityInfo's ProtonDB row.
- **Files modified:** ProtonDbLink.tsx
- **Commit:** `55b8aff90`

**Total deviations:** 4 auto-fixed (3 Rule 1, 1 Rule 3). **Impact:** none on scope; all in tests or presentation of the planned behavior. The AppleWikiInfo import in `GamePage/index.tsx` is by path, not through the components barrel (it was never exported there).

## Known Stubs

None.

## Threat Flags

None. T-100-24 mitigated as planned: fixed `https://www.protondb.com` origin, `encodeURIComponent` on the title and ids, opened through `createNewWindow`.

## Verification

Full Frontend jest (386 suites, 6685 tests) green after the E5 fix; Meta genI18nGateScope + hardcodedStringGate green (204 passed, 1 skipped); codecheck, find-deadcode (312 baselined, PASS), gameinfo-narrowing-ceiling (PASS), backend-di-ceilings frontend (0 FAIL), i18n-churn-guard clean, `pnpm lint` 0 errors (existing warnings only), scoped prettier over every touched non-ignored path. Acceptance greps: is-text 1, installCaretItem( 1, legacyRows 0, AppleWikiInfo in InstallTab 0, tabs.ratings 1. `⋮` (GameSubMenu, DotsMenu) untouched (plan 09).

## Self-Check: PASSED

All created files exist; commits `6d683c054`, `55b8aff90`, `918c666ce`, `bb855725c` are ancestors of HEAD.
