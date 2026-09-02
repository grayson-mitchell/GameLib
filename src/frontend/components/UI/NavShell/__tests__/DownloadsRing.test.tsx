/**
 * Structural tests for `DownloadsRing`, the navbar's ambient Downloads
 * indicator (34.10-03 Task 1) that replaces the retired left navigation's
 * `CurrentDownload` row + queue subscription.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `DownloadsRing` is invoked
 * directly as a plain function against a hand-rolled useState/useEffect
 * harness (the pattern established by `StoreSearchScreen.test.tsx`) and its
 * returned React-element object graph is inspected without a DOM.
 */
import type { ReactElement, ReactNode } from 'react'
import type { DMQueueElement, Runner } from 'common/types'

// Colocated SCSS side-effect import -- no CSS transform configured for this
// jest project.
jest.mock('../components/DownloadsRing/index.scss', () => ({}))

jest.mock('react-router-dom', () => ({
  Link: (props: Record<string, unknown>) => ({
    type: 'mock-link',
    props
  }),
  useLocation: () => ({ pathname: currentPathname })
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

let progressPercent: number | undefined = 42
const hasProgressMock = jest.fn((_appName: string, _runner: Runner) => [
  { percent: progressPercent },
  {}
])
jest.mock('frontend/hooks/hasProgress', () => ({
  hasProgress: (appName: string, runner: Runner) =>
    hasProgressMock(appName, runner)
}))

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
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        const priorCleanup = effectCleanups[idx]
        if (typeof priorCleanup === 'function') {
          priorCleanup()
        }
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
    },
    __getEffectCleanups: () => effectCleanups
  }
})

let currentPathname = '/'

const mockApi = {
  getDMQueueInformation: jest.fn(),
  handleDMQueueInformation: jest.fn()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest). `element.type` from
// `React.createElement(Link, ...)` is a REFERENCE to whatever `Link`
// resolves to at import time, not the mock factory's return value -- import
// the same mocked binding so tests can assert type identity (mirrors
// `NavItem.test.tsx`).
import { Link } from 'react-router-dom'
import DownloadsRing, { RingProgress } from '../components/DownloadsRing'

type HookHarness = {
  __beginRender: () => void
  __resetMount: () => void
  __getEffectCleanups: () => (void | (() => void))[]
}

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function mount(): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return DownloadsRing() as unknown as ReactElement
}

function reinvoke(): ReactElement {
  harness().__beginRender()
  return DownloadsRing() as unknown as ReactElement
}

type AnyProps = Record<string, unknown> & { children?: ReactNode }
type AnyElement = ReactElement<AnyProps> & { props: AnyProps }

function collectElements(
  node: ReactNode,
  out: AnyElement[] = []
): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const element = node as AnyElement
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

function makeElement(
  appName: string,
  runner: Runner = 'legendary'
): DMQueueElement {
  return {
    type: 'install',
    params: { appName, runner } as DMQueueElement['params'],
    addToQueueTime: 0,
    startTime: 0,
    endTime: 0
  }
}

