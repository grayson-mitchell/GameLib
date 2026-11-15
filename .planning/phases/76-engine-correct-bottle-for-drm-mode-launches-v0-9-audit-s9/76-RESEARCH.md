# Phase 76: Engine-correct bottle for DRM-mode launches (v0.9 audit S9) - Research

**Researched:** 2026-11-15
**Domain:** Internal GameLib backend (TypeScript, Steam bridge launch path, engine switch). No new libraries.
**Confidence:** HIGH (all findings read from current source in this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** In the DRM branch of the bridge launch, after `preflightCrossover` returns healthy, call `prepareBottleForEngine({ next: crossover, ... })` — the same switch TCP launches use via `selectLaunchEngine`. If it returns `ok: true`, launch. If it returns `ok: false` (bottle-busy, game-running, marker-newer, invalid-bottle, DXVK/restore failure, pin unavailable), **refuse the launch** with a clear message. Never launch over a mismatched bottle.
- **D-02:** The DRM branch reuses the TCP path's offline up-front refusal (`offlineLaunchCertainlyBlocked`, G22/G25, 59-26): when offline and returning the bottle to CrossOver needs an engine pin that is not on disk, refuse before attempting the switch.
- **D-03:** The rule is keyed on the bottle's engine marker, not on how it got there. Any non-CrossOver marker — install-time fallback (the audit's S9 case), an engine override set while the title was still TCP mode, a Wine Manager build — is switched back to CrossOver on a DRM launch. A bottle already on CrossOver is a no-op (`changed: false`).
- **D-04:** The DRM branch still never calls `decideLaunchEngine` and never selects the built-in engine; the per-game override stays ineffective in DRM mode (`isDrmModeFromVerdict`, `overrideEligible`).
- **D-05:** A successful switch is silent: show the existing `engine-download` / `setting-up` game status (the `onSwitching` callback TCP launches pass), then launch. No confirm dialog, no toast.
- **D-06:** Refusals reuse existing surfaces (`showEngineDialog`, `notifyCrossoverRequired`) and the per-reason wording TCP launches already show. Add a DRM-specific i18n string only where no existing string fits. Every refusal sends the terminal `done` status (the DRM path bypasses launcher.ts's `done`, IN-01/D-05 of Phase 56).
- **D-07:** Launch-side only. Install keeps choosing the creation engine with `decideCreationEngine` (presence-only); `.bind` is not known when the bottle is created, and the launch-side switch covers every path that can leave a non-CrossOver marker.
- **D-08:** Unit tests for each branch: marker already CrossOver (no switch), switch succeeds, each `ok: false` reason refuses and sends `done`, offline pre-check refuses, CrossOver unhealthy still refuses via `notifyCrossoverRequired` as today.
- **D-09:** Plus one live macOS UAT: install a SteamStub title with CrossOver hidden (bottle gets the Wine-Staging pin), restore CrossOver, launch; confirm the engine marker now reads crossover and the launch reaches the DRM-mode path (lsteamclient game-process trace, per the strict "verified" criterion D-56-15/16). UAT file follows the repo's UAT item shape convention.

### Claude's Discretion
- Which SteamStub title to use for the live UAT — pick one already proven in DRM mode in the Phase 56 UAT.
- How to factor the shared pre-check + switch between the TCP and DRM paths (extract a helper vs inline), as long as the TCP path's behaviour is unchanged.

### Deferred Ideas (OUT OF SCOPE)
None. Out of scope per phase boundary: DRM mode on the built-in engine, changing install's creation-engine choice, the legacy shared-bottle hard-block (WR-06).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEBT-01 | A DRM-mode launch never runs over a bottle initialised by the fallback engine (audit S9) | Insertion point `gameBridgeLaunch.ts` L180-196; mirror of `selectLaunchEngine` L505-720; reason-to-dialog map below |
</phase_requirements>

## Summary

The defect is confirmed in current code. `launchBridgeGameBody` in `src/backend/storeManagers/steam/gameBridgeLaunch.ts` (the `if (wantsDrm)` block, ~L180-196) only runs `preflightCrossover`; on `healthy` it falls through to `drmLaunchSetup` without ever touching the bottle's engine marker. The TCP branch (`else`) calls `selectLaunchEngine`, which does the offline pre-check, `decideLaunchEngine`, and `prepareBottleForEngine`. `prepareBottleForEngine` (engine/engineSwitch.ts, instance on `steamGame.deps.engineRuntime.switcher`) already does everything needed: reads marker, returns `{ok:true, changed:false}` when the marker is already CrossOver, otherwise refuses on busy/running/newer/invalid/shared, kills the old wineserver, restores DXVK, writes the marker.

The fix is small: one new async helper (recommended: exported from `gameLaunch.ts` next to `selectLaunchEngine`, e.g. `prepareDrmBottleForCrossover(steamGame, bottleName, pre, connectivity)`) called from the DRM branch after the `healthy` check. It must (1) run the offline pre-check with override pinned to `'crossover'`, (2) build a `{kind:'crossover'}` `EngineSelection` from the healthy preflight, (3) call `prepareBottleForEngine` with the same `deps`/`onSwitching` as TCP, (4) map each `ok:false` reason to the same dialogs TCP uses, (5) return `{ok:false}` so the caller does `sendLaunchDone` + `return false`. It must NOT call `decideLaunchEngine` or `setEngineSelection` (D-04). `connectivity` is already in scope in `launchBridgeGameBody` (passed to `selectLaunchEngine` at ~L198).

**Primary recommendation:** Extract the reason-to-dialog mapping and the offline pre-check from `selectLaunchEngine` into shared private helpers in `gameLaunch.ts`, have `selectLaunchEngine` call them (behaviour unchanged, proven by the existing ~100 engine-selection tests in `games.test.ts`), and add a new DRM helper that reuses them. Add tests to `games.test.ts` in the existing `describe('engine selection')` block.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Engine-correct bottle before DRM launch | Backend (Node sidecar, `storeManagers/steam`) | engine/ module (`engineSwitch`) | Launch orchestration is backend; marker/kill/DXVK logic already lives in `backend/engine/engineSwitch.ts` |
| Refusal UX (dialog + notify + `done`) | Backend dialog helpers (`showEngineDialog`) | Frontend (renders `gameStatus`/dialog frame) | Existing surfaces; no frontend change |
| i18n strings | `public/locales` `gamelib` namespace | — | Only if a DRM-specific string is needed |

## Standard Stack

No new packages. Everything is in-repo.

| Module | Role |
|--------|------|
| `src/backend/engine/engineSwitch.ts` | `prepareBottleForEngine` (via `deps.engineRuntime.switcher`), `readBottleEngineMarkerKind`, `restoreNeedsAbsentPin`, `switchContextFrom` |
| `src/backend/engine/offlineRefusal.ts` | `offlineLaunchCertainlyBlocked` (pure) |
| `src/backend/engine/engineDecision.ts` | `preflightCrossover`, `isCrossoverMissing`, `CrossoverPreflight` |
| `src/backend/storeManagers/steam/gameLaunch.ts` | `selectLaunchEngine`, `showEngineDialog`, `notifyCrossoverRequired`, `sendLaunchDone` |
| `src/backend/storeManagers/steam/engine/steamEngineDeps.ts` | `steamSwitchDeps`, `steamDecisionDeps`, `steamDecisionServices`, `readSteamEngineOverride` |

**Package Legitimacy Audit:** not applicable (no external packages installed).

## Exact Signatures (verified in source) [VERIFIED: codebase read]

`PrepareArgs` (engineSwitch.ts ~L560):
```ts
type PrepareArgs = {
  key: string                 // steamGame.appId
  bottleName: string          // bridgeBottleSettings.wineCrossoverBottle
  next: EngineSelection
  crossoverHealthy?: boolean  // default true
  onSwitching?: () => void    // called once, only when a real change starts (before kill/DXVK)
  deps: Partial<EngineSwitchDeps> & Pick<EngineSwitchDeps,
    'ctx'|'crossoverSettings'|'killWith'|'installRemove'|'resolveCrossoverBinDir'|'ensurePinEngine'|'fallbackSettings'>
}
```
`PrepareResult` (engineSwitch.ts L101):
```ts
| { ok: true; changed: boolean }
| { ok: false; reason: 'game-running'|'dxvk-failed'|'invalid-bottle'|'shared-bottle'|'bottle-busy'|'marker-newer'; detail: string }
```
Notes: there is no "pin unavailable" reason; an unresolved pin during a restore surfaces as `dxvk-failed` (`no DXVK source to restore` / `no built-in engine to restore`). `changed:false` for an already-CrossOver marker; the no-marker case infers the marker then writes it.

`EngineSelection` crossover arm (engineTypes.ts L16): `{ kind:'crossover'; reason:'cx-healthy'|'cx-inconclusive'|'override'; crossoverBuild:string|null; binDir:string }`. Build it from the healthy preflight: `{ kind:'crossover', reason:'cx-healthy', crossoverBuild: pre.build, binDir: pre.binDir }`. `markerFor` only uses `binDir` (marker `wineserverBin = join(binDir,'wineserver')`).

`CrossoverPreflight` healthy arm: `{kind:'healthy'; binDir:string; build:string|null; trialDaysRemaining:number|null}`.

`offlineLaunchCertainlyBlocked(input)` returns `{blocked:false} | {blocked:true; arm:'crossover-missing'|'restore-needs-pin'}`; input = `{offline, override, crossoverMissing, markerKind, currentPinInstalled, restoreNeedsAbsentPin}`. For DRM pass `override: 'crossover'`: then the `crossover-missing` arm never blocks (the preflight's `notifyCrossoverRequired` handles missing CrossOver, which is more accurate) and only the `restore-needs-pin` arm applies, which under `'crossover'` blocks even when the current pin is installed (WR-02: the restore needs the marker's own pin). That is exactly the D-02 semantics.

## How `selectLaunchEngine` Maps Results (the model to mirror) [VERIFIED: gameLaunch.ts L505-720]

Offline pre-check call shape (inside `if (connectivity.offline && (override==='automatic'||'crossover'))`):
```ts
const sw = await import('backend/engine/engineSwitch')
const switchCtx = sw.switchContextFrom(steamGame.deps)
offlineLaunchCertainlyBlocked({
  offline: connectivity.offline, override,
  crossoverMissing: await isCrossoverMissing(steamDecisionDeps(steamDecisionServices(steamGame.deps))),
  markerKind: sw.readBottleEngineMarkerKind(switchCtx, bottleName),
  currentPinInstalled: steamGame.deps.engineRuntime.fallback.isPinnedEngineInstalled(ENGINE_PINS.current),
  restoreNeedsAbsentPin: sw.restoreNeedsAbsentPin(switchCtx, bottleName)
})
```
On `blocked`: `logWarning('SteamGame: appId X launch blocked before pre-flight: <why> (<arm>)')` then `showEngineDialog(steamGame, title, i18next.t('gamelib:steam.engine.downloadFailed', default, {reason:'offline'}), 'engine-download-failed')` then `{ok:false}`.

`prepareBottleForEngine` call:
```ts
await prepareBottleForEngine({
  key: steamGame.appId, bottleName, next: sel,
  crossoverHealthy: decision.preflight?.kind === 'healthy',
  deps: { ...steamSwitchDeps(steamEngineServicesFrom(steamGame.deps)), ensurePinEngine: steamGame.restorePinEngine },
  onSwitching: () => sendGameStatusUpdate(steamGame.deps, { appName: steamGame.appId, runner:'steam', status:'engine-download', context:'setting-up' })
})
```
(`steamEngineServicesFrom` from `backend/services/engineServices`; `prepareBottleForEngine` from `steamGame.deps.engineRuntime.switcher`.)

Reason to surface (for `sel.kind==='crossover'`, i.e. the DRM case):

| `prep.reason` | TCP surface | i18n key / dialog tag |
|---------------|-------------|------------------------|
| `dxvk-failed` (crossover target) | `clearEngineSelection`, warn log, dialog | `gamelib:steam.engine.restoreFailed` / `engine-restore-failed` |
| `shared-bottle`, `bottle-busy` | clear, warn, dialog | `gamelib:steam.engine.sharedBottle` / `engine-shared-bottle` (note: this single string covers both reasons today) |
| `marker-newer` | clear, warn, dialog | `gamelib:steam.engine.markerNewer` / `engine-marker-newer` |
| `game-running`, `invalid-bottle` (else branch) | clear, warn log only, NO dialog, `{ok:false}` | none |

Gap for D-06: for DRM, `game-running` and `invalid-bottle` would be silent refusals if mirrored exactly. CONTEXT says "Every refusal ... clear message" and D-01 says "refuse with a clear message". Recommend the helper shows a dialog for those two reasons in the DRM path (a silent Play press that does nothing is the failure mode `notifyCrossoverRequired` was written to avoid). Needs one new i18n string, e.g. `gamelib:steam.engine.drmSwitchRefused` ("{{title}} could not start in DRM mode because its game files could not be switched back to CrossOver ({{reason}}). Close any running game in this bottle and try again."). Also note: a TCP launch tolerates `dxvk-failed` on non-crossover targets; irrelevant for DRM (target is always CrossOver).

Do not call `setEngineSelection`/`clearEngineSelection` for the DRM path: TCP sets the registry selection so spawn settings use the engine; DRM mode runs on the clone runner via `drmLaunchSetup`, and `decideLaunchEngine` is never consulted (D-04). `clearEngineSelection` on refusal is harmless but unnecessary; `launchEngine.ts` refuse paths clear it for the non-bridge route. Open question below.

## DRM Branch Today (what to change) [VERIFIED: gameBridgeLaunch.ts L180-235]

```ts
if (wantsDrm) {
  const { preflightCrossover } = await import('backend/engine/engineDecision')
  const { steamDecisionDeps, steamDecisionServices } = await import('./engine/steamEngineDeps')
  const pre = await preflightCrossover(bridgeBottleSettings.wineCrossoverBottle, steamDecisionDeps(steamDecisionServices(steamGame.deps)))
  if (pre.kind !== 'healthy') {
    notifyCrossoverRequired(steamGame, 'drm', pre)   // dialog tag crossover-required-drm
    sendLaunchDone(steamGame)
    return false
  }
  // <-- insert here
} else { ... selectLaunchEngine ... if (!engine.ok) { sendLaunchDone(steamGame); return false } }
```
- `sendLaunchDone(steamGame)` (gameLaunch.ts L407) = `sendGameStatusUpdate(deps, {appName, runner:'steam', status:'done'})`, idempotent.
- Later DRM failure path (`drm.status==='error'`, and the `finally` after `launchDrmModeGame`) already sends `done`. The new refusal must send it itself because it returns before those.
- Ordering: put the offline pre-check BEFORE `preflightCrossover` (TCP does the same: "refuse now instead of waiting out the probe"; the probe can take seconds/minutes). Concretely: offline check -> preflight -> (unhealthy: notifyCrossoverRequired) -> switch. If the helper does only the switch step, expose the offline check as a separate exported function `drmOfflineRefusal(steamGame, bottleName, connectivity)` so the order is right. Because `pre` is needed for `binDir`, the switch step must follow preflight.
- `writeBridgeModeVerdict` (L~170) runs before this block and is unaffected.

## Architecture Patterns

```
Play (DRM title) -> launchBridgeGameBody
  -> resolveBridgeMode == 'steamclient-layer' (wantsDrm)
  -> [NEW] offline? marker non-crossover && restore needs absent pin -> dialog downloadFailed, done, false
  -> preflightCrossover(bottle)
       unhealthy -> notifyCrossoverRequired('drm'), done, false          (unchanged)
  -> [NEW] prepareBottleForEngine({next: crossover from pre, onSwitching: setting-up status})
       ok:true  (changed or not) -> continue silently
       ok:false -> mapped dialog, done, false
  -> drmLaunchSetup -> launchDrmModeGame (unchanged)
```

### Recommended structure
- `gameLaunch.ts`: new exported `prepareDrmBottleForCrossover(...)` returning `{ok:true}|{ok:false}`; refactor candidate: extract `refuseOfflineBlocked(...)` and `showSwitchRefusal(...)` shared with `selectLaunchEngine`. The extraction MUST leave `selectLaunchEngine` behaviour byte-equivalent (same i18n keys/defaults, same logWarning strings: tests assert `launch blocked before pre-flight: ...` text and `tag=engine-download-failed`).
- `gameBridgeLaunch.ts`: only the call site changes.

### Anti-Patterns
- Calling `decideLaunchEngine` (would let the per-game override or CrossOver-unhealthy fallback select a pin in DRM mode; violates D-04).
- Passing the user's real override into the offline check (use `'crossover'`; the override is ineffective in DRM).
- Forgetting `sendLaunchDone` on any refusal (card sticks on `setting-up`; `onSwitching` sets `engine-download`/`setting-up` and nothing else clears it).
- Passing `crossoverHealthy: false`: the DRM branch only reaches the switch when preflight is healthy, so use the default/true.

## Don't Hand-Roll

| Problem | Use Instead |
|---------|-------------|
| Marker read/switch/kill/DXVK restore | `prepareBottleForEngine` (already serialises per bottle, WR-02) |
| Offline certain-block predicate | `offlineLaunchCertainlyBlocked` |
| Refusal UI | `showEngineDialog` / `notifyCrossoverRequired` |
| Test-only child processes | `createFakeHomeProfile()` if any test spawns (none expected; games.test.ts mocks everything) |

## Common Pitfalls

1. **Silent refusal for `game-running`/`invalid-bottle`** (TCP else-branch shows no dialog). Add a DRM dialog or the user gets a Play button that does nothing.
2. **Status left on `setting-up`**: `onSwitching` fires before the kill; any later `ok:false` (e.g. `dxvk-failed`) must send `done`.
3. **Extraction drift in `selectLaunchEngine`**: tests assert exact log substrings and i18n keys (`downloadFailed`, `restoreFailed`, `sharedBottle`, `markerNewer`). Run the full `games.test.ts` after refactoring.
4. **Mock defaults in games.test.ts**: `readBottleEngineMarkerKind`, `switchContextFrom`, `restoreNeedsAbsentPin` are bare `jest.fn()` (return undefined); `mockPrepareBottleForEngine` defaults to `{ok:true, changed:false}` in the file-level `beforeEach` (L1839), so existing DRM tests keep passing. `steamSwitchDeps` mock returns `{crossoverSettings: jest.fn()}`.
5. **jest.mock ceiling**: `games.test.ts` has an exact `jestMock` ceiling of 47 in `meta/backendDiCeilings/storeManagers.steam.json` ("a file above its entry fails; below fails too; no update flag"). New tests in `games.test.ts` must reuse the existing mocks (no new `jest.mock` calls), or the ceiling must be bumped by hand in the same commit (and bumping is growth the ratchet discourages). A new test FILE would need its own shard entry (and a nonzero-count file in no shard fails). Prefer adding to `games.test.ts`.
6. **Overlay/DRM cross-state**: a bottle left on a pinned engine may have the overlay/clone runner state; `prepareBottleForEngine` kills the old wineserver itself. After a successful switch `drmLaunchSetup` runs unchanged.
7. **Don't leave a stale registry selection**: if a previous TCP launch armed a `pinned` selection for the appId and it is not cleared, nothing in the DRM path reads it today (`gameLaunchOverlay.ts` L295 reads it only on the TCP overlay path). Low risk; see Open Questions.

## Code Examples

Proposed helper skeleton (shape only; mirrors `selectLaunchEngine`):
```ts
// gameLaunch.ts
export async function prepareDrmBottleForCrossover(
  steamGame: SteamGame,
  bottleName: string,
  pre: Extract<CrossoverPreflight, { kind: 'healthy' }>
): Promise<{ ok: true } | { ok: false }> {
  const { prepareBottleForEngine } = steamGame.deps.engineRuntime.switcher
  const { steamSwitchDeps } = await import('./engine/steamEngineDeps')
  const { steamEngineServicesFrom } = await import('backend/services/engineServices')
  const next: EngineSelection = { kind: 'crossover', reason: 'cx-healthy', crossoverBuild: pre.build, binDir: pre.binDir }
  const prep = await prepareBottleForEngine({
    key: steamGame.appId, bottleName, next,
    deps: { ...steamSwitchDeps(steamEngineServicesFrom(steamGame.deps)), ensurePinEngine: steamGame.restorePinEngine },
    onSwitching: () => sendGameStatusUpdate(steamGame.deps, { appName: steamGame.appId, runner: 'steam', status: 'engine-download', context: 'setting-up' })
  })
  if (prep.ok) return { ok: true }
  // log + showEngineDialog per reason (table above)
  return { ok: false }
}
```
Call site: `if (!(await prepareDrmBottleForCrossover(...)).ok) { sendLaunchDone(steamGame); return false }`.

## Existing Tests and Mocking Patterns [VERIFIED]

- All of this logic is tested in ONE file: `src/backend/storeManagers/steam/__tests__/games.test.ts` (~16.5k lines, `SteamGame.launch()` end to end). There is no `gameLaunch.test.ts`/`gameBridgeLaunch.test.ts`. Relevant blocks: `describe('engine selection')` at ~L15729 (selectLaunchEngine tests incl. `game-running from prepareBottleForEngine` L15914, `G22: offline refusal...` L16013, DRM unhealthy preflight `it.each(['expired','missing','broken'])` ~L16400, bottled-Steam unhealthy ~L16430); DRM-mode suite `describe('Phase 56: steamclient-layer DRM mode (56-12)')` L12333 (uses `detectDrmWrapper` mock -> `'steamstub'`).
- Mock pattern: `jest.mock('backend/engine/engineDecision')` (preflightCrossover, decideLaunchEngine, isCrossoverMissing all `jest.fn`), `jest.mock('../engine/steamEngineDeps')`, `jest.mock('backend/engine/engineSwitch')` with `createEngineSwitcher` delegating to `mockPrepareBottleForEngine`, `readBottleEngineMarkerKind`/`restoreNeedsAbsentPin`/`switchContextFrom` as `jest.fn`; `mockIsPinnedEngineInstalled`; `checkConnectivityNow` mocked (`{offline,source,elapsedMs}`); dialogs via `jest.requireMock('backend/dialog/dialog').showDialogBoxModalAuto` (message equals the i18n KEY in tests, e.g. `toContain('crossoverRequired.drm')`); status via `sendGameStatusUpdate` mock asserting `objectContaining({status:'done'})`; `drmLaunchSetup` via `jest.requireMock('../bridge/drm/drmLaunchSetup').__drmLaunchSetupMock`.
- Engine-level: `src/backend/engine/__tests__/engineSwitch.test.ts`, `offlineRefusal.test.ts`, `launchEngine.test.ts` (no change needed: `prepareBottleForEngine` is untouched).
- Run commands (jest 29, root `jest` config; `pnpm test` = `jest`):
  - Quick: `pnpm exec jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "DRM"` (or `-t "engine selection"`)
  - Full file: `pnpm exec jest src/backend/storeManagers/steam/__tests__/games.test.ts`
  - Engine units: `pnpm exec jest src/backend/engine/__tests__/engineSwitch.test.ts src/backend/engine/__tests__/offlineRefusal.test.ts`
  - Gates: `pnpm exec jest meta/__tests__/backendDiCeilings.test.ts meta/__tests__/boundaryGates.test.ts`
  - Typecheck: `pnpm exec tsc --noEmit` (verify script name in package.json before use) [ASSUMED]

## DI Ceilings / Size Gates [VERIFIED]

- `meta/backendDiCeilings.cjs` + shards `meta/backendDiCeilings/*.json`: exact per-file counts of module state, `child_process` imports (must be zero outside process/runner.ts), and `jest.mock` calls. Production changes here add no module state, child_process, or jest.mock if the helper is a plain exported function with no top-level `let`/`new` and nothing cached (DI: use `steamGame.deps`, not module singletons). `games.test.ts` ceiling = 47 jest.mock calls (do not add any).
- `meta/__tests__/boundaryGates.test.ts` references `gameLaunch.ts` only in import-cycle fixtures (gameLaunch may import `type` from `./games`; keep `import type` for `SteamGame`; do not add a runtime import of `./games` from gameLaunch/gameBridgeLaunch).
- `gameLaunch.ts` is 999 lines; no line-count gate was found for it [grep of meta/eslint found none; ASSUMED none]. Consider placing the helper in a new small module (e.g. `gameDrmEngine.ts`) if extraction would push past 1000 lines; a new non-test file adds no ceiling entry.
- Recent "ratchet the DI ceilings" commit (74c1e01db) only lowered counts in `storeManagers.steam.json` and `sidecar-tests-flows-4.json`; nothing structural.

## Live UAT (D-09) [VERIFIED: 56-UAT.md]

Phase 56 UAT proven DRM-mode titles: **Grim Dawn (appId 219990)** (item 1, 2, 3 pass; menu in DRM mode with only Mac Steam), Raft (item 4, pass), Ranch Simulator (item 5, pass; routes to DRM mode). Use **Grim Dawn 219990** (the 56-33 live gate PASS title, strict criterion satisfied).
Plan outline: (1) hide CrossOver (rename `/Applications/CrossOver.app`), install Grim Dawn so the bottle takes the Wine-Staging pin (marker non-crossover; check `<bottle>/` engine marker file); (2) restore CrossOver; (3) Play; confirm card shows `setting-up` then DRM setup, the marker reads crossover afterwards, and the log shows the lsteamclient game-process trace (D-56-15/16; In-Game never counts). Offline arm optional: network off only for the Play action (memory: offline UAT steps). UAT item shape: `### N.` at column 0, `expected:` inline, `result:` opening with a bare status word. Dev launch is `pnpm tauri:dev` (not `tauri:dev:run`); backend changes need `pnpm build:sidecar` / restart (tauri dev does not rebuild the sidecar). Never reroute to bottled Steam on failure.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest 29.7 + ts-jest (`jest` script), multi-project config (incl. `Meta` project) |
| Config file | root jest config (see `package.json` / `jest.config.*`) |
| Quick run command | `pnpm exec jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "engine selection"` |
| Full suite command | `pnpm test` (CI: `pnpm test:ci`) |

### Decision-to-Test Map
| Decision | Behavior | Test Type | Command | File Exists? |
|----------|----------|-----------|---------|-------------|
| D-01/D-03 | marker already CrossOver -> `prepareBottleForEngine` called with `next.kind==='crossover'`, returns `changed:false`, launch proceeds (`drmLaunchSetup` called) | unit | `jest games.test.ts -t "DRM"` | add to games.test.ts |
| D-01/D-05 | switch succeeds (`changed:true`) -> `onSwitching` sends `engine-download`/`setting-up`, no dialog/toast, launch proceeds | unit | same | add |
| D-01/D-06/D-08 | each reason (`bottle-busy`, `game-running`, `marker-newer`, `invalid-bottle`, `shared-bottle`, `dxvk-failed`) -> false, `drmLaunchSetup` not called, `done` sent, dialog per table | unit `it.each` | same | add |
| D-02 | offline + marker non-crossover + restore needs absent pin -> refusal before `preflightCrossover`, `prepareBottleForEngine` not called, `done` sent | unit | same | add |
| D-04 | `decideLaunchEngine` never called; no engine selection set in DRM path; override ignored | unit | same | extend existing DRM tests |
| D-08 | unhealthy CrossOver still refuses via `notifyCrossoverRequired`, switch not attempted | unit | existing `it.each(['expired','missing','broken'])` (add `not.toHaveBeenCalled` on switcher) | exists, extend |
| TCP unchanged | all `engine selection` tests green after extraction | unit | `jest games.test.ts` | exists |
| D-09 | live macOS DRM launch after fallback install | manual UAT | Grim Dawn 219990 | create `76-UAT.md` |

### Sampling Rate
- Per task commit: `pnpm exec jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "engine selection|DRM"` plus `npx prettier --check <exact paths>` (scoped; check `--file-info` first per repo convention).
- Per wave merge: full `games.test.ts` + `meta/__tests__/backendDiCeilings.test.ts` + `boundaryGates.test.ts` + engine unit tests.
- Phase gate: `pnpm test` green, then the live UAT.

### Wave 0 Gaps
None for infrastructure. Needed: new i18n keys in the `gamelib` locale file if a DRM string is added (check `public/locales/en/gamelib.json` path [ASSUMED]; i18next default strings in code mean tests do not need the file).

## Security Domain

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V5 Input Validation | marginal | `prepareBottleForEngine` already validates `sanitizeBottleName(bottleName) === bottleName` and bottle dir existence (`invalid-bottle`); appId is numeric-checked upstream |
| V2/V3/V4/V6 | no | no auth/session/crypto change |

Threat: engine switch kills a wineserver under another running game (Tampering/DoS of user session) — mitigated by `busyRefusal`/`game-running` checks inside `prepareBottleForEngine`; the DRM path must not bypass them (do not pass a custom `ledger`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No line-count gate on `gameLaunch.ts` (999 lines) | DI Ceilings | A lint max-lines rule could fail; planner should run lint |
| A2 | `pnpm exec tsc --noEmit` is a valid typecheck script | Tests | Use the repo's `package.json` script instead |
| A3 | Locale file location `public/locales/en/gamelib.json` | Wave 0 | Locate via grep for `steam.engine.markerNewer` |
| A4 | Showing a dialog for `game-running`/`invalid-bottle` in DRM (TCP is silent) is desired | Reason map | CONTEXT D-06 says reuse existing wording; user may prefer exact TCP parity |

## Open Questions

1. **Should DRM refusals for `game-running`/`invalid-bottle` show a dialog?** TCP logs only. Recommendation: show one (new `drmSwitchRefused` string); flag to the user via the plan's checkpoint since D-06 allows a DRM-specific string "only where no existing string fits".
2. **Clear stale registry selection on DRM refusal?** Recommendation: no; DRM never sets one. Optional defensive `clearEngineSelection` is harmless.
3. **`bottle-busy` wording**: the existing `sharedBottle` string is inaccurate for `bottle-busy` (another game running); TCP already uses it for both. Mirror for parity, or add a distinct string; low priority.

## Environment Availability

macOS-only live UAT needs CrossOver installed and the ability to hide it, Mac Steam, and Grim Dawn ownership; not probed (code/test work needs only node/pnpm/jest, already used by the repo).

## Project Constraints (from CLAUDE.md)

- Work enters through a GSD command; no direct edits outside a workflow.
- Every `<verify>` block: `npx prettier --check` over exact written paths (scoped, never `.`; `--file-info` first, omit if all ignored).
- Child-process spawns in `src/`/`meta/` use `createFakeHomeProfile()` (not expected here).
- UAT items: `### N.` column 0, `expected:` inline, `result:` starts with a bare status word.
- Sidecar handles `unref()` (no new timers/handles expected).
- Do not raise Heroic-upstream mergeability; use `/gsd-...` hyphenated command names; `graphify update .` after code changes; do not read `GRAPH_REPORT.md`/`graph.json`.
- Memory: bottled Steam is a narrow fallback (never reroute on failure); `tauri dev` does not rebuild sidecar; dev launch `pnpm tauri:dev`.

## Sources

### Primary (HIGH confidence, read this session)
- `src/backend/storeManagers/steam/gameBridgeLaunch.ts` L140-290
- `src/backend/storeManagers/steam/gameLaunch.ts` L400-720
- `src/backend/engine/engineSwitch.ts` L95-125, L520-800
- `src/backend/engine/offlineRefusal.ts`, `engineDecision.ts` (preflightCrossover, CrossoverPreflight), `engineTypes.ts`
- `src/backend/storeManagers/steam/__tests__/games.test.ts` (mock setup L880-925, L1822-1848, engine selection L15729-16460)
- `meta/backendDiCeilings.cjs`, `meta/backendDiCeilings/storeManagers.steam.json`
- `.planning/milestones/v0.9-MILESTONE-AUDIT.md` L19 (S9), `.planning/milestones/v0.9-phases/56-.../56-UAT.md`

## Metadata

**Confidence breakdown:** Standard stack HIGH (in-repo); Architecture HIGH (source read); Pitfalls HIGH for those verified in source/tests, MEDIUM for A1-A4.
**Research date:** 2026-11-15
**Valid until:** until the engine/steam launch files change (Phase 78/79 touch the Rust CM client, not these files).
