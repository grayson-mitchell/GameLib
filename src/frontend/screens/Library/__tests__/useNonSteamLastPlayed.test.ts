/**
 * Review 261027-jjz WR-04: the Last-played data path from `timestampStore` to the map the
 * grid sorts with (WR-01 retry, WR-02 full-library map, WR-05 store-change re-read).
 *
 * No jsdom / renderHook in this project (see src/frontend/jest.config.js), so this follows
 * `useDebouncedStoreSearch.test.ts`'s pattern: `react` is mocked with slot-based
 * useState/useRef/useMemo and a dependency-and-cleanup-aware useEffect, and the hook is
 * invoked as a plain function. Effects run synchronously inside the "render"; a state set
 * from a resolved promise is visible on the NEXT `render()` call.
 *
 * Each test loads a fresh copy of the hook and the react mock through
 * `jest.isolateModules`, because the hook keeps a module-level "hydrated once" latch.
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

const lastPlayedByApp: Record<string, { lastPlayed?: string } | undefined> = {}
const mockGetNodefault = jest.fn((appName: string) => lastPlayedByApp[appName])

jest.mock('frontend/helpers/electronStores', () => ({
  timestampStore: {
    get_nodefault: (appName: string) => mockGetNodefault(appName)
  }
}))

const mockApi = {
  storeEnsureHydrated: jest.fn<Promise<boolean>, [string]>(),
  storeOnChanged: jest.fn<() => void, [string, () => void]>()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

import type { GameInfo } from 'common/types'
import type * as HookModule from '../useNonSteamLastPlayed'

type Harness = { __beginRender: () => void; __unmount: () => void }
type Map_ = Readonly<Record<string, string | undefined>> | null

function game(app_name: string, runner: GameInfo['runner']): GameInfo {
  return { app_name, runner, title: app_name } as GameInfo
}

const LIBRARY: GameInfo[] = [
  game('epicA', 'legendary'),
  game('gogB', 'gog'),
  game('steam1', 'steam')
]
const NO_RECENT: string[] = []

function load(): { hook: typeof HookModule; harness: Harness } {
  let loaded: { hook: typeof HookModule; harness: Harness } | undefined
  jest.isolateModules(() => {
    loaded = {
      harness: jest.requireMock('react'),
      hook: jest.requireActual<typeof HookModule>('../useNonSteamLastPlayed')
    }
  })
  return loaded!
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

describe('useNonSteamLastPlayed', () => {
  let hook: typeof HookModule
  let harness: Harness
  let listener: (() => void) | undefined
  const unsubscribe = jest.fn()

  function render(
    active = true,
    games: readonly GameInfo[] = LIBRARY,
    recent = NO_RECENT
  ): Map_ {
    harness.__beginRender()
    return hook.useNonSteamLastPlayed(active, games, recent)
  }

  beforeEach(() => {
    jest.useFakeTimers()
    ;({ hook, harness } = load())
    for (const key of Object.keys(lastPlayedByApp)) delete lastPlayedByApp[key]
    lastPlayedByApp.epicA = { lastPlayed: '2026-10-01T00:00:00.000Z' }
    listener = undefined
    mockGetNodefault.mockImplementation(
      (appName: string) => lastPlayedByApp[appName]
    )
    mockApi.storeOnChanged.mockImplementation((_store, cb) => {
      listener = cb
      return unsubscribe
    })
  })

  afterEach(() => {
    harness.__unmount()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('does nothing while inactive: no hydrate, no subscription, null map', () => {
    expect(render(false)).toBeNull()
    expect(mockApi.storeEnsureHydrated).not.toHaveBeenCalled()
    expect(mockApi.storeOnChanged).not.toHaveBeenCalled()
  })

  it('returns null until hydrated (not an all-unknown map), then maps every non-Steam game', async () => {
    mockApi.storeEnsureHydrated.mockResolvedValue(true)

    expect(render()).toBeNull()
    expect(mockGetNodefault).not.toHaveBeenCalled()
    expect(mockApi.storeEnsureHydrated).toHaveBeenCalledWith('timestampStore')

    await flush()
    const map = render()
    expect(map).toEqual({ epicA: '2026-10-01T00:00:00.000Z', gogB: undefined })
    expect(map).not.toHaveProperty('steam1')
  })

  it('on hydrate failure never reads the cold store, retries with bounded back-off, and warns once', async () => {
    mockApi.storeEnsureHydrated.mockResolvedValue(false)
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    render()
    await flush()
    for (const delay of hook.LAST_PLAYED_HYDRATE_RETRY_DELAYS_MS) {
      expect(render()).toBeNull()
      jest.advanceTimersByTime(delay)
      await flush()
    }
    expect(render()).toBeNull()

    const attempts = 1 + hook.LAST_PLAYED_HYDRATE_RETRY_DELAYS_MS.length
    expect(mockApi.storeEnsureHydrated).toHaveBeenCalledTimes(attempts)
    expect(mockGetNodefault).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)

    // Gave up: no further timer-driven attempts.
    jest.advanceTimersByTime(60_000)
    await flush()
    expect(mockApi.storeEnsureHydrated).toHaveBeenCalledTimes(attempts)
  })

  it('a retry that succeeds produces the map', async () => {
    mockApi.storeEnsureHydrated
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)

    render()
    await flush()
    expect(render()).toBeNull()
    jest.advanceTimersByTime(hook.LAST_PLAYED_HYDRATE_RETRY_DELAYS_MS[0])
    await flush()
    expect(render()).toEqual({
      epicA: '2026-10-01T00:00:00.000Z',
      gogB: undefined
    })
  })

  it('a store-change notification after giving up starts a fresh hydrate round', async () => {
    mockApi.storeEnsureHydrated.mockResolvedValue(false)
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    render()
    await flush()
    for (const delay of hook.LAST_PLAYED_HYDRATE_RETRY_DELAYS_MS) {
      render()
      jest.advanceTimersByTime(delay)
      await flush()
    }
    render()

    mockApi.storeEnsureHydrated.mockResolvedValue(true)
    listener?.()
    render()
    await flush()
    expect(render()).toEqual({
      epicA: '2026-10-01T00:00:00.000Z',
      gogB: undefined
    })
  })

  it('deactivating clears a pending retry timer and unsubscribes', async () => {
    mockApi.storeEnsureHydrated.mockResolvedValue(false)

    render()
    await flush()
    render(false)
    expect(unsubscribe).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(60_000)
    await flush()
    expect(mockApi.storeEnsureHydrated).toHaveBeenCalledTimes(1)
  })

  it('a hydrate that resolves after unmount sets nothing and schedules nothing', async () => {
    let resolve: ((ok: boolean) => void) | undefined
    mockApi.storeEnsureHydrated.mockImplementation(
      () => new Promise((r) => (resolve = r))
    )

    render()
    harness.__unmount()
    resolve?.(false)
    await flush()
    jest.advanceTimersByTime(60_000)
    await flush()
    expect(mockApi.storeEnsureHydrated).toHaveBeenCalledTimes(1)
  })

  it('WR-05: a timestampStore change re-reads the map without any recent-games change', async () => {
    mockApi.storeEnsureHydrated.mockResolvedValue(true)
    render()
    await flush()
    expect(render()?.gogB).toBeUndefined()

    lastPlayedByApp.gogB = { lastPlayed: '2026-10-27T12:00:00.000Z' }
    listener?.()
    expect(render()?.gogB).toBe('2026-10-27T12:00:00.000Z')
  })

  it('keeps the map identity when a re-read changes nothing (no needless grid re-sort)', async () => {
    mockApi.storeEnsureHydrated.mockResolvedValue(true)
    render()
    await flush()
    const first = render()

    listener?.()
    expect(render()).toBe(first)
    expect(render(true, [...LIBRARY])).toBe(first)
  })

  it('a remount after a successful hydrate builds the map in its first render', async () => {
    mockApi.storeEnsureHydrated.mockResolvedValue(true)
    render()
    await flush()
    render()
    harness.__unmount()

    expect(render()).toEqual({
      epicA: '2026-10-01T00:00:00.000Z',
      gogB: undefined
    })
  })

  it('IN-02: a rejecting storeEnsureHydrated is caught and logged, not left unhandled', async () => {
    // The transport promises never to reject, but a partial or mocked window.api might.
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockApi.storeEnsureHydrated.mockRejectedValue(new Error('mock api broke'))

    render()
    await flush()
    expect(errorSpy).toHaveBeenCalledWith(
      'Library: Last played hydrate failed',
      expect.any(Error)
    )
  })
})
