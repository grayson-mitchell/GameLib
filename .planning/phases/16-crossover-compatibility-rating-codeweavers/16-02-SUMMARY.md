---
phase: 16-crossover-compatibility-rating-codeweavers
plan: 02
subsystem: api
tags: [backend, wiki-game-info, codeweavers, crossover, orchestrator]

# Dependency graph
requires:
  - phase: 16-crossover-compatibility-rating-codeweavers
    plan: 01
    provides: "getInfoFromCodeweavers(title) backend lookup service + CodeweaversInfo/WikiInfo types"
provides:
  - "getWikiGameInfo fetches CodeWeavers data on Mac AND Linux (isMac || isLinux gate, D-07)"
  - "codeweavers field flows through the returned + cached WikiInfo object (SC-02)"
  - "staleCrossoverData self-heal guard migrates cache entries written before CodeWeavers existed"
affects: [16-03-frontend-crossover-row]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-platform self-heal guard (staleCrossoverData) mirroring the existing staleAppleData pattern for cache migration"

key-files:
  created: []
  modified:
    - src/backend/wiki_game_info/wiki_game_info.ts

key-decisions:
  - "Title-only lookup for all runners (D-02) — no runner==='steam' branch was added for CodeWeavers, unlike the ProtonDB precedent in the same file"
  - "Both isMac and isLinux gate the fetch (D-07), unlike AppleGamingWiki (isMac-only) and umuId (isLinux-only)"

requirements-completed: [SC-02, D-02, D-07]

# Metrics
duration: ~8min
completed: 2026-07-10
---

# Phase 16 Plan 02: CodeWeavers Orchestrator Wiring Summary

**Wired `getInfoFromCodeweavers` into `getWikiGameInfo`'s `Promise.all`, gated `isMac || isLinux` and title-derived for every runner, with a `staleCrossoverData` self-heal guard that migrates pre-existing cache entries and a `codeweavers` field now flowing into the cached `WikiInfo`.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-10T06:21:00Z
- **Completed:** 2026-07-10T06:29:00Z
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments
- Imported `getInfoFromCodeweavers` from `./codeweavers/utils` alongside the existing `getInfoFromAppleGamingWiki` import
- Added `codeweavers` to the `Promise.all` fetch list, gated `isMac || isLinux ? getInfoFromCodeweavers(title) : null` — title-only call, no `appName`/`runner` wiring (D-02, D-07)
- Added `staleCrossoverData` self-heal guard (`(isMac || isLinux) && !cachedResponse?.codeweavers`), folded into the early-return cache-hit guard alongside `staleAppleData`
- Replaced the plan-01 `codeweavers: null` placeholder in the assembled `wikiGameInfo` object with the real fetched `codeweavers` value, so it is both returned to the caller and persisted via `wikiGameInfoStore.set` (SC-02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire CodeWeavers fetch + self-heal + cache into getWikiGameInfo** - `7817fafc` (feat)

**Plan metadata:** (this commit, following SUMMARY.md creation)

## Files Created/Modified
- `src/backend/wiki_game_info/wiki_game_info.ts` - Added CodeWeavers import, Promise.all entry (isMac || isLinux gated, title-only), staleCrossoverData self-heal guard, and codeweavers field in the assembled+cached WikiInfo object (replacing the plan-01 null placeholder)

## Decisions Made
- No new decisions beyond what was locked in the plan/patterns doc. Followed the AppleGamingWiki/umuId precedent structure exactly, per plan direction, deliberately diverging only where D-02 (title-only, no runner branch) and D-07 (dual-platform gate) required it.

## Deviations from Plan

None - plan executed exactly as written. The three edit sites (import, Promise.all entry + self-heal guard, assemble+cache) matched the plan's description and the 16-PATTERNS.md analog precisely; no unplanned work was needed.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `WikiInfo.codeweavers` is now populated end-to-end (backend fetch -> cache -> return) on Mac and Linux sessions, ready for plan 16-03's frontend row to consume via the shared `wikiInfo` context/prop, independent of `applegamingwiki` per D-08.
- The self-heal guard ensures any cache entries written during plan 16-01's `codeweavers: null` placeholder period will be treated as stale and re-fetched on next access — no manual cache clear needed.
- No blockers.

---
*Phase: 16-crossover-compatibility-rating-codeweavers*
*Completed: 2026-07-10*

## Self-Check: PASSED

All modified files verified present on disk; commit hash 7817fafc verified present in git log.
