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
 * identity (the component reads `humble` from authState;
 * `useSuppressStoreEmbedWhile` -- called for real, not mocked -- transitively consumes the real `StoreEmbedSuppressionContext`
 * via a real `useContext` call).
 */
import 'frontend/testUtils/tauriWindow'
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

  const { withStoreHooks } = jest.requireActual<
    typeof import('frontend/testUtils/storeHookReact')
  >('frontend/testUtils/storeHookReact')

  return withStoreHooks(actualReact, {
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
  } as unknown as Partial<typeof import('react')>)
})

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import HumbleExpiryToast from '../index'
import useAuthState from 'frontend/state/authState'
import { resetAllStores } from 'frontend/state/storeKit'
import { PHASE_FALLBACK_MS } from 'frontend/components/UI/NoticeStack/noticeSlot'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function setHumbleExpired(expired: boolean): void {
  useAuthState.setState((s) => ({ humble: { ...s.humble, expired } }))
}

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

type El = ReactElement<{
  className?: string
  role?: string
  children?: ReactNode
  onClick?: () => void
  onAnimationEnd?: (e: unknown) => void
}>

function walk(node: ReactNode, pred: (e: El) => boolean, out: El[] = []): El[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child: ReactNode) => walk(child, pred, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const el = node as El
    if (pred(el)) out.push(el)
    if (el.props?.children !== undefined) walk(el.props.children, pred, out)
  }
  return out
}

const cls = (e: El | undefined): string => e?.props?.className ?? ''
const toastOf = (tree: ReactNode): El | undefined =>
  walk(tree, (e) => e.props?.role === 'status')[0]
const slotOf = (tree: ReactNode): El | undefined =>
  walk(tree, (e) => cls(e).startsWith('noticeStackSlot'))[0]
const byClass = (tree: ReactNode, part: string): El | undefined =>
  walk(tree, (e) => cls(e).includes(part))[0]
const ev = (animationName: string) => ({
  target: 'a',
  currentTarget: 'a',
  animationName
})

// Flip expired true and settle: the first reinvoke fires the expired effect,
// the second reads the new phase.
function showToast(): ReactElement | null {
  setHumbleExpired(true)
  reinvoke()
  return reinvoke()
}

// Drive a leaving toast through both animationends to removal.
function finishExit(tree: ReactNode): ReactElement | null {
  toastOf(tree)?.props.onAnimationEnd?.(ev('noticeStackToastOut'))
  const collapsing = reinvoke()
  slotOf(collapsing)?.props.onAnimationEnd?.(ev('noticeStackSlotClose'))
  return reinvoke()
}

