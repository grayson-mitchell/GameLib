/**
 * quick 261024-tny: applySteamBridgeKnownFixes -- the Steam bridge launch's
 * known-fixes hook. Uses the REAL readKnownFixes (fixes file written under a
 * tmp-redirected fixesPath) so the `<appId>-steam.json` name is proven end to
 * end. Every Rust call (`requestRustInvoke`) is a fake that answers per channel: the Winetricks install, and
 * since 88-14 the registry fixes and the overlay env, whose application the Rust goldens cover. runWineCommand,
 * the status sender and the bottle helper are mocked; no child process is spawned.
 */

import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  RUST_KNOWNFIX_APPLY_REGISTRY,
  RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV,
  RUST_WINE_WINETRICKS_INSTALL
} from 'common/types/sidecarTransport'

jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-steambridgefixes-home-${process.pid}`)
  }
})

// Under jest app.getAppPath() resolves to the repo root, so the real
// bundledFixesPath is the repo's own public/fixes. Point it at a tmp dir so the
// tests can never write to or delete the shipped profiles.
// Every Rust call goes through this one fake. The Winetricks verbs (87-35) send `[target, verbs]` on
// RUST_WINE_WINETRICKS_INSTALL; the registry fixes (88-14) send `[{appId, label, gameSettings, bottleDir}]` on
// RUST_KNOWNFIX_APPLY_REGISTRY and the overlay env `[{appId, label, wineType, baseValues}]` on
// RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV.
const mockRustInvoke = jest.fn()
const mockRunWineCommand = jest.fn()
const mockSendGameStatusUpdate = jest.fn()
const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()
const mockBottleRoot = '/mock/Bottles'

jest.mock('backend/utils', () => ({
  sendGameStatusUpdate: (...args: unknown[]) =>
    mockSendGameStatusUpdate(...args)
}))
jest.mock('backend/logger', () => ({
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
// What Rust answers on the two known-fix channels (the golden-pinned crate computes them; here they are the answers).
const mockRegistryAnswer = jest.fn()
const mockOverlayEnvAnswer = jest.fn()
const mockDetectGameMaker = jest.fn()
jest.mock('../storeManagers/steam/bridge/gameMakerRunner', () => ({
  detectGameMakerD3d11Runner: (...a: unknown[]) => mockDetectGameMaker(...a)
}))
jest.mock('backend/enginewine/twin', () => ({
  ...jest.requireActual<typeof import('backend/enginewine/twin')>(
    'backend/enginewine/twin'
  ),
  getBottleDir: (_paths: unknown, name: string) => `${mockBottleRoot}/${name}`
}))
jest.mock('../storeManagers/steam/bottle', () => ({}))

import type { GameSettings } from 'common/types'
import {
  applySteamBridgeKnownFixes,
  steamBridgeLaunchCommandParts,
  steamShimFeatureCfgLines
} from '../storeManagers/steam/bridgeKnownFixes'
import { defined } from './helpers/defined'

// A per-file disposable AppPaths root (66.4-17): the known-fix readers take their layer directories
// from `deps.paths`, so no module is mocked. The bundled layer is nested as `<root>/public/fixes`,
// the same depth as the shipped `<app>/public/fixes`.
const TEST_ROOT = join(
  tmpdir(),
  `gamelib-bundled-fixes-test-${process.pid}-bridge`
)
const paths = createTestAppPaths(TEST_ROOT, {
  bundledFixesPath: join(TEST_ROOT, 'public', 'fixes')
})
const { bundledFixesPath, fixesPath, localFixesPath } = paths
const deps = { paths }

const APP_ID = '480'
const ROOT =
  '/mock/Bottles/GameLibSteamBridge-480/drive_c/steamapps/common/Game'

const DEPS = {
  commandRunner: {
    runWineCommand: (...args: unknown[]) => mockRunWineCommand(...args)
  },
  requestRustInvoke: (...args: unknown[]) => mockRustInvoke(...args),
  paths
} as unknown as Parameters<typeof applySteamBridgeKnownFixes>[0]

const BRIDGE = {
  wineCrossoverBottle: 'GameLibSteamBridge-480',
  winePrefix: '/global/prefix',
  enviromentOptions: [{ key: 'USER', value: 'x' }],
  wineVersion: { type: 'crossover' }
} as unknown as GameSettings

const NO_MATCH = {
  match: false,
  dataWin: false,
  d3d11Import: false,
  msaaProbe: false
}
const MATCH = { match: true, dataWin: true, d3d11Import: true, msaaProbe: true }

function writeFixes(content: object) {
  writeFileSync(
    join(fixesPath, `${APP_ID}-steam.json`),
    JSON.stringify(content)
  )
}

function writeIn(dir: string, content: object, suffix = '.json') {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${APP_ID}-steam${suffix}`), JSON.stringify(content))
}
// Tier 2 (`.profile.json`) writers: registry lives here.
const writeLocal = (c: object) => writeIn(localFixesPath, c, '.profile.json')
const writeBundled = (c: object) =>
  writeIn(bundledFixesPath, c, '.profile.json')

