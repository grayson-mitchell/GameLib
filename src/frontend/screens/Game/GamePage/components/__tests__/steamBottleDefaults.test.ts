import { WineInstallation } from 'common/types'
import {
  DEFAULT_STEAM_BOTTLE_NAME,
  isUsablePersistedEngine,
  resolveSteamBottleEngine,
  resolveSteamBottleSeedEngine
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

describe('isUsablePersistedEngine', () => {
  it('accepts a structurally valid engine', () => {
    expect(isUsablePersistedEngine(wine('CrossOver', 'crossover'))).toBe(true)
  })

  it('treats an absent value as nothing-persisted', () => {
    expect(isUsablePersistedEngine(undefined)).toBe(false)
    expect(isUsablePersistedEngine(null)).toBe(false)
  })

  it.each([
    ['a bare string', 'crossover'],
    ['a number', 42],
    ['an empty object', {}],
    ['an empty bin', { bin: '', name: 'X', type: 'crossover' }],
    ['an empty name', { bin: '/x', name: '', type: 'crossover' }],
    ['an unrecognised type', { bin: '/x', name: 'X', type: 'evil' }]
  ])('rejects structurally invalid store contents: %s', (_label, candidate) => {
    expect(isUsablePersistedEngine(candidate)).toBe(false)
  })

  it('Deferred-idea guard: a toolkit (GPTK) engine is ACCEPTED', () => {
    // D-16 is frontend-filter only; the folded GPTK todo's provisionBottle-
    // rejection and resolveSteamBottleEngine-override halves remain open.
    // This predicate must not quietly close either half.
    expect(isUsablePersistedEngine(wine('GPTK', 'toolkit'))).toBe(true)
  })
})

describe('resolveSteamBottleSeedEngine (D-15)', () => {
  it('D-15 DISCRIMINATOR: a persisted engine beats a detected CrossOver engine', () => {
    const persisted = wine('CrossOver 24', 'crossover')
    const list = [wine('CrossOver 26', 'crossover'), wine('wine-9.0', 'wine')]
    const configured = wine('wine-9.0', 'wine')

    const result = resolveSteamBottleSeedEngine(persisted, configured, list)

    expect(result).toBe(persisted)
    expect(result?.name).toBe('CrossOver 24')
    expect(result?.name).not.toBe('CrossOver 26')
  })

  it('D-15: a persisted non-CrossOver engine is still returned verbatim', () => {
    const persisted = wine('GPTK', 'toolkit')
    const list = [wine('CrossOver 26', 'crossover')]

    expect(resolveSteamBottleSeedEngine(persisted, undefined, list)).toBe(
      persisted
    )
  })

  it('D-15 DISCRIMINATOR: absent means derived, not defaulted', () => {
    const configured = wine('wine-9.0', 'wine')
    const list = [wine('CrossOver 26', 'crossover')]

    expect(
      resolveSteamBottleSeedEngine(undefined, configured, list)?.name
    ).toBe('CrossOver 26')
  })

  it.each([
    [wine('wine-9.0', 'wine'), [wine('wine-9.0', 'wine'), wine('CrossOver', 'crossover')]],
    [undefined, [wine('CrossOver 26', 'crossover'), wine('CrossOver 25', 'crossover')]],
    [wine('wine-9.0', 'wine'), [wine('wine-9.0', 'wine')]],
    [undefined, []]
  ])(
    'absent path is byte-identical to today\'s derivation (%#)',
    (configured, list) => {
      expect(resolveSteamBottleSeedEngine(undefined, configured, list)).toEqual(
        resolveSteamBottleEngine(configured, list)
      )
    }
  )

  it('structurally invalid persisted contents fall back to derivation', () => {
    const list = [wine('CrossOver 26', 'crossover')]

    expect(
      resolveSteamBottleSeedEngine(
        { bin: '/x', name: 'X', type: 'evil' },
        undefined,
        list
      )?.name
    ).toBe('CrossOver 26')
  })

  it('returns undefined when nothing is persisted, nothing configured and no CrossOver exists', () => {
    expect(resolveSteamBottleSeedEngine(undefined, undefined, [])).toBeUndefined()
  })
})
