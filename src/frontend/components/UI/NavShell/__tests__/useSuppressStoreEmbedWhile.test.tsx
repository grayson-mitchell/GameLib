/**
 * Unit tests for `useSuppressStoreEmbedWhile` (Phase 40 Plan 06 Task 3,
 * D-18/D-20) -- the value-gated sibling of `useSuppressStoreEmbed`, added
 * during Task 3 wiring for components that are permanently mounted and
 * toggle a boolean they already track (`Dropdown`'s `isExpanded`,
 * `HumbleExpiryToast`'s `visible`, `TourProvider`'s `activeTour !== null`).
 * Those three components each have their own wiring-specific suppression
 * tests (`dropdownDisclosure.test.tsx`, `humbleExpiryToastSuppression.test.tsx`,
 * `tourContextSuppression.test.tsx`); this file tests the shared hook itself
 * in isolation, the way `StoreEmbedSuppressionContext.test.tsx` tests
 * `useSuppressStoreEmbed()` in isolation from any one consumer.
 *
 * Kept in a SEPARATE file rather than added to
 * `StoreEmbedSuppressionContext.test.tsx` because that file's `useEffect`
 * mock deliberately ignores the dependency array (each of its tests calls
 * the hook exactly once per simulated mount/unmount, with no re-render
 * step) -- correct for that file's mount/unmount properties, but unable to
 * express "re-invoke while a dependency is unchanged must not re-fire",
 * which is exactly what this hook's `active`-gating needs to prove. This
 * file's mock is deps-aware (the render-cursor + dependency-array-comparison
 * convention shared with `dropdownDisclosure.test.tsx` /
 * `humbleExpiryToastSuppression.test.tsx` / `tourContextSuppression.test.tsx`).
 */
jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
  let effectCursor = 0
  let contextValue: unknown

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
    useContext: () => contextValue,
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        const priorCleanup = effectCleanups[idx]
        if (typeof priorCleanup === 'function') priorCleanup()
        effectDeps[idx] = deps
        effectCleanups[idx] = effect()
      }
    },
    __setContextValue: (value: unknown) => {
      contextValue = value
    },
    __beginRender: () => {
      effectCursor = 0
    },
    __resetMount: () => {
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
    },
    __unmount: () => {
      for (const cleanup of effectCleanups) {
        if (typeof cleanup === 'function') cleanup()
      }
      effectCleanups = []
    }
  }
})

// Imported after the mock above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import {
  deriveSuppressed,
  suppressionCountReducer,
  useSuppressStoreEmbedWhile,
  type StoreEmbedSuppressionValue
} from '../StoreEmbedSuppressionContext'

type Harness = {
  __setContextValue: (value: StoreEmbedSuppressionValue) => void
  __beginRender: () => void
  __resetMount: () => void
  __unmount: () => void
}

function harness(): Harness {
  return jest.requireMock('react') as unknown as Harness
}

/** Same live-counter helper as `StoreEmbedSuppressionContext.test.tsx`,
 * driving the production reducer under test there -- this file proves the
 * hook wires acquire/release correctly, not the counting logic itself. */
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

function mount(value: StoreEmbedSuppressionValue, active: boolean): void {
  harness().__resetMount()
  harness().__setContextValue(value)
  harness().__beginRender()
  useSuppressStoreEmbedWhile(active)
}

function reinvoke(active: boolean): void {
  harness().__beginRender()
  useSuppressStoreEmbedWhile(active)
}

describe('useSuppressStoreEmbedWhile', () => {
  it('does not acquire when active is false on mount', () => {
    const value = makeLiveContextValue()
    mount(value, false)

    expect(value.count).toBe(0)
  })

  it('acquires exactly once when active flips to true', () => {
    const value = makeLiveContextValue()
    mount(value, false)
    reinvoke(true)

    expect(value.count).toBe(1)
  })

  it('re-invoking with active unchanged (true) does not acquire a second hold', () => {
    const value = makeLiveContextValue()
    mount(value, true)
    reinvoke(true)
    reinvoke(true)

    expect(value.count).toBe(1)
  })

  it('releases when active flips back to false', () => {
    const value = makeLiveContextValue()
    mount(value, true)
    reinvoke(false)

    expect(value.count).toBe(0)
  })

  it('releases on unmount while still active -- the permanently-mounted-component-unmounts-anyway edge case', () => {
    const value = makeLiveContextValue()
    mount(value, true)
    expect(value.count).toBe(1)

    harness().__unmount()

    expect(value.count).toBe(0)
  })

  it('toggling true -> false -> true acquires exactly twice and releases exactly once in between (net one live hold)', () => {
    const value = makeLiveContextValue()
    mount(value, true)
    reinvoke(false)
    reinvoke(true)

    expect(value.count).toBe(1)
  })
})