beforeEach(() => {
  jest.clearAllMocks()
  mkdirSync(fixesPath, { recursive: true })
  rmSync(join(fixesPath, `${APP_ID}-steam.json`), { force: true })
  rmSync(join(fixesPath, `${APP_ID}-steam.profile.json`), { force: true })
  rmSync(localFixesPath, { recursive: true, force: true })
  rmSync(bundledFixesPath, { recursive: true, force: true })
  // Each Rust channel is observed at the one call that crosses to it. The Winetricks install answers one outcome
  // per verb; the registry step answers `null`; the overlay env answers what `mockOverlayEnvAnswer` holds.
  mockRustInvoke.mockImplementation(
    async (channel: string, args: [unknown, string[]]) => {
      if (channel === RUST_KNOWNFIX_APPLY_REGISTRY)
        return await mockRegistryAnswer()
      if (channel === RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV)
        return await mockOverlayEnvAnswer()
      return args[1].map(() => 'installed')
    }
  )
  mockRegistryAnswer.mockReturnValue(null)
  mockOverlayEnvAnswer.mockReturnValue({})
  mockRunWineCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
  mockDetectGameMaker.mockResolvedValue(NO_MATCH)
})

afterAll(() => {
  rmSync(fixesPath, { recursive: true, force: true })
  rmSync(bundledFixesPath, { recursive: true, force: true })
  void tmpdir
})

/** The calls the bridge made on one Rust channel, as `[args]` tuples. */
function callsOn(channel: string): unknown[][] {
  return mockRustInvoke.mock.calls
    .filter((call) => call[0] === channel)
    .map((call) => call[1] as unknown[])
}

