import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('../enginePins', () => {
  const actual = jest.requireActual('../enginePins')
  const previous = {
    ...actual.ENGINE_PINS.current,
    id: 'wine-staging-11.10'
  }
  const pins = { current: actual.ENGINE_PINS.current, previous }
  return {
    ...actual,
    ENGINE_PINS: pins,
    pinById: (id: string) =>
      id === pins.current.id
        ? pins.current
        : id === previous.id
          ? previous
          : null
  }
})
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

import { ENGINE_PINS } from '../enginePins'
import { pinnedEnginePaths } from '../fallbackEngine'
import {
  deriveEngineFromWine,
  engineIdOf,
  isWritableEngineOverride,
  readEngineForGame,
  readStoredGameConfig,
  resolveEffectiveEngine,
  resolveGlobalEngine,
  type EngineConfigDeps
} from '../engineConfig'
import type { WineInstallation } from 'common/types'

const dir = mkdtempSync(join(tmpdir(), 'gamelib-engineconfig-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const WM_DIR = join(dir, 'wm', 'Wine-Staging-11.0')
const wmBin = join(WM_DIR, 'Contents', 'Resources', 'wine', 'bin', 'wine')
const release = (over: Record<string, unknown> = {}) => ({
  version: 'Wine-Staging-11.0',
  type: 'Wine-Staging-macOS',
  isInstalled: true,
  installDir: WM_DIR,
  ...over
})
const deps = (
  releases = [release()],
  global: Record<string, unknown> = {}
): Partial<EngineConfigDeps> => ({
  wineManagerReleases: () => releases,
  gamesConfigPath: dir,
  globalSettings: () => global
})
const wine = (o: Partial<WineInstallation>): WineInstallation =>
  ({ type: 'wine', bin: '/opt/wine/bin/wine', name: 'Wine', ...o }) as never

const currentBin = pinnedEnginePaths(ENGINE_PINS.current).wineBin
const previousBin = pinnedEnginePaths(ENGINE_PINS.previous!).wineBin

describe('deriveEngineFromWine', () => {
  it('crossover -> automatic (D-05)', () => {
    expect(
      deriveEngineFromWine(
        wine({ type: 'crossover', bin: '/x/CrossOver/bin/wine' }),
        deps()
      )
    ).toEqual({ kind: 'override', id: 'automatic', source: 'derived' })
  })
  it('a pinned build -> that pin, current and previous (D-06)', () => {
    expect(
      deriveEngineFromWine(wine({ bin: currentBin }), deps())
    ).toMatchObject({ id: `pinned:${ENGINE_PINS.current.id}` })
    expect(
      deriveEngineFromWine(wine({ bin: previousBin }), deps())
    ).toMatchObject({ id: `pinned:${ENGINE_PINS.previous!.id}` })
  })
  it('an installed Wine Manager Staging build -> wine-manager (D-06)', () => {
    expect(deriveEngineFromWine(wine({ bin: wmBin }), deps())).toMatchObject({
      id: 'wine-manager:Wine-Staging-11.0'
    })
  })
  it.each([
    ['toolkit', wine({ type: 'toolkit', name: 'Wine GPTK' })],
    ['proton', wine({ type: 'proton', name: 'Proton 9' })],
    ['custom path', wine({ name: 'Custom' })]
  ])('%s -> Legacy (D-07)', (_n, w) => {
    expect(deriveEngineFromWine(w, deps())).toEqual({
      kind: 'legacy',
      label: w.name
    })
  })
  it('a -DXMT or non-Staging Wine Manager build -> Legacy', () => {
    const dxmtDir = join(dir, 'wm', 'Wine-Staging-11.0-DXMT')
    const dxmtBin = join(
      dxmtDir,
      'Contents',
      'Resources',
      'wine',
      'bin',
      'wine'
    )
    expect(
      deriveEngineFromWine(
        wine({ bin: dxmtBin, name: 'dxmt' }),
        deps([
          release({ version: 'Wine-Staging-11.0-DXMT', installDir: dxmtDir })
        ])
      )
    ).toEqual({ kind: 'legacy', label: 'dxmt' })
    expect(
      deriveEngineFromWine(
        wine({ bin: wmBin, name: 'vanilla' }),
        deps([release({ type: 'Wine-Vanilla' })])
      )
    ).toEqual({ kind: 'legacy', label: 'vanilla' })
  })
  it('undefined wine -> automatic', () => {
    expect(deriveEngineFromWine(undefined, deps())).toMatchObject({
      id: 'automatic'
    })
  })
})

describe('resolveEffectiveEngine', () => {
  const id = `pinned:${ENGINE_PINS.current.id}`
  it('stored pin wins; legacy: and paths parse to automatic', () => {
    const o = { derive: true }
    expect(
      resolveEffectiveEngine({ engineOverride: id }, undefined, o, deps())
    ).toEqual({ kind: 'override', id, source: 'stored' })
    expect(
      resolveEffectiveEngine({ engineOverride: 'legacy:Foo' }, undefined, o)
    ).toMatchObject({ kind: 'override', id: 'automatic' })
    expect(
      resolveEffectiveEngine({ engineOverride: '/usr/bin/wine' }, undefined, o)
    ).toMatchObject({ kind: 'override', id: 'automatic' })
  })
})

describe('readStoredGameConfig', () => {
  it('rejects traversal and bad names', () => {
    for (const n of ['../x', 'a/b', 'a\\b', '', 'a\0b', '..']) {
      expect(readStoredGameConfig(n, { gamesConfigPath: dir })).toBeUndefined()
    }
  })
  it('reads entries keyed by appName', () => {
    for (const n of ['Fortnite', 'amzn1.adg.product.x']) {
      writeFileSync(
        join(dir, `${n}.json`),
        JSON.stringify({ [n]: { targetExe: n } })
      )
      expect(readStoredGameConfig(n, { gamesConfigPath: dir })).toEqual({
        targetExe: n
      })
    }
  })
})

describe('readEngineForGame', () => {
  const pin = `pinned:${ENGINE_PINS.current.id}`
  const put = (n: string, entry: unknown) =>
    writeFileSync(join(dir, `${n}.json`), JSON.stringify({ [n]: entry }))

  it('Steam reads steamEngineOverride as fallback; engineOverride wins; none -> automatic', () => {
    put('100', { steamEngineOverride: pin })
    expect(
      readEngineForGame({ runner: 'steam', appName: '100' }, deps())
    ).toMatchObject({ id: pin })
    put('101', { steamEngineOverride: pin, engineOverride: 'crossover' })
    expect(
      readEngineForGame({ runner: 'steam', appName: '101' }, deps())
    ).toMatchObject({ id: 'crossover' })
    put('102', { wineVersion: wine({ name: 'Custom' }) })
    expect(
      readEngineForGame({ runner: 'steam', appName: '102' }, deps())
    ).toMatchObject({ id: 'automatic' })
  })
  it('a non-Steam game derives from its wineVersion, else the global one', () => {
    put('G1', { wineVersion: wine({ bin: currentBin }) })
    expect(
      readEngineForGame({ runner: 'legendary', appName: 'G1' }, deps())
    ).toMatchObject({ id: pin })
    put('G2', {})
    expect(
      readEngineForGame(
        { runner: 'legendary', appName: 'G2' },
        deps([release()], { wineVersion: wine({ name: 'Custom' }) })
      )
    ).toEqual({ kind: 'legacy', label: 'Custom' })
  })
  it('CR-05: an existing config-less game does not inherit the global engine pick', () => {
    put('G4', {})
    expect(
      readEngineForGame(
        { runner: 'legendary', appName: 'G4' },
        deps([release()], {
          engineOverride: 'crossover',
          wineVersion: wine({ type: 'toolkit' as never, name: 'GPTK' })
        })
      )
    ).toMatchObject({ kind: 'legacy' })
  })
  it('CR-05: a config-less game on a CrossOver global wineVersion derives automatic', () => {
    put('G5', {})
    expect(
      readEngineForGame(
        { runner: 'legendary', appName: 'G5' },
        deps([release()], {
          engineOverride: 'crossover',
          wineVersion: wine({ type: 'crossover' as never, name: 'CrossOver' })
        })
      )
    ).toMatchObject({ id: 'automatic', source: 'derived' })
  })
  it('never writes: bytes and mtime unchanged, missing file not created', () => {
    put('G3', { wineVersion: wine({ bin: currentBin }) })
    const p = join(dir, 'G3.json')
    const before = [readFileSync(p, 'utf8'), statSync(p).mtimeMs]
    for (let i = 0; i < 3; i++) {
      readEngineForGame({ runner: 'legendary', appName: 'G3' }, deps())
    }
    expect([readFileSync(p, 'utf8'), statSync(p).mtimeMs]).toEqual(before)
    mkdirSync(dir, { recursive: true })
    readEngineForGame({ runner: 'legendary', appName: 'Missing' }, deps())
    expect(() => statSync(join(dir, 'Missing.json'))).toThrow()
  })
})

describe('resolveGlobalEngine / isWritableEngineOverride / engineIdOf', () => {
  it('uses the key, else derives (D-09)', () => {
    expect(resolveGlobalEngine({ engineOverride: 'crossover' })).toMatchObject({
      id: 'crossover'
    })
    expect(
      resolveGlobalEngine({ wineVersion: wine({ bin: wmBin }) }, deps())
    ).toMatchObject({ id: 'wine-manager:Wine-Staging-11.0' })
    expect(engineIdOf({ kind: 'legacy', label: 'X' })).toBe('legacy:X')
  })
  it('accepts only the closed grammar', () => {
    for (const v of [
      'automatic',
      'crossover',
      `pinned:${ENGINE_PINS.current.id}`,
      'wine-manager:Wine-Staging-11.0'
    ]) {
      expect(isWritableEngineOverride(v)).toBe(true)
    }
    for (const v of [
      'legacy:x',
      'pinned:nope',
      '/bin/sh',
      'wine-manager:../x',
      42,
      undefined
    ]) {
      expect(isWritableEngineOverride(v)).toBe(false)
    }
  })
})
