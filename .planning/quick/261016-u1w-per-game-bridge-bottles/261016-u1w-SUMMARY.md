---
phase: quick-261016-u1w
plan: 01
subsystem: steam
tags: [steam, bridge, crossover, bottles, macos, wine, uninstall, tdd]

# Dependency graph
requires:
  - phase: Phase 24 (macOS native Steam bridge)
    provides: the shared GameLibSteamBridge bottle, bridgeAllowlist, resolveBridgeLaunchExe, shimGenerate
provides:
  - "bridgeBottleNameFor(appId) / resolveBridgeBottleName(appId) (D-A/D-B) — every bridge-routed Steam game gets its own CrossOver bottle"
  - "listReadyBridgeBottleNames() (D-C) — buildBridgeInstalledMap scans every ready bridge bottle, legacy + per-game, with resolver-gated attribution"
  - "removePerGameBridgeBottle(appId) (D-D) — uninstalling a per-game-bottled bridge game deletes exactly that bottle"
  - "D-E: every bridge-bottle entry point now requires an explicit bottle/appId argument — no silent shared-bottle default"
affects: [steam-bridge, steam-uninstall, steam-library-refresh]

actuals:
  tokens: 25234
  tasks: 3
  commits: 4
  plan_head_before: fa668b29f083bc4df0ef6a95658b124de728523b
  plan_head_after: 2f2792de35ba34a1f10c26cb7b3314246d97a4c6

tech-stack:
  added: []
  patterns:
    - "Per-game CrossOver bottle naming: GameLibSteamBridge-<appId>, Proton-style, derived from DEFAULT_BRIDGE_BOTTLE_NAME via a module-private regex rather than hardcoded"
    - "resolveBridgeBottleName as the single D-B resolver: per-game wins if ready, else legacy wins only if ready AND holds the appId's manifest, else per-game (even unprovisioned)"
    - "Containment via relative(resolve(bottlesRoot), resolve(getBottleDir(name))) === name — never path.join/string-prefix — reused from shimGenerate.ts's established lesson"
    - "D-D guard chain mirrors provisionBottle's CR-01 shared-bottle guard: numeric-appId gate, sanitizeBottleName chokepoint, protected-bottle refusal set, then containment, all before any spawn/delete"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/bridge/launchTarget.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts

key-decisions:
  - "D-A/D-B/D-C/D-D/D-E implemented exactly as specified in the plan; no architectural deviations (Rule 4) were needed."
  - "T-u1w-06 (legacy-bottle uninstall leaves a stale appmanifest_<appId>.acf behind) accepted as-is per the plan's own threat register disposition — not fixed here."
  - "Whether removeSteamInstallCopy('bridge') should also delete an emptied per-game bottle (LD-5) was left undecided, per the plan's own output spec — returned to the orchestrator below as an open question."

requirements-completed: [TODO-261016-BRIDGE-PER-GAME-BOTTLE]

duration: ~43min (Tasks 1-3, across a context compaction boundary)
completed: 2026-10-16
status: complete
---

# Quick Task 261016-u1w: Per-Game CrossOver Bottles for Bridge-Routed Steam Games Summary

Every bridge-routed Steam game now gets its own CrossOver bottle (`GameLibSteamBridge-<appId>`, Proton-style) instead of sharing the single `GameLibSteamBridge` bottle — install, launch, library-refresh attribution and uninstall all route through a single resolver, and uninstalling a per-game-bottled title deletes exactly that bottle behind a guard chain that can never name any other bottle.

## Performance

- **Duration:** ~43 min across the 4 task commits (22:34-23:17 NZDT, 2026-10-16); session continued once after a context compaction between Task 2 and Task 3.
- **Tasks:** 3/3 completed
- **Files modified:** 10 (5 production, 5 test)

## Accomplishments

