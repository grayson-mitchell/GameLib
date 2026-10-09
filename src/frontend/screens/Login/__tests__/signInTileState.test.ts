/**
 * Phase 49 Plan 10 (R7, D-06): every Manage Accounts tile is driven by the one
 * `common/signInState` selector, so a tile and the Library notice cannot
 * disagree about a store.
 *
 * Three groups:
 *   1. `resolveSignInTile` -- the four-state -> tile mapping (A8: `unknown`
 *      renders as Connected).
 *   2. Composition per store -- `collectSignInInputs` ->
 *      `resolveSignInStates` -> `resolveSignInTile`, with the persisted flags
 *      armed through mocked stores. This also carries the three cases migrated
 *      from the retired Steam-only tile helper's test.
 *   3. A source gate over `Login/index.tsx` (comments stripped, with a RED
 *      specimen): the frontend jest project has no jsdom, so the wiring can
 *      only be read out of the text.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  SIGN_IN_STORES,
  resolveSignInStates,
  type SignInProbeOutcomeMap,
  type SignInState,
  type SignInStore
} from 'common/signInState'
import { collectSignInInputs } from 'frontend/helpers/signInInputs'
import {
  legendaryConfigStore,
  gogConfigStore,
  nileConfigStore,
  steamConfigStore
} from 'frontend/helpers/electronStores'
import { resolveSignInTile } from '../signInTileState'

interface StoreSpy {
  get_nodefault: jest.Mock
}

jest.mock('frontend/helpers/electronStores', () => ({
  legendaryConfigStore: { get_nodefault: jest.fn() },
  gogConfigStore: { get_nodefault: jest.fn() },
  nileConfigStore: { get_nodefault: jest.fn() },
  steamConfigStore: { get_nodefault: jest.fn() }
}))

const spies: Record<'legendary' | 'gog' | 'nile' | 'steam', StoreSpy> = {
  legendary: legendaryConfigStore as unknown as StoreSpy,
  gog: gogConfigStore as unknown as StoreSpy,
  nile: nileConfigStore as unknown as StoreSpy,
  steam: steamConfigStore as unknown as StoreSpy
}

/** Arms a store spy so `get_nodefault(key)` answers from `values`. */
function arm(store: StoreSpy, values: Record<string, unknown>): void {
  store.get_nodefault.mockImplementation((key: string) => values[key])
}

beforeEach(() => {
  for (const spy of Object.values(spies)) {
    spy.get_nodefault.mockReset()
    arm(spy, {})
  }
})

describe('resolveSignInTile', () => {
  const cases: Array<
    [SignInState, { isLoggedIn: boolean; reconnect: boolean }]
  > = [
    ['connected', { isLoggedIn: true, reconnect: false }],
    // A8: an offline launch or a Keychain denial must never regress a tile.
    ['unknown', { isLoggedIn: true, reconnect: false }],
    ['expired', { isLoggedIn: false, reconnect: true }],
    ['not-connected', { isLoggedIn: false, reconnect: false }]
  ]

  it.each(cases)('%s -> %j', (state, expected) => {
    expect(resolveSignInTile(state)).toEqual(expected)
  })

  it('covers all four states', () => {
    expect(cases).toHaveLength(4)
  })
})

/** Everything signed out; each case overrides what it is about. */
type InputSource = Parameters<typeof collectSignInInputs>[0]

const signedOut: InputSource = {
  epicUsername: null,
  gogUsername: null,
  amazonUserId: null,
  humbleLoggedIn: false,
  humbleExpired: false,
  steamUsername: null
}

function tileFor(
  store: SignInStore,
  source: InputSource,
  outcomes: SignInProbeOutcomeMap = {}
) {
  const states = resolveSignInStates(
    collectSignInInputs({ ...signedOut, ...source }, outcomes)
  )
  return resolveSignInTile(states[store])
}

