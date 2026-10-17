---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 07
subsystem: steam-bridge
tags: [steam, native-bridge, routing, interface-versions, coverage, macos]

# Dependency graph
requires:
  - phase: 51
    provides: "51-01/51-02/51-03's shim marker string, importScan.ts's widened arch-aware scan, interfaceVersions.ts's version-string reader/resolver, and shimCoverage.ts's evaluateShimCoverage/SHIM_EXPORT_SET_VERSION/isScanVerdictNowCovered; electronStores.ts's SteamBridgeVerdict/SteamBridgeScanVerdict shapes"
provides:
  - "resolveBridgeRoute(input): SteamBridgeRouteVerdict -- the single pure routing brain (11-row first-match-wins precedence: platform eligibility, session failure, user overrides, known-bad, scan-miss with D-51-07 auto-clear, D-51-13 win64-no-shim fail-closed, seed, no-steam-api, scan-clean/pending-scan). NOTICE_REASONS exported."
  - "placeShimForGame: arch-aware target filename/source selection (steam_api.dll vs steam_api64.dll), isGameLibShimBytes, interface-version capture from the game's ORIGINAL dll before overwrite, a typed 'miss'/'no-steam-api' result instead of throwing the verdict away as a bare 'error'"
  - "builtBridgeShim64Path in paths.ts, arch-parameterized like builtBridgeShimPath"
affects: [51-09, 51-13, 51-16, steam-bridge, steam-bridge-shim, steam-bridge-coverage]

# Actuals (#2632)
actuals:
  tokens: 17086
  tasks: 2
  commits: 6
  plan_head_before: a4acd8d471fe99f9f4e4e696555397e799e611c8
  plan_head_after: 764deece87bbb7afe3d135d7dc87febdfe5b32ca

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First-match-wins precedence chain as the SOLE composition point for a multi-source eligibility decision (platform/session/user-override/known-bad/scan/arch), replacing what would otherwise be scattered boolean composition at each call site"
    - "isGameLibShimBytes as the self-distinguishing signal between 'a game's original dll' and 'our own (possibly older) shim release' -- lets placement read the original's interface versions from the EXACT path it is about to overwrite, with no second storage location needed for 'the original', and falls back to a caller-supplied persisted record only when that self-distinguishing check says there is no original left"
    - "Scan-before-filename: the import scan now runs on every placeShimForGame call (not just the first), because the target FILENAME itself (steam_api.dll vs steam_api64.dll) is arch-derived and unknowable before scanning -- a deliberate ordering change from the Phase 24 implementation, traded for architectural simplicity over the now-redundant identity-check skip"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/bridge/bridgeRoute.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - src/backend/constants/paths.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts

key-decisions:
  - "D-51-13's fail-closed win64-no-shim check (precedence row 6) runs BEFORE row 7's user-forced-bridge override, in the resolver -- the fail-closed default must never be bypassable by the 'Try the bridge anyway' override, so it has to sit earlier in the chain, not later as a tie-breaker"
  - "stubbedInterfaces is read from verdict.scan.stubbedInterfaces, not a top-level SteamBridgeVerdict field that does not exist -- caught by tsc during Task 2 integration (see Deviations) and fixed before it ever reached a passing build"
  - "An x64 'placed' outcome is NOT exercised by any test in this plan: SHIM64_EXPORTED_SYMBOLS is still empty (shimCoverage.ts, pending 51-15), so every x64 symbol is structurally uncovered today -- the x64 test instead proves filename/source selection plus the fail-closed 'miss', which is the only x64 outcome actually reachable before 51-15 ships a real export list"
  - "A target file's version strings are read from the EXACT path about to be overwritten (shimPath), not a separate 'original dll' location -- on a FIRST placement that path holds the game's own depot-shipped dll (the real original); on a RE-placement (e.g. a shim-version bump) that path already holds our own prior shim, which isGameLibShimBytes detects, falling back to opts.persistedInterfaceVersions instead of mis-reading our own shim as 'the original'"

patterns-established:
  - "Pattern 1: a pure resolver function as the single composition point for a routing/eligibility decision assembled from multiple independent signals -- callers (51-09) pass flat inputs, never partial pre-composed booleans"
  - "Pattern 2: a byte-content self-check (isGameLibShimBytes) to distinguish 'our own previously-placed artifact' from 'the original third-party file' at the SAME path, avoiding a second storage location for 'what was there before'"

requirements-completed: []

