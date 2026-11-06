---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 09
subsystem: steam
tags: [steam, bridge, crossover-bottle, zustand, jest, i18n]

requires:
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
    provides: "resolveBridgeRoute()/bridgeVerdict.ts verdict family (51-01), bridgeAllowlist (51-03), steam.bridge.route.* and steam.bridge.setup.* locale keys (51-04), placeShimForGame's typed PlaceShimResult union (51-07)"
provides:
  - "bottle.ts: findBridgeInstallBottle(appId) — LOCATION locator (per-game bridge bottle, else legacy shared bottle, else null), distinct from bridgeRoute's ELIGIBILITY answer"
  - "games.ts: getBridgeRouteVerdict()'s installedIn field now filled (bridge/bottle/null) via findBridgeInstallBottle + checkBottleEligibility, instead of always null"
  - "games.ts: launchBridgeGame()/uninstallBridgeGame() dispatch on LOCATION (findBridgeInstallBottle) rather than ELIGIBILITY — an existing bottled install keeps launching/uninstalling from the bottle even if the resolver's current verdict would route a NEW install to the bridge"
  - "games.ts: launch-time shim refresh (D-51-01 byte-identity no-op) now persists the resulting scan verdict via writeBridgeScanVerdict/setBridgeSteamApiPrescreen and threads a previously-persisted interfaceVersions pool into placeShimForGame as persistedInterfaceVersions"
  - "games.ts: installBridgeGame's shim-result handling now distinguishes a coverage 'miss' and a win64 'shim-not-built' from a plain packaging-pending 'shim-not-built'/'error' — the former two delete the per-game bridge bottle, clear a forced userRoute override, stop the install poller, and surface missing symbols via steamBridgeSetupRequired (D-51-05/D-51-07/D-51-11); 'placed'/'no-steam-api' persist their fresh scan verdict before the installed flip"
  - "SteamBridgeSetup.ts/.tsx: missingSymbols threaded from the backend signal through the store to the dialog, rendered via the gamelib-namespace steam.bridge.setup.missingSymbols/redownloadNote keys"
affects: [51-13-force-bridge-dialog, 51-16-ui-plans, steam-bridge-install-flow]

actuals:
  tokens: 22089
  tasks: 3
  commits: 3
  plan_head_before: 048d328d62218ec554c4cc367051b89f77f9cec9
  plan_head_after: 4dab4b2936b0191c7bc45f67f4d6d735c89587a4

tech-stack:
  added: []
  patterns:
    - "LOCATION vs ELIGIBILITY as two permanently distinct questions: bridgeRoute()/isBridgeEligible() answers 'should a NEW install target the bridge', findBridgeInstallBottle() answers 'does an install already live in the bridge bottle' — launch()/uninstall() must ask the second question, never the first, or an existing bottled install would launch/uninstall through the wrong bottle the moment the resolver's verdict changes"
    - "Two literal reason-string branches instead of a shared ternary at a steamBridgeSetupRequired call site, specifically so both emissions stay grep-able (the project's own acceptance-criteria convention) rather than collapsing into one conditional expression"
    - "Namespace-import spies (import * as libraryModule / bridgeVerdictModule) to assert real, unmocked module functions were called — used where jest.mock'ing the whole module would be wrong because the module's REAL behavior (e.g. stopInstallPolling's safe no-op, bridgeVerdict's read-modify-write) is exactly what other tests in the same file already rely on running for real"

key-files:
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/removeCopies.test.ts
    - src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts
    - src/frontend/state/SteamBridgeSetup.ts
    - src/frontend/state/__tests__/SteamBridgeSetup.test.ts
    - src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx

key-decisions:
  - "install() keeps dispatching on ELIGIBILITY (bridgeRoute) because a fresh install has no existing location to respect; launch()/uninstall() switch to findBridgeInstallBottle (LOCATION) because they act on a title that may already be installed somewhere the current verdict would no longer choose"
  - "D-51-05: a scan miss or win64-no-shim at install time deletes the per-game bridge bottle outright (removePerGameBridgeBottle) rather than moving its contents — re-download through the proven Phase 17 bottled path was chosen over any migration path for bits that were never verified to run"
  - "D-51-11: the forced 'try the bridge anyway' userRoute override is cleared (setBridgeUserRoute(appId, undefined)) the moment a forced attempt misses, so a later install() falls through to its ordinary route instead of re-forcing the same doomed bridge attempt"
  - "'already-placed' (byte-identical shim, no verdict) intentionally leaves any previously-persisted scan verdict untouched at both install and launch time — only 'placed' and 'no-steam-api' carry a fresh verdict worth writing"

patterns-established:
  - "getBridgeRouteVerdict's installedIn field is filled by the SAME two LOCATION checks launch()/uninstall() use internally (findBridgeInstallBottle, checkBottleEligibility) — the IPC-exposed verdict and the dispatch logic can never disagree about where an install actually lives"

requirements-completed: []

coverage:
  - id: D1
    description: "findBridgeInstallBottle(appId) locates an existing bridge install by per-game bottle first, then the legacy shared bottle, else null — the LOCATION answer launch()/uninstall() now dispatch on instead of the resolver's ELIGIBILITY verdict"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/bottle.test.ts"
        status: pass
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/games.test.ts#getBridgeRouteVerdict() — D-51-09 installedIn (LOCATION, not eligibility)"
        status: pass
    human_judgment: false
  - id: D2
    description: "launchBridgeGame's shim refresh persists the resulting scan verdict (writeBridgeScanVerdict/setBridgeSteamApiPrescreen) and threads a previously-persisted interfaceVersions pool into placeShimForGame; a launch-time coverage miss fires steamBridgeSetupRequired and poisons the session so a second launch call falls through to the bottled path"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/games.test.ts#SteamGame.launch() — Phase 24 Plan 08 bridge routing"
        status: pass
    human_judgment: false
  - id: D3
    description: "installBridgeGame on a coverage miss or win64-no-shim deletes the per-game bridge bottle, clears a forced userRoute, stops the install poller, persists the miss verdict (miss only), and fires steamBridgeSetupRequired with the correct reason and missing symbols; markBridgeGameInstalled is never reached on either branch"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/games.test.ts#SteamGame.install() — Phase 24 Plan 08 bridge routing (R4/BLOCKER-1/finding-3)"
        status: pass
    human_judgment: false
  - id: D4
    description: "SteamBridgeSetup store carries missingSymbols through open()/handleSteamBridgeSetupRequiredSignal/close(); SteamBridgeSetup.tsx renders the missing-symbols line and the scan-miss/win64-no-shim redownload note via the gamelib namespace"
    verification:
      - kind: unit
        ref: "src/frontend/state/__tests__/SteamBridgeSetup.test.ts"
        status: pass
    human_judgment: true
    rationale: "The .tsx rendering itself has no jsdom test in this project (store-only unit coverage, matching the file's own established pattern) — visual confirmation of the two new dialog lines is a human-judgment item, not automatable here."

