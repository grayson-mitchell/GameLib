import { fsBackedSteamFiles } from 'backend/storeManagers/steam/localFiles/__tests__/fixtures/stubRustSteamFiles'
import {
  getCrossover,
  getDefaultWineBinary,
  getLinuxWineSet,
  getSystemGamePortingToolkitWine,
  getWineExecs,
  getWineLibs,
  getWineOnMac,
  getWineskinWine
} from '../compatibility_layers'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'graceful-fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { isMac } from 'backend/constants/environment'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'

import { createTestAppPaths } from 'backend/testUtils/testAppPaths'

jest.mock('../../logger')

const paths = createTestAppPaths(mkdtempSync(join(tmpdir(), 'cl-paths-')))

// The macOS discovery functions return early off-darwin, so their cases run on macOS hosts only.
const macDescribe = isMac ? describe : describe.skip

const MDFIND_WINE_ARGV = ['kMDItemCFBundleIdentifier', '=', '*.wine']
const MDFIND_CX_ARGV = [
  'kMDItemCFBundleIdentifier',
  '=',
  'com.codeweavers.CrossOver'
]

describe('getDefaultWineBinary', () => {
  const realPath = process.env['PATH']
  afterEach(() => {
    process.env['PATH'] = realPath
  })

  test('is spawn-free and reports not found with an empty PATH', () => {
    process.env['PATH'] = ''
    expect(getDefaultWineBinary()).toEqual({
      bin: '',
      name: 'Default Wine - Not Found',
      type: 'wine'
    })
  })

  test('finds wine on PATH and names it by its binary name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wine-path-'))
    const bin = join(dir, 'wine')
    writeFileSync(bin, '#!/bin/sh\n')
    chmodSync(bin, 0o755)
    process.env['PATH'] = dir
    const result = getDefaultWineBinary()
    expect(result.bin).toBe(bin)
    expect(result.name).toBe('wine')
    expect(result.type).toBe('wine')
  })
})

describe('getLinuxWineSet default wine naming', () => {
  const realPath = process.env['PATH']
  afterEach(() => {
    process.env['PATH'] = realPath
  })

  const withFakeWine = () => {
    const dir = mkdtempSync(join(tmpdir(), 'wine-path-'))
    const bin = join(dir, 'wine')
    writeFileSync(bin, '#!/bin/sh\n')
    chmodSync(bin, 0o755)
    process.env['PATH'] = dir
    return bin
  }
  const defaultNames = async (
    runner: ReturnType<typeof createScriptedRunner>
  ) =>
    [
      ...(await getLinuxWineSet(
        {
          requestRustInvoke: fsBackedSteamFiles().requestRustInvoke,
          runner,
          paths,
          config: createTestGlobalConfig({
            defaultSteamPath: '/nonexistent/steam',
            showValveProton: false
          })
        },
        false
      ))
    ]
      .filter((w) => w.type === 'wine' && !w.bin.includes('/tools/'))
      .map((w) => w.name)

  test('uses the first stdout line of wine --version', async () => {
    const bin = withFakeWine()
    const runner = createScriptedRunner([
      {
        cmd: bin,
        argv: ['--version'],
        result: { stdout: 'wine-6.0 (Staging)\n' }
      }
    ])
    expect(await defaultNames(runner)).toContain('wine-6.0 (Staging)')
    expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 5_000 })
  })

  test.each([
    ['code 1', { code: 1 }],
    ['timedOut', { timedOut: true, code: null }]
  ])('falls back to the binary name on %s', async (_label, result) => {
    const bin = withFakeWine()
    const runner = createScriptedRunner([
      { cmd: bin, argv: ['--version'], result }
    ])
    expect(await defaultNames(runner)).toContain('wine')
  })

  test('falls back to the binary name on ENOENT', async () => {
    const bin = withFakeWine()
    const runner = createScriptedRunner([
      { cmd: bin, argv: ['--version'], error: { code: 'ENOENT' } }
    ])
    expect(await defaultNames(runner)).toContain('wine')
  })
})

macDescribe('getWineOnMac', () => {
  test('mdfind uses the three-word split argv', async () => {
    const runner = createScriptedRunner([
      { cmd: 'mdfind', argv: MDFIND_WINE_ARGV, result: { stdout: '\n' } }
    ])
    await getWineOnMac({ runner, paths })
    expect(runner.calls[0]).toMatchObject({
      cmd: 'mdfind',
      argv: MDFIND_WINE_ARGV,
      opts: { timeoutMs: 10_000 }
    })
  })

  test.each([
    ['code 1', { code: 1 }],
    ['timedOut', { timedOut: true, code: null }]
  ])('mdfind %s does not throw', async (_label, result) => {
    const runner = createScriptedRunner([
      { cmd: 'mdfind', argv: MDFIND_WINE_ARGV, result }
    ])
    await expect(getWineOnMac({ runner, paths })).resolves.toBeInstanceOf(Set)
  })

  test('mdfind ENOENT does not throw', async () => {
    const runner = createScriptedRunner([
      { cmd: 'mdfind', argv: MDFIND_WINE_ARGV, error: { code: 'ENOENT' } }
    ])
    await expect(getWineOnMac({ runner, paths })).resolves.toBeInstanceOf(Set)
  })
})