describe('applySteamBridgeKnownFixes overlays', () => {
  const OVERLAY = { id: 'gst-libav-1.24.13', target: 'gstreamer-plugin-path' }

  it('asks Rust for the overlay env with the tier-1 value as the base and appends the answer last', async () => {
    writeFixes({ envVariables: { GST_PLUGIN_PATH: '/t1', OTHER: 'o' } })
    writeLocal({ overlays: [OVERLAY] })
    mockOverlayEnvAnswer.mockReturnValue({ GST_PLUGIN_PATH: '/t1:/ov' })

    const result = await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)

    // One call, one object: the profile's overlays are read in Rust, so only the app, the label, the wine type and
    // the base values cross.
    expect(callsOn(RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV)).toEqual([
      [
        {
          appId: APP_ID,
          label: 'Steam 480',
          wineType: 'crossover',
          baseValues: { GST_PLUGIN_PATH: '/t1' }
        }
      ]
    ])
    expect(result.enviromentOptions).toEqual([
      { key: 'USER', value: 'x' },
      { key: 'GST_PLUGIN_PATH', value: '/t1' },
      { key: 'OTHER', value: 'o' },
      { key: 'GST_PLUGIN_PATH', value: '/t1:/ov' }
    ])
    const line = mockLogInfo.mock.calls.map((c) => c[0]).join('\n')
    expect(line).toContain('GST_PLUGIN_PATH=/t1 (tier-1)')
    expect(line).toContain('GST_PLUGIN_PATH=/t1:/ov (overlay)')
  })

  describe('the base values', () => {
    const KEYS = ['GST_PLUGIN_PATH', 'GST_PLUGIN_PATH_1_0'] as const
    const saved: Record<string, string | undefined> = {}
    beforeEach(() => {
      for (const key of [...KEYS, 'GAMELIB_BRIDGE_TEST_SECRET']) {
        saved[key] = process.env[key]
        delete process.env[key]
      }
    })
    afterEach(() => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    })

    it('fall back to the sidecar env for a key the merged env lacks, and the merged env wins when both have it', async () => {
      process.env.GST_PLUGIN_PATH = '/from-process'
      process.env.GST_PLUGIN_PATH_1_0 = '/from-process-1-0'
      writeFixes({ envVariables: { GST_PLUGIN_PATH: '/t1' } })
      writeLocal({ overlays: [OVERLAY] })

      await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)

      expect(callsOn(RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV)[0]).toEqual([
        {
          appId: APP_ID,
          label: 'Steam 480',
          wineType: 'crossover',
          baseValues: {
            GST_PLUGIN_PATH: '/t1',
            GST_PLUGIN_PATH_1_0: '/from-process-1-0'
          }
        }
      ])
    })

    it('take the last matching merged entry, the user env included', async () => {
      writeLocal({ overlays: [OVERLAY] })
      const user = {
        ...BRIDGE,
        enviromentOptions: [
          { key: 'GST_PLUGIN_PATH', value: '/user-first' },
          { key: 'GST_PLUGIN_PATH', value: '/user-last' }
        ]
      } as unknown as GameSettings

      await applySteamBridgeKnownFixes(DEPS, APP_ID, user, ROOT)

      expect(callsOn(RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV)[0]).toEqual([
        expect.objectContaining({
          baseValues: { GST_PLUGIN_PATH: '/user-last' }
        })
      ])
    })

    it('hold only the overlay env keys, never the rest of the environment (T-88-33)', async () => {
      process.env.GAMELIB_BRIDGE_TEST_SECRET = 'secret'
      writeFixes({ envVariables: { DXVK_ASYNC: '1' } })
      writeLocal({ overlays: [OVERLAY] })

      await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)

      expect(callsOn(RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV)[0]).toEqual([
        expect.objectContaining({ baseValues: {} })
      ])
    })
  })

  it('sends a null wine type when the bridge settings carry none', async () => {
    writeLocal({ overlays: [OVERLAY] })
    const bare = {
      ...BRIDGE,
      wineVersion: undefined
    } as unknown as GameSettings

    await applySteamBridgeKnownFixes(DEPS, APP_ID, bare, ROOT)

    expect(callsOn(RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV)[0]).toEqual([
      expect.objectContaining({ wineType: null })
    ])
  })

  it('leaves settings untouched and asks Rust nothing when a profile has no overlays', async () => {
    writeLocal({ title: 't' })
    const result = await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)
    expect(callsOn(RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV)).toEqual([])
    expect(result).toBe(BRIDGE)
  })

  it.each([
    [
      'rejects',
      () =>
        mockOverlayEnvAnswer.mockImplementation(() => {
          throw new Error('knownfix_resolve_overlay_env:not-ready')
        })
    ],
    [
      'answers a value that is not a string map',
      () => mockOverlayEnvAnswer.mockReturnValue({ GST_PLUGIN_PATH: 1 })
    ],
    ['answers null', () => mockOverlayEnvAnswer.mockReturnValue(null)]
  ])(
    'when Rust %s the overlay is skipped with a warning and the tier-1 env still applies',
    async (_name, arm) => {
      writeFixes({ envVariables: { OTHER: 'o' } })
      writeLocal({ overlays: [OVERLAY] })
      arm()

      const result = await applySteamBridgeKnownFixes(
        DEPS,
        APP_ID,
        BRIDGE,
        ROOT
      )

      expect(result.enviromentOptions).toEqual([
        { key: 'USER', value: 'x' },
        { key: 'OTHER', value: 'o' }
      ])
      expect(mockLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('overlay env'),
        'Backend'
      )
    }
  )
})

