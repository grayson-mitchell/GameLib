---
phase: quick-260710-kba
plan: 01
subsystem: storeManagers/steam
tags: [steam, install-size, getFileSize, formatting, jest]

requires: []
provides:
  - Steam's GameInfo.install.install_size persisted as a getFileSize-formatted string (matches legendary/gog/nile contract)
  - getSteamInstallSize fast path returns the formatted string directly (no parseInt, no double-formatting)
affects: [steam-install-info-panel]

tech-stack:
  added: []
  patterns:
    - "Steam install_size formatting matches other store managers: getFileSize(Number(rawBytes)) at construction, never re-parsed downstream"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts

key-decisions:
  - "Formatted install_size at all three install-object construction sites in library.ts (refresh, refreshInstallState, pollInstallOnce) rather than just the two named in the plan, since pollInstallOnce builds the identical install shape and would otherwise show raw bytes for freshly-installed games until the next refresh/focus reconciliation."
  - "Added getFileSize to the backend/utils mock in library.test.ts (was previously absent since library.ts never imported it before this fix) and re-established the mock implementation per-describe-block due to resetMocks:true wiping factory-level implementations between tests."

requirements-completed: [KBA-FMT]

duration: 12min
completed: 2026-07-10
---

# Quick Task 260710-kba: Format Steam Install Size Summary

**Steam now persists `install.install_size` as a `getFileSize`-formatted string (e.g. "19.20 GiB") at every construction site, matching the legendary/gog/nile contract so the shared `InstalledInfo.tsx` component renders it correctly instead of raw bytes.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-10T02:33:00Z
- **Completed:** 2026-07-10T02:45:00Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- Steam's `install_size` is formatted via `getFileSize(Number(sizeOnDisk))` at all install-object construction sites in `library.ts` — `refresh()`, `refreshInstallState()`, and `pollInstallOnce()` — so installed games always carry a human-readable size string, never raw bytes.
- `getSteamInstallSize`'s fast path in `games.ts` now returns the already-formatted `install_size` directly instead of `parseInt`-ing it (which previously would have mangled a formatted string like "15.00 GiB" down to `15` → "15 B").
- Updated `games.test.ts` LIB-06 fast-path test to the new formatted-string contract and updated `library.test.ts` (mock + one assertion) so the whole Steam test suite passes under the new contract.

## Task Commits

Each task was committed atomically:

1. **Task 1: Persist formatted install_size and fix the games.ts fast path** - `4ea64185` (fix)
2. **Task 2: Update the LIB-06 fast-path test to the formatted-string contract** - `63c43f04` (test)

_Note: Task 2's commit also includes the library.test.ts fixes required to keep the full Steam suite green after Task 1's changes (see Deviations)._

## Files Created/Modified
- `src/backend/storeManagers/steam/library.ts` - Imports `getFileSize` from `backend/utils`; formats `install_size` at all three install-object construction sites (`refresh()`, `refreshInstallState()`, `pollInstallOnce()`)
- `src/backend/storeManagers/steam/games.ts` - `getSteamInstallSize` fast path returns `gameInfo.install.install_size` directly for installed games; JSDoc updated to reflect no-parse behavior
- `src/backend/storeManagers/steam/__tests__/games.test.ts` - LIB-06 fast-path test fixture updated to a formatted-string `install_size`; asserts the value passes straight through and `getFileSize` is not called
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - Added `getFileSize` to the `backend/utils` mock (previously absent); re-established the mock implementation per-describe-block (`refreshInstallState()`, `pollInstallOnce()`, `hostInstallPlatform()` GAP2 suite); updated the `refreshInstallState()` install_size assertion to expect the formatted string

