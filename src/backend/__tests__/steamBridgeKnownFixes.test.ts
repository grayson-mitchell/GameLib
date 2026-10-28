/**
 * quick 261024-tny: applySteamBridgeKnownFixes -- the Steam bridge launch's
 * known-fixes hook. Uses the REAL readKnownFixes (fixes file written under a
 * tmp-redirected fixesPath) so the `<appId>-steam.json` name is proven end to
 * end. Winetricks, runWineCommand, the status sender and the bottle helper are
 * mocked; no child process is spawned.
 */

import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

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
jest.mock('../constants/paths', () => {
  const actual = jest.requireActual('../constants/paths')
  const path = jest.requireActual('path')
  const os = jest.requireActual('os')
  return {
    ...actual,
    bundledFixesPath: path.join(
      os.tmpdir(),
      `gamelib-bundled-fixes-test-${process.pid}-bridge`
    )
  }
})

const mockWinetricksInstall = jest.fn()
const mockRunWineCommand = jest.fn()
const mockSendGameStatusUpdate = jest.fn()
const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()
let mockBottleRoot = '/mock/Bottles'

jest.mock('backend/tools', () => ({
  Winetricks: {
    install: (...args: unknown[]) => mockWinetricksInstall(...args)
  }
}))
jest.mock('backend/launcher', () => ({
  runWineCommand: (...args: unknown[]) => mockRunWineCommand(...args)
}))
jest.mock('backend/utils', () => ({
  sendGameStatusUpdate: (...args: unknown[]) =>
    mockSendGameStatusUpdate(...args)
}))
jest.mock('backend/logger', () => ({
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
const mockResolveOverlayEnv = jest.fn()
const mockDetectGameMaker = jest.fn()
jest.mock('../storeManagers/steam/bridge/gameMakerRunner', () => ({
  detectGameMakerD3d11Runner: (...a: unknown[]) => mockDetectGameMaker(...a)
}))
jest.mock('backend/knownFixOverlays', () => ({
  ...jest.requireActual('backend/knownFixOverlays'),
  resolveKnownFixOverlayEnv: (...args: unknown[]) =>
    mockResolveOverlayEnv(...args)
}))
jest.mock('../storeManagers/steam/bottle', () => ({
  getBottleDir: (name: string) => `${mockBottleRoot}/${name}`
}))

import type { GameSettings } from 'common/types'
import { bundledFixesPath, fixesPath, localFixesPath } from '../constants/paths'
import {
  applySteamBridgeKnownFixes,
  buildRegistryFixCommandParts,
  steamShimFeatureCfgLines,
  validateRegistryFixes
} from '../storeManagers/steam/bridgeKnownFixes'

const APP_ID = '480'
const ROOT =
  '/mock/Bottles/GameLibSteamBridge-480/drive_c/steamapps/common/Game'

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
  mockWinetricksInstall.mockResolvedValue('installed')
  mockRunWineCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
  mockResolveOverlayEnv.mockResolvedValue({})
  mockDetectGameMaker.mockResolvedValue(NO_MATCH)
})

afterAll(() => {
  rmSync(fixesPath, { recursive: true, force: true })
  rmSync(bundledFixesPath, { recursive: true, force: true })
  void tmpdir
})

describe('applySteamBridgeKnownFixes overlays', () => {
  const OVERLAY = { id: 'gst-libav-1.24.13', target: 'gstreamer-plugin-path' }

  it('computes the overlay env from the tier-1 value and appends it last', async () => {
    writeFixes({ envVariables: { GST_PLUGIN_PATH: '/t1', OTHER: 'o' } })
    writeLocal({ overlays: [OVERLAY] })
    mockResolveOverlayEnv.mockResolvedValue({ GST_PLUGIN_PATH: '/t1:/ov' })

    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

    expect(mockResolveOverlayEnv).toHaveBeenCalledTimes(1)
    const [raw, opts] = mockResolveOverlayEnv.mock.calls[0]
    expect(raw).toEqual([OVERLAY])
    expect(opts.wineType).toBe('crossover')
    expect(opts.baseValue('GST_PLUGIN_PATH')).toBe('/t1')
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

  it('leaves settings untouched when a profile has no overlays', async () => {
    writeLocal({ title: 't' })
    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)
    expect(mockResolveOverlayEnv).toHaveBeenCalledWith(
      undefined,
      expect.anything()
    )
    expect(result).toBe(BRIDGE)
  })
})

describe('applySteamBridgeKnownFixes', () => {
  it('does nothing and returns the same object when there is no fixes file', async () => {
    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

    expect(result).toBe(BRIDGE)
    expect(mockWinetricksInstall).not.toHaveBeenCalled()
    expect(mockRunWineCommand).not.toHaveBeenCalled()
    expect(mockSendGameStatusUpdate).not.toHaveBeenCalled()
  })

  it('runs winetricks verbs against the bridge bottle, sending status first', async () => {
    writeFixes({ title: 't', winetricks: ['vcrun2019', 'd3dx9', '-q'] })

    await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

    expect(mockSendGameStatusUpdate).toHaveBeenCalledTimes(1)
    expect(mockSendGameStatusUpdate).toHaveBeenCalledWith({
      appName: APP_ID,
      runner: 'steam',
      status: 'winetricks'
    })
    expect(mockWinetricksInstall).toHaveBeenCalledTimes(2)
    for (const [i, verb] of ['vcrun2019', 'd3dx9'].entries()) {
      const call = mockWinetricksInstall.mock.calls[i]
      expect(call.slice(0, 4)).toEqual(['steam', APP_ID, verb, undefined])
      expect(call[4].wineCrossoverBottle).toBe('GameLibSteamBridge-480')
      expect(call[4].winePrefix).toBe('/mock/Bottles/GameLibSteamBridge-480')
    }
    expect(mockSendGameStatusUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockWinetricksInstall.mock.invocationCallOrder[0]
    )
    expect(mockLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('-q'),
      'Steam'
    )
  })

  it('runs runInPrefix entries through runWineCommand under the install root', async () => {
    writeFixes({ title: 't', runInPrefix: ['redist/vc_redist.x64.exe'] })

    await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

    expect(mockSendGameStatusUpdate).toHaveBeenCalledWith({
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

    await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

    expect(mockRunWineCommand).not.toHaveBeenCalled()
    expect(mockLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('evil.exe'),
      'Steam'
    )
  })

  it('skips runInPrefix when the install root is unknown', async () => {
    writeFixes({ title: 't', runInPrefix: ['setup.exe'] })

    await applySteamBridgeKnownFixes(APP_ID, BRIDGE, undefined)

    expect(mockRunWineCommand).not.toHaveBeenCalled()
    expect(mockLogWarning).toHaveBeenCalled()
  })

  it('returns a NEW settings object carrying the fix env after the user env', async () => {
    writeFixes({ title: 't', envVariables: { DXVK_ASYNC: '1' } })

    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

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
      [
        'rejects',
        () => mockWinetricksInstall.mockRejectedValue(new Error('x'))
      ],
      [
        'returns failed',
        () => mockWinetricksInstall.mockResolvedValue('failed')
      ],
      [
        'returns refused',
        () => mockWinetricksInstall.mockResolvedValue('refused')
      ]
    ])('Winetricks.install %s: warns, resolves, keeps env', async (_n, arm) => {
      writeFixes({
        title: 't',
        winetricks: ['vcrun2019'],
        envVariables: { DXVK_ASYNC: '1' }
      })
      arm()

      const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

      expect(mockLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('vcrun2019'),
        'Steam'
      )
      expect(result.enviromentOptions).toEqual([
        { key: 'USER', value: 'x' },
        { key: 'DXVK_ASYNC', value: '1' }
      ])
    })

    it('runWineCommand rejecting warns and still resolves with env', async () => {
      writeFixes({
        title: 't',
        runInPrefix: ['setup.exe'],
        envVariables: { A: 'b' }
      })
      mockRunWineCommand.mockRejectedValue(new Error('boom'))

      const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

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

describe('buildRegistryFixCommandParts', () => {
  const fix = {
    key: WMP_KEY,
    name: 'IsInstalled',
    type: 'REG_DWORD' as const,
    data: '1',
    views: [32 as const, 64 as const]
  }
  it('builds the exact argv for view 32', () => {
    expect(buildRegistryFixCommandParts(fix, 32)).toEqual([
      'reg',
      'add',
      WMP_KEY,
      '/v',
      'IsInstalled',
      '/t',
      'REG_DWORD',
      '/d',
      '1',
      '/reg:32',
      '/f'
    ])
  })
  it('ends /reg:64 /f for view 64', () => {
    expect(buildRegistryFixCommandParts(fix, 64).slice(-2)).toEqual([
      '/reg:64',
      '/f'
    ])
  })
})

describe('registry fixes application', () => {
  it('bundled profile without views applies 32 then 64', async () => {
    writeBundled({ title: 't', registry: [WMP] })
    await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)
    expect(mockRunWineCommand).toHaveBeenCalledTimes(2)
    for (const [i, view] of ['/reg:32', '/reg:64'].entries()) {
      const arg = mockRunWineCommand.mock.calls[i][0]
      expect(arg.commandParts).toContain(view)
      expect(arg.gameSettings).toBe(BRIDGE)
      expect(arg.wait).toBe(false)
      expect(arg.protonVerb).toBe('run')
      expect(arg.skipPrefixCheckIKnowWhatImDoing).toBe(true)
      expect(typeof arg.onSpawn).toBe('function')
    }
  })

  it('skips reg add for values already in the bottle system.reg', async () => {
    const root = join(tmpdir(), `gamelib-bridge-bottles-${process.pid}`)
    try {
      const bottle = join(root, 'GameLibSteamBridge-480')
      mkdirSync(bottle, { recursive: true })
      const k64 = String.raw`Software\\Microsoft\\Active Setup\\Installed Components\\{22d6f312-b0f6-11d0-94ab-0080c74c7e95}`
      const k32 = k64.replace(
        String.raw`Software\\`,
        String.raw`Software\\Wow6432Node\\`
      )
      const sec = (k: string) =>
        `[${k}] 1\n#time=1\n"IsInstalled"=dword:00000001\n\n`
      writeFileSync(
        join(bottle, 'system.reg'),
        'WINE REGISTRY Version 2\n\n#arch=win64\n\n' + sec(k64) + sec(k32)
      )
      mockBottleRoot = root
      writeBundled({ title: 't', registry: [WMP] })
      await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)
      expect(
        mockRunWineCommand.mock.calls.filter((c) =>
          c[0].commandParts.includes('reg')
        )
      ).toHaveLength(0)
      const infos = mockLogInfo.mock.calls.map((c) => c[0] as string)
      expect(infos.filter((m) => m.includes('already set'))).toHaveLength(2)
    } finally {
      mockBottleRoot = '/mock/Bottles'
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('views [64] applies once', async () => {
    writeBundled({ title: 't', registry: [{ ...WMP, views: [64] }] })
    await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)
    expect(mockRunWineCommand).toHaveBeenCalledTimes(1)
    expect(mockRunWineCommand.mock.calls[0][0].commandParts).toContain(
      '/reg:64'
    )
  })

  it('ignores a .profile.json that sits only in the remote directory', async () => {
    writeIn(fixesPath, { title: 't', registry: [WMP] }, '.profile.json')
    await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)
    expect(mockRunWineCommand).not.toHaveBeenCalled()
  })

  it.each([
    ['remote', () => fixesPath],
    ['bundled', () => bundledFixesPath],
    ['local', () => localFixesPath]
  ])(
    'ignores registry placed in a tier-1 .json (%s) and warns',
    async (_n, dir) => {
      writeIn(dir(), { title: 't', registry: [WMP] })
      await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)
      expect(mockRunWineCommand).not.toHaveBeenCalled()
      expect(mockLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('registry')
      )
    }
  )

  it('applies remote tier-1 envVariables and the bundled tier-2 registry in the same launch', async () => {
    writeFixes({ title: 't', envVariables: { A: '1' } })
    writeBundled({ title: 'p', registry: [WMP] })
    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)
    expect(mockRunWineCommand).toHaveBeenCalledTimes(2)
    expect(result.enviromentOptions).toEqual([
      { key: 'USER', value: 'x' },
      { key: 'A', value: '1' }
    ])
  })

  it('local overrides bundled', async () => {
    writeBundled({ title: 't', registry: [WMP] })
    writeLocal({ title: 't', registry: [{ ...WMP, value: 0 }] })
    await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)
    const parts = mockRunWineCommand.mock.calls[0][0].commandParts
    expect(parts[parts.indexOf('/d') + 1]).toBe('0')
  })

  describe('failures never reject and env still applies', () => {
    const arms: [string, () => void][] = [
      [
        'non-zero code',
        () =>
          mockRunWineCommand.mockResolvedValue({
            stdout: '',
            stderr: '',
            code: 2
          })
      ],
      [
        'undefined code',
        () => mockRunWineCommand.mockResolvedValue({ stdout: '', stderr: '' })
      ],
      ['rejection', () => mockRunWineCommand.mockRejectedValue(new Error('x'))]
    ]
    it.each(arms)('%s', async (_n, arm) => {
      writeBundled({ title: 't', registry: [WMP] })
      writeFixes({ title: 't', envVariables: { A: 'b' } })
      arm()
      const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)
      expect(mockLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('IsInstalled'),
        'Steam'
      )
      expect(result.enviromentOptions).toHaveLength(2)
    })
  })

  it('times out a never-settling call after 15s and warns', async () => {
    // The prefix .reg read is real async IO; keep setImmediate real so it can
    // settle before the 15 s timer is armed.
    jest.useFakeTimers({ doNotFake: ['setImmediate'] })
    try {
      writeBundled({ title: 't', registry: [{ ...WMP, views: [32] }] })
      mockRunWineCommand.mockReturnValue(new Promise(() => undefined))
      const p = applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setImmediate(r))
      }
      await jest.advanceTimersByTimeAsync(15_000)
      await p
      expect(mockLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('timed out'),
        'Steam'
      )
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('validateRegistryFixes', () => {
  const ok = {
    key: 'HKLM\\Software\\Ok',
    name: 'V',
    type: 'REG_SZ',
    value: 'v'
  }
  const bad: [string, unknown][] = [
    ['root HKCR', { ...ok, key: 'HKCR\\x' }],
    ['root HKU', { ...ok, key: 'HKU\\x' }],
    ['no root', { ...ok, key: 'Software\\x' }],
    ['empty path after root', { ...ok, key: 'HKLM\\' }],
    ['empty segment', { ...ok, key: 'HKLM\\A\\\\B' }],
    ['trailing backslash', { ...ok, key: 'HKLM\\A\\' }],
    ['quote in key', { ...ok, key: 'HKLM\\A"B' }],
    ['CR in key', { ...ok, key: 'HKLM\\A\rB' }],
    ['LF in name', { ...ok, name: 'a\nb' }],
    ['NUL in name', { ...ok, name: 'a\0b' }],
    ['quote in value', { ...ok, value: 'a"b' }],
    ['NUL in value', { ...ok, value: 'a\0b' }],
    ['empty name', { ...ok, name: '' }],
    ['slash name', { ...ok, name: '/v' }],
    ['REG_BINARY', { ...ok, type: 'REG_BINARY' }],
    ['dword float', { key: ok.key, name: 'V', type: 'REG_DWORD', value: 1.5 }],
    [
      'dword negative',
      { key: ok.key, name: 'V', type: 'REG_DWORD', value: -1 }
    ],
    [
      'dword too big',
      { key: ok.key, name: 'V', type: 'REG_DWORD', value: 0x100000000 }
    ],
    ['dword string', { key: ok.key, name: 'V', type: 'REG_DWORD', value: '1' }],
    ['sz number', { ...ok, value: 1 }],
    ['views empty', { ...ok, views: [] }],
    ['views 16', { ...ok, views: [16] }],
    ['views not array', { ...ok, views: 32 }],
    ['not an object', 'str']
  ]
  it.each(bad)(
    'skips %s with a warning and keeps the valid sibling',
    (_n, entry) => {
      const out = validateRegistryFixes(APP_ID, [entry, ok])
      expect(out).toHaveLength(1)
      expect(out[0].key).toBe(ok.key)
      expect(mockLogWarning).toHaveBeenCalledTimes(1)
    }
  )

  it('warns on a non-array registry', () => {
    expect(validateRegistryFixes(APP_ID, { a: 1 })).toEqual([])
    expect(mockLogWarning).toHaveBeenCalled()
  })

  it('dedupes and orders views', () => {
    const out = validateRegistryFixes(APP_ID, [{ ...ok, views: [64, 32, 64] }])
    expect(out[0].views).toEqual([32, 64])
  })

  it('stringifies REG_DWORD data and defaults to both views', () => {
    const out = validateRegistryFixes(APP_ID, [WMP])
    expect(out).toEqual([
      {
        key: WMP_KEY,
        name: 'IsInstalled',
        type: 'REG_DWORD',
        data: '1',
        views: [32, 64]
      }
    ])
  })
})

describe('bundled 284100 profile', () => {
  it('validates to one entry with both views and cites the todo', () => {
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
    const out = validateRegistryFixes('284100', parsed.registry)
    expect(out).toHaveLength(1)
    expect(out[0].views).toEqual([32, 64])
    expect(out[0].key).toContain('22d6f312-b0f6-11d0-94ab-0080c74c7e95')
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
    expect(steamShimFeatureCfgLines(APP_ID)).toEqual([
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
    expect(steamShimFeatureCfgLines(APP_ID)).toEqual([
      'fix.wgl.hideExtensions=WGL_ARB_create_context*'
    ])
  })

  it('reads a bundled profile and joins several patterns', () => {
    writeBundled({
      shimFeatures: {
        'wgl.hideExtensions': ['WGL_ARB_create_context', 'WGL_EXT_swap*']
      }
    })
    expect(steamShimFeatureCfgLines(APP_ID)).toEqual([
      'fix.wgl.hideExtensions=WGL_ARB_create_context,WGL_EXT_swap*'
    ])
  })

  it('never takes shimFeatures from the remote layer or a tier-1 file', () => {
    writeFileSync(
      join(fixesPath, `${APP_ID}-steam.profile.json`),
      JSON.stringify({ shimFeatures: HIDE })
    )
    writeIn(localFixesPath, { shimFeatures: HIDE })
    expect(steamShimFeatureCfgLines(APP_ID)).toEqual([])
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
    expect(steamShimFeatureCfgLines(APP_ID)).toEqual([])
    expect(mockLogWarning).toHaveBeenCalled()
  })

  it('drops an unknown feature and keeps the known one', () => {
    writeLocal({ shimFeatures: { ...HIDE, 'gl.nope': true } })
    expect(steamShimFeatureCfgLines(APP_ID)).toEqual([
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
    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT, EXE)
    expect(mockDetectGameMaker).toHaveBeenCalledWith(EXE)
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
    const result = await applySteamBridgeKnownFixes(APP_ID, user, ROOT, EXE)
    expect(result).toBe(user)
    expect(mockDetectGameMaker).not.toHaveBeenCalled()
  })

  it('lets a tier-1 CX_GRAPHICS_BACKEND win and does not scan', async () => {
    mockDetectGameMaker.mockResolvedValue(MATCH)
    writeFixes({ envVariables: { CX_GRAPHICS_BACKEND: 'dxmt' } })
    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT, EXE)
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
    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT, EXE)
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
    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT, EXE)
    expect(result).toBe(BRIDGE)
    expect(mockLogInfo).not.toHaveBeenCalled()
  })

  it('never calls the detector without an exePath', async () => {
    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)
    expect(result).toBe(BRIDGE)
    expect(mockDetectGameMaker).not.toHaveBeenCalled()
  })

  it('never calls the detector when the wine type is not crossover', async () => {
    const other = {
      ...BRIDGE,
      wineVersion: { type: 'wine' }
    } as unknown as GameSettings
    const result = await applySteamBridgeKnownFixes(APP_ID, other, ROOT, EXE)
    expect(result).toBe(other)
    expect(mockDetectGameMaker).not.toHaveBeenCalled()
  })

  it('warns and continues when the detector rejects', async () => {
    mockDetectGameMaker.mockRejectedValue(new Error('boom'))
    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT, EXE)
    expect(result).toBe(BRIDGE)
    expect(mockLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('boom'),
      'Steam'
    )
  })
})
