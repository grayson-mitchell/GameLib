---
phase: 74-steam-game-updates
plan: 12
subsystem: steam
tags: [steam, update, ui, confirmation, i18n]
requires: [74-11]
provides:
  - SteamUpdateInfo game-page component (two-size line, registered and unknown states)
  - confirmSteamUpdate size-aware confirmation shared by GamePage and GameCard
key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx
    - src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.scss
    - src/frontend/helpers/steamUpdateConfirm.ts
    - src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateInfo.test.tsx
    - src/frontend/helpers/__tests__/steamUpdateConfirm.test.ts
  modified:
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Library/components/GameCard/index.tsx
    - public/locales/en/gamelib.json
requirements-completed: []
completed: 2026-11-12
---

# Phase 74 Plan 12: Update sizes UI and confirmation Summary

The game page shows "Download up to X · needs Y free during update (estimate)" on request, and Update on a Steam game confirms with both sizes (or refuses on low disk) before queueing; registered games pass straight to Steam.

## Commits
- 2d05b86a1 feat(74-12): SteamUpdateInfo two-size update line
- 30210c7d6 feat(74-12): size-aware Steam update confirmation, wired into page and card (also holds the GamePage render of SteamUpdateInfo, since index.tsx carries both tasks' hunks)

## Verification
- jest src/frontend/helpers, screens/Game, screens/Library: 2131 pass (12 new tests)
- `pnpm codecheck`, `pnpm i18n-churn-guard`, scoped prettier check pass; `pnpm lint` shows no errors in touched files (`isStore` used instead of runner literals per the no-restricted-syntax rule)

## Deviations from Plan
1. **[Rule 3] Catalogue:** strings use `gamelib:gamepage.update.*` (not gamepage.json), per the i18n-churn-guard constraint. The checking/Update-anyway dialog added one new key, `gamelib:gamepage.update.anyway`.
2. **[Rule 1] Size units:** the app's `size()` formatter emits MiB/GiB ("916 MiB", "13 GiB"), so assertions use those rather than the plan's illustrative "MB/GB".
3. Component tests use a small hook harness (no jsdom in this project) instead of a DOM render.
4. `confirmSteamUpdate` uses a single `dialogId` so the "Checking update size…" dialog is replaced in place by the result; Cancel during the check suppresses the result.
5. `pnpm lint-translations` not run to pass: non-English locale gaps for the new keys are known and out of scope.

## Known Stubs
None.

## Threat Flags
None. T-74-38 (text rendered via React/i18next, no HTML) and T-74-39 (computeSize only on click of Show update size or Update) mitigated.

## Self-Check: PASSED
