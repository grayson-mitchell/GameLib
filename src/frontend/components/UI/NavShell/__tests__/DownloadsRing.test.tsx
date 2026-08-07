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
jest.mock('frontend/hooks/hasProgress', () => ({
  hasProgress: jest.fn(() => [{ percent: progressPercent }, {}])
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
          typeof initial === 'function'
            ? (initial as () => unknown)()
            : initial
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
import DownloadsRing from '../components/DownloadsRing'

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
})
