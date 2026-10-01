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
let suppressionContextValue = {
  suppressed: false,
  acquire: jest.fn(),
  release: jest.fn()
}

// Stand-in for the DOM's ResizeObserver, absent under this project's `testEnvironment: 'node'`
// jest config. `observe()` auto-fires once, matching the real spec (an initial observation
// reports the element's current size immediately) -- this is what lets test 1 assert an `open()`
// call from mounting alone, with no separate manual trigger.
class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  callback: () => void
  // Recorded so a test can prove WHICH element a live observer is bound to (property 20/21): an
  // observer still bound to a detached element is the Linux dead-resize defect.
  observed: unknown = null
  disconnected = false
  constructor(callback: () => void) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }
  observe(target?: unknown): void {
    this.observed = target ?? null
    this.callback()
  }
  unobserve(): void {
    /* not used by this hook */
  }
  disconnect(): void {
    this.disconnected = true
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
  storeEmbedTakeNavEvents: jest.fn(),
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
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) =>
    fakeLocalStorage.has(key) ? fakeLocalStorage.get(key)! : null,
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
import {
  useStoreEmbedHost,
  type StoreEmbedHostState
} from '../useStoreEmbedHost'

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
    // The hook is keyed on the slot ELEMENT (`index.tsx`'s callback ref sets it on every attach
    // and detach), so the test's `slotRef` is only a carrier: its `.current` at render time is the
    // element the hook receives, null while the route renders no slot.
    slotNode: options.slotRef.current,
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
    suppressionContextValue = {
      suppressed: false,
      acquire: jest.fn(),
      release: jest.fn()
    }
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
    // The idle case: the drain effect polls on an interval, so EVERY test that advances timers
    // reaches it. An empty queue is what a user who has not navigated inside the embed produces.
    mockApi.storeEmbedTakeNavEvents.mockResolvedValue([])
  })

  afterEach(() => {
    jest.clearAllTimers()
  })

  // Property 1. Observed-red mutation: deleting the `if (!openedRef.current) { ... open ... }`
  // branch (or swapping it to always call `storeEmbedSetBounds` instead) turns this red --
  // `storeEmbedOpen` would never be called at all.
  it('1. mounting opens the embed with the start URL', () => {
    const { ref } = makeSlot({ x: 10, y: 20, width: 300, height: 400 })

    mount({
      slotRef: ref,
      startUrl: 'https://store.steampowered.com/',
      storeKey: 'steam'
    })
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

  // Property 3. Coalescing under DENSE ticks. The bounds sync is a leading-edge throttle with a
  // trailing flush (not a debounce), so a burst of ticks inside one interval collapses to at most
  // two sends -- the leading one and the trailing one -- however many ticks occur, and the
  // trailing send carries the LAST rect. Observed-red mutation: deleting the `trailingHandle ===
  // null` guard in `scheduleFlush` (re-arming the timer on every tick) turns the final-rect
  // assertion red by restoring the retired debounce.
  it('3. a burst of ticks inside one interval coalesces to leading + trailing, last rect winning', () => {
    const { ref, setRect } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })

    mount({ slotRef: ref })
    jest.advanceTimersByTime(40) // drains the initial open() call
    mockApi.storeEmbedSetBounds.mockClear()

    // Six ticks, 5ms apart -- all well inside one 40ms interval.
    for (let i = 1; i <= 6; i++) {
      setRect({ x: i, y: i, width: 100 + i, height: 100 + i })
      MockResizeObserver.instances[0].trigger()
      jest.advanceTimersByTime(5)
    }
    jest.advanceTimersByTime(40)

    // Six ticks, at most two sends -- IPC stays bounded, which is why the interval exists.
    expect(mockApi.storeEmbedSetBounds.mock.calls.length).toBeLessThanOrEqual(2)
    // ...and the embed comes to rest on the FINAL rect, never an intermediate one.
    expect(mockApi.storeEmbedSetBounds).toHaveBeenLastCalledWith({
      x: 6,
      y: 6,
      w: 106,
      h: 106
    })
  })

  // Property 3b. THE REGRESSION FROM THE 40-11 LIVE GATE (2026-09-05, Item 3: FAIL).
  //
  // The retired implementation was a pure trailing-edge debounce: every tick called
  // `clearTimeout` and re-armed the timer, so under SUSTAINED motion the timer was perpetually
  // reset and `flush()` never ran until the drag stopped. On hardware the embed updated "only on
  // mouse stopping or maybe being quite slow movement" while a browser tracked the pointer
  // smoothly. Every unit test was green over it, because none of them modelled sustained motion
  // -- they all advanced timers past the window and asserted the settled result.
  //
  // This test models the drag itself: continuous ticks with NO pause long enough to let a
  // debounce fire. Observed-red mutation: restoring `scheduleFlush` to the debounce form
  // (clearTimeout + re-arm on every tick) drives the send count to ZERO here.
  it('3b. sustained motion keeps sending during the drag, never only after it stops', () => {
    const { ref, setRect } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })

    mount({ slotRef: ref })
    jest.advanceTimersByTime(40) // drains the initial open() call
    mockApi.storeEmbedSetBounds.mockClear()

    // ~200ms of continuous drag: a tick every 10ms, never pausing for a full 40ms interval.
    for (let i = 1; i <= 20; i++) {
      setRect({ x: i, y: i, width: 100 + i, height: 100 + i })
      MockResizeObserver.instances[0].trigger()
      jest.advanceTimersByTime(10)
    }

    // WITHOUT advancing past the end of the drag: sends must already have happened. Over ~200ms
    // at a 40ms interval, forward progress means several -- the exact count is a scheduling
    // detail, but zero (the retired behaviour) and one are both failures.
    const duringDrag = mockApi.storeEmbedSetBounds.mock.calls.length
    expect(duringDrag).toBeGreaterThanOrEqual(3)

    // Bounded, not per-tick: 20 ticks must not become 20 IPC round-trips.
    expect(duringDrag).toBeLessThan(20)

    // Every send carries a real observed rect -- never a fallback (D-18).
    const sentBounds = mockApi.storeEmbedSetBounds.mock.calls as unknown as [
      { x: number; y: number; w: number; h: number }
    ][]
    for (const [bounds] of sentBounds) {
      expect(bounds.w).toBeGreaterThanOrEqual(101)
      expect(bounds.w).toBeLessThanOrEqual(120)
    }
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

    suppressionContextValue = {
      suppressed: true,
      acquire: jest.fn(),
      release: jest.fn()
    }
    reinvoke(options)
    expect(mockApi.storeEmbedHide).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedShow).not.toHaveBeenCalled()

    suppressionContextValue = {
      suppressed: false,
      acquire: jest.fn(),
      release: jest.fn()
    }
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

  // ── GAP-D (quick task `260905-e61`, REQ-40-06) ────────────────────────────────────────────
  //
  // Properties 1-9 above were ALL GREEN while GAP-D shipped, because every one of them drives a
  // navigation through a call the test itself makes -- `state.onBack()`, `startUrl` changing --
  // and reads the state that call returned. None of them could see the case the user actually
  // hit: a link clicked INSIDE the embed, which no renderer call initiates and which therefore
  // reached the renderer through nothing at all. That is the gap these three close.

  // Property 10. THE GAP-D REGRESSION TEST, and the todo's stated definition of done. Verified
  // RED against the pre-fix hook (which had no drain effect, so `canGoBack` stayed false and the
  // host stayed `af.gog.com` forever). The URLs are the todo's own reproduction: `/store/gog`
  // starts on the affiliate host and lands on `www.gog.com`, which is what made the frozen label
  // obvious there rather than merely subtle.
  it('10. an in-embed page load reaches the renderer — canGoBack and the host label both follow it', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      startUrl: 'https://af.gog.com/',
      storeKey: 'gog'
    }

    const initial = mount(options)
    expect(initial.host).toBe('af.gog.com')
    expect(initial.canGoBack).toBe(false)

    // What Rust's `on_page_load` Finished handler queued when the user clicked a link.
    mockApi.storeEmbedTakeNavEvents.mockResolvedValueOnce([
      {
        url: 'https://www.gog.com/game/foo',
        host: 'www.gog.com',
        canGoBack: true,
        canGoForward: false
      }
    ])

    jest.advanceTimersByTime(250)
    await Promise.resolve()
    await Promise.resolve()

    const after = reinvoke(options)
    expect(after.host).toBe('www.gog.com')
    expect(after.canGoBack).toBe(true)
    expect(after.currentUrl).toBe('https://www.gog.com/game/foo')
  })

  // Property 11. Observed-red mutation: applying `events[0]` instead of the last entry turns this
  // red -- a drain that catches up on several queued navigations would render the OLDEST of them
  // as the current page.
  it('11. a drain carrying several queued navigations applies the LAST one', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      startUrl: 'https://af.gog.com/',
      storeKey: 'gog'
    }

    mount(options)

    mockApi.storeEmbedTakeNavEvents.mockResolvedValueOnce([
      {
        url: 'https://www.gog.com/',
        host: 'www.gog.com',
        canGoBack: true,
        canGoForward: false
      },
      {
        url: 'https://www.gog.com/game/foo',
        host: 'www.gog.com',
        canGoBack: true,
        canGoForward: false
      },
      {
        url: 'https://www.gog.com/game/foo/reviews',
        host: 'www.gog.com',
        canGoBack: true,
        canGoForward: false
      }
    ])

    jest.advanceTimersByTime(250)
    await Promise.resolve()
    await Promise.resolve()

    expect(reinvoke(options).currentUrl).toBe(
      'https://www.gog.com/game/foo/reviews'
    )
  })

  // Property 12. Observed-red mutation: dropping `clearInterval` from the effect cleanup turns
  // this red. A poll that outlived the route would keep draining Rust's queue on a screen with no
  // embed on it, and — worse — would steal the events belonging to the NEXT visit, since the
  // drain is destructive.
  it('12. leaving the route stops the drain poll', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })

    mount({ slotRef: ref, startUrl: 'https://af.gog.com/', storeKey: 'gog' })
    jest.advanceTimersByTime(250)
    const callsWhileMounted = mockApi.storeEmbedTakeNavEvents.mock.calls.length
    expect(callsWhileMounted).toBeGreaterThan(0)

    harness().__unmount()
    jest.advanceTimersByTime(1000)

    expect(mockApi.storeEmbedTakeNavEvents).toHaveBeenCalledTimes(
      callsWhileMounted
    )
  })

  // ── CR-01 (quick task 260929-qth, D-05) ────────────────────────────────────────────────────
  //
  // The start-URL effect used to compare only the URL string -- a store->store switch (GOG ->
  // Epic) navigated the live embed into a KNOWN-but-non-embeddable store, loading the page that
  // carries the root-caused Talon fingerprint while hidden behind `WebviewUnavailablePanel`.
  // These four properties pin the target guard added to close that gap, and its two supporting
  // arms (the not-yet-open skip and the suppression-aware re-show).

  // Property 13. Observed-red mutation: comment out the `if (isRefusedTarget) { ... return }`
  // block. Falls through to the unconditional navigate at the end of the effect instead --
  // `storeEmbedHide` stays uncalled and `storeEmbedNavigate` fires with the Epic URL.
  it('13. a start-URL change to a known-non-embeddable store hides the embed and issues no navigation', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      startUrl: 'https://store.steampowered.com/',
      storeKey: 'steam'
    }

    mount(options)
    jest.advanceTimersByTime(40)

    reinvoke({
      ...options,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic'
    })

    expect(mockApi.storeEmbedHide).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedNavigate).not.toHaveBeenCalled()
  })

  // Property 14. THE PLAN'S PIVOTAL CORRECTION. Observed-red mutation (orchestrator amendment,
  // binding over the plan's own generic instruction): broaden the guard predicate to the literal
  // `!isEmbeddableOrigin(startUrl)` -- i.e. drop the `resolvedTarget !== null &&` half of
  // `isRefusedTarget`. `isEmbeddableOrigin` of the wiki's github URL is `false` (it resolves to
  // no configured store at all), so the literal predicate is ALSO true for the wiki and would
  // hide it instead of navigating it -- reddening this test's `storeEmbedNavigate` assertion.
  it('14. a start-URL change to the wiki route still navigates and does not hide the embed', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      startUrl: 'https://store.steampowered.com/',
      storeKey: 'steam'
    }

    mount(options)
    jest.advanceTimersByTime(40)

    reinvoke({
      ...options,
      startUrl:
        'https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki',
      storeKey: 'wiki'
    })

    expect(mockApi.storeEmbedNavigate).toHaveBeenCalledWith(
      'https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki'
    )
    expect(mockApi.storeEmbedHide).not.toHaveBeenCalled()
  })

  // Property 15. Observed-red mutation: comment out the `if (refusedTargetRef.current) { ...
  // }` visibility-restore block in its entirety. `storeEmbedShow` never fires, so the embed
  // stays stranded hidden after a return to an embeddable target.
  it('15. returning from a non-embeddable target to an embeddable one re-shows the embed then navigates', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      startUrl: 'https://store.steampowered.com/',
      storeKey: 'steam'
    }

    mount(options)
    jest.advanceTimersByTime(40)

    reinvoke({
      ...options,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic'
    })
    expect(mockApi.storeEmbedHide).toHaveBeenCalledTimes(1)

    reinvoke({
      ...options,
      startUrl: 'https://af.gog.com?as=1838482841',
      storeKey: 'gog'
    })

    expect(mockApi.storeEmbedShow).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedNavigate).toHaveBeenCalledWith(
      'https://af.gog.com?as=1838482841'
    )
  })

  // Property 16. Observed-red mutation: comment out ONLY the nested `if (!suppressed)` guard
  // around the restore's `storeEmbedShow` call (leaving the outer latch-clear in place), so the
  // show call fires unconditionally -- reddening the "zero calls while suppressed" assertion.
  it('16. returning from a non-embeddable target to an embeddable one while suppressed does not re-show, but still navigates', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      startUrl: 'https://store.steampowered.com/',
      storeKey: 'steam'
    }

    mount(options)
    jest.advanceTimersByTime(40)

    reinvoke({
      ...options,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic'
    })
    expect(mockApi.storeEmbedHide).toHaveBeenCalledTimes(1)

    suppressionContextValue = {
      suppressed: true,
      acquire: jest.fn(),
      release: jest.fn()
    }
    reinvoke({
      ...options,
      startUrl: 'https://af.gog.com?as=1838482841',
      storeKey: 'gog'
    })

    expect(mockApi.storeEmbedShow).not.toHaveBeenCalled()
    expect(mockApi.storeEmbedNavigate).toHaveBeenCalledWith(
      'https://af.gog.com?as=1838482841'
    )
  })

  // ── CR-02 (quick task 260929-qth) ──────────────────────────────────────────────────────────
  //
  // The open/bounds effect used to be mount-once (`[]` deps) and early-return on a null slot.
  // Some routes (deep-link/platform/Epic early returns in `index.tsx`) render no slot div on
  // their first pass, so a cold start on one of those routes then a same-mount navigation to a
  // store that DOES render a slot left the embed permanently unopened -- `App.tsx` registers one
  // `path: 'store/:store'` route, and React Router does not remount on a param-only change.
  // These three properties pin the slot-element-keyed re-arm added to close that gap (originally
  // keyed on a one-way `slotPresent` latch; re-keyed on the element itself for the Linux
  // dead-resize fix, see properties 20/21).

  // Property 17. Observed-red mutation: revert the effect's dependency array from
  // `[slotNode]` back to `[]`. The effect then never re-runs once the slot attaches on the
  // later render, so `storeEmbedOpen` stays uncalled -- reddening the "called once" assertion.
  it('17. a slot that first attaches on a later render opens the embed exactly once at the then-current start URL', () => {
    const nullRef = { current: null } as RefObject<HTMLDivElement>
    const options: MountOptions = {
      slotRef: nullRef,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic'
    }

    mount(options)
    jest.advanceTimersByTime(40)

    expect(mockApi.storeEmbedOpen).not.toHaveBeenCalled()
    expect(mockApi.logInfo).toHaveBeenCalledWith(
      expect.stringContaining('slot ref is null')
    )

    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    reinvoke({
      ...options,
      slotRef: ref,
      startUrl: 'https://af.gog.com?as=1838482841',
      storeKey: 'gog'
    })
    jest.advanceTimersByTime(40)

    expect(mockApi.storeEmbedOpen).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedOpen).toHaveBeenCalledWith(
      'https://af.gog.com?as=1838482841',
      { x: 0, y: 0, w: 100, h: 100 },
      'gog'
    )
  })

  // Property 18. Observed-red mutation: add `startUrl` to the dependency array alongside
  // `slotNode` (i.e. `[slotNode, startUrl]`). A same-store `startUrl`-only change then
  // re-runs the effect, tearing down and re-creating the ResizeObserver and both window
  // listeners on every navigation -- reddening the "counts unchanged" assertions. This is the
  // Chesterton's-fence proof for the plan 40-11 live gate's fix: the observer's identity must
  // outlive a same-store URL change or the leading-edge throttle is defeated on every
  // navigation.
  it('18. a same-store start-URL change leaves the observer instance and window listener counts unchanged', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      startUrl: 'https://store.steampowered.com/',
      storeKey: 'steam'
    }

    mount(options)
    jest.advanceTimersByTime(40)

    const instanceCountBefore = MockResizeObserver.instances.length
    const resizeListenerCountBefore = windowListeners.get('resize')?.size ?? 0
    const scrollListenerCountBefore = windowListeners.get('scroll')?.size ?? 0

    reinvoke({
      ...options,
      startUrl: 'https://af.gog.com?as=1838482841',
      storeKey: 'gog'
    })
    jest.advanceTimersByTime(40)

    expect(MockResizeObserver.instances.length).toBe(instanceCountBefore)
    expect(windowListeners.get('resize')?.size ?? 0).toBe(
      resizeListenerCountBefore
    )
    expect(windowListeners.get('scroll')?.size ?? 0).toBe(
      scrollListenerCountBefore
    )
  })

  // Property 19. Observed-red mutation: remove the `previousUrlRef.current = startUrl` seed line
  // from `flush()`'s `!openedRef.current` branch. The start-url effect then sees its own
  // `previousUrlRef.current` still at its initial `null` / stale value when the slot arrives
  // late, treats the already-just-opened URL as a change, and issues a redundant
  // `storeEmbedNavigate` call right after `storeEmbedOpen` -- reddening the "never called"
  // assertion.
  it('19. an open that lands after a start-URL change is not followed by a redundant navigation to the URL just opened', () => {
    const nullRef = { current: null } as RefObject<HTMLDivElement>
    const options: MountOptions = {
      slotRef: nullRef,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic'
    }

    mount(options)
    jest.advanceTimersByTime(40)

    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    reinvoke({
      ...options,
      slotRef: ref,
      startUrl: 'https://af.gog.com?as=1838482841',
      storeKey: 'gog'
    })
    jest.advanceTimersByTime(40)

    expect(mockApi.storeEmbedOpen).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedNavigate).not.toHaveBeenCalled()
  })

  // ── Linux dead-resize after the Epic round trip (debug session
  //    linux-embed-resize-dead-after-epic-roundtrip) ─────────────────────────────────────────
  //
  // `App.tsx` registers ONE `store/:store` route, so GOG -> Epic -> GOG does not remount
  // `WebView`. Only its `store === 'epic'` early return swaps the slot element out (ref -> null)
  // and, on the way back, a BRAND-NEW slot element in. `index.tsx`'s old latch stayed high
  // throughout (it was one-way), so a hook keyed on the latch alone never re-armed: the ResizeObserver, the
  // `resize`/`scroll` listeners and `flush()`'s closed-over element all stay bound to the DETACHED
  // element, whose rect is all zero. Live: 0 settled lines, one "ignored zero-area bounds" line per
  // window resize, the embed left overhanging the window (s1 launch of quick 260930-feh).
  //
  // These two tests model that exact sequence: the ref goes element A -> null -> element B (the
  // old latch stayed TRUE the whole time, which is why it never re-armed).

  // Property 20. Observed-red mutation: key the bounds effect on a ONE-WAY latch that never
  // lowers (a ref set true the first time `slotNode` is non-null, deps `[latchRef.current]`) --
  // the pre-fix behaviour. The observer then stays bound to A, and the resize below sends A's
  // zero rect instead of B's. (Keying on `[!!slotNode]` is NOT that mutation: it lowers on the
  // Epic leg and re-arms, so it stays green.) Observed red both against the pre-fix hook and
  // against the latch mutation.
  it('20. after the slot element is replaced (Epic round trip) the new element is observed and later bounds come from it', () => {
    const a = makeSlot({ x: 204, y: 82, width: 1076, height: 718 })
    const options: MountOptions = {
      slotRef: a.ref,
      startUrl: 'https://af.gog.com?as=1838482841',
      storeKey: 'gog'
    }
    mount(options)
    jest.advanceTimersByTime(40)
    expect(mockApi.storeEmbedOpen).toHaveBeenCalledTimes(1)

    // GOG -> Epic: the slot element is unmounted; a detached element measures all zero.
    a.setRect({ x: 0, y: 0, width: 0, height: 0 })
    reinvoke({
      ...options,
      slotRef: { current: null } as RefObject<HTMLDivElement>
    })
    jest.advanceTimersByTime(40)

    // Epic -> GOG: a brand-new slot element, same route instance, latch still true.
    const b = makeSlot({ x: 204, y: 82, width: 1076, height: 718 })
    reinvoke({ ...options, slotRef: b.ref })
    jest.advanceTimersByTime(40)

    // Exactly one live observer, and it is bound to B (never to the detached A).
    const live = MockResizeObserver.instances.filter((o) => !o.disconnected)
    expect(live).toHaveLength(1)
    expect(live[0].observed).toBe(b.ref.current)

    // The window is resized: the bounds sent must be B's rect, not A's zero rect.
    b.setRect({ x: 204, y: 82, width: 896, height: 568 })
    mockApi.storeEmbedSetBounds.mockClear()
    dispatchWindowEvent('resize')
    jest.advanceTimersByTime(40)
    expect(mockApi.storeEmbedSetBounds).toHaveBeenLastCalledWith({
      x: 204,
      y: 82,
      w: 896,
      h: 568
    })

    // ...and the observer path (not only the window listener) also reports B.
    b.setRect({ x: 204, y: 82, width: 796, height: 518 })
    live[0].trigger()
    jest.advanceTimersByTime(40)
    expect(mockApi.storeEmbedSetBounds).toHaveBeenLastCalledWith({
      x: 204,
      y: 82,
      w: 796,
      h: 518
    })
    // The embed was opened once, at mount, and never re-opened by the round trip.
    expect(mockApi.storeEmbedOpen).toHaveBeenCalledTimes(1)
  })

  // Property 21. Observed-red mutation: same as 20. While the route renders no slot (Epic
  // panel), a window resize must not read the detached element and send its zero rect to the
  // shell, and the old observer/listeners must be gone.
  it('21. while the slot element is unmounted a window resize sends nothing and the old observer is disconnected', () => {
    const a = makeSlot({ x: 204, y: 82, width: 1076, height: 718 })
    const options: MountOptions = {
      slotRef: a.ref,
      startUrl: 'https://af.gog.com?as=1838482841',
      storeKey: 'gog'
    }
    mount(options)
    jest.advanceTimersByTime(40)

    a.setRect({ x: 0, y: 0, width: 0, height: 0 })
    reinvoke({
      ...options,
      slotRef: { current: null } as RefObject<HTMLDivElement>
    })
    jest.advanceTimersByTime(40)

    mockApi.storeEmbedSetBounds.mockClear()
    dispatchWindowEvent('resize')
    dispatchWindowEvent('scroll')
    jest.advanceTimersByTime(80)

    expect(mockApi.storeEmbedSetBounds).not.toHaveBeenCalled()
    expect(
      MockResizeObserver.instances.filter((o) => !o.disconnected)
    ).toHaveLength(0)
    expect(windowListeners.get('resize')?.size ?? 0).toBe(0)
    expect(windowListeners.get('scroll')?.size ?? 0).toBe(0)
  })

  // ── Validated persist (debug session linux-embed-gog-reload-loop-real-profile) ─────────────
  //
  // `last-url-<storeKey>` is the app-restart restore value, and `index.tsx` throws away anything
  // that does not resolve to the ROUTE's own store. The persist effect used to write whatever the
  // embed's last main-frame URL was, so it poisoned that key with values the read side then had
  // to reject: the tracker interstitial GOG's affiliate start URL redirects through, and -- on a
  // store switch, because the effect is also keyed on `storeKey` -- the PREVIOUS store's URL under
  // the NEW store's key. These tests pin that the write side now accepts exactly what the read
  // side accepts. Properties 8-9 above still pin that a real, valid navigation persists.

  /** Drains one queued in-embed navigation through the 250 ms poll and re-renders, as a page load does. */
  async function drainNavigation(
    options: MountOptions,
    url: string
  ): Promise<void> {
    mockApi.storeEmbedTakeNavEvents.mockResolvedValueOnce([
      { url, host: new URL(url).host, canGoBack: true, canGoForward: false }
    ])
    jest.advanceTimersByTime(250)
    await Promise.resolve()
    await Promise.resolve()
    reinvoke(options)
  }

  // Property 22. Observed-red mutation: delete the `resolveStoreForUrl(navState.url)` ownership
  // check in the persist effect (write unconditionally, the pre-fix behaviour). The tracker URL
  // below is then stored under `last-url-gog` and the first assertion fails.
  it('22. a redirect-chain page that belongs to no store (the tracker interstitial) is NOT persisted; the landing page is', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      startUrl: 'https://af.gog.com?as=1838482841',
      storeKey: 'gog'
    }
    mount(options)
    jest.advanceTimersByTime(40)

    await drainNavigation(
      options,
      'https://track.adtraction.com/t/t?a=1&as=1838482841&t=2&tk=1&url=http://www.gog.com'
    )
    expect(fakeLocalStorage.has('last-url-gog')).toBe(false)

    // The same chain's landing page IS a gog.com page and is what a restart should restore.
    await drainNavigation(
      options,
      'https://www.gog.com/en/?utm_source=adtraction&utm_medium=affiliate'
    )
    expect(fakeLocalStorage.get('last-url-gog')).toBe(
      'https://www.gog.com/en/?utm_source=adtraction&utm_medium=affiliate'
    )
  })

  // Property 23. Observed-red mutation: same as 22. The pre-fix effect re-ran on the `storeKey`
  // change below with the previous store's `navState.url` and wrote the Epic URL under
  // `last-url-gog` -- deterministic, so the restore was lost on every Epic -> GOG.
  it('23. a store switch does not write the PREVIOUS store’s URL under the NEW store’s key', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const epicOptions: MountOptions = {
      slotRef: ref,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic'
    }
    mount(epicOptions)
    jest.advanceTimersByTime(40)

    reinvoke({
      ...epicOptions,
      startUrl: 'https://af.gog.com?as=1838482841',
      storeKey: 'gog'
    })
    jest.advanceTimersByTime(40)

    expect(fakeLocalStorage.has('last-url-gog')).toBe(false)
    // Nor is the Epic URL left behind under its own key: nothing navigated, so nothing persists.
    expect(fakeLocalStorage.has('last-url-epic')).toBe(false)
  })

  // Property 24. Observed-red mutation: same as 22. A link inside the GOG embed that lands on
  // another configured store is a real navigation but not a GOG page; it must not become GOG's
  // restore value (the read side would reject it and clear the key).
  it('24. a navigation that lands on a DIFFERENT configured store is not persisted under this store’s key', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      startUrl: 'https://af.gog.com?as=1838482841',
      storeKey: 'gog'
    }
    mount(options)
    jest.advanceTimersByTime(40)

    await drainNavigation(options, 'https://store.steampowered.com/app/220/')

    expect(fakeLocalStorage.has('last-url-gog')).toBe(false)
  })

  // Property 25. A page of the route's own store keeps being persisted after a rejected one: a
  // rejected URL must not latch the effect or clear a previously stored good value.
  it('25. a rejected navigation leaves the previously persisted good value in place', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      startUrl: 'https://af.gog.com?as=1838482841',
      storeKey: 'gog'
    }
    mount(options)
    jest.advanceTimersByTime(40)

    await drainNavigation(options, 'https://www.gog.com/en/game/foo')
    expect(fakeLocalStorage.get('last-url-gog')).toBe(
      'https://www.gog.com/en/game/foo'
    )

    await drainNavigation(options, 'https://track.adtraction.com/t/t?a=1')
    expect(fakeLocalStorage.get('last-url-gog')).toBe(
      'https://www.gog.com/en/game/foo'
    )
  })
})
