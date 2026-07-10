---
phase: 16-crossover-compatibility-rating-codeweavers
plan: 01
subsystem: api
tags: [backend, wiki-game-info, codeweavers, crossover, jsonld, scraping, jest]

# Dependency graph
requires:
  - phase: 07-game-details-enrichment
    provides: applegamingwiki/utils.ts fetch+cacheable-miss template, WikiInfo type model
provides:
  - "CodeweaversInfo type + WikiInfo.codeweavers field (common/types.ts)"
  - "getInfoFromCodeweavers(title) backend lookup — content-based hit/miss, D-04 slugify fixes, one-shot fallback slug, D-09 miss/error contract"
  - "codeweavers/constants.ts — BASE_URL, BROWSER_USER_AGENT, SOFT_404_TITLE_RE, ldJsonRegEx"
affects: [16-02-orchestrator-wiring, 16-03-frontend-crossover-row]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Content-based hit/miss detection for a soft-404 API (never HTTP status)"
    - "Single bounded fallback-slug retry (primary D-04 slug -> naive pre-D-04 slug, max 2 requests)"
    - "Cacheable-miss sentinel object vs null-for-retry, mirrored from applegamingwiki/utils.ts"

key-files:
  created:
    - src/backend/wiki_game_info/codeweavers/constants.ts
    - src/backend/wiki_game_info/codeweavers/utils.ts
    - src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts
  modified:
    - src/common/types.ts
    - src/backend/wiki_game_info/wiki_game_info.ts

key-decisions:
  - "Roman-numeral normalization only applies to the PRIMARY slug; the naive fallback slug leaves roman numerals untouched, which is what recovers real titles like 'Grand Theft Auto V' whose actual CodeWeavers slug keeps the literal roman numeral"
  - "wiki_game_info.ts orchestrator gets a codeweavers: null placeholder (not real wiring) — the required WikiInfo.codeweavers field broke tsc otherwise, and real Promise.all wiring + self-heal guard is explicitly plan 16-02's scope"

requirements-completed: [SC-02, D-01, D-02, D-03, D-04, D-05, D-09]

# Metrics
duration: ~14min
completed: 2026-07-10
---

# Phase 16 Plan 01: CodeWeavers Backend Lookup Service Summary

**getInfoFromCodeweavers backend service: fetches CodeWeavers CrossOver compatibility pages by constructed slug, parses VideoGame JSON-LD aggregateRating, and classifies hit/miss by page content (never HTTP status) with a D-04-fixed slugify and one bounded fallback-slug retry.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-07-10T06:10:00Z
- **Completed:** 2026-07-10T06:24:00Z
- **Tasks:** 2 completed
- **Files modified:** 5 (2 new source, 1 new test, 2 modified)

## Accomplishments
- `CodeweaversInfo` type + `WikiInfo.codeweavers` field added to `common/types.ts` (interface-first, unblocks plans 02/03)
- `codeweavers/constants.ts`: `BASE_URL`, `BROWSER_USER_AGENT`, `SOFT_404_TITLE_RE`, non-greedy `ldJsonRegEx`
- `getInfoFromCodeweavers(title)`: content-based hit/miss (D-03), D-04 slugify fixes (apostrophe-drop + roman-numeral-to-Arabic), single bounded fallback slug (`naiveSlugify`), D-09 cacheable-miss-vs-retryable-error contract
- 16 passing tests covering every `<behavior>` case in the plan (hit, soft-404 miss, fetch error, UA-header regression, fallback hit, fallback double-miss, all slugify/naiveSlugify cases)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define CodeweaversInfo type + WikiInfo field + constants module** - `45661ff0` (feat)
2. **Task 2 RED: add failing tests for getInfoFromCodeweavers** - `2719043d` (test)
2. **Task 2 GREEN: implement getInfoFromCodeweavers** - `9884a00f` (feat)

**Plan metadata:** (this commit, following SUMMARY.md creation)

_TDD task (Task 2) has the expected two commits: test (RED) -> feat (GREEN). No refactor commit was needed — the GREEN implementation was already clean (0 tsc errors, 0 eslint errors, only pre-existing-style `warn`-level unsafe-any lint warnings matching the rest of the wiki_game_info sources)._

## Files Created/Modified
- `src/common/types.ts` - Added `CodeweaversInfo` interface (rating/ratingCount/slug) and `WikiInfo.codeweavers` field
- `src/backend/wiki_game_info/codeweavers/constants.ts` - BASE_URL, BROWSER_USER_AGENT, SOFT_404_TITLE_RE, ldJsonRegEx
- `src/backend/wiki_game_info/codeweavers/utils.ts` - `slugify`, `naiveSlugify`, `extractVideoGameJsonLd`, `getInfoFromCodeweavers`
- `src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts` - 16 test cases mirroring the applegamingwiki test harness
- `src/backend/wiki_game_info/wiki_game_info.ts` - Rule 3 placeholder `codeweavers: null` in the returned literal (see Deviations)

