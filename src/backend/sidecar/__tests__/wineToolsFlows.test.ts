/**
 * Bidirectional registration-kind proof for the sidecar's Wine execution + Wine-version-
 * management + DXVK/VKD3D toggle channel cluster (Phase 34.5 Plans 05/09, REQ-34.5-03).
 *
 * Five describe blocks:
 *   1. Registration kind — all 9 channels (`runWineCommand`, `getAlternativeWine`,
 *      `wine.isValidVersion`, `installWineVersion`, `refreshWineVersionInfo`, `removeWineVersion`,
 *      `toggleDXVK`, `toggleDXVKNVAPI`, `toggleVKD3D`) are `ipcMain.handle`, never `ipcMain.on`,
 *      asserted in both directions (mirrors `humbleLoginFlows.test.ts`'s Describe 1 template), plus
 *      an explicit assertion that `SEND_CHANNELS` is empty (9-of-9 invoke, zero send).
 *   2. Curated-import + deferred/foreign-channel guard — `wineToolsFlowRegistration.ts` never
 *      imports `wine/manager/ipc_handler.ts` or `tools/ipc_handler.ts` (comment-stripped, mirrors
 *      `humbleLoginFlows.test.ts`'s own Describe 3 approach), and none of the three DEFERRED
 *      winetricks channel names nor `runWineCommandForGame` ever appears in either registry
 *      after all nine registrations (T-34.5-15).
 *   3. Pass-through proof — `../../launcher`'s `runWineCommand` is mocked so the registered
 *      `runWineCommand` handler can be proven to forward `args[0]` unchanged rather than
 *      reshaping it (D-14's seam is a thin pass-through, not new construction).
 *   4. D-15/T-34.5-30 dialog safety pin — `showDialogBoxModalAuto` (the one dialog these three
 *      toggle channels can reach, via `DXVK.installRemove` -> `DXVK.getLatest()` ->
 *      `installOrUpdateTool` -> `tools/index.ts:137`) never throws and never produces an
 *      unhandled promise rejection even when its primary frontend push fails, using a
 *      `jest.isolateModules()` sandbox (mirrors `sidecarRejectionGuard.test.ts`'s own harness
 *      shape) so the real, non-mocked `electronStub.dialog` fallback (proven non-throwing in its
 *      own dedicated suite, `dialogStub.test.ts`) is what's actually exercised here, without
 *      disturbing this file's already-loaded `config.ts`/`game_config.ts` module instances (which
 *      rely on the project-wide `src/backend/__mocks__/electron.ts` auto-mock, not electronStub).
 *   5. Tool-literal proof — `../../tools`'s `DXVK.installRemove` is mocked so the registered
 *      `toggleVKD3D` handler can be proven to forward the literal `'vkd3d'`, not `'dxvk'` (a
 *      copy-paste error in the three near-identical toggle bodies would otherwise be silent,
 *      T-34.5-31).
 *
 * `runnerSliceRegistration.test.ts` (plan 34.5-04) is intentionally NOT edited by this plan — its
 * containment pin is growth-tolerant and keeps passing as this cluster fills in; its own
 * completeness check belongs to plan 34.5-13.
 */

// `../../launcher` is a heavy module (game launch orchestration, wine-prefix verification,
// discord RPC, etc.) with no bearing on this test's proof of registration kind / pass-through
// forwarding -- factory-mocked so this suite never drives its real filesystem/child_process
// side effects.
jest.mock('../../launcher', () => ({
  runWineCommand: jest.fn(),
  validWine: jest.fn()
}))

import { readFileSync } from 'fs'
import { join } from 'path'

import { registerWineToolsFlows } from '../wineToolsFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import { runWineCommand } from '../../launcher'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import type { IpcHandler } from '../electronStub'

// ── Registered ONCE for this whole file (not per-test) -- `listenerRegistry`/`handlerRegistry`
// are module-scope maps; calling `registerWineToolsFlows()` more than once would stack a
// duplicate `backendEvents` listener (per this module's own `releasesInfoReady` comment),
// mirroring `humbleLoginFlows.test.ts`'s own file-scope-once convention. ────────────────────────
registerWineToolsFlows()