coverage:
  - id: D1
    description: "resolveBridgeRoute: pure 11-row first-match-wins precedence resolver (ROADMAP sub-decision 2, D-51-07/08/10/11/13) composing platform eligibility, seed membership, known-bad reason, the persisted verdict, session failure, and Win64-shim presence into one SteamBridgeRouteVerdict. NOTICE_REASONS exported. Never reads the D-17 forced-bottle verdict or steamMetadataStore directly."
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts (25 tests: one per precedence row plus copied-field defaults, NOTICE_REASONS, and the D-17 prohibition pin)"
        status: pass
    human_judgment: false
  - id: D2
    description: "placeShimForGame: verdict-returning, arch-aware placement -- scans imports first to learn the arch/filename, captures interface versions from the game's original dll before overwrite (falling back to persistedInterfaceVersions for an already-shimmed target), evaluates coverage per arch, returns a typed 'miss'/'no-steam-api'/'shim-not-built'/'placed'/'already-placed' result instead of a bare 'error', and never overwrites the target on a miss. builtBridgeShim64Path added to paths.ts."
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts (29 tests, including isGameLibShimBytes); __tests__/shimCoverage.test.ts (unchanged, re-verified green)"
        status: pass
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/games.test.ts's new test proving installBridgeGame treats the widened 'miss' status as a real failure, not a silent success (Rule 1 fix, see Deviations)"
        status: pass
    human_judgment: false

# Metrics
duration: ~1h of agent execution (single continuous session)
completed: 2026-10-17
status: complete
---

# Phase 51 Plan 07: Pure Route Resolver + Verdict-Returning Shim Placement Summary

**A single pure `resolveBridgeRoute` composes the whole bridge-vs-bottle routing decision from six independent signals in an 11-row precedence chain, and `placeShimForGame` now captures a game's interface versions from its own original dll before overwriting it, returning a persistable coverage verdict (typed `miss`/`no-steam-api`, never a throw-away `error`) instead of silently discarding what it learned.**

## Performance

- **Duration:** ~1h of agent execution, single continuous session
- **Tasks:** 2 (both `type="auto" tdd="true"`, each RED commit then GREEN commit)
- **Files modified:** 7 (0 created, 7 modified)
- **Commits:** 6 (`151d7edd0`, `0ac98bb2e`, `e68ab94ea`, `aa6415b89`, `49e507f29`, `764deece8`)

## Accomplishments

