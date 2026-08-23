/**
 * Bidirectional registration-kind proof for the sidecar's EOS (Epic Online Services) overlay
 * channel cluster (Phase 34.6 Plan 08, REQ-34.6-01/08/13).
 *
 * Four describe blocks:
 *   1. Registration kind — all 8 channels are `ipcMain.handle`, never `ipcMain.on`, asserted in
 *      both directions (mirrors `wineToolsFlows.test.ts`'s Describe 1 template), plus an explicit
 *      assertion that `SEND_CHANNELS` is empty (8-of-8 invoke, zero send).
 *   2. Curated-import guard (T-34.5-15/T-34.5-12 lineage) — `eosOverlayFlowRegistration.ts` never
 *      imports `eos_overlay/ipc_handler.ts` (comment-stripped, mirrors `wineToolsFlows.test.ts`'s
 *      own Describe 2 approach).
 *   3. Argument-forwarding proof — `enableEosOverlay`/`disableEosOverlay` forward their first
 *      argument to `enable`/`disable` unchanged; `isEosOverlayEnabled` does not throw when called
 *      with NO argument (the Electron signature's `appName?` is optional).
 *   4. Idempotence — calling `registerEosOverlayFlows()` twice does not throw and does not
 *      double-register (mirrors `runnerSliceRegistration.test.ts`'s Describe 3 template; all 8
 *      channels here are invoke-kind, so `Map.set`'s natural idempotence is what's under test,
 *      not a manual guard).
 */

// `../../storeManagers/legendary/eos_overlay/eos_overlay` is the curated import target — factory-
// mocked so this suite can prove exact argument forwarding without touching legendary's real
// shell-out, dialog, or filesystem logic.
jest.mock('../../storeManagers/legendary/eos_overlay/eos_overlay', () => ({
  getStatus: jest.fn(),
  getLatestVersion: jest.fn(),
  updateInfo: jest.fn(),
  install: jest.fn(),
  remove: jest.fn(),
  enable: jest.fn(),
  disable: jest.fn(),
  isEnabled: jest.fn()
}))

import { readFileSync } from 'fs'
import { join } from 'path'

import { registerEosOverlayFlows } from '../eosOverlayFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import {
  enable,
  disable,
  isEnabled
} from '../../storeManagers/legendary/eos_overlay/eos_overlay'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import type { IpcHandler } from '../electronStub'

// ── Registered ONCE for this whole file (not per-test) — mirrors
// `wineToolsFlows.test.ts`'s own file-scope-once convention. All 8 registrations here are
// `ipcMain.handle`, which is naturally idempotent, so a second call anywhere else in this file
// (e.g. Describe 4's own explicit re-call) cannot corrupt this initial registration. ────────────
registerEosOverlayFlows()

