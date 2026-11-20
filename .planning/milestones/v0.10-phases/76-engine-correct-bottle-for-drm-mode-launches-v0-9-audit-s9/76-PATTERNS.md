# Phase 76: Engine-correct bottle for DRM-mode launches - Pattern Map

**Mapped:** 2026-11-15
**Files analyzed:** 5 (2 prod, 1 test, 1 locale, 1 UAT)
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/storeManagers/steam/gameLaunch.ts` (add `prepareDrmBottleForCrossover` + optional shared helpers; or new `gameDrmEngine.ts`) | service (launch orchestration) | request-response | same file, `selectLaunchEngine` L505-745 | exact |
| `src/backend/storeManagers/steam/gameBridgeLaunch.ts` (`wantsDrm` branch ~L180-196) | service | request-response | same file, `else` branch calling `selectLaunchEngine` L195-205 | exact |
| `src/backend/storeManagers/steam/__tests__/games.test.ts` | test | request-response | `describe('engine selection')` ~L15729, `G22` ~L16013, DRM `it.each` ~L16380 | exact |
| `public/locales/en/gamelib.json` (only if `steam.engine.drmSwitchRefused` added) | config (i18n) | n/a | `steam.engine.markerNewer` L709 | exact |
| `.planning/phases/76-.../76-UAT.md` | doc | n/a | `.planning/milestones/v0.9-phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-UAT.md` | exact |

## Pattern Assignments

### `gameLaunch.ts` : new DRM helper (mirror `selectLaunchEngine`)

**Terminal done** (`gameLaunch.ts` L407-413), already exported; caller uses it:
```typescript
export function sendLaunchDone(steamGame: SteamGame): void {
  sendGameStatusUpdate(steamGame.deps, { appName: steamGame.appId, runner: 'steam', status: 'done' })
}
```

**Lazy imports + title** (L505-520), copy the dynamic-import style (no top-level module state; DI via `steamGame.deps`):
```typescript
const { prepareBottleForEngine } = steamGame.deps.engineRuntime.switcher
const { STEAM_ENGINE_RUNNER, steamEngineStateDeps } = await import('./engine/steamEngineDeps')
const title = steamGame.getGameInfo().title
const { steamEngineServicesFrom } = await import('backend/services/engineServices')
```

**Offline pre-check** (L536-585). For DRM, hard-code `override: 'crossover'` (do not read the user override, D-04), and run it BEFORE `preflightCrossover`:
```typescript
if (connectivity.offline && (earlyOverride === 'automatic' || earlyOverride === 'crossover')) {
  const sw = await import('backend/engine/engineSwitch')
  const { isPinnedEngineInstalled } = steamGame.deps.engineRuntime.fallback
  const switchCtx = sw.switchContextFrom(steamGame.deps)
  const { ENGINE_PINS } = await import('backend/engine/enginePins')
  const { offlineLaunchCertainlyBlocked } = await import('backend/engine/offlineRefusal')
  const refusal = offlineLaunchCertainlyBlocked({
    offline: connectivity.offline, override: earlyOverride,
    crossoverMissing: await isCrossoverMissing(steamDecisionDeps(steamDecisionServices(steamGame.deps))),
    markerKind: sw.readBottleEngineMarkerKind(switchCtx, bottleName),
    currentPinInstalled: isPinnedEngineInstalled(ENGINE_PINS.current),
    restoreNeedsAbsentPin: sw.restoreNeedsAbsentPin(switchCtx, bottleName)
  })
  if (refusal.blocked) {
    const why = refusal.arm === 'crossover-missing' ? `offline, CrossOver is missing and the built-in engine ${ENGINE_PINS.current.id} is not installed`
      : 'offline, and returning this bottle to CrossOver needs an engine pin that is not on disk'
    logWarning(`SteamGame: appId ${steamGame.appId} launch blocked before pre-flight: ${why} (${refusal.arm})`, LogPrefix.Steam)
    showEngineDialog(steamGame, title,
      i18next.t('gamelib:steam.engine.downloadFailed', "GameLib couldn't download its built-in engine ({{reason}}). Check your connection and try again.", { reason: 'offline' }),
      'engine-download-failed')
    return { ok: false }
  }
}
```
Keep these log substrings and the `engine-download-failed` tag byte-identical if extracted into a shared helper (tests assert them, games.test.ts ~L16035-16046).

**Switch call** (L639-661), copy; for DRM omit `crossoverHealthy` (default true; DRM only reaches here when preflight healthy) and omit `decideLaunchEngine`/`setEngineSelection`/`clearEngineSelection`:
```typescript
const prep = await prepareBottleForEngine({
  key: steamGame.appId, bottleName, next: sel,
  deps: { ...steamSwitchDeps(steamEngineServicesFrom(steamGame.deps)), ensurePinEngine: steamGame.restorePinEngine },
  onSwitching: () => sendGameStatusUpdate(steamGame.deps, { appName: steamGame.appId, runner: 'steam', status: 'engine-download', context: 'setting-up' })
})
```
`sel` for DRM (from RESEARCH, EngineSelection crossover arm): `{ kind:'crossover', reason:'cx-healthy', crossoverBuild: pre.build, binDir: pre.binDir }`.

**Reason -> dialog map** (L662-735). Copy each `showEngineDialog(steamGame, title, i18next.t(key, default, {title}), tag)` block:
- `dxvk-failed` -> `gamelib:steam.engine.restoreFailed`, tag `engine-restore-failed` (L665-684)
- `shared-bottle` / `bottle-busy` -> `gamelib:steam.engine.sharedBottle`, tag `engine-shared-bottle` (L692-707)
- `marker-newer` -> `gamelib:steam.engine.markerNewer`, tag `engine-marker-newer` (L708-727)
- else (`game-running`, `invalid-bottle`): TCP logs only (L728-735). RESEARCH recommends a DRM dialog here (new `drmSwitchRefused`); open question A4/Q1 for the plan checkpoint.
All use the log shape `SteamGame: appId ${id} cannot switch engine (${prep.reason}: ${prep.detail}); not launching` via `logWarning(..., LogPrefix.Steam)`.

Return shape `{ ok: true } | { ok: false }`, matching `selectLaunchEngine`'s `{ ok:false }`.

---

### `gameBridgeLaunch.ts` : `wantsDrm` branch (L180-206)

**Current** (insertion point is after the `healthy` check):
```typescript
if (wantsDrm) {
  const { preflightCrossover } = await import('backend/engine/engineDecision')
  const { steamDecisionDeps, steamDecisionServices } = await import('./engine/steamEngineDeps')
  const pre = await preflightCrossover(bridgeBottleSettings.wineCrossoverBottle, steamDecisionDeps(steamDecisionServices(steamGame.deps)))
  if (pre.kind !== 'healthy') {
    notifyCrossoverRequired(steamGame, 'drm', pre)
    sendLaunchDone(steamGame)
    return false
  }
  // <-- offline check goes BEFORE preflightCrossover; switch goes here
} else {
  const engine = await selectLaunchEngine(steamGame, bridgeBottleSettings, connectivity)
  if (!engine.ok) { sendLaunchDone(steamGame); return false }
  bridgeBottleSettings = engine.settings
}
```
Refusal convention to copy: `if (!x.ok) { sendLaunchDone(steamGame); return false }`. `connectivity` is already in scope. Imports at L45 pull `selectLaunchEngine` from `./gameLaunch`; add the new helper(s) to that import. Keep `import type` for `SteamGame` (boundaryGates import-cycle rule).

---

### `games.test.ts` : new tests (add to existing blocks, NO new `jest.mock`; file ceiling is exactly 47)

**Mocks to reuse:** `mockPrepareBottleForEngine` (L298, delegated at L909, default `{ ok:true, changed:false }` set in beforeEach ~L1821); `preflightCrossover`, `decideLaunchEngine`, `isCrossoverMissing`, `readBottleEngineMarkerKind`, `restoreNeedsAbsentPin`, `mockIsPinnedEngineInstalled`, `checkConnectivityNow`, `detectDrmWrapper`, `sendGameStatusUpdate`.

**DRM scenario setup** (L16382-16390):
```typescript
;(detectDrmWrapper as jest.Mock).mockResolvedValue('steamstub')
;(preflightCrossover as jest.Mock).mockResolvedValue({ kind: 'healthy', binDir: '/cx/bin', build: null, trialDaysRemaining: null })
expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(false)
```
(existing unhealthy `it.each(['expired','missing','broken'])` at ~L16380: extend with `expect(mockPrepareBottleForEngine).not.toHaveBeenCalled()`; it already asserts `decideLaunchEngine` not called and `__drmLaunchSetupMock` not called.)

**Dialog assertion** (message equals the i18n KEY in tests):
```typescript
const engineDialog = () => jest.requireMock('backend/dialog/dialog').showDialogBoxModalAuto as jest.Mock  // L15911
expect(engineDialog().mock.calls[0][0].message).toContain('restoreFailed')
```

**Refusal result mocking** (L15897):
```typescript
mockPrepareBottleForEngine.mockResolvedValue({ ok: false, reason: 'game-running', detail: 'running' })
```
Use `it.each` over reasons; assert `__drmLaunchSetupMock` (`jest.requireMock('../bridge/drm/drmLaunchSetup').__drmLaunchSetupMock`) not called, `sendGameStatusUpdate` called with `expect.objectContaining({ status: 'done' })`.

**Offline refusal** (reuse the `blocked()` helper in `describe('G22: offline refusal...')` L16013-16030; sets connectivity, override, marker kind, pin, `restoreNeedsAbsentPin`). Add DRM variant: `detectDrmWrapper` -> steamstub, `blocked()`, expect false, `preflightCrossover` not called, `mockPrepareBottleForEngine` not called, `done` sent, message contains `downloadFailed`, warn log contains `launch blocked before pre-flight: offline, and returning this bottle to CrossOver needs an engine pin that is not on disk (restore-needs-pin)` (L16039-16049 shape).

**Success cases:** `mockPrepareBottleForEngine.mockResolvedValue({ok:true, changed:true})` plus `mockImplementation((args)=>{args.onSwitching?.(); return {ok:true,changed:true}})` (pattern at L15801) to assert `engine-download`/`setting-up` status; assert `args.next` is `objectContaining({ kind:'crossover', binDir:'/cx/bin' })` (L15717 style `toHaveBeenCalledWith`), `decideLaunchEngine` not called, `getEngineSelection(ID)` undefined, no dialog.

---

### `public/locales/en/gamelib.json` : `steam.engine.drmSwitchRefused` (only if added)

Keys are alphabetical under `steam.engine` (L700-745). Pattern (L709):
```json
"markerNewer": "{{title}}'s game files were last set up by a newer version of GameLib, so this version won't change its engine. Launch it with the engine it already uses, or update GameLib.",
```
Insert `drmSwitchRefused` between `downloadFailed` (L708) and `markerNewer`. 4-space indent. Pass the same string as the i18next default at the call site (`i18next.t('gamelib:steam.engine.drmSwitchRefused', '<default>', { title, reason })`); tests need only the key. Other-locale `gamelib.mt.json` files are machine-translated artifacts: do not hand-edit; the repo has `pnpm i18n` and `i18n-churn-guard` / `gen-i18n-gate-scope` scripts (package.json L57-76), so check them in the plan.

---

### `76-UAT.md` (shape from 56-UAT.md)

Frontmatter and layout:
```markdown
---
status: testing
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
source: [76-NN-SUMMARY.md ...]
started: <ISO>
updated: <ISO>
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

