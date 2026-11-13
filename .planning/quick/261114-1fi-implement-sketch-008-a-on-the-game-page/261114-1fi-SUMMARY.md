---
phase: quick-261114-1fi
plan: 01
subsystem: frontend/game-page
tags: [game-page, sketch-008, dots-menu, a11y, css]
status: complete
requires: []
provides:
  - click-toggled, upward-opening DotsMenu disclosure
  - A-prime game page card (single scroll area above a docked action footer)
affects:
  - src/frontend/screens/Game/GamePage
key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/__tests__/DotsMenu.disclosure.test.tsx
    - src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts
  modified:
    - src/frontend/screens/Game/GamePage/components/DotsMenu.tsx
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/index.css
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - public/locales/en/gamelib.json
decisions:
  - "Task 3 operator live check: approved 2026-11-14 with one change, install status moved above the action bar (de2e80b7a)"
  - "Commits landed on branch quick-261114-1fi, not main (protected-branch guard)"
metrics:
  completed: 2026-11-14
  tasks_completed: 3
  tasks_total: 3
actuals:
  tokens: 11460
  tasks: 3
  commits: 6
plan_head_before: ac629d1dab897facf71d8600b6c71d7116696a42
plan_head_after: de2e80b7a
---

# Phase quick-261114-1fi Plan 01: Sketch 008 A-prime on the game page Summary

The game page left card is now one scroll area above a docked footer holding Play, the launch select, the gear, a click-opened upward menu and the status line, so Play and status can no longer be pushed down or clipped.

Tasks 1 and 2 are done and verified by jest, tsc, eslint and prettier. **Task 3 (operator live check) passed on 2026-11-14 with one requested change:** the install status reads above the action bar, not under it (see the Task 3 section).

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 (tracer) | `795e0aaa8` | feat(quick-261114-1fi): click-open upward DotsMenu in the game page action bar |
| 2 | `3cf2727d2` | feat(quick-261114-1fi): A-prime game page card with docked action footer |
| 3 (UAT fix) | `de2e80b7a` | fix(quick-261114-1fi): install status above the action bar in the game page dock |

**This task owns 3 commits (`actuals.commits` is now 6 with this docs commit).** The branch `ac629d1da..de2e80b7a` holds 8 commits. 5 belong to concurrent sessions sharing this checkout: `193cfd717`, `31e1f28fd` and `d5ce2a0dc` (quick-261114-1m4) and `4dc5209df` and `0a58bd296` (phase 66.4 docs). Of the original note: my first two commits are above. Commits `193cfd717`, `31e1f28fd` and `d5ce2a0dc` (quick-261114-1m4, Humble) landed on the same branch between them, because a concurrent agent shares this checkout and committed onto the branch I had switched to (see Deviations 1). They touch only `src/backend`/`.planning`. My real diff is 2 commits, 7 files, about 11.5k tokens (chars/4 over `src/frontend` + `public/locales`).

## What was built

**Task 1 (tracer) - DotsMenu disclosure (D-05)**
- `aria-haspopup="menu"`, `aria-expanded`, `aria-label` (`gamelib:gamepage.moreActions`), `type="button"`, `is-open` class on the root. Click-only: no hover or focus handlers.
- `[isOpen]` effect registers document `keydown` (Escape closes and refocuses the toggle) and `click` (closes when outside the root) listeners, removed with the same references on close and unmount.
- Root `onClick` closes on item activation, guarded by `e.currentTarget.contains(e.target)` so clicks React bubbles from the portaled UninstallModal do not close the menu or steal focus mid-confirmation.
- `GameSubMenu` stays mounted with unchanged props; no item or grouping touched.
- CSS: `.gameTools` is `display: none`, bottom-anchored (opens upward), shown only under `.game-actions.is-open`; the hover / focus-within reveal is gone. Dracula `:hover` override and RTL rule untouched.
- `public/locales/en/gamelib.json`: `gamepage.moreActions` = "More actions", hand-added (4-space, alphabetical).

