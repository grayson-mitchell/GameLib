# Phase 65: Steam store manager decomposition, continued - Pattern Map

**Mapped:** 2026-11-07
**Files analyzed:** ~55 new/modified (grouped into 8 pattern families)
**Analogs found:** 8 / 8 families (1 partial: state leaf for `activePolls`)

Cluster maps, module names, sizes and importer fan-out are in `65-RESEARCH.md`. They are not repeated here. This file only says what to copy from. Method rules (no façade, pure-move commits, leaf-first, test + mock repoint + knip-baseline edit in the same commit) are 62 D-05/D-06 and carry over from `62-PATTERNS.md` "Pure-move commit discipline".

## File Classification

| Family (new/modified files) | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| A. `steam/library/index.ts` (+ `git mv library.ts library/index.ts`) | directory public entry | request-response | `steam/depot/index.ts` | role-match (see note) |
| B. Sibling extractions: `library/*.ts`, `bottledSteam/provisionBottle/bridgeBottle/bridgeBottleLifecycle.ts`, `gameInstallBridge/bridgeInstallState/gameInstallDepot.ts`, `gameBridgeWineLaunch.ts`, `bridgeRouteVerdict.ts`, `gameMetadata.ts`, `bridge/shim*.ts`, `bridge/helperSpawn.ts`, `bridge/drm/runner*.ts`, `bridge/drm/drmRegistry/drmRestore/bottleProcesses.ts` | utility/service leaves | transform / batch / file-I/O | Phase 62 `game*.ts` leaves split from `games.ts` (`gameUninstall.ts`, `gameInstall.ts`) | exact |
| C. State leaves: `library/pollState.ts`, `bridge/helperRegistry.ts`, `userSignInState.ts`, `bottledSteam.ts`/`bridgeBottle.ts` state | state module | event-driven (timers, process exit) | `bridge/helperProcess.ts` L146-310, L1139 | exact |
| D. Class to free-function lifts: `library/refresh.ts`, `userSignIn.ts`, `userRedeem.ts`, `userTypes.ts`, SteamGame stub removal (`games.ts` + 5 callers) | service | request-response | 62's lifted `gameUninstall.ts` (`steamGame` first param); `SteamGame` stubs in `games.ts` | role-match |
| E. `meta/steamLineCeiling.cjs` + `meta/steamLineCeilingBaseline.json` | gate script | batch | `meta/indexedAccessRatchet.cjs` (equality ceiling) + `meta/knipRatchet.cjs` (`evaluate`, `require.main` guard) | exact |
| F. `meta/__tests__/steamLineCeiling.test.ts` + wiring test; `package.json`, `lint.yml`, `.husky/pre-push` edits | test + CI config | batch | `meta/__tests__/knipRatchet.test.ts`, `meta/__tests__/boundaryWiring.test.ts` | exact |
| G. `.dependency-cruiser.cjs` regex extension + seeded test | config + test | batch | rule `games-split-modules-are-leaves` (L73-85); `meta/__tests__/boundaryGates.test.ts` `withSeededRoot` | exact |
| H. Test-file splits (`library.test.ts`, `bottle.test.ts`, `user.test.ts`, `helperProcess.test.ts`, etc.) with `jest.mock` repointing | test | n/a | `depot.finalize.test.ts` + `depotLeaseMocks.ts` (62-10), per RESEARCH "Don't Hand-Roll" | exact |

## Pattern Assignments

### A. `steam/library/index.ts` (directory + public entry)

**Analog:** `src/backend/storeManagers/steam/depot/index.ts` L1-12
```ts
// Phase 21 depot-download orchestrator: public entry (62-10).
// ... Sibling modules import each other directly and never import this file.
export { CHUNK_CONCURRENCY, ... } from './download'
```
Differences, so do not copy blindly:
- `depot/index.ts` is a re-export barrel. `library/index.ts` is NOT: it holds the `SteamLibraryManager` default export itself. D-05 plus "no façade" means no `export ... from` lines. Only `storeManagers/index.ts:5`, `bootstrap.test.ts:292` and `steamStartupKeyringDeferral.test.ts:284` keep importing `steam/library`. Everything else goes to the owning submodule (importer table in RESEARCH §1).
- Back-edge rule to copy from 62-10 (`62-PATTERNS.md` "depot/index.ts" section): repoint every sibling that imports `../library` to the owning submodule BEFORE `git mv library.ts library/index.ts`, or you get `index -> sibling -> index`. Siblings must never import `library/index.ts` (verified zero edges from clusters into the class). The depcruise rule `no-depot-parent-back-edge` (L58-66) is the model for a seeded guard if you want one for `library/`.
- File shadows directory (RESEARCH Pitfall 3): do the `git mv` in its own commit.

