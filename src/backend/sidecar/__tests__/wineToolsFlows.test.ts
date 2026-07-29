/**
 * Bidirectional registration-kind proof for the sidecar's Wine execution + Wine-version-
 * management channel cluster (Phase 34.5 Plan 05, REQ-34.5-03).
 *
 * Three describe blocks:
 *   1. Registration kind — the 6 channels ported so far (`runWineCommand`, `getAlternativeWine`,
 *      `wine.isValidVersion`, `installWineVersion`, `refreshWineVersionInfo`, `removeWineVersion`)
 *      are `ipcMain.handle`, never `ipcMain.on`, asserted in both directions (mirrors
 *      `humbleLoginFlows.test.ts`'s Describe 1 template).
 *   2. Curated-import + deferred/foreign-channel guard — `wineToolsFlowRegistration.ts` never
 *      imports `wine/manager/ipc_handler.ts` or `tools/ipc_handler.ts` (comment-stripped, mirrors
 *      `humbleLoginFlows.test.ts`'s own Describe 3 approach), and none of the three DEFERRED
 *      winetricks channel names nor `runWineCommandForGame` ever appears in either registry
 *      after registration (T-34.5-15).
 *   3. Pass-through proof — `../../launcher`'s `runWineCommand` is mocked so the registered
 *      `runWineCommand` handler can be proven to forward `args[0]` unchanged rather than
 *      reshaping it (D-14's seam is a thin pass-through, not new construction).
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