duration: 18m (commit-to-commit span of this plan's 3 task commits; total session wall-clock was materially longer across multiple context compactions)
completed: 2026-10-17
status: complete
---

# Phase 51 Plan 09: Native Steam bridge location-aware launch/uninstall + install-time miss handling Summary

**Bridge launch/uninstall now dispatch on WHERE a title is actually installed (findBridgeInstallBottle), not on the resolver's current eligibility verdict, and an install-time coverage miss deletes the per-game bridge bottle, clears a forced route override, and tells the user exactly which Steam symbol is missing before falling back to re-download through the bottled Windows Steam client.**

## Performance

- **Duration:** 18m28s between this plan's first and last task commit (`6b7dfc420` → `4dab4b293`); the full session spanned multiple context-window compactions, so this figure undercounts total wall-clock investigation/reading time substantially.
- **Completed:** 2026-10-17
- **Tasks:** 3/3
- **Files modified:** 11

## Accomplishments
- `findBridgeInstallBottle(appId)` (bottle.ts) answers the LOCATION question — per-game bridge bottle, else legacy shared bottle, else `null` — and `getBridgeRouteVerdict()`'s `installedIn` field is now filled from it (plus `checkBottleEligibility()` for an existing Phase 17 bottled install) instead of staying permanently `null`.
- `launchBridgeGame()`/`uninstallBridgeGame()` dispatch on that LOCATION answer rather than `isBridgeEligible()`'s ELIGIBILITY verdict, so an existing bottled install keeps launching/uninstalling from the bottle it actually lives in even after the resolver's verdict for a *new* install would choose differently.
- Launch-time shim refresh now persists its resulting scan verdict (`writeBridgeScanVerdict`/`setBridgeSteamApiPrescreen`) and threads a previously-persisted `interfaceVersions` pool into `placeShimForGame` as `persistedInterfaceVersions` — the only source of "original" DLL version strings left once a target has already been shimmed.
- `installBridgeGame()`'s shim-result handling now distinguishes a coverage `'miss'` and a win64 `'shim-not-built'` from the plain packaging-pending case: both delete the per-game bridge bottle (`removePerGameBridgeBottle`), clear a forced `userRoute` override (D-51-11's "try the bridge anyway" attempt is spent), stop the install poller, and fire `steamBridgeSetupRequired` with the correct reason (`'scan-miss'` / `'win64-no-shim'`) and missing symbols. `'placed'`/`'no-steam-api'` now persist their fresh verdict before the installed flip.
- `SteamBridgeSetup.ts`'s store and `SteamBridgeSetup.tsx`'s dialog now carry and render `missingSymbols`, plus a re-download note for the two reasons above, using the `steam.bridge.setup.missingSymbols`/`redownloadNote` locale keys that already existed in `gamelib.json` from 51-04.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install-location routing (findBridgeInstallBottle)** — `6b7dfc420` (feat) — adds the locator and its 7 tests. *(Missing the mandated `Co-Authored-By` attribution line — caught immediately but not amended per the "never amend, always a new commit" rule; see Deviations.)*
2. **Task 1+2 combined: wire bridge-route resolver verdict and location-based launch/uninstall into SteamGame** — `187cb1219` (feat) — Task 1's `getBridgeRouteVerdict().installedIn` wiring and Task 2's `launchBridgeGame()`/`uninstallBridgeGame()` location-based dispatch + launch-time verdict persistence landed together because they were implemented interleaved across the same methods in `games.ts` in an earlier (now-compacted) segment of this same session; splitting them via partial-hunk surgery after the fact would have risked destabilizing already-verified, passing code for no real benefit. Also includes Rule 2/3 mock-factory fixes in `library.test.ts`/`removeCopies.test.ts`/`steamStartupKeyringDeferral.test.ts` (see Deviations).
3. **Task 3: Install-time scan miss deletes the per-game bottle and raises D-05 with missing symbols** — `4dab4b293` (feat) — backend `installBridgeGame()` behavior branches plus the frontend `missingSymbols` plumbing and its tests.

**Plan metadata:** pending (this commit)

_Note: all three tasks were `tdd="true"`; each commit's own test changes constitute the RED/GREEN record for that task's new behavior._