**Task 2 - the A-prime card (D-01, D-02, D-03, D-04, D-06, D-07, D-09)**
- Grid `3fr 2fr`, rows `1fr min-content`, areas `main extra / report report`.
- Header row deleted. Back is a 44px link, absolutely positioned top-left on `.gameArtBand`, keeping its title.
- `.mainInfo` has two children: `.mainInfoScroll` (art band, `.gameMeta`, title, `.gameNotices` with EngineNotices + banner, Description, TimeContainer) and `.actionDock` (`.buttons` row: MainButton, LaunchOptionSelector, spacer, SettingsButton, DotsMenu; then GameStatus).
- Only `.mainInfoScroll` scrolls in the left card; `.summary` no longer scrolls; the three height `@container main-info-wrapper` queries and the sticky `.buttons` fill are deleted.
- Cards: `1px solid var(--neutral-03)`, 10px radius; the 3px grey outline is gone.
- Banner: theme-token warning stripe (`--status-warning`, `--text-default`, `color-mix` under `@supports` with a `--neutral-02` fallback), no hard-coded black.
- Under 700px of content width the grid is one column and the page scrolls as a whole; the footer is the left card's last row.
- Every theme-specific override, focus-ring rule and the caret's non-zero box rule is byte-unchanged under the same `.buttons` chain (D-08).

## Verification

