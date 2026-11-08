/**
 * Phase 68 (D-05/D-07/D-15): ReadOnlyStoresNotice. No jsdom in this project, so
 * the component is invoked directly against hand-rolled hook mocks (see
 * HumbleExpiryToast/__tests__/humbleExpiryToastSuppression.test.tsx).
 */
import type { ReactElement, ReactNode } from 'react'

jest.mock('../index.scss', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue: string,
      opts?: Record<string, string>
    ): string => {
      if (key.startsWith('readOnlyStores.area.')) {
        return key === 'readOnlyStores.area.steam-library'
          ? 'Steam library'
          : 'Settings'
      }
      return defaultValue.replace(
        /\{\{(\w+)\}\}/g,
        (_m, k: string) => opts?.[k] ?? ''
      )
    }
  })
}))

jest.mock(
  'frontend/components/UI/NavShell/StoreEmbedSuppressionContext',
  () => ({
    useSuppressStoreEmbedWhile: jest.fn()
  })
)

const mockDismiss = jest.fn()
let mockState: {
  entries: Array<{ area: string; reason: string }>
  visible: boolean
  dismiss: () => void
}

jest.mock('frontend/state/ReadOnlyStoresNotice', () => ({
  useReadOnlyStoresNotice: () => mockState
}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let refSlots: { current: unknown }[] = []
  let refCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
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
      if (idx >= stateSlots.length) stateSlots[idx] = initial
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
      if (idx >= refSlots.length) refSlots[idx] = { current: initial }
      return refSlots[idx]
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        effectDeps[idx] = deps
        effect()
      }
    },
    __beginRender: () => {
      stateCursor = 0
      refCursor = 0
      effectCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      refSlots = []
      effectDeps = []
      stateCursor = 0
      refCursor = 0
      effectCursor = 0
    }
  }
})

// Imported after the mocks above (no jest.mock hoisting in this setup).
import ReadOnlyStoresNotice from '../index'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }
const harness = () => jest.requireMock('react') as unknown as HookHarness

function render(): ReactElement | null {
  harness().__beginRender()
  return ReadOnlyStoresNotice() as unknown as ReactElement | null
}
// Mount, then settle (the first render's effect sets the phase).
function mount(): ReactElement | null {
  harness().__resetMount()
  render()
  return render()
}

type El = ReactElement<{
  className?: string
  role?: string
  children?: ReactNode
  onClick?: () => void
  onAnimationEnd?: (e: unknown) => void
  'aria-label'?: string
}>

function walk(node: ReactNode, pred: (e: El) => boolean, out: El[] = []): El[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((c: ReactNode) => walk(c, pred, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const el = node as El
    if (pred(el)) out.push(el)
    if (el.props?.children !== undefined) walk(el.props.children, pred, out)
  }
  return out
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'object' && 'props' in node) {
    return textOf((node as El).props.children)
  }
  return ''
}

const cls = (e: El | undefined): string => e?.props?.className ?? ''
const byClass = (tree: ReactNode, part: string): El | undefined =>
  walk(tree, (e) => cls(e).includes(part))[0]
const ev = (animationName: string) => ({
  target: 'a',
  currentTarget: 'a',
  animationName
})

describe('ReadOnlyStoresNotice', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockState = { entries: [], visible: false, dismiss: mockDismiss }
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders the failed title, area label, log pointer and dismiss button', () => {
    mockState = {
      ...mockState,
      entries: [{ area: 'steam-library', reason: 'failed' }],
      visible: true
    }
    const tree = mount()
    expect(textOf(byClass(tree, 'readOnlyStoresNoticeTitle'))).toBe(
      'Some data is read-only'
    )
    const body = textOf(tree)
    expect(body).toContain('Steam library')
    expect(body).toContain('See the log for details')
    expect(
      walk(tree, (e) => e.props?.['aria-label'] === 'Dismiss')
    ).toHaveLength(1)
  })

  it('renders D-05 wording for newer, and both messages in one toast', () => {
    mockState = {
      ...mockState,
      entries: [{ area: 'settings', reason: 'newer' }],
      visible: true
    }
    const newerOnly = textOf(mount())
    expect(newerOnly).toContain('saved by a newer GameLib')
    expect(newerOnly).toContain("changes won't be saved")
    expect(newerOnly).toContain('Update GameLib')

    mockState = {
      ...mockState,
      entries: [
        { area: 'settings', reason: 'newer' },
        { area: 'steam-library', reason: 'failed' }
      ]
    }
    const tree = mount()
    expect(walk(tree, (e) => e.props?.role === 'status')).toHaveLength(1)
    expect(textOf(tree)).toContain('saved by a newer GameLib')
    expect(textOf(tree)).toContain('Steam library')
  })

  it('has no countdown hairline and stays after 10 s (D-15)', () => {
    mockState = {
      ...mockState,
      entries: [{ area: 'settings', reason: 'newer' }],
      visible: true
    }
    const tree = mount()
    expect(byClass(tree, 'Hairline')).toBeUndefined()
    expect(byClass(tree, 'hairline')).toBeUndefined()
    jest.advanceTimersByTime(10_000)
    const later = render()
    expect(later).not.toBeNull()
    expect(
      walk(later, (e) => e.props?.role === 'status')[0]?.props.className
    ).not.toContain('leaving')
  })

  it('dismiss calls the store and leaves via the slot phases', () => {
    mockState = {
      ...mockState,
      entries: [{ area: 'settings', reason: 'newer' }],
      visible: true
    }
    const tree = mount()
    byClass(tree, 'readOnlyStoresNoticeDismiss')?.props.onClick?.()
    expect(mockDismiss).toHaveBeenCalledTimes(1)
    // store flips visible false on dismiss; the local phase carries the exit
    mockState = { ...mockState, visible: false }
    const leaving = render()
    const toast = walk(leaving, (e) => e.props?.role === 'status')[0]
    expect(cls(toast)).toContain('noticeStackToast--leaving')
    toast?.props.onAnimationEnd?.(ev('noticeStackToastOut'))
    const collapsing = render()
    walk(collapsing, (e) =>
      cls(e).startsWith('noticeStackSlot')
    )[0]?.props.onAnimationEnd?.(ev('noticeStackSlotClose'))
    expect(render()).toBeNull()
  })

  it('renders nothing when not visible', () => {
    expect(mount()).toBeNull()
  })
})
