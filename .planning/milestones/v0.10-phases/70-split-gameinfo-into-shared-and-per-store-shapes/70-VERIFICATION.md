---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
verified: 2026-11-14T12:00:00Z
status: passed
score: 9/9 must-haves verified (ARCH-03.1 to ARCH-03.6 plus closed gaps G1, G2, G3)
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 6/6 truths, 3 promoted gaps open
  gaps_closed:
    - "G1: D-15 narrowing ratchet enforced in CI and pre-push even when an earlier step is red (70-17)"
    - "G2: GameInfo shapes a real profile can persist or regenerate pass the strict IPC schemas after the strip (70-18, 70-19, 70-20)"
    - "G3: per-game and global settings on disk pass strict writeConfig/setSetting schemas (70-18, 70-21, 70-22)"
  gaps_remaining: []
  regressions: []
---

# Phase 70: Split GameInfo into shared and per-store shapes - Re-verification Report

**Phase Goal:** `GameInfo` carries only what every store shares; store-specific data lives in per-store shapes (split, readers migrated under a shrink-only ratchet, store types moved out of `common/types.ts`, persisted caches migrated through Phase 68 migrations, Phase 67 passthroughs closed with strict schemas).
**Status:** passed. ARCH-03 remains satisfied.
**Re-verification:** Yes, after gap-closure plans 70-17 to 70-22.

## Previously failed gaps

| Gap | Status | Evidence (checked in code, not SUMMARY) |
|---|---|---|
| G1 ratchet masked by red earlier step | CLOSED | `.github/workflows/lint.yml:52-54` step has `if: ${{ !cancelled() && steps.deps.outcome == 'success' }}`. `.husky/pre-push` runs `pnpm gameinfo-narrowing-ceiling` on its own line outside the `&&` chain, captures `chain_status` and `narrowing_status`, combines into `checks_status`. `gameInfoNarrowingWiring.test.ts` (including a behavioural run of the real hook with a stub pnpm) passes. `node meta/gameInfoNarrowingCeiling.cjs` -> PASS (787 files, 18 allowlisted). |
| G2 strip weaker than strict GameInfo schemas | CLOSED | `storeMigrations/schemaStrip.ts` (`stripToSchema`) derives the strip from the zod schema: undeclared keys at every depth including array elements, null on optional, invalid optionals dropped. Imported by `gameInfoLibraries.ts` (seven chains, v2->v3), and by `steam/library/refresh.ts` (sanitises the `steam_metadata`-derived `extra` at rebuild). Legendary `about.description` defaulted in `legendary/library.ts`. Seven WR-04 fixtures and regression tests pass. |
| G3 settings strips absent | CLOSED | `settingsGame.ts` and `settingsGlobal.ts` import `stripToSchema` against `gameSettingsSchema.partial()` / `appSettingsSchema.partial()`. `constants/others.ts`: `currentGameConfigVersion = 'v2'`, `currentGlobalConfigVersion = 'v2'`. Retired-key (`useSteamRuntime`) and invalid-value fixtures tested, including byte-identical backup assertions. |

## Observable Truths (regression check on the original six, plus gaps)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | ARCH-03.1 shared core, five members, union, narrowing helper | VERIFIED | Unchanged since previous verification; `src/common/__tests__` passes. |
| 2 | ARCH-03.2 readers migrated, shrink-only ratchet wired | VERIFIED | Ratchet PASS (787 files, 18 allowlisted); now also unmasked (G1). |
| 3 | ARCH-03.3 store types out of `common/types.ts` | VERIFIED | `typesHomes` test passes. |
| 4 | ARCH-03.4 passthroughs closed, strict schemas | VERIFIED | Census and ipcSchemas tests pass; strip now schema-derived so strict schemas no longer outrun the strip. |
| 5 | ARCH-03.5 persisted caches migrated via Phase 68 versioned migrations | VERIFIED | gameInfoLibraries chains end at v3; settings/game and settings/global chains at v2; storeMigrations, storeVersioning, settingsVersioning, storeReadOnly suites pass. |
| 6 | ARCH-03.6 live gate on upgraded profile | VERIFIED | 70-UAT.md 13/14 pass; item 3 (Steam Friends re-login after go-offline wrap) is outside phase 70's surface and filed as a todo. |
| 7 | G1 closed | VERIFIED | See above. |
| 8 | G2 closed | VERIFIED | See above. |
| 9 | G3 closed | VERIFIED | See above. |

**Behavioural check:** jest over `meta/__tests__/gameInfoNarrowingWiring`, `storeMigrations`, `storeVersioning`, `settingsVersioning`, `storeReadOnly`, `src/common/__tests__`, steam `library.refresh`, and the legendary dir: 40 suites, 796 of 797 tests pass. The one failure is `epicOfflineMode.test.ts` (signInProbe), a pre-existing failure unrelated to phase 70. `tsc --noEmit` clean per orchestrator.

## Requirements Coverage

| Requirement | Plans | Status |
|---|---|---|
| ARCH-03 (.1 to .6) | 70-01..70-22 (frontmatter declares ARCH-03 and ARCH-03.1 to .6 across plans; 17-22 declare ARCH-03, .2, .4, .5) | SATISFIED. REQUIREMENTS.md line 35 `[x]`, traceability row "Complete". No orphaned IDs for Phase 70. |

## Review warnings (70-REVIEW.md, 0 critical, 3 warnings) - weighed

None blocks the goal; no must-have truth is falsified. Reviewer verdicts: WR-01 resolved, WR-04 and WR-05 resolved with residual. They are carried as follow-ups (WARNING, not BLOCKER):

- **Review WR-01 (union coercion):** a persisted `lastUsedLaunchOption` of type dlc/altExe can be coerced to a basic launch option because the base arm's optional `type` is dropped. Silent, but needs a specific on-disk value and loses only a remembered launch choice; the original is in the engine backup. Fix: prefer arms whose literal members already match; add dlc/altExe regression tests.
- **Review WR-02 (whole-setting deletion on one bad leaf):** e.g. one null in `enviromentOptions` or a `gamescope` object lacking `additionalOptions` drops the whole setting at migration. Real data-loss risk for user-state settings, recoverable only from the 0600 backup. This does not falsify "settings on disk pass the strict schemas" (they do), but it is the highest-priority follow-up. Fix: element-granular drop, pre-repair legacy gamescope, log removed keys. Recommend before release to users with older profiles.
- **Review WR-03 (only Steam re-strips on regeneration; Legendary `description: null` not covered; no validation log):** GOG/Legendary/Nile producers are typed and trusted; residual only.
- Info items (strip header over-claims, rewrite+backup of every per-game file on first access) are follow-ups. Earlier follow-ups WR-02/03/06/07, IN-01/02 from the first verification remain filed in the pending todo.

## Anti-patterns

None blocking in phase-70 files. Unrelated working-tree changes (`src/frontend/screens/Game/GamePage/**`) not attributed to this phase. Failing suites listed by orchestrator are outside phase-70 files.

## Human verification

None outstanding. The live gate (D-16) was run; the post-gap-closure migrations (v3 GameInfo, settings v2) are covered by fixture-based tests with backup assertions rather than a repeat live gate. Optional: an operator may sanity-check one upgraded profile for the first-access backup churn noted in review IN-02.

## Gaps Summary

G1, G2, G3 are closed in code and tests. ARCH-03.1 to ARCH-03.6 hold. Recommend scheduling the review WR-01/WR-02 hardening as a follow-up phase or quick task before shipping to users with older profiles.

_Verified: 2026-11-14_
_Verifier: Claude (gsd-verifier)_
