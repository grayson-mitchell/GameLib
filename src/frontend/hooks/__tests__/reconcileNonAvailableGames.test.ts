/**
 * Regression + guard tests for `reconcileNonAvailableGames` (quick task
 * 260822-b05 / phase-37 gap-analysis todo
 * 2026-08-22-nonavailablegames-permanently-traps-uninstalled-games.md).
 *
 * `constants.ts` seeds its module-level `nonAvailbleGamesArray` from
 * `window.localStorage` exactly once, at import time (`constants.ts:76-78`).
 * To control that seed per test we stub a fake `window` on `globalThis`
 * BEFORE each `require`, then use `jest.isolateModules` to force a fresh
 * module registry so the next test's stub is picked up instead of a cached
 * snapshot. This mirrors the `globalThis` stubbing convention in
 * `screens/WebView/components/__tests__/TauriLoginPanel.test.tsx:26-32` —
 * this project's jest config is `testEnvironment: 'node'`, so there is no
 * real `window`/`localStorage` otherwise.
 *
 * Deliberately does NOT use `hasStatus.reconcile.test.ts`'s
 * `jest.mock('../constants', ...)` — this file needs the REAL
 * `reconcileNonAvailableGames` implementation under test, not a mock of it.
 *
 * `resetMocks: true` (jest.config.js) wipes mock IMPLEMENTATIONS (not just
 * calls) between tests, so `isGameAvailable`'s `mockResolvedValue`/
 * `mockImplementation` is set fresh inside each test, never in a shared
 * `beforeEach`.
 */
import type { GameInfo } from 'common/types'
import { isNonAvailableGame } from '../../screens/Library/filterEngine'
import type { FilterEngineDeps } from '../../types'

type FakeLocalStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function makeFakeLocalStorage(seed: Record<string, string> = {}): {
  storage: FakeLocalStorage
  backing: Map<string, string>
} {
  const backing = new Map<string, string>(Object.entries(seed))
  const storage: FakeLocalStorage = {
    getItem: (key) => (backing.has(key) ? (backing.get(key) as string) : null),
    setItem: (key, value) => {
      backing.set(key, value)
    },
    removeItem: (key) => {
      backing.delete(key)
    }
  }
  return { storage, backing }
}

function makeGame(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    runner: 'steam',
    app_name: 'default-app',
    art_cover: '',
    art_square: '',
    install: {},
    is_installed: false,
    title: 'Default Game',
    canRunOffline: false,
    ...overrides
  } as GameInfo
}

function makeDeps(overrides: Partial<FilterEngineDeps> = {}): FilterEngineDeps {
  return {
    hiddenAppNames: [],
    nonAvailableAppNames: [],
    favouriteKeys: new Set(),
    recentAppNames: [],
    customCategories: {},
    gameUpdates: [],
    crossoverRatings: {},
    hostPlatform: 'darwin',
    ...overrides
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConstantsModule = typeof import('../constants')

describe('reconcileNonAvailableGames', () => {
  it(
    'REGRESSION (must be RED at HEAD): a not-installed game entry is dropped ' +
      'and the healed appName is returned so Library/index.tsx bumps ' +
      'reconcileTick — a fix that only touched localStorage would fail the ' +
      'returned-array half of this assertion',
    async () => {
      const isGameAvailable = jest.fn()
      const { storage } = makeFakeLocalStorage({
        nonAvailableGames: JSON.stringify(['app1'])
      })
      ;(
        globalThis as unknown as {
          window: {
            localStorage: FakeLocalStorage
            api: { isGameAvailable: jest.Mock }
          }
        }
      ).window = { localStorage: storage, api: { isGameAvailable } }

      let constants!: ConstantsModule
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        constants = require('../constants')
      })

      const libraryUnion: GameInfo[] = [
        makeGame({
          app_name: 'app1',
          runner: 'steam',
          is_installed: false,
          install: {}
        })
      ]

      const healed = await constants.reconcileNonAvailableGames(libraryUnion)

      expect(healed).toContain('app1')
      expect(
        JSON.parse(storage.getItem('nonAvailableGames') || '[]')
      ).not.toContain('app1')
    }
  )

  it(
    'OVER-CORRECTION GUARD (green before and after): an installed game whose ' +
      'isGameAvailable check still resolves false (install_path genuinely ' +
      'missing) stays on the list and is not reported as healed',
    async () => {
      const isGameAvailable = jest.fn().mockResolvedValue(false)
      const { storage } = makeFakeLocalStorage({
        nonAvailableGames: JSON.stringify(['app2'])
      })
      ;(
        globalThis as unknown as {
          window: {
            localStorage: FakeLocalStorage
            api: { isGameAvailable: jest.Mock }
          }
        }
      ).window = { localStorage: storage, api: { isGameAvailable } }

      let constants!: ConstantsModule
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        constants = require('../constants')
      })

      const libraryUnion: GameInfo[] = [
        makeGame({
          app_name: 'app2',
          runner: 'steam',
          is_installed: true,
          install: {}
        })
      ]

      const healed = await constants.reconcileNonAvailableGames(libraryUnion)

      expect(healed).toEqual([])
      expect(
        JSON.parse(storage.getItem('nonAvailableGames') || '[]')
      ).toContain('app2')
      expect(isGameAvailable).toHaveBeenCalledWith({
        appName: 'app2',
        runner: 'steam'
      })
    }
  )
})

describe('isNonAvailableGame delisted-independence premise (REQ-37-02/D-15: premise retired)', () => {
  it(
    'a delisted Steam game is NOT non-available via any independent clause ' +
      'when nonAvailableAppNames is empty — the old OR clause that made the ' +
      'not-installed heal branch "safe" to drop a delisted game\'s list ' +
      'entry is gone; isNonAvailableGame is now the list membership test ' +
      'alone, so dropping the entry now DOES make the game visible again',
    () => {
      const game = makeGame({
        app_name: 'delisted-app',
        runner: 'steam',
        is_delisted: true
      })
      const deps = makeDeps({ nonAvailableAppNames: [] })

      expect(isNonAvailableGame(game, deps)).toBe(false)
    }
  )
})
