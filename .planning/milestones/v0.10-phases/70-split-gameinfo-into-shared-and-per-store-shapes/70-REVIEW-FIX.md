---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
fixed_at: 2026-11-14T06:24:03Z
review_path: .planning/phases/70-split-gameinfo-into-shared-and-per-store-shapes/70-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 70: Code Review Fix Report

**Fixed at:** 2026-11-14
**Source review:** .planning/phases/70-split-gameinfo-into-shared-and-per-store-shapes/70-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 3 (WR-01, WR-02, WR-03; the RESOLVED gap verdicts are not findings)
- Fixed: 3. WR-01 and WR-02 change migration logic and need human verification. WR-03 is fixed except for sub-point 3, which is left open (see below).
- Skipped: 0

## Fixed Issues

### WR-01: Union handling can silently turn a launch option into a different variant

**Status:** fixed: requires human verification (logic change)
**Files modified:** `src/backend/storeMigrations/schemaStrip.ts`, `src/backend/storeMigrations/__tests__/schemaStrip.test.ts`
**Commit:** 57fd1d3df
**Applied fix:** Union cleaning now runs in two passes:

- **Pass 1 is lossless.** It removes only undeclared keys and rejected nulls, with no `dropInvalidOptional` or `dropInvalidElements`. The first arm the result satisfies wins.
- **Pass 2 is lossy.** It runs only on arms whose literal members the value already matches (the new `literalMembersMatch`).

A `type: 'dlc'` or `type: 'altExe'` value can no longer win as `basic` by having its own discriminant dropped. A value with an unknown `type` matches no arm in pass 2, so it is returned unchanged. The settings strip then drops it as an invalid optional.

New tests cover:

- the dlc case and the altExe case from the review;
- the unknown-discriminant case;
- a case showing that pass 2 still repairs an arm whose literal the value matches.

### WR-02: A whole user setting is deleted when one leaf inside it is bad

**Status:** fixed: requires human verification (user-settings migration behaviour change)
**Files modified:** `src/backend/storeMigrations/schemaStrip.ts`, `src/backend/storeMigrations/settingsStrip.ts` (new), `src/backend/storeMigrations/settingsGame.ts`, `src/backend/storeMigrations/settingsGlobal.ts`, `src/backend/storeMigrations/__tests__/settingsGame.test.ts`, `src/backend/storeMigrations/__tests__/settingsGlobal.test.ts`, `src/backend/storeVersioning/__tests__/settingsFiles.test.ts`
**Commit:** 170191481
**Applied fix:**

- `StripOptions` has a new optional `dropInvalidElements`. With it set, an array element that still fails after cleaning is removed and its valid siblings stay. GameInfo callers do not set it, so their behaviour is unchanged.
- The new helper `settingsStrip.ts` exports `stripSettings`, now used by both `settings-game-v1-v2` and `settings-global-v1-v2`. It does three things:
  1. It repairs the legacy `gamescope` shape before validating. A missing or null `additionalOptions` becomes `''` and a missing or null `enableForceGrabCursor` becomes `false`. These are the values the runtime already assumed: `gamescopeCommand.ts` uses `additionalOptions ?? ''`, and a falsy grab-cursor adds no flag. `enableForceGrabCursor` was added in 9c96e11f4 (2025-03), after the first gamescope build, so it is the same kind of additive field.
  2. It strips with `dropInvalidOptional` and `dropInvalidElements`.
  3. It writes one stderr line per file region listing the removed and cleaned top-level keys by name, never by value. It uses stderr, not `backend/logger`, because importing the logger causes a module-init cycle (same reason as `storeVersioning/backup.ts`).
- Existing assertions that expected the older-build `gamescope` to be dropped now expect it to be repaired. These are in `settingsGame.test.ts` and `settingsFiles.test.ts`. New tests cover:
  - element-level drops for `enviromentOptions`, `wrapperOptions`, `gogSaves`, `dismissedSignInNotices` and `customWinePaths`;
  - a `gamescope` missing both additive fields;
  - the log line naming keys without leaking a value, and staying silent when nothing changes.

**Caveat for the verifier:** this changes the existing `v1 -> v2` step in place; it does not add a `v3` step. Any settings file that an earlier build already stamped `v2` will not be migrated again. Whatever that earlier strip dropped stays dropped in the live file and survives only in the 0600 pre-migration backup. Re-running the improved strip on those files would need a new `v2 -> v3` step, and adding one is a product decision that I did not make.

### WR-03: Only the Steam regeneration path keeps GameInfo clean; nothing reports an entry that is still invalid

**Status:** fixed: sub-points 1 and 2 done; sub-point 3 left open
**Files modified:** `src/backend/storeManagers/legendary/library.ts`, `src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts`, `src/backend/storeMigrations/schemaStrip.ts`, `src/backend/storeMigrations/gameInfoLibraries.ts`, `src/backend/storeMigrations/__tests__/gameInfoLibraries.test.ts`, `src/backend/storeManagers/steam/library/refresh.ts`, `src/backend/storeManagers/steam/__tests__/library.refresh.test.ts`
**Commit:** da18dac0b
**Applied fix:**

1. **Legendary null description.** `loadFile` now reads `description` and `shortDescription` with `?? ''` through a locally widened view of the parsed payload. The declared type says `string`, but the JSON is never checked against that type. The existing G2 test now runs for both the omitted case and the null case. I confirmed that the null case fails without the fix.
2. **Still-invalid entries are now reported.**
   - New pure helper `invalidPaths(value, schema)` in `schemaStrip.ts`. It returns dot-joined issue paths and never values.
   - Steam `refresh.ts` calls `logWarning` with the app id and the paths when an entry is still invalid after the strip, for example a missing `title`.
   - The `gameInfoLibraries.ts` migration strip writes a stderr line with the `app_name` and the paths. Like WR-02, it uses stderr rather than the logger to avoid the module-init cycle.
   - Tests cover both paths and check that no value is logged.
3. **Not done: the GOG, Legendary and Nile `library.set` sites.** The review offers two options: strip at each site, or record the producers as trusted and add a per-producer parity test. Choosing between them is a design decision about where cleaning belongs:
   - Stripping adds a per-refresh cost and could mask producer bugs.
   - The parity test needs a representative output fixture for each producer.

   I did not choose for you. This sub-point stays open for the phase owner.

## Verification (real results)

- `npx prettier --check` on the exact paths edited in each commit: all clean.
- `npx tsc --noEmit -p .`: no errors after each commit.
- `npx eslint` on the WR-02 and WR-03 paths:
  - `src/backend/storeManagers/steam/__tests__/library.refresh.test.ts:529` has one `no-unnecessary-type-assertion` error. It already exists at HEAD without my changes (it is the existing G2 test's `as any`) and is not mine.
  - The other warnings are the existing `shlex` default-import warnings.
- Jest:
  - `src/backend/storeMigrations`, `src/backend/storeVersioning`, `settingsVersioning`, `storeReadOnly` and `engineConfig`: all pass.
  - `src/backend/storeManagers/steam` plus `src/backend/storeManagers/legendary`: 3 failures out of 4851 tests. They are `epicOfflineMode` R8 gate 6c, `shimCoverage` and `shimGenerate` (both of the last two fail on `steam_api.def`). The same 3 tests fail in the main checkout and in the fix worktree with my changes stashed, so my changes did not cause them.

---

_Fixed: 2026-11-14_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
