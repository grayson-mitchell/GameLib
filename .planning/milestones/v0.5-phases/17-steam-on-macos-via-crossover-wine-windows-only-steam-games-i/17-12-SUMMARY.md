---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 12
subsystem: infra
tags: [crossover, wine, steam, bottle, gap-closure]

# Dependency graph
requires:
  - phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
    provides: bottle provisioning + bottled-Steam dispatch (plans 17-02/17-04/17-05), UAT session-2 gap diagnosis (17-07)
provides:
  - Shared both-root resolver (resolveBottleSteamRoot) in bottle.ts that probes BOTH `Program Files (x86)/Steam` (win64 prefix) and `Program Files/Steam` (win32 prefix) and returns whichever the bottle actually created
  - getBottleSteamExePath/getBottleSteamappsDir routed through the shared resolver — isBottleReady/provisionBottle step-8/dispatchToBottledSteam all inherit the fix with no direct code changes
  - Self-heal: a bottle whose Steam installed under `Program Files` (win32 CrossOver template) now reports isBottleReady()=true WITHOUT re-running SteamSetup.exe
  - Both-prefix-layout unit fixtures (bottle.test.ts) + win32-layout ACF-scan regression assertion (library.test.ts)
affects: [17-13, future UAT retest of tests 3-5]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared existsSync-only path resolver with ordered candidate list (x86 first / win32 fallback) as the single chokepoint for bottled-Steam path derivation — mirrors the sanitizeBottleName (T-17-01) chokepoint pattern already used elsewhere in bottle.ts"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts

key-decisions:
  - "resolveBottleSteamRoot() candidate order is x86-first, win32-second — win64 prefix (Program Files (x86)) is the common/expected CrossOver layout; win32 (Program Files) is the fallback that self-heals the diagnosed bottle."
  - "getBottleSteamappsDir/getBottleSteamExePath keep identical exported signatures (single bottleName string arg) so library.ts's getBottleSteamappsRoot() inherits the fix with ZERO source changes — only a new win32-layout regression test was added to library.test.ts."
  - "isBottleProvisioned() (cxbottle.conf-only) was deliberately left untouched — it retains its narrow 're-entrancy check' meaning; isBottleReady() is the only consumer that needed the both-root probe."

requirements-completed: [MACSTEAM-04, MACSTEAM-05]

# Metrics
duration: 12min
completed: 2026-07-11
---

# Phase 17 Plan 12: Fix bottled-Steam path resolution for win32 CrossOver prefixes (GAP-17-PFX86-PATH) Summary

**Shared both-root resolver in bottle.ts makes `isBottleReady()` true under EITHER `Program Files (x86)` (win64) or `Program Files` (win32) Steam layout, closing the UAT blocker where a win32 CrossOver bottle re-opened SteamSetup.exe on every Install click.**

## Performance

- **Duration:** ~12 min (14:35 → 14:47 local, per commit timestamps)
- **Tasks:** 2/2 completed
- **Files modified:** 3 (1 source, 2 test)

