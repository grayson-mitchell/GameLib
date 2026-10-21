---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 12
subsystem: steam-bridge
tags: [steam-bridge, helper-process, identity-fallback, notifications, launch-path]

requires:
  - phase: 51-04
    provides: "D-51-04 decision (identity-only 480 fallback on real-AppID init failure) and D-51-02 decision (one-time per-game limited-features notice)"
  - phase: 51-09
    provides: "launchBridgeGame's ordering (placeShimForGame -> ensureBridgeHelperReady -> writeBridgeConfig -> fireBridgeWineLaunch) this plan slots maybeNotifyBridgeLimited into"
  - phase: 51-10
    provides: "bridge_helper.c's --identity-only/--report-appid argv and mode=identity-only LISTEN line"
provides:
  - "ensureBridgeHelperReady: 'fallback-identity' status -- kills a full-AppID helper whose WHOAMI failed, spawns a second identity-only (480) helper under the same appId registry key, reports ready with AppID-scoped interfaces stubbed, never raises steamBridgeSetupRequired on a successful fallback"
  - "launchBridgeGame.maybeNotifyBridgeLimited -- every-launch '[bridge-notice] appId=<id> reason=<...>' log line, plus a one-time (per game) notify() for stubbed interfaces or an identity fallback, gated by the persisted limitedNoticeShown flag"
  - "setBridgeIdentityFallback persisted on every bridge launch (true or false), so a game that regains real-AppID init clears a stale fallback flag"
affects: [51-13, 51-14, 51-16]

actuals:
  tokens: 9733
  tasks: 2
  commits: 2
  plan_head_before: 1f379ccb0ceb00eb426c4d04f08483df04f6143b
  plan_head_after: 5749093e6e8f91919cc69a0d6169ead95c7b6bcd

tech-stack:
  added: []
  patterns:
    - "Shared probeHelperReadiness() helper reused for both the full-AppID helper and the identity-only fallback -- same HEALTH/WHOAMI bounded-poll shape, caller owns every observable side effect (log line, steamBridgeSetupRequired) since the same outcome means something different depending on which stage produced it"
    - "A BridgeHelperEntry's own identityOnly flag (not a separate registry) carries the full-vs-fallback distinction through reuse -- a live identity-only entry is never respawned just to retry full mode"
    - "maybeNotifyBridgeLimited always re-reads the persisted SteamBridgeVerdict fresh (readBridgeVerdict) rather than reusing the pre-placeShimForGame snapshot, so a verdict written earlier in the same launch is reflected"

key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/helperProcess.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts

key-decisions:
  - "D-51-04's identity-only fallback is implemented as a SECOND spawn under the SAME appId registry key (not a separate map), reusing stopBridgeHelper/onStopped teardown identically for either kind"
  - "The identity-only child's own LISTEN line reports appid=480 (its own --appid), not the real appId it is registered under -- ensureHelperSpawned tracks an expectedListenAppId distinct from the registry key to parse that line correctly"
  - "maybeNotifyBridgeLimited is placed in games.ts (not helperProcess.ts) and called once per launchBridgeGame invocation, right after the ready/fallback gate and before writeBridgeConfig -- never for the no-steam-api branch, which spawns no helper and has nothing to stub"
  - "Task 2's new tests live in a standalone top-level describe appended at the end of games.test.ts, not nested inside the existing 'Phase 24 Plan 08 bridge routing' launch describe -- that describe (and two later ones, 'Phase 17 bottle routing' and 'SNI-08') share a module-scoped bridgeFailedThisSession Set whose state is left behind by whichever test runs last; nesting there was measured to flip 8 unrelated, pre-existing tests to failure"

patterns-established:
  - "Pattern: a helper registry's fallback entry is keyed identically to its primary entry, with an in-entry flag distinguishing kind -- avoids a parallel map and keeps teardown/reuse logic single-path"

requirements-completed: []

coverage:
  - id: D-51-04-fallback
    description: "Identity-only (480) fallback: full-AppID WHOAMI failure triggers a second identity-only spawn; success reports fallback-identity with no steamBridgeSetupRequired; failure of both reports not-inited with exactly one steamBridgeSetupRequired; an unreachable full helper never attempts the fallback; a live identity-only entry is reused, not respawned"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts -- the four D-51-04 tests"
        status: pass
    human_judgment: false
  - id: D-51-02-notice
    description: "One-time limited-features notify() plus every-launch [bridge-notice] log line, gated by persisted limitedNoticeShown; identity fallback and stubbed interfaces both trigger it; a clean verdict with no fallback triggers neither but still persists setBridgeIdentityFallback(appId, false)"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/games.test.ts -- the 'maybeNotifyBridgeLimited()' describe (3 tests)"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-10-21
status: complete
---

# Phase 51 Plan 12: Identity Fallback and Limited-Features Notice Summary

**D-51-04 identity-only (480) fallback in the bridge helper registry, plus the D-51-02 one-time limited-features notice and every-launch `[bridge-notice]` log line on the launch path.**

## Performance
- **Duration:** ~70min
- **Started:** 2026-10-21
- **Completed:** 2026-10-21
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `ensureBridgeHelperReady` now attempts an identity-only (480) fallback whenever a full-AppID helper's own WHOAMI fails: it kills the full child, spawns `--appid 480 --identity-only --report-appid <appId>` under `<stateDir>/<appId>/identity` registered under the same appId key, and reports `'fallback-identity'` (ready:true, no setup dialog) on success or `'not-inited'` (exactly one `steamBridgeSetupRequired`) if the fallback also fails.
- `launchBridgeGame` calls a new private `maybeNotifyBridgeLimited` right after the helper reports ready/fallback-identity and before `runWineCommand`: it logs `[bridge-notice] appId=<id> reason=<identity-fallback|stubbed:<list>>` on every limited launch, and shows a one-time `notify()` (gated by the persisted `limitedNoticeShown` flag) with the identity-fallback sentence appended to the body when applicable.
- `setBridgeIdentityFallback` is now persisted on every bridge launch (true or false), so a game that later regains real-AppID init clears a stale fallback flag instead of leaving it stuck true.
- Discovered and routed around a pre-existing, order-dependent test fragility in `games.test.ts` (a shared `bridgeFailedThisSession` Set left set by whichever test runs last before two unrelated describes) rather than letting new tests trip it.