### B. Sibling extraction (pure move)

**Analog:** `steam/gameUninstall.ts` header and imports (L1-52): a leaf that takes `steamGame: SteamGame`, imports `SteamGame` as a type only, imports forward only, and is listed in the depcruise leaf regex.
```ts
import type SteamGame from './games'            // type-only back-reference; runtime import of ./games is banned
import { ensurePlatformsCaptured, isBottleEligible } from './gameEligibility'
import { markBridgeGameUninstalled, resolveBridgeGameInstallRoot } from './gameInstall'
```
Rules the planner applies to every move commit:
- Move code byte-identical; edit only import paths. Add `export` to previously private helpers that now cross modules (62-10 precedent; a cross-module use satisfies knip).
- New module imports its dependencies directly from owning siblings (`import { x } from './acfState'`), never through `library/index.ts`.
- Same commit: move the module's `describe` blocks (cut whole blocks by line range, bodies unchanged, copy the `jest.mock` preamble then prune), repoint `jest.mock`/`jest.spyOn`/`jest.requireMock` targets, edit `meta/knip-baseline.txt` path for moved baselined symbols (gameInstall 11, stageDrmBottle 6, runnerClone 4, gameBridgeLaunch 1), and lower the line-gate baseline entry (D-13).
- Source-scan tests that `readFileSync` a moved file must be retargeted with a non-vacuity assertion: `metadataCapture.test.ts:165`, `steamDepotSkipCopyCensus.test.ts:39`, `games.test.ts:9401`, `steamResumeCopyCensus.test.ts:150`, `bottle.test.ts:1546,2673`, `installLocation.test.ts:629`, `helperProcess.test.ts:1099`, `runnerClone.test.ts:489`, `shimGenerate.test.ts:968`, `keyringTokenStore.test.ts:1619`, `logSecretGate.test.ts:433-447`, `steamAuthSessionPolicy.test.ts` Rules E/F allow-lists.
- Sibling flat files for `bridge/` and `bridge/drm/` (D-08): no `index.ts`. `library/` is a directory (about 14 pieces). `bottle` and `gameInstall`: flat siblings per RESEARCH (a directory is allowed only at about 4+ pieces).

### C. Handle-free state leaf + owning module (D-10 / D-16)

**Analog:** `src/backend/storeManagers/steam/bridge/helperProcess.ts` (the file is being split, so these excerpts are what move to `helperRegistry.ts`).

