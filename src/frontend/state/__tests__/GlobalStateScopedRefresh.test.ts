/**
 * Behavioural gates for the fix to debug/login-logout-wipes-library, rewritten
 * from GlobalState.tsx / authState.ts source-text gates when `refresh()` moved
 * into libraryState.ts (69-17).
 *
 * What this proves, split into the items the fix's verification bar names:
 *
 *   (a) None of the four logout actions (epicLogout/gogLogout/amazonLogout/
 *       steamLogout) reload the window - the mechanism that unmounted the
 *       ENTIRE React tree (wiping every OTHER platform's loaded games) when a
 *       SINGLE platform logged out - and each clears only its own runner's
 *       library.
 *
 *   (b) `refreshLibrary()`'s scoping of the two GLOBAL flags is class-owned
 *       until 69-18 and is still gated as source text in
 *       `GlobalStateRefreshLibraryOrigin.test.ts`.
 *
 *   (c) `libraryState.refresh()` honours its `library` parameter all the way
 *       through to its final write: a scoped call only ever writes that one
 *       runner's array (and its own `refreshingByRunner` entry), never the
 *       other runners' arrays or the two global flags.
 *
 * Each contract is a violations function; the self-tests run it against
 * regressed variants (a reload-ing logout, a scoped refresh that wipes
 * everything) which the same assertions must convict (anti-vacuity).
 */
import '../../testUtils/tauriWindow'
import type { GameInfo, Runner } from 'common/types'
import { resetAllStores } from '../storeKit'
import useLibraryState from '../libraryState'
import useAuthState from '../authState'

const mirror: Record<string, unknown> = {}
let reloads = 0

const game = (name: string, runner: GameInfo['runner']) =>
  ({ app_name: name, runner, title: name }) as GameInfo