## Files Created/Modified
- `src/backend/storeManagers/steam/bottle.ts` — `findBridgeInstallBottle(appId)` LOCATION locator.
- `src/backend/storeManagers/steam/__tests__/bottle.test.ts` — its 7 tests.
- `src/backend/storeManagers/steam/games.ts` — `getBridgeRouteVerdict().installedIn` wiring; `launchBridgeGame()`/`uninstallBridgeGame()` location-based dispatch + verdict persistence; `installBridgeGame()`'s miss/win64-no-shim/placed/no-steam-api branches.
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — new tests for all of the above (295 → 304 total passing in the file across this plan's three commits, counting the frontend suite separately).
- `src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts`, `library.test.ts`, `removeCopies.test.ts`, `steamStartupKeyringDeferral.test.ts` — mock-factory fixes made necessary by Task 1's resolver widening (see Deviations).
- `src/frontend/state/SteamBridgeSetup.ts` — `missingSymbols` field on the store, threaded through `open()`/`close()`/`handleSteamBridgeSetupRequiredSignal`.
- `src/frontend/state/__tests__/SteamBridgeSetup.test.ts` — new tests for the above (6 → 9 total).
- `src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx` — renders the missing-symbols line and the scan-miss/win64-no-shim redownload note via the `gamelib` namespace translator.

## Decisions Made
- LOCATION vs ELIGIBILITY are permanently distinct questions in this codebase now: `install()` asks ELIGIBILITY (a fresh install has nothing to respect yet); `launch()`/`uninstall()` ask LOCATION (an existing install must keep using the bottle it actually lives in).
- D-51-05: a bridge install-time miss deletes the per-game bottle outright rather than moving its contents — re-download through the proven Phase 17 bottled path, not a migration, is the chosen fallback.
- D-51-11: a forced "try the bridge anyway" `userRoute` override is cleared the moment the forced attempt misses, so it never re-forces the same doomed attempt on a later install.
- The install-time `'scan-miss'`/`'win64-no-shim'` emission was deliberately written as two literal branches rather than one shared ternary, specifically so both reasons stay grep-able by exact string per the plan's own acceptance-criteria convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/doc accuracy] Stale doc comment above `getBridgeRouteVerdict()`**
- **Found during:** Task 1
- **Issue:** The doc comment above `getBridgeRouteVerdict()` still read "installedIn stays null here for now -- Task 2 ... wires in the real install-location fill once that locator exists," which no longer matched the implementation once Task 1 filled the field.
- **Fix:** Rewrote the comment to describe the real fill path (`findBridgeInstallBottle` + `checkBottleEligibility`).
- **Files modified:** `src/backend/storeManagers/steam/games.ts`
- **Committed in:** `187cb1219`

**2. [Rule 2/3 - Mock-factory gaps forced by Task 1's resolver widening] Fixed missing `bridgeAllowlist.knownBadReason` export and a `bridge.userRoute:'bottle'` pin**
- **Found during:** Task 1/2 integration
- **Issue:** Task 1's resolver widening changed the default route for non-seed/never-scanned/bottle-eligible titles to the bridge route, which broke pre-existing assumptions in `library.test.ts`, `removeCopies.test.ts`, and `steamStartupKeyringDeferral.test.ts` that depended on the old default (bottle) without pinning it explicitly, and surfaced a missing `bridgeAllowlist.knownBadReason` mock export.
- **Fix:** Added the missing export to the shared mock factory; pinned `bridge.userRoute: 'bottle'` explicitly in the affected tests so they continue to exercise the bottled path they were actually testing, independent of the resolver's new default.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/library.test.ts`, `removeCopies.test.ts`, `steamStartupKeyringDeferral.test.ts`
- **Committed in:** `187cb1219`

**3. [Attribution lapse, not a GSD deviation rule] First commit missing `Co-Authored-By` line**
- **Found during:** Task 1 commit (`6b7dfc420`)
- **Issue:** The mandated `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` attribution line was omitted from this commit's message.
- **Fix:** Caught immediately; not amended (the "always create a NEW commit, never amend" rule takes precedence over fixing a cosmetic metadata line in an already-landed commit). All subsequent commits in this plan correctly include the line.
- **Impact:** Cosmetic only — no code or test content was affected.

**4. [Acceptance-criteria literal-match fix, Task 3] Split a shared ternary into two literal `reason:` branches**
- **Found during:** Task 3 verification (acceptance criteria)
- **Issue:** The plan's acceptance criterion `grep -n "reason: 'scan-miss'" src/backend/storeManagers/steam/games.ts` must return both the install-time and launch-time emissions, but the first draft of `installBridgeGame()`'s combined miss/win64-no-shim branch computed `reason: isWin64NoShim ? 'win64-no-shim' : 'scan-miss'` — a ternary, which the literal grep pattern does not match.
- **Fix:** Split the final `sendFrontendMessage` call into two literal branches (`if (isWin64NoShim) {...} else {...}`), each with its own literal `reason:` string, so the acceptance-criteria grep passes exactly as specified.
- **Files modified:** `src/backend/storeManagers/steam/games.ts`
- **Verification:** `grep -n "reason: 'scan-miss'" src/backend/storeManagers/steam/games.ts` now returns both lines (install-time and launch-time); full test suite re-verified green after the change.
- **Committed in:** `4dab4b293`

---

**Total deviations:** 4 (1 doc-accuracy fix, 1 cross-file mock-factory fix set, 1 attribution lapse documented but not corrected, 1 acceptance-criteria literal-match restructure).
**Impact on plan:** All necessary for correctness, test stability, or satisfying the plan's own written acceptance criteria. No scope creep beyond what each task's behavior spec already called for.

## Issues Encountered
- A newly-written launch-time 'miss' test initially failed because `isBottleReady`/`tellBottledSteamToLaunch` were not mocked before asserting the session-poisoning fallback on a second `launch()` call — fixed by matching the exact mock pattern already used in the file's pre-existing `shim-not-built` test.
- A `ReturnType<typeof jest.requireMock>` type annotation resolved to `{}`, breaking property access on the mocked `environment` module in a new describe block — fixed by matching the file's own established `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + `let envMock: any` convention used in sibling describe blocks.
- A TypeScript discriminated-union narrowing error (`Property 'verdict' does not exist...`) when trying to use an independently-computed `isWin64NoShim` boolean to narrow the unrelated `shimResult` union in a ternary — fixed by restructuring to an explicit `if (shimResult.status === 'miss') {...} else {...}` block that narrows `shimResult` directly on its own discriminant.
- The pre-existing Phase 51 Plan 07 'miss' install test crashed (`Cannot read properties of undefined (reading 'status')`) once `installBridgeGame()` started awaiting `removePerGameBridgeBottle()`, because that test never mocked it and the default `jest.fn()` resolves `undefined` under `resetMocks: true` — fixed by mocking it to resolve `{status: 'removed'}` and extending the test with the acceptance-criteria assertions.
- Both `bridgeVerdict.ts` and `library.ts` are real (unmocked) modules in `games.test.ts`, so asserting `setBridgeUserRoute`/`stopInstallPolling` were called required adding namespace-import spies (`bridgeVerdictModule`/`libraryModule`, mirroring the file's existing `startInstallPolling` spy pattern) rather than reaching for nonexistent `jest.Mock` imports.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- D-51-09's install-time/launch-time miss handling and location-aware dispatch are complete and tested; 51-13 (the "Try the bridge anyway" force-bridge dialog, D-51-11) can now rely on `setBridgeUserRoute` being cleared automatically on a forced attempt's miss, so it does not need to handle that cleanup itself.
- `installedIn` on `getBridgeRouteVerdict()` is now a real, tested LOCATION answer — any 51-1x UI plan surfacing the route/location distinction to the user has real backend data to read.
- No blockers identified for dependent plans (51-13, 51-16).

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-17*

## Self-Check: PASSED
- FOUND: 51-09-SUMMARY.md on disk
- FOUND: 6b7dfc420 (Task 1 commit)
- FOUND: 187cb1219 (Task 1+2 wiring commit)
- FOUND: 4dab4b293 (Task 3 commit)
