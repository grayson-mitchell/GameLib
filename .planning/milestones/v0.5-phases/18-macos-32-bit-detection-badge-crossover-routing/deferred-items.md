# Deferred Items — Phase 18

Out-of-scope discoveries logged during plan execution (SCOPE BOUNDARY rule —
not fixed, not part of the current plan's task changes).

## 18-03: Leaked install-poll interval crashes the Jest worker process (pre-existing)

**Found during:** 18-03 Task 2, while investigating a "Jest did not exit one
second after the test run" trailing crash observed when running
`src/backend/storeManagers/steam/__tests__/games.test.ts` in isolation.

**Root cause:** `describe('SteamGame.install() ensurePlatformsCaptured() —
Phase 17 Plan 09 (MACSTEAM-04)')`'s "native-Mac game routes native after
capture" test (`src/backend/storeManagers/steam/__tests__/games.test.ts`)
calls `game.install()` down the real native path, which calls the REAL
(unmocked in that describe block) `startInstallPolling()`. No matching
`stopInstallPolling()`/spy teardown exists for that describe block, so a live
`setInterval` (3000ms default) keeps running after the test file completes.
When it later fires, `getSteamLibraries()` (a reset jest mock, torn down
after the suite) returns `undefined`, and `readAcfState()`'s
`.map()` call throws — crashing the Node worker process with a
`TypeError: Cannot read properties of undefined (reading 'map')` trace
through `readAcfState → pollInstallOnce → Timeout._onTimeout`.

**Verified pre-existing (not caused by 18-03):** reproduced identically
against `library.ts` at commit `6dedc8d9` (pre-Phase-18-03) — same crash,
same root cause, only the line numbers differ.

**Not a blocker for 18-03:** the plan's actual verification command,
`npm test -- --testPathPattern=steam` (multi-suite Jest run), exits 0 — Jest
force-exits the leaked worker gracefully in that mode and reports
`Test Suites: 11 passed, 11 total` / `Tests: 350 passed, 350 total`. The
crash only surfaces as noisy trailing stderr when a single test *file* is
run in isolation via `npx jest <file>` (single-worker mode has no sibling
suite to keep the process alive past the leak).

**Suggested fix (future housekeeping, not this plan):** add
`jest.spyOn(libraryModule, 'startInstallPolling').mockImplementation(() =>
{})` (with `mockRestore()` in `afterEach`) to the
`ensurePlatformsCaptured()` describe block, matching the pattern already
used in the sibling `install() — GAME-02` and `install() — Phase 17 bottle
routing` describe blocks in the same file.