describe('applySteamBridgeKnownFixes', () => {
  it('does nothing and returns the same object when there is no fixes file', async () => {
    const result = await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)

    expect(result).toBe(BRIDGE)
    expect(mockRustInvoke).not.toHaveBeenCalled()
    expect(mockRunWineCommand).not.toHaveBeenCalled()
    expect(mockSendGameStatusUpdate).not.toHaveBeenCalled()
  })

  it('runs winetricks verbs against the bridge bottle, sending status first', async () => {
    writeFixes({ title: 't', winetricks: ['vcrun2019', 'd3dx9', '-q'] })

    await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)

    expect(mockSendGameStatusUpdate).toHaveBeenCalledTimes(1)
    expect(mockSendGameStatusUpdate).toHaveBeenCalledWith(expect.anything(), {
      appName: APP_ID,
      runner: 'steam',
      status: 'winetricks'
    })
    // One call carries every valid verb, in order; the invalid one never reaches Rust.
    expect(mockRustInvoke).toHaveBeenCalledTimes(1)
    const [channel, [target, verbs]] = defined(
      mockRustInvoke.mock.calls[0],
      'rust call'
    )
    expect(channel).toBe(RUST_WINE_WINETRICKS_INSTALL)
    expect(verbs).toEqual(['vcrun2019', 'd3dx9'])
    expect(target.runner).toBe('steam')
    expect(target.appName).toBe(APP_ID)
    expect(target.settings.wineCrossoverBottle).toBe('GameLibSteamBridge-480')
    expect(target.settings.winePrefix).toBe(
      '/mock/Bottles/GameLibSteamBridge-480'
    )
    expect(mockSendGameStatusUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      defined(
        mockRustInvoke.mock.invocationCallOrder[0],
        'winetricks call order'
      )
    )
    expect(mockLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('-q'),
      'Steam'
    )
  })

  it('runs runInPrefix entries through runWineCommand under the install root', async () => {
    writeFixes({ title: 't', runInPrefix: ['redist/vc_redist.x64.exe'] })

    await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)

    expect(mockSendGameStatusUpdate).toHaveBeenCalledWith(expect.anything(), {
      appName: APP_ID,
      runner: 'steam',
      status: 'redist',
      context: 'FIXES'
    })
    expect(mockRunWineCommand).toHaveBeenCalledWith({
      commandParts: [`${ROOT}/redist/vc_redist.x64.exe`],
      gameSettings: BRIDGE,
      wait: true,
      protonVerb: 'run',
      skipPrefixCheckIKnowWhatImDoing: true
    })
  })

  it('skips a runInPrefix entry that escapes the install root', async () => {
    writeFixes({ title: 't', runInPrefix: ['../../../evil.exe'] })

    await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)

    expect(mockRunWineCommand).not.toHaveBeenCalled()
    expect(mockLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('evil.exe'),
      'Steam'
    )
  })

  it('skips runInPrefix when the install root is unknown', async () => {
    writeFixes({ title: 't', runInPrefix: ['setup.exe'] })

    await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, undefined)

    expect(mockRunWineCommand).not.toHaveBeenCalled()
    expect(mockLogWarning).toHaveBeenCalled()
  })

  it('returns a NEW settings object carrying the fix env after the user env', async () => {
    writeFixes({ title: 't', envVariables: { DXVK_ASYNC: '1' } })

    const result = await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)

    expect(result).not.toBe(BRIDGE)
    expect(result.enviromentOptions).toEqual([
      { key: 'USER', value: 'x' },
      { key: 'DXVK_ASYNC', value: '1' }
    ])
    expect({ ...result, enviromentOptions: undefined }).toEqual({
      ...BRIDGE,
      enviromentOptions: undefined
    })
    expect(BRIDGE.enviromentOptions).toEqual([{ key: 'USER', value: 'x' }])
  })

  describe('failure tolerance', () => {
    it.each([
      ['rejects', () => mockRustInvoke.mockRejectedValue(new Error('x'))],
      ['returns failed', () => mockRustInvoke.mockResolvedValue(['failed'])],
      ['returns refused', () => mockRustInvoke.mockResolvedValue(['refused'])]
    ])(
      'the Rust Winetricks install %s: warns, resolves, keeps env',
      async (_n, arm) => {
        writeFixes({
          title: 't',
          winetricks: ['vcrun2019'],
          envVariables: { DXVK_ASYNC: '1' }
        })
        arm()

        const result = await applySteamBridgeKnownFixes(
          DEPS,
          APP_ID,
          BRIDGE,
          ROOT
        )

        expect(mockLogWarning).toHaveBeenCalledWith(
          expect.stringContaining('vcrun2019'),
          'Steam'
        )
        expect(result.enviromentOptions).toEqual([
          { key: 'USER', value: 'x' },
          { key: 'DXVK_ASYNC', value: '1' }
        ])
      }
    )

    it('runWineCommand rejecting warns and still resolves with env', async () => {
      writeFixes({
        title: 't',
        runInPrefix: ['setup.exe'],
        envVariables: { A: 'b' }
      })
      mockRunWineCommand.mockRejectedValue(new Error('boom'))

      const result = await applySteamBridgeKnownFixes(
        DEPS,
        APP_ID,
        BRIDGE,
        ROOT
      )

      expect(mockLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('setup.exe'),
        'Steam'
      )
      expect(result.enviromentOptions).toHaveLength(2)
    })
  })
})

const WMP_KEY =
  'HKLM\\Software\\Microsoft\\Active Setup\\Installed Components\\{22d6f312-b0f6-11d0-94ab-0080c74c7e95}'