describe('composition: collectSignInInputs -> resolveSignInStates -> resolveSignInTile', () => {
  it('Epic: connected tuple is a connected tile', () => {
    expect(tileFor('legendary', { epicUsername: 'a' })).toEqual({
      isLoggedIn: true,
      reconnect: false
    })
  })

  it('Epic: expired tuple shows Reconnect', () => {
    arm(spies.legendary, { expired: true })
    expect(tileFor('legendary', { epicUsername: 'a' })).toEqual({
      isLoggedIn: false,
      reconnect: true
    })
  })

  it('Epic: the expired flag outranks a logged-out store (legendary deletes user.json on the same verdict)', () => {
    arm(spies.legendary, { expired: true })
    expect(tileFor('legendary', { epicUsername: null })).toEqual({
      isLoggedIn: false,
      reconnect: true
    })
  })

  it('GOG: connected tuple is a connected tile', () => {
    expect(tileFor('gog', { gogUsername: 'a' })).toEqual({
      isLoggedIn: true,
      reconnect: false
    })
  })

  it('GOG: expired tuple shows Reconnect', () => {
    arm(spies.gog, { expired: true })
    expect(tileFor('gog', { gogUsername: 'a' })).toEqual({
      isLoggedIn: false,
      reconnect: true
    })
  })

  it('Amazon: connected tuple is a connected tile', () => {
    expect(tileFor('nile', { amazonUserId: 'u' })).toEqual({
      isLoggedIn: true,
      reconnect: false
    })
  })

  it('Amazon: expired tuple shows Reconnect', () => {
    arm(spies.nile, { expired: true })
    expect(tileFor('nile', { amazonUserId: 'u' })).toEqual({
      isLoggedIn: false,
      reconnect: true
    })
  })

  it('a signed-out store is not connected and offers no Reconnect', () => {
    for (const store of SIGN_IN_STORES) {
      expect(tileFor(store, {})).toEqual({
        isLoggedIn: false,
        reconnect: false
      })
    }
  })

  it('an unproven session (no probe outcome) still renders Connected', () => {
    expect(tileFor('legendary', { epicUsername: 'a' }, {})).toEqual({
      isLoggedIn: true,
      reconnect: false
    })
    expect(
      tileFor('legendary', { epicUsername: 'a' }, { legendary: 'unknown' })
    ).toEqual({ isLoggedIn: true, reconnect: false })
  })

  // Migrated from the retired Steam-only tile helper's test.
  describe('Steam (migrated from the retired helper)', () => {
    it('is connected with a username and no missing-credential verdict', () => {
      expect(tileFor('steam', { steamUsername: 'Grayson' })).toEqual({
        isLoggedIn: true,
        reconnect: false
      })
    })

    it('is NOT connected when the credential is proven missing, despite a username, and offers Reconnect', () => {
      // The exact state observed live on 2026-08-22: identity cached and
      // correct, credential gone.
      arm(spies.steam, { credentialsMissing: true })
      expect(tileFor('steam', { steamUsername: 'Grayson' })).toEqual({
        isLoggedIn: false,
        reconnect: true
      })
    })

    it('is not connected without a username, regardless of the flag', () => {
      expect(tileFor('steam', { steamUsername: null })).toEqual({
        isLoggedIn: false,
        reconnect: false
      })
      expect(tileFor('steam', { steamUsername: '' })).toEqual({
        isLoggedIn: false,
        reconnect: false
      })
    })
  })

  describe('Humble', () => {
    it('isLoggedIn and expired shows Reconnect', () => {
      expect(
        tileFor('humble', { humbleLoggedIn: true, humbleExpired: true })
      ).toEqual({ isLoggedIn: false, reconnect: true })
    })

    it('isLoggedIn and not expired is connected', () => {
      expect(
        tileFor('humble', { humbleLoggedIn: true, humbleExpired: false })
      ).toEqual({ isLoggedIn: true, reconnect: false })
    })
  })
})

// ---------------------------------------------------------------------------
// Source gate over Login/index.tsx
// ---------------------------------------------------------------------------

const LOGIN_INDEX = join(__dirname, '..', 'index.tsx')

/** Removes `//` and block comments so a gate can never match prose. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function count(haystack: string, needle: string | RegExp): number {
  const pattern =
    typeof needle === 'string'
      ? new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      : new RegExp(needle.source, 'g')
  return (haystack.match(pattern) ?? []).length
}

// The retired helper's name, assembled so this gate's own source never spells
// it: the plan's acceptance grep for the name must find no lingering use.
const LEGACY_HELPER = ['is', 'Steam', 'Connected'].join('')

interface TileWiring {
  tileCalls: number
  reconnectKeys: number
  storeReads: number
  legacyHelper: number
  usesSelector: boolean
}

function readWiring(source: string): TileWiring {
  const code = stripComments(source)
  return {
    tileCalls: count(code, 'resolveSignInTile('),
    reconnectKeys: count(code, /gamelib:login\.(epic|gog|amazon)Reconnect/),
    storeReads: count(code, 'get_nodefault('),
    legacyHelper: count(code, LEGACY_HELPER),
    // Prettier wraps the nested call across lines, so match on the text with
    // whitespace removed (the Library notice is formatted the same way).
    usesSelector: code
      .replace(/\s+/g, '')
      .includes('resolveSignInStates(collectSignInInputs(')
  }
}

describe('Login/index.tsx renders every tile from the shared selector', () => {
  const source = readFileSync(LOGIN_INDEX, 'utf-8')

  it('resolves one tile per store (five), through the shared selector', () => {
    const wiring = readWiring(source)
    expect(wiring.usesSelector).toBe(true)
    expect(wiring.tileCalls).toBe(5)
  })

  it('carries the three new Reconnect keys, one per Epic/GOG/Amazon tile', () => {
    expect(readWiring(source).reconnectKeys).toBe(3)
  })

  it('reads no persisted flag itself and keeps no Steam-only helper', () => {
    const wiring = readWiring(source)
    expect(wiring.storeReads).toBe(0)
    expect(wiring.legacyHelper).toBe(0)
  })

  it('non-vacuity: a specimen with an inline flag read and the old helper is convicted', () => {
    const specimen = source.replace(
      /resolveSignInStates\(\s*collectSignInInputs\(/,
      `${LEGACY_HELPER}(steamConfigStore.get_nodefault('credentialsMissing')) || resolveSignInStates(collectSignInInputs(`
    )
    expect(specimen).not.toBe(source)
    const wiring = readWiring(specimen)
    expect(wiring.storeReads).toBeGreaterThan(0)
    expect(wiring.legacyHelper).toBeGreaterThan(0)
  })

  it('non-vacuity: prose naming the helper in a comment does not trip the gate', () => {
    const specimen = `// ${LEGACY_HELPER} and get_nodefault( are gone\n${source}`
    const wiring = readWiring(specimen)
    expect(wiring.storeReads).toBe(0)
    expect(wiring.legacyHelper).toBe(0)
  })
})
