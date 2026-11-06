import {
  hasCapability,
  isHandOffInstall,
  isStore,
  storeCapabilities,
  type StoreCapabilities
} from '../storeCapabilities'
import type { Runner } from '../types'

const RUNNERS: Runner[] = ['legendary', 'gog', 'sideload', 'nile', 'steam']
type Flag = keyof Omit<StoreCapabilities, 'store'>

// The runner set each flag is pinned to: the legacy `runner === '...'` literal
// semantics recorded in 62-SITE-CLASSIFICATION.md. A wrong value here silently
// changes store behaviour (T-62-26).
const EXPECTED: Record<Flag, Runner[]> = {
  installManagedExternally: ['steam'],
  installHandOffToClient: ['steam'],
  launchHandedToClient: ['steam'],
  usesBottleRuntime: ['steam'],
  appNameIsSteamAppId: ['steam'],
  playtimeFromStoreMetadata: ['steam'],
  playtimeTrackedExternally: ['steam'],
  canBeDelisted: ['steam'],
  installSizeFromSteamStore: ['steam'],
  supportsDlcSelection: ['legendary', 'gog'],
  supportsCloudSaves: ['legendary', 'gog'],
  supportsModifyInstall: ['legendary', 'gog'],
  hasStoreCatalog: ['legendary', 'gog', 'nile', 'steam'],
  canAddSteamShortcut: ['legendary', 'gog', 'sideload', 'nile'],
  winePrefixToolsAvailable: ['legendary', 'gog', 'sideload', 'nile']
}

describe('62-13 storeCapabilities table', () => {
  it('has an entry for every runner whose store field is the runner', () => {
    expect(Object.keys(storeCapabilities).sort()).toEqual([...RUNNERS].sort())
    for (const r of RUNNERS) expect(storeCapabilities[r].store).toBe(r)
  })

  it('the flag set equals the expected flag set (no undeclared flags)', () => {
    for (const r of RUNNERS) {
      const flags = Object.keys(storeCapabilities[r])
        .filter((k) => k !== 'store')
        .sort()
      expect(flags).toEqual(Object.keys(EXPECTED).sort())
    }
  })

  describe.each(Object.keys(EXPECTED) as Flag[])('flag %s', (flag) => {
    it('is true for exactly the pinned runner set', () => {
      const actual = RUNNERS.filter((r) => storeCapabilities[r][flag])
      expect(actual).toEqual(RUNNERS.filter((r) => EXPECTED[flag].includes(r)))
    })
  })

  it('rejects a table row missing a flag at compile time', () => {
    const incomplete = {
      store: 'gog'
      // @ts-expect-error -- every flag is required by StoreCapabilities
    } satisfies StoreCapabilities
    expect(incomplete.store).toBe('gog')
  })
})

describe('62-13 hasCapability (T-62-27: never throws where === returned false)', () => {
  it.each([undefined, null, 'humble', 'nonsense', '', 'toString'])(
    'is false for %p',
    (runner) => {
      expect(hasCapability(runner, 'installManagedExternally')).toBe(false)
    }
  )

  it('matches the table for real runners', () => {
    expect(hasCapability('steam', 'installManagedExternally')).toBe(true)
    expect(hasCapability('gog', 'installManagedExternally')).toBe(false)
    expect(hasCapability('sideload', 'hasStoreCatalog')).toBe(false)
  })
})

describe('62-13 isStore (the one sanctioned raw comparison)', () => {
  it('compares strings and objects', () => {
    expect(isStore('steam', 'steam')).toBe(true)
    expect(isStore({ runner: 'gog' }, 'steam')).toBe(false)
    expect(isStore({ runner: 'steam' }, 'steam')).toBe(true)
    expect(isStore('humble', 'humble')).toBe(true)
  })

  it('is false for null, undefined and a missing runner', () => {
    expect(isStore(undefined, 'steam')).toBe(false)
    expect(isStore(null, 'steam')).toBe(false)
    expect(isStore({ runner: null }, 'gog')).toBe(false)
    expect(isStore({}, 'gog')).toBe(false)
  })
})

describe('62-13 isHandOffInstall (replaces runner===steam && action===install)', () => {
  it.each([
    ['steam', 'install', true],
    ['steam', 'update', false],
    ['steam', undefined, false],
    ['gog', 'install', false],
    [undefined, 'install', false],
    ['legendary', 'update', false]
  ] as const)('%s + %s -> %s', (runner, action, expected) => {
    expect(isHandOffInstall(runner, action)).toBe(expected)
  })
})
