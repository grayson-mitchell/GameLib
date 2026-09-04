/**
 * Tests for useStoreEmbedHost (Phase 40 Plan 08, D-18/D-19/D-20/D-21, REQ-40-02/REQ-40-03).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`'s docstring) — the hook is invoked directly as a plain function
 * against a hand-rolled `react` mock, following `useTauriOAuthLogin.test.tsx`'s established
 * "mock react + invoke directly" convention for hooks in this same directory. That file's
 * `__unmount()` addition (runs every recorded effect cleanup without re-invoking the hook) is
 * reused here unchanged — it is the only way this harness can prove route-leave vs
 * app-teardown unmount behaviour (tests 6/7 below) without a real React tree.
 *
 * `useRef` and `useCallback` are added to that file's mock shape (this hook uses both; that one
 * did not need either). `useCallback` is an identity passthrough (`tourContextSuppression.test.tsx`'s
 * shape) — this harness has no concept of "referential stability across renders" and none of the
 * seven properties under test depend on it.
 *
 * `ResizeObserver` does not exist in this project's `testEnvironment: 'node'` jest config, so it
 * is stubbed at the `globalThis` level below, mirroring how `window` is stubbed in
 * `WebviewUnavailablePanel.test.tsx`. The stub's `observe()` auto-fires its callback once
 * (matching the real ResizeObserver spec: observing an element fires the callback once with its
 * current size) so mounting alone is enough to drive the initial `open()` call; later calls to
 * `trigger()` simulate subsequent resizes.
 */
import type { RefObject } from 'react'

jest.useFakeTimers()

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let refSlots: { current: unknown }[] = []
  let refCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
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
      if (idx >= refSlots.length) {
        refSlots[idx] = { current: initial }
      }
      return refSlots[idx]
    },
    useCallback: <T,>(fn: T) => fn,
    useContext: () => suppressionContextValue,
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
      effectCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
      refSlots = []
      refCursor = 0
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
    },
    // `useTauriOAuthLogin.test.tsx`'s addition: invokes every recorded effect cleanup without
    // re-invoking the hook afterward -- the only way this harness can simulate a real unmount.
    __unmount: () => {
      for (const cleanup of effectCleanups) {
        if (typeof cleanup === 'function') cleanup()
      }
      effectCleanups = []
    }
  }
})

// Mutable so individual tests can flip it and `reinvoke()` to exercise the suppression effect's
// two transitions (test 5) -- there is only one context consumed anywhere in this hook
// (`useStoreEmbedSuppressed`'s own `useContext` call), so no identity-based branching is needed
// in the mock above, unlike `humbleExpiryToastSuppression.test.tsx`.
let suppressionContextValue = { suppressed: false, acquire: jest.fn(), release: jest.fn() }

// Stand-in for the DOM's ResizeObserver, absent under this project's `testEnvironment: 'node'`
// jest config. `observe()` auto-fires once, matching the real spec (an initial observation
// reports the element's current size immediately) -- this is what lets test 1 assert an `open()`
// call from mounting alone, with no separate manual trigger.
class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }
  observe(): void {
    this.callback()
  }
  unobserve(): void {
    /* not used by this hook */
  }
  disconnect(): void {
    /* observed via the fake window's removeEventListener count instead */
  }
  trigger(): void {
    this.callback()
  }
}
;(
  globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }
).ResizeObserver = MockResizeObserver

// A minimal real event registry (not a jest.fn() stub) so `beforeunload`/`resize`/`scroll`
// listeners the hook registers can actually be dispatched by name from within a test, mirroring
// `window`'s real addEventListener/removeEventListener contract closely enough for this hook's
// needs without pulling in jsdom.
type Listener = () => void
const windowListeners = new Map<string, Set<Listener>>()

const mockApi = {
  storeEmbedOpen: jest.fn(),
  storeEmbedSetBounds: jest.fn(),
  storeEmbedHide: jest.fn(),
  storeEmbedShow: jest.fn(),
  storeEmbedClose: jest.fn(),
  storeEmbedBack: jest.fn(),
  storeEmbedForward: jest.fn(),
  storeEmbedReload: jest.fn(),
  storeEmbedNavigate: jest.fn(),
  logInfo: jest.fn()
}

