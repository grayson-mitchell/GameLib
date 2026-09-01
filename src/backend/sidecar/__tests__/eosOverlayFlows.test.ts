/**
 * Bidirectional registration-kind proof for the sidecar's EOS (Epic Online Services) overlay
 * channel cluster (Phase 34.6 Plan 08, REQ-34.6-01/08/13).
 *
 * Five describe blocks:
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
 *   5. Fail-closed gate proof (Phase 35 plan 26, REQ-35-17, T-35-122) — exercises the REAL
 *      `remove()`/`enable()` from `eos_overlay.ts` (via `jest.requireActual`, bypassing this
 *      file's top-level module mock for just this block) to prove the `confirmed !== true` gate
 *      refuses on every non-`true` shape and proceeds ONLY on the literal `true`, and that
 *      `enable()`'s not-installed branch now unconditionally reports `installNow: true` with no
 *      dialog involved.
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

// Describe 5 exercises the REAL `remove()`/`enable()` via `jest.requireActual`, bypassing the
// module mock above for just that block. The real `remove()`/`enable()` reach
// `libraryManagerMap['legendary'].runRunnerCommand` through a LAZY `await import('../..')`
// (`eos_overlay.ts`'s own load-bearing circular-dependency-breaking pattern) — this is a
// DIFFERENT module path from the one mocked above, so it coexists without conflict. Mocked at
// top level (ts-jest does not hoist `jest.mock`, so this must precede Describe 5's usage
// textually, same as the mock above).
jest.mock('../../storeManagers/index', () => ({
  libraryManagerMap: {
    legendary: {
      runRunnerCommand: jest.fn()
    }
  }
}))

// `backend/logger`'s real module requires an `initLogger()` call this suite never makes
// (`heroicLogWriter` is otherwise undefined) — Describe 5's real `remove()` calls `logWarning`
// on refusal, so this must be mocked for that path to run at all. Mirrors
// `downloadmanager/__tests__/utils.test.ts`'s convention.
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Legendary: 'Legendary' }
}))

import { readFileSync } from 'fs'
import { join } from 'path'

import { registerEosOverlayFlows } from '../eosOverlayFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../../platform'
import {
  enable,
  disable,
  isEnabled
} from '../../storeManagers/legendary/eos_overlay/eos_overlay'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import type { IpcHandler } from '../../platform'

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

// ── Describe 5: Fail-closed gate proof (Phase 35 plan 26, REQ-35-17, T-35-122) ─────────────────
describe("fail-closed gate — real remove()/enable() from eos_overlay.ts (bypasses this file's top-level mock)", () => {
  const { remove: realRemove, enable: realEnable } = jest.requireActual<
    typeof import('../../storeManagers/legendary/eos_overlay/eos_overlay')
  >('../../storeManagers/legendary/eos_overlay/eos_overlay')

  const { libraryManagerMap: mockLibraryManagerMap } = jest.requireMock<{
    libraryManagerMap: { legendary: { runRunnerCommand: jest.Mock } }
  }>('../../storeManagers/index')
  const mockRunRunnerCommand = mockLibraryManagerMap.legendary.runRunnerCommand

  beforeEach(() => {
    mockRunRunnerCommand.mockClear()
    mockRunRunnerCommand.mockResolvedValue({ error: undefined })
  })

  describe('remove(confirmed)', () => {
    it.each([
      ['undefined', undefined],
      ['false', false],
      ["the string 'true'", 'true'],
      ['the number 1', 1],
      ['an object', { yes: true }],
      ['null', null]
    ])(
      'REQ-35-17/T-35-122 refuses and calls NO runner command when confirmed is %s',
      async (_label, value) => {
        const result = await realRemove(value as never)

        expect(mockRunRunnerCommand).not.toHaveBeenCalled()
        expect(result).toBe(false)
      }
    )

    it('REQ-35-17/T-35-122 proceeds ONLY when confirmed is the literal true, and forwards the exact remove command', async () => {
      const result = await realRemove(true)

      expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)
      expect(mockRunRunnerCommand).toHaveBeenCalledWith(
        { '-y': true, subcommand: 'eos-overlay', action: 'remove' },
        { abortId: '98bc04bc842e4906993fd6d6644ffb8d' }
      )
      expect(result).toBe(true)
    })
  })

  describe("enable(appName)'s not-installed branch", () => {
    it('REQ-35-17 unconditionally reports installNow: true with no dialog involved, when the overlay is not installed', async () => {
      // `isInstalled()` reads `existsSync(installedVersionPath())` — force it deterministically
      // false rather than relying on real filesystem state, so this test is not a false-pass on
      // a dev machine that happens to have the EOS overlay installed.
      const gracefulFs =
        jest.requireActual<typeof import('graceful-fs')>('graceful-fs')
      const existsSyncSpy = jest
        .spyOn(gracefulFs, 'existsSync')
        .mockReturnValue(false)

      try {
        const result = await realEnable('some-app-name')
        expect(result).toEqual({ wasEnabled: false, installNow: true })
        expect(mockRunRunnerCommand).not.toHaveBeenCalled()
      } finally {
        existsSyncSpy.mockRestore()
      }
    })
  })
})
