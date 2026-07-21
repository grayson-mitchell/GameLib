---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 13
subsystem: steam-bridge
tags: [steam, macos, crossover, wine, install-poll, launch-guard, gap-closure]

# Dependency graph
requires:
  - phase: 24-11
    provides: byte-identity shim placement guard (placeShimForGame actually overwrites a game's own steam_api.dll)
  - phase: 24-12
    provides: "'bridge' AcfSource + getBridgeBottleSteamappsRoot() so readAcfState/pollInstallOnce can read the bridge bottle's own manifest"
provides:
  - "installBridgeGame polls the bridge bottle (pollerSource:'bridge') instead of the unrelated Phase 17 GameLibSteam bottle (D-UAT-24-05 wiring closed)"
  - "clearBridgeFailedThisSession(appId) — un-poisons a session-sticky bridge failure on a successful (re)install (D-UAT-24-03 cascade a)"
  - "launchBridgeGame on-disk existence gate (existsSync + isBridgeBottleReady) before firing runWineCommand — no fire-and-forget wine at a non-existent exe (D-UAT-24-02)"
affects: [24-14, gate-2-3-4-hardware-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Local option-type widening (pollerSource?: 'bottle' | 'bridge') independent of the library.ts AcfSource union — two separate type surfaces, both must be kept in sync manually"
    - "Recoverable-vs-failure distinction in bridge routing: an install-state mismatch (not-installed-through-bridge) does NOT call markBridgeFailedThisSession, only a genuine bridge malfunction does"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts

key-decisions:
  - "clearBridgeFailedThisSession is called unconditionally on installBridgeGame's success path (even when the appId was never marked failed) — cheap no-op idempotent Set.delete(), simpler than conditionally checking first"
  - "launchBridgeGame's on-disk existence gate treats a not-installed-through-bridge state as RECOVERABLE, not a bridge failure — deliberately does not call markBridgeFailedThisSession, since poisoning the session would block the very bridge (re)install the steamBridgeSetupRequired dialog offers as the fix"
  - "Reused the existing existsSync binding imported from graceful-fs at games.ts's top (not a new node:fs import) to avoid a duplicate-identifier compile error, per the plan's interface note"

patterns-established:
  - "A resolved-but-unverified filesystem target (launch exe path, install bottle) must be existence-checked before being handed to a fire-and-forget external process call (runWineCommand wait:false) — resolution success alone does not prove the target is real"

requirements-completed: [R6, R7]

# Metrics
duration: ~25min
completed: 2026-07-21
---

# Phase 24 Plan 13: games.ts bridge-integration gap closure (install poll + launch existence guard) Summary

**installBridgeGame now polls the correct (bridge) bottle and un-poisons the session on success; launchBridgeGame verifies the resolved exe actually exists on disk before firing wine, closing D-UAT-24-05, D-UAT-24-03, and D-UAT-24-02.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-21T02:37:07Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- **D-UAT-24-05 wiring closed:** `installBridgeGame` now passes `pollerSource: 'bridge'` to `installDepotDownload` (was hardcoded `'bottle'`, which watches the unrelated Phase 17 `GameLibSteam` bottle and never observes the bridge install's manifest). Widened both local `pollerSource?` option-type declarations on `installDepotDownload`/`runNativeDepotDownload` from `'bottle'` to `'bottle' | 'bridge'` — these hardcode the literal and do NOT derive from library.ts's `AcfSource`, so 24-12's widening of that separate union alone would not have made `'bridge'` type-check here. `installBottleNative`'s Phase 17 call site is untouched, still passing `'bottle'`.
- **D-UAT-24-03 cascade (a) closed:** added exported `clearBridgeFailedThisSession(appId)`, called on installBridgeGame's success path (after `markBridgeGameInstalled`). A single earlier recoverable bridge failure no longer stays sticky for the rest of the process once a later install actually succeeds — `isBridgeEligible()` (consulted by both install() and launch()) now sees a clean slate for that appId again.
- **D-UAT-24-03 cascade (b) verified:** `markBridgeGameInstalled`'s recorded `install.install_path` (via `resolveBridgeGameInstallRoot`) was already correctly rooted under the bridge bottle's `steamapps/common/<installdir>` — added a regression test proving it, since the earlier (b) symptom was caused entirely by (a)'s sticky-flag cascade forcing the retry down the wrong path, not a separate install-path bug.
- **D-UAT-24-02 closed:** `launchBridgeGame` now checks `!isBridgeBottleReady() || !existsSync(exePath)` immediately before the `runWineCommand` try block. If the bridge bottle/exe is absent (game is `is_installed:true` via a native 32-bit Mac build or an old Phase 17 bottle, never actually installed through the bridge), it surfaces `steamBridgeSetupRequired` (`reason: 'bridge-not-installed'`, `fallbackAvailable: true`) and returns `false` — never a silent fire-and-forget wine invocation at a path that doesn't exist. Deliberately does NOT call `markBridgeFailedThisSession` for this state (it's recoverable — poisoning the session would block the very bridge install the dialog offers).
- Genuine bridge failures (helper not ready, `resolveBridgeLaunchExe` unresolvable, `runWineCommand` throw) are unchanged — still mark bridge-failed and fire the setup dialog (R7 regression-tested).

## Task Commits

Both tasks landed in a single commit — see Deviations below for why.

1. **Task 1 (install-side: widen pollerSource, poll bridge bottle, clear-on-success) + Task 2 (launch-side: existence gate before runWineCommand)** - `b4bc94e8` (fix)

## Files Created/Modified
- `src/backend/storeManagers/steam/games.ts` — `clearBridgeFailedThisSession` export added; `installBridgeGame`'s `installDepotDownload` call switched to `pollerSource: 'bridge'`; both local `pollerSource?` option types widened to `'bottle' | 'bridge'`; `clearBridgeFailedThisSession(this.appId)` called on installBridgeGame's success path; deviation comment above the synchronous `markBridgeGameInstalled` flip rewritten to describe the corrected poller target; `launchBridgeGame` gained an `existsSync(exePath)` + `isBridgeBottleReady()` guard before `runWineCommand`, firing `steamBridgeSetupRequired` (`reason: 'bridge-not-installed'`) and returning `false` on failure, without marking bridge-failed
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — imports `clearBridgeFailedThisSession` and `existsSync` (graceful-fs); install-side bridge-routing describe block gained tests for `pollerSource: 'bridge'` wiring, install-path-under-bridge-bottle, clear-on-success (via the exported un-poison hook), and failed-install-still-marks-and-does-not-clear; launch-side bridge-routing describe block's `beforeEach` now defaults `isBridgeBottleReady`/`existsSync` to `true` (so pre-existing happy-path tests keep exercising a "genuinely bridge-installed" state) and gained two new tests: the D-UAT-24-02 not-installed-through-bridge no-op-prevention case (plus a black-box proof that a later retry with the exe present is NOT poisoned) and an explicit happy-path-preserved case

## Decisions Made
- `clearBridgeFailedThisSession` is called unconditionally on success (not gated on "was this appId previously marked failed") — `Set.delete()` on an absent entry is a safe no-op, and conditionally checking first would add complexity for no behavioral benefit.
- The D-UAT-24-02 install-state-mismatch launch path is explicitly classified as recoverable, not a bridge failure — this is the plan's own design intent (finding it any other way would re-poison the exact retry path the dialog is meant to unlock).

## Deviations from Plan

### Process deviation (not a Rule 1-4 code deviation)

**Both tasks landed in a single commit (`b4bc94e8`) instead of two atomic per-task commits.** After staging Task 1's hunks precisely via `git apply --cached` (verified staged diff excluded the Task 2 `existsSync` guard), running `git commit -m "..." -- <pathspec>` unexpectedly committed the full *working-tree* content of the named paths rather than only what had been staged for them — a known git behavior where `git commit <pathspec>` implicitly stages the current working-tree state of those paths before committing, overriding a prior partial `git add`/`git apply --cached`. Both tasks' changes are correctly and completely present in the resulting commit (verified via `git show --stat` matching the full intended diff, and the working tree was clean afterward with no leftover unstaged hunks) — this is a commit-granularity process deviation, not a functional gap. No code was lost or miscommitted.

### Auto-fixed Issues

None beyond the plan's own specified actions — both tasks' `<action>` specs were followed as written.

---

**Total deviations:** 1 process deviation (commit granularity), 0 code auto-fixes.
**Impact on plan:** None on functionality — both tasks' behavior, tests, and acceptance criteria are fully satisfied; only the number of separate git commits differs from the plan's two-commit expectation.

## Issues Encountered
None beyond the commit-granularity issue documented above.

## User Setup Required
None - no external service configuration required.

## Requirements

This plan's frontmatter lists `requirements: [R6, R7]` (24-SPEC.md's short numbering). REQUIREMENTS.md's minted IDs are `REQ-24-06`/`REQ-24-07`, both already tracked there as **Partial**/**Complete (code-complete)** respectively, with hardware confirmation explicitly deferred to Plan 24-10-and-successors (now the 24-11..24-14 gap cycle). This plan closes code-level defects only (D-UAT-24-05/24-03/24-02) — it does not itself perform the live hardware re-verification that REQ-24-06's "reach playable single-player" bar requires (that is 24-14's job per this plan's own `<success_criteria>`). `requirements.mark-complete R6 R7` was run and correctly no-op'd (`not_found`, since the literal IDs differ) — REQUIREMENTS.md's existing Partial/Complete-code-complete status for REQ-24-06/07 is left untouched rather than being force-marked complete ahead of the still-pending hardware gate.

## Next Phase Readiness
- All of `pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts --silent` (164/164 passing), `pnpm codecheck` (clean), and the acceptance-criteria greps (widened pollerSource types x2, installBridgeGame passing `'bridge'`, `clearBridgeFailedThisSession` exported, `existsSync` guard present in `launchBridgeGame`) are green.
- `pnpm test:ci` surfaced two pre-existing, order-dependent failures (`HumbleKeysWaiting` and a `library.ts` `pollUninstallOnce` leaked-timer crash) that are unrelated to this plan's scope — both pass individually in isolation, and the `library.ts` leaked-timer issue is already tracked in project memory (`library.ts-leaked-timer-jest-exit-1`) as a known pre-existing issue, not caused by this plan's changes (games.ts/games.test.ts only).
- Combined with 24-11 (shim now actually placed on disk) and 24-12 (poll reads the correct bridge-bottle manifest), the full install→shim→launch integration path is now code-complete: a bridge install polls the right bottle and un-poisons the session; a bridge launch never fires wine at a path that isn't there. Live hardware re-verification of Gates 2-4 (R5/R6) remains 24-14's job per this plan's success criteria — this plan only closes the code-level defect cluster, it does not itself re-run the hardware UAT.

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/games.ts
- FOUND: src/backend/storeManagers/steam/__tests__/games.test.ts
- FOUND commit: b4bc94e8

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-21*