- **D-A/D-B (Task 1):** `bridgeBottleNameFor(appId)` builds the per-game name; `resolveBridgeBottleName(appId)` is the single resolver every bridge reader now reaches (install/launch/uninstall/poller), with legacy-bottle precedence gated on it actually holding that appId's manifest. New installs bypass the resolver and always provision per-game directly.
- **D-C (Task 2):** `listReadyBridgeBottleNames()` scans the CrossOver Bottles directory and returns every ready bridge bottle — legacy first (if ready), then per-game bottles sorted by ascending numeric appId. `buildBridgeInstalledMap()` now loops over every ready bottle and attributes each manifest only when `resolveBridgeBottleName()` agrees that bottle owns the appId, so a stray manifest in the wrong bottle can never mark the wrong game installed.
- **D-E (Task 2):** Every bridge-bottle entry point (`isBridgeBottleReady`, `getBridgeBottleSettings`, `getBridgeBottleSteamappsRoot`, `provisionBridgeBottle`) now requires an explicit argument — enforced by `tsc`, not just convention. The zero-argument census is 0 (from a baseline of 14).
- **D-D (Task 3):** `removePerGameBridgeBottle(appId)` deletes exactly `GameLibSteamBridge-<appId>`, behind a guard chain (numeric appId → `sanitizeBottleName` → protected-bottle refusal set → containment) that runs entirely before any spawn or delete, and that can never resolve to the legacy bottle, the Phase 17 `GameLibSteam` bottle, the stored Phase 17 bottle name, or the shared GOG/Epic bottle. `uninstallBridgeGame` now removes the whole bottle directly when the game owns its own per-game bottle, bypassing `resolveBridgeLaunchExe` entirely; the legacy-bottle uninstall path is unchanged (and now threads `bottleName` into `resolveBridgeGameInstallRoot` rather than re-resolving it).

## Task Commits

Each task was committed atomically:

1. **Task 1: route new bridge installs to a per-game CrossOver bottle (D-A/D-B)** - `46673344a` (feat), plus a tracer-feedback-gate fix - `46a9c3732` (fix)
2. **Task 2: scan every ready bridge bottle, require explicit bottle names (D-C, D-E)** - `2eee66954` (feat)
3. **Task 3: delete exactly GameLibSteamBridge-\<appId\> on per-game bridge uninstall (D-D)** - `2f2792de3` (feat)

**Plan metadata:** this commit (docs: complete plan, below)

## Measured Gates — Before/After, All Three Tasks

| Gate | Baseline (pre-Task-1) | After Task 1 | After Task 2 | After Task 3 (final, measured) |
|------|------------------------|--------------|---------------|----------------------------------|
| 7/8-suite jest `Tests:` | — | n/a (tracer gate ran a subset) | 673 passed, 673 total (7 suites) | **697 passed, 697 total (8 suites)** |
| 7/8-suite jest `Test Suites:` | — | — | 7 passed, 7 total | **8 passed, 8 total** |
| `pnpm codecheck` | exit 0 | exit 0 | exit 0 | **exit 0** |
| `pnpm lint` production | 1089/1124 | 1089/1124 | 1089/1124 | **1089/1124, PASS** |
| `pnpm lint` tests | 638/638 (zero headroom) | — | 639→**638**/638 (one `require-await` fix, see Deviations) | **638/638, PASS** |
| `pnpm find-deadcode` | `unreachable: 46 OK \| used-in-module: 0 OK` | unchanged | unchanged | **`unreachable: 46 OK \| used-in-module: 0 OK`** |
| `npx prettier --check` (10 paths) | clean | clean | clean (after 1 auto-format) | **clean (after 1 auto-format)** |
| Zero-argument census | 14 | — | 0 | **0** |
| non-bottle.ts `DEFAULT_BRIDGE_BOTTLE_NAME` census | 2 | — | — | **0** |
| `provisionBridgeBottle` last-export invariant | true | true | true | **true** |
| `removePerGameBridgeBottle`/`provisionBridgeBottle` source contains no SteamSetup.exe/STEAM_SETUP_EXE_URL reference | n/a | n/a | n/a | **0 references (both functions)** |

