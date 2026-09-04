/**
 * Unit tests for `StoreEmbedSuppressionContext` (Phase 40 Plan 06 Task 1,
 * D-18/D-20/T-40-06-01/02/03).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`'s docstring) -- there is no way to mount
 * `<React.StrictMode>` and observe a real double-invocation, and no way to
 * render a consumer outside `<StoreEmbedSuppressionProvider>` and observe
 * `useContext`'s fallback in situ. Two adaptations follow this project's
 * established "mock react + invoke directly" convention
 * (`useTauriOAuthLogin.test.tsx`):
 *
 * 1. Properties 1-4 (the count derivation itself) are tested directly
 *    against the exported `suppressionCountReducer` / `deriveSuppressed`
 *    pure functions -- no React at all, so no mock is needed for these.
 * 2. Properties 5-6 (mount/unmount lifecycle) exercise the real
 *    `useSuppressStoreEmbed()` hook against a hand-rolled `useEffect` mock
 *    that runs the effect body and records its cleanup, plus a
 *    `useContext` mock returning a fake context value whose `acquire`/
 *    `release` drive the SAME production `suppressionCountReducer` this
 *    file already unit-tests directly -- so what's proven is "the hook
 *    calls acquire on mount and release on unmount", composed with
 *    properties already proven to be correct.
 *
 * React 18 Strict Mode's development-only double-invocation is, at the
 * effect level, exactly "run the effect, immediately run its cleanup, run
 * the effect again" -- with no other render or state change in between.
 * The strict-mode test below drives that exact sequence through the hook
 * harness rather than through `<React.StrictMode>` itself, which is
 * behaviourally equivalent for a hook whose only side effect is this one
 * `useEffect` (there is nothing else in `useSuppressStoreEmbed` that Strict
 * Mode's extra render pass could disturb).
 */

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let cleanup: void | (() => void)
  let contextValue: unknown

  return {
    ...actualReact,
    useContext: () => contextValue,
    useEffect: (effect: () => void | (() => void)) => {
      cleanup = effect()
    },
    __setContextValue: (value: unknown) => {
      contextValue = value
    },
    __runCleanup: () => {
      if (typeof cleanup === 'function') cleanup()
      cleanup = undefined
    }
  }
})

// Imported after the mock above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import {
  deriveSuppressed,
  suppressionCountReducer,
  defaultSuppressionValue,
  useSuppressStoreEmbed,
  type StoreEmbedSuppressionValue
} from '../StoreEmbedSuppressionContext'

type Harness = {
  __setContextValue: (value: StoreEmbedSuppressionValue) => void
  __runCleanup: () => void
}

function harness(): Harness {
  return jest.requireMock('react') as unknown as Harness
}

/** A minimal live counter driving the SAME production reducer under test above,
 * so the hook tests below prove "the hook wires acquire/release correctly",
 * composed with (not duplicating) the reducer properties proven directly. */
function makeLiveContextValue(): StoreEmbedSuppressionValue & {
  count: number
} {
  const state = {
    count: 0,
    get suppressed() {
      return deriveSuppressed(state.count)
    },
    acquire: () => {
      state.count = suppressionCountReducer(state.count, { type: 'acquire' })
    },
    release: () => {
      state.count = suppressionCountReducer(state.count, { type: 'release' })
    }
  }
  return state
}

function mount(value: StoreEmbedSuppressionValue): void {
  harness().__setContextValue(value)
  useSuppressStoreEmbed()
}

function unmount(): void {
  harness().__runCleanup()
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('suppressionCountReducer / deriveSuppressed (properties 1-4)', () => {
  // Property 1. Mutation that turns this red: `deriveSuppressed` changed
  // from `count > 0` to `count >= 0` (always true for a non-negative count).
  it('suppressed is false with zero holders', () => {
    expect(deriveSuppressed(0)).toBe(false)
  })

  // Property 2. Mutation that turns this red: the reducer's `'acquire'`
  // case changed to `return count` (a no-op) instead of `count + 1`.
  it('one acquire makes it true', () => {
    const count = suppressionCountReducer(0, { type: 'acquire' })
    expect(deriveSuppressed(count)).toBe(true)
    expect(count).toBe(1)
  })

  // Property 3. Mutation that turns this red: the reducer's `'release'`
  // case changed to unconditionally `return 0` instead of `count - 1`.
  it('two acquires then one release keeps it true', () => {
    let count = 0
    count = suppressionCountReducer(count, { type: 'acquire' })
    count = suppressionCountReducer(count, { type: 'acquire' })
    count = suppressionCountReducer(count, { type: 'release' })
    expect(count).toBe(1)
    expect(deriveSuppressed(count)).toBe(true)
  })

  // Property 4. Mutation that turns this red: the reducer's `'release'`
  // case changed to `return count` (a no-op), so the count never reaches 0.
  it('two acquires then two releases makes it false', () => {
    let count = 0
    count = suppressionCountReducer(count, { type: 'acquire' })
    count = suppressionCountReducer(count, { type: 'acquire' })
    count = suppressionCountReducer(count, { type: 'release' })
    count = suppressionCountReducer(count, { type: 'release' })
    expect(count).toBe(0)
    expect(deriveSuppressed(count)).toBe(false)
  })

  // T-40-06-02. Mutation that turns this red: the `console.warn` call in
  // the reducer's floor-clamp branch is deleted.
  it('a release below zero clamps at zero and logs a warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const count = suppressionCountReducer(0, { type: 'release' })
    expect(count).toBe(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})

describe('useSuppressStoreEmbed lifecycle (properties 5-6)', () => {
  // Property 5. Mutation that turns this red: the hook's effect returns
  // `undefined` instead of `() => release()`, so unmounting never releases.
  it('an unmount releases the hold it acquired on mount', () => {
    const value = makeLiveContextValue()

    mount(value)
    expect(value.count).toBe(1)

    unmount()
    expect(value.count).toBe(0)
  })

  // Property 6. Mutation that turns this red: same as property 5's mutation
  // (a dropped cleanup) -- without it, the second mount below acquires a
  // SECOND hold on top of the first (count reaches 2, not 1), because the
  // simulated Strict Mode remount's implicit release never happened.
  it('a strict-mode-style mount, cleanup, remount leaves exactly one holder', () => {
    const value = makeLiveContextValue()

    // React 18 Strict Mode's development-only sequence: mount, immediately
    // clean up, mount again -- with no other state change in between.
    mount(value)
    unmount()
    mount(value)

    expect(value.count).toBe(1)
  })
})

describe('defaultSuppressionValue (T-40-06-03: consumer outside the provider)', () => {
  // Mutation that turns this red: `defaultSuppressionValue.acquire`
  // replaced with a true no-op (`() => {}`), removing the console.warn.
  it('acquire() logs a warning instead of silently no-opping', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    defaultSuppressionValue.acquire()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toEqual(
      expect.stringContaining('outside <StoreEmbedSuppressionProvider>')
    )
  })

  it('suppressed defaults to false and release() also warns rather than throwing', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(defaultSuppressionValue.suppressed).toBe(false)
    expect(() => defaultSuppressionValue.release()).not.toThrow()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})
