/**
 * Bidirectional registration-kind proof for the sidecar's runner-CLI-version-probe + Wine-runtime
 * channel cluster (Phase 34.5 Plan 07, REQ-34.5-06/REQ-34.5-09).
 *
 * Two describe blocks:
 *   1. Registration kind — the 6 channels ported so far by plan 34.5-07 (`getLegendaryVersion`,
 *      `getGogdlVersion`, `getCometVersion`, `getNileVersion`, `downloadRuntime`,
 *      `isRuntimeInstalled`) are `ipcMain.handle`, never `ipcMain.on`, asserted in both directions
 *      (mirrors `humbleLoginFlows.test.ts`'s Describe 1 template). Also proves the four channels
 *      `utils/ipc_handler.ts` ALSO registers (`abort`, `getSystemInfo`,
 *      `copySystemInfoToClipboard`, `hasExecutable`) — which belong to already-completed slices —
 *      are absent from both registries, so a curated-import mistake that pulled in that whole file
 *      would be caught here.
 *   2. Curated-import guard + forward-looking pin — `runnerMiscFlowRegistration.ts` never imports
 *      `utils/ipc_handler.ts` or `wine/runtimes/ipc_handler.ts` (comment-stripped via the shared
 *      `stripSourceComments` util, so a docblock merely NAMING either file cannot trip the gate),
 *      and the five channels plan 34.5-12 owns (`callTool`, `egsSync`,
 *      `getGOGLinuxInstallersLangs`, `syncSaves`, `syncGOGSaves`) are explicitly asserted as NOT
 *      YET registered — a forward-looking pin so a reader of a failing test in wave 3 knows the
 *      expectation moved, not that something broke. Plan 34.5-12 will flip these five assertions
 *      to positive; it may not delete them.
 *
 * `runnerMiscFlowRegistration.ts` reaches `helperBinaries/index.ts` (a static top-level import of
 * `backend/utils` for `getCometBin`) and `wine/runtimes/runtimes.ts` (which imports
 * `backend/logger` and `backend/utils`'s `axiosClient`, plus `backend/constants/paths` — which
 * itself imports `electron`'s `app` at module scope). `backend/utils` and `backend/logger` are
 * both heavy modules that eagerly construct store managers / config / discord-rpc / etc at import
 * time in their REAL form — factory-mocked here (mirrors `runnerAuthFlowRegistration.ts`'s own
 * suite) so this test never drives that real graph; only registration kind is being proven, not
 * any runner's own CLI-invocation or download logic. `os`'s `homedir()` is redirected to a
 * disposable per-process tmp directory (mirrors `steamAuthFlows.test.ts`'s own precedent) as
 * defence-in-depth for `backend/constants/paths.ts`'s module-scope `homedir()` calls, on top of
 * this project's structural `jest.setupContainment.ts` floor.
 */

// ── os — disposable per-process homedir (mirrors steamAuthFlows.test.ts / runnerAuthFlows.test.ts) ─
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-runnermisc-test-home-${process.pid}`)
  }
})

// ── backend/utils — short-circuits the heavy storeManagers/config/launcher/discord-rpc import
// graph `helperBinaries/index.ts` and `wine/runtimes/runtimes.ts`/`util.ts` would otherwise pull
// in at module scope. Neither `getCometBin` nor `axiosClient` is invoked by this suite (only
// registration kind is proven, no handler is called), so an empty-bodied stand-in is sufficient. ──
jest.mock('backend/utils', () => ({
  getCometBin: jest.fn(),
  axiosClient: { get: jest.fn() }
}))

// ── backend/logger — short-circuits the heavy GameConfig/GlobalConfig/backendEvents import graph
// `backend/logger/index.ts` pulls in at module scope (mirrors runnerAuthFlowRegistration.ts's own
// suite) ───────────────────────────────────────────────────────────────────────────────────────
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: {
    Runtime: 'Runtime',
    Backend: 'Backend'
  }
}))

import { readFileSync } from 'fs'
import { join } from 'path'

import { registerRunnerMiscFlows } from '../runnerMiscFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

// ── Registered ONCE for this whole file (not per-test) -- `listenerRegistry`/`handlerRegistry`
// are module-scope maps; calling `registerRunnerMiscFlows()` more than once would stack a
// duplicate registration, mirroring every prior cluster suite's own file-scope-once convention. ──
registerRunnerMiscFlows()

// ── Describe 1: Registration kind ──────────────────────────────────────────────────────────────
describe('registration kind — the 6 channels ported so far are registered with the correct kind, both directions', () => {
  const VERSION_CHANNELS = [
    'getLegendaryVersion',
    'getGogdlVersion',
    'getCometVersion',
    'getNileVersion'
  ]
  const RUNTIME_CHANNELS = ['downloadRuntime', 'isRuntimeInstalled']

  it.each(VERSION_CHANNELS)(
    'REQ-34.5-06 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it.each(RUNTIME_CHANNELS)(
    'REQ-34.5-09 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it.each([
    'abort',
    'getSystemInfo',
    'copySystemInfoToClipboard',
    'hasExecutable'
  ])(
    'T-34.5-24 %s (registered by utils/ipc_handler.ts, an already-completed slice) is absent from both registries after registerRunnerMiscFlows()',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(false)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )
})

// ── Describe 2: Curated-import guard + forward-looking "not yet registered" pin ────────────────
describe('curated-import guard — no ipc_handler import, and the 5 wave-3 channels are not yet registered', () => {
  it('runnerMiscFlowRegistration.ts contains no import referencing utils/ipc_handler or wine/runtimes/ipc_handler', () => {
    const source = readFileSync(
      join(__dirname, '..', 'runnerMiscFlowRegistration.ts'),
      'utf-8'
    )
    const stripped = stripSourceComments(source)
    expect(/ipc_handler/.test(stripped)).toBe(false)
  })

  // Forward-looking pin (per this plan's own instructions): these five channels belong to plan
  // 34.5-12, which will flip these five assertions to positive once it lands. It may not delete
  // them -- a reader of a failing test here in wave 3 should immediately understand the
  // expectation moved, not that something broke.
  it.each([
    'callTool',
    'egsSync',
    'getGOGLinuxInstallersLangs',
    'syncSaves',
    'syncGOGSaves'
  ])(
    'NOT YET REGISTERED (plan 34.5-12 owns this channel): %s is absent from both registries after registerRunnerMiscFlows()',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(false)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )
})