Exact final measured lines, quoted (not narrated):
```
Test Suites: 8 passed, 8 total
Tests:       697 passed, 697 total
```
```
✖ 1089 problems (0 errors, 1089 warnings)   (production scope)
✖ 638 problems (0 errors, 638 warnings)     (tests scope)
production: PASS | tests: PASS
```
```
unreachable: 46 OK | used-in-module: 0 OK
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, Task 1] `getBridgeBottleSettings` silently fell back to the shared bottle on a non-numeric appId instead of throwing**
- **Found during:** the Task 1 tracer feedback gate (re-running `<verify>` end-to-end after the tracer task, before expanding).
- **Issue:** the tracer task's own behavior spec requires `getBridgeBottleSettings('abc')` to throw — a caller that passed an appId has a specific game in mind, so silently resolving the wrong (shared) bottle would be worse than failing loudly. The initial Task 1 commit missed this.
- **Fix:** `getBridgeBottleSettings` now throws `Invalid appId "<appId>" (must be numeric)` when `resolveBridgeBottleName(appId)` returns null for a supplied appId.
- **Files modified:** `src/backend/storeManagers/steam/bottle.ts`, `src/backend/storeManagers/steam/__tests__/bottle.test.ts`.
- **Commit:** `46a9c3732`.

**2. [Rule 2 - missing critical functionality, Task 1] `resolveBridgeGameInstallRoot` had no way for a fresh install to name its own just-provisioned bottle**
- **Found during:** Task 1 implementation, while threading the per-game bottle name through `games.ts`.
- **Issue:** without an override, `resolveBridgeGameInstallRoot` always re-resolves the bottle via `getBridgeBottleSettings`/the resolver — correct for uninstall, but a fresh install already knows exactly which bottle it just placed files into and must not risk a resolver disagreement mid-install.
- **Fix:** added an optional `bottleNameOverride` parameter; `installBridgeGame` passes its own `bridgeBottleNameFor(appId)` result straight through, bypassing the resolver; the uninstall path (no override) still resolves normally.
- **Files modified:** `src/backend/storeManagers/steam/games.ts`.
- **Commit:** `46673344a`.

**3. [Rule 1 - Bug, Task 2] 9 jest failures: `listReadyBridgeBottleNames()`'s un-mocked default is `undefined`, not `[]`**
- **Found during:** Task 2's GREEN test run, after converting `library.ts`'s refresh gates from `isBridgeBottleReady()` to `listReadyBridgeBottleNames().length > 0`.
- **Issue:** describe blocks in `library.test.ts` that never explicitly arm `listReadyBridgeBottleNames` got jest's un-mocked `undefined` return, and `.length` on `undefined` threw — unlike the old `isBridgeBottleReady()` default (falsy, safe).
- **Fix:** added `jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])` to the file's top-level global `beforeEach`, giving every test the same safe falsy default the old gate had unless a nested `beforeEach` overrides it.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/library.test.ts`.
- **Commit:** `2eee66954`.

**4. [Rule 3 - blocking issue, Task 2] `pnpm lint:tests` exceeded the zero-headroom `TESTS_CEILING` (639 vs 638)**
- **Found during:** Task 2's verify run.
- **Issue:** a new per-game-provisioning test's `mockedSpawnAsync.mockImplementation(async (bin) => {...})` callback had no `await` inside, tripping `@typescript-eslint/require-await` and pushing the tests-scope warning count one over the ceiling.
- **Fix:** removed the unnecessary `async` keyword from that one callback (behaviorally identical, since `await` on a non-promise resolves immediately) rather than touching the ceiling constant itself.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/bottle.test.ts`.
- **Commit:** `2eee66954`.

Task 3 (`2f2792de3`) executed with no deviations — the guard chain, delete/rmSync-fallback sequence, and both uninstall-routing tests (per-game and legacy) went straight to green on the first implementation pass.

### Locked / Out-of-Scope Items (not decided or fixed here)

- **T-u1w-06** (threat register, disposition `accept`): uninstalling a legacy-bottle game leaves its `appmanifest_<appId>.acf` behind. Existing behavior, kept by D-D/LD-4. The game keeps resolving to the legacy bottle until a reinstall provisions its per-game bottle, at which point `resolveBridgeBottleName`'s attribution rule ignores the stale legacy manifest. Not fixed here — recorded as an observation.
- **"Remove all copies" and an emptied per-game bottle (LD-5):** `removeSteamInstallCopy('bridge')` removes only the install dir and manifest, leaving behind an empty per-game bottle that the next install reuses. D-D covers uninstall only; whether "Remove all copies" should also delete the now-empty per-game bottle was explicitly left undecided by the plan. **Open question for the orchestrator** — not decided in this execution.

## Live Gates This Desk Task Cannot Discharge (LD-8)

1. A fresh Avernum 5 install creates `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-206040` and launches through the bridge helper.
2. A machine whose legacy `GameLibSteamBridge` already holds Avernum 6 still shows it installed and launches it from there.
3. Uninstalling the per-game install removes the bottle from disk and from CrossOver's own bottle list.
4. `cxbottle --delete --force` behaves on a per-game bottle exactly as the code assumes (dir gone, menu/association entries cleaned).
5. Both games stay installed across a library refresh.

## Self-Check

```
FOUND: src/backend/storeManagers/steam/bottle.ts
FOUND: src/backend/storeManagers/steam/games.ts
FOUND: src/backend/storeManagers/steam/library.ts
FOUND: src/backend/storeManagers/steam/bridge/launchTarget.ts
FOUND: src/backend/storeManagers/steam/bridge/shimGenerate.ts
FOUND: src/backend/storeManagers/steam/__tests__/bottle.test.ts
FOUND: src/backend/storeManagers/steam/__tests__/games.test.ts
FOUND: src/backend/storeManagers/steam/__tests__/library.test.ts
FOUND: src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts
FOUND: src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
FOUND: 46673344a (Task 1 feat)
FOUND: 46a9c3732 (Task 1 tracer-gate fix)
FOUND: 2eee66954 (Task 2 feat)
FOUND: 2f2792de3 (Task 3 feat)
```

## Self-Check: PASSED
