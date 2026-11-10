/**
 * Quick 261110-vi4: Steam per-game Wine tools eligibility and settings resolver, driven entirely
 * through injected deps. The module imports bridgeBottle, which loads the backend config at
 * import, so the modules that pull it in are mocked for load only (nothing here relies on them).
 */
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('../bridgeBottle', () => ({
  bridgeBottleNameFor: jest.fn(),
  findBridgeInstallBottle: jest.fn(),
  getBridgeBottleSettings: jest.fn(),
  getDrmBridgeRunner: jest.fn()
}))
jest.mock('backend/engine/engineSwitch', () => ({
  readBottleEngineMarkerKind: jest.fn()
}))

import type { GameSettings } from 'common/types'
import type { EngineServices } from 'backend/engine/engineServices'
import type { NonCrossoverEngine } from 'backend/engine/engineTypes'
import {
  resolveSteamWineToolSettings,
  steamWineToolsBottle
} from '../bridgeWineTools'
import type { SteamWineToolsDeps } from '../bridgeWineTools'

const OWN = 'GameLibSteamBridge-620'
const services = {} as EngineServices
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
    nonCrossoverEngine: () => engine,
    fallbackSettings: (bottle) => settingsFor(bottle, 'wine'),
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
      nonCrossoverEngine: () => null
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
