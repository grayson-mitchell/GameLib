/**
 * No jsdom in this project: the component is called as a function against a
 * minimal hand-rolled hook runtime (state / ref / effect with cleanups), as
 * HumbleExpiryToast's suppression test does.
 */
import type { ReactElement, ReactNode } from 'react'

jest.mock('../index.scss', () => ({}))
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: () => null
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue: string,
      opts?: Record<string, string>
    ): string =>
      defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => opts?.[k] ?? '')
  })
}))
jest.mock(
  'frontend/components/UI/NavShell/StoreEmbedSuppressionContext',
  () => ({
    useSuppressStoreEmbedWhile: jest.fn()
  })
)

let storeState: Record<string, unknown> = {}
jest.mock('frontend/state/SteamEngineState', () => ({
  useSteamEngineState: (sel: (s: { byAppId: unknown }) => unknown) =>
    sel({ byAppId: storeState })
}))

jest.mock('react', () => {
  const rt = {
    states: [] as unknown[],
    refs: [] as { current: unknown }[],
    deps: [] as (unknown[] | undefined)[],
    cleanups: [] as (void | (() => void))[],
    pending: [] as (() => void)[],
    sc: 0,
    rc: 0,
    ec: 0,
    dirty: false
  }
  const changed = (a?: unknown[], b?: unknown[]) =>
    !a || !b || a.some((d, i) => !Object.is(d, b[i]))
  return {
    ...jest.requireActual<typeof import('react')>('react'),
    __rt: rt,
    useState: (init: unknown) => {
      const i = rt.sc++
      if (!(i in rt.states)) rt.states[i] = init
      return [
        rt.states[i],
        (v: unknown) => {
          rt.states[i] = v
          rt.dirty = true
        }
      ]
    },
    useRef: (init: unknown) => {
      const i = rt.rc++
      if (!rt.refs[i]) rt.refs[i] = { current: init }
      return rt.refs[i]
    },
    useEffect: (fn: () => void | (() => void), deps?: unknown[]) => {
      const i = rt.ec++
      if (changed(rt.deps[i], deps)) {
        rt.deps[i] = deps
        rt.pending.push(() => {
          const c = rt.cleanups[i]
          if (typeof c === 'function') c()
          rt.cleanups[i] = fn()
        })
      }
    }
  }
})

import * as React from 'react'
import {
  faClock,
  faEyeSlash,
  faMagnifyingGlass,
  faWrench
} from '@fortawesome/free-solid-svg-icons'
import { useSuppressStoreEmbedWhile } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import SteamEngineLaunchNotice, {
  OVERLAY_STEP_KEYS,
  PHASE_FALLBACK_MS
} from '../index'
import { OVERLAY_STEP_TEXT } from 'backend/storeManagers/steam/bridge/overlay/overlayNotice'

type Rt = {
  states: unknown[]
  refs: unknown[]
  deps: unknown[]
  cleanups: (void | (() => void))[]
  pending: (() => void)[]
  sc: number
  rc: number
  ec: number
  dirty: boolean
}
const rt = (React as unknown as { __rt: Rt }).__rt

type El = ReactElement<{
  children?: ReactNode
  role?: string
  icon?: unknown
  className?: string
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onAnimationEnd?: (e: unknown) => void
}>
const text = (n: ReactNode): string =>
  Array.isArray(n)
    ? n.map(text).join('')
    : typeof n === 'string'
      ? n
      : n && typeof n === 'object'
        ? text((n as El).props.children)
        : ''
const find = (n: ReactNode, pred: (e: El) => boolean): El | undefined => {
  if (Array.isArray(n)) {
    for (const c of n) {
      const r = find(c, pred)
      if (r) return r
    }
    return undefined
  }
  if (!n || typeof n !== 'object') return undefined
  return pred(n as El) ? (n as El) : find((n as El).props.children, pred)
}