Seam setters (L146-151, L253-255, L279-283) and registry/teardown (L241, L285-300):
```ts
let steamWaitScheduleOverride: { budgetMs: number; intervalMs: number } | null = null
export function __setSteamWaitScheduleForTests(schedule: {...} | null): void {
  steamWaitScheduleOverride = schedule
}
const helpers = new Map<string, BridgeHelperEntry>()
let bridgeHelperPathOverride: string | null = null
export function __setBridgeHelperPathForTests(path: string | null): void { bridgeHelperPathOverride = path }
function unrefHandle(handle: unknown): void {
  ;(handle as { unref?: () => void } | null | undefined)?.unref?.()
}
let exitTeardownInstalled = false
function installExitTeardownOnce(): void {
  if (exitTeardownInstalled) return
  exitTeardownInstalled = true
  process.on('exit', () => shutdownAllBridgeHelpers())
}
```
Reset hook (L1139-1143) clears registry, path override AND wait schedule, so all five state items must live in one module (`helperRegistry.ts`):
```ts
export function __resetBridgeHelperStateForTests(): void {
  helpers.clear()
  bridgeHelperPathOverride = null
  steamWaitScheduleOverride = null
}
```
Rules:
- `helperSpawn.ts` and the readiness module call into the registry through exported accessors (small non-pure commit before the move) or exported `let` live bindings (RESEARCH A3: accessors recommended). No module keeps its own copy of any of the five.
- `unref` stays beside the handle it unrefs: spawn-side `unrefHandle(child)` + `installExitTeardownOnce()` (L399-402) move with `ensureHelperSpawned`; the three `timeout.unref?.()` (L655, 735, 753) and `sleep` (L303-310 region) stay with the readiness code.
- Retarget the source-assertion at `helperProcess.test.ts:1099` ("no module-level `let` of a ChildProcess") to all three files.
- Same shape elsewhere: `bottledSteam.ts` owns `bottledRaiseLoopsCancelled`, `activeRaiseTimers`, `__stopBottledRaiseLoops` (bottle.ts L434-447, unref L493) together. `bridgeBottle.ts` owns `drmBridgeRunners` plus its four accessor fns. `library/uninstallPolling.ts` owns `activeUninstallPolls` + `setInterval`/`unref` (L4071/L4139). `library/runningPoll.ts` owns `runningPollTimer` + `unref` (L4376/L4382).
- **D-16 documented exception (no exact analog):** `library/pollState.ts` holds `activePolls`, tick constants, bridge-finalized trio and `steamRequestNoticeSeq`. It is a handle-free leaf: no `setInterval`, no `process.on`. `installPolling.ts` creates the timer and keeps `timer.unref?.()` adjacent to `activePolls.set(...)` (current L3562/L3718). Put a comment at the top of `pollState.ts` naming D-16 and the reason (breaks `pollInstallOnce` <-> hold helpers <-> `startInstallPolling` cycle). Unref assertions to keep passing: `setInterval` spies at old `library.test.ts` L2830, 3077, 6650, 6658, 6834. They move with the timer (`installPolling.test.ts`, `uninstallPolling.test.ts`, `runningPoll.test.ts`).
- Cross-module `let` (`reconcileRanDuringRearm`, `pendingSteamHoldRearm`): `restartHold.ts` owns them and exports mutators (`armRestartHoldRearm`, `finishRestartHoldRearm`); that is a separate non-pure commit before the move (RESEARCH Pitfall 4).
- Sidecar exit contract (`Skill("gamelib-conventions")`): no new module may do top-level work; run the `unref` tests plus `pnpm smoke:sidecar`.

### D. Class method to free function lift, no delegating stub (D-07 / D-15 / stub todo)

**Analog (shape):** 62's lifted `uninstall(steamGame: SteamGame, _args)` in `gameUninstall.ts` L53-58: free function, first param is the instance, `this.x` becomes `steamGame.x`, mechanical only. The stub-removal side is the delegating members on `SteamGame` in `games.ts` (16 internal stubs, 15 call sites, listed in RESEARCH §5); nine `Game` interface members keep thin methods.