## Decisions Made
- Roman-numeral normalization applies only to the primary (D-04) slug, not the naive fallback slug. This is deliberate: real CodeWeavers slugs sometimes keep the literal roman numeral (e.g. "Grand Theft Auto V" -> `grand-theft-auto-v`, confirmed live in the spike), so converting it on the primary attempt would miss, and the naive fallback (roman numerals untouched) recovers the hit. Conversely "Call of Duty: Modern Warfare II" -> `call-of-duty-modern-warfare-2` genuinely needs the primary conversion. The one-fallback design handles both directions without extra retries.
- `MAX_CONTENT_LENGTH` capped at 5MB on the axios call (T-16-02 — bounds parse cost against a pathological response).
- Desktop Chrome User-Agent string reused verbatim from the validated spike script (`spike/crossover-compat-lookup.mjs:75-76`) rather than the applegamingwiki Linux/Firefox-style UA, since it was the one empirically confirmed against codeweavers.com's Cloudflare.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `codeweavers: null` placeholder to wiki_game_info.ts's returned literal**
- **Found during:** Task 1 (adding `codeweavers: CodeweaversInfo | null` to `WikiInfo`)
- **Issue:** Making `WikiInfo.codeweavers` a required (non-optional) field broke `tsc --noEmit` — the existing `wiki_game_info.ts` orchestrator builds and returns a `wikiGameInfo` object literal that didn't have a `codeweavers` property, so TS raised `TS2741: Property 'codeweavers' is missing in type ... but required in type 'WikiInfo'` at the return site. This is out of this plan's stated `files_modified` list (only types.ts + constants.ts) but was a direct, unavoidable consequence of the type change this task specifies.
- **Fix:** Added a `codeweavers: null` field to the `wikiGameInfo` object literal with a `TODO(phase-16-02)` comment pointing at the real `Promise.all` wiring + self-heal guard that plan 16-02 (the orchestrator plan) is scoped to implement. No fetch logic was wired here — this is a type-safety placeholder only, not a functional change.
- **Files modified:** `src/backend/wiki_game_info/wiki_game_info.ts`
- **Verification:** `pnpm codecheck` exits 0; `pnpm test` — all 833 tests pass (no regressions).
- **Committed in:** `45661ff0` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep the interface-first Task 1 self-contained and compiling; no functional/behavioral change, no scope creep into plan 16-02's orchestrator wiring.

## Issues Encountered
- `pnpm lint` (the package.json script) always runs `eslint --cache .` against the whole repo regardless of path args, and crashes on a pre-existing, unrelated typed-linting error in `spike/crossover-compat-lookup.mjs` (a throwaway `.mjs` spike file not excluded from typed linting, unlike `.cjs`). This is out of scope for this plan (not caused by any file this plan touches). Verified the actual acceptance criterion — "codeweavers/ + touched files lint clean" — via a scoped `npx eslint --cache src/backend/wiki_game_info/codeweavers src/backend/wiki_game_info/wiki_game_info.ts src/common/types.ts` invocation: 0 errors (8 pre-existing-style `warn`-level unsafe-any warnings, matching the rest of the wiki_game_info sources' lint posture). Logged to `.planning/phases/16-crossover-compatibility-rating-codeweavers/deferred-items.md` for a future housekeeping task.

## TDD Gate Compliance

Task 2 (`tdd="true"`) followed the full RED -> GREEN cycle:
- RED: `2719043d` `test(16-01): add failing tests for getInfoFromCodeweavers` — confirmed failing (module not found) before any implementation existed.
- GREEN: `9884a00f` `feat(16-01): implement getInfoFromCodeweavers ...` — all 16 tests pass immediately after implementation, no iteration needed.
- REFACTOR: not needed — implementation was clean on first pass (0 tsc errors, 0 lint errors).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `getInfoFromCodeweavers` is exported and ready for plan 16-02 to wire into `wiki_game_info.ts`'s `Promise.all` (replacing the `codeweavers: null` placeholder) gated `isMac || isLinux` (D-07), plus the parallel `staleCrossoverData` self-heal guard described in `16-PATTERNS.md`.
- `CodeweaversInfo` / `WikiInfo.codeweavers` types are ready for plan 16-03's frontend row (deep-link target is the stored `slug` field, per D-08 discretion).
- No blockers. `spike/` directory (spike script + FINDINGS.md) remains present per its own note ("delete once the GO decision has been acted on") — safe to delete once plan 16-02/03 land and this phase ships, at the phase's discretion.

---
*Phase: 16-crossover-compatibility-rating-codeweavers*
*Completed: 2026-07-10*

## Self-Check: PASSED

All created/modified files verified present on disk; all 4 commit hashes
(45661ff0, 2719043d, 9884a00f, 935de1cb) verified present in git log.
