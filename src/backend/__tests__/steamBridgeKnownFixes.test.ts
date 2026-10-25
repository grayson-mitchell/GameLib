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
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('../storeManagers/steam/bottle', () => ({
  getBottleDir: (name: string) => `/mock/Bottles/${name}`
}))

import type { GameSettings } from 'common/types'
import { bundledFixesPath, fixesPath, localFixesPath } from '../constants/paths'
import {
  applySteamBridgeKnownFixes,
  buildRegistryFixCommandParts,
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
})

afterAll(() => {
  rmSync(fixesPath, { recursive: true, force: true })
  rmSync(bundledFixesPath, { recursive: true, force: true })
  void tmpdir
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
    jest.useFakeTimers()
    try {
      writeBundled({ title: 't', registry: [{ ...WMP, views: [32] }] })
      mockRunWineCommand.mockReturnValue(new Promise(() => undefined))
      const p = applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)
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
