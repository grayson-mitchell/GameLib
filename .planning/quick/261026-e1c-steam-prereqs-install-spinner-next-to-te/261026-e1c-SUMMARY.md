---
phase: quick-261026-e1c
plan: 01
status: complete
key-files:
  modified:
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.bottleWaiting.test.tsx
  created:
    - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.redistSpinner.test.tsx
metrics:
  completed: 2026-10-26
---

# Quick 261026-e1c: spinner beside the "Installing Redistributables" status

While the 261025-rkj first-launch shared-redist step runs (`status: 'redist'`,
context = component label), the game-page status line under the Play button
now shows an indeterminate 14px `CircularProgress` before
`Installing Redistributables (<component>)`. Same i18n key and default.

## Commits

- 5b2654120 feat: spinner in the `is.installingRedist` branch of `getInstallLabel`, plus test

## Verification

- `npx jest src/frontend/screens/Game/GamePage`: 23 suites, 408 tests pass.
- `pnpm codecheck` clean; prettier `--check` clean on the three written paths; eslint 0 errors (1 pre-existing warning at GameStatus.tsx:178).

## Deviations

- The planner and executor agents were skipped; the orchestrator wrote the plan and made the one-file change inline.
- The test cannot check the interpolated component name, because `faithfulTranslate` returns catalog strings uninterpolated. It checks for the spinner and the fixed text.

## Not verified live

The spinner has not been seen in the running app. It will show on the next bridge first launch that installs redists.