macDescribe('getCrossover', () => {
  test('mdfind uses the three-word split argv', async () => {
    const runner = createScriptedRunner([
      { cmd: 'mdfind', argv: MDFIND_CX_ARGV, result: { stdout: '' } }
    ])
    expect((await getCrossover({ runner })).size).toBe(0)
    expect(runner.calls[0]).toMatchObject({
      argv: MDFIND_CX_ARGV,
      opts: { timeoutMs: 10_000 }
    })
  })

  test.each([
    ['code 1', { code: 1 }],
    ['timedOut', { timedOut: true, code: null }]
  ])('mdfind %s yields an empty set', async (_label, result) => {
    const runner = createScriptedRunner([
      { cmd: 'mdfind', argv: MDFIND_CX_ARGV, result }
    ])
    expect((await getCrossover({ runner })).size).toBe(0)
  })

  test('mdfind ENOENT yields an empty set', async () => {
    const runner = createScriptedRunner([
      { cmd: 'mdfind', argv: MDFIND_CX_ARGV, error: { code: 'ENOENT' } }
    ])
    expect((await getCrossover({ runner })).size).toBe(0)
  })
})

macDescribe('getSystemGamePortingToolkitWine', () => {
  const gptkBin = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "it's gptk-"))
    const bin = join(dir, 'game-porting-toolkit', 'bin', 'wine64')
    mkdirSync(dirname(bin), { recursive: true })
    writeFileSync(bin, '')
    return bin
  }

  test('mdfind wine64 then wine64 --version with the path as the command (single quote safe)', async () => {
    const bin = gptkBin()
    expect(bin).toContain("'")
    const runner = createScriptedRunner([
      { cmd: 'mdfind', argv: ['wine64'], result: { stdout: `${bin}\n` } },
      { cmd: bin, argv: ['--version'], result: { stdout: 'wine-7.7\n' } }
    ])
    const set = await getSystemGamePortingToolkitWine({ runner })
    expect([...set][0]?.name).toBe('GPTK System (DX11/DX12 Only) - wine-7.7')
    expect(runner.calls[1]?.opts).toMatchObject({ timeoutMs: 5_000 })
    runner.expectAllConsumed()
  })

  test.each([
    ['code 1', { code: 1 }],
    ['timedOut', { timedOut: true, code: null }]
  ])('--version %s skips the install', async (_label, result) => {
    const bin = gptkBin()
    const runner = createScriptedRunner([
      { cmd: 'mdfind', argv: ['wine64'], result: { stdout: `${bin}\n` } },
      { cmd: bin, argv: ['--version'], result }
    ])
    expect((await getSystemGamePortingToolkitWine({ runner })).size).toBe(0)
  })

  test('--version ENOENT skips the install', async () => {
    const bin = gptkBin()
    const runner = createScriptedRunner([
      { cmd: 'mdfind', argv: ['wine64'], result: { stdout: `${bin}\n` } },
      { cmd: bin, argv: ['--version'], error: { code: 'ENOENT' } }
    ])
    expect((await getSystemGamePortingToolkitWine({ runner })).size).toBe(0)
  })

  test.each([
    ['code 1', { code: 1 }],
    ['timedOut', { timedOut: true, code: null }]
  ])('mdfind %s finds nothing', async (_label, result) => {
    const runner = createScriptedRunner([
      { cmd: 'mdfind', argv: ['wine64'], result }
    ])
    expect((await getSystemGamePortingToolkitWine({ runner })).size).toBe(0)
  })

  test('mdfind ENOENT finds nothing', async () => {
    const runner = createScriptedRunner([
      { cmd: 'mdfind', argv: ['wine64'], error: { code: 'ENOENT' } }
    ])
    expect((await getSystemGamePortingToolkitWine({ runner })).size).toBe(0)
  })
})

macDescribe('getWineskinWine', () => {
  test('returns an empty set when no Wineskin apps exist (no spawn)', async () => {
    const runner = createScriptedRunner([])
    await getWineskinWine({ runner, paths })
    expect(runner.calls).toHaveLength(0)
  })
})

describe('getWineLibs', () => {
  it('should return empty strings if lib and lib32 do not exist', () => {
    const wineBin = '/path/to/wine'
    const { lib, lib32 } = getWineLibs(wineBin)
    expect(lib).toBe('')
    expect(lib32).toBe('')
  })

  it('should return the path to lib32 if it exists', () => {
    const wineBin = join(tmpdir(), 'wine_test')
    const wineDir = join(wineBin, '..')
    const lib32Path = join(wineDir, '../lib')
    mkdirSync(lib32Path, { recursive: true })
    const { lib32 } = getWineLibs(wineBin)
    expect(lib32).toBe(lib32Path)
  })

  it('should return the path to lib if it exists', () => {
    const wineBin = join(tmpdir(), 'wine_test')
    const wineDir = join(wineBin, '..')
    const libPath = join(wineDir, '../lib64')
    mkdirSync(libPath, { recursive: true })
    const { lib } = getWineLibs(wineBin)
    expect(lib).toBe(libPath)
  })

  it('should return the paths to lib and lib32 if they both exist', () => {
    const wineBin = join(tmpdir(), 'wine_test')
    const wineDir = join(wineBin, '..')
    const libPath = join(wineDir, '../lib64')
    const lib32Path = join(wineDir, '../lib')
    mkdirSync(libPath, { recursive: true })
    mkdirSync(lib32Path, { recursive: true })
    const { lib, lib32 } = getWineLibs(wineBin)
    expect(lib).toBe(libPath)
    expect(lib32).toBe(lib32Path)
  })
})

describe('getWineExes', () => {
  describe('getWineExecs', () => {
    it('should return the path to wineserver if it exists', () => {
      const wineBin = join(tmpdir(), 'wine_test')
      const wineDir = dirname(wineBin)
      const wineServerPath = join(wineDir, 'wineserver')
      mkdirSync(wineServerPath, { recursive: true })
      const execs = getWineExecs(wineBin)
      expect(execs.wineserver).toBe(wineServerPath)
    })

    it('should return an empty string if wineserver does not exist', () => {
      const wineBin = '/path/to/wine'
      const execs = getWineExecs(wineBin)
      expect(execs.wineserver).toBe('')
    })
  })
})