// ── Describe 1: Registration kind ──────────────────────────────────────────────────────────────
describe('registration kind — all 8 EOS overlay channels are registered with the correct kind, both directions', () => {
  const HANDLE_CHANNELS = [
    'getEosOverlayStatus',
    'getLatestEosOverlayVersion',
    'updateEosOverlayInfo',
    'installEosOverlay',
    'removeEosOverlay',
    'enableEosOverlay',
    'disableEosOverlay',
    'isEosOverlayEnabled'
  ]

  // 8 of 8 invoke, zero send — a deliberate property of this cluster (no channel here is
  // fire-and-forget). Kept as an explicit array (rather than just omitting the assertion) so a
  // future accidental `ipcMain.on` addition to this module fails a test instead of silently
  // passing.
  const SEND_CHANNELS: string[] = []

  it.each(HANDLE_CHANNELS)(
    'REQ-34.6-01 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it('REQ-34.6-01 SEND_CHANNELS is empty — this cluster is 8-of-8 invoke, zero send', () => {
    expect(SEND_CHANNELS).toHaveLength(0)
  })

  it('REQ-34.6-01 exactly 8 ipcMain.handle registrations and 0 ipcMain.on registrations appear in the source', () => {
    const source = readFileSync(
      join(__dirname, '..', 'eosOverlayFlowRegistration.ts'),
      'utf-8'
    )
    const handleMatches = source.match(/ipcMain\.handle\(/g) ?? []
    const onMatches = source.match(/ipcMain\.on\(/g) ?? []
    expect(handleMatches.length).toBe(8)
    expect(onMatches.length).toBe(0)
  })
})

// ── Describe 2: Curated-import guard ───────────────────────────────────────────────────────────
describe('curated-import guard — eosOverlayFlowRegistration.ts never imports eos_overlay/ipc_handler', () => {
  it('T-34.6-08 eosOverlayFlowRegistration.ts contains no import referencing eos_overlay/ipc_handler (comment-stripped)', () => {
    const source = readFileSync(
      join(__dirname, '..', 'eosOverlayFlowRegistration.ts'),
      'utf-8'
    )
    const stripped = stripSourceComments(source)
    expect(/ipc_handler/.test(stripped)).toBe(false)
  })

  it('gate self-test (anti-vacuity): a docblock-only mention of ipc_handler.ts is NOT detected as an import', () => {
    const synthetic = [
      '/**',
      ' * Never side-effect-import eos_overlay/ipc_handler.ts — it registers',
      ' * these same channels a second time onto the real ipcMain.',
      ' */',
      'export function registerEosOverlayFlows(): void {}'
    ].join('\n')
    const stripped = stripSourceComments(synthetic)
    expect(/ipc_handler/.test(stripped)).toBe(false)
  })
})

// ── Describe 3: Argument-forwarding proof ──────────────────────────────────────────────────────
describe('argument-forwarding proof — enable/disable forward appName unchanged; isEosOverlayEnabled tolerates no argument', () => {
  const mockEnable = enable as jest.MockedFunction<typeof enable>
  const mockDisable = disable as jest.MockedFunction<typeof disable>
  const mockIsEnabled = isEnabled as jest.MockedFunction<typeof isEnabled>

  beforeEach(() => {
    mockEnable.mockClear()
    mockDisable.mockClear()
    mockIsEnabled.mockClear()
  })

  it("enableEosOverlay forwards its first argument to eos_overlay.ts's enable(appName) unchanged", async () => {
    mockEnable.mockResolvedValue({ wasEnabled: true })
    const handler = handlerRegistry.get('enableEosOverlay') as IpcHandler
    expect(handler).toBeDefined()

    await handler({} as never, 'my-app-name')

    expect(mockEnable).toHaveBeenCalledTimes(1)
    expect(mockEnable).toHaveBeenCalledWith('my-app-name')
  })

  it("disableEosOverlay forwards its first argument to eos_overlay.ts's disable(appName) unchanged", async () => {
    mockDisable.mockResolvedValue(undefined)
    const handler = handlerRegistry.get('disableEosOverlay') as IpcHandler
    expect(handler).toBeDefined()

    await handler({} as never, 'my-app-name')

    expect(mockDisable).toHaveBeenCalledTimes(1)
    expect(mockDisable).toHaveBeenCalledWith('my-app-name')
  })

  it('isEosOverlayEnabled works when called with NO argument (the Electron signature has appName? optional) and does not throw', async () => {
    mockIsEnabled.mockResolvedValue(false)
    const handler = handlerRegistry.get('isEosOverlayEnabled') as IpcHandler
    expect(handler).toBeDefined()

    await expect(handler({} as never)).resolves.toBe(false)
    expect(mockIsEnabled).toHaveBeenCalledTimes(1)
    expect(mockIsEnabled).toHaveBeenCalledWith(undefined)
  })
})

// ── Describe 4: Idempotence ─────────────────────────────────────────────────────────────────────
describe('idempotence — calling registerEosOverlayFlows() twice does not throw or double-register', () => {
  const HANDLE_CHANNELS = [
    'getEosOverlayStatus',
    'getLatestEosOverlayVersion',
    'updateEosOverlayInfo',
    'installEosOverlay',
    'removeEosOverlay',
    'enableEosOverlay',
    'disableEosOverlay',
    'isEosOverlayEnabled'
  ]

  it('can be called twice without throwing, and every channel stays invoke-kind with no listener stacked', () => {
    expect(() => registerEosOverlayFlows()).not.toThrow()
    expect(() => registerEosOverlayFlows()).not.toThrow()

    for (const channel of HANDLE_CHANNELS) {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  })
})