Pattern to apply:
- Lift commit is non-pure and separate from pure-move commits. It does `this.` rewrites only, with no logic edits (62 Pitfall 1).
- Remove the class method outright and convert callers (`steamGame.launchDrmModeGame()` becomes `launchDrmModeGame(steamGame)`). Callers are exactly the 15 sites in RESEARCH §5 (`gameBridgeLaunch.ts` 144/332/494/612, `gameInstall.ts` 361/406/425/1260, `gameLaunch.ts` 144/927, `gameUninstall.ts` 66, `games.ts` 116/735/1329/1345, `installFormIpc.ts` 116).
- Keep `async` and return the free function's promise unwrapped on the nine retained interface methods (62-06 lesson: dropping `async` adds a microtask hop).
- Spies: the six `SteamGame.prototype` spies in `games.test.ts` (L1081 stays: `fetchMetadataIfNeeded` is a real method; L11757, 13763/13791/13811, 16239) become `jest.spyOn(<owningModule>, '<fn>')`. A module-export spy only intercepts calls made from other modules, so confirm each target is called cross-module (`launchBridgeGameBody` at `gameBridgeLaunch.ts:144` and `launchDrmModeGame` at `:332` are called from other modules per RESEARCH; check at conversion).
- `library/refresh.ts` (D-07): `refresh()`, `syncOwnedLibrary`, `refreshInstallState` become free functions. The class keeps one-line `refresh()`/`refreshInstallState()` because they are `LibraryManager` interface members (`common/types/game_manager.ts:90-125`) and `skeletonFlows.test.ts:681-771` / `steamFocusRefreshWire.test.ts:228,246` spy on the instance. Inside `refresh()`, the former `this.refreshInstallState()` becomes a direct call (does not hit an instance spy; re-grep for spies during a real `refresh()` at plan time).
- `user.ts` (D-15): `userTypes.ts` (constants/types leaf), `userSignInState.ts` (state leaf, owns `session, qrSessionState, qrLastLoggedStatus, credSessionState, _credSettleCallbacks` + `resetSignInState()`, called from `logout()`), `userSignIn.ts`, `userRedeem.ts`. `acquireAuthenticatedWithToken` loses `private`. Repoint `sidecar/steamAuthFlowRegistration.ts` (178, 251 and the other sign-in calls) directly. Tests that poke `(SteamUser as any).X` (user.test.ts:247-258, 2044, 2304, 2433) keep working for fields that stay in `user.ts`; sign-in fields need the new state module. Add `jest.mock('../userSignIn')`/`('../userRedeem')` where the old class automock used to cover those statics. Retarget `keyringTokenStore.test.ts:1619` text scan to the three new files.

### E. `meta/steamLineCeiling.cjs` + `meta/steamLineCeilingBaseline.json`

**Analog:** `meta/indexedAccessRatchet.cjs` (header contract L1-35, evaluate L106-146, CLI L190+) and `meta/knipRatchet.cjs` (`evaluate` L120-140, `module.exports` + `require.main` guard L199-201).

Header style (indexedAccessRatchet L1-35, copy the explanation of equality ceiling and "no --update flag: numbers move by hand"):
```js
'use strict'
const fs = require('node:fs')
const path = require('node:path')
```
Failure shape to mirror (indexedAccessRatchet L128-142):
```js
} else if (count === 0) {
  failures.push(`${b} is at 0: delete it from the baseline in this commit.`)
} else if (count < base) {
  failures.push(`${b} has ${count} site(s), below its baseline ${base}: lower ${b} to ${count} in this commit.`)
}
```
Entry guard (knipRatchet L199-201):
```js
module.exports = { evaluate, identitiesFromReport, parseBaseline }
if (require.main === module) main()
```
Export `{ countLines, collectFiles, evaluate }`. Failure rules, counting function (`wc -l` equivalent), scope/exclusion list and the "fewer than ~150 files scanned" floor are specified in RESEARCH "Line Gate Design" with a ready `evaluate` sketch. Baseline is `{ "<repo-relative posix path>": <wc -l> }`, initial = the 10 counts from CONTEXT. Read the JSON with the same `try/catch` + `console.error('cannot read baseline ...'); process.exit(1)` shape as indexedAccessRatchet `main()`. No child process, so the fake-HOME rule does not apply. Prettier: `meta/` may be prettier-ignored, so run `npx prettier --file-info` before writing a `<verify>` check.

### F. Gate test and wiring

**Analog 1:** `meta/__tests__/knipRatchet.test.ts` L1-27: pure cases plus a CLI end-to-end (header: "a pure-only suite can pass while the shipped command is broken"). Uses `createFakeHomeProfile` import from `../../src/backend/testUtils/fakeHomeProfile` and `require('../knipRatchet.cjs')` with the eslint-disable pair:
```ts
/* eslint-disable @typescript-eslint/no-require-imports */
const { evaluate, ... } = require('../knipRatchet.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */
const REPO_ROOT = join(__dirname, '..', '..')
```
Seeded specimens: over limit, grew, stale entry, below-limit entry, `.generated.` and `__tests__` excluded, zero-files guard. If the CLI arm spawns node, use `createFakeHomeProfile()` (a hand-rolled `env` fails `fakeHomeIsolation.test.ts`).

**Analog 2:** `meta/__tests__/boundaryWiring.test.ts` L12-73: `js-yaml` `load()` of `lint.yml`, `steps.some((s) => s.run === 'pnpm boundaries')`, self-test that files were read, near-miss test with the step filtered out. Copy it for `pnpm steam-line-ceiling`.