- `bridgeRoute.ts` is the single routing brain: `resolveBridgeRoute(input): SteamBridgeRouteVerdict` composes platform eligibility, seed membership, known-bad reason, the persisted `SteamBridgeVerdict`, the session-scoped failure circuit breaker, and Win64-shim presence into one verdict, first-match-wins across exactly the 11 precedence rows the plan specified. `NOTICE_REASONS` is exported for 51-16's dialog wiring.
- D-51-13's fail-closed rule (a `steam_api64.dll` import routes to bottled Steam whenever no Win64 shim exists) is checked BEFORE the user's "Try the bridge anyway" override in the precedence chain -- the override can never bypass it, by construction, not by a later patch.
- D-51-07's auto-clear is exercised directly: a persisted scan miss whose only missing symbol is now covered by the real shim's export set (`isScanVerdictNowCovered`) routes to `pending-scan`, not `scan-miss` -- no manual retry affordance needed.
- The D-17 pin (`isBridgeEligible()`'s own doc comment in `games.ts`) is enforced both narratively and mechanically: the resolver's source contains no `forcedWindowsViaBottle` token and never imports `steamMetadataStore`, and a fully-populated `BridgeRouteInput` fixture has no key matching `/forced/i` -- all three asserted by tests.
- `placeShimForGame` now scans imports FIRST (the arch, and therefore the target filename, cannot be known before that), handles `arch: 'none'` as a clean `'no-steam-api'` result, and picks `steam_api.dll`/`steam_api64.dll` plus the matching built-shim source (`builtBridgeShimPath`/new `builtBridgeShim64Path`) per arch.
- Interface-version capture (D-51-07): the file currently at the target path is read for version strings BEFORE it is ever overwritten -- proven behaviorally (a version string embedded only in the pre-seeded original, never in the shim source text, surfaces correctly in the returned verdict). `isGameLibShimBytes` (marker string OR the ASCII loopback address the shim's helper-socket connect call embeds) distinguishes "this is already one of our own shim releases, with no original left to read" from a genuine original, falling back to `opts.persistedInterfaceVersions` in that case.
- A coverage miss (a flat symbol not exported, or a required interface version unresolvable/unserved) is now a typed `'miss'` result carrying the full `SteamBridgeScanVerdict` -- the plan's whole point (D-51-07: stop throwing the verdict away) -- and the target file is proven byte-unchanged on every miss path, never partially overwritten.
- `builtBridgeShim64Path` added to `paths.ts`, same arch-parameterized layout as `builtBridgeShimPath`; a missing x64 source degrades to a typed `{ status: 'shim-not-built', arch: 'x64' }`, never a throw, consistent with D-51-13 (there is no Win64 shim target at all until 51-15, and `SHIM64_EXPORTED_SYMBOLS` is still empty, so even a present x64 source cannot yet produce a `'placed'` result -- proven as a `'miss'` naming every symbol, not a silent success).

## Task Commits

Each task followed RED-GREEN TDD, with one integration fix commit interleaved after each GREEN once `tsc`/the real call sites surfaced a correctness gap:

1. **Task 1 RED: pure route resolver precedence chain** - `151d7edd0` (test)
2. **Task 1 GREEN: pure route resolver** - `0ac98bb2e` (feat)
3. **Fix (Rule 1): stubbedInterfaces read from verdict.scan, not a non-existent top-level field** - `e68ab94ea` (fix)
4. **Task 2 RED: verdict-returning placement with arch-aware shim selection** - `aa6415b89` (test)
5. **Task 2 GREEN: verdict-returning placement with arch-aware shim selection** - `49e507f29` (feat)
6. **Fix (Rule 1): installBridgeGame treats the widened 'miss' status as a failure** - `764deece8` (fix)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `src/backend/storeManagers/steam/bridge/bridgeRoute.ts` (new) - `BridgeRouteInput`, `resolveBridgeRoute`, `NOTICE_REASONS`
- `src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts` (new) - 25 tests, one per precedence row plus copied-field/prohibition pins
- `src/backend/storeManagers/steam/bridge/shimGenerate.ts` - arch-aware `placeShimForGame` rewrite; `isGameLibShimBytes` (exported); widened `PlaceShimResult`
- `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts` - rewritten for the new contract; 29 tests
- `src/backend/constants/paths.ts` - `builtBridgeShim64Path`
- `src/backend/storeManagers/steam/games.ts` - `installBridgeGame`'s shim-failure check widened to include the new `'miss'` status (Rule 1 fix; `launchBridgeGame`'s own check was already a safe positive allow-list and needed no change)
- `src/backend/storeManagers/steam/__tests__/games.test.ts` - new test locking in the `'miss'`-is-a-failure fix

## Decisions Made

See `key-decisions` in frontmatter: D-51-13's fail-closed check precedes the forced-bridge override in the resolver chain; `stubbedInterfaces` is read from `verdict.scan`, not a non-existent top-level field; an x64 `'placed'` outcome is not yet reachable (and therefore not asserted) given `SHIM64_EXPORTED_SYMBOLS` is still empty pending 51-15; a target file's version strings are read from the exact path about to be overwritten, never a separate "original" location.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `resolveBridgeRoute` read a non-existent top-level `stubbedInterfaces` field**
- **Found during:** Task 2's `tsc --noEmit` integration check (ran after Task 1 was already committed GREEN)
- **Issue:** `SteamBridgeVerdict` (electronStores.ts) has no top-level `stubbedInterfaces` field -- it only exists on the persisted `scan` sub-object (`SteamBridgeScanVerdict.stubbedInterfaces`). `bridgeRoute.ts` read `verdict?.stubbedInterfaces`, which `tsc` correctly rejected (TS2339).
- **Fix:** Changed the read to `verdict?.scan?.stubbedInterfaces ?? []`; updated the one test fixture that had the same (structurally invalid) shape.
- **Files modified:** `src/backend/storeManagers/steam/bridge/bridgeRoute.ts`, `src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts`
- **Verification:** `tsc --noEmit` clean; `bridgeRoute.test.ts` 25/25 green
- **Committed in:** `e68ab94ea`

**2. [Rule 1 - Bug] `installBridgeGame` silently treated a coverage-miss shim placement as a successful install**
- **Found during:** Task 2's GREEN, auditing `placeShimForGame`'s two real call sites in `games.ts` for compatibility with the widened return shape
- **Issue:** `placeShimForGame`'s coverage-miss result changed from a bare `'error'` to a typed `'miss'` status in this plan (that is the plan's whole point -- stop throwing the verdict away). `installBridgeGame`'s only failure check (`status === 'error' || 'shim-not-built'`) did not know about `'miss'`, so a coverage miss would have fallen through to the success path with no shim ever actually placed -- a real install-flow regression directly caused by this plan's return-shape change. (The sibling call site, `launchBridgeGame`, was already a safe positive allow-list -- `!== 'placed' && !== 'already-placed'` -- and needed no change.)
- **Fix:** Widened the failure check to include `'miss'`, and surfaced the missing symbol(s) in the resulting error message (mirroring the existing `'shim-not-built'` message shape). `'no-steam-api'` deliberately stays out of the failure set -- there is nothing to place for a title that ships no `steam_api*.dll` at all.
- **Files modified:** `src/backend/storeManagers/steam/games.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`
- **Verification:** New test asserting the `'miss'` status produces an install error and poisons the session (routes a subsequent install to the bottled fallback), plus the full pre-existing `games.test.ts` suite (279/279) re-verified green
- **Committed in:** `764deece8`

