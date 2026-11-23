/**
 * quick 261024-cjq: cxbottle location resolution. graceful-fs, the mdfind
 * detector and userHome are mocked; no filesystem or process access.
 */
import { existsSync } from 'graceful-fs'
import type { WineInstallation } from 'common/types'
import {
  createCrossoverLocator,
  crossoverBinDirFromWineBin
} from '../crossoverLocation'
import type { CrossoverLocator } from '../crossoverLocation'
import { RUST_WINE_DISCOVER_CROSSOVER } from 'common/types/sidecarTransport'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'

jest.mock('graceful-fs', () => ({ existsSync: jest.fn() }))
jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

const mockedExists = existsSync as jest.Mock
// The Spotlight probe is Rust's: the locator reaches it through `discoverCrossover` over the boot's
// rustInvoke transport, scripted here.
const mockedRustInvoke = jest.fn()
const newLocator = () =>
  createCrossoverLocator({
    paths: { userHome: '/Users/test' },
    requestRustInvoke: mockedRustInvoke
  })

const SUB = 'Contents/SharedSupport/CrossOver/bin'
const sys = `/Applications/CrossOver.app/${SUB}`
const user = `/Users/test/Applications/CrossOver.app/${SUB}`
const vol = `/Volumes/Apps/CrossOver.app/${SUB}`

const only = (...dirs: string[]) => {
  let present = new Set(dirs.map((d) => `${d}/cxbottle`))
  mockedExists.mockImplementation((p: string) => present.has(p))
  return {
    clear: () => {
      present = new Set()
    }
  }
}

describe('crossoverLocation', () => {
  let locator: CrossoverLocator
  let resolveCrossoverBinDir: CrossoverLocator['resolveCrossoverBinDir']
  let resolveCrossoverBinDirAsync: CrossoverLocator['resolveCrossoverBinDirAsync']
  beforeEach(() => {
    locator = newLocator()
    ;({ resolveCrossoverBinDir, resolveCrossoverBinDirAsync } = locator)
    mockedExists.mockReset()
    mockedRustInvoke.mockReset()
  })

  test('crossoverBinDirFromWineBin accepts only the CrossOver wine path', () => {
    expect(crossoverBinDirFromWineBin(`${sys}/wine`)).toBe(sys)
    expect(
      crossoverBinDirFromWineBin('/Applications/GPTK/bin/wine64')
    ).toBeUndefined()
    expect(crossoverBinDirFromWineBin('/usr/bin/wine')).toBeUndefined()
  })

  test('finds a ~/Applications install', () => {
    only(user)
    expect(resolveCrossoverBinDir()).toBe(user)
  })

  test('selected engine wins over /Applications', () => {
    only(sys, vol)
    const wineVersion: WineInstallation = {
      bin: `${vol}/wine`,
      name: 'CrossOver',
      type: 'crossover'
    }
    expect(resolveCrossoverBinDir({ wineVersion })).toBe(vol)
  })

  test('a non-crossover engine is ignored', () => {
    only(sys)
    const wineVersion: WineInstallation = {
      bin: `${vol}/wine`,
      name: 'X',
      type: 'wine'
    }
    expect(resolveCrossoverBinDir({ wineVersion })).toBe(sys)
  })

  test('returns undefined when nothing exists', () => {
    only()
    expect(resolveCrossoverBinDir()).toBeUndefined()
  })

  test('async resolves via the Rust CrossOver discovery and memoises', async () => {
    const present = only(vol)
    mockedRustInvoke.mockResolvedValue([
      { bin: `${vol}/wine`, name: 'CX', type: 'crossover' }
    ])
    expect(
      await resolveCrossoverBinDirAsync({ runner: createScriptedRunner([]) })
    ).toBe(vol)
    expect(mockedRustInvoke).toHaveBeenCalledWith(
      RUST_WINE_DISCOVER_CROSSOVER,
      []
    )
    expect(resolveCrossoverBinDir()).toBe(vol)
    present.clear()
    expect(resolveCrossoverBinDir()).toBeUndefined()
  })

  test('a second locator probes again (the memo is per instance)', async () => {
    const present = only(vol)
    mockedRustInvoke.mockResolvedValue([
      { bin: `${vol}/wine`, name: 'CX', type: 'crossover' }
    ])
    await resolveCrossoverBinDirAsync({ runner: createScriptedRunner([]) })
    present.clear()
    const other = newLocator()
    expect(other.resolveCrossoverBinDir()).toBeUndefined()
    expect(resolveCrossoverBinDir()).toBeUndefined()
  })

  test('async never throws when the Rust discovery rejects or is empty', async () => {
    only()
    mockedRustInvoke.mockRejectedValue(new Error('mdfind boom'))
    expect(
      await resolveCrossoverBinDirAsync({ runner: createScriptedRunner([]) })
    ).toBeUndefined()
    mockedRustInvoke.mockResolvedValue([])
    expect(
      await resolveCrossoverBinDirAsync({ runner: createScriptedRunner([]) })
    ).toBeUndefined()
  })
})