**Wiring edits:**
- `package.json` scripts, next to L51: `"boundaries": "depcruise --config .dependency-cruiser.cjs --output-type err-long src/backend"` then add `"steam-line-ceiling": "node meta/steamLineCeiling.cjs"`.
- `.github/workflows/lint.yml` L34-35: add a sibling step `- name: Steam file line ceiling` / `run: pnpm steam-line-ceiling` right after `Module boundaries`.
- `.husky/pre-push` line 2: append ` && pnpm steam-line-ceiling` to `pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update && pnpm find-deadcode && pnpm boundaries`. Keep it on line 2 (`tsconfigMeta.test.ts:94` cites `pre-push:2`; `boundaryWiring.test.ts` asserts line 1 is the shebang and line 2 contains `pnpm boundaries`).

### G. depcruise rule extension + seeded test

**Analog:** `.dependency-cruiser.cjs` L73-85
```js
name: 'games-split-modules-are-leaves',
from: { path: `${STEAM}game(Constants|SessionState|Requirements|ProtocolUrl|DrmLaunch|Eligibility|Install|Launch|LaunchOverlay|BridgeLaunch|Maintenance|Uninstall)\\.ts$` },
to:   { path: `${STEAM}games\\.ts$`, dependencyTypesNot: ['type-only'] }
```
Extend the alternation (tightening only, D-13) with `InstallBridge|InstallDepot|BridgeWineLaunch|Metadata` and add `bridgeInstallState` / `bridgeRouteVerdict` as a second alternation (they do not start with `game`), e.g. `(game(...)|bridgeInstallState|bridgeRouteVerdict)\\.ts$`. Do not touch the other four rules; `no-circular-depot` stays depot-scoped (games <-> library is an existing cycle).

**Seeded test analog:** `meta/__tests__/boundaryGates.test.ts` `withSeededRoot` (L91-140) and the `describe('... (seeded violations)')` at L142+, e.g. the `no-cross-store-manager` pair (fires, then exempts tests):
```ts
test('no-cross-store-manager fires on a gog -> steam import', () => {
  withSeededRoot(
    { [`${SM}/gog/seed.ts`]: `import '../steam/seed'\n`, [`${SM}/steam/seed.ts`]: `export const x = 1\n` },
    ({ cruise }) => {
      const r = cruise()
      expect(r.status).not.toBe(0)
      expect(names(r)).toContain('no-cross-store-manager')
    })
})
```
Add one arm per new leaf name: `steam/gameInstallBridge.ts` runtime-importing `./games` fires `games-split-modules-are-leaves`; `import type` does not. Spawns go through `createFakeHomeProfile` (already inside `withSeededRoot`). Also update `gamesModuleSurface.test.ts` `LIFTED_OWNERS` (L38-46) with the new leaves and `GAMES_TS_EXPORTS` when `getBridgeRouteVerdict` leaves `games.ts`; those leaves may reference `SteamGame` only as `import type SteamGame from './games'` (the L84-86 assertion).

### H. Test-file split with jest.mock repointing (D-03)

**Analog:** `depot.finalize.test.ts` + `depotLeaseMocks.ts` (62-10 precedent per RESEARCH): per-module test file with copied `jest.mock` preamble and a shared non-hoisted helper. Cut whole `describe` blocks by line range with bodies byte-identical. Mapping tables for `library.test.ts` (9,299 lines to 12 files), `bottle.test.ts`, `user.test.ts`, `helperProcess.test.ts` are in RESEARCH §1, §2, §4, §8.

