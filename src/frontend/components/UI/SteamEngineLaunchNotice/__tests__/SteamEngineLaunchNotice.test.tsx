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
import SteamEngineLaunchNotice, { OVERLAY_STEP_KEYS } from '../index'
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
  onClick?: () => void
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
    expect(text(out)).toBe('CrossOver trial expired — using built-in engine')
  })

  it('maps cx-missing and cx-broken to their messages', () => {
    storeState = notice('cx-missing', 1)
    expect(text(render())).toBe('CrossOver not found — using built-in engine')
    rt.states = []
    rt.refs = []
    rt.deps = []
    storeState = notice('cx-broken', 1)
    expect(text(render())).toBe(
      "CrossOver isn't working — using built-in engine"
    )
  })

  it('renders nothing for an unknown reason value (T-59-72)', () => {
    storeState = notice('<script>', 1)
    expect(render()).toBeNull()
  })

  it('hides on dismiss, stays hidden on re-fetch, reappears on a newer seq', () => {
    storeState = notice('cx-expired', 1)
    const out = render()
    find(out, (e) => typeof e.props.onClick === 'function')?.props.onClick?.()
    expect(render()).toBeNull()
    storeState = { '63000': { appId: '63000', launchNotice: null } }
    expect(render()).toBeNull()
    storeState = notice('cx-expired', 1)
    expect(render()).toBeNull()
    storeState = notice('cx-expired', 2)
    expect(text(render())).toContain('CrossOver trial expired')
  })

  it('auto-hides after 8 seconds', () => {
    storeState = notice('cx-expired', 1)
    expect(render()).not.toBeNull()
    jest.advanceTimersByTime(7999)
    expect(render()).not.toBeNull()
    jest.advanceTimersByTime(1)
    expect(render()).toBeNull()
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
      expect((el.props as { className?: string }).className).toBe(
        'steamEngineLaunchNotice steamEngineLaunchNotice--overlay'
      )
      expect(text(out)).toBe(
        "Steam overlay unavailable GameLib's overlay helper is missing from this build. The game is launching without the Steam overlay."
      )
    })

    it('same seq does not re-show after dismissal; a newer seq does (D-09)', () => {
      storeState = overlay('shim', 5)
      const out = render()
      find(out, (e) => typeof e.props.onClick === 'function')?.props.onClick?.()
      expect(render()).toBeNull()
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
      expect(text(out)).toContain('CrossOver trial expired')
      expect(text(out)).toContain('Steam overlay unavailable')
    })

    it('waits for focus before the 8 s auto-hide starts', () => {
      env.focused = false
      storeState = overlay('shim', 5)
      render()
      jest.advanceTimersByTime(20000)
      expect(render()).not.toBeNull()
      env.focused = true
      fire('focus')
      jest.advanceTimersByTime(7999)
      expect(render()).not.toBeNull()
      jest.advanceTimersByTime(1)
      expect(render()).toBeNull()
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