---

**Total deviations:** 2 auto-fixed (both Rule 1 -- bug fixes directly caused by this plan's own changes)
**Impact on plan:** Both fixes were necessary for correctness; neither widens scope beyond what this plan's own return-shape changes required of their callers. No scope creep.

## Issues Encountered

- `node meta/findDeadcode.cjs` reports 20 pre-existing `used-in-module` findings (across `meta/buildSteamBridgeShims.ts`, `meta/downloadZig.ts`, `bridgeConfig.ts`, `importParse.ts`, `interfaceVersions.ts`, `shimCoverage.ts`) not in the committed baseline. None of these files are in this plan's `files_modified` -- they land from the earlier same-wave plans (51-01 through 51-06) merged just before this plan per the dispatch note. Out of scope per the deviation rules' scope boundary; logged to `.planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/deferred-items.md`, not fixed here.
- An x64 `'placed'` outcome is structurally unreachable today (`SHIM64_EXPORTED_SYMBOLS` is empty pending 51-15) -- not a defect in this plan, just a reminder that 51-15 inherits a shim-selection path already proven for filename/source choice and the fail-closed `'miss'`, with the actual export coverage still to come.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 51-09 (backend persistence/IPC surface) can call `resolveBridgeRoute` directly, assembling `BridgeRouteInput` from `games.ts`'s existing reads (`isBottleEligibleFromPlatforms()`, `bridgeAllowlist.has`, `bridgeFailedThisSession`, the persisted `steamMetadataStore` entry's `bridge` field) -- the resolver itself needs no changes.
- 51-09 also owns persisting `placeShimForGame`'s returned verdict (on `'placed'`/`'miss'`/`'no-steam-api'`) into `SteamMetadataCacheEntry.bridge.scan`, and threading `opts.persistedInterfaceVersions` from that same persisted record on subsequent calls so an already-shimmed target's version capture keeps working.
- 51-13 (IPC handlers) and 51-16 (UI) can read `NOTICE_REASONS` directly to decide when a route change needs a one-time acknowledgement dialog.
- 51-15 (x64 target) inherits arch-aware filename/source selection and the fail-closed `'miss'` path with zero `shimGenerate.ts` changes needed -- it only needs to populate `SHIM64_EXPORTED_SYMBOLS`/`SHIM64_SERVED_INTERFACE_VERSIONS` in `shimCoverage.ts` and ship a real `builtBridgeShim64Path` binary for a `'placed'` x64 result to become reachable.
- No blockers. `pnpm jest src/backend/storeManagers/steam/bridge --silent` (12 suites, 216 tests) and the full `src/backend/storeManagers/steam` project (52 suites, 1848 tests) are both green; `tsc --noEmit` is clean; `npx prettier --check` is clean on every file this plan touched.

## Self-Check: PASSED

- FOUND: `.planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-07-SUMMARY.md`
- FOUND commit `151d7edd0` (Task 1 RED)
- FOUND commit `0ac98bb2e` (Task 1 GREEN)
- FOUND commit `e68ab94ea` (Rule 1 fix)
- FOUND commit `aa6415b89` (Task 2 RED)
- FOUND commit `49e507f29` (Task 2 GREEN)
- FOUND commit `764deece8` (Rule 1 fix)
- `pnpm jest src/backend/storeManagers/steam/bridge --silent` re-run clean at close-out: 12/12 suites, 216/216 tests
- `npx jest src/backend/storeManagers/steam --silent` re-run clean at close-out: 52/52 suites, 1848/1848 tests
- `npx tsc --noEmit -p tsconfig.json` re-run clean at close-out
- `npx prettier --check` clean on every file this plan touched

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-17*