## Decisions Made
- Extended the formatting fix to the third install-object construction site (`pollInstallOnce`, ~line 496) beyond the two the plan explicitly named, for consistency with the plan's own stated truth ("Steam's persisted `GameInfo.install.install_size` is a formatted string... matching legendary/gog/nile"). Leaving this site unfixed would have meant a freshly-installed game (via the install poller) showed raw bytes until the next `refreshInstallState()` or focus-triggered reconciliation — the exact bug this task exists to fix.
- `library.test.ts` previously had no `getFileSize` mock at all, since `library.ts` never imported it before this change. Adding the import surfaced the gap (an unmocked call throws `TypeError: ... is not a function`) across three describe blocks. Fixed by adding `getFileSize: jest.fn()` to the module factory mock and setting `mockImplementation` per-describe-block (consistent with the file's documented `resetMocks:true` pattern already used for `getSteamLibraries`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Formatted `install_size` at the third construction site (`pollInstallOnce`) not named in the plan**
- **Found during:** Task 1
- **Issue:** The plan's action steps only named two install-object construction sites (`refresh()` ~line 215, `refreshInstallState()` ~line 335), but a third site in `pollInstallOnce()` (~line 496) builds an identical install object from raw ACF `sizeOnDisk` and was left unformatted — same bug, different code path (fires when an install-in-progress poll confirms completion).
- **Fix:** Applied `getFileSize(Number(result.sizeOnDisk!))` at this site too.
- **Files modified:** src/backend/storeManagers/steam/library.ts
- **Verification:** `pnpm codecheck` passes; full Steam test suite green.
- **Committed in:** 4ea64185 (Task 1 commit)

**2. [Rule 3 - Blocking] Added missing `getFileSize` mock to library.test.ts and fixed one raw-bytes assertion**
- **Found during:** Task 1 verification (running `library.test.ts`, not itself in the plan's `<verify>` step but caught by the full-suite self-check before completion)
- **Issue:** `library.test.ts`'s `backend/utils` mock only provided `getSteamLibraries` (library.ts never imported `getFileSize` before this task). After adding the import, 7 tests threw `TypeError: getFileSize is not a function`, and one test asserted the pre-fix raw-bytes value (`install_size: '50000'`).
- **Fix:** Added `getFileSize: jest.fn()` to the `backend/utils` mock factory; set `mockImplementation((bytes) => \`${bytes} B\`)` in the three affected `beforeEach` blocks (`refreshInstallState()`, `pollInstallOnce()`, `hostInstallPlatform()` GAP2 suite) — matching the file's existing `resetMocks:true` re-establishment pattern; updated the one assertion that checked the raw value to expect the formatted string (`'50000 B'`).
- **Files modified:** src/backend/storeManagers/steam/__tests__/library.test.ts
- **Verification:** `npx jest library.test.ts` — 171/171 passing (was 7 failing before fix).
- **Committed in:** 63c43f04 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug consistency fix, 1 blocking test-mock fix)
**Impact on plan:** Both fixes were necessary to fully close the raw-bytes bug (deviation 1) and to keep the existing test suite green after the plan's own Task 1 change (deviation 2). No scope creep beyond the Steam install-size contract.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Steam install size now renders as a human-readable string (e.g. "~19.2 GiB") in the shared `InstalledInfo.tsx` panel, with no frontend changes required.
- Full backend+frontend Jest suite (40 suites, 812 tests) passes; `pnpm codecheck` (tsc --noEmit) is clean; `eslint` shows only pre-existing warnings on touched files (no new errors).

---
*Task: 260710-kba*
*Completed: 2026-07-10*

## Self-Check: PASSED

All claimed files and commit hashes verified present:
- src/backend/storeManagers/steam/library.ts (FOUND)
- src/backend/storeManagers/steam/games.ts (FOUND)
- src/backend/storeManagers/steam/__tests__/games.test.ts (FOUND)
- src/backend/storeManagers/steam/__tests__/library.test.ts (FOUND)
- .planning/quick/260710-kba-format-steam-install-size-as-human-reada/260710-kba-SUMMARY.md (FOUND)
- Commit 4ea64185 (FOUND)
- Commit 63c43f04 (FOUND)
- Commit 0bd2c03d (FOUND)
