/**
 * Phase 40 Plan 06 (D-18/D-20): `HumbleExpiryToast` acquires store-embed
 * suppression while its own `visible` state is true, via
 * `useSuppressStoreEmbedWhile(visible)` -- mirroring `Dropdown`'s
 * `isExpanded` wiring (`dropdownDisclosure.test.tsx`). This component is
 * permanently mounted (a `Root()` sibling of `<Outlet/>` in `App.tsx`, not
 * mounted/unmounted per appearance -- its `if (!visible) return null` is a
 * render-output early-out, not an unmount), so the mount-for-lifetime
 * `useSuppressStoreEmbed()` variant (used by `Dialog`) would be wrong here;
 * this file exists specifically to prove the value-gated variant is wired
 * correctly.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`'s docstring) -- `HumbleExpiryToast` is
 * invoked directly as a plain function against hand-rolled hook mocks,
 * following `Runner/__tests__/logoutFailureSurface.test.tsx`'s convention of
 * switching `useContext`'s mocked return on the passed-in context object's
 * identity (needed here because the component itself consumes ContextProvider
 * for `humble`, while `useSuppressStoreEmbedWhile` -- called for real, not
 * mocked -- transitively consumes the real `StoreEmbedSuppressionContext`
 * via a real `useContext` call).
 */
import type { ReactElement, ReactNode } from 'react'

jest.mock('../index.scss', () => ({}))

// `HumbleExpiryToast` imports `humbleLoginPath` from `frontend/screens/Login`,
// whose module also side-effect-imports `./index.scss` and a large,
// unrelated import chain (Runner, react-router-dom types, etc.) -- mocked
// wholesale here rather than that scss alone, mirroring
// `logoutFailureSurface.test.tsx`'s approach of mocking whole modules to
// keep this file's scope to the suppression wiring only.
jest.mock('frontend/screens/Login', () => ({
  humbleLoginPath: '/loginweb/humble'
}))

const mockNavigate = jest.fn()

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

// Sentinel object so the mocked `useContext` below can tell ContextProvider's
// consumption apart from StoreEmbedSuppressionContext's (the latter is NOT
// mocked -- its real module, and therefore its real `useContext(...)` call
// inside the real `useSuppressStoreEmbedWhile`, is exercised here).
jest.mock('frontend/state/ContextProvider', () => ({
  __esModule: true,
  default: { __name: 'ContextProvider' }
}))

let humbleExpired = false
const acquire = jest.fn()
const release = jest.fn()

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
    useContext: (ctx: { __name?: string }) =>
      ctx?.__name === 'ContextProvider'
        ? { humble: { expired: humbleExpired } }
        : { suppressed: false, acquire, release },
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
    }
  }
})

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import HumbleExpiryToast from '../index'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function mount(): ReactElement | null {
  harness().__resetMount()
  harness().__beginRender()
  return HumbleExpiryToast() as unknown as ReactElement | null
}

function reinvoke(): ReactElement | null {
  harness().__beginRender()
  return HumbleExpiryToast() as unknown as ReactElement | null
}

describe('HumbleExpiryToast acquires store-embed suppression while visible (Phase 40 Plan 06, D-18/D-20)', () => {
  beforeEach(() => {
    humbleExpired = false
    mockNavigate.mockClear()
    acquire.mockClear()
    release.mockClear()
  })

  // NOTE on the two-`reinvoke()` pattern below: `visible` only ever changes
  // via `setVisible` inside the `humble.expired`-keyed `useEffect`, and (as
  // in real React) a render reads the state slot's value from BEFORE that
  // render's own effects run -- so flipping `humbleExpired` and calling
  // `reinvoke()` once only fires the effect (updating the slot); a SECOND
  // `reinvoke()` is required for the render to read the now-updated
  // `visible` value and, in turn, for `useSuppressStoreEmbedWhile`'s own
  // effect (keyed on that value) to fire. This differs from
  // `dropdownDisclosure.test.tsx`, where `setIsExpanded` is called directly
  // from a click handler rather than from an effect, so one `reinvoke()`
  // suffices there.

  it('does not acquire while not visible (humble.expired stays false)', () => {
    mount()

    expect(acquire).not.toHaveBeenCalled()
    expect(release).not.toHaveBeenCalled()
  })

  it('acquires exactly once when humble.expired flips true and the toast becomes visible', () => {
    mount()
    humbleExpired = true
    reinvoke() // fires the humble.expired effect, sets visible -> true
    const tree = reinvoke() // reads visible === true; fires the suppression effect

    expect(tree).not.toBeNull()
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()
  })

  it('releases when humble.expired flips back false (successful reconnect)', () => {
    mount()
    humbleExpired = true
    reinvoke()
    reinvoke()
    expect(acquire).toHaveBeenCalledTimes(1)

    humbleExpired = false
    reinvoke() // fires the humble.expired effect, sets visible -> false
    const tree = reinvoke() // reads visible === false; fires the suppression cleanup

    expect(tree).toBeNull()
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('dismissing the toast (X) also releases -- setVisible(false) via handleDismiss', () => {
    mount()
    humbleExpired = true
    reinvoke()
    let tree = reinvoke() as ReactElement<{
      children: ReactNode[]
    }>
    expect(acquire).toHaveBeenCalledTimes(1)

    function collectByClassPart(
      node: ReactNode,
      part: string,
      out: ReactElement[] = []
    ): ReactElement[] {
      if (node === null || node === undefined || typeof node === 'boolean') {
        return out
      }
      if (Array.isArray(node)) {
        node.forEach((child: ReactNode) =>
          collectByClassPart(child, part, out)
        )
        return out
      }
      if (typeof node === 'object' && 'type' in node) {
        const el = node as ReactElement<{
          className?: string
          children?: ReactNode
        }>
        if (
          typeof el.props?.className === 'string' &&
          el.props.className.includes(part)
        ) {
          out.push(el)
        }
        if (el.props?.children !== undefined) {
          collectByClassPart(el.props.children, part, out)
        }
        return out
      }
      return out
    }

    const dismissButton = collectByClassPart(
      tree,
      'humbleExpiryToastDismiss'
    )[0] as ReactElement<{ onClick: () => void }>
    // handleDismiss calls setVisible(false) directly (not via an effect), so
    // -- unlike the humble.expired-driven transitions above -- a single
    // reinvoke() is enough for the next render to both read the updated
    // `visible` value and fire the suppression effect's cleanup.
    dismissButton.props.onClick()
    tree = reinvoke() as ReactElement<{ children: ReactNode[] }>

    expect(tree).toBeNull()
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })
})