const WMP = {
  key: WMP_KEY,
  name: 'IsInstalled',
  type: 'REG_DWORD',
  value: 1
}

// 88-14 (D-03): the registry step is Rust's. The bridge sends one `knownfix_apply_registry` call when the Steam
// tier-2 profile carries a `registry` or `dllOverrides` key, and Rust reads the profile itself, validates it,
// applies it into the bottle and skips what is already set. What Rust does is covered by the `golden/registry`
// replay in `gamelib-knownfix` (`tests/golden_registry.rs`); these cases pin what crosses and what a failure does.
describe('registry fixes through Rust', () => {
  it('sends one call carrying the app, the label, the bridge settings and the bottle folder for a bundled registry profile', async () => {
    writeBundled({ title: 't', registry: [WMP] })

    await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)

    expect(callsOn(RUST_KNOWNFIX_APPLY_REGISTRY)).toEqual([
      [
        {
          appId: APP_ID,
          label: 'Steam 480',
          gameSettings: BRIDGE,
          bottleDir: '/mock/Bottles/GameLibSteamBridge-480'
        }
      ]
    ])
    // Nothing is spawned from TS: the `reg add` helpers are Rust's.
    expect(mockRunWineCommand).not.toHaveBeenCalled()
  })

  it('sends the call for a dllOverrides-only profile', async () => {
    writeBundled({
      dllOverrides: [{ exe: 'Game.exe', dlls: { nvapi64: 'disabled' } }]
    })
    await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)
    expect(callsOn(RUST_KNOWNFIX_APPLY_REGISTRY)).toHaveLength(1)
  })

  it('sends the call for a local profile too (the layers are read in Rust, the gate here)', async () => {
    writeLocal({ title: 't', registry: [WMP] })
    await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)
    expect(callsOn(RUST_KNOWNFIX_APPLY_REGISTRY)).toHaveLength(1)
  })

  it('sends a null bottle folder when the bridge settings name no bottle', async () => {
    writeBundled({ title: 't', registry: [WMP] })
    const noBottle = {
      ...BRIDGE,
      wineCrossoverBottle: undefined
    } as unknown as GameSettings

    await applySteamBridgeKnownFixes(DEPS, APP_ID, noBottle, ROOT)

    expect(callsOn(RUST_KNOWNFIX_APPLY_REGISTRY)[0]).toEqual([
      expect.objectContaining({ bottleDir: null })
    ])
  })

  it('sends no call for a profile with neither registry nor dllOverrides', async () => {
    writeBundled({ title: 't', overlays: [] })
    await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)
    expect(callsOn(RUST_KNOWNFIX_APPLY_REGISTRY)).toEqual([])
  })

  it('sends no call without a profile', async () => {
    writeFixes({ title: 't', envVariables: { A: '1' } })
    await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)
    expect(callsOn(RUST_KNOWNFIX_APPLY_REGISTRY)).toEqual([])
  })

  it('sends no call for a .profile.json that sits only in the remote directory', async () => {
    writeIn(fixesPath, { title: 't', registry: [WMP] }, '.profile.json')
    await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)
    expect(callsOn(RUST_KNOWNFIX_APPLY_REGISTRY)).toEqual([])
  })

  it.each([
    ['remote', () => fixesPath],
    ['bundled', () => bundledFixesPath],
    ['local', () => localFixesPath]
  ])(
    'sends no call for registry placed in a tier-1 .json (%s), and warns',
    async (_n, dir) => {
      writeIn(dir(), { title: 't', registry: [WMP] })
      await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)
      expect(callsOn(RUST_KNOWNFIX_APPLY_REGISTRY)).toEqual([])
      expect(mockLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('registry')
      )
    }
  )

  it('applies remote tier-1 envVariables and sends the bundled tier-2 registry in the same launch', async () => {
    writeFixes({ title: 't', envVariables: { A: '1' } })
    writeBundled({ title: 'p', registry: [WMP] })
    const result = await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)
    expect(callsOn(RUST_KNOWNFIX_APPLY_REGISTRY)).toHaveLength(1)
    expect(result.enviromentOptions).toEqual([
      { key: 'USER', value: 'x' },
      { key: 'A', value: '1' }
    ])
  })

  it('runs the registry step before winetricks, so a later fix step sees the marker', async () => {
    writeBundled({ title: 't', registry: [WMP] })
    writeFixes({ title: 't', winetricks: ['vcrun2019'] })
    await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)
    const channels = mockRustInvoke.mock.calls.map((c) => c[0])
    expect(channels).toEqual([
      RUST_KNOWNFIX_APPLY_REGISTRY,
      RUST_WINE_WINETRICKS_INSTALL
    ])
  })

  it('awaits the registry call before it goes on', async () => {
    writeBundled({ title: 't', registry: [WMP] })
    writeFixes({ title: 't', winetricks: ['vcrun2019'] })
    let release: () => void = () => undefined
    mockRegistryAnswer.mockReturnValue(
      new Promise<null>((resolve) => {
        release = () => resolve(null)
      })
    )
    const pending = applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)
    // The registry call is out and unanswered, so winetricks has not started.
    await new Promise((resolve) => setImmediate(resolve))
    expect(mockRustInvoke.mock.calls.map((c) => c[0])).toEqual([
      RUST_KNOWNFIX_APPLY_REGISTRY
    ])
    release()
    await pending
    expect(mockRustInvoke.mock.calls.map((c) => c[0])).toEqual([
      RUST_KNOWNFIX_APPLY_REGISTRY,
      RUST_WINE_WINETRICKS_INSTALL
    ])
  })

  it('a rejected registry call warns and the env still applies', async () => {
    writeBundled({ title: 't', registry: [WMP] })
    writeFixes({ title: 't', envVariables: { A: 'b' } })
    mockRegistryAnswer.mockImplementation(() => {
      throw new Error('knownfix_apply_registry:not-ready')
    })

    const result = await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)

    expect(mockLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('registry step failed'),
      'Backend'
    )
    expect(result.enviromentOptions).toEqual([
      { key: 'USER', value: 'x' },
      { key: 'A', value: 'b' }
    ])
  })
})

