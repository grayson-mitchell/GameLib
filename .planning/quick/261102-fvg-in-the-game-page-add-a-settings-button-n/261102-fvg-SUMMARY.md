# Quick 261102-fvg: Settings gear beside Play on game page

Moved the existing SettingsButton from the game page top row to directly after the Play button, using the library card's visibility condition (installed, not uninstalling, not Browser; Steam now included), with title and aria-label.

## Commits
- Task 1: SettingsButton condition + label + test (SettingsButton.tsx, SettingsButton.test.tsx, SvgButton/index.tsx)
- Task 2: relocate into `.buttons` after MainButton + CSS spacing (GamePage/index.tsx, index.css)
(hashes: see `git log` for `quick-261102-fvg`)

## Deviations
- [Rule 3] `SvgButton` did not forward `aria-label`; added an optional `'aria-label'` prop (backwards compatible). File not in the plan's files_modified.
- [Rule 3] `isBrowserGame` became unused in GamePage/index.tsx (lint error); removed it.

## Verification
- `npx jest src/frontend/screens/Game/GamePage`: 28 suites, 441 tests pass (new SettingsButton suite: 9 tests, RED first with 4 failures, then green).
- eslint: 0 errors on touched files (pre-existing warnings only); tsc: no errors in touched files; prettier clean; one `<SettingsButton` in index.tsx.
- `public/locales/en/translation.json` untouched/unstaged.

## Pending for the user
- Human check NOT performed: restart `tauri dev`; open an installed Steam game and an installed Epic/GOG game; confirm a gear sits right of Play, aligned, opening the settings modal; uninstalled game shows none; top row has no gear.
