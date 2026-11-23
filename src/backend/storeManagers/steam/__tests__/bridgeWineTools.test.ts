/**
 * Quick 261110-vi4: Steam per-game Wine tools eligibility and settings resolver, driven entirely
 * through injected deps, with no jest.mock (the backend-di-ceilings ratchet forbids new ones).
 */

import type { GameSettings } from 'common/types'
import type { NonCrossoverEngine } from 'common/types/engine'
import {
  resolveSteamWineToolSettings,
  steamWineToolsBottle
} from '../bridgeWineTools'
import type {
  SteamWineToolsDeps,
  SteamWineToolsSource
} from '../bridgeWineTools'

const OWN = 'GameLibSteamBridge-620'
const services = {} as SteamWineToolsSource
const engine = { label: 'e' } as unknown as NonCrossoverEngine

const settingsFor = (bottle: string, type = 'crossover'): GameSettings =>
  ({
    wineCrossoverBottle: bottle,
    wineVersion: { type }
  }) as unknown as GameSettings

function deps(over: Partial<SteamWineToolsDeps> = {}): SteamWineToolsDeps {
  return {
    isMac: true,
    ownBottleName: (id) =>
      /^\d+$/.test(id) ? `GameLibSteamBridge-${id}` : null,
    findInstallBottle: () => OWN,
    hasLiveRunner: () => false,
    bridgeSettings: () => settingsFor(OWN),
    markerKind: () => null,
    engineId: () => 'automatic',
    nonCrossoverEngine: () => Promise.resolve(engine),
    fallbackSettings: (bottle) => settingsFor(bottle, 'wine'),
    logError: jest.fn(),
    ...over
  }
}

describe('steamWineToolsBottle', () => {
  it('returns the per-game bottle', () => {
    expect(steamWineToolsBottle('620', deps())).toBe(OWN)
  })
  it('returns null for the legacy shared bottle', () => {
    const d = deps({ findInstallBottle: () => 'GameLibSteamBridge' })
    expect(steamWineToolsBottle('620', d)).toBeNull()
  })
  it('returns null with no bridge install', () => {
    expect(
      steamWineToolsBottle('620', deps({ findInstallBottle: () => null }))
    ).toBeNull()
  })
  it('returns null for a non-numeric appId without looking up', () => {
    const find = jest.fn()
    expect(
      steamWineToolsBottle('abc', deps({ findInstallBottle: find }))
    ).toBeNull()
    expect(find).not.toHaveBeenCalled()
  })
  it('returns null off macOS without looking up', () => {
    const find = jest.fn()
    expect(
      steamWineToolsBottle(
        '620',
        deps({ isMac: false, findInstallBottle: find })
      )
    ).toBeNull()
    expect(find).not.toHaveBeenCalled()
  })
})

describe('resolveSteamWineToolSettings', () => {
  const run = (over: Partial<SteamWineToolsDeps>) =>
    resolveSteamWineToolSettings(services, '620', deps(over))

  it('refuses an ineligible title without building settings', async () => {
    const bridgeSettings = jest.fn()
    const r = await run({ findInstallBottle: () => null, bridgeSettings })
    expect(r).toEqual({ kind: 'unavailable', reason: 'not-own-bottle' })
    expect(bridgeSettings).not.toHaveBeenCalled()
  })
  it('uses the bridge settings during a live launch', async () => {
    const s = settingsFor(OWN, 'wine')
    const r = await run({ hasLiveRunner: () => true, bridgeSettings: () => s })
    expect(r).toEqual({ kind: 'engine', key: '620', settings: s })
  })
  it('uses CrossOver bridge settings when not live', async () => {
    for (const marker of [null, 'crossover'] as const) {
      const r = await run({ markerKind: () => marker })
      expect(r.kind).toBe('engine')
    }
  })
  it('reports no-engine when CrossOver is missing', async () => {
    const r = await run({ bridgeSettings: () => settingsFor(OWN, 'wine') })
    expect(r).toEqual({ kind: 'unavailable', reason: 'no-engine' })
  })
  it('uses fallback settings for a non-crossover marker', async () => {
    const fallbackSettings = jest.fn((b: string) => settingsFor(b, 'wine'))
    const r = await run({ markerKind: () => 'non-crossover', fallbackSettings })
    expect(fallbackSettings).toHaveBeenCalledWith(OWN, engine)
    expect(r.kind).toBe('engine')
  })
  it('uses fallback settings for a pinned or wine-manager engine id', async () => {
    for (const id of ['pinned:x', 'wine-manager:y']) {
      const r = await run({ engineId: () => id })
      expect(r.kind).toBe('engine')
    }
  })
  it('reports no-engine when the non-crossover engine is missing', async () => {
    const r = await run({
      markerKind: () => 'non-crossover',
      nonCrossoverEngine: () => Promise.resolve(null)
    })
    expect(r).toEqual({ kind: 'unavailable', reason: 'no-engine' })
  })
  it('never yields settings for another bottle', async () => {
    const r = await run({
      bridgeSettings: () => settingsFor('GameLibSteamBridge')
    })
    expect(r).toEqual({ kind: 'unavailable', reason: 'not-own-bottle' })
  })
})

describe('resolveSteamWineToolSettings engine lookup through Rust (87-56a)', () => {
  const REAL_ENGINE = {
    wineBin: '/t/steam-engines/p/wine',
    wineserverBin: '/t/steam-engines/p/wineserver',
    label: 'Wine-Staging 11',
    version: '11',
    dxvk: null
  }
  function withTransport(reply: () => Promise<unknown>) {
    const calls: Array<[string, unknown[]]> = []
    const source = {
      requestRustInvoke: (channel: string, args: unknown[]) => {
        calls.push([channel, args])
        return reply()
      }
    } as unknown as SteamWineToolsSource
    return { source, calls }
  }
  /** The test deps for a pinned override, minus the engine lookup, so the default (the Rust op) answers it. */
  const pinned = (
    over: Partial<SteamWineToolsDeps> = {}
  ): Partial<SteamWineToolsDeps> => {
    const { nonCrossoverEngine: _lookup, ...rest } = deps({
      engineId: () => 'pinned:wine-staging-11.20',
      ...over
    })
    return rest
  }

  it('asks the engine op for a pinned override and builds the bottle settings from the answer', async () => {
    const { source, calls } = withTransport(() => Promise.resolve(REAL_ENGINE))
    const fallbackSettings = jest.fn((b: string) => settingsFor(b, 'wine'))
    const r = await resolveSteamWineToolSettings(
      source,
      '620',
      pinned({ fallbackSettings })
    )
    expect(calls).toEqual([
      [
        'engine_non_crossover_engine',
        [{ engineId: 'pinned:wine-staging-11.20' }]
      ]
    ])
    expect(fallbackSettings).toHaveBeenCalledWith(OWN, REAL_ENGINE)
    expect(r.kind).toBe('engine')
  })

  it('reports no-engine when Rust answers null (the engine is not installed)', async () => {
    const { source } = withTransport(() => Promise.resolve(null))
    await expect(
      resolveSteamWineToolSettings(source, '620', pinned())
    ).resolves.toEqual({ kind: 'unavailable', reason: 'no-engine' })
  })

  it('rejects an answer that is not an engine or null', async () => {
    const { source } = withTransport(() => Promise.resolve({ wineBin: 1 }))
    await expect(
      resolveSteamWineToolSettings(source, '620', pinned())
    ).rejects.toThrow('engine_non_crossover_engine:unexpected-reply')
  })
})