describe('bundled 284100 profile', () => {
  it('carries the one registry entry Rust validates, cites the todo, and has no tier-1 file', () => {
    const path = jest.requireActual('path')
    const fs = jest.requireActual('fs')
    const parsed = JSON.parse(
      fs.readFileSync(
        path.join(
          __dirname,
          '..',
          '..',
          '..',
          'public',
          'fixes',
          '284100-steam.profile.json'
        ),
        'utf8'
      )
    )
    // The entry names no `views`, so Rust's validator defaults it to both (`golden/registry`, validate cases).
    expect(parsed.registry).toHaveLength(1)
    expect(defined(parsed.registry[0], 'first registry fix').views).toBe(
      undefined
    )
    expect(defined(parsed.registry[0], 'first registry fix').key).toContain(
      '22d6f312-b0f6-11d0-94ab-0080c74c7e95'
    )
    expect(parsed.evidence).toContain(
      '2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need'
    )
    expect(
      fs.existsSync(
        path.join(
          __dirname,
          '..',
          '..',
          '..',
          'public',
          'fixes',
          '284100-steam.json'
        )
      )
    ).toBe(false)
  })
})

describe('bundled 63000 profile', () => {
  it('yields the Hoard WGL fix line and cites spike 034', () => {
    const path = jest.requireActual('path')
    const fs = jest.requireActual('fs')
    const fixesDir = path.join(__dirname, '..', '..', '..', 'public', 'fixes')
    const parsed = JSON.parse(
      fs.readFileSync(path.join(fixesDir, '63000-steam.profile.json'), 'utf8')
    )
    writeBundled(parsed)
    expect(steamShimFeatureCfgLines(deps, APP_ID)).toEqual([
      'fix.wgl.hideExtensions=WGL_ARB_create_context*'
    ])
    expect(parsed.evidence).toContain('034-known-fixes-v2-hoard')
    // The tier-1 file holds only the macArch seed (quick 261027-bqe); the WGL
    // fix stays in the profile alone.
    const tier1 = JSON.parse(
      fs.readFileSync(path.join(fixesDir, '63000-steam.json'), 'utf8')
    )
    expect(Object.keys(tier1).sort()).toEqual(['macArch', 'notes', 'title'])
  })
})

