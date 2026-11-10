/**
 * Behavioural gate for quick task 260819-r4r ("cache Steam library on
 * startup"), rewritten from a GlobalState.tsx source-text gate when the
 * library data moved into libraryState.ts (69-17).
 *
 * What regressed: the Steam library cache (`store_cache/steam_library.json`,
 * key `games`) is written by `SteamLibraryManager.refresh()` and has the same
 * `CacheStore` shape GOG/Epic/Amazon use, but the renderer had NO WAY to read
 * it, so Steam was the only runner absent from the synchronous pre-mount boot
 * snapshot and its library stayed empty until the async `pushGameToLibrary`
 * stream refilled it.
 *
 * What this gate proves, against the real `readInitialLibrary()`:
 *   Test 1 - the Steam array is hydrated from the `steam_library` mirror at
 *            boot, with the current overrides applied.
 *   Test 2 - SELF-TEST (anti-vacuity): the same assertions CONVICT a hydrator
 *            that seeds `[]` (the old regressed shape) and ACCEPT the real one.
 *   Test 3 - the Steam read is PLAIN: no filtering, and no merge of the GOG
 *            installed-games store (Steam has none; install state already
 *            lives on the cached `GameInfo.install`).
 *   Test 4 - anti-drift: `steam_library` is in the renderer's two mirrored
 *            registrations (`BOOT_SET_STORES`, `RECOGNIZED_CACHE_STORE_NAMES`).
 *            The sidecar's module-local `CACHE_BACKED_STORE_NAMES` copy is no
 *            longer text-checked here (that needed readFileSync); it is
 *            exercised by `sidecar/__tests__/storeLayer.test.ts`.
 *   Test 5 - no credentials cross the boundary: `steam_library` is NOT in
 *            `STORE_ALLOWLIST`, and hydrating the library never reads
 *            `steamConfigStore` (session/refresh-token state).
 */
import '../../testUtils/tauriWindow'
import type { GameInfo } from 'common/types'
import {
  BOOT_SET_STORES,
  RECOGNIZED_CACHE_STORE_NAMES,
  STORE_ALLOWLIST
} from 'common/types/storePolicy'
import { resetAllStores } from '../storeKit'
import useLibraryState, { readInitialLibrary } from '../libraryState'

const mirror: Record<string, unknown> = {}
let storesRead: string[] = []

const steamGame = (name: string, extra: Partial<GameInfo> = {}) =>
  ({ app_name: name, runner: 'steam', title: name, ...extra }) as GameInfo

type Hydrator = () => { steamLibrary: GameInfo[] }

/** The contract; returns the list of violated rules (empty = conforming). */
function hydrationViolations(hydrate: Hydrator): string[] {
  const violations: string[] = []
  mirror['steam_library:games'] = [steamGame('a'), steamGame('b')]
  const lib = hydrate().steamLibrary
  if (lib.map((g) => g.app_name).join() !== 'a,b') {
    violations.push('steam array not hydrated from the steam_library mirror')
  }
  return violations
}

beforeEach(() => {
  for (const k of Object.keys(mirror)) delete mirror[k]
  storesRead = []
  ;(window as unknown as { api: unknown }).api = {
    storeNew: () => undefined,
    storeHas: (store: string, key: string) => `${store}:${key}` in mirror,
    storeGet: (store: string, key: string, dflt?: unknown) => {
      storesRead.push(store)
      // CacheStore reads a `__timestamp.<key>` companion before the value
      if (key.startsWith('__timestamp.')) return '2026-01-01T00:00:00Z'
      return `${store}:${key}` in mirror ? mirror[`${store}:${key}`] : dflt
    },
    storeSet: () => undefined,
    logError: () => undefined
  }
  ;(window as unknown as { localStorage: unknown }).localStorage = {
    getItem: () => null,
    setItem: () => undefined
  }
  useLibraryState.setState({ gameOverrides: {} })
})

afterEach(() => {
  resetAllStores()
})

describe('libraryState steam library - seeded synchronously from the persisted cache (quick-260819-r4r)', () => {
  it('Test 1: readInitialLibrary hydrates steamLibrary from the steam_library mirror with overrides applied', () => {
    mirror['steam_library:games'] = [steamGame('a'), steamGame('b')]
    useLibraryState.setState({
      gameOverrides: { a: { wineVersion: 'w' } as never }
    })
    const { steamLibrary } = readInitialLibrary()
    expect(steamLibrary.map((g) => g.app_name)).toEqual(['a', 'b'])
    expect(steamLibrary[0]?.overrides).toEqual({ wineVersion: 'w' })
    expect(hydrationViolations(readInitialLibrary)).toEqual([])
  })

  it('Test 2 (SELF-TEST / anti-vacuity, REQUIRED): the assertions CONVICT the old regressed shape (steamLibrary: [])', () => {
    expect(hydrationViolations(() => ({ steamLibrary: [] }))).toEqual([
      'steam array not hydrated from the steam_library mirror'
    ])
  })

  it('Test 2b (near-miss): a hydrator that drops one game is also convicted', () => {
    const dropsOne: Hydrator = () => ({
      steamLibrary: readInitialLibrary().steamLibrary.slice(0, 1)
    })
    expect(hydrationViolations(dropsOne)).toHaveLength(1)
  })

  it('Test 3: the Steam read is plain - no filtering and no installed-games merge', () => {
    const installed = { appName: 'a', platform: 'windows' }
    mirror['steam_library:games'] = [
      steamGame('a', { install: { platform: 'x' } as never }),
      steamGame('b', { is_installed: false })
    ]
    // A GOG installed-games entry with the same app name must NOT leak into Steam.
    mirror['gogInstalledGamesStore:installed'] = [installed]
    const { steamLibrary } = readInitialLibrary()
    expect(steamLibrary).toHaveLength(2)
    expect(steamLibrary[0]?.install).toEqual({ platform: 'x' })
    expect(steamLibrary[0]?.is_installed).toBeUndefined()
    expect(steamLibrary[1]?.is_installed).toBe(false)
  })

  it('Test 4: steam_library is registered in the mirrored lists (anti-drift)', () => {
    expect(BOOT_SET_STORES).toContain('steam_library')
    expect(RECOGNIZED_CACHE_STORE_NAMES).toContain('steam_library')
  })

  it('Test 5: steam_library carries no credential surface - absent from STORE_ALLOWLIST, and hydration never reads steamConfigStore', () => {
    expect(Object.keys(STORE_ALLOWLIST)).not.toContain('steam_library')
    mirror['steam_library:games'] = [steamGame('a')]
    readInitialLibrary()
    expect(storesRead).toContain('steam_library')
    expect(storesRead).not.toContain('steamConfigStore')
  })
})