## Accomplishments
- Root-caused fix for GAP-17-PFX86-PATH: `getBottleSteamExePath`/`getBottleSteamappsDir` no longer hardcode `Program Files (x86)` — they route through a single shared `resolveBottleSteamRoot()` that probes both candidate Steam roots and prefers whichever actually contains `steam.exe`.
- `isBottleReady()`, `provisionBottle()` step-8's `fullyProvisioned` computation, and `dispatchToBottledSteam`'s command target all inherit the fix automatically (no direct edits needed — they were already calling `getBottleSteamExePath`).
- `library.ts`'s bottle-source ACF scan (`getBottleSteamappsRoot()` → `getBottleSteamappsDir(...)`) inherits the fix with **zero source changes** — proven by a new win32-layout regression test.
- Both-prefix-layout unit fixtures added to `bottle.test.ts` (win64, win32 self-heal, neither-root default) and a win32-layout ACF-scan + platform-label regression added to `library.test.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared both-root Steam resolver in bottle.ts + route exe/steamapps/readiness through it** - `a0af3025` (fix)
2. **Task 2: win32-layout bottle ACF-scan regression assertion in library.test.ts** - `6ade072c` (test)

_No plan-metadata commit yet — this SUMMARY commit is that final docs commit (per worktree convention: no STATE.md/ROADMAP.md writes here; orchestrator owns those)._

## Files Created/Modified
- `src/backend/storeManagers/steam/bottle.ts` - Added `STEAM_ROOT_SEGMENTS` candidate list (x86 first, win32 second) + `resolveBottleSteamRoot(bottleName)`; rewrote `getBottleSteamExePath`/`getBottleSteamappsDir` to route through it. `isBottleProvisioned`, `provisionBottle`, `dispatchToBottledSteam` unchanged (inherit the fix transitively).
- `src/backend/storeManagers/steam/__tests__/bottle.test.ts` - Replaced the single blanket-mock exe/steamapps-path test with path-aware `mockImplementation` fixtures covering win64, win32 self-heal, and neither-root-present cases; added a win32 self-heal case to the `isBottleReady` describe block.
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - Added `WIN32_BOTTLE_STEAMAPPS_ROOT` fixture and two new tests: a `readAcfState('730', 'bottle')` win32-layout resolution assertion, and a `pollInstallOnce` win32-layout platform-label (`'Windows'`) assertion. `library.ts` source untouched.

## Decisions Made
- Kept the resolver's fallback order deterministic (x86 default) for the case where neither Steam root exists yet — this matches pre-install path construction expectations (`provisionBottle` computes `getBottleSteamExePath` once at the very end of the flow, before Steam has necessarily finished installing).
- Did not modify `library.ts` — confirmed during the Task 2 read that `getBottleSteamappsRoot()` delegates entirely to the (now-fixed) `getBottleSteamappsDir`, so no hardcoded x86 path existed there to begin with.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria (grep-based source assertions, non-regression checks, `npm run codecheck`) were verified and pass.

## Issues Encountered

- **Plan verify-command pattern mismatch (non-blocking, documentation-only):** the plan's literal verify commands `npm test -- --testPathPattern=steam/bottle` and `npm test -- --testPathPattern=steam/library` match **zero** test files and exit 1 with "No tests found" — the actual test paths are `src/backend/storeManagers/steam/__tests__/bottle.test.ts` / `.../library.test.ts`, and `__tests__/` sits between `steam/` and `bottle`/`library`, so the literal regex fragment never matches (`steam/bottle` requires the literal substring, which doesn't exist in the path). Verified instead with `npm test -- --testPathPattern="steam.*bottle"` (55/55 pass) and `npm test -- --testPathPattern="steam.*library"` (74/74 pass). Logged in `deferred-items.md` for future plan-authoring awareness.
- **Pre-existing async leak surfaced during bottle-suite run (out of scope, not fixed):** running the `steam.*bottle` pattern prints `Jest did not exit one second after the test run has completed` / a post-teardown `ReferenceError` pointing at `raiseInstallerWindow`'s real (non-fake-timer) retry loop in `bottle.ts` (fired fire-and-forget from `provisionBottle()`/`dispatchToBottledSteam()`'s install verb — neither touched by this plan). All 55 tests still pass; only the process exit code is affected (non-zero after an ~18s straggling timer). This pre-dates Plan 17-12 (introduced by the GAP 5 installer-raise feature) and is out of scope per the deviation-rules scope boundary. Logged in `deferred-items.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- GAP-17-PFX86-PATH is closed at the automated-test level: the both-root resolver, `isBottleReady()` self-heal, and the bottle-source ACF scan are all locked by unit fixtures covering both win64 and win32 CrossOver prefix layouts.
- **HUMAN-OBSERVABLE verification still required** (deferred per plan scope): on macOS + CrossOver, retest UAT test 3 — confirm the existing win32 bottle now flips its game card to installed and Install no longer re-opens SteamSetup.exe. This unblocks UAT tests 4 (launch) and 5 (D-08 indicator), which were blocked behind this gap per 17-07's session-2 findings.
- Two out-of-scope items logged to `deferred-items.md` for future cleanup: (1) the plan's verify-command regex pattern needs a `.*` between `steam` and the target filename in future plans targeting files under `__tests__/`, and (2) `raiseInstallerWindow`'s real-timer retry loop needs fake-timer or mock coverage to stop leaking past Jest teardown in the `provisionBottle`/`tellBottledSteamToInstall` tests.
- 17-13 (steamwebhelper-hang gap-closure) is the sibling gap-closure plan in this wave and is unaffected by these changes (different subsystem).

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-11*

## Self-Check: PASSED
