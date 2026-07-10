---
phase: quick-260710-mkw
plan: 01
subsystem: ui
tags: [react, steam, library, cover-art, cachedimage, fallback]

# Dependency graph
requires:
  - phase: 02-steam-library
    provides: Steam art fields (art_cover = header.jpg, art_square = library_600x900.jpg) on GameInfo
provides:
  - Ordered multi-level fallback chain on CachedImage (fallback accepts string | string[])
  - Steam grid tiles fall back portrait capsule -> game header art -> generic placeholder
affects: [Library GameCard, any future CachedImage caller wanting chained fallbacks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CachedImage fallback chain: numeric index (-1 = primary src) advancing through a bounded normalized array"
    - "Frontend unit tests without jsdom: slot-based useState + dependency-aware useEffect react mock, inspecting the returned element graph"

key-files:
  created:
    - src/frontend/components/UI/CachedImage/__tests__/index.test.tsx
  modified:
    - src/frontend/components/UI/CachedImage/index.tsx
    - src/frontend/screens/Library/components/GameCard/index.tsx

key-decisions:
  - "fallback prop widened to string | string[]; single-string path kept byte-for-byte equivalent for existing callers"
  - "Grid tile only prepends header art when art_cover is truthy AND differs from the portrait capsule; otherwise the bare placeholder is passed (non-Steam runners with matching art unchanged)"
  - "Used the project's canonical typecheck (tsc --noEmit via codecheck) instead of the plan's tsc -p src/frontend (no tsconfig exists at that path)"

patterns-established:
  - "CachedImage supports an ordered, bounded fallback chain resettable on props.src change"

requirements-completed: [QUICK-260710-mkw]

# Metrics
duration: ~15min
completed: 2026-07-10
---

# Quick Task 260710-mkw: Steam Grid Cover Art Falls Back to Header Art Summary

**CachedImage now supports an ordered fallback chain (string | string[]), so Steam grid tiles whose portrait capsule (library_600x900.jpg) 404s render the game's own header art (header.jpg) before the generic placeholder.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-10T04:10Z (approx)
- **Completed:** 2026-07-10T04:25Z
- **Tasks:** 2 of 3 (Task 3 is a blocking human-verify checkpoint — left for the user)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Extended `CachedImage` from a single fallback slot to an ordered, bounded fallback chain while keeping single-string callers behaviorally identical
- Wired the Library grid (non-justPlayed) tile to prefer the game's header art before the generic missing-art placeholder
- Added TDD unit coverage proving `src -> fallback[0] -> fallback[1]` ordering, single-string backward compatibility, per-source imagecache retry, chain boundedness, and reset-on-src-change

## Task Commits

1. **Task 1 (RED): failing test for ordered fallback chain** - `6a816532` (test)
2. **Task 1 (GREEN): support ordered fallback chain in CachedImage** - `1603ccda` (feat)
3. **Task 2: prefer Steam header art before placeholder in grid tile** - `dfaf3c2a` (feat)

_Task 1 was `tdd="true"` (test -> feat). No refactor commit needed — implementation was already minimal and clean._

## Files Created/Modified
- `src/frontend/components/UI/CachedImage/index.tsx` - Widened `fallback` to `string | string[]`, normalized to an ordered array, replaced the boolean `useFallback` with a numeric index; `onError` advances through the bounded chain after the existing imagecache-then-raw retry; chain resets to primary on `props.src` change
- `src/frontend/components/UI/CachedImage/__tests__/index.test.tsx` - Unit suite (no jsdom; slot-based useState + dependency-aware useEffect react mock) asserting chain order, backward compatibility, http imagecache retry, boundedness, and reset
- `src/frontend/screens/Library/components/GameCard/index.tsx` - Grid (else) branch now passes `[getImageFormatting(art_cover, runner), fallBackImageMissing]` when `art_cover` is truthy and differs from the portrait capsule; otherwise the bare `fallBackImageMissing`. justPlayed branch and logo image untouched

## Decisions Made
- Kept the single-string fallback path outcome-identical so all existing `CachedImage` callers are unaffected (verified project-wide by `tsc --noEmit`)
- Grid tile guards on `art_cover && art_cover !== cover` so non-Steam runners (whose art_square/art_cover often match) and games without a distinct header keep the original single-placeholder behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected verification commands for this repo's toolchain**
- **Found during:** Task 1 & Task 2 verification
- **Issue:** The plan specified `yarn jest` / `yarn tsc --noEmit -p src/frontend`, but (a) the repo's `packageManager` field is `pnpm@10.28.0` and corepack blocks `yarn`; (b) there is no `tsconfig.json` at `src/frontend` (`tsc -p src/frontend` errors TS5057)
- **Fix:** Ran tests via `pnpm exec jest --selectProjects Frontend ...` and typechecked via the project's canonical `tsc --noEmit` (root tsconfig, same as the `codecheck` script). ESLint run via `pnpm exec eslint`
- **Files modified:** None (tooling invocation only)
- **Verification:** Frontend jest project 28/28 pass; `tsc --noEmit` exit 0 (clean); eslint on GameCard exit 0 (0 errors; 5 pre-existing unrelated warnings left untouched, per scope boundary)
- **Committed in:** N/A (no code change)

---

**Total deviations:** 1 (verification-command correction; no product code impact)
**Impact on plan:** Functional changes match the plan exactly. Only the command invocations were adapted to the actual pnpm-based toolchain. No scope creep.

## Issues Encountered
- The frontend jest project has no jsdom/react-test-renderer (documented in `src/frontend/jest.config.js`). Followed the established project pattern (HumbleKeysWaiting): a module-level `react` mock with slot-based `useState`. Added a dependency-aware `useEffect` to the mock (only re-runs when deps change) so the chain progression is observable across re-renders — a naive run-every-render effect would have wiped the fallback index via CachedImage's src-keyed reset effect.

## Known Stubs
None.

## Threat Flags
None — no new network endpoints, auth paths, or trust-boundary surface. Only URLs already present on GameInfo (art_cover/art_square) are used; the chain is bounded and cannot loop (satisfies threat register T-quick-02).

## User Setup Required
None - frontend-only change, no external service configuration required.

## Next Phase Readiness
- Code complete and verified (tests + typecheck + lint pass).
- **Task 3 remains: a blocking `checkpoint:human-verify`.** The user must launch the app and confirm in the Library grid that Bard's Tale IV (appid 566090) shows its landscape header art instead of the generic placeholder, that games with valid portrait capsules are unregressed, that a game with no usable art still shows the placeholder, and that the Recently Played row + Epic/GOG/Amazon tiles are unchanged.

## Self-Check: PASSED

- All 3 code/test files and the SUMMARY present on disk.
- All 3 task commits (6a816532, 1603ccda, dfaf3c2a) present in git history.

---
*Phase: quick-260710-mkw*
*Completed: 2026-07-10*
