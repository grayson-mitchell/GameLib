/**
 * Unit tests for useOwnedSteamGids (PRICE-02, RESEARCH D4 / Pitfall 7,
 * T-47-32, T-47-33). Same "mock react + invoke directly" harness as
 * useDebouncedStoreSearch.test.ts (no jsdom / renderHook in this project),
 * extended with a deps-aware useMemo.
 */

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
  let effectCursor = 0
  let memoSlots: unknown[] = []
  let memoDeps: (unknown[] | undefined)[] = []
  let memoCursor = 0

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
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        const priorCleanup = effectCleanups[idx]
        if (typeof priorCleanup === 'function') {
          priorCleanup()
        }
        effectDeps[idx] = deps
        effectCleanups[idx] = effect()
      }
    },
    useMemo: (factory: () => unknown, deps?: unknown[]) => {
      const idx = memoCursor++
      if (idx >= memoSlots.length || depsChanged(memoDeps[idx], deps)) {
        memoDeps[idx] = deps
        memoSlots[idx] = factory()
      }
      return memoSlots[idx]
    },
    __beginRender: () => {
      stateCursor = 0
      effectCursor = 0
      memoCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
      memoSlots = []
      memoDeps = []
      memoCursor = 0
    }
  }
})

const mockApi = {
  getItadSteamGids: jest.fn(),
  logError: jest.fn()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order — see useDebouncedStoreSearch.test.ts).
import { useOwnedSteamGids } from '../hooks/useOwnedSteamGids'

type Library = { app_name: string }[]
type Keys = { steamAppId?: string }[]
type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function mount(library: Library, keys: Keys): Map<string, string> {
  harness().__resetMount()
  harness().__beginRender()
  return useOwnedSteamGids(library, keys)
}

function rerender(library: Library, keys: Keys): Map<string, string> {
  harness().__beginRender()
  return useOwnedSteamGids(library, keys)
}

async function settle(
  library: Library,
  keys: Keys
): Promise<Map<string, string>> {
  let value = rerender(library, keys)
  for (let i = 0; i < 4; i++) {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    value = rerender(library, keys)
  }
  return value
}

describe('useOwnedSteamGids', () => {
  beforeEach(() => {
    mockApi.getItadSteamGids.mockReset()
    mockApi.logError.mockReset()
  })

  it('looks up digit-only deduped sorted appids from library and waiting keys and inverts the record', async () => {
    mockApi.getItadSteamGids.mockResolvedValue({
      '220': 'gid-220',
      '400': 'gid-400'
    })
    const library = [{ app_name: '220' }, { app_name: 'abc' }]
    const keys = [
      { steamAppId: '400' },
      { steamAppId: '0' },
      { steamAppId: '' }
    ]

    mount(library, keys)
    const map = await settle(library, keys)

    expect(mockApi.getItadSteamGids).toHaveBeenCalledTimes(1)
    expect(mockApi.getItadSteamGids).toHaveBeenCalledWith(['220', '400'])
    expect(map.get('gid-220')).toBe('220')
    expect(map.get('gid-400')).toBe('400')
    expect(map.size).toBe(2)
  })

  it('does not re-call for the same appids, and re-calls once when the library changes', async () => {
    mockApi.getItadSteamGids.mockResolvedValue({})
    const keys: Keys = []

    mount([{ app_name: '220' }], keys)
    await settle([{ app_name: '220' }], keys)
    // New array identity, same appids.
    await settle([{ app_name: '220' }], keys)
    expect(mockApi.getItadSteamGids).toHaveBeenCalledTimes(1)

    await settle([{ app_name: '220' }, { app_name: '730' }], keys)
    expect(mockApi.getItadSteamGids).toHaveBeenCalledTimes(2)
    expect(mockApi.getItadSteamGids).toHaveBeenLastCalledWith(['220', '730'])
  })

  it('logs a rejected lookup and returns an empty Map without throwing', async () => {
    mockApi.getItadSteamGids.mockRejectedValue(new Error('offline'))
    const library = [{ app_name: '220' }]

    mount(library, [])
    const map = await settle(library, [])

    expect(map.size).toBe(0)
    expect(mockApi.logError).toHaveBeenCalledWith(
      expect.stringContaining('gid lookup failed')
    )
  })

  it('makes no call and returns an empty Map for an empty appid set', async () => {
    mount([], [])
    const map = await settle([], [])

    expect(mockApi.getItadSteamGids).not.toHaveBeenCalled()
    expect(map.size).toBe(0)
  })
})
