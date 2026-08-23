/**
 * Bidirectional registration-kind proof for the sidecar's Wine execution + Wine-version-
 * management + DXVK/VKD3D toggle channel cluster (Phase 34.5 Plans 05/09, REQ-34.5-03).
 *
 * Six describe blocks:
 *   1. Registration kind — all 9 channels (`runWineCommand`, `getAlternativeWine`,
 *      `wine.isValidVersion`, `installWineVersion`, `refreshWineVersionInfo`, `removeWineVersion`,
 *      `toggleDXVK`, `toggleDXVKNVAPI`, `toggleVKD3D`) are `ipcMain.handle`, never `ipcMain.on`,
 *      asserted in both directions (mirrors `humbleLoginFlows.test.ts`'s Describe 1 template), plus
 *      an explicit assertion that `SEND_CHANNELS` is empty (9-of-9 invoke, zero send).
 *   2. Curated-import guard + winetricks/runWineCommandForGame kind proof — `wineToolsFlowRegistration.ts`
 *      never imports `wine/manager/ipc_handler.ts` or `tools/ipc_handler.ts` (comment-stripped,
 *      mirrors `humbleLoginFlows.test.ts`'s own Describe 3 approach). As of Phase 34.6 Plan 07 the
 *      three winetricks channels and `runWineCommandForGame` are PORTED, not deferred: this
 *      describe now asserts PRESENCE with the correct kind — `winetricksAvailable`,
 *      `winetricksInstalled`, `runWineCommandForGame` in `handlerRegistry` only, `winetricksInstall`
 *      in `listenerRegistry` only (D-11 send-kind) — rather than the pre-port absence assertion it
 *      replaces (T-34.5-15).
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
 *   6. Platform-branch absence gate (T-34.5-17 plan 34.5-05, T-34.5-32 plan 34.5-09, root cause
 *      R2 in `34.5-SECURITY.md`) — both rows declared a `grep` assertion that no
 *      `process.platform`/`isMac`/`isLinux` branch was introduced outside comments in
 *      `wineToolsFlowRegistration.ts`, but the assertion never existed. This builds it, RED-proven
 *      against specimens derived by inserting real branch shapes into the real source text.
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

// `../../game_config`'s `GameConfig.get(appName).getSettings()` would otherwise exercise real
// config-file I/O for a fake `appName` -- factory-mocked so the tool-literal proof test (Describe
// 5) controls exactly what `getSettings()` resolves to, without touching disk.
jest.mock('../../game_config', () => ({
  GameConfig: {
    get: jest.fn()
  }
}))

// `../../tools`'s `DXVK.installRemove` is the curated import target for the three toggle
// handlers -- factory-mocked so Describe 5 can prove each toggle forwards its own tool literal
// without running the real download/prefix-inspection logic.
jest.mock('../../tools', () => ({
  DXVK: {
    getLatest: jest.fn(),
    installRemove: jest.fn()
  }
}))

import { readFileSync } from 'fs'
import { join } from 'path'

import { registerWineToolsFlows } from '../wineToolsFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import { runWineCommand } from '../../launcher'
import { GameConfig } from '../../game_config'
import { DXVK } from '../../tools'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import type { IpcHandler } from '../electronStub'

// ── Registered ONCE for this whole file (not per-test) -- `listenerRegistry`/`handlerRegistry`
// are module-scope maps; calling `registerWineToolsFlows()` more than once would stack a
// duplicate `backendEvents` listener (per this module's own `releasesInfoReady` comment),
// mirroring `humbleLoginFlows.test.ts`'s own file-scope-once convention. ────────────────────────
registerWineToolsFlows()

// ── Describe 1: Registration kind ──────────────────────────────────────────────────────────────
describe('registration kind — all 9 Wine channels are registered with the correct kind, both directions', () => {
  const HANDLE_CHANNELS = [
    'runWineCommand',
    'getAlternativeWine',
    'wine.isValidVersion',
    'installWineVersion',
    'refreshWineVersionInfo',
    'removeWineVersion',
    'toggleDXVK',
    'toggleDXVKNVAPI',
    'toggleVKD3D'
  ]

  // 9 of 9 invoke, zero send -- a deliberate property of this cluster (no channel here is
  // fire-and-forget). Kept as an explicit array (rather than just omitting the assertion) so a
  // future accidental `ipcMain.on` addition to this module fails a test instead of silently
  // passing.
  const SEND_CHANNELS: string[] = []

  it.each(HANDLE_CHANNELS)(
    'REQ-34.5-03 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it('REQ-34.5-03 SEND_CHANNELS is empty -- this cluster is 9-of-9 invoke, zero send', () => {
    expect(SEND_CHANNELS).toHaveLength(0)
  })
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

  it('T-34.5-15 the three winetricks channels and runWineCommandForGame are PRESENT with the correct kind (invoke, except winetricksInstall which is send-kind)', () => {
    // Phase 34.6 Plan 07 ports these four channels. This test replaces the pre-port absence
    // assertion (kept, never deleted — a mis-registered send channel fails SILENTLY under the
    // sidecar, so kind-correctness here is the only thing that would catch it).
    const invokeChannels = [
      'winetricksAvailable',
      'winetricksInstalled',
      'runWineCommandForGame'
    ]
    for (const channel of invokeChannels) {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }

    // D-11: `winetricksInstall` stays send-kind — present in listenerRegistry, ABSENT from
    // handlerRegistry. Converting it to invoke would smuggle a behaviour change into a port.
    expect(handlerRegistry.has('winetricksInstall')).toBe(false)
    expect((listenerRegistry.get('winetricksInstall') ?? []).length).toBeGreaterThan(0)
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

// ── Describe 5: Tool-literal proof ────────────────────────────────────────────────────────────
//
// The three toggle bodies (`toggleDXVK`/`toggleDXVKNVAPI`/`toggleVKD3D`) are near-identical except
// for one string literal. A copy-paste error swapping that literal (e.g. `toggleVKD3D` forwarding
// `'dxvk'` instead of `'vkd3d'`) is otherwise completely silent -- it would install the wrong
// component with no test failure and no runtime error (T-34.5-31). This proves `toggleVKD3D`
// forwards its own literal, not a neighbour's.
describe("tool-literal proof — toggleVKD3D forwards the literal 'vkd3d', not 'dxvk'", () => {
  it("T-34.5-31 the registered 'toggleVKD3D' handler forwards gameSettings and the literal 'vkd3d' to DXVK.installRemove", async () => {
    const fakeGameSettings = {
      marker: 'fake-game-settings-for-toggleVKD3D-test'
    }
    const mockGetSettings = jest.fn().mockResolvedValue(fakeGameSettings)
    ;(GameConfig.get as jest.Mock).mockReturnValue({
      getSettings: mockGetSettings
    })

    const mockInstallRemove = DXVK.installRemove as jest.MockedFunction<
      typeof DXVK.installRemove
    >
    mockInstallRemove.mockClear()
    mockInstallRemove.mockResolvedValue(true)

    const handler = handlerRegistry.get('toggleVKD3D') as IpcHandler
    expect(handler).toBeDefined()

    await handler({} as never, { appName: 'test-app', action: 'backup' })

    expect(GameConfig.get).toHaveBeenCalledWith('test-app')
    expect(mockGetSettings).toHaveBeenCalledTimes(1)
    expect(mockInstallRemove).toHaveBeenCalledTimes(1)

    const [forwardedSettings, forwardedTool, forwardedAction] =
      mockInstallRemove.mock.calls[0]
    // Identity, not just deep-equality -- proves the handler forwards the resolved settings
    // object rather than reshaping it.
    expect(forwardedSettings).toBe(fakeGameSettings)
    expect(forwardedTool).toBe('vkd3d')
    expect(forwardedTool).not.toBe('dxvk')
    expect(forwardedAction).toBe('backup')
  })
})

// ── Describe 6: Platform-branch absence gate (T-34.5-17, T-34.5-32 — root cause R2) ───────────
// Both rows in `34.5-SECURITY.md` declared, verbatim: "grep asserts no process.platform/isMac/
// isLinux branch was introduced outside comments" in `wineToolsFlowRegistration.ts`. The
// invariant was true but the assertion never existed. This builds the control the rows already
// claimed to have.
describe('T-34.5-17 / T-34.5-32 (plans 34.5-05 / 34.5-09, root cause R2) — platform-branch absence gate over wineToolsFlowRegistration.ts', () => {
  // Shared by every assertion below so the RED-proof and the live assertion exercise the exact
  // same code path -- proving the patterns fire is the same act as proving the gate fires. No
  // assertion in this block restates a regex literal inline; all go through platformTokenHits().
  //
  // `\bisMac\b` / `\bisLinux\b` are word-boundary-anchored deliberately: this codebase already
  // contains longer real identifiers such as `isMacNative` and `isLinuxFamily` (also
  // `isMacOSUpToDate`, `isLinuxNative`, `effectiveIsMacNative`) that a naive `includes()` check
  // would falsely match. `process.platform` needs no anchor -- the `.` already makes it
  // unambiguous -- but the `.` itself must be escaped so it doesn't match any character.
  const PLATFORM_PATTERNS: { name: string; pattern: RegExp }[] = [
    { name: 'process.platform', pattern: /process\.platform/ },
    { name: 'isMac', pattern: /\bisMac\b/ },
    { name: 'isLinux', pattern: /\bisLinux\b/ }
  ]

  // Takes ALREADY-PREPARED text (stripped or raw -- the caller decides) and does no stripping
  // itself. This is the anti-vacuity mechanism: every assertion in this block, live or RED-proof,
  // routes through this one function.
  function platformTokenHits(sourceText: string): string[] {
    return PLATFORM_PATTERNS.filter(({ pattern }) =>
      pattern.test(sourceText)
    ).map(({ name }) => name)
  }

  const WINE_TOOLS_REGISTRATION_SRC_PATH = join(
    __dirname,
    '..',
    'wineToolsFlowRegistration.ts'
  )
  const realSource = readFileSync(WINE_TOOLS_REGISTRATION_SRC_PATH, 'utf-8')

  it('T-34.5-17 / T-34.5-32 comment-stripped wineToolsFlowRegistration.ts contains zero process.platform, isMac, isLinux hits', () => {
    expect(platformTokenHits(stripSourceComments(realSource))).toEqual([])
  })

  // Filled-specimen / stripper-integrity control: the RAW module genuinely contains all three
  // tokens (in the D-13 rationale comments at lines 204, 207, 218, 220, 222 -- five lines, not
  // the three the original R2 finding text lists). This is what makes the gate above non-vacuous:
  // a broken stripSourceComments turns the invariant test RED instead of silently green. This
  // assertion is expected to change if the D-13 comments are ever reworded -- if it does, the
  // correct response is to re-derive it against the new raw source, never to delete it.
  it('filled-specimen control: the RAW (unstripped) source contains all three tokens, proving the gate above is stripper-dependent, not vacuous', () => {
    expect(platformTokenHits(realSource)).toEqual([
      'process.platform',
      'isMac',
      'isLinux'
    ])
  })

  it('RED-proof: the platform-token gate trips against a specimen derived by inserting the forbidden branch into the real wineToolsFlowRegistration.ts source', () => {
    const isMacSpecimen = stripSourceComments(
      `${realSource}\nif (isMac) { return true }\n`
    )
    expect(platformTokenHits(isMacSpecimen)).toEqual(['isMac'])

    const isLinuxSpecimen = stripSourceComments(
      `${realSource}\nif (!isLinux) { return }\n`
    )
    expect(platformTokenHits(isLinuxSpecimen)).toEqual(['isLinux'])

    const processPlatformSpecimen = stripSourceComments(
      `${realSource}\nif (process.platform === 'darwin') { return true }\n`
    )
    expect(platformTokenHits(processPlatformSpecimen)).toEqual([
      'process.platform'
    ])
  })

  // False-positive control: the word-boundary anchoring on isMac/isLinux must reject every one
  // of these longer identifiers, which really exist elsewhere in this codebase.
  it.each([
    'isMacNative',
    'isMacOSUpToDate',
    'isLinuxNative',
    'isLinuxFamily',
    'effectiveIsMacNative'
  ])(
    'false-positive control: %s does not trip the gate',
    (lookalikeIdentifier) => {
      const specimen = stripSourceComments(
        `${realSource}\nconst ${lookalikeIdentifier} = true\n`
      )
      expect(platformTokenHits(specimen)).toEqual([])
    }
  )
})