describe('DownloadsRing', () => {
  beforeEach(() => {
    currentPathname = '/'
    progressPercent = 42
    mockApi.getDMQueueInformation.mockReset().mockResolvedValue({
      elements: [],
      finished: [],
      state: 'idle'
    })
    mockApi.handleDMQueueInformation.mockReset().mockReturnValue(jest.fn())
  })

  it('with an empty queue still returns a Link element carrying the idle modifier', () => {
    const tree = mount() as AnyElement

    expect(tree.type).toBe(Link)
    expect(tree.props.to).toBe('/download-manager')
    expect(tree.props.className).toEqual(
      expect.stringContaining('DownloadsRing--idle')
    )
  })

  it('with an empty queue renders no count badge element', () => {
    const tree = mount() as AnyElement

    const badge = collectElements(tree.props.children).find(
      (el) => el.props?.className === 'DownloadsRing__count'
    )
    expect(badge).toBeUndefined()
  })

  it('with a two-element queue the badge renders the count 2', async () => {
    mockApi.getDMQueueInformation.mockResolvedValue({
      elements: [makeElement('game-a'), makeElement('game-b')],
      finished: [],
      state: 'idle'
    })

    mount()
    await Promise.resolve()
    await Promise.resolve()
    const tree = reinvoke() as AnyElement

    const badge = collectElements(tree.props.children).find(
      (el) => el.props?.className === 'DownloadsRing__count'
    )
    expect(badge).toBeDefined()
    expect(badge?.props.children).toBe(2)

    expect(tree.props.className).not.toEqual(
      expect.stringContaining('DownloadsRing--idle')
    )
  })

  it('with a non-empty queue the ring progress child is keyed by the head element appName', async () => {
    mockApi.getDMQueueInformation.mockResolvedValue({
      elements: [makeElement('head-game'), makeElement('second-game')],
      finished: [],
      state: 'idle'
    })

    mount()
    await Promise.resolve()
    await Promise.resolve()
    const tree = reinvoke() as AnyElement

    const ringChild = collectElements(tree.props.children).find(
      (child) => child.key != null
    )
    expect(ringChild).toBeDefined()
    expect(ringChild?.key).toBe('head-game')
  })

  it("the Link's `to` is /download-manager and aria-label is the resolved download-manager.link value", () => {
    const tree = mount() as AnyElement

    expect(tree.props.to).toBe('/download-manager')
    expect(tree.props['aria-label']).toBe('Downloads')
  })

  it('carries aria-current="page" on the /download-manager route', () => {
    currentPathname = '/download-manager'

    const tree = mount() as AnyElement

    expect(tree.props['aria-current']).toBe('page')
  })

  it('carries no aria-current off the /download-manager route', () => {
    currentPathname = '/'

    const tree = mount() as AnyElement

    expect(tree.props['aria-current']).toBeUndefined()
  })

  it("the mount effect's cleanup is the unsubscribe function returned by handleDMQueueInformation", () => {
    const unsubscribe = jest.fn()
    mockApi.handleDMQueueInformation.mockReturnValue(unsubscribe)

    mount()

    expect(harness().__getEffectCleanups()[0]).toBe(unsubscribe)
  })

  // Onboarding-tour anchor (34.12-03, D-05). The retired sidebar carried
  // TWO elements tagged `sidebar-downloads` -- a historical duplicate-
  // selector defect. `DownloadsRing` has exactly one `<Link>` root, so
  // there is nothing to fix here, only to confirm.
  it('the root Link carries data-tour="nav-downloads"', () => {
    const tree = mount() as AnyElement

    expect(tree.type).toBe(Link)
    expect(tree.props['data-tour']).toBe('nav-downloads')
  })

  it('exactly one element in the tree carries data-tour="nav-downloads" (the historical duplicate-selector defect does not reproduce here)', async () => {
    // A populated queue so the DownloadsRing__count badge span is actually
    // present in the tree -- otherwise this assertion could pass vacuously
    // against a tree that never renders the second element the historical
    // sidebar-downloads defect duplicated onto.
    mockApi.getDMQueueInformation.mockResolvedValue({
      elements: [makeElement('game-a'), makeElement('game-b')],
      finished: [],
      state: 'idle'
    })

    mount()
    await Promise.resolve()
    await Promise.resolve()
    const tree = reinvoke() as AnyElement

    const allElements = [tree, ...collectElements(tree.props.children)]
    const tagged = allElements.filter(
      (el) => el.props?.['data-tour'] === 'nav-downloads'
    )
    expect(tagged).toHaveLength(1)
  })
})

/**
 * F-34.10-02 cause (b), diagnosed in 34.10-F02-DIAGNOSIS.md (surviving
 * hypothesis H3): `RingProgress` was the only `hasProgress` consumer that
 * was conditionally mounted on `head`'s truthiness, so its hook instance
 * was torn down and reseeded at every queue-membership boundary. These
 * tests actually INVOKE `RingProgress` (a named export as of 34.10-15,
 * added for exactly this reason) instead of only inspecting it as an
 * unexecuted `{ type: RingProgress, props }` node in the outer component's
 * element graph -- the gap `DownloadsRing.test.tsx` had until now, per the
 * diagnosis's own "Test-coverage gap" section.
 *
 * These assertions cover the DATA PATH only: does `--dl-progress` track
 * `hasProgress`'s returned percent, and does `RingProgress` stay present
 * in the tree across the idle/active boundary. Whether the arc actually
 * paints visible pixels is NOT provable here -- this jest project is
 * `testEnvironment: 'node'`, no jsdom, no CSS engine. That proof is routed
 * to plan 34.10-16's live gate, item 4.
 */
