/**
 * Behavioural gate for `refresh()`'s cache guards (moved from the GlobalState
 * class into libraryState.ts in 69-17; formerly a source-text gate).
 *
 * WHAT IT PINS
 *
 * Each runner block in `refresh()` asks "is the CACHE empty, and must I
 * therefore fetch the library?". All of them used to ALSO test the length of
 * the in-memory array and refetch when that was empty even though the cache
 * was full. A fresh login empties the array before triggering the refresh, so
 * the guard then went to the network for data the cache already held.
 * Measured on the live GOG login: a full second library fetch, ~10 seconds
 * (debug/resolved/gog-login-ui-never-updates.md).
 *
 * Behaviour asserted: refresh never calls `window.api.refreshLibrary(runner)`
 * for a runner whose cache is non-empty - even when the in-memory array is
 * empty - and does call it for a runner whose cache is empty.
 *
 * Self-tested: a variant of the guard that re-adds the in-memory-length clause
 * is CONVICTED by the same assertions (anti-vacuity).
 */
import '../../testUtils/tauriWindow'
import type { GameInfo } from 'common/types'
import { resetAllStores } from '../storeKit'
import useLibraryState from '../libraryState'
import useAuthState from '../authState'

const mirror: Record<string, unknown> = {}
let fetched: string[] = []

const game = (name: string, runner: GameInfo['runner']) =>
  ({ app_name: name, runner, title: name }) as GameInfo

beforeEach(() => {
  for (const k of Object.keys(mirror)) delete mirror[k]
  fetched = []
  ;(window as unknown as { api: unknown }).api = {
    storeNew: () => undefined,
    storeHas: (store: string, key: string) => `${store}:${key}` in mirror,
    storeGet: (store: string, key: string, dflt?: unknown) => {
      if (key.startsWith('__timestamp.')) return '2026-01-01T00:00:00Z'
      return `${store}:${key}` in mirror ? mirror[`${store}:${key}`] : dflt
    },
    storeSet: () => undefined,
    logInfo: () => undefined,
    logError: () => undefined,
    refreshLibrary: async (runner: string) => {
      fetched.push(runner)
    },
    checkGameUpdates: async () => []
  }
  useLibraryState.setState({ gameOverrides: {} })
  useAuthState.setState({
    epicUsername: null,
    gogUsername: 'g',
    amazonUserId: 'a'
  })
})

afterEach(() => {
  resetAllStores()
})

type Refresh = () => Promise<void>

/** The contract; returns the list of violated rules (empty = conforming). */
async function cacheGuardViolations(refresh: Refresh): Promise<string[]> {
  const violations: string[] = []

  // Non-empty caches with EMPTY in-memory arrays (the post-login shape).
  mirror['gog_library:games'] = [game('g', 'gog')]
  mirror['nile_library:library'] = [game('a', 'nile')]
  useLibraryState.setState({ gogLibrary: [], amazonLibrary: [] })
  await refresh()
  if (fetched.length) {
    violations.push(`fetched ${fetched.join(',')} despite a full cache`)
  }

  // Empty caches are still fetched: the guard is not simply deleted.
  fetched = []
  delete mirror['gog_library:games']
  delete mirror['nile_library:library']
  await refresh()
  if (fetched.join() !== 'gog,nile') {
    violations.push(`did not fetch empty caches (fetched: ${fetched.join()})`)
  }
  return violations
}

describe('libraryState.refresh() cache guards', () => {
  it('guards on the CACHE only and still refetches when the cache IS empty', async () => {
    await expect(
      cacheGuardViolations(() => useLibraryState.getState().refresh())
    ).resolves.toEqual([])
  })

  describe('self-test (anti-vacuity)', () => {
    it('convicts a guard that re-adds the in-memory-length clause', async () => {
      // Regressed shape: refetch whenever the in-memory array is empty.
      const regressed: Refresh = async () => {
        const s = useLibraryState.getState()
        if (!s.gogLibrary.length) await window.api.refreshLibrary('gog')
        if (!s.amazonLibrary.length) await window.api.refreshLibrary('nile')
        await s.refresh()
      }
      const violations = await cacheGuardViolations(regressed)
      expect(violations[0]).toContain('despite a full cache')
    })

    it('convicts a guard that was simply deleted (never fetches)', async () => {
      const neverFetches: Refresh = async () => undefined
      const violations = await cacheGuardViolations(neverFetches)
      expect(violations).toHaveLength(1)
      expect(violations[0]).toContain('did not fetch empty caches')
    })
  })

  describe('applyGamePush legendary branch (quick 261029-t39)', () => {
    it('pushes Epic library entries live', () => {
      useLibraryState.getState().applyGamePush(game('e', 'legendary'))
      useLibraryState.getState().applyGamePush(game('e', 'legendary'))
      expect(useLibraryState.getState().epicLibrary).toHaveLength(1)
    })

    it('negative control: a push for another runner does not land in the Epic array', () => {
      useLibraryState.getState().applyGamePush(game('a', 'nile'))
      expect(useLibraryState.getState().epicLibrary).toEqual([])
    })
  })
})
