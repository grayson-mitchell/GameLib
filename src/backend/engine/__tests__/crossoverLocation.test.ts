/**
 * quick 261024-cjq: cxbottle location resolution. graceful-fs, the mdfind
 * detector and userHome are mocked; no filesystem or process access.
 */
import { existsSync } from 'graceful-fs'
import type { WineInstallation } from 'common/types'
import {
  crossoverBinDirFromWineBin,
  resolveCrossoverBinDir,
  resolveCrossoverBinDirAsync,
  __resetCrossoverLocationForTests
} from '../crossoverLocation'
import { getCrossover } from 'backend/utils/compatibility_layers'

jest.mock('graceful-fs', () => ({ existsSync: jest.fn() }))
jest.mock('backend/constants/paths', () => ({ userHome: '/Users/test' }))
jest.mock('backend/utils/compatibility_layers', () => ({
  getCrossover: jest.fn()
}))
jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

const mockedExists = existsSync as jest.Mock
const mockedGetCrossover = getCrossover as jest.Mock

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
  beforeEach(() => {
    __resetCrossoverLocationForTests()
    mockedExists.mockReset()
    mockedGetCrossover.mockReset()
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

  test('async resolves via getCrossover and memoises', async () => {
    const present = only(vol)
    mockedGetCrossover.mockResolvedValue(
      new Set([{ bin: `${vol}/wine`, name: 'CX', type: 'crossover' }])
    )
    expect(await resolveCrossoverBinDirAsync()).toBe(vol)
    expect(resolveCrossoverBinDir()).toBe(vol)
    present.clear()
    expect(resolveCrossoverBinDir()).toBeUndefined()
  })

  test('async never throws when getCrossover rejects or is empty', async () => {
    only()
    mockedGetCrossover.mockRejectedValue(new Error('mdfind boom'))
    expect(await resolveCrossoverBinDirAsync()).toBeUndefined()
    mockedGetCrossover.mockResolvedValue(new Set())
    expect(await resolveCrossoverBinDirAsync()).toBeUndefined()
  })
})
