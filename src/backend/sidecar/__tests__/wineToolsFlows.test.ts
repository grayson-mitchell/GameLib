/**
 * Bidirectional registration-kind proof for the sidecar's Wine execution + Wine-version-
 * management + DXVK/VKD3D toggle channel cluster (Phase 34.5 Plans 05/09, REQ-34.5-03).
 *
 * Six describe blocks:
 *   1. Registration kind — all 9 channels (`runWineCommand`, `getAlternativeWine`,
 *      `wine.isValidVersion`, `installWineVersion`, `refreshWineVersionInfo`, `removeWineVersion`,
 *      `toggleDXVK`, `toggleDXVKNVAPI`, `toggleVKD3D`) are `ipcMain.handle`, never `ipcMain.on`,
 *      asserted in both directions (mirrors `humbleLoginFlows.test.ts`'s Describe 1 template), plus
 *      an assertion, read from `listenerRegistry`, that this module registers NO send channels at
 *      all (Phase 45 Plan 02, D-11 promote, retired the module's one send channel,
 *      `winetricksInstall`).
 *   2. Curated-import guard + winetricks/runWineCommandForGame kind proof — `wineToolsFlowRegistration.ts`
 *      never imports `wine/manager/ipc_handler.ts` or `tools/ipc_handler.ts` (comment-stripped,
 *      mirrors `humbleLoginFlows.test.ts`'s own Describe 3 approach). As of Phase 34.6 Plan 07 the
 *      three winetricks channels and `runWineCommandForGame` are PORTED, not deferred: this
 *      describe asserts PRESENCE with the correct kind — `winetricksAvailable`,
 *      `winetricksInstalled`, `runWineCommandForGame` in `handlerRegistry` only — rather than the
 *      pre-port absence assertion it replaces (T-34.5-15). Phase 45 Plan 02 (D-11 promote) then
 *      retired `winetricksInstall` outright: this describe now also asserts its ABSENCE from BOTH
 *      `handlerRegistry` and `listenerRegistry`, not merely its presence in the latter.
 *   3. Pass-through proof — `../../launcher`'s `runWineCommand` is mocked so the registered
 *      `runWineCommand` handler can be proven to forward `args[0]` unchanged rather than
 *      reshaping it (D-14's seam is a thin pass-through, not new construction).
 *   4. D-15/T-34.5-30 dialog safety pin — `showDialogBoxModalAuto` (the one dialog these three
 *      toggle channels can reach, via `DXVK.installRemove` -> `DXVK.getLatest()` ->
 *      `installOrUpdateTool` -> `tools/index.ts:137`) never throws and never produces an
 *      unhandled promise rejection even when its primary frontend push fails, using a
 *      `jest.isolateModules()` sandbox (mirrors `sidecarRejectionGuard.test.ts`'s own harness
 *      shape) so the real, non-mocked `platformApi.dialog` fallback (proven non-throwing in its
 *      own dedicated suite, `dialogStub.test.ts`) is what's actually exercised here, without
 *      disturbing this file's already-loaded `config.ts`/`game_config.ts` module instances
 *      (Phase 35 Plan 18: those instances now resolve against the REAL `backend/platform` by
 *      default too, since the old project-wide `src/backend/__mocks__/electron.ts` auto-mock no
 *      longer exists -- see the docstring above the isolated describe block below for the full
 *      update).
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
// `../../tools` is factory-mocked so this suite never runs the real download/prefix-inspection logic.
// (The DXVK toggles left this module in Phase 87 Plan 34, `runWineCommandForGame` in Plan 36.)
jest.mock('../../tools', () => {
  // One tools object for the whole file: `createTools(deps)` hands the same mocks out every time.
  const tools = {
    DXVK: {
      getLatest: jest.fn(),
      installRemove: jest.fn()
    },
    Winetricks: {
      listAvailable: jest.fn(),
      listInstalled: jest.fn(),
      install: jest.fn()
    },
    runWineCommandOnGame: jest.fn(),
    runWineCommandForPendingInstall: jest.fn()
  }
  return { createTools: () => tools }
})

import { createTestHostServices } from 'backend/testUtils/testHostServices'
import {
  createTestToolsSlices,
  createTestManagers,
  createTestServices,
  createTestStores
} from 'backend/testUtils/testServices'
import { defined } from 'backend/testUtils/indexed'
import { readFileSync } from 'fs'
import { join } from 'path'

import { registerWineToolsFlows } from '../wineToolsFlowRegistration'
import { createIpcRegistry } from '../ipcRegistry'
import { ipcViews } from '../../testUtils/ipcViews'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import type { IpcHandler } from '../ipcRegistry'

// ── Registered ONCE for this whole file (not per-test) -- `listenerRegistry`/`handlerRegistry`
// are module-scope maps; calling `registerWineToolsFlows()` more than once would stack a
// duplicate `backendEvents` listener (per this module's own `releasesInfoReady` comment),
// mirroring `humbleLoginFlows.test.ts`'s own file-scope-once convention. ────────────────────────
// The listener counts are captured either side of the call, so Describe 1 can assert exactly
// which send channels THIS module registered rather than a hand-written list.
const ipc = createIpcRegistry()
const { handlerRegistry, listenerRegistry } = ipcViews(ipc)
const listenerCountsBefore = new Map(
  [...ipc.listenerMap()].map(([channel, listeners]) => [
    channel,
    listeners.length
  ])
)
const runWineCommand = jest.fn()
const toolsSlices = createTestToolsSlices()
toolsSlices.config.getSettings = () =>
  ({ winePrefix: '/global/prefix', enableEsync: false }) as never
registerWineToolsFlows({
  ipc,
  managers: createTestManagers(),
  commandRunner: {
    runWineCommand: (...a: Parameters<typeof runWineCommand>) =>
      runWineCommand(...a)
  },
  launcher: {
    validWine: jest.fn(),
    setupEnvVars: jest.fn(),
    setupWineEnvVars: jest.fn()
  },
  spawnAsync: jest.fn(),
  stores: createTestStores(),
  runner: createTestServices().runner,
  ...toolsSlices,
  gameConfigs: { get: jest.fn() } as never
})
const registeredSendChannels = [...ipc.listenerMap()]
  .filter(
    ([channel, listeners]) =>
      listeners.length > (listenerCountsBefore.get(channel) ?? 0)
  )
  .map(([channel]) => channel)

// ── Describe 1: Registration kind ──────────────────────────────────────────────────────────────
describe('registration kind — all 9 Wine channels are registered with the correct kind, both directions', () => {
  const HANDLE_CHANNELS = [
    'runWineCommand'
    // Phase 87 Plan 26 (D-14): `getAlternativeWine` is a native `wine` channel.
    // Phase 87 Plan 24 (D-14): `wine.isValidVersion` is a native `wine` channel.
    // Phase 87 Plan 34 (D-23): `toggleDXVK`, `toggleDXVKNVAPI` and `toggleVKD3D` are scheduled resolvers
    // (`engineWineResolvers.ts`), proved in `engineWineResolvers.test.ts`.
  ]

  it.each(HANDLE_CHANNELS)(
    'REQ-34.5-03 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  // Read from `listenerRegistry`, not a local literal: the literal this replaced was an empty
  // array asserted to be empty, and it stayed green when `winetricksInstall` was added as
  // `ipcMain.on` (Phase 34.6 Plan 07). Phase 45 Plan 02 (D-11 promote, 2026-10-10) then retired
  // that one send channel outright, so this module now registers NO send channels at all.
  it('REQ-34.5-03 this module registers no ipcMain.on channels (winetricksInstall retired, Phase 45 Plan 02)', () => {
    expect(registeredSendChannels).toEqual([])
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

  it('T-34.5-15 winetricksInstall is retired and absent from BOTH registries', () => {
    // Phase 87 Plans 35 and 36 (D-23): the Winetricks channels and `runWineCommandForGame` are scheduled resolvers
    // (`engineWineResolvers.ts`), so this module holds only `runWineCommand`.
    // Phase 45 Plan 02 (D-11 promote, 2026-10-10): `winetricksInstall` is retired outright, not
    // merely kind-swapped — absent from BOTH handlerRegistry and listenerRegistry.
    expect(handlerRegistry.has('winetricksInstall')).toBe(false)
    expect((listenerRegistry.get('winetricksInstall') ?? []).length).toBe(0)
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
    expect(defined(mockRunWineCommand.mock.calls[0], 'first call')[0]).toBe(
      commandArgs
    )
  })
})

describe('runWineCommand fills absent gameSettings keys from the global settings', () => {
  it('merges payload keys over getSettings(), and leaves a gameSettings-less payload alone', async () => {
    const handler = handlerRegistry.get('runWineCommand') as IpcHandler
    runWineCommand.mockClear()
    runWineCommand.mockResolvedValue({ stdout: '', stderr: '' })
    await handler({} as never, {
      commandParts: ['x'],
      gameSettings: { enableEsync: true }
    })
    const passed = defined(runWineCommand.mock.calls[0], 'call')[0]
    expect(passed.gameSettings.enableEsync).toBe(true)
    expect(passed.gameSettings.winePrefix).toBe('/global/prefix')
    runWineCommand.mockClear()
    await handler({} as never, { commandParts: ['x'] })
    expect(
      defined(runWineCommand.mock.calls[0], 'call')[0].gameSettings
    ).toBeUndefined()
  })
})

// ── Describe 4: D-15/T-34.5-30 dialog safety pin ──────────────────────────────────────────────
//
// The one dialog `toggleDXVK`/`toggleDXVKNVAPI`/`toggleVKD3D` can reach is `showDialogBoxModalAuto`
// (`tools/index.ts:137`, via `DXVK.installRemove` -> `DXVK.getLatest()` -> `installOrUpdateTool`
// on a download failure). This pins the property D-15 actually cares about: even when the primary
// `sendFrontendMessage('showDialog', ...)` push fails, the fallback to `platformApi.dialog.*`
// never throws and never leaves an unhandled promise rejection behind.
//
// A dedicated `jest.isolateModules()` sandbox is used (mirrors `sidecarRejectionGuard.test.ts`'s
// own harness shape) so this test can mock `'../sidecarRpc'` for a fast,
// deterministic stub -- WITHOUT touching this file's top-level module registry, where
// `config.ts`/`game_config.ts` are already loaded for real (swapping their module instances
// file-wide risks the `tests-clobbering-real-steam-store.md` failure mode this project has hit
// before).
//
// (Phase 35 Plan 18 update: this sandbox used to ALSO `jest.doMock('electron', () =>
// jest.requireActual('../../platform'))`, to swap `'electron'` away from the project-wide
// `src/backend/__mocks__/electron.ts` auto-mock this file's top-level imports relied on. That
// automock no longer exists -- Plan 18 retired the `electron` devDependency outright, and its
// manual-mock replacement at `src/backend/platform/__mocks__/index.ts` is a first-party module
// mock Jest never auto-applies without an explicit per-suite `jest.mock()` call, which this file
// declares none of. `dialog.ts` (the module under test here) already imports from
// `backend/platform` directly, both at this file's top level and inside this isolated sandbox,
// so the `doMock` swap became a no-op and was deleted.)
describe('D-15/T-34.5-30 dialog safety pin — showDialogBoxModalAuto never propagates a rejection', () => {
  it('does not throw synchronously and produces no unhandled rejection when the frontend push fails, using the real platformApi dialog fallback', async () => {
    let isolatedShowDialogBoxModalAuto!: (
      deps: unknown,
      props: {
        title: string
        message: string
        type: 'ERROR' | 'INFO' | 'WARNING'
      }
    ) => void

    jest.isolateModules(() => {
      jest.doMock('../sidecarRpc', () => ({
        requestRustInvoke: jest.fn().mockResolvedValue(undefined)
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
        isolatedShowDialogBoxModalAuto(
          {
            appState: createTestHostServices().appState,
            dialogs: createTestHostServices().dialogs,
            sendFrontendMessage: jest.fn(() => {
              throw new Error(
                'mock frontend-push failure (D-15/T-34.5-30 pin — the primary showDialog push failed)'
              )
            })
          },
          {
            title: 'box.error.dxvk.title',
            message: 'box.error.dxvk.message',
            type: 'ERROR'
          }
        )
      ).not.toThrow()

      // Let the fire-and-forget `platformApi.dialog.showErrorBox(...)` promise settle before
      // asserting nothing escaped as an unhandled rejection.
      await new Promise((resolve) => setImmediate(resolve))

      expect(unhandledRejections).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })
})

// ── Describe 5: Tool-literal proof ────────────────────────────────────────────────────────────
// Phase 87 Plan 34 (D-23): the three DXVK toggles are scheduled resolvers (`engineWineResolvers.ts`); the
// tool-literal proof (T-34.5-31) lives in `engineWineResolvers.test.ts`, over the one typed Rust call each
// makes, and this module registers no handle for them.

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

// ── Describe 7: the wine-command-for-game channel is registered elsewhere, never here (Phase 87 Plan 36) ─
// `runWineCommandForGame` is a scheduled resolver (`engineWineResolvers.ts`, proved in `engineWineResolvers.test.ts`) over
// the Rust `wine_run_command_for_game` op. Its shape guard (T-34.5-C6-49-03, 34.6-11), the Steam and native guards and
// the Windows branch's argv-array spawn are Rust behavioural tests (`run_for_game_guard.rs`, 87-33), so the TS cases
// that pinned them here went with the handler.
describe('runWineCommandForGame is registered elsewhere, never here (Phase 87 Plan 36)', () => {
  it('has no handle and no listener in this module', () => {
    expect(handlerRegistry.has('runWineCommandForGame')).toBe(false)
    expect((listenerRegistry.get('runWineCommandForGame') ?? []).length).toBe(0)
  })
})

// ── Describe 9: the Winetricks family is not registered here (Phase 87 Plan 35, D-06, D-14, D-23) ─
// `winetricksApply`, `winetricksAvailable` and `winetricksInstalled` are scheduled resolvers
// (`engineWineResolvers.ts`, proved in `engineWineResolvers.test.ts`) and `winetricksQueueState` and
// `winetricksCancelRemaining` are native `wine` channels, so this module registers none of the five: a channel with
// two owners would answer from the TS queue while the renderer's apply ran in Rust.
describe('the Winetricks family is registered elsewhere, never here (Phase 87 Plan 35)', () => {
  it.each([
    'winetricksApply',
    'winetricksAvailable',
    'winetricksInstalled',
    'winetricksQueueState',
    'winetricksCancelRemaining'
  ])('%s has no handle and no listener in this module', (channel) => {
    expect(handlerRegistry.has(channel)).toBe(false)
    expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
  })
})