// Spike 034: tier-2 shimFeatures -> gamelib_bridge.cfg `fix.` lines.
describe('steamShimFeatureCfgLines', () => {
  const HIDE = { 'wgl.hideExtensions': ['WGL_ARB_create_context*'] }

  it('turns a local profile into one fix line', () => {
    writeLocal({ shimFeatures: HIDE })
    expect(steamShimFeatureCfgLines(deps, APP_ID)).toEqual([
      'fix.wgl.hideExtensions=WGL_ARB_create_context*'
    ])
  })

  it('reads a bundled profile and joins several patterns', () => {
    writeBundled({
      shimFeatures: {
        'wgl.hideExtensions': ['WGL_ARB_create_context', 'WGL_EXT_swap*']
      }
    })
    expect(steamShimFeatureCfgLines(deps, APP_ID)).toEqual([
      'fix.wgl.hideExtensions=WGL_ARB_create_context,WGL_EXT_swap*'
    ])
  })

  it('never takes shimFeatures from the remote layer or a tier-1 file', () => {
    writeFileSync(
      join(fixesPath, `${APP_ID}-steam.profile.json`),
      JSON.stringify({ shimFeatures: HIDE })
    )
    writeIn(localFixesPath, { shimFeatures: HIDE })
    expect(steamShimFeatureCfgLines(deps, APP_ID)).toEqual([])
  })

  it.each([
    [['WGL_ARB*\nport=1']],
    [['WGL ARB']],
    [['a,b']],
    [['*']],
    [[]],
    ['WGL_ARB_create_context*'],
    [Array.from({ length: 17 }, (_, i) => `WGL_${i}`)]
  ])('drops the feature for invalid patterns %j', (patterns) => {
    writeLocal({ shimFeatures: { 'wgl.hideExtensions': patterns } })
    expect(steamShimFeatureCfgLines(deps, APP_ID)).toEqual([])
    expect(mockLogWarning).toHaveBeenCalled()
  })

  it('drops an unknown feature and keeps the known one', () => {
    writeLocal({ shimFeatures: { ...HIDE, 'gl.nope': true } })
    expect(steamShimFeatureCfgLines(deps, APP_ID)).toEqual([
      'fix.wgl.hideExtensions=WGL_ARB_create_context*'
    ])
    expect(mockLogWarning).toHaveBeenCalledWith(
      expect.stringContaining("unknown shim feature 'gl.nope'"),
      'Steam'
    )
  })
})

describe('GameMaker D3D11 runner default (quick 261028-k7l)', () => {
  const EXE = `${ROOT}/Game.exe`
  const DXVK = { key: 'CX_GRAPHICS_BACKEND', value: 'dxvk' }

  it('applies dxvk with no fixes file and no profile, logging one info line', async () => {
    mockDetectGameMaker.mockResolvedValue(MATCH)
    const result = await applySteamBridgeKnownFixes(
      DEPS,
      APP_ID,
      BRIDGE,
      ROOT,
      EXE
    )
    expect(mockDetectGameMaker).toHaveBeenCalledWith(expect.anything(), EXE)
    expect(result).not.toBe(BRIDGE)
    expect(result.enviromentOptions).toEqual([
      ...BRIDGE.enviromentOptions,
      DXVK
    ])
    expect(mockLogInfo).toHaveBeenCalledTimes(1)
    const line = String(mockLogInfo.mock.calls[0][0])
    for (const part of [
      'Steam 480',
      'CX_GRAPHICS_BACKEND=dxvk',
      'data.win',
      'd3d11.dll',
      'CheckMultisampleQualityLevels'
    ]) {
      expect(line).toContain(part)
    }
  })

  it('lets a user CX_GRAPHICS_BACKEND win and does not scan', async () => {
    mockDetectGameMaker.mockResolvedValue(MATCH)
    const user = {
      ...BRIDGE,
      enviromentOptions: [{ key: 'CX_GRAPHICS_BACKEND', value: 'd3dmetal' }]
    } as unknown as GameSettings
    const result = await applySteamBridgeKnownFixes(
      DEPS,
      APP_ID,
      user,
      ROOT,
      EXE
    )
    expect(result).toBe(user)
    expect(mockDetectGameMaker).not.toHaveBeenCalled()
  })

  it('lets a tier-1 CX_GRAPHICS_BACKEND win and does not scan', async () => {
    mockDetectGameMaker.mockResolvedValue(MATCH)
    writeFixes({ envVariables: { CX_GRAPHICS_BACKEND: 'dxmt' } })
    const result = await applySteamBridgeKnownFixes(
      DEPS,
      APP_ID,
      BRIDGE,
      ROOT,
      EXE
    )
    const backend = (result.enviromentOptions ?? []).filter(
      (e) => e.key === 'CX_GRAPHICS_BACKEND'
    )
    expect(backend).toEqual([{ key: 'CX_GRAPHICS_BACKEND', value: 'dxmt' }])
    expect(mockDetectGameMaker).not.toHaveBeenCalled()
    expect(String(mockLogInfo.mock.calls[0][0])).toContain('tier-1')
  })

  it('appends dxvk after an unrelated tier-1 var in one info line', async () => {
    mockDetectGameMaker.mockResolvedValue(MATCH)
    writeFixes({ envVariables: { OTHER: 'o' } })
    const result = await applySteamBridgeKnownFixes(
      DEPS,
      APP_ID,
      BRIDGE,
      ROOT,
      EXE
    )
    expect(result.enviromentOptions).toEqual([
      ...BRIDGE.enviromentOptions,
      { key: 'OTHER', value: 'o' },
      DXVK
    ])
    expect(mockLogInfo).toHaveBeenCalledTimes(1)
    const line = String(mockLogInfo.mock.calls[0][0])
    expect(line).toContain('OTHER=o')
    expect(line).toContain('CX_GRAPHICS_BACKEND=dxvk')
  })

  it('leaves settings unchanged when the detector does not match', async () => {
    const result = await applySteamBridgeKnownFixes(
      DEPS,
      APP_ID,
      BRIDGE,
      ROOT,
      EXE
    )
    expect(result).toBe(BRIDGE)
    expect(mockLogInfo).not.toHaveBeenCalled()
  })

  it('never calls the detector without an exePath', async () => {
    const result = await applySteamBridgeKnownFixes(DEPS, APP_ID, BRIDGE, ROOT)
    expect(result).toBe(BRIDGE)
    expect(mockDetectGameMaker).not.toHaveBeenCalled()
  })

  it('never calls the detector when the wine type is not crossover', async () => {
    const other = {
      ...BRIDGE,
      wineVersion: { type: 'wine' }
    } as unknown as GameSettings
    const result = await applySteamBridgeKnownFixes(
      DEPS,
      APP_ID,
      other,
      ROOT,
      EXE
    )
    expect(result).toBe(other)
    expect(mockDetectGameMaker).not.toHaveBeenCalled()
  })

  it('warns and continues when the detector rejects', async () => {
    mockDetectGameMaker.mockRejectedValue(new Error('boom'))
    const result = await applySteamBridgeKnownFixes(
      DEPS,
      APP_ID,
      BRIDGE,
      ROOT,
      EXE
    )
    expect(result).toBe(BRIDGE)
    expect(mockLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('boom'),
      'Steam'
    )
  })
})

