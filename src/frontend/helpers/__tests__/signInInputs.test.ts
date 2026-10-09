/**
 * Phase 49 Plan 07 (D-06): `collectSignInInputs` reads all five persisted
 * verdicts at call time, and is the only renderer reader of those keys.
 *
 * `frontend/helpers/electronStores` is mocked with plain `get_nodefault` spies
 * (the real module opens a Tauri-backed store at import). The spies are
 * re-armed in `beforeEach` so no test inherits another's flag.
 */
import { resolveSignInStates } from 'common/signInState'
import { resolveLibrarySignInRows } from '../../screens/Library/librarySignInRows'
import { collectSignInInputs } from '../signInInputs'
import {
  legendaryConfigStore,
  gogConfigStore,
  nileConfigStore,
  steamConfigStore
} from 'frontend/helpers/electronStores'

interface StoreSpy {
  get_nodefault: jest.Mock
}

// The factory is hoisted above the imports, so the spies are created inside it
// and read back through the (mocked) module.
jest.mock('frontend/helpers/electronStores', () => ({
  legendaryConfigStore: { get_nodefault: jest.fn() },
  gogConfigStore: { get_nodefault: jest.fn() },
  nileConfigStore: { get_nodefault: jest.fn() },
  steamConfigStore: { get_nodefault: jest.fn() }
}))

const mockLegendaryConfigStore = legendaryConfigStore as unknown as StoreSpy
const mockGogConfigStore = gogConfigStore as unknown as StoreSpy
const mockNileConfigStore = nileConfigStore as unknown as StoreSpy
const mockSteamConfigStore = steamConfigStore as unknown as StoreSpy

/** Arms a store spy so `get_nodefault(key)` answers from `values`. */
function arm(store: StoreSpy, values: Record<string, unknown>): void {
  store.get_nodefault.mockImplementation((key: string) => values[key])
}

const signedOut = {
  epicUsername: null,
  gogUsername: null,
  amazonUserId: null,
  humbleLoggedIn: false,
  steamUsername: null
}

beforeEach(() => {
  for (const store of [
    mockLegendaryConfigStore,
    mockGogConfigStore,
    mockNileConfigStore,
    mockSteamConfigStore
  ]) {
    store.get_nodefault.mockReset()
    arm(store, {})
  }
})

describe('collectSignInInputs: the five persisted verdicts (D-06)', () => {
  it('legendaryConfigStore.expired feeds the legendary flag', () => {
    arm(mockLegendaryConfigStore, { expired: true })

    const inputs = collectSignInInputs(signedOut, {})

    expect(inputs.legendary.expiredFlag).toBe(true)
    expect(mockLegendaryConfigStore.get_nodefault).toHaveBeenCalledWith(
      'expired'
    )
  })

  it('gogConfigStore.expired feeds the gog flag', () => {
    arm(mockGogConfigStore, { expired: true })

    const inputs = collectSignInInputs(signedOut, {})

    expect(inputs.gog.expiredFlag).toBe(true)
    expect(inputs.legendary.expiredFlag).toBe(false)
  })

  it('nileConfigStore.expired feeds the nile flag', () => {
    arm(mockNileConfigStore, { expired: true })

    const inputs = collectSignInInputs(signedOut, {})

    expect(inputs.nile.expiredFlag).toBe(true)
    expect(inputs.gog.expiredFlag).toBe(false)
  })

  it('steamConfigStore.credentialsMissing feeds the steam flag', () => {
    arm(mockSteamConfigStore, { credentialsMissing: true })

    const inputs = collectSignInInputs(signedOut, {})

    expect(inputs.steam.expiredFlag).toBe(true)
  })

  it('Humble flag comes from the source, not from any store', () => {
    const inputs = collectSignInInputs(
      { ...signedOut, humbleLoggedIn: true, humbleExpired: true },
      {}
    )

    expect(inputs.humble.expiredFlag).toBe(true)
  })

  it('absent flags read false', () => {
    const inputs = collectSignInInputs(signedOut, {})

    expect(Object.values(inputs).map((input) => input.expiredFlag)).toEqual([
      false,
      false,
      false,
      false,
      false
    ])
  })

  it('only a literally truthy flag counts (a non-boolean stray value coerces, never throws)', () => {
    arm(mockGogConfigStore, { expired: undefined })
    arm(mockNileConfigStore, { expired: 0 })

    const inputs = collectSignInInputs(signedOut, {})

    expect(inputs.gog.expiredFlag).toBe(false)
    expect(inputs.nile.expiredFlag).toBe(false)
  })

  it('reads the flags at call time: no module-level cache', () => {
    arm(mockLegendaryConfigStore, { expired: false })
    expect(collectSignInInputs(signedOut, {}).legendary.expiredFlag).toBe(false)

    arm(mockLegendaryConfigStore, { expired: true })
    expect(collectSignInInputs(signedOut, {}).legendary.expiredFlag).toBe(true)

    arm(mockLegendaryConfigStore, { expired: false })
    expect(collectSignInInputs(signedOut, {}).legendary.expiredFlag).toBe(false)
  })
})

describe('collectSignInInputs: loggedIn gates and outcomes', () => {
  it('loggedIn is exactly Boolean() of each store identity', () => {
    const inputs = collectSignInInputs(
      {
        epicUsername: 'epic-user',
        gogUsername: '',
        amazonUserId: 'amzn-1',
        humbleLoggedIn: true,
        steamUsername: undefined
      },
      {}
    )

    expect(inputs.legendary.loggedIn).toBe(true)
    expect(inputs.gog.loggedIn).toBe(false)
    expect(inputs.nile.loggedIn).toBe(true)
    expect(inputs.humble.loggedIn).toBe(true)
    expect(inputs.steam.loggedIn).toBe(false)
  })

  it('outcomes pass through per store; an absent entry is undefined (pending)', () => {
    const inputs = collectSignInInputs(signedOut, {
      legendary: 'healthy',
      gog: 'expired',
      steam: 'unknown'
    })

    expect(inputs.legendary.outcome).toBe('healthy')
    expect(inputs.gog.outcome).toBe('expired')
    expect(inputs.steam.outcome).toBe('unknown')
    expect(inputs.nile.outcome).toBeUndefined()
    expect(inputs.humble.outcome).toBeUndefined()
  })
})

describe('composition (R6): row visibility is state-derived across unmount', () => {
  it('a sign-in that completed while the Library was unmounted leaves no row on return', () => {
    // Before: GOG expired -> one row.
    arm(mockGogConfigStore, { expired: true })
    const before = resolveLibrarySignInRows({
      states: resolveSignInStates(
        collectSignInInputs({ ...signedOut, gogUsername: 'gog-user' }, {})
      )
    })
    expect(before).toEqual([
      { store: 'gog', kind: 'expired', dismissible: false }
    ])

    // While unmounted: the user signs in again. The flag clears, the pass
    // publishes `healthy`. The returning Library recomputes from state alone.
    arm(mockGogConfigStore, { expired: false })
    const states = resolveSignInStates(
      collectSignInInputs(
        { ...signedOut, gogUsername: 'gog-user' },
        { gog: 'healthy' }
      )
    )

    expect(states.gog).toBe('connected')
    expect(resolveLibrarySignInRows({ states })).toEqual([])
  })
})
