import { WineInstallation } from 'common/types'
import {
  DEFAULT_STEAM_BOTTLE_NAME,
  resolveSteamBottleEngine
} from '../steamBottleDefaults'

const wine = (name: string, type: WineInstallation['type']): WineInstallation =>
  ({ name, type, bin: `/bin/${name}` } as WineInstallation)

describe('DEFAULT_STEAM_BOTTLE_NAME', () => {
  it('is the dedicated Steam bottle, not the shared GOG/Epic bottle name', () => {
    // Must match the backend constant
    // (src/backend/storeManagers/steam/constants.ts). Guards the 17-06 UAT bug
    // where the shared bottle name would have been used instead.
    expect(DEFAULT_STEAM_BOTTLE_NAME).toBe('GameLibSteam')
  })
})

describe('resolveSteamBottleEngine', () => {
  it('prefers a CrossOver engine even when the configured engine is plain Wine', () => {
    const configured = wine('wine-9.0', 'wine')
    const list = [wine('wine-9.0', 'wine'), wine('CrossOver', 'crossover')]

    expect(resolveSteamBottleEngine(configured, list)).toEqual(
      wine('CrossOver', 'crossover')
    )
  })

  it('returns the first CrossOver engine when several exist', () => {
    const list = [
      wine('CrossOver 26', 'crossover'),
      wine('CrossOver 25', 'crossover')
    ]

    expect(resolveSteamBottleEngine(undefined, list)?.name).toBe('CrossOver 26')
  })

  it('falls back to the configured engine when no CrossOver engine is detected', () => {
    const configured = wine('wine-9.0', 'wine')

    expect(resolveSteamBottleEngine(configured, [wine('wine-9.0', 'wine')])).toBe(
      configured
    )
  })

  it('returns undefined when nothing is configured and no CrossOver exists', () => {
    expect(resolveSteamBottleEngine(undefined, [])).toBeUndefined()
  })
})
