/**
 * Quick 261029-sbi: the Metacritic wiki-cache reader. Same harness as
 * useNonSteamLastPlayed.test.ts (slot-based `react` mock; effects run
 * synchronously, state set from a resolved promise is visible on the NEXT
 * render()). Each test loads a fresh copy because the hook keeps a
 * module-level "hydrated once" latch.
 */

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let refSlots: { current: unknown }[] = []
  let memoSlots: { deps: unknown[]; value: unknown }[] = []
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
  let stateCursor = 0
  let refCursor = 0
  let memoCursor = 0
  let effectCursor = 0

  const depsChanged = (
    prev: unknown[] | undefined,
    next: unknown[] | undefined
  ): boolean => {
    if (!prev || !next) return true
    if (prev.length !== next.length) return true
    return prev.some((d, i) => !Object.is(d, next[i]))
  }

  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const idx = stateCursor++
      if (idx >= stateSlots.length) {
        stateSlots[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const setState = (updater: unknown) => {
        stateSlots[idx] =
          typeof updater === 'function'
            ? (updater as (prev: unknown) => unknown)(stateSlots[idx])
            : updater
      }
      return [stateSlots[idx], setState]
    },
    useRef: (initial: unknown) => {
      const idx = refCursor++
      if (idx >= refSlots.length) refSlots[idx] = { current: initial }
      return refSlots[idx]
    },
    useMemo: (factory: () => unknown, deps: unknown[]) => {
      const idx = memoCursor++
      const slot = memoSlots[idx]
      if (!slot || depsChanged(slot.deps, deps)) {
        memoSlots[idx] = { deps, value: factory() }
      }
      return memoSlots[idx].value
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        const priorCleanup = effectCleanups[idx]
        if (typeof priorCleanup === 'function') priorCleanup()
        effectDeps[idx] = deps
        effectCleanups[idx] = effect()
      }
    },
    __beginRender: () => {
      stateCursor = 0
      refCursor = 0
      memoCursor = 0
      effectCursor = 0
    },
    __unmount: () => {
      for (const cleanup of effectCleanups)
        if (typeof cleanup === 'function') cleanup()
      stateSlots = []
      refSlots = []
      memoSlots = []
      effectDeps = []
      effectCleanups = []
    }
  }
})

const wikiByKey: Record<string, unknown> = {}
const mockStoreGet = jest.fn((_store: string, key: string) => wikiByKey[key])
const mockStoreDelete = jest.fn()

// Importing the real `frontend/helpers` pulls in the preload surface under jest,
// so it is mocked with the SAME regex as src/frontend/helpers/index.ts.
jest.mock('frontend/helpers', () => ({
  removeSpecialcharacters: (text: string) =>
    text.replaceAll(
      new RegExp(/[:|/|*|?|<|>|\\|&|{|}|%|$|@|`|!|™|+|'|"|®]/, 'gi'),
      ''
    )
}))
// useNonSteamLastPlayed (source of the retry-delay constant) imports this.
jest.mock('frontend/helpers/electronStores', () => ({ timestampStore: {} }))

const mockApi = {
  storeEnsureHydrated: jest.fn<Promise<boolean>, [string]>(),
  storeOnChanged: jest.fn<() => void, [string, () => void]>(),
  storeGet: mockStoreGet,
  storeDelete: mockStoreDelete
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

import type { GameInfo } from 'common/types'
import type * as HookModule from '../useWikiMetacriticScores'
import { LAST_PLAYED_HYDRATE_RETRY_DELAYS_MS as DELAYS } from '../useNonSteamLastPlayed'

type Harness = { __beginRender: () => void; __unmount: () => void }
type Map_ = Readonly<Record<string, number>> | null

function game(title: string): GameInfo {
  return { app_name: title, runner: 'gog', title } as GameInfo
}

const LIBRARY: GameInfo[] = [game("Baldur's Gate"), game('Other'), game('None')]

function load(): { hook: typeof HookModule; harness: Harness } {
  let loaded: { hook: typeof HookModule; harness: Harness } | undefined
  jest.isolateModules(() => {
    loaded = {
      harness: jest.requireMock('react'),
      hook: jest.requireActual<typeof HookModule>('../useWikiMetacriticScores')
    }
  })
  return loaded!
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

describe('useWikiMetacriticScores', () => {
  let hook: typeof HookModule
  let harness: Harness
  let listener: (() => void) | undefined

  function render(active = true, games: readonly GameInfo[] = LIBRARY): Map_ {
    harness.__beginRender()
    return hook.useWikiMetacriticScores(active, games)
  }

  beforeEach(() => {
    jest.useFakeTimers()
    ;({ hook, harness } = load())
    for (const key of Object.keys(wikiByKey)) delete wikiByKey[key]
    wikiByKey['Baldurs Gate'] = {
      pcgamingwiki: { metacritic: { score: '91' } }
    }
    wikiByKey['Other'] = { pcgamingwiki: { metacritic: { score: '' } } }
    listener = undefined
    mockStoreGet.mockImplementation((_s, key) => wikiByKey[key])
    mockApi.storeOnChanged.mockImplementation((_store, cb) => {
      listener = cb
      return jest.fn()
    })
  })

  afterEach(() => {
    harness.__unmount()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('inactive: null, no hydrate, no subscription', () => {
    expect(render(false)).toBeNull()
    expect(mockApi.storeEnsureHydrated).not.toHaveBeenCalled()
    expect(mockApi.storeOnChanged).not.toHaveBeenCalled()
  })

  it('hydrating returns null and never reads the cold store; hydrated builds the map by backend key', async () => {
    mockApi.storeEnsureHydrated.mockResolvedValue(true)
    expect(render()).toBeNull()
    expect(mockStoreGet).not.toHaveBeenCalled()
    expect(mockApi.storeEnsureHydrated).toHaveBeenCalledWith('wikigameinfo')

    await flush()
    expect(render()).toEqual({ "Baldur's Gate": 91 })
    expect(mockStoreGet).toHaveBeenCalledWith('wikigameinfo', 'Baldurs Gate')
  })

  it('a store change re-reads the map', async () => {
    mockApi.storeEnsureHydrated.mockResolvedValue(true)
    render()
    await flush()
    expect(render()).toEqual({ "Baldur's Gate": 91 })

    wikiByKey['Other'] = { pcgamingwiki: { metacritic: { score: '70' } } }
    listener?.()
    expect(render()).toEqual({ "Baldur's Gate": 91, Other: 70 })
  })

  it('keeps map identity when a re-read changes nothing', async () => {
    mockApi.storeEnsureHydrated.mockResolvedValue(true)
    render()
    await flush()
    const first = render()
    listener?.()
    expect(render()).toBe(first)
  })

  it('after exhausting retries returns {} (not null), and never deletes', async () => {
    mockApi.storeEnsureHydrated.mockResolvedValue(false)
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    render()
    await flush()
    for (const delay of DELAYS) {
      expect(render()).toBeNull()
      jest.advanceTimersByTime(delay)
      await flush()
    }
    expect(render()).toEqual({})
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(mockStoreGet).not.toHaveBeenCalled()
    expect(mockStoreDelete).not.toHaveBeenCalled()
  })

  it('never calls storeDelete on the happy path either', async () => {
    mockApi.storeEnsureHydrated.mockResolvedValue(true)
    render()
    await flush()
    render()
    expect(mockStoreDelete).not.toHaveBeenCalled()
  })
})
