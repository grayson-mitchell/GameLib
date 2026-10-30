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

// Stand-in for the DOM's MutationObserver (quick 261012-gn8), absent under `testEnvironment:
// 'node'`. Unlike the ResizeObserver stub, `observe()` does NOT auto-fire: a real
// MutationObserver reports only LATER mutations, never the current state.
class MockMutationObserver {
  static instances: MockMutationObserver[] = []
  callback: () => void
  observed: unknown = null
  options: unknown = null
  disconnected = false
  constructor(callback: () => void) {
    this.callback = callback
    MockMutationObserver.instances.push(this)
  }
  observe(target?: unknown, options?: unknown): void {
    this.observed = target ?? null
    this.options = options ?? null
  }
  disconnect(): void {
    this.disconnected = true
  }
  trigger(): void {
    this.callback()
  }
}
;(
  globalThis as unknown as { MutationObserver: typeof MockMutationObserver }
).MutationObserver = MockMutationObserver

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

// Zoom stub (quick 261012-gn8). Properties 1-25 run with NO `document` global; only the
// zoom-aware describe block installs one, through `setRootZoom`. `rootZoomValue` is a variable,
// not a constant, because later tests mutate it mid-test to model the preload publishing
// `--webview-zoom` after `setZoom` resolves.
let rootZoomValue = ''
// One stable object, so a test can prove which element the MutationObserver is bound to.
const rootStub = {
  style: {
    getPropertyValue: (name: string) =>
      name === '--webview-zoom' ? rootZoomValue : ''
  }
}
function setRootZoom(value: string): void {
  rootZoomValue = value
  ;(globalThis as unknown as { document: unknown }).document = {
    documentElement: rootStub
  }
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
  resetStoreEmbedSignInBaselines,
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
  /**
   * Defaults to a non-`darwin` platform (Phase 50 Plan 01) so every existing test's Epic-refusal
   * assertions keep testing the D-05 "known, non-embeddable-HERE store" path unchanged. Tests
   * that need the macOS Epic-embeddable path pass `platform: 'darwin'` explicitly.
   */
  platform?: string
  /**
   * Phase 50 Plan 05 (D-04): the resolved Epic sign-in state. Defaults to a fixed, arbitrary
   * value -- every existing test leaves this unchanged across its own `reinvoke` calls, so the
   * hook's new auth-triggered reload never arms for them regardless of what the default is.
   */
  signInState?: string
  /** Quick 261030-qqh: the Steam store-exit callback under test. */
  onSteamStoreExit?: () => void
  /** Quick 261030-ts4: the generalised store-exit callback under test. */
  onStoreExit?: (storeKey: string) => void
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
    isStoreRoute: options.isStoreRoute ?? true,
    platform: options.platform ?? 'linux',
    signInState: options.signInState ?? 'connected',
    onStoreExit:
      options.onSteamStoreExit || options.onStoreExit
        ? (key) => {
            if (key === 'steam') options.onSteamStoreExit?.()
            options.onStoreExit?.(key)
          }
        : undefined
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
    // The D-04 sign-in baseline is module-level since review finding 9 (it must outlive an
    // unmount), so each test starts from an empty one.
    resetStoreEmbedSignInBaselines()
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

  // ── Epic nav-signal surfacing (Phase 50 Plan 05, D-07/D-10/D-11/D-14) ──────────────────────
  //
  // Plan 02 (Rust) emits three new OPTIONAL `StoreEmbedNavEvent` fields on an `'epic'` surface
  // only: `loadTimedOut`, `challenged`, `blockedLauncherSchemeCount`. This hook's existing
  // 250 ms drain (GAP-D, above) is the only thing that ever collects any nav event field, so it
  // is the only thing that can surface these three too -- these properties pin that it does,
  // without a second poll loop, a new `storeEmbedSetBounds`/`storeEmbedOpen` call site, or a
  // plain boolean for the blocked-scheme signal (a coalescing drain applying only the LAST event
  // per tick could otherwise collapse several blocked attempts into one, which is exactly why
  // Rust counts rather than flags it -- see the implementation's own comment for the full
  // reasoning once this turns green).

  /** Drains one queued Epic nav event carrying one or more of the three new Plan 02 fields. */
  async function drainEpicNavEvent(
    options: MountOptions,
    overrides: {
      loadTimedOut?: boolean
      challenged?: boolean
      blockedLauncherSchemeCount?: number
    }
  ): Promise<StoreEmbedHostState> {
    mockApi.storeEmbedTakeNavEvents.mockResolvedValueOnce([
      {
        url: 'https://www.epicgames.com/store/en-US/',
        host: 'www.epicgames.com',
        canGoBack: true,
        canGoForward: false,
        surface: 'epic',
        ...overrides
      }
    ])
    jest.advanceTimersByTime(250)
    await Promise.resolve()
    await Promise.resolve()
    return reinvoke(options)
  }

  // Property 26. Observed-red mutation: deriving `loadTimedOut` from the LATEST drain tick
  // instead of the latest NAV EVENT (e.g. resetting it whenever an empty array drains) turns
  // this red -- an idle poll tick carries no event at all and must not erase a flag a real
  // event already set.
  it('26. an empty drain tick leaves a previously-surfaced loadTimedOut flag unchanged', async () => {
    const options: MountOptions = {
      slotRef: makeSlot({ x: 0, y: 0, width: 100, height: 100 }).ref,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic',
      platform: 'darwin'
    }
    mount(options)
    jest.advanceTimersByTime(40)

    const after = await drainEpicNavEvent(options, { loadTimedOut: true })
    expect(after.loadTimedOut).toBe(true)

    // The idle default (`mockResolvedValue([])` from `beforeEach`) drains an empty queue next --
    // nothing is applied on an empty array (the pre-existing `if (latest) setNavState(latest)`
    // guard), so the flag must still read true.
    jest.advanceTimersByTime(250)
    await Promise.resolve()
    await Promise.resolve()
    const final = reinvoke(options)

    expect(final.loadTimedOut).toBe(true)
  })

  // Property 27. Observed-red mutation: never reading `navState.challenged` at all (e.g. a
  // typo'd field name) turns this red -- `challenged` would stay `false` forever regardless of
  // what Rust reports.
  it('27. a surfaced challenged flag reflects the latest drained nav event', async () => {
    const options: MountOptions = {
      slotRef: makeSlot({ x: 0, y: 0, width: 100, height: 100 }).ref,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic',
      platform: 'darwin'
    }
    const initial = mount(options)
    jest.advanceTimersByTime(40)
    expect(initial.challenged).toBe(false)

    const after = await drainEpicNavEvent(options, { challenged: true })
    expect(after.challenged).toBe(true)
  })

  // Property 46. Observed-red: today's drain applies `events[events.length - 1]` wholesale, so a
  // one-shot `loadTimedOut: true` raise followed by later `loadTimedOut: false` events IN THE
  // SAME BATCH is coalesced away. This is the exact live-run shape of G-50-16: raise, then the
  // -999 failure, then the next provisional start, all landing inside one 250 ms poll interval.
  it('46. a loadTimedOut raise survives later false events in the same drain batch', async () => {
    const options: MountOptions = {
      slotRef: makeSlot({ x: 0, y: 0, width: 100, height: 100 }).ref,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic',
      platform: 'darwin'
    }
    mount(options)
    jest.advanceTimersByTime(40)

    mockApi.storeEmbedTakeNavEvents.mockResolvedValueOnce([
      {
        url: 'https://www.epicgames.com/store/en-US/',
        host: 'www.epicgames.com',
        canGoBack: true,
        canGoForward: false,
        surface: 'epic',
        loadTimedOut: true
      },
      {
        url: 'https://www.epicgames.com/store/en-US/',
        host: 'www.epicgames.com',
        canGoBack: true,
        canGoForward: false,
        surface: 'epic',
        loadTimedOut: false
      },
      {
        url: 'https://www.epicgames.com/store/en-US/',
        host: 'www.epicgames.com',
        canGoBack: true,
        canGoForward: false,
        surface: 'epic',
        loadTimedOut: false
      }
    ])
    jest.advanceTimersByTime(250)
    await Promise.resolve()
    await Promise.resolve()
    const after = reinvoke(options)

    expect(after.loadTimedOut).toBe(true)
  })

  // Property 47. Boundary guard, green both before and after the fix: the latch must hold only
  // WITHIN a batch, not forever. A later drain batch carrying only `loadTimedOut: false` must
  // still clear the flag, or a genuine finish (D-07) would leave the banner stuck up
  // permanently. This is not an observed-red property -- it guards against over-fixing rather
  // than pinning the bug itself.
  it('47. a later all-false drain batch still clears a previously-surfaced loadTimedOut flag', async () => {
    const options: MountOptions = {
      slotRef: makeSlot({ x: 0, y: 0, width: 100, height: 100 }).ref,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic',
      platform: 'darwin'
    }
    mount(options)
    jest.advanceTimersByTime(40)

    const raised = await drainEpicNavEvent(options, { loadTimedOut: true })
    expect(raised.loadTimedOut).toBe(true)

    mockApi.storeEmbedTakeNavEvents.mockResolvedValueOnce([
      {
        url: 'https://www.epicgames.com/store/en-US/',
        host: 'www.epicgames.com',
        canGoBack: true,
        canGoForward: false,
        surface: 'epic',
        loadTimedOut: false
      }
    ])
    jest.advanceTimersByTime(250)
    await Promise.resolve()
    await Promise.resolve()
    const after = reinvoke(options)

    expect(after.loadTimedOut).toBe(false)
  })

  // Property 28. Observed-red mutation: seeding the baseline from `0`/`undefined` instead of the
  // first OBSERVED count turns this red -- a store whose count starts above zero (a restored
  // session) would fire a spurious notice on its very first drain.
  it('28. the first-ever drained blocked-launcher-scheme count seeds a null baseline, firing no notice', async () => {
    const options: MountOptions = {
      slotRef: makeSlot({ x: 0, y: 0, width: 100, height: 100 }).ref,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic',
      platform: 'darwin'
    }
    mount(options)
    jest.advanceTimersByTime(40)

    const after = await drainEpicNavEvent(options, {
      blockedLauncherSchemeCount: 3
    })

    expect(after.launcherSchemeBlockedAt).toBeNull()
  })

  // Property 29. Observed-red mutation: comparing for inequality instead of strictly-greater
  // (`count !== baseline`) turns this red -- a drain re-reporting the SAME count (a coalesced
  // tick, not a new attempt) would fire a second notice for one attempt.
  it('29. a later drain carrying a HIGHER blocked-launcher-scheme count fires a fresh notice; an EQUAL one does not', async () => {
    const options: MountOptions = {
      slotRef: makeSlot({ x: 0, y: 0, width: 100, height: 100 }).ref,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic',
      platform: 'darwin'
    }
    mount(options)
    jest.advanceTimersByTime(40)

    const seeded = await drainEpicNavEvent(options, {
      blockedLauncherSchemeCount: 1
    })
    expect(seeded.launcherSchemeBlockedAt).toBeNull()

    await drainEpicNavEvent(options, { blockedLauncherSchemeCount: 2 })
    // The effect that fires the notice runs during THIS render pass, after this render's own
    // `useState()` read already captured the pre-effect value -- exactly like real React, where
    // a `setState` call inside `useEffect` only becomes visible on the FOLLOWING render. One
    // more render (deps unchanged, so the effect itself does not re-run) is what surfaces it.
    const settled = reinvoke(options)
    expect(settled.launcherSchemeBlockedAt).not.toBeNull()

    const unchanged = await drainEpicNavEvent(options, {
      blockedLauncherSchemeCount: 2
    })
    expect(unchanged.launcherSchemeBlockedAt).toBe(
      settled.launcherSchemeBlockedAt
    )
  })

  // Property 30. Observed-red mutation: showing the embed BEFORE the navigate call resolves (or
  // not navigating at all) turns this red -- D-10's retry must re-point the embed at the start
  // URL first, so a stale challenged page is never shown for even one frame.
  it('30. onTryAgain navigates to the start URL and re-shows the embed, in that order', async () => {
    const options: MountOptions = {
      slotRef: makeSlot({ x: 0, y: 0, width: 100, height: 100 }).ref,
      startUrl: 'https://www.epicgames.com/store/en-US/',
      storeKey: 'epic',
      platform: 'darwin'
    }
    mockApi.storeEmbedNavigate.mockResolvedValueOnce({
      status: 'ok',
      navState: {
        url: 'https://www.epicgames.com/store/en-US/',
        host: 'www.epicgames.com',
        canGoBack: false,
        canGoForward: false
      }
    })
    const state = mount(options)
    jest.advanceTimersByTime(40)

    state.onTryAgain()
    await Promise.resolve()
    await Promise.resolve()

    expect(mockApi.storeEmbedNavigate).toHaveBeenCalledWith(
      'https://www.epicgames.com/store/en-US/'
    )
    expect(mockApi.storeEmbedShow).toHaveBeenCalled()
    expect(mockApi.storeEmbedNavigate.mock.invocationCallOrder[0]).toBeLessThan(
      mockApi.storeEmbedShow.mock.invocationCallOrder[0]
    )
  })

  // ── AUTH-TRIGGERED RELOAD ON RETURN (Phase 50 Plan 05, D-04) ──────────────────────────────
  //
  // Drives the suppression effect's show transition (`suppressionContextValue`, mirroring test
  // 5's own toggle-and-`reinvoke` pattern) rather than the start-URL effect's refused-target
  // path -- both are named in the plan as "a show already happens" sites and the hook wires the
  // same compare-and-reload into each, so exercising one is sufficient to pin the shared logic;
  // the other site is structurally identical.
  function toggleSuppressionShow(options: MountOptions): void {
    suppressionContextValue = {
      suppressed: true,
      acquire: jest.fn(),
      release: jest.fn()
    }
    reinvoke(options)
    suppressionContextValue = {
      suppressed: false,
      acquire: jest.fn(),
      release: jest.fn()
    }
    reinvoke(options)
  }

  // Property 31. Observed-red mutation: seeding `signInStateAtLoadRef` from `null`/`undefined`
  // instead of the OPTION's own value turns this red -- the very first show after mount would
  // read a mismatch against any real `signInState` and fire a reload nobody asked for.
  it('31. the first open seeds the sign-in-state baseline, and repeated show transitions with an unchanged state reload nothing', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      storeKey: 'epic',
      platform: 'darwin',
      isStoreRoute: true,
      signInState: 'connected'
    }

    mount(options)
    jest.advanceTimersByTime(40)

    toggleSuppressionShow(options)
    toggleSuppressionShow(options)
    toggleSuppressionShow(options)

    expect(mockApi.storeEmbedReload).not.toHaveBeenCalled()
  })

  // Property 32. Observed-red mutation: a standalone effect keyed on `signInState` alone (the
  // shape the plan explicitly forbids) turns this red -- it would reload the instant the value
  // changes, while the panel is still visible, instead of waiting for the next show.
  it('32. a sign-in-state change while the subview is visible reloads nothing; the next show transition then reloads exactly once', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      storeKey: 'epic',
      platform: 'darwin',
      isStoreRoute: true,
      signInState: 'connected'
    }

    mount(options)
    jest.advanceTimersByTime(40)

    // The value changes while nothing is hiding/showing -- no reload yet.
    const changed: MountOptions = { ...options, signInState: 'expired' }
    reinvoke(changed)
    expect(mockApi.storeEmbedReload).not.toHaveBeenCalled()

    // The next show transition carries the already-changed value -- exactly one reload, and it
    // follows the show (D-10/D-11's own ordering requirement, mirrored here for the new reload).
    toggleSuppressionShow(changed)

    expect(mockApi.storeEmbedReload).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedShow.mock.invocationCallOrder[0]).toBeLessThan(
      mockApi.storeEmbedReload.mock.invocationCallOrder[0]
    )
  })

  // Property 33. Observed-red mutation: comparing with `===` instead of `!==` (or hardcoding one
  // direction) turns this red -- a connected -> expired transition would be silently treated the
  // same as no change at all.
  it('33. a show transition carrying a connected-to-expired change reloads exactly once', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      storeKey: 'epic',
      platform: 'darwin',
      isStoreRoute: true,
      signInState: 'connected'
    }

    mount(options)
    jest.advanceTimersByTime(40)

    toggleSuppressionShow({ ...options, signInState: 'expired' })

    expect(mockApi.storeEmbedReload).toHaveBeenCalledTimes(1)
  })

  // Property 34. Observed-red mutation: a one-way check (e.g. only firing when the new value is
  // `'expired'`) turns this red -- the trigger is any transition, not a move toward one specific
  // value (direction-agnostic, mirroring property 33 in the opposite direction).
  it('34. a show transition carrying an expired-to-connected change also reloads exactly once', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      storeKey: 'epic',
      platform: 'darwin',
      isStoreRoute: true,
      signInState: 'expired'
    }

    mount(options)
    jest.advanceTimersByTime(40)

    toggleSuppressionShow({ ...options, signInState: 'connected' })

    expect(mockApi.storeEmbedReload).toHaveBeenCalledTimes(1)
  })

  // Property 35. Observed-red mutation: dropping the `isEpicSurface` guard (reloading on any
  // store's show transition) turns this red -- a Tauri-managed store would lose its instant-
  // return semantics on every sign-in-state change, which this plan explicitly keeps unaffected.
  it('35. the reload is gated to the Epic surface -- a non-Epic store reloads nothing even across a changed-state show transition', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const options: MountOptions = {
      slotRef: ref,
      storeKey: 'steam',
      platform: 'darwin',
      isStoreRoute: true,
      signInState: 'connected'
    }

    mount(options)
    jest.advanceTimersByTime(40)

    toggleSuppressionShow({ ...options, signInState: 'expired' })

    expect(mockApi.storeEmbedReload).not.toHaveBeenCalled()
  })

  // ── STORE SWITCH ACROSS SURFACES ON macOS (Phase 50 review finding 1, D-02) ───────────────
  //
  // `store/:store` is one route, so `/store/gog` -> `/store/epic` keeps the same mounted
  // `WebView` AND (since Phase 50 removed the darwin Epic early return) the same slot element:
  // the open effect does not re-run, and the start-URL effect is what sees the switch. On darwin
  // the two stores live on DIFFERENT native surfaces (Tauri child webview vs the raw Epic
  // `WKWebView`), and only `store_embed_open` (keyed by storeKey) switches between them --
  // `store_embed_navigate` navigates whichever surface is currently selected. RED before the fix:
  // both directions issued `storeEmbedNavigate(<other store's url>)` and no second open.
  const GOG_URL = 'https://af.gog.com?as=1838482841'
  const EPIC_URL = 'https://www.epicgames.com/store/en-US/'
  const STEAM_URL = 'https://store.steampowered.com/'

  it('36. darwin: switching gog -> epic in the mounted WebView re-opens with storeKey epic, never navigates', () => {
    const { ref } = makeSlot({ x: 1, y: 2, width: 300, height: 400 })
    const gog: MountOptions = {
      slotRef: ref,
      startUrl: GOG_URL,
      storeKey: 'gog',
      platform: 'darwin'
    }

    mount(gog)
    jest.advanceTimersByTime(40)
    expect(mockApi.storeEmbedOpen).toHaveBeenCalledTimes(1)

    reinvoke({ ...gog, startUrl: EPIC_URL, storeKey: 'epic' })

    expect(mockApi.storeEmbedOpen).toHaveBeenCalledTimes(2)
    expect(mockApi.storeEmbedOpen).toHaveBeenLastCalledWith(
      EPIC_URL,
      { x: 1, y: 2, w: 300, h: 400 },
      'epic'
    )
    expect(mockApi.storeEmbedNavigate).not.toHaveBeenCalled()
  })

  it('37. darwin: switching epic -> gog in the mounted WebView re-opens with storeKey gog, never navigates', () => {
    const { ref } = makeSlot({ x: 1, y: 2, width: 300, height: 400 })
    const epic: MountOptions = {
      slotRef: ref,
      startUrl: EPIC_URL,
      storeKey: 'epic',
      platform: 'darwin'
    }

    mount(epic)
    jest.advanceTimersByTime(40)
    expect(mockApi.storeEmbedOpen).toHaveBeenLastCalledWith(
      EPIC_URL,
      { x: 1, y: 2, w: 300, h: 400 },
      'epic'
    )

    reinvoke({ ...epic, startUrl: GOG_URL, storeKey: 'gog' })

    expect(mockApi.storeEmbedOpen).toHaveBeenCalledTimes(2)
    expect(mockApi.storeEmbedOpen).toHaveBeenLastCalledWith(
      GOG_URL,
      { x: 1, y: 2, w: 300, h: 400 },
      'gog'
    )
    expect(mockApi.storeEmbedNavigate).not.toHaveBeenCalled()
  })

  it('38. darwin: a round trip gog -> epic -> gog re-opens on each surface change, and a second epic visit too', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const gog: MountOptions = {
      slotRef: ref,
      startUrl: GOG_URL,
      storeKey: 'gog',
      platform: 'darwin'
    }

    mount(gog)
    jest.advanceTimersByTime(40)
    reinvoke({ ...gog, startUrl: EPIC_URL, storeKey: 'epic' })
    reinvoke(gog)
    reinvoke({ ...gog, startUrl: EPIC_URL, storeKey: 'epic' })

    const keys = (mockApi.storeEmbedOpen.mock.calls as unknown[][]).map(
      (call) => call[2]
    )
    expect(keys).toEqual(['gog', 'epic', 'gog', 'epic'])
    expect(mockApi.storeEmbedNavigate).not.toHaveBeenCalled()
  })

  it('39. darwin: a switch between two Tauri-embed stores (gog -> steam) still navigates, no re-open', () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const gog: MountOptions = {
      slotRef: ref,
      startUrl: GOG_URL,
      storeKey: 'gog',
      platform: 'darwin'
    }

    mount(gog)
    jest.advanceTimersByTime(40)
    reinvoke({ ...gog, startUrl: STEAM_URL, storeKey: 'steam' })

    expect(mockApi.storeEmbedOpen).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedNavigate).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedNavigate).toHaveBeenCalledWith(STEAM_URL)
  })

  it('40. darwin: after a surface-switch re-open, later bounds still flow through the same observer', () => {
    const { ref, setRect } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const gog: MountOptions = {
      slotRef: ref,
      startUrl: GOG_URL,
      storeKey: 'gog',
      platform: 'darwin'
    }

    mount(gog)
    jest.advanceTimersByTime(40)
    reinvoke({ ...gog, startUrl: EPIC_URL, storeKey: 'epic' })
    jest.advanceTimersByTime(40)
    mockApi.storeEmbedSetBounds.mockClear()

    setRect({ x: 0, y: 0, width: 640, height: 480 })
    MockResizeObserver.instances[0].trigger()
    jest.advanceTimersByTime(40)

    expect(MockResizeObserver.instances).toHaveLength(1)
    expect(mockApi.storeEmbedOpen).toHaveBeenCalledTimes(2)
    expect(mockApi.storeEmbedSetBounds).toHaveBeenLastCalledWith({
      x: 0,
      y: 0,
      w: 640,
      h: 480
    })
  })

  // ── D-04 ACROSS AN UNMOUNT (Phase 50 review finding 9, UAT item 15) ───────────────────────
  //
  // The real sign-in path: the user is on /store/epic signed out, goes to /login (the WebView
  // UNMOUNTS -- the embed is hidden, D-21), signs in, and comes back (a fresh mount, which calls
  // `storeEmbedOpen` again). Rust's warm path sees the same URL and does not navigate, so only an
  // auth-triggered reload replaces the stale signed-out header. RED before the fix: the baseline
  // was a per-mount ref re-seeded by the remount's own open, so the change was never seen.
  async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 4; i++) await Promise.resolve()
  }

  function epicOptions(signInState: string): MountOptions {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    return {
      slotRef: ref,
      startUrl: EPIC_URL,
      storeKey: 'epic',
      platform: 'darwin',
      signInState
    }
  }

  it('41. unmount -> sign in elsewhere -> remount on /store/epic reloads exactly once, after the open', async () => {
    mount(epicOptions('signed-out'))
    jest.advanceTimersByTime(40)
    await flushMicrotasks()
    harness().__unmount()
    expect(mockApi.storeEmbedReload).not.toHaveBeenCalled()

    mount(epicOptions('connected'))
    jest.advanceTimersByTime(40)
    await flushMicrotasks()

    expect(mockApi.storeEmbedOpen).toHaveBeenCalledTimes(2)
    expect(mockApi.storeEmbedReload).toHaveBeenCalledTimes(1)
    expect(mockApi.storeEmbedOpen.mock.invocationCallOrder[1]).toBeLessThan(
      mockApi.storeEmbedReload.mock.invocationCallOrder[0]
    )
  })

  it('42. a remount with an unchanged sign-in state reloads nothing (instant return kept)', async () => {
    mount(epicOptions('connected'))
    jest.advanceTimersByTime(40)
    await flushMicrotasks()
    harness().__unmount()

    mount(epicOptions('connected'))
    jest.advanceTimersByTime(40)
    await flushMicrotasks()

    expect(mockApi.storeEmbedReload).not.toHaveBeenCalled()
  })

  it('43. the reload is one per change: a third visit with the same new state reloads nothing more', async () => {
    mount(epicOptions('signed-out'))
    jest.advanceTimersByTime(40)
    await flushMicrotasks()
    harness().__unmount()
    mount(epicOptions('connected'))
    jest.advanceTimersByTime(40)
    await flushMicrotasks()
    harness().__unmount()

    mount(epicOptions('connected'))
    jest.advanceTimersByTime(40)
    await flushMicrotasks()

    expect(mockApi.storeEmbedReload).toHaveBeenCalledTimes(1)
  })

  it('44. a non-Epic store remounted across a sign-in-state change reloads nothing', async () => {
    const gog = (signInState: string): MountOptions => ({
      ...epicOptions(signInState),
      startUrl: GOG_URL,
      storeKey: 'gog'
    })
    mount(gog('signed-out'))
    jest.advanceTimersByTime(40)
    await flushMicrotasks()
    harness().__unmount()

    mount(gog('connected'))
    jest.advanceTimersByTime(40)
    await flushMicrotasks()

    expect(mockApi.storeEmbedReload).not.toHaveBeenCalled()
  })

  it('45. a gog -> epic switch in the mounted WebView after signing in reloads the re-opened Epic surface once', async () => {
    mount(epicOptions('signed-out'))
    jest.advanceTimersByTime(40)
    await flushMicrotasks()
    harness().__unmount()

    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const gog: MountOptions = {
      slotRef: ref,
      startUrl: GOG_URL,
      storeKey: 'gog',
      platform: 'darwin',
      signInState: 'connected'
    }
    mount(gog)
    jest.advanceTimersByTime(40)
    await flushMicrotasks()
    reinvoke({ ...gog, startUrl: EPIC_URL, storeKey: 'epic' })
    await flushMicrotasks()

    expect(mockApi.storeEmbedOpen).toHaveBeenLastCalledWith(
      EPIC_URL,
      { x: 0, y: 0, w: 100, h: 100 },
      'epic'
    )
    expect(mockApi.storeEmbedReload).toHaveBeenCalledTimes(1)
  })

  // ── Zoom-aware bounds (quick 261012-gn8, W8) ───────────────────────────────────────────────
  //
  // Windows live gate W8 (2026-10-12, zoom 120%): the embed sat displaced over the enlarged chrome.
  // The renderer measures the slot in CSS px; Rust positions the child webview in LOGICAL px, and
  // under webview zoom f, logical = CSS x f. Properties 1-25 run with NO `document` global at all
  // (as the real `storeEmbedReloadLoop` suite does) and must stay unchanged; this block installs a
  // stub document carrying a MUTABLE `--webview-zoom`, and removes it afterwards.
  describe('zoom-aware bounds (quick 261012-gn8, W8)', () => {
    const R = { x: 10, y: 20, width: 300, height: 400 }

    type Sent = { x: number; y: number; w: number; h: number }
    const lastBounds = (): Sent => {
      const calls = mockApi.storeEmbedSetBounds.mock.calls as unknown as [
        Sent
      ][]
      return calls[calls.length - 1][0]
    }
    const firstOpenBounds = (): Sent => {
      const calls = mockApi.storeEmbedOpen.mock.calls as unknown as [
        string,
        Sent,
        string
      ][]
      return calls[0][1]
    }
    const expectBounds = (got: Sent, want: Sent): void => {
      expect(got.x).toBeCloseTo(want.x)
      expect(got.y).toBeCloseTo(want.y)
      expect(got.w).toBeCloseTo(want.w)
      expect(got.h).toBeCloseTo(want.h)
    }

    beforeEach(() => {
      MockMutationObserver.instances = []
      setRootZoom('')
    })

    afterEach(() => {
      delete (globalThis as unknown as { document?: unknown }).document
    })

    // Z0 control. Observed-red mutation: normalising an absent property to anything other than 1
    // (e.g. 0, which would zero the rect) turns this red -- the 100% payload must be exactly what
    // it was before this fix.
    it('Z0. with the property absent the open payload is the unscaled rect, exactly', () => {
      const { ref } = makeSlot(R)

      mount({ slotRef: ref })
      jest.advanceTimersByTime(40)

      expect(mockApi.storeEmbedOpen).toHaveBeenCalledWith(
        'https://store.steampowered.com/',
        { x: 10, y: 20, w: 300, h: 400 },
        'steam'
      )
    })

    // Z1. Observed-red mutation: sending `{ x: rect.x, ... }` verbatim (the pre-fix `flush()`) turns
    // this red -- the open would carry the CSS rect at 120% zoom.
    it('Z1. at zoom 1.2 the open payload is the CSS rect x 1.2', () => {
      setRootZoom('1.2')
      const { ref } = makeSlot(R)

      mount({ slotRef: ref })
      jest.advanceTimersByTime(40)

      expect(mockApi.storeEmbedOpen).toHaveBeenCalledTimes(1)
      expectBounds(firstOpenBounds(), { x: 12, y: 24, w: 360, h: 480 })
    })

    // Z2. Observed-red mutation: scaling only the open branch (leaving `setBounds` on the raw
    // rect) turns this red -- the embed would be right on entry and wrong after the first resize.
    it('Z2. at zoom 1.2 a later resize sends the new CSS rect x 1.2', () => {
      setRootZoom('1.2')
      const { ref, setRect } = makeSlot(R)

      mount({ slotRef: ref })
      jest.advanceTimersByTime(40)
      mockApi.storeEmbedSetBounds.mockClear()

      setRect({ x: 5, y: 15, width: 640, height: 480 })
      MockResizeObserver.instances[0].trigger()
      jest.advanceTimersByTime(40)

      expect(mockApi.storeEmbedSetBounds).toHaveBeenCalledTimes(1)
      expectBounds(lastBounds(), { x: 6, y: 18, w: 768, h: 576 })
    })

    // Z3. The preload publishes `--webview-zoom` only AFTER `setZoom` resolves, and the zoom
    // change is made on another screen, so with the store route mounted there may be NO
    // ResizeObserver tick at all. Observed-red mutation: deleting the MutationObserver (relying on
    // resize/RO alone) turns this red -- nothing would re-send after the publish.
    it('Z3. a zoom publish while mounted re-sends scaled bounds with no ResizeObserver tick', () => {
      setRootZoom('1')
      const { ref } = makeSlot(R)
      mount({ slotRef: ref })
      jest.advanceTimersByTime(40)
      mockApi.storeEmbedSetBounds.mockClear()

      setRootZoom('1.2')
      MockMutationObserver.instances[0].trigger()
      jest.advanceTimersByTime(40)

      expect(mockApi.storeEmbedSetBounds).toHaveBeenCalled()
      expectBounds(lastBounds(), { x: 12, y: 24, w: 360, h: 480 })
    })

    // Z3b. A resize caused by the zoom change can be observed BEFORE the factor is published, and
    // then reads the stale factor. Observed-red mutation: keying the re-flush on `resize`/RO
    // instead of on the property write itself leaves the last send at R2 x 1 -- red.
    it('Z3b. a send made with a stale factor is corrected once the new factor is published', () => {
      setRootZoom('1')
      const { ref, setRect } = makeSlot(R)
      mount({ slotRef: ref })
      jest.advanceTimersByTime(40)

      setRect({ x: 5, y: 15, width: 640, height: 480 })
      MockResizeObserver.instances[0].trigger() // still the stale factor 1
      expectBounds(lastBounds(), { x: 5, y: 15, w: 640, h: 480 })

      setRootZoom('1.2')
      MockMutationObserver.instances[0].trigger()
      jest.advanceTimersByTime(40)

      expectBounds(lastBounds(), { x: 6, y: 18, w: 768, h: 576 })
    })

    // Z4. Observed-red mutation: deleting the `factor !== lastSentFactor` comparison in the MO
    // callback (always `scheduleFlush`) turns this red -- a theme or font write on the root would
    // re-send bounds for no reason (T-261012-gn8-03).
    it('Z4. a root style mutation that leaves the factor unchanged sends nothing', () => {
      setRootZoom('1.2')
      const { ref } = makeSlot(R)
      mount({ slotRef: ref })
      jest.advanceTimersByTime(100)
      mockApi.storeEmbedSetBounds.mockClear()

      MockMutationObserver.instances[0].trigger()
      jest.advanceTimersByTime(100)

      expect(mockApi.storeEmbedSetBounds).not.toHaveBeenCalled()
    })

    // Z5. Observed-red mutation: dropping `attributeFilter`, observing another node, or omitting
    // `mo.disconnect()` from the cleanup turns this red (mirrors properties 20/21 for the RO).
    it('Z5. the MutationObserver watches the root style attribute and is disconnected on unmount and on slot replacement', () => {
      const a = makeSlot(R)
      const options: MountOptions = { slotRef: a.ref }
      mount(options)

      expect(MockMutationObserver.instances).toHaveLength(1)
      const first = MockMutationObserver.instances[0]
      expect(first.observed).toBe(rootStub)
      expect(first.options).toEqual({
        attributes: true,
        attributeFilter: ['style']
      })

      reinvoke({
        ...options,
        slotRef: { current: null } as RefObject<HTMLDivElement>
      })
      expect(first.disconnected).toBe(true)
      expect(
        MockMutationObserver.instances.filter((o) => !o.disconnected)
      ).toHaveLength(0)

      const b = makeSlot(R)
      reinvoke({ ...options, slotRef: b.ref })
      const live = MockMutationObserver.instances.filter((o) => !o.disconnected)
      expect(live).toHaveLength(1)

      harness().__unmount()
      expect(live[0].disconnected).toBe(true)
    })

    // Z6. On macOS/Windows the Rust existing-embed open arm shows and navigates but drops the
    // rect, and the remount's only RO observation is consumed by that open. Observed-red mutation:
    // deleting the `.then(() => scheduleFlush())` follow-up turns this red -- the rect changed
    // while away (R3) would never be applied.
    it('Z6. a successful open is followed by one throttled setBounds carrying the current scaled rect', async () => {
      setRootZoom('1.2')
      const { ref, setRect } = makeSlot(R)
      mount({ slotRef: ref })

      setRect({ x: 20, y: 30, width: 500, height: 250 }) // R3, no RO tick
      await Promise.resolve()
      await Promise.resolve()
      jest.advanceTimersByTime(40)

      expect(mockApi.storeEmbedSetBounds).toHaveBeenCalledTimes(1)
      expectBounds(lastBounds(), { x: 24, y: 36, w: 600, h: 300 })
    })

    // Z7. Observed-red mutation: deleting the disposed check in the follow-up turns this red -- a
    // detached slot's zero rect would be scheduled after unmount (T-261012-gn8-05).
    it('Z7. no follow-up is sent once the effect was disposed before the open resolved', async () => {
      setRootZoom('1.2')
      const { ref } = makeSlot(R)
      mount({ slotRef: ref })
      harness().__unmount()

      await Promise.resolve()
      await Promise.resolve()
      jest.advanceTimersByTime(100)

      expect(mockApi.storeEmbedSetBounds).not.toHaveBeenCalled()
    })

    // Z8. Observed-red mutation: deleting the `status === 'ok'` check turns this red -- a failed
    // open would still be chased by a setBounds at an embed that does not exist.
    it('Z8. an open that resolves with status error is not followed by setBounds', async () => {
      mockApi.storeEmbedOpen.mockResolvedValue({
        status: 'error' as const,
        error: 'x'
      })
      setRootZoom('1.2')
      const { ref } = makeSlot(R)
      mount({ slotRef: ref })

      await Promise.resolve()
      await Promise.resolve()
      jest.advanceTimersByTime(100)

      expect(mockApi.storeEmbedSetBounds).not.toHaveBeenCalled()
    })
  })
})