;(
  globalThis as unknown as {
    window: {
      api: typeof mockApi
      addEventListener: (type: string, cb: Listener) => void
      removeEventListener: (type: string, cb: Listener) => void
    }
  }
).window = {
  api: mockApi,
  addEventListener: (type: string, cb: Listener) => {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set())
    windowListeners.get(type)?.add(cb)
  },
  removeEventListener: (type: string, cb: Listener) => {
    windowListeners.get(type)?.delete(cb)
  }
}

function dispatchWindowEvent(type: string): void {
  windowListeners.get(type)?.forEach((cb) => cb())
}

// D-30 persistence tests (below) need a real read/write surface: `localStorage` does not exist
// under this project's `testEnvironment: 'node'` jest config at all (confirmed empirically --
// referencing the bare identifier throws `ReferenceError: localStorage is not defined`), which
// is exactly why the hook's own persistence effect wraps its call in try/catch. A Map-backed
// stand-in, stubbed at `globalThis` alongside `window`/`ResizeObserver` above, is what lets these
// tests observe a real write instead of only a swallowed failure.
const fakeLocalStorage = new Map<string, string>()
;(
  globalThis as unknown as { localStorage: Storage }
).localStorage = {
  getItem: (key: string) => (fakeLocalStorage.has(key) ? fakeLocalStorage.get(key)! : null),
  setItem: (key: string, value: string) => {
    fakeLocalStorage.set(key, value)
  },
  removeItem: (key: string) => {
    fakeLocalStorage.delete(key)
  },
  clear: () => fakeLocalStorage.clear(),
  key: () => null,
  length: 0
} as Storage

// Imported after the mocks above (textual order -- this project's ts-jest setup does not hoist
// jest.mock like babel-jest; see useDebouncedStoreSearch.test.ts / useTauriOAuthLogin.test.tsx).
import { useStoreEmbedHost, type StoreEmbedHostState } from '../useStoreEmbedHost'

type HookHarness = {
  __beginRender: () => void
  __resetMount: () => void
  __unmount: () => void
}

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

interface MockRect {
  x: number
  y: number
  width: number
  height: number
}

function makeSlot(rect: MockRect): {
  ref: RefObject<HTMLDivElement>
  setRect: (next: MockRect) => void
} {
  let current = rect
  const el = {
    getBoundingClientRect: () => current
  } as unknown as HTMLDivElement
  return {
    ref: { current: el } as RefObject<HTMLDivElement>,
    setRect: (next: MockRect) => {
      current = next
    }
  }
}

interface MountOptions {
  slotRef: RefObject<HTMLDivElement>
  startUrl?: string
  storeKey?: string
  isStoreRoute?: boolean
}

function invoke(options: MountOptions): StoreEmbedHostState {
  // `invoke` is a test-harness wrapper around the real hook (mirrors
  // `useTauriOAuthLogin.test.tsx`'s `mount`/`rerender`, which the lint ratchet already tolerates
  // unsuppressed for this exact reason) -- the mocked `react` module above turns this file into a
  // hand-rolled render harness, not an actual component tree, so there is no real rules-of-hooks
  // risk here despite the name not starting with `use`. Suppressed (unlike its sibling file) only
  // because this repo's lint ratchet is pinned to an exact warning count and this project's own
  // acceptance criteria for this plan requires `pnpm lint` to exit 0 without raising it.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStoreEmbedHost({
    slotRef: options.slotRef,
    startUrl: options.startUrl ?? 'https://store.steampowered.com/',
    storeKey: options.storeKey ?? 'steam',
    isStoreRoute: options.isStoreRoute ?? true
  })
}

function mount(options: MountOptions): StoreEmbedHostState {
  harness().__resetMount()
  harness().__beginRender()
  return invoke(options)
}

function reinvoke(options: MountOptions): StoreEmbedHostState {
  harness().__beginRender()
  return invoke(options)
}

const okStatus = { status: 'ok' as const }

