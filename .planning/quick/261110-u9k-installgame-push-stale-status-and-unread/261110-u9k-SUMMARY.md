# Quick 261110-u9k Summary

Protocol-link `installGame` push now opens the install flow via `openInstallGameModal`, with an event-time in-flight guard (`installing`/`queued`); dead UiState fields `showInstallModal`, `wineVersions`, `error` deleted.

## Commits
- 2d8b9d457 fix: wire handleInstallGame to openInstallGameModal (initStateSubscriptions.ts + test; tests A-D, RED confirmed first for A/B/C)
- fb0a6dbed refactor: trim UiState and readInitialUi (returns only platform), uiState test updated, todo moved to completed/ with Resolution

## Verification
- jest (uiState + initStateSubscriptions): 45/45 pass
- pnpm codecheck: green; eslint: 0 errors (3 pre-existing warnings in the init test); scoped prettier: green
- grep -rnw showInstallModal src/: empty; pnpm planning-gates: 12/12

## Deviations
None.