## Task Commits
1. **Task 1: Identity-only fallback in the helper registry** - `07c0a73cf` (feat)
2. **Task 2: One-time limited-features notice plus an every-launch log line** - `5749093e6` (feat)

**Plan metadata:** (pending — see final commit in orchestrator report)

## Files Created/Modified
- `src/backend/storeManagers/steam/bridge/helperProcess.ts` - `ensureHelperSpawned` gains an `identityOnly` option (own argv, own `.../identity` cwd, own expected LISTEN appid); `ensureBridgeHelperReady` restructured around a shared `probeHelperReadiness` helper and the new fallback branch; `BridgeHelperReadyStatus` gains `'fallback-identity'`.
- `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` - four new D-51-04 tests (fallback success, both-fail, unreachable-skips-fallback, live-entry-reused) plus a `waitForSpawnCallCount` helper for the real async gap between the full and fallback spawns.
- `src/backend/storeManagers/steam/games.ts` - new private `maybeNotifyBridgeLimited` method; wired into `launchBridgeGame` after the helper-ready gate; new imports (`i18next`, `notify`, `markBridgeLimitedNoticeShown`, `setBridgeIdentityFallback`, `SteamBridgeVerdict` type).
- `src/backend/storeManagers/steam/__tests__/games.test.ts` - new standalone `describe('maybeNotifyBridgeLimited() ...')` block (3 tests) appended at the end of the file, deliberately NOT nested inside the existing bridge-routing launch describe (see Deviations).

## Decisions Made
See `key-decisions` in frontmatter. The most consequential: Task 2's tests were placed in a brand-new top-level describe at the end of the file rather than nested where the behavior they test is actually wired in, specifically to avoid a measured, pre-existing test-ordering fragility (see Deviations below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Routed Task 2's new tests around a pre-existing order-dependent test fragility in games.test.ts**
- **Found during:** Task 2
- **Issue:** Nesting the new `maybeNotifyBridgeLimited()` tests inside the existing `describe('SteamGame.launch() — Phase 24 Plan 08 bridge routing ...')` block (the natural place, since that's where the behavior under test is wired in) caused 8 unrelated, pre-existing tests in two LATER describes (`'SteamGame.install() — Phase 17 bottle routing (D-10/D-11)'` and `'SteamGame.install() — SNI-08 bottle depot-download opt-in (D-15)'`) to fail with `TypeError: Cannot read properties of undefined (reading 'status')` inside `installBridgeGame`. Bisection (confirmed with a clean jest cache, reproduced with a single no-op `it()`) showed this is a pre-existing, order-dependent fragility: those two later describes never reset games.ts's module-scoped `bridgeFailedThisSession` Set themselves, and silently depend on whichever test runs last in an earlier describe to have left `'570'` marked bridge-failed — without that mark, `resolveBridgeRoute`'s rule 10/11 (`'pending-scan'` default) routes the title to the bridge instead of the legacy bottle path these tests expect. This fragility pre-dates this plan (confirmed on the clean Task-1-only commit with zero test-file changes) and is out of scope to fix here.
- **Fix:** Moved the three new tests into a self-contained, standalone top-level `describe` appended at the very end of `games.test.ts`, building its own complete mock setup (envMock, bridge allowlist, helper readiness, shim placement, wine command, etc.) from scratch rather than reusing the fragile describe's. Being last in file order, it cannot disturb any test that runs before it.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/games.test.ts`
- **Verification:** Full suite run three times consecutively with a cleared jest cache: 298/298 passing every time, including the 8 previously-at-risk tests.
- **Commit:** `5749093e6`

**Total deviations:** 1 auto-fixed (Rule 3 - blocking issue, test-infrastructure routing, no production code affected).
**Impact:** None on shipped behavior — this was purely a test-file placement decision made to avoid tripping an existing, unrelated fragility. The pre-existing fragility itself (undocumented until now) is worth a follow-up todo but was not introduced by this plan and was left untouched per the scope-boundary rule.

## Issues Encountered
The `games.test.ts` test-ordering fragility above consumed the bulk of this plan's time (see Deviations). No other issues — Task 1's helper-registry change and its tests passed on the first implementation attempt (after fixing a real-async-gap timing issue in the fallback tests, since the identity-only spawn now happens after a real `sleep(250ms)`, not synchronously).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
51-13 and 51-14 (both depend on 51-12 per the plan manifest) can now rely on `ensureBridgeHelperReady`'s `'fallback-identity'` status and the persisted `identityFallback`/`limitedNoticeShown` verdict fields being wired end-to-end on the launch path. 51-16 (the game-page route-line UI) can surface the same `identityFallback`/`stubbedInterfaces` fields `maybeNotifyBridgeLimited` already reads via `readBridgeVerdict`.

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-21*

## Self-Check: PASSED
- FOUND: src/backend/storeManagers/steam/bridge/helperProcess.ts
- FOUND: src/backend/storeManagers/steam/games.ts
- FOUND: commit 07c0a73cf
- FOUND: commit 5749093e6
