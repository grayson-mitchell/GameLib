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
    t: (_key: string, defaultValue: string): string => defaultValue
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
import SteamEngineLaunchNotice from '../index'

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

beforeEach(() => {
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
})