## Tests

### 1. <title>
expected: <inline, one paragraph>
result: [pending]

## Summary
total: N
passed: 0
issues: 0
pending: N
skipped: 0
blocked: 0

## Gaps
[none yet]
```
Convention (CLAUDE.md): `### N.` at column 0, `expected:` inline on the same line, `result:` opens with a bare or bracketed status word (`pass`, `[pending]`, `issue`), prose only after. Suggested items (Grim Dawn 219990, the Phase 56 proven title): (1) install with CrossOver hidden -> marker non-crossover; (2) restore CrossOver, Play -> card shows setting-up, marker reads crossover, lsteamclient game-process trace in log (D-56-15/16); (3) second Play is a no-op switch; (4) optional offline arm (network off only at the Play action) refuses with the downloadFailed dialog and the card returns to Play. Dev launch is `pnpm tauri:dev`; run `pnpm build:sidecar` / restart after backend changes.

## Shared Patterns

### Refusal = surface + terminal done
**Source:** `gameLaunch.ts` L407 `sendLaunchDone`; `gameBridgeLaunch.ts` L188-192 and L198-204. **Apply to:** every new DRM refusal (offline, switch `ok:false`).

### DI-only, no module state
**Source:** `selectLaunchEngine` uses `steamGame.deps.engineRuntime.{switcher,registry,fallback}` and dynamic `await import(...)`. **Apply to:** new helper(s). `meta/backendDiCeilings` counts module state, child_process imports and `jest.mock` calls exactly; keep all at zero growth.

### Never call decideLaunchEngine / setEngineSelection in DRM (D-04)

### Verify block
`npx prettier --check` scoped to exact written paths, after `--file-info` (CLAUDE.md convention).

## No Analog Found

None. Only gap: `game-running`/`invalid-bottle` have no TCP dialog to copy (TCP is log-only, L728-735); the DRM wording is a new string (use `markerNewer`/`restoreFailed` structure).

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/`, `src/backend/engine/`, `public/locales/en/`, v0.9 phase 56 UAT
**Files scanned:** gameLaunch.ts, gameBridgeLaunch.ts, games.test.ts (targeted ranges), gamelib.json, 56-UAT.md
**Pattern extraction date:** 2026-11-15