// Render, run effects, and re-render until settled.
const render = (): ReactNode => {
  let out: ReactNode = null
  for (let i = 0; i < 10; i++) {
    rt.sc = rt.rc = rt.ec = 0
    rt.dirty = false
    out = SteamEngineLaunchNotice() as ReactNode
    const effects = rt.pending.splice(0)
    effects.forEach((e) => e())
    if (!rt.dirty && effects.length === 0) break
  }
  return out
}
const unmount = () => rt.cleanups.forEach((c) => typeof c === 'function' && c())

const notice = (reason: string, seq: number) => ({
  '63000': { appId: '63000', launchNotice: { reason, seq } }
})

// No jsdom: stub the window/document focus surface the overlay timer reads.
const focusListeners: Record<string, (() => void)[]> = {}
const env = { focused: true, visible: 'visible' }
const fire = (type: string) => (focusListeners[type] ?? []).forEach((f) => f())
const overlay = (step: string, seq: number) => ({
  '3205720': { appId: '3205720', overlayNotice: { step, seq } }
})
const cls = (e: El | undefined): string => e?.props.className ?? ''
const toast = (out: ReactNode): El | undefined =>
  find(out, (e) => e.props.role === 'status')
const slotOf = (out: ReactNode): El | undefined =>
  find(out, (e) => cls(e).startsWith('steamEngineLaunchNoticeSlot'))
const ev = (name: string, same = true) => ({
  target: 'a',
  currentTarget: same ? 'a' : 'b',
  animationName: name
})
const OUT = 'steamEngineLaunchNoticeOut'
const CLOSE = 'steamEngineLaunchNoticeSlotClose'
// Dismiss then drive the exit through both animationends.
const exit = (out: ReactNode): ReactNode => {
  toast(out)?.props.onAnimationEnd?.(ev(OUT))
  const o2 = render()
  slotOf(o2)?.props.onAnimationEnd?.(ev(CLOSE))
  return render()
}
const dismiss = (out: ReactNode): ReactNode => {
  find(out, (e) => typeof e.props.onClick === 'function')?.props.onClick?.()
  return render()
}
const statuses = (out: ReactNode): El[] => {
  const all: El[] = []
  const walk = (n: ReactNode): void => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    const e = n as El
    if (e.props.role === 'status') all.push(e)
    walk(e.props.children)
  }
  walk(out)
  return all
}

beforeEach(() => {
  for (const k of Object.keys(focusListeners)) delete focusListeners[k]
  env.focused = true
  env.visible = 'visible'
  const add = (t: string, f: () => void) =>
    void (focusListeners[t] = [...(focusListeners[t] ?? []), f])
  const rem = (t: string, f: () => void) =>
    void (focusListeners[t] = (focusListeners[t] ?? []).filter((x) => x !== f))
  Object.assign(globalThis, {
    window: { addEventListener: add, removeEventListener: rem },
    document: {
      addEventListener: add,
      removeEventListener: rem,
      hasFocus: () => env.focused,
      get visibilityState() {
        return env.visible
      }
    }
  })
  jest.useFakeTimers()
  rt.states = []
  rt.refs = []
  rt.deps = []
  rt.cleanups = []
  rt.pending = []
  storeState = {}
})
afterEach(() => jest.useRealTimers())