beforeEach(() => {
  for (const k of Object.keys(mirror)) delete mirror[k]
  reloads = 0
  ;(window as unknown as { api: unknown }).api = {
    storeNew: () => undefined,
    storeHas: (store: string, key: string) => `${store}:${key}` in mirror,
    storeGet: (store: string, key: string, dflt?: unknown) => {
      if (key.startsWith('__timestamp.')) return '2026-01-01T00:00:00Z'
      return `${store}:${key}` in mirror ? mirror[`${store}:${key}`] : dflt
    },
    storeSet: () => undefined,
    setSetting: () => undefined,
    logInfo: () => undefined,
    logError: () => undefined,
    refreshLibrary: async () => undefined,
    checkGameUpdates: async () => [],
    logoutLegendary: async () => undefined,
    logoutGOG: () => undefined,
    logoutAmazon: async () => undefined,
    logoutSteam: () => undefined,
    // signed out on the first poll, so steamLogout confirms immediately
    getSteamUserInfo: async () => undefined
  }
  ;(window as unknown as { location: unknown }).location = {
    reload: () => {
      reloads += 1
    }
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

// ---------------------------------------------------------------------------
// (a) Logouts never reload the window; each clears only its own runner.
// ---------------------------------------------------------------------------

type LogoutKey = 'epic' | 'gog' | 'amazon' | 'steam'
type LogoutRunner = Record<LogoutKey, [Runner, keyof LibraryArrays]>
type LibraryArrays = {
  epicLibrary: GameInfo[]
  gogLibrary: GameInfo[]
  amazonLibrary: GameInfo[]
  steamLibrary: GameInfo[]
}

const OWN: LogoutRunner = {
  epic: ['legendary', 'epicLibrary'],
  gog: ['gog', 'gogLibrary'],
  amazon: ['nile', 'amazonLibrary'],
  steam: ['steam', 'steamLibrary']
}

const seedAll = () =>
  useLibraryState.setState({
    epicLibrary: [game('e', 'legendary')],
    gogLibrary: [game('g', 'gog')],
    amazonLibrary: [game('a', 'nile')],
    steamLibrary: [game('s', 'steam')]
  })

async function logoutViolations(
  key: LogoutKey,
  logout: () => Promise<void>
): Promise<string[]> {
  const violations: string[] = []
  seedAll()
  await logout()
  if (reloads > 0) violations.push('reloaded the window')
  const own = OWN[key][1]
  const state = useLibraryState.getState()
  if (state[own].length !== 0) violations.push('did not clear own library')
  for (const [other, [, arrayKey]] of Object.entries(OWN)) {
    if (other !== key && state[arrayKey].length !== 1) {
      violations.push(`wiped the ${other} library`)
    }
  }
  return violations
}

describe('logout actions - never reload the window (debug/login-logout-wipes-library item a)', () => {
  it.each([
    ['epic', () => useAuthState.getState().epicLogout()],
    ['gog', () => useAuthState.getState().gogLogout()],
    ['amazon', () => useAuthState.getState().amazonLogout()],
    ['steam', () => useAuthState.getState().steamLogout()]
  ] as [LogoutKey, () => Promise<void>][])(
    '%sLogout never reloads and clears only its own runner library',
    async (key, logout) => {
      await expect(logoutViolations(key, logout)).resolves.toEqual([])
    }
  )

  it('self-test: the gate CONVICTS a logout that reintroduces window.location.reload() (the hand RED-proof mutation)', async () => {
    const reloading = async () => {
      useLibraryState.getState().resetRunnerLibrary('gog')
      window.location.reload()
    }
    await expect(logoutViolations('gog', reloading)).resolves.toEqual([
      'reloaded the window'
    ])
  })

  it('self-test: the gate CONVICTS a logout that wipes every runner (not just its own)', async () => {
    const wipesAll = async () => {
      for (const [runner] of Object.values(OWN)) {
        useLibraryState.getState().resetRunnerLibrary(runner)
      }
    }
    const violations = await logoutViolations('gog', wipesAll)
    expect(violations).toEqual([
      'wiped the epic library',
      'wiped the amazon library',
      'wiped the steam library'
    ])
  })

  it('self-test: the gate CONVICTS a logout whose scoped clear was dropped', async () => {
    const noClear = async () => undefined
    await expect(logoutViolations('gog', noClear)).resolves.toEqual([
      'did not clear own library'
    ])
  })
})

// ---------------------------------------------------------------------------
// (c) refresh() honours its `library` parameter through to the final write.
// ---------------------------------------------------------------------------

type ScopedRefresh = (runner: Runner) => Promise<void>

/** The contract; returns the list of violated rules (empty = conforming). */
async function scopedRefreshViolations(
  refresh: ScopedRefresh
): Promise<string[]> {
  const violations: string[] = []
  mirror['gog_library:games'] = [game('g', 'gog')]
  mirror['legendary_library:library'] = [game('e', 'legendary')]
  mirror['nile_library:library'] = [game('a', 'nile')]
  const keepEpic = [game('keep-e', 'legendary')]
  const keepAmazon = [game('keep-a', 'nile')]
  useLibraryState.setState({
    epicLibrary: keepEpic,
    amazonLibrary: keepAmazon,
    gogLibrary: [],
    refreshing: true,
    refreshingInTheBackground: false,
    refreshingByRunner: { gog: true, nile: true }
  })

  await refresh('gog')

  const s = useLibraryState.getState()
  if (s.gogLibrary.map((g) => g.app_name).join() !== 'g') {
    violations.push('did not write the scoped runner array')
  }
  if (s.epicLibrary !== keepEpic) violations.push('touched the epic array')
  if (s.amazonLibrary !== keepAmazon)
    violations.push('touched the amazon array')
  if (s.refreshing !== true || s.refreshingInTheBackground !== false) {
    violations.push('touched the global refreshing flags')
  }
  if (s.refreshingByRunner.gog !== false) {
    violations.push('did not clear its own refreshingByRunner entry')
  }
  if (s.refreshingByRunner.nile !== true) {
    violations.push("clobbered another runner's refreshingByRunner entry")
  }
  return violations
}

describe('libraryState.refresh() - a scoped library arg only overwrites that runner (debug/login-logout-wipes-library item c)', () => {
  it('a scoped refresh writes only its own runner array and refreshingByRunner entry', async () => {
    await expect(
      scopedRefreshViolations((runner) =>
        useLibraryState.getState().refresh(runner)
      )
    ).resolves.toEqual([])
  })

  it('an unscoped refresh does write every array and the two global flags (positive control)', async () => {
    mirror['gog_library:games'] = [game('g', 'gog')]
    mirror['legendary_library:library'] = [game('e', 'legendary')]
    mirror['nile_library:library'] = [game('a', 'nile')]
    useLibraryState.setState({
      refreshing: true,
      refreshingInTheBackground: false
    })
    await useLibraryState.getState().refresh('all')
    const s = useLibraryState.getState()
    expect(s.epicLibrary).toHaveLength(1)
    expect(s.gogLibrary).toHaveLength(1)
    expect(s.amazonLibrary).toHaveLength(1)
    expect(s.refreshing).toBe(false)
    expect(s.refreshingInTheBackground).toBe(true)
  })

  it('self-test: the gate CONVICTS the pre-fix shape that always overwrote every array and the global flags', async () => {
    const preFix: ScopedRefresh = async () => {
      useLibraryState.setState({
        epicLibrary: [],
        gogLibrary: [game('g', 'gog')],
        amazonLibrary: [],
        refreshing: false,
        refreshingInTheBackground: true
      })
    }
    const violations = await scopedRefreshViolations(preFix)
    expect(violations).toEqual(
      expect.arrayContaining([
        'touched the epic array',
        'touched the amazon array',
        'touched the global refreshing flags',
        'did not clear its own refreshingByRunner entry'
      ])
    )
  })

  it('self-test: the gate CONVICTS a shape that scopes the fetch but leaves the final write unconditional (specialist-flagged no-op regression)', async () => {
    const fetchOnlyScoped: ScopedRefresh = async () => {
      useLibraryState.setState({
        gogLibrary: [game('g', 'gog')],
        epicLibrary: [game('other', 'legendary')],
        refreshing: false,
        refreshingInTheBackground: true,
        refreshingByRunner: { gog: false, nile: true }
      })
    }
    const violations = await scopedRefreshViolations(fetchOnlyScoped)
    expect(violations).toEqual([
      'touched the epic array',
      'touched the global refreshing flags'
    ])
  })
})