describe('steamBridgeLaunchCommandParts (quick 261029-mbl)', () => {
  let root: string
  let exe: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gamelib-bridge-launch-'))
    mkdirSync(join(root, 'bin'))
    exe = join(root, 'game.exe')
    writeFileSync(exe, 'x')
    writeFileSync(join(root, 'bin', 'alt.exe'), 'x')
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(join(fixesPath, '70-steam.json'), { force: true })
  })

  it('returns just the exe with no fixes file', () => {
    expect(steamBridgeLaunchCommandParts(deps, '70', exe, root)).toEqual([exe])
  })

  it('appends launchArgs after the exe', () => {
    writeFileSync(
      join(fixesPath, '70-steam.json'),
      JSON.stringify({ launchArgs: ['-dx11'] })
    )
    expect(steamBridgeLaunchCommandParts(deps, '70', exe, root)).toEqual([
      exe,
      '-dx11'
    ])
  })

  it('swaps in a contained exeOverride', () => {
    writeFileSync(
      join(fixesPath, '70-steam.json'),
      JSON.stringify({ exeOverride: 'bin/alt.exe', launchArgs: ['-x'] })
    )
    expect(steamBridgeLaunchCommandParts(deps, '70', exe, root)).toEqual([
      join(root, 'bin', 'alt.exe'),
      '-x'
    ])
  })

  it('keeps the default exe when the override is missing or root unknown', () => {
    writeFileSync(
      join(fixesPath, '70-steam.json'),
      JSON.stringify({ exeOverride: 'bin/missing.exe', launchArgs: ['-x'] })
    )
    expect(steamBridgeLaunchCommandParts(deps, '70', exe, root)).toEqual([
      exe,
      '-x'
    ])
    writeFileSync(
      join(fixesPath, '70-steam.json'),
      JSON.stringify({ exeOverride: 'bin/alt.exe', launchArgs: ['-x'] })
    )
    expect(steamBridgeLaunchCommandParts(deps, '70', exe, undefined)).toEqual([
      exe,
      '-x'
    ])
  })
})
