---
phase: quick-261029-d7v
plan: 01
status: complete
key-files:
  modified:
    - src/common/types.ts
    - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
    - src/backend/storeManagers/steam/games.ts
    - src/frontend/state/GlobalState.tsx
    - src/frontend/types.ts
    - src/frontend/screens/Game/GameContext.tsx
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
    - src/frontend/screens/Library/components/GameCard/index.tsx
    - src/frontend/screens/Library/components/GameCard/constants.ts
    - src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx
    - src/frontend/screens/ConsoleMode/components/ConsoleCard/index.tsx
    - public/locales/en/gamepage.json
metrics:
  completed: 2026-10-29
---

# Quick 261029-d7v: DRM-mode launch setup gets its own status label

`drmLaunchSetup` now sends `status: 'drm-setup'` instead of `'redist'`. The new `Status`
member is in every list that treated `'redist'` as busy (sleep assertion `system`, library
status tracking, Play disabled on GameCard / GamePage / ConsoleCard). Labels: Play button
"Preparing Steam DRM support"; status line and console overlay "Preparing Steam DRM support
({{step}})", the status line with the 14px spinner from 261026-e1c.

## Commits

- 5c163c76a fix: `'drm-setup'` status, sender, frontend handling, en strings, tests

## Verification

- `npx jest` over drm/drmLaunchSetup, GamePage, GameCard, ConsoleMode: 32 suites, 579 tests pass; GamePage re-run after the fixture fix: 24 suites, 421 tests.
- New test in `GameStatus.redistSpinner.test.tsx`: `preparingDrm` shows the spinner and "Preparing Steam DRM support (", not "Installing Redistributables".
- `pnpm codecheck` clean (three MainButton test fixtures needed `preparingDrm: false`).
- `npx prettier --check` clean on every written path; `public/locales/en/gamepage.json` is prettier-ignored (`--file-info`), so it was checked with a JSON parse instead.
- eslint: 0 errors over the written `.ts`/`.tsx` files.

## Deviations

- The planner and executor agents were skipped; the orchestrator wrote the plan and made the change inline (same as 261026-e1c).
- Only the `en` catalog gained the two keys; other locales fall back to the `t()` defaults.

## Not verified live

The label has not been seen in the running app. It shows on the next DRM-mode bridge launch
(e.g. appId 219990), which currently stops at bottle-stage — see the debug session that
follows this task.
