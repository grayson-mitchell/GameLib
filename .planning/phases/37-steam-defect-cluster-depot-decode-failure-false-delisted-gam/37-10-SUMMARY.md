---
phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam
plan: 10
subsystem: steam
tags: [security, path-traversal, containment, install-location, jest, tdd]

# Dependency graph
requires:
  - phase: 37-03a
    provides: "shares src/backend/storeManagers/steam/games.ts with wave 1's delisted-game visibility work — no line-level overlap (37-03a touched filterEngine.ts/gameCount.ts/Console Mode selectors)"
provides:
  - "sanitizeInstalldir — containment-validated (mirrors depot.ts's resolveContainedPath) plus a narrow explicit denylist, replacing the SAFE_INSTALLDIR positive character-class whitelist that rejected ordinary punctuation like apostrophes"
  - "UnsafeInstalldirError — typed security-abort signal distinct from the absent/blank operational fallback"
  - "SteamInstallTarget.installdirFallbackUsed / InstallResult.installdirFallbackUsed — surfaces the D-04 fallback instead of it silently disappearing after resolveSteamInstallTarget"
  - "fallbackInstalldirFor — single shared app_<id> fallback-naming implementation reused by sanitizeInstalldir's own absent/blank branch and library.ts's degrade path"
affects: [steam-install, steam-resume, steam-bridge-launch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Containment-based path validation (mirrors depot.ts's resolveContainedPath/PathTraversalError): resolve(root, candidate) then relative(root, dest), reject if the result starts with '..' or is absolute — pure path arithmetic, no filesystem access, runs before any fs call"
    - "Narrow denylist as defense-in-depth layered UNDER containment, not the primary control — so ordinary filename punctuation (apostrophes, ampersands, parentheses) passes through unchanged while separators/traversal/control-chars/colon/quote are still rejected outright"
    - "Two distinct failure events, never conflated: an absent/blank candidate is an OPERATIONAL event (never throws, falls back with a WARNING); a denylisted/non-contained candidate is a SECURITY event (throws UnsafeInstalldirError, never silently substitutes a fallback)"
    - "A function with a documented 'NEVER throws' contract (buildResumeFinalizeOpts) gets a DEDICATED guard around only the newly-throwing call, not a widened try block — preserves which other failures the existing catch already swallows"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/installLocation.ts
    - src/backend/storeManagers/steam/__tests__/installLocation.test.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/bridge/launchTarget.ts
    - src/common/types/game_manager.ts

key-decisions:
  - "Kept ':' and '\"' in the denylist beyond D-02's literal four-item enumeration (separators, .., leading/trailing dot, control chars) — colon closes a Windows drive-relative escape (path.win32.resolve semantics) the POSIX-only containment check cannot itself catch in this dev/CI environment; quote is redundant-by-design against depot/manifest.ts's own vdfEscape but costs nothing against real Steam installdirs and two pre-existing WR-04 tests already pinned it"
  - "Mirrored (did not import) depot.ts's resolveContainedPath property inline in sanitizeInstalldir, since importing would create a cross-module coupling depot.ts's own module boundary doesn't currently expose, and the property (resolve+relative, reject '..'/absolute) is small enough to duplicate with an explicit cross-reference comment"
  - "buildResumeFinalizeOpts degrades a hostile on-disk ACF to the SAME honest-empty depots:[] shape a planning failure already produces (fails closed to StateFlags=1026), rather than skipping finalizeToSteam entirely — consistent with the existing catch's behavior for any other pre-finalize failure"
  - "installdirFallbackUsed determined independently in resolveSteamInstallTarget (checking the pre-sanitize candidate) rather than widening sanitizeInstalldir's return type to an object — keeps the string-returning contract unchanged for library.ts's buildResumeFinalizeOpts caller, which has no use for the flag"

requirements-completed: [REQ-37-06]

# Metrics
duration: ~65min (visible commit-timestamp span; this plan's Task 1 RED work and initial investigation predate a context compaction mid-session, so total wall-clock time is understated)
completed: 2026-08-22
---

# Phase 37 Plan 10: Fix false-hostile PICS installdir rejection Summary

**Replaced the SAFE_INSTALLDIR positive character-class whitelist with containment validation (mirroring depot.ts's resolveContainedPath) plus a narrow denylist, so apostrophes and other ordinary punctuation in Steam installdirs no longer get silently redirected to an app_<id> fallback — while a genuine traversal/absolute-path attempt now aborts the install honestly instead of laundering the rejected value into a safe-looking name**

## Performance

- **Duration:** ~65 min (commit-timestamp span from Task 1's RED commit to Task 3's completion; earlier investigation in this same session predates a context compaction and is not separately timed)
- **Completed:** 2026-08-22T03:17:26Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- `sanitizeInstalldir` now decides acceptability by CONTAINMENT (`resolve(steamappsDir, 'common')` then `resolve` + `relative` against the candidate, rejecting only a result that starts with `..` or is absolute) instead of a positive character-class whitelist — the exact same property `depot.ts`'s own `resolveContainedPath` already enforces for per-file paths
- A narrow explicit denylist (path separators, `..`, leading/trailing dot, ASCII control chars, plus colon and quote kept as documented defense-in-depth) sits underneath containment as a fast-reject layer, not the primary control — so `Sid Meier's Civilization V`, `Len's Island`, and other apostrophe-bearing names now pass through unchanged
- `UnsafeInstalldirError` gives the two previously-conflated fallback triggers a real split: absent/blank PICS data is an operational event (falls back to `app_<id>`, now with a WARNING log that previously didn't exist — closing the silent-`app_259130` gap); a denylisted/non-contained candidate is a security event that ABORTS the install
- `SAFE_INSTALLDIR` is fully deleted — `grep -c "SAFE_INSTALLDIR"` returns `0` repo-wide
- Found and fixed a **third caller** the plan did not account for (`bridge/launchTarget.ts`'s `resolveBridgeLaunchExe`), which also called `sanitizeInstalldir` directly and needed the same third-argument fix — its existing generic catch already satisfied the "never throws" contract, so no additional wrapping was required there
- `games.ts`'s pre-download catch now checks `UnsafeInstalldirError` first and returns `err.message` (which already contains the word "traversal", so `classifyDepotError`'s existing `/traversal/i` branch renders the plain-language "unsafe file path" copy) instead of mislabeling a security abort as a timeout
- `library.ts`'s `buildResumeFinalizeOpts` wraps only the `sanitizeInstalldir` call in a dedicated guard, catching `UnsafeInstalldirError`, logging at ERROR with the appId and rejected value, and degrading to the same honest-empty `depots: []` shape a planning failure already produces — its documented "NEVER throws" contract is preserved and pinned by a rewritten test
- The D-04 fallback is now surfaced (`SteamInstallTarget.installdirFallbackUsed` / `InstallResult.installdirFallbackUsed`) and logged once in `runNativeDepotDownload`, rather than silently disappearing after `resolveSteamInstallTarget`

## Task Commits

Task 1 (RED tests) was committed in an earlier session segment before this session's context compaction:

1. **Task 1: RED tests for the new 3-arg signature** - `e0d4c145d` (`test(37-10): RED — apostrophe, traversal, and silent-fallback cases for sanitizeInstalldir`)
2. **Task 2: Replace SAFE_INSTALLDIR with containment + narrow denylist (GREEN)** - `71c978733` (`feat(37-10): replace SAFE_INSTALLDIR whitelist with containment + narrow denylist`)
3. **Task 3: Wire callers to the new contract, surface fallback/abort honestly** - `d0db6585b` (`feat(37-10): wire callers to the new sanitizeInstalldir contract, surface fallback/abort honestly`)

_No separate plan-metadata commit — `.planning/STATE.md`/`ROADMAP.md`/`REQUIREMENTS.md` writes were explicitly out of scope for this executor per the concurrent-session git-safety constraints in effect for this session; the orchestrator/next session owns those updates._

## Files Created/Modified

- `src/backend/storeManagers/steam/installLocation.ts` — Deleted `SAFE_INSTALLDIR`/`LEADING_OR_TRAILING_DOT`; added `UnsafeInstalldirError`, `INSTALLDIR_DENYLIST`, containment check, `fallbackInstalldirFor`; widened `sanitizeInstalldir` to a 3-arg signature (`candidate, appId, steamappsDir`); `SteamInstallTarget` gained `installdirFallbackUsed?: boolean`; `resolveSteamInstallTarget` computes and returns the flag, no longer catches the new throw (CALLER 1's abort responsibility moved to `games.ts`)
- `src/backend/storeManagers/steam/__tests__/installLocation.test.ts` — Rewrote the two hostile-installdir tests (traversal, path separator) plus three additional stale WR-04 tests (quote, control-char, colon) from "sanitized to a safe fallback" to "ABORTS with `UnsafeInstalldirError`"; added a `sanitizeInstalldir — REQ-37-06` describe block covering apostrophe/traversal/absolute/separator/dot/control-char accept and abort cases plus the absent/blank fallback-with-warning cases; added a `classifyDepotError` reachability test; added two Task-3 tests (`resolveSteamInstallTarget` REJECTS for traversal; `installdirFallbackUsed === true` when PICS returns nothing, `undefined`/omitted for a well-formed name)
- `src/backend/storeManagers/steam/library.ts` — `buildResumeFinalizeOpts`'s `sanitizeInstalldir` call now passes `target.targetSteamappsDir` and is wrapped in a dedicated try/catch that catches `UnsafeInstalldirError`, logs at ERROR, and degrades to the honest-empty `depots: []` shape
- `src/backend/storeManagers/steam/__tests__/library.test.ts` — Rewrote the WR-03 "hostile installdir sanitized to a fallback, still planned" test to assert the honest-empty degrade instead (buildDepotPlan never called with the hostile value, `finalizeToSteam` still called with `installdir: 'app_730'`, `depots: []`)
- `src/backend/storeManagers/steam/games.ts` — `runNativeDepotDownload`'s pre-download catch checks `UnsafeInstalldirError` first (returns `err.message` directly, never "timed out"); logs and propagates `installdirFallbackUsed` onto the `{status:'done'}` result
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — Extended the `../installLocation` mock factory to export the real `UnsafeInstalldirError` class (via `jest.requireActual`) so `instanceof` checks work against a mocked rejection; added a test proving a `UnsafeInstalldirError` rejection returns `{status:'error', error: <candidate message>}`, never "timed out"
- `src/backend/storeManagers/steam/bridge/launchTarget.ts` — Fixed the previously-unaccounted-for third `sanitizeInstalldir` call site (`resolveBridgeLaunchExe`) to pass the required `steamappsDir` argument, reordering to compute `getBottleSteamappsDir` first
- `src/common/types/game_manager.ts` — `InstallResult` gained `installdirFallbackUsed?: boolean`

## Decisions Made

See key-decisions in frontmatter above (colon/quote denylist retention, mirror-not-import of `resolveContainedPath`, honest-empty degrade shape for `library.ts`, and where the fallback-flag computation lives).

## Deviations from Plan

**1. [Rule 1 - Bug] Three existing WR-04 tests (quote, control-char, colon) needed rewriting, not just the two the plan named**

- **Found during:** Task 2's verification run
- **Issue:** The plan explicitly named only two existing tests to rewrite (traversal at :144, path separator at :162). But my design decision to keep colon/quote (and control chars, part of D-02's literal denylist) in `INSTALLDIR_DENYLIST` as denylisted shapes means all three now correctly ABORT via `UnsafeInstalldirError` instead of falling back — leaving those three pre-existing WR-04 tests (which still asserted the old silent-fallback behavior) failing.
- **Fix:** Rewrote all three to assert `.rejects.toBeInstanceOf(UnsafeInstalldirError)`, consistent with the two REWRITTEN tests the plan did name, and documented the rationale (Windows drive-relative escape for colon, VDF-injection defense-in-depth for quote, D-02's literal enumeration for control chars) inline.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/installLocation.test.ts`
- **Committed in:** `71c978733` (Task 2)

**2. [Rule 3 - Blocking issue] Missing required argument crashed 7/8 library.ts resume tests, and a third caller (bridge/launchTarget.ts) the plan didn't name also needed the signature fix**

- **Found during:** Task 3's verification run (`npx jest .../library.test.ts` and `npx tsc --noEmit`)
- **Issue:** (a) `library.ts`'s `buildResumeFinalizeOpts` called the widened `sanitizeInstalldir(target.installdir, appId)` with only 2 args — `steamappsDir` was `undefined`, so `resolve(undefined, 'common')` threw a raw `TypeError` for any candidate not caught by the denylist, failing 7 of 8 tests in the `startup resume reconciliation (D-04)` describe block. (b) `tsc --noEmit` surfaced a second, plan-unaccounted-for call site: `bridge/launchTarget.ts`'s `resolveBridgeLaunchExe`, which also calls `sanitizeInstalldir` with 2 args.
- **Fix:** Passed `target.targetSteamappsDir` / `getBottleSteamappsDir(bottleName)` as the third argument at both call sites. `launchTarget.ts`'s existing generic `catch (error)` already satisfies its own documented "never throws" contract for the new `UnsafeInstalldirError` case, so no additional wrapping was needed there (unlike `library.ts`, which needed a dedicated guard to preserve its specific honest-empty degrade shape).
- **Files modified:** `src/backend/storeManagers/steam/library.ts`, `src/backend/storeManagers/steam/bridge/launchTarget.ts`
- **Verification:** All 8 `library.test.ts` resume tests pass; `launchTarget.test.ts`'s 8 tests pass; `tsc --noEmit` clean for both files
- **Committed in:** `d0db6585b` (Task 3)
- **Note:** This means the plan's "exactly three `sanitizeInstalldir` references remain repo-wide" acceptance criterion is now four non-test references (the definition plus three call sites: `resolveSteamInstallTarget`, `buildResumeFinalizeOpts`, `resolveBridgeLaunchExe`) — the plan's own file inventory did not enumerate `bridge/launchTarget.ts`.

**3. [Rule 2 - Missing critical functionality] `games.test.ts`'s mock of `../installLocation` did not export the real `UnsafeInstalldirError` class**

- **Found during:** Task 3, adding the defensive games.test.ts test for the new catch branch
- **Issue:** The file's `jest.mock('../installLocation', () => ({ resolveSteamInstallTarget: jest.fn() }))` factory left `UnsafeInstalldirError` as `undefined` inside `games.ts`'s module under test. No existing test exercised this (none made `resolveSteamInstallTarget` reject), so it was a latent landmine rather than an active failure, but `err instanceof undefined` would throw a `TypeError` the moment any future test (or the new one added here) made the mock reject.
- **Fix:** Extended the mock factory to also export `UnsafeInstalldirError: jest.requireActual('../installLocation').UnsafeInstalldirError`, preserving real class identity for `instanceof` checks.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/games.test.ts`
- **Committed in:** `d0db6585b` (Task 3)

---

**Total deviations:** 3 auto-fixed (1× Rule 1 test-correctness, 1× Rule 3 blocking missing-argument/uncounted-caller, 1× Rule 2 latent mock gap). No architectural changes (Rule 4) were needed.
**Impact on plan:** Functional scope grew slightly beyond the plan's stated three-file caller inventory (a fourth non-test `sanitizeInstalldir` reference in `bridge/launchTarget.ts`) but stayed within the plan's own security model (containment + narrow denylist, never-throws contracts preserved everywhere they were documented).

## Issues Encountered

None beyond the deviations above.

## Verification Results

- `npx jest src/backend/storeManagers/steam/__tests__/installLocation.test.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts --silent` — all five green, 670/670 tests passed
- `npx tsc --noEmit -p tsconfig.json` — clean for every file this plan touched; the only remaining errors are pre-existing, unrelated `gamepadDisconnect.test.ts`/`gamepadRepeatTiming.test.ts` duplicate-declaration errors from a concurrent session's dirty untracked/uncommitted files (`git status --short` confirms `gamepadRepeatTiming.test.ts` is untracked `??`, not touched by this plan)
- `npx eslint src/backend/storeManagers/steam/installLocation.ts src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/bridge/launchTarget.ts` — 0 errors (pre-existing `no-unsafe-*` warnings only, all in code this plan did not touch)
- `git status --short public/locales/` — `gamelib.json` shows modified, but that change belongs to the concurrent session (not staged or committed by this plan's two commits — confirmed via `git status --short` after each commit)
- `git diff --name-only 71c978733~1 HEAD` for `depot.ts` — empty; `depot.ts` was not touched
- `grep -c "SAFE_INSTALLDIR" src/backend/storeManagers/steam/installLocation.ts` → `0`
- `grep -rn "sanitizeInstalldir(" src --include="*.ts" | grep -v __tests__` → 4 (1 definition + 3 call sites — see Deviation 2's note)
- `grep -n "UnsafeInstalldirError" src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts` → catch/instanceof present in both
- **Task 1 RED confirmation** (from the pre-compaction session segment, recorded here for completeness): the traversal test case observed failing against the unmodified `SAFE_INSTALLDIR` code path before Task 2's implementation landed, per the RED commit `e0d4c145d`.
- `pnpm test:ci` — 313/314 suites, 6463/6467 tests passed (3 skipped), up from the pre-plan baseline of 6439/6443 (tests were added). Sole failure: `meta/__tests__/genI18nGateScope.test.ts` "A-17 ANTI-ROT" — a pre-existing, documented known-red baseline unrelated to this plan. A transient `meta/__tests__/runTsSignals.test.ts` tmpdir-leak flake appeared on one run and was absent on retry — not investigated further as it is unrelated to Steam installdir handling and outside this plan's scope.
- `git stash list` — empty throughout; no `git reset`/`git stash` run
- No `gsd-sdk state.*` or `roadmap.update-plan-progress` verb invoked this session, per the concurrent-session git-safety constraints in effect

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

`REQ-37-06` is complete. `sanitizeInstalldir` now has a single containment-based definition of "acceptable," shared by all three callers (`resolveSteamInstallTarget`, `buildResumeFinalizeOpts`, `resolveBridgeLaunchExe`), and a genuine security violation aborts honestly instead of laundering into a fallback name. No blockers for downstream 37-series plans. The explicit non-goals (D-01 filesystem orphan scan, D-05 ACF-rewrite for the already-mis-named `app_8930`/`app_25900`/`app_257350` installs) remain out of scope, as planned.

---
*Phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam*
*Completed: 2026-08-22*

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/installLocation.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/installLocation.test.ts`
- FOUND: `src/backend/storeManagers/steam/library.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/library.test.ts`
- FOUND: `src/backend/storeManagers/steam/games.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/games.test.ts`
- FOUND: `src/backend/storeManagers/steam/bridge/launchTarget.ts`
- FOUND: `src/common/types/game_manager.ts`
- FOUND commit: `e0d4c145d` (Task 1, RED, pre-session)
- FOUND commit: `71c978733` (Task 2, GREEN — containment + denylist)
- FOUND commit: `d0db6585b` (Task 3, GREEN — caller wiring)
- `git stash list` — empty
- `git status --short` — the only remaining untracked/modified items are this SUMMARY.md itself and files belonging to a concurrent session (`.planning/phases/32-*`, `.planning/quick/260822-elw-*`, `public/locales/en/gamelib.json`, `src/backend/config.ts`, `src/common/types.ts`, `src/frontend/helpers/gamepad.ts`, `Settings/*`, `tauriWindowChrome.ts`, `gamepadRepeatTiming.test.ts`, `GamePadDelayRepeat.tsx`, `SliderField/`) — none of these were staged or committed by this plan's two commits