describe('useStoreEmbedHost steam store-exit trigger (quick 261030-qqh)', () => {
  const ev = (url: string) => ({
    url,
    host: new URL(url).host,
    canGoBack: true,
    canGoForward: false
  })
  const APP = 'https://store.steampowered.com/app/391540/'
  const FRONT = 'https://store.steampowered.com/'

  const drain = async (events: ReturnType<typeof ev>[]) => {
    mockApi.storeEmbedTakeNavEvents.mockResolvedValueOnce(events)
    jest.advanceTimersByTime(250)
    await Promise.resolve()
    await Promise.resolve()
  }

  beforeEach(() => {
    suppressionContextValue = {
      suppressed: false,
      acquire: jest.fn(),
      release: jest.fn()
    }
    MockResizeObserver.instances = []
    windowListeners.clear()
    fakeLocalStorage.clear()
    resetStoreEmbedSignInBaselines()
    mockApi.storeEmbedOpen.mockResolvedValue(okStatus)
    mockApi.storeEmbedHide.mockResolvedValue(okStatus)
    mockApi.storeEmbedShow.mockResolvedValue(okStatus)
    mockApi.storeEmbedClose.mockResolvedValue(okStatus)
    mockApi.storeEmbedBack.mockResolvedValue(okStatus)
    mockApi.storeEmbedNavigate.mockResolvedValue(okStatus)
    mockApi.storeEmbedTakeNavEvents.mockResolvedValue([])
  })

  afterEach(() => {
    jest.clearAllTimers()
  })

  it('arms from any event in a batch (app page not last) and fires once on unmount', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onSteamStoreExit = jest.fn()
    mount({ slotRef: ref, onSteamStoreExit })
    await drain([ev(APP), ev(FRONT)])
    harness().__unmount()
    expect(onSteamStoreExit).toHaveBeenCalledTimes(1)
  })

  it('plain browsing does not arm', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onSteamStoreExit = jest.fn()
    mount({ slotRef: ref, onSteamStoreExit })
    await drain([
      ev(FRONT),
      ev('https://store.steampowered.com/search/?term=x')
    ])
    harness().__unmount()
    expect(onSteamStoreExit).not.toHaveBeenCalled()
  })

  it('a store switch fires once; a later unmount on the new store does not fire again', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onSteamStoreExit = jest.fn()
    const options: MountOptions = { slotRef: ref, onSteamStoreExit }
    mount(options)
    await drain([ev(APP)])
    reinvoke({
      ...options,
      storeKey: 'gog',
      startUrl: 'https://www.gog.com/'
    })
    expect(onSteamStoreExit).toHaveBeenCalledTimes(1)
    harness().__unmount()
    expect(onSteamStoreExit).toHaveBeenCalledTimes(1)
  })

  it('a stale steam URL delivered while on gog never arms', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onSteamStoreExit = jest.fn()
    mount({
      slotRef: ref,
      storeKey: 'gog',
      startUrl: 'https://www.gog.com/',
      onSteamStoreExit
    })
    await drain([ev(APP)])
    harness().__unmount()
    expect(onSteamStoreExit).not.toHaveBeenCalled()
  })

  it('app teardown (beforeunload) is not leaving', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onSteamStoreExit = jest.fn()
    mount({ slotRef: ref, onSteamStoreExit })
    await drain([ev(APP)])
    dispatchWindowEvent('beforeunload')
    harness().__unmount()
    expect(onSteamStoreExit).not.toHaveBeenCalled()
  })

  it('suppression (a modal over the embed) is not leaving', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onSteamStoreExit = jest.fn()
    const options: MountOptions = { slotRef: ref, onSteamStoreExit }
    mount(options)
    await drain([ev(APP)])
    suppressionContextValue = {
      suppressed: true,
      acquire: jest.fn(),
      release: jest.fn()
    }
    reinvoke(options)
    suppressionContextValue = {
      suppressed: false,
      acquire: jest.fn(),
      release: jest.fn()
    }
    reinvoke(options)
    expect(onSteamStoreExit).not.toHaveBeenCalled()
  })

  it('arms from a chrome-initiated navigation result', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onSteamStoreExit = jest.fn()
    const state = mount({ slotRef: ref, onSteamStoreExit })
    jest.advanceTimersByTime(40)
    mockApi.storeEmbedNavigate.mockResolvedValueOnce({
      status: 'ok',
      navState: ev('https://store.steampowered.com/cart/')
    })
    state.onNavigate('https://store.steampowered.com/cart/')
    await Promise.resolve()
    await Promise.resolve()
    harness().__unmount()
    expect(onSteamStoreExit).toHaveBeenCalledTimes(1)
  })

  it('fires once per session: re-entering steam without a new purchase-intent URL does not fire again', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onSteamStoreExit = jest.fn()
    const options: MountOptions = { slotRef: ref, onSteamStoreExit }
    const gog = {
      ...options,
      storeKey: 'gog',
      startUrl: 'https://www.gog.com/'
    }
    mount(options)
    await drain([ev(APP)])
    reinvoke(gog)
    expect(onSteamStoreExit).toHaveBeenCalledTimes(1)
    reinvoke(options)
    reinvoke(gog)
    expect(onSteamStoreExit).toHaveBeenCalledTimes(1)
  })
})

