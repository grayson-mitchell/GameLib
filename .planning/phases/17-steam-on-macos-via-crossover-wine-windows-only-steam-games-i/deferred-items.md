# Deferred Items — Phase 17

## From 17-11 (GAP 3 gap-closure)

- **Pre-existing async leak in `src/backend/storeManagers/steam/library.ts` (`pollInstallOnce` → `readAcfState`)**: `npm test` full-suite run prints an uncaught `TypeError: Cannot read properties of undefined (reading 'map')` from a leftover `setTimeout`-driven poll firing after Jest's suite teardown ("A worker process has failed to exit gracefully"). All 48 suites / 938 tests still pass — this is a stray timer leak, not a test failure. Out of scope for 17-11 (that plan's files are frontend-only: `SteamBottleSetup.ts`, `types.ts`, `GameContext.tsx`, `GamePage/index.tsx`, `MainButton.tsx`, `GameStatus.tsx`, `gamepage.json`, and the selector test — none touch `steam/library.ts`). Needs its own investigation/fix (likely a missing `clearInterval`/`.unref()` in a test or the poller itself).