Repoint patterns (RESEARCH "Code Examples"):
```ts
// before
import * as libraryModule from '../library'
jest.spyOn(libraryModule, 'startInstallPolling')
// after: spy on the module that now OWNS the function
import * as installPolling from '../library/installPolling'
jest.spyOn(installPolling, 'startInstallPolling')
```
Specific traps:
- `jest.mock('../bottle', () => ({...}))` factories list only the names used; after a split the code under test imports a different, now-real module. Add one `jest.mock` per new owner (e.g. `cancelDelete.test.ts:35` becomes three mocks: `resumeBreadcrumbs`, `acfState`, `installRoot`).
- Every `jest.requireMock('../bottle')` follows the mocked name's new owner: `games.test.ts` L6964, 8358, 14190, 14913; `removeCopies.test.ts` L525, 579, 849; `shimGenerate.test.ts:2981`.
- Spy direction flips (RESEARCH Pitfall 1): after a split, calls that were intra-module become cross-module, so spies on `readAcfState` (games.test.ts L8806, 9824, 10342, 10828, 10862, 10899, 10945, 10973, 11003, 11270) and `startInstallPolling` (about 20 sites) can start intercepting real pollers. Re-run all of `games.test.ts` after every library move and diff pass/fail by test name against the baseline (3 known failures).
- Test files are exempt from the line gate (D-03).

## Shared Patterns

### Pure-move commit contents (apply to every extraction plan)
1. Move code; add `export` where needed; edit imports.
2. Move the owning `describe`s; repoint `jest.mock` / `spyOn` / `requireMock` / source-scan paths.
3. Edit `meta/knip-baseline.txt` paths for moved baselined symbols (identity is `type<TAB>path<TAB>symbol`, `knipRatchet.cjs` L120-140 fails on both new and vanished lines).
4. Lower or delete the file's entry in `meta/steamLineCeilingBaseline.json` (the gate forces this).
5. Gates: `pnpm boundaries` (zero), `pnpm steam-line-ceiling`, `pnpm find-deadcode`, `node meta/indexedAccessRatchet.cjs` (`src/backend/storeManagers/steam` is an adopted bucket held at 0), `npx jest src/backend/storeManagers/steam --silent --maxWorkers=8`, `npx prettier --check <exact paths>`.
6. `// log-secret-gate-exempt` comments move verbatim (`provisionBottle`, `provisionBridgeBottle`); update the pinned file list in `meta/__tests__/logSecretGate.test.ts:433-447`.

### Fake-HOME rule
**Source:** `src/backend/testUtils/fakeHomeProfile.ts` (`createFakeHomeProfile`); usage example in `boundaryGates.test.ts` `withSeededRoot` L100-139 (`profile.childEnv(process.env)`, `profile.dispose()` in `finally`). **Apply to:** any new test that spawns a child process (steamLineCeiling CLI arm, seeded depcruise arms). Never a hand-rolled `env` literal.

### Gate wiring trio
**Source:** `lint.yml` L34-35, `package.json` L51, `.husky/pre-push` line 2 (see F). **Apply to:** `steam-line-ceiling` only.

### Sidecar exit contract
**Source:** `bridge/helperProcess.ts` L285-300, `Skill("gamelib-conventions")`. **Apply to:** every moved timer, watcher or handle (family C list).

### Verify blocks
`npx prettier --check` over exact paths written; run `--file-info` first and omit the check where every path is ignored (`meta/` may be).

## No Analog Found

| File | Role | Data flow | Reason |
|---|---|---|---|
| `library/pollState.ts` (D-16 shape) | state leaf split from its timer | event-driven | No existing module separates a registry Map from the module that creates its `setInterval`. Use `helperRegistry` rules above, with the documented deviation comment. |
| Map-valued per-file line baseline JSON | baseline | batch | `indexedAccessBaseline.json` is bucket to count and `knip-baseline.txt` is identity text; path to count is a new but trivial shape (RESEARCH "Line Gate Design"). |
| `library/` as a non-barrel directory entry | public entry | request-response | `depot/index.ts` is a re-export barrel; `library/index.ts` must hold the class and re-export nothing. |

## Metadata

**Analog search scope:** `meta/`, `meta/__tests__/`, `.dependency-cruiser.cjs`, `.github/workflows/lint.yml`, `.husky/pre-push`, `package.json`, `src/backend/storeManagers/steam/` (`depot/index.ts`, `gameUninstall.ts`, `bridge/helperProcess.ts`, `__tests__/gamesModuleSurface.test.ts`)
**Files read or excerpted:** about 12 (cluster maps taken from 65-RESEARCH.md and 62-PATTERNS.md, not re-derived)
**Pattern extraction date:** 2026-11-07