describe('RingProgress arc binding (F-34.10-02)', () => {
  beforeEach(() => {
    currentPathname = '/'
    progressPercent = 42
    hasProgressMock.mockReset()
    hasProgressMock.mockImplementation(() => [{ percent: progressPercent }, {}])
    mockApi.getDMQueueInformation.mockReset().mockResolvedValue({
      elements: [],
      finished: [],
      state: 'idle'
    })
    mockApi.handleDMQueueInformation.mockReset().mockReturnValue(jest.fn())
  })

  it('derives --dl-progress as a turn fraction of hasProgress percent (42 -> 0.42turn)', () => {
    hasProgressMock.mockReturnValueOnce([{ percent: 42 }, {}])

    const element = RingProgress({
      appName: 'x',
      runner: 'legendary'
    }) as unknown as AnyElement

    expect(
      (element.props.style as Record<string, string>)['--dl-progress']
    ).toBe('0.42turn')
  })

  it('renders 0turn when percent is 0', () => {
    hasProgressMock.mockReturnValueOnce([{ percent: 0 }, {}])

    const element = RingProgress({
      appName: 'x',
      runner: 'legendary'
    }) as unknown as AnyElement

    expect(
      (element.props.style as Record<string, string>)['--dl-progress']
    ).toBe('0turn')
  })

  it('renders 1turn when percent is 100', () => {
    hasProgressMock.mockReturnValueOnce([{ percent: 100 }, {}])

    const element = RingProgress({
      appName: 'x',
      runner: 'legendary'
    }) as unknown as AnyElement

    expect(
      (element.props.style as Record<string, string>)['--dl-progress']
    ).toBe('1turn')
  })

  it('renders 0turn and does not throw when percent is undefined (the ?? 0 path)', () => {
    hasProgressMock.mockReturnValueOnce([{ percent: undefined }, {}])

    expect(() => {
      const element = RingProgress({
        appName: 'x',
        runner: 'legendary'
      }) as unknown as AnyElement

      expect(
        (element.props.style as Record<string, string>)['--dl-progress']
      ).toBe('0turn')
    }).not.toThrow()
  })

  it('carries className exactly DownloadsRing__ring, the selector 34.10-14 stylesheet targets', () => {
    hasProgressMock.mockReturnValueOnce([{ percent: 42 }, {}])

    const element = RingProgress({
      appName: 'x',
      runner: 'legendary'
    }) as unknown as AnyElement

    expect(element.props.className).toBe('DownloadsRing__ring')
  })

  it('REGRESSION (F-34.10-02 H3): RingProgress stays in the element tree across the idle -> active queue-membership boundary, so its hasProgress hook instance is never torn down and reseeded', () => {
    hasProgressMock.mockImplementation(() => [{ percent: 0 }, {}])

    const idleTree = mount() as AnyElement
    const idleRingElement = collectElements(idleTree.props.children).find(
      (el) => el.type === RingProgress
    )

    // Pre-fix: RingProgress was only mounted while `head` was truthy; while
    // idle the outer component rendered a bare `<span>`, never RingProgress
    // itself, so `idleRingElement` would be `undefined` here. If this
    // assertion ever fails again, the conditional-mount defect has come
    // back. (Verified against the pre-fix component -- see plan 34.10-15's
    // SUMMARY for the method.)
    expect(idleRingElement).toBeDefined()
    expect(idleRingElement?.type).toBe(RingProgress)

    const idleSpan = RingProgress(
      idleRingElement?.props as { appName: string; runner: Runner }
    ) as unknown as AnyElement
    const firstValue = (idleSpan.props.style as Record<string, string>)[
      '--dl-progress'
    ]
    expect(firstValue).toBe('0turn')

    // The queue now gains an actively-downloading head, pushed the same way
    // the real backend pushes it -- via handleDMQueueInformation's
    // callback, not by remounting the component.
    hasProgressMock.mockImplementation(() => [{ percent: 55 }, {}])
    const pushCallback = mockApi.handleDMQueueInformation.mock.calls[0][0] as (
      event: unknown,
      elements: DMQueueElement[]
    ) => void
    pushCallback({}, [makeElement('active-game')])

    const activeTree = reinvoke() as AnyElement
    const activeRingElement = collectElements(activeTree.props.children).find(
      (el) => el.type === RingProgress
    )
    expect(activeRingElement).toBeDefined()
    expect(activeRingElement?.props.appName).toBe('active-game')

    const activeSpan = RingProgress(
      activeRingElement?.props as { appName: string; runner: Runner }
    ) as unknown as AnyElement
    const secondValue = (activeSpan.props.style as Record<string, string>)[
      '--dl-progress'
    ]

    // The sequence [idle, active] must show two DIFFERENT values -- a
    // single static assertion cannot catch a reseeding-at-mount-boundary
    // defect.
    expect(secondValue).toBe('0.55turn')
    expect(secondValue).not.toBe(firstValue)
  })
})