describe('useStoreEmbedHost (Phase 40 Plan 08, D-18/D-19/D-20/D-21)', () => {
  beforeEach(() => {
    suppressionContextValue = { suppressed: false, acquire: jest.fn(), release: jest.fn() }
    MockResizeObserver.instances = []
    windowListeners.clear()
    fakeLocalStorage.clear()
    mockApi.storeEmbedOpen.mockResolvedValue(okStatus)
    mockApi.storeEmbedHide.mockResolvedValue(okStatus)
    mockApi.storeEmbedShow.mockResolvedValue(okStatus)
    mockApi.storeEmbedClose.mockResolvedValue(okStatus)
    mockApi.storeEmbedBack.mockResolvedValue(okStatus)
    mockApi.storeEmbedForward.mockResolvedValue(okStatus)
    mockApi.storeEmbedReload.mockResolvedValue(okStatus)
    mockApi.storeEmbedNavigate.mockResolvedValue(okStatus)
  })

  afterEach(() => {
    jest.clearAllTimers()
  })

  // Property 1. Observed-red mutation: deleting the `if (!openedRef.current) { ... open ... }`
  // branch (or swapping it to always call `storeEmbedSetBounds` instead) turns this red --
  // `storeEmbedOpen` would never be called at all.
  it('1. mounting opens the embed with the start URL', () => {
    const { ref } = makeSlot({ x: 10, y: 20, width: 300, height: 400 })

    mount({ slotRef: ref, startUrl: 'https://store.steampowered.com/', storeKey: 'steam' })
    jest.advanceTimersByTime(40)

    expect(mockApi.storeEmbedOpen).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedOpen).toHaveBeenCalledWith(
      'https://store.steampowered.com/',
      { x: 10, y: 20, w: 300, h: 400 },
      'steam'
    )
  })

  // Property 2. Observed-red mutation: swapping `rect.width`/`rect.height` for a literal (e.g.
  // hardcoding `w: 0, h: 0`) or reading `window.innerWidth`/`innerHeight` instead turns this red
  // -- the sent bounds would stop matching the observed rect field-for-field.
  it('2. a slot resize sends bounds equal field-for-field to the observed rect', () => {
    const { ref, setRect } = makeSlot({ x: 10, y: 20, width: 300, height: 400 })

    mount({ slotRef: ref })
    jest.advanceTimersByTime(40) // drains the initial open() call

    setRect({ x: 5, y: 15, width: 640, height: 480 })
    MockResizeObserver.instances[0].trigger()
    jest.advanceTimersByTime(40)

    expect(mockApi.storeEmbedSetBounds).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedSetBounds).toHaveBeenCalledWith({
      x: 5,
      y: 15,
      w: 640,
      h: 480
    })
  })

  // Property 3. Observed-red mutation: removing the `clearTimeout(debounceHandle)` call inside
  // `scheduleFlush` (sending on every observer tick instead of debouncing) turns this red --
  // `storeEmbedSetBounds` would be called twice, once per tick, instead of once.
  it('3. two rapid resizes inside the debounce window produce exactly one send', () => {
    const { ref, setRect } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })

    mount({ slotRef: ref })
    jest.advanceTimersByTime(40) // drains the initial open() call

    setRect({ x: 1, y: 1, width: 101, height: 101 })
    MockResizeObserver.instances[0].trigger()
    jest.advanceTimersByTime(10) // well inside the 40ms window

    setRect({ x: 2, y: 2, width: 102, height: 102 })
    MockResizeObserver.instances[0].trigger()
    jest.advanceTimersByTime(40)

    expect(mockApi.storeEmbedSetBounds).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedSetBounds).toHaveBeenCalledWith({
      x: 2,
      y: 2,
      w: 102,
      h: 102
    })
  })

  // Property 4. Observed-red mutation: replacing the null-ref early return with a computed
  // fallback rect (e.g. `{ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }`) turns
  // this red -- a bounds payload would be sent where none should ever be (D-18: no fallback
  // rect, not even for a null ref).
  it('4. a null slot ref sends no bounds payload and logs', () => {
    const nullRef = { current: null } as RefObject<HTMLDivElement>

    mount({ slotRef: nullRef })
    jest.advanceTimersByTime(100)

    expect(mockApi.storeEmbedSetBounds).not.toHaveBeenCalled()
    expect(mockApi.storeEmbedOpen).not.toHaveBeenCalled()
    expect(mockApi.logInfo).toHaveBeenCalledWith(
      expect.stringContaining('slot ref is null')
    )
  })

  // Property 5. Observed-red mutation: swapping the two branches (calling `show()` when
  // suppressed becomes true, `hide()` when it becomes false) turns this red.
  it('5. suppression becoming true calls hide; becoming false calls show', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = { slotRef: ref, isStoreRoute: true }

    mount(options)
    jest.advanceTimersByTime(40)
    expect(mockApi.storeEmbedHide).not.toHaveBeenCalled()
    expect(mockApi.storeEmbedShow).not.toHaveBeenCalled()

    suppressionContextValue = { suppressed: true, acquire: jest.fn(), release: jest.fn() }
    reinvoke(options)
    expect(mockApi.storeEmbedHide).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedShow).not.toHaveBeenCalled()

    suppressionContextValue = { suppressed: false, acquire: jest.fn(), release: jest.fn() }
    reinvoke(options)
    expect(mockApi.storeEmbedShow).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedHide).toHaveBeenCalledTimes(1)
  })

  // Property 6. Observed-red mutation: calling `close()` unconditionally in the route-lifecycle
  // cleanup (instead of branching on `tearingDownRef`) turns this red.
  it('6. leaving the route (an ordinary unmount) calls hide and NOT close', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })

    mount({ slotRef: ref })
    jest.advanceTimersByTime(40)

    harness().__unmount()

    expect(mockApi.storeEmbedHide).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedClose).not.toHaveBeenCalled()
  })

  // Property 7. Observed-red mutation: the route-lifecycle cleanup ignoring `tearingDownRef`
  // (always calling `hide()`) turns this red -- app teardown would leak the embed instead of
  // closing it.
  it('7. unmounting after beforeunload (app teardown) calls close and NOT hide', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })

    mount({ slotRef: ref })
    jest.advanceTimersByTime(40)

    dispatchWindowEvent('beforeunload')
    harness().__unmount()

    expect(mockApi.storeEmbedClose).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedHide).not.toHaveBeenCalled()
  })

  // Property 8 (D-30). Observed-red mutation: dropping the `hasNavigatedRef` guard (persisting
  // on every effect run, including the first) turns this red -- mounting a route the user never
  // navigated within would overwrite `last-url-steam` with the caller's own `startUrl` on every
  // visit, which is exactly the "write on route entry" behaviour D-30 retires.
  it('8. mounting alone does not persist a last-url value (write on navigation, not on route entry)', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })

    mount({
      slotRef: ref,
      startUrl: 'https://store.steampowered.com/app/1',
      storeKey: 'steam'
    })
    jest.advanceTimersByTime(40)

    expect(fakeLocalStorage.has('last-url-steam')).toBe(false)
  })

  // Property 9 (D-30). Observed-red mutation: reading `startUrl` instead of the resolved
  // `navState.url` inside the persistence effect turns this red -- the value written would stay
  // frozen at the route's initial URL no matter how many real navigations followed.
  it('9. a resolved navigation persists the NEW url under last-url-<storeKey>', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      startUrl: 'https://store.steampowered.com/app/1',
      storeKey: 'steam'
    }

    const state = mount(options)
    jest.advanceTimersByTime(40)

    mockApi.storeEmbedBack.mockResolvedValueOnce({
      status: 'ok',
      navState: {
        url: 'https://store.steampowered.com/app/2',
        host: 'store.steampowered.com',
        canGoBack: true,
        canGoForward: true
      }
    })

    state.onBack()
    // Flushes the `storeEmbedBack().then(applyNavResult)` microtask chain -- two ticks: one for
    // the mocked promise's own resolution, one for the `.then()` callback queued after it.
    await Promise.resolve()
    await Promise.resolve()
    reinvoke(options)

    expect(fakeLocalStorage.get('last-url-steam')).toBe(
      'https://store.steampowered.com/app/2'
    )
  })
})