describe('SteamEngineLaunchNotice', () => {
  it('renders nothing when no state carries a launchNotice', () => {
    storeState = { '63000': { appId: '63000', launchNotice: null } }
    expect(render()).toBeNull()
  })

  it('shows the trial-expired reason in a role=status container', () => {
    storeState = notice('cx-expired', 1)
    const out = render()
    expect(find(out, (e) => e.props.role === 'status')).toBeDefined()
    expect(text(out)).toBe(
      'CrossOver trial expired Using the built-in engine for this launch.'
    )
    expect(find(out, (e) => e.props.icon === faClock)).toBeDefined()
  })

  it('maps cx-missing and cx-broken to their messages', () => {
    storeState = notice('cx-missing', 1)
    const o1 = render()
    expect(text(o1)).toBe(
      'CrossOver not found Using the built-in engine for this launch.'
    )
    expect(find(o1, (e) => e.props.icon === faMagnifyingGlass)).toBeDefined()
    rt.states = []
    rt.refs = []
    rt.deps = []
    storeState = notice('cx-broken', 1)
    const o2 = render()
    expect(text(o2)).toBe(
      "CrossOver isn't working Using the built-in engine for this launch."
    )
    expect(find(o2, (e) => e.props.icon === faWrench)).toBeDefined()
  })

  it('renders nothing for an unknown reason value (T-59-72)', () => {
    storeState = notice('<script>', 1)
    expect(render()).toBeNull()
  })

  it('hides on dismiss, stays hidden on re-fetch, reappears on a newer seq', () => {
    storeState = notice('cx-expired', 1)
    const out = render()
    const leaving = dismiss(out)
    expect(toast(leaving)).toBeDefined()
    expect(cls(toast(leaving))).toContain('steamEngineLaunchNotice--leaving')
    expect(jest.mocked(useSuppressStoreEmbedWhile).mock.calls.at(-1)).toEqual([
      true
    ])
    expect(exit(leaving)).toBeNull()
    expect(jest.mocked(useSuppressStoreEmbedWhile).mock.calls.at(-1)).toEqual([
      false
    ])
    storeState = { '63000': { appId: '63000', launchNotice: null } }
    expect(render()).toBeNull()
    storeState = notice('cx-expired', 1)
    expect(render()).toBeNull()
    storeState = notice('cx-expired', 2)
    expect(text(render())).toContain('CrossOver trial expired')
  })

  it('ignores bubbled or non-exit animationend events', () => {
    storeState = notice('cx-expired', 1)
    const leaving = dismiss(render())
    toast(leaving)?.props.onAnimationEnd?.(ev(OUT, false))
    toast(leaving)?.props.onAnimationEnd?.(ev('steamEngineLaunchNoticeIn'))
    toast(leaving)?.props.onAnimationEnd?.(ev('steamEngineLaunchNoticeBar'))
    const o = render()
    expect(slotOf(o)?.props.className).not.toContain('--collapsing')
    toast(o)?.props.onAnimationEnd?.(ev(OUT))
    const c = render()
    expect(slotOf(c)?.props.className).toContain('--collapsing')
    slotOf(c)?.props.onAnimationEnd?.(ev(CLOSE, false))
    slotOf(c)?.props.onAnimationEnd?.(ev('steamEngineLaunchNoticeSlotOpen'))
    expect(render()).not.toBeNull()
  })

  it('falls back when no animationend arrives (T-vvz-02)', () => {
    storeState = notice('cx-expired', 1)
    dismiss(render())
    jest.advanceTimersByTime(PHASE_FALLBACK_MS)
    expect(slotOf(render())?.props.className).toContain('--collapsing')
    jest.advanceTimersByTime(PHASE_FALLBACK_MS)
    expect(render()).toBeNull()
    expect(jest.mocked(useSuppressStoreEmbedWhile).mock.calls.at(-1)).toEqual([
      false
    ])
  })

  it('auto-hides after 8 seconds', () => {
    storeState = notice('cx-expired', 1)
    expect(render()).not.toBeNull()
    jest.advanceTimersByTime(7999)
    expect(cls(toast(render()))).not.toContain('--leaving')
    jest.advanceTimersByTime(1)
    expect(cls(toast(render()))).toContain('--leaving')
  })

  it('hover pauses the real countdown and carries the budget over', () => {
    storeState = notice('cx-expired', 1)
    render()
    jest.advanceTimersByTime(5000)
    toast(render())?.props.onMouseEnter?.()
    const paused = render()
    expect(cls(toast(paused))).toContain('steamEngineLaunchNotice--paused')
    jest.advanceTimersByTime(10000)
    expect(cls(toast(render()))).not.toContain('--leaving')
    toast(render())?.props.onMouseLeave?.()
    render()
    jest.advanceTimersByTime(2999)
    expect(cls(toast(render()))).not.toContain('--leaving')
    jest.advanceTimersByTime(1)
    expect(cls(toast(render()))).toContain('--leaving')
  })

  it('a newer notice replaces the current one through its exit', () => {
    storeState = notice('cx-expired', 1)
    render()
    storeState = notice('cx-broken', 2)
    const o = render()
    expect(cls(toast(o))).toContain('--leaving')
    expect(text(o)).toContain('CrossOver trial expired')
    const next = exit(o)
    expect(text(next)).toContain("CrossOver isn't working")
    expect(cls(toast(next))).not.toContain('--leaving')
    jest.advanceTimersByTime(7999)
    expect(cls(toast(render()))).not.toContain('--leaving')
    jest.advanceTimersByTime(1)
    expect(cls(toast(render()))).toContain('--leaving')
  })

  it('clears the auto-hide timer on unmount', () => {
    storeState = notice('cx-expired', 1)
    render()
    expect(jest.getTimerCount()).toBe(1)
    unmount()
    expect(jest.getTimerCount()).toBe(0)
  })

  describe('overlay notice (G4)', () => {
    it('shows title and step body in a second status element', () => {
      storeState = overlay('shim', 5)
      const out = render()
      const [el] = statuses(out)
      expect(cls(el)).toContain('steamEngineLaunchNotice')
      expect(cls(el)).toContain('steamEngineLaunchNotice--overlay')
      expect(find(out, (e) => e.props.icon === faEyeSlash)).toBeDefined()
      expect(text(out)).toBe(
        "Steam overlay unavailable GameLib's overlay helper is missing from this build. The game is launching without the Steam overlay."
      )
    })

    it('same seq does not re-show after dismissal; a newer seq does (D-09)', () => {
      storeState = overlay('shim', 5)
      const out = render()
      expect(exit(dismiss(out))).toBeNull()
      storeState = overlay('shim', 5)
      expect(render()).toBeNull()
      storeState = overlay('shim', 6)
      expect(render()).not.toBeNull()
    })

    it('stacks with an engine notice, each with its own dismiss', () => {
      storeState = {
        '3205720': {
          appId: '3205720',
          launchNotice: { reason: 'cx-expired', seq: 1 },
          overlayNotice: { step: 'env', seq: 2 }
        }
      }
      const out = render()
      expect(statuses(out)).toHaveLength(2)
      expect(statuses(out).map((e) => cls(e).includes('--overlay'))).toEqual([
        true,
        false
      ])
      expect(text(out)).toContain('CrossOver trial expired')
      expect(text(out)).toContain('Steam overlay unavailable')
    })

    it('waits for focus before the 8 s auto-hide starts', () => {
      env.focused = false
      storeState = overlay('shim', 5)
      render()
      jest.advanceTimersByTime(20000)
      const waiting = render()
      expect(cls(toast(waiting))).toContain('steamEngineLaunchNotice--waiting')
      expect(cls(toast(waiting))).not.toContain('--leaving')
      env.focused = true
      fire('focus')
      expect(cls(toast(render()))).not.toContain('--waiting')
      jest.advanceTimersByTime(7999)
      expect(cls(toast(render()))).not.toContain('--leaving')
      jest.advanceTimersByTime(1)
      expect(cls(toast(render()))).toContain('--leaving')
    })

    it('removes listeners and timer on unmount', () => {
      env.focused = false
      storeState = overlay('shim', 5)
      render()
      expect(focusListeners.focus).toHaveLength(1)
      unmount()
      expect(focusListeners.focus).toHaveLength(0)
      expect(focusListeners.visibilitychange).toHaveLength(0)
    })

    it('renders nothing for a step outside the closed set (T-60-14-01)', () => {
      storeState = overlay('<script>', 5)
      expect(render()).toBeNull()
      storeState = overlay('__proto__', 6)
      expect(render()).toBeNull()
    })

    it('step keys and defaults equal the backend OVERLAY_STEP_TEXT', () => {
      expect(OVERLAY_STEP_KEYS).toEqual(OVERLAY_STEP_TEXT)
    })
  })
})
