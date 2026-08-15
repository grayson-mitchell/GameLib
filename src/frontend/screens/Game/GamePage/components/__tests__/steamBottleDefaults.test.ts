import { WineInstallation } from 'common/types'
import {
  DEFAULT_STEAM_BOTTLE_NAME,
  isUsablePersistedEngine,
  resolveSteamBottleEngine,
  resolveSteamBottleSeedEngine,
  resolveSubmittedBottleEngine
} from '../steamBottleDefaults'
// Imported from the REAL D-16 filter module rather than re-implemented here:
// C-03's trace turns on the interaction between the seed and that filter, and
// a hand-written stand-in for either half would stop reproducing the trace the
// moment one of them changed.
import { filterWineEngines } from 'frontend/screens/Library/components/InstallModal/WineSelector/engineFilter'

const wine = (name: string, type: WineInstallation['type']): WineInstallation =>
  ({ name, type, bin: `/bin/${name}` }) as WineInstallation

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

    expect(
      resolveSteamBottleEngine(configured, [wine('wine-9.0', 'wine')])
    ).toBe(configured)
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
    [
      wine('wine-9.0', 'wine'),
      [wine('wine-9.0', 'wine'), wine('CrossOver', 'crossover')]
    ],
    [
      undefined,
      [wine('CrossOver 26', 'crossover'), wine('CrossOver 25', 'crossover')]
    ],
    [wine('wine-9.0', 'wine'), [wine('wine-9.0', 'wine')]],
    [undefined, []]
  ])(
    "absent path is byte-identical to today's derivation (%#)",
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
    expect(
      resolveSteamBottleSeedEngine(undefined, undefined, [])
    ).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 34.13 review C-03 — the submission boundary.
//
// These specs are written against the EXACT reachable trace C-03 documents,
// not against invented inputs: a macOS host with GPTK set as the global
// engine and no CrossOver installed. `resolveSteamBottleSeedEngine` arms the
// GPTK engine (Phase-17's documented fallback), D-16's filter then empties
// the dropdown so the user can neither see nor change it, and the pre-fix
// wizard submitted it verbatim to a `cxbottle`-only provisioner.
// ---------------------------------------------------------------------------
describe('resolveSubmittedBottleEngine (34.13 review C-03)', () => {
  it('forwards a CrossOver engine unchanged — the normal path is untouched', () => {
    const crossover = wine('CrossOver 26', 'crossover')
    expect(resolveSubmittedBottleEngine(crossover)).toBe(crossover)
  })

  it.each([
    ['toolkit' as const, 'GPTK — 64-bit-only wine64, no 32-bit loader'],
    ['wine' as const, 'plain Wine — not a cxbottle engine'],
    ['proton' as const, 'Proton — not a cxbottle engine']
  ])(
    'drops a %s engine so it can never reach the cxbottle-only provisioner (%s)',
    (type, _why) => {
      expect(resolveSubmittedBottleEngine(wine('X', type))).toBeUndefined()
    }
  )

  it('passes undefined through — an unarmed wizard already meant "you pick"', () => {
    expect(resolveSubmittedBottleEngine(undefined)).toBeUndefined()
  })

  it("C-03's exact reachable trace: the GPTK engine the seed arms on a no-CrossOver host is NOT what gets submitted", () => {
    const gptk = wine('Game Porting Toolkit', 'toolkit')

    // Step 1 of the trace: nothing persisted, GPTK global, no CrossOver in
    // the detected list -> the seed arms GPTK.
    const armed = resolveSteamBottleSeedEngine(undefined, gptk, [])
    expect(armed).toBe(gptk)

    // Step 2: D-16 empties the offered list, so the user cannot correct it.
    expect(filterWineEngines([gptk], true)).toEqual([])

    // Step 3 (the fix): the submission boundary refuses it anyway.
    expect(resolveSubmittedBottleEngine(armed)).toBeUndefined()
  })

  it('a PERSISTED non-CrossOver engine is still honoured for DISPLAY (D-15) but is not submitted', () => {
    const persistedToolkit = wine('Game Porting Toolkit', 'toolkit')

    // D-15's verbatim precedence is deliberately unchanged: the persisted
    // value may be a real checkWineBeforeLaunch correction, and this fix
    // must not quietly reopen that decision.
    expect(
      resolveSteamBottleSeedEngine(persistedToolkit, undefined, [
        wine('CrossOver 26', 'crossover')
      ])
    ).toBe(persistedToolkit)

    expect(resolveSubmittedBottleEngine(persistedToolkit)).toBeUndefined()
  })
})