| Check | Result |
| ----- | ------ |
| Task 1 targeted jest (DotsMenu.disclosure, themeTokens, focusIndicator, wikiLinkTrans) | 4 suites, 476 tests, all pass |
| Task 2 targeted jest (`src/frontend/screens/Game`, themeTokens, focusIndicator, `--testPathIgnorePatterns labelSuiteI18nCensus`) | 41 suites, 853 tests, all pass (HEAD baseline 39 / 830; +14 +9) |
| `labelSuiteI18nCensus.test.ts` alone | 2 failed / 21 passed: the same 2 Windows-only `__filename.split('/')` failures as HEAD, nothing new |
| `npx tsc --noEmit` | no errors in any file I touched. The only errors seen mid-task were in `src/backend/humble/__tests__/*` (another agent's in-flight work, since committed) |
| `npx eslint` on written TS/TSX | 0 errors; 12 warnings, all pre-existing in `index.tsx` (count unchanged) |
| `npx prettier --check` (all written paths except the ignored `gamelib.json`) | clean |
| `graphify update .` | started, still running when this summary was written (see below) |

Red mutations recorded (each reverted, file restored):
- B3 (drop Escape refocus), B4 (drop containment check), B6 (drop portal guard): each turned exactly one DotsMenu test red.
- L2 (reintroduce `position: sticky`), L5 (dock tint instead of plain token), L6 (move GameStatus above the dock buttons): each turned exactly one gamePageActionDock test red.

Both new suites were run red before implementation (DotsMenu: 14/14 red; dock gates + themeTokens: red, themeTokens as a suite load failure on the missing `.actionDock`).

### R13 presence-baseline drift

`npx jest meta/__tests__/lintTranslations.test.ts -t R13` was already red on HEAD (240 drift entries). After adding `gamepage.moreActions` it reads **288 = 240 + 48**, each added entry being `gamepage.moreActions` across the 48 locales. `meta/i18nCatalogPresenceBaseline.json` was deliberately not regenerated (that would absorb the 240 unrelated entries). Localising the key belongs to the next localisation batch.

## Deviations from Plan

**1. [Rule 3 - Blocking] Committed on a branch, not main**
- **Found during:** Task 1 commit
- **Issue:** The pre-commit safety assertion treats `main` as protected (`git.base-branch --is-protected main` returned `true`; `git.allow_default_branch_commits` is not set). The plan and orchestrator both asked for per-task commits.
- **Fix:** Created `quick-261114-1fi` from `ac629d1da` and committed there. I did not change `.planning/config.json` to lift the guard.
- **Consequence:** the checkout is shared with a concurrent agent (quick-261114-1m4). It committed three Humble commits onto this branch between my two commits. **`main` has not moved.** Fast-forwarding `main` to `3cf2727d2` would deliver all 5 commits in order; the three foreign commits were evidently meant for main anyway. This is the orchestrator's call.

**2. [Rule 1 - Bug] `@supports` probe contained the word "black"**
- **Found during:** Task 2 (gate L3 red on first GREEN attempt)
- **Fix:** the feature probe is now `color-mix(in srgb, var(--neutral-02), transparent)`, mirroring the `.gameInfoTabs` precedent in the same file.

**3. Minor additions beyond the plan text**
- `.gameTools` z-index raised from 2 to 4 so the upward popover clears `.actionDock` (z-index 3).
- `.mainInfo::after { border-radius: inherit }` so the card's fade overlay does not square off the rounded corners now that `.mainInfo` is `overflow: visible`.
- Margins zeroed on `.developer`, `.releaseDate`, `.genres` and `.engineBadge` in their existing rules rather than via a new `.gameMeta`-scoped override, because the existing `.mainInfoWrapper .mainInfo .x` chain would out-specify one. These elements only render inside `.gameMeta` now.
- `.mainInfoScroll`, `.gameArtBand`, `.mainInfoBody`, `.gameMeta` and `.gameNotices` sit directly under `.gameConfigContainer`, not inside `.mainInfoWrapper { }`, so the L4 gate ("no `.mainInfoWrapper` block carries `overflow-y: auto`") stays meaningful.

## Frameless-margin rule removal (rationale)

The `.App.frameless:not(.fullscreen)` top-row `margin-right: var(--overlay-controls-width)` rule was deleted with the header row. Back now sits inside the left card at top-left and the menu in the footer, so nothing on the page occupies the top-right strip where the Windows/Linux overlay controls sit. The page also renders below the NavShell tab strip, which already consumes `--overlay-controls-width`.

## Task 3: operator live check (APPROVED with one change)

The operator ran the page live and approved it with one change: "I think I prefer the game install status above the buttons, other than that looks good."

- `de2e80b7a`: `GameStatus` moves to the first row of `.actionDock`, above `.buttons`. `.actionDock` is a flex column with a gap, so no CSS change was needed. The L6 dock-order gate in `gamePageActionDock.test.ts` now expects status first. It went red against the old order (1 failed / 8 passed) and green after.
- Re-ran Task 2's verify: jest **41 suites / 853 tests pass**; tsc 0 errors; eslint 0 errors (12 pre-existing warnings); scoped prettier clean.
- The sketch 008 README still describes status under the buttons; this UAT change supersedes it.

## backend-di-ceilings (pre-push gate)

`DotsMenu.disclosure.test.tsx` carries 8 `jest.mock` calls with no baseline entry, so `node meta/backendDiCeilings.cjs` (run by `.husky/pre-push` and `lint.yml`) reports 22 failures instead of the 21 already on main. This is tracked in `.planning/todos/pending/2026-11-14-backend-di-ceilings-red-on-main.md` (66.4-REVIEW WR-01), which already names this file. That todo resolves it with the other 21: remove the mocks or add a named baseline entry.

## Follow-ups (no todo files created)

- ⋮ menu regrouping (Manage install / Library / Links / Uninstall) together with `role="menu"`/`menuitem` roving focus. `aria-haspopup="menu"` is now declared but the items are plain buttons/links, so the ARIA promise is only half kept until that lands.
- A text-on-primary token.
- Localise `gamepage.moreActions` into the 48 locales (clears the 48 new R13 entries).
- The Windows-only `labelSuiteI18nCensus` path split (`__filename.split('/')` on a backslash path).

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths, file access or schema. The wiki link target and `<Trans>` tag are byte-identical; only position and colours moved.

## Self-Check

- Files created exist: `DotsMenu.disclosure.test.tsx`, `gamePageActionDock.test.ts` (FOUND).
- Commits exist: `795e0aaa8`, `3cf2727d2` (FOUND on `quick-261114-1fi`).
- Not self-checked: `graphify update .` completion at write time.

## Self-Check: PASSED