describe('useStoreEmbedHost store exit (epic/gog/amazon, quick 261030-ts4)', () => {
  const ev = (url: string) => ({
    url,
    host: new URL(url).host,
    canGoBack: true,
    canGoForward: false
  })
  const GOG = {
    storeKey: 'gog',
    startUrl: 'https://www.gog.com/'
  }

  const drain = async (events: ReturnType<typeof ev>[]) => {
    mockApi.storeEmbedTakeNavEvents.mockResolvedValueOnce(events)
    jest.advanceTimersByTime(250)
    await Promise.resolve()
    await Promise.resolve()
  }

  beforeEach(() => {
    suppressionContextValue = {
      suppressed: false,
      acquire: jest.fn(),
      release: jest.fn()
    }
    MockResizeObserver.instances = []
    windowListeners.clear()
    fakeLocalStorage.clear()
    resetStoreEmbedSignInBaselines()
    mockApi.storeEmbedOpen.mockResolvedValue(okStatus)
    mockApi.storeEmbedHide.mockResolvedValue(okStatus)
    mockApi.storeEmbedShow.mockResolvedValue(okStatus)
    mockApi.storeEmbedClose.mockResolvedValue(okStatus)
    mockApi.storeEmbedBack.mockResolvedValue(okStatus)
    mockApi.storeEmbedNavigate.mockResolvedValue(okStatus)
    mockApi.storeEmbedTakeNavEvents.mockResolvedValue([])
  })

  afterEach(() => {
    jest.clearAllTimers()
  })

  it('gog: a game page then unmount fires onStoreExit("gog") once', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onStoreExit = jest.fn()
    mount({ slotRef: ref, ...GOG, onStoreExit })
    await drain([ev('https://www.gog.com/en/game/foo')])
    harness().__unmount()
    expect(onStoreExit).toHaveBeenCalledTimes(1)
    expect(onStoreExit).toHaveBeenCalledWith('gog')
  })

  it('gog: catalog browsing does not fire', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onStoreExit = jest.fn()
    mount({ slotRef: ref, ...GOG, onStoreExit })
    await drain([ev('https://www.gog.com/en/games')])
    harness().__unmount()
    expect(onStoreExit).not.toHaveBeenCalled()
  })

  it('epic (darwin raw surface): a product page then unmount fires once', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onStoreExit = jest.fn()
    mount({
      slotRef: ref,
      storeKey: 'epic',
      startUrl: 'https://store.epicgames.com/en-US/',
      platform: 'darwin',
      onStoreExit
    })
    await drain([ev('https://store.epicgames.com/en-US/p/x')])
    harness().__unmount()
    expect(onStoreExit).toHaveBeenCalledTimes(1)
    expect(onStoreExit).toHaveBeenCalledWith('epic')
  })

  it('amazon: switching to gog fires amazon once; later gog unmount adds nothing', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onStoreExit = jest.fn()
    const options: MountOptions = {
      slotRef: ref,
      storeKey: 'amazon',
      startUrl: 'https://gaming.amazon.com',
      onStoreExit
    }
    mount(options)
    await drain([ev('https://gaming.amazon.com/home')])
    reinvoke({ ...options, ...GOG })
    expect(onStoreExit).toHaveBeenCalledTimes(1)
    expect(onStoreExit).toHaveBeenCalledWith('amazon')
    harness().__unmount()
    expect(onStoreExit).toHaveBeenCalledTimes(1)
  })

  it.each(['humble', 'wiki'])('%s never fires', async (storeKey) => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onStoreExit = jest.fn()
    mount({
      slotRef: ref,
      storeKey,
      startUrl: 'https://example.com/',
      onStoreExit
    })
    await drain([
      ev('https://www.gog.com/en/game/foo'),
      ev('https://store.steampowered.com/app/1/'),
      ev('https://gaming.amazon.com/home')
    ])
    harness().__unmount()
    expect(onStoreExit).not.toHaveBeenCalled()
  })

  it('beforeunload then unmount on an armed gog session fires nothing', async () => {
    const { ref } = makeSlot({ x: 0, y: 0, width: 100, height: 100 })
    const onStoreExit = jest.fn()
    mount({ slotRef: ref, ...GOG, onStoreExit })
    await drain([ev('https://www.gog.com/en/game/foo')])
    dispatchWindowEvent('beforeunload')
    harness().__unmount()
    expect(onStoreExit).not.toHaveBeenCalled()
  })
})