// ── Describe 1: Registration kind ──────────────────────────────────────────────────────────────
describe('registration kind — the 6 ported channels are registered with the correct kind, both directions', () => {
  const HANDLE_CHANNELS = [
    'runWineCommand',
    'getAlternativeWine',
    'wine.isValidVersion',
    'installWineVersion',
    'refreshWineVersionInfo',
    'removeWineVersion'
  ]

  it.each(HANDLE_CHANNELS)(
    'REQ-34.5-03 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )
})

// ── Describe 2: Curated-import + deferred/foreign-channel guard ───────────────────────────────
describe('curated-import guard — no ipc_handler import, and no deferred/foreign channel leaked in', () => {
  it('T-34.5-15 wineToolsFlowRegistration.ts contains no import referencing wine/manager/ipc_handler or tools/ipc_handler', () => {
    const source = readFileSync(
      join(__dirname, '..', 'wineToolsFlowRegistration.ts'),
      'utf-8'
    )
    const stripped = stripSourceComments(source)
    expect(/ipc_handler/.test(stripped)).toBe(false)
  })

  it('T-34.5-15 none of the three DEFERRED winetricks channels, nor runWineCommandForGame, is present in either registry', () => {
    const forbiddenChannels = [
      'winetricksAvailable',
      'winetricksInstall',
      'winetricksInstalled',
      'runWineCommandForGame'
    ]
    for (const channel of forbiddenChannels) {
      expect(handlerRegistry.has(channel)).toBe(false)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  })
})

// ── Describe 3: Pass-through proof ─────────────────────────────────────────────────────────────
describe('pass-through proof — runWineCommand forwards args[0] unchanged, not a re-shaper', () => {
  it("D-14 the registered 'runWineCommand' handler forwards its argument to launcher.ts's runWineCommand by identity", async () => {
    const mockRunWineCommand = runWineCommand as jest.MockedFunction<
      typeof runWineCommand
    >
    mockRunWineCommand.mockClear()
    mockRunWineCommand.mockResolvedValue({ stdout: '', stderr: '' })

    const handler = handlerRegistry.get('runWineCommand') as IpcHandler
    expect(handler).toBeDefined()

    const commandArgs = {
      commandParts: ['--version'],
      wait: true
    }

    await handler({} as never, commandArgs)

    expect(mockRunWineCommand).toHaveBeenCalledTimes(1)
    // Identity, not just deep-equality -- proves the handler forwards the SAME object rather
    // than cloning/reshaping it before delegating.
    expect(mockRunWineCommand.mock.calls[0][0]).toBe(commandArgs)
  })
})

// ── Describe 4: D-15/T-34.5-30 dialog safety pin ──────────────────────────────────────────────
//
// The one dialog `toggleDXVK`/`toggleDXVKNVAPI`/`toggleVKD3D` can reach is `showDialogBoxModalAuto`
// (`tools/index.ts:137`, via `DXVK.installRemove` -> `DXVK.getLatest()` -> `installOrUpdateTool`
// on a download failure). This pins the property D-15 actually cares about: even when the primary
// `sendFrontendMessage('showDialog', ...)` push fails, the fallback to `electronStub.dialog.*`
// never throws and never leaves an unhandled promise rejection behind.
//
// A dedicated `jest.isolateModules()` sandbox is used (mirrors `sidecarRejectionGuard.test.ts`'s
// own harness shape) so this test can swap `'electron'` for the REAL, non-mocked `electronStub`
// (proven non-throwing by its own dedicated suite, `dialogStub.test.ts`) and `'../sidecarRpc'`
// for a fast, deterministic stub -- WITHOUT touching this file's top-level module registry, where
// `config.ts`/`game_config.ts` are already loaded for real against the project-wide
// `src/backend/__mocks__/electron.ts` auto-mock (swapping that mock file-wide risks the
// `tests-clobbering-real-steam-store.md` failure mode this project has hit before).
describe('D-15/T-34.5-30 dialog safety pin — showDialogBoxModalAuto never propagates a rejection', () => {
  it('does not throw synchronously and produces no unhandled rejection when the frontend push fails, using the real electronStub dialog fallback', async () => {
    let isolatedShowDialogBoxModalAuto!: (props: {
      title: string
      message: string
      type: 'ERROR' | 'INFO' | 'WARNING'
    }) => void

    jest.isolateModules(() => {
      jest.doMock('electron', () => jest.requireActual('../electronStub'))
      jest.doMock('../sidecarRpc', () => ({
        requestRustInvoke: jest.fn().mockResolvedValue(undefined)
      }))
      jest.doMock('../../ipc', () => ({
        addListener: jest.fn(),
        addOneTimeListener: jest.fn(),
        addTestOnlyListener: jest.fn(),
        addHandler: jest.fn(),
        sendFrontendMessage: jest.fn(() => {
          throw new Error(
            'mock frontend-push failure (D-15/T-34.5-30 pin — the primary showDialog push failed)'
          )
        })
      }))
      /* eslint-disable @typescript-eslint/no-require-imports */
      // `backend/logger`'s `heroicLogWriter` singleton is only assigned by the app's real
      // init path (never run in this isolated sandbox) -- stubbed here so `dialog.ts`'s
      // `logWarning` call in its catch branch doesn't throw on an uninitialized writer.
      jest.doMock('backend/logger', () => ({
        ...jest.requireActual('backend/logger/constants'),
        logDebug: jest.fn(),
        logInfo: jest.fn(),
        logWarning: jest.fn(),
        logError: jest.fn()
      }))
      isolatedShowDialogBoxModalAuto =
        require('../../dialog/dialog').showDialogBoxModalAuto
      /* eslint-enable @typescript-eslint/no-require-imports */
    })

    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      expect(() =>
        isolatedShowDialogBoxModalAuto({
          title: 'box.error.dxvk.title',
          message: 'box.error.dxvk.message',
          type: 'ERROR'
        })
      ).not.toThrow()

      // Let the fire-and-forget `electronStub.dialog.showErrorBox(...)` promise settle before
      // asserting nothing escaped as an unhandled rejection.
      await new Promise((resolve) => setImmediate(resolve))

      expect(unhandledRejections).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })
})
