/**
 * Structural tests for `DownloadsTabIcon`, the Downloads tab's icon slot
 * (quick 261012-dhs): a download glyph plus a live queue-count badge. The
 * queue subscription was ported from the deleted DownloadsRing.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- the component is invoked
 * directly as a plain function against a hand-rolled useState/useEffect
 * harness and its returned React-element object graph is inspected without
 * a DOM.
 */
import type { ReactElement, ReactNode } from 'react'
import type { DMQueueElement } from 'common/types'

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: (props: Record<string, unknown>) => ({
    type: 'mock-fontawesome-icon',
    props
  })
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

const mockApi = {
  getDMQueueInformation: jest.fn(),
  handleDMQueueInformation: jest.fn()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDownload } from '@fortawesome/free-solid-svg-icons'
import DownloadsTabIcon from '../components/DownloadsTabIcon'

type HookHarness = {
  __beginRender: () => void
  __resetMount: () => void
  __getEffectCleanups: () => (void | (() => void))[]
}

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

type AnyProps = Record<string, unknown> & { children?: ReactNode }
type AnyElement = ReactElement<AnyProps> & { props: AnyProps }

function mount(props: { className?: string } = {}): AnyElement {
  harness().__resetMount()
  harness().__beginRender()
  return DownloadsTabIcon(props) as unknown as AnyElement
}

function reinvoke(props: { className?: string } = {}): AnyElement {
  harness().__beginRender()
  return DownloadsTabIcon(props) as unknown as AnyElement
}

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

function findBadge(tree: AnyElement): AnyElement | undefined {
  return collectElements(tree.props.children).find(
    (el) => el.props?.className === 'NavTabs__downloadsCount'
  )
}

function makeElement(appName: string): DMQueueElement {
  return {
    type: 'install',
    params: { appName, runner: 'legendary' } as DMQueueElement['params'],
    addToQueueTime: 0,
    startTime: 0,
    endTime: 0
  }
}

describe('DownloadsTabIcon', () => {
  beforeEach(() => {
    mockApi.getDMQueueInformation.mockReset().mockResolvedValue({
      elements: [],
      finished: [],
      state: 'idle'
    })
    mockApi.handleDMQueueInformation.mockReset().mockReturnValue(jest.fn())
  })

  it('with an empty queue renders the download glyph and no count badge', () => {
    const tree = mount()

    expect(tree.props.className).toEqual(
      expect.stringContaining('NavTabs__downloadsIcon')
    )
    const icon = collectElements(tree.props.children).find(
      (el) => el.type === FontAwesomeIcon
    )
    expect(icon).toBeDefined()
    expect(icon?.props.icon).toBe(faDownload)
    expect(findBadge(tree)).toBeUndefined()
  })

  it('seeds the badge from getDMQueueInformation (two queued elements -> 2)', async () => {
    mockApi.getDMQueueInformation.mockResolvedValue({
      elements: [makeElement('game-a'), makeElement('game-b')],
      finished: [],
      state: 'idle'
    })

    mount()
    await Promise.resolve()
    await Promise.resolve()
    const tree = reinvoke()

    expect(findBadge(tree)?.props.children).toBe(2)
  })

  it('follows the handleDMQueueInformation push and hides the badge when the queue empties', () => {
    mount()
    const listener = mockApi.handleDMQueueInformation.mock.calls[0][0] as (
      event: unknown,
      elements: DMQueueElement[]
    ) => void

    listener({}, [makeElement('a'), makeElement('b'), makeElement('c')])
    expect(findBadge(reinvoke())?.props.children).toBe(3)

    listener({}, [])
    expect(findBadge(reinvoke())).toBeUndefined()
  })

  it("the mount effect's cleanup is the unsubscribe function returned by handleDMQueueInformation", () => {
    const unsubscribe = jest.fn()
    mockApi.handleDMQueueInformation.mockReturnValue(unsubscribe)

    mount()

    expect(harness().__getEffectCleanups()[0]).toBe(unsubscribe)
  })

  it("forwards MUI's cloned className onto the root alongside its own class", () => {
    const tree = mount({ className: 'MuiTab-iconWrapper' })

    expect(tree.props.className).toEqual(
      expect.stringContaining('NavTabs__downloadsIcon')
    )
    expect(tree.props.className).toEqual(
      expect.stringContaining('MuiTab-iconWrapper')
    )
  })

  it('logs a rejected seed, does not throw and shows no badge', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockApi.getDMQueueInformation.mockRejectedValue(new Error('boom'))

    let tree: AnyElement | undefined
    expect(() => {
      tree = mount()
    }).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    tree = reinvoke()

    expect(errorSpy).toHaveBeenCalled()
    expect(findBadge(tree)).toBeUndefined()
    errorSpy.mockRestore()
  })

  it('never carries a data-tour attribute (the Tab owns nav-downloads)', async () => {
    mockApi.getDMQueueInformation.mockResolvedValue({
      elements: [makeElement('game-a'), makeElement('game-b')],
      finished: [],
      state: 'idle'
    })

    mount()
    await Promise.resolve()
    await Promise.resolve()
    const tree = reinvoke()

    const all = [tree, ...collectElements(tree.props.children)]
    expect(all.filter((el) => el.props?.['data-tour'] !== undefined)).toEqual(
      []
    )
  })
})
