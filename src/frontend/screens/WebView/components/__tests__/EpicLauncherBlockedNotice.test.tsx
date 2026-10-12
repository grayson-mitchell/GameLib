/**
 * Tests for `EpicLauncherBlockedNotice` (Phase 50 Plan 03, D-14).
 *
 * No jsdom / react-test-renderer in this project (see
 * `src/frontend/jest.config.js`'s docstring) -- invoked directly as a plain
 * function, the same DOM-less pattern `StoreEmbedPlaceholder.test.tsx` uses
 * in this same directory. The component's auto-dismiss timer lives in a
 * `useEffect` (Phase 50 review finding 15), so `react` is mocked with the
 * same hand-rolled slot/deps/cleanup harness `useStoreEmbedHost.test.tsx`
 * uses: `render()` below is one render pass, `__resetMount()` a fresh mount.
 */

import type { ReactElement, ReactNode } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
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
    useRef: (initial: unknown) => {
      const idx = refCursor++
      if (idx >= refSlots.length) refSlots[idx] = { current: initial }
      return refSlots[idx]
    },
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
      refCursor = 0
      effectCursor = 0
    },
    __resetMount: () => {
      refSlots = []
      refCursor = 0
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
    }
  }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

import EpicLauncherBlockedNotice from '../EpicLauncherBlockedNotice'

type NoticeProps = Parameters<typeof EpicLauncherBlockedNotice>[0]

function harness(): { __beginRender: () => void; __resetMount: () => void } {
  return jest.requireMock('react') as unknown as {
    __beginRender: () => void
    __resetMount: () => void
  }
}

/** One render pass of the already-mounted notice. */
function render(
  props: NoticeProps
): ReturnType<typeof EpicLauncherBlockedNotice> {
  harness().__beginRender()
  return EpicLauncherBlockedNotice(props)
}

interface AnyProps {
  children?: ReactNode
  className?: string
}

type AnyReactElement = ReactElement<AnyProps>

function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(collectText).join(' ')
  }
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const props = (node as AnyReactElement).props
    return collectText(props?.children)
  }
  return ''
}

describe('EpicLauncherBlockedNotice (D-14)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    harness().__resetMount()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns null when visible is false, and schedules nothing', () => {
    const onDismissed = jest.fn()
    const element = render({
      visible: false,
      attemptKey: null,
      onDismissed
    })

    expect(element).toBeNull()
    jest.advanceTimersByTime(10000)
    expect(onDismissed).not.toHaveBeenCalled()
  })

  it('renders a non-null row with the locked message when visible', () => {
    const element = render({
      visible: true,
      attemptKey: 1,
      onDismissed: jest.fn()
    }) as AnyReactElement

    expect(element).not.toBeNull()
    expect(element.props.className).toBe('WebView__embedNoticeRow')
    expect(collectText(element)).toContain('Install from your Library instead')
  })

  it('renders no button -- D-14 names no action for this notice', () => {
    const element = render({
      visible: true,
      attemptKey: 1,
      onDismissed: jest.fn()
    }) as AnyReactElement

    const json = JSON.stringify(element)
    expect(json).not.toContain('"button"')
  })

  it('schedules onDismissed exactly once, after the module auto-dismiss interval', () => {
    const onDismissed = jest.fn()
    render({ visible: true, attemptKey: 1, onDismissed })

    expect(onDismissed).not.toHaveBeenCalled()
    jest.advanceTimersByTime(3999)
    expect(onDismissed).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(onDismissed).toHaveBeenCalledTimes(1)
  })

  it('fail-soft: a missing onDismissed does not throw and schedules nothing that crashes', () => {
    expect(() =>
      render({
        visible: true,
        attemptKey: 1,
        onDismissed: undefined as unknown as () => void
      })
    ).not.toThrow()
    expect(() => jest.advanceTimersByTime(10000)).not.toThrow()
  })

  // Finding 15 (D-14, one toast per attempt). RED on the render-time `setTimeout`: every one of
  // these re-renders scheduled its own timer, so five renders left five pending and the stale
  // ones each fired `onDismissed`.
  it('re-rendering while visible schedules no extra timer and dismisses exactly once', () => {
    const callbacks = [jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn()]
    // A new inline callback per render, exactly as `WebView/index.tsx` passes it.
    for (const onDismissed of callbacks) {
      render({ visible: true, attemptKey: 1, onDismissed })
    }

    expect(jest.getTimerCount()).toBe(1)
    jest.advanceTimersByTime(4000)

    const totalCalls = callbacks.reduce(
      (sum, cb) => sum + cb.mock.calls.length,
      0
    )
    expect(totalCalls).toBe(1)
    // The LATEST callback is the one invoked -- never a stale render's.
    expect(callbacks[callbacks.length - 1]).toHaveBeenCalledTimes(1)
  })

  // RED on the render-time `setTimeout`: the first attempt's timer survived the second attempt's
  // render and dismissed the second notice 1s after it appeared.
  it('a second attempt while the notice is still up gets a full interval of its own', () => {
    const onDismissed = jest.fn()
    render({ visible: true, attemptKey: 1, onDismissed })
    jest.advanceTimersByTime(3000)

    render({ visible: true, attemptKey: 2, onDismissed })
    expect(jest.getTimerCount()).toBe(1)

    jest.advanceTimersByTime(3999)
    expect(onDismissed).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(onDismissed).toHaveBeenCalledTimes(1)
  })

  it('hiding the notice clears its pending timer', () => {
    const onDismissed = jest.fn()
    render({ visible: true, attemptKey: 1, onDismissed })
    render({ visible: false, attemptKey: 1, onDismissed })

    expect(jest.getTimerCount()).toBe(0)
    jest.advanceTimersByTime(10000)
    expect(onDismissed).not.toHaveBeenCalled()
  })

  it('renders no spinner or progress indicator', () => {
    const element = render({
      visible: true,
      attemptKey: 1,
      onDismissed: jest.fn()
    }) as AnyReactElement

    const json = JSON.stringify(element).toLowerCase()
    expect(json).not.toContain('spinner')
    expect(json).not.toContain('progress')
  })
})

describe('WebView/index.css new notice-row rules (D-07/D-14)', () => {
  it('reference var(--status-warning) and var(--background-darker), at least two --space- tokens, and contain no hex literal or var(--accent)', () => {
    const css = readFileSync(join(__dirname, '../../index.css'), 'utf8')
    const marker = css.indexOf('.WebView__embedNoticeRow')
    expect(marker).toBeGreaterThan(-1)
    const noticeRowRules = css.slice(marker)

    expect(noticeRowRules).toContain('var(--status-warning)')
    expect(noticeRowRules).toContain('var(--background-darker)')
    expect(
      noticeRowRules.match(/var\(--space-[a-z0-9-]+\)/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2)
    expect(noticeRowRules.match(/#[0-9a-fA-F]{3,8}/g)).toBeNull()
    expect(noticeRowRules).not.toContain('var(--accent)')
  })
})
