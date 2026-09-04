/**
 * Phase 40 Plan 06 (D-18/D-20/D-36): `TourProvider` acquires store-embed
 * suppression while `tourState.activeTour !== null` via
 * `useSuppressStoreEmbedWhile`, keyed off the tour's ACTIVE state -- not any
 * individual step's element -- so one acquisition spans the whole
 * `startTour()`-through-`endTour()` lifecycle rather than releasing and
 * re-acquiring as intro.js tears down and rebuilds its tooltip DOM between
 * steps (see `TourContext.tsx`'s own comment at the call site, and the
 * `introjs-tooltip-renders-nothing-intermittently.md` project-memory note on
 * why a suppression gap between steps would be user-visible).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`'s docstring) -- `TourProvider` (a plain
 * `React.FC`) is invoked directly as a function, following this project's
 * established hand-rolled-hook-mock convention
 * (`StoreEmbedSuppressionContext.test.tsx`, `dropdownDisclosure.test.tsx`).
 * `TourProvider` reads `React.useEffect` via the `React` namespace import
 * rather than a destructured `useEffect` -- both resolve to the same
 * overridden key on the mocked `react` module below, since ts-jest's
 * CommonJS interop treats a mock module with no `__esModule` marker as its
 * own default export.
 *
 * `startTour`/`endTour` are reached directly off the `value` prop of the
 * `<TourContext.Provider value={...}>` element `TourProvider` returns --
 * `TourProvider` itself never calls `useContext` (only `useTour()`, not
 * under test here, does), so there is no context-identity switching needed
 * in the mock below, unlike `humbleExpiryToastSuppression.test.tsx`.
 */
import type { ReactElement, ReactNode } from 'react'
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0
}

const acquire = jest.fn()
const release = jest.fn()

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
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
    useCallback: <T,>(fn: T) => fn,
    useMemo: <T,>(fn: () => T) => fn(),
    useContext: () => ({ suppressed: false, acquire, release }),
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
      effectCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
    }
  }
})

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import { TourProvider } from '../TourContext'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

type TourValue = {
  startTour: (tourId: string) => void
  endTour: (tourId: string, completed?: boolean) => void
  tourState: { activeTour: string | null }
}

function mount(): ReactElement<{ value: TourValue }> {
  harness().__resetMount()
  harness().__beginRender()
  return TourProvider({
    children: null as unknown as ReactNode
  }) as ReactElement<{
    value: TourValue
  }>
}

function reinvoke(): ReactElement<{ value: TourValue }> {
  harness().__beginRender()
  return TourProvider({
    children: null as unknown as ReactNode
  }) as ReactElement<{
    value: TourValue
  }>
}

describe('TourProvider acquires store-embed suppression while a tour is active (Phase 40 Plan 06, D-18/D-20/D-36)', () => {
  beforeEach(() => {
    acquire.mockClear()
    release.mockClear()
  })

  it('does not acquire on mount with no active tour', () => {
    mount()

    expect(acquire).not.toHaveBeenCalled()
    expect(release).not.toHaveBeenCalled()
  })

  it('acquires exactly once when startTour() is called', () => {
    const tree = mount()
    tree.props.value.startTour('nav-tour')
    const next = reinvoke()

    expect(next.props.value.tourState.activeTour).toBe('nav-tour')
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()
  })

  it('a simulated step transition -- multiple re-renders while the SAME tour stays active -- holds exactly one acquisition, not one per step', () => {
    const tree = mount()
    tree.props.value.startTour('nav-tour')
    reinvoke()

    // Simulate intro.js advancing through several steps: each step re-renders
    // the provider tree (tourProgress/other app state changing elsewhere),
    // but `activeTour` itself does not change until the tour ends -- so the
    // suppression effect's dependency ([true]) is unchanged across all of
    // these, and it must not re-fire.
    reinvoke()
    reinvoke()
    reinvoke()

    expect(acquire).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()
  })

  it('releases exactly once when endTour() is called', () => {
    const tree = mount()
    tree.props.value.startTour('nav-tour')
    let next = reinvoke()
    expect(acquire).toHaveBeenCalledTimes(1)

    next.props.value.endTour('nav-tour')
    next = reinvoke()

    expect(next.props.value.tourState.activeTour).toBeNull()
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })
})