describe('HumbleExpiryToast acquires store-embed suppression while visible (Phase 40 Plan 06, D-18/D-20)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    setHumbleExpired(false)
    mockNavigate.mockClear()
    acquire.mockClear()
    release.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
    resetAllStores()
  })

  // NOTE on the two-`reinvoke()` pattern below: `phase` only changes via
  // `setPhase` inside the `humble.expired`-keyed `useEffect`, and (as in real
  // React) a render reads the state slot's value from BEFORE that render's
  // own effects run -- so flipping `humbleExpired` and calling `reinvoke()`
  // once only fires the effect (updating the slot); a SECOND `reinvoke()` is
  // required for the render to read the now-updated `phase` value and, in
  // turn, for `useSuppressStoreEmbedWhile`'s own effect (keyed on that
  // value) to fire. A click handler calls `setPhase` directly, so one
  // `reinvoke()` suffices after it. Exit is a lifecycle: leaving ->
  // collapsing -> null, each step one more reinvoke.

  it('does not acquire while not visible (humble.expired stays false)', () => {
    mount()

    expect(acquire).not.toHaveBeenCalled()
    expect(release).not.toHaveBeenCalled()
  })

  it('acquires exactly once when humble.expired flips true and the toast becomes visible', () => {
    mount()
    const tree = showToast()

    expect(tree).not.toBeNull()
    expect(cls(tree as El)).toBe('noticeStackSlot')
    const toast = toastOf(tree)
    expect(toast).toBeDefined()
    expect(cls(toast)).toContain('noticeStackToast')
    expect(cls(toast)).toContain('humbleExpiryToast')
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()
  })

  it('releases once humble.expired flips back false (successful reconnect) and the exit finishes', () => {
    mount()
    showToast()
    expect(acquire).toHaveBeenCalledTimes(1)

    setHumbleExpired(false)
    reinvoke() // fires the humble.expired effect, sets phase -> leaving
    const leaving = reinvoke()
    expect(leaving).not.toBeNull()
    expect(cls(toastOf(leaving))).toContain('noticeStackToast--leaving')
    expect(release).not.toHaveBeenCalled()

    expect(finishExit(leaving)).toBeNull()
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('dismissing the toast (X) leaves through the slot lifecycle, then releases', () => {
    mount()
    const tree = showToast()
    expect(acquire).toHaveBeenCalledTimes(1)

    const dismissButton = byClass(tree, 'humbleExpiryToastDismiss')
    dismissButton?.props.onClick?.()
    const leaving = reinvoke()

    expect(leaving).not.toBeNull()
    expect(cls(toastOf(leaving))).toContain('noticeStackToast--leaving')
    expect(release).not.toHaveBeenCalled()

    expect(finishExit(leaving)).toBeNull()
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })
})

describe('HumbleExpiryToast slot lifecycle (quick 261106-pr4)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    setHumbleExpired(false)
    mockNavigate.mockClear()
    acquire.mockClear()
    release.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
    resetAllStores()
  })

  it('falls back to collapsing then removal when animationend never arrives', () => {
    mount()
    const tree = showToast()
    byClass(tree, 'humbleExpiryToastDismiss')?.props.onClick?.()
    const leaving = reinvoke()
    expect(leaving).not.toBeNull()

    jest.advanceTimersByTime(PHASE_FALLBACK_MS)
    const collapsing = reinvoke()
    expect(cls(slotOf(collapsing))).toContain('noticeStackSlot--collapsing')
    expect(release).not.toHaveBeenCalled()

    jest.advanceTimersByTime(PHASE_FALLBACK_MS)
    expect(reinvoke()).toBeNull()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('Reconnect navigates to the humble login path and the toast leaves', () => {
    mount()
    const tree = showToast()
    byClass(tree, 'humbleExpiryToastAction')?.props.onClick?.()
    const leaving = reinvoke()

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/loginweb/humble')
    expect(cls(toastOf(leaving))).toContain('noticeStackToast--leaving')
  })

  it('shows once per expiry and again after expired flips false then true', () => {
    mount()
    const tree = showToast()
    const firstKey = toastOf(tree)?.key
    byClass(tree, 'humbleExpiryToastDismiss')?.props.onClick?.()
    expect(finishExit(reinvoke())).toBeNull()

    // expired is still true: stays gone across renders.
    expect(reinvoke()).toBeNull()
    expect(reinvoke()).toBeNull()

    setHumbleExpired(false)
    reinvoke()
    reinvoke()
    setHumbleExpired(true)
    reinvoke()
    const again = reinvoke()
    expect(again).not.toBeNull()
    expect(toastOf(again)?.key).not.toBe(firstKey)
  })

  it('does not vanish instantly when expired flips false while shown', () => {
    mount()
    showToast()
    setHumbleExpired(false)
    reinvoke()
    const leaving = reinvoke()

    expect(leaving).not.toBeNull()
    expect(cls(toastOf(leaving))).toContain('noticeStackToast--leaving')
    expect(release).not.toHaveBeenCalled()
    expect(finishExit(leaving)).toBeNull()
    expect(release).toHaveBeenCalledTimes(1)
  })
})
