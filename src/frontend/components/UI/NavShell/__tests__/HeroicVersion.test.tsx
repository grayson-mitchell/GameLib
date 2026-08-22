/**
 * Structural tests for `HeroicVersion`, the relocated version block
 * (34.10-07 Task 1). No test file for this component existed before
 * 34.12-03.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `HeroicVersion` uses
 * `useState` (x4), `useEffect` (x2) and `useContext`, so it needs the
 * hand-rolled hooks harness (copied verbatim from `DownloadsRing.test.tsx`)
 * plus `useContext` mocked in the SAME `jest.mock('react', ...)` factory.
 *
 * The default export is `React.memo(function HeroicVersion() {...})`
 * (`HeroicVersion/index.tsx:35`). A memo result is a plain object
 * `{ $$typeof, type, compare }`, NOT a callable function -- calling it
 * directly throws "is not a function". The real render function lives at
 * `.type`; this file calls THAT.
 */
import type { ReactElement, ReactNode } from 'react'

jest.mock('../components/HeroicVersion/index.scss', () => ({}))

jest.mock('../../ChangelogModal', () => ({
  ChangelogModal: (props: Record<string, unknown>) => ({
    type: 'mock-changelog-modal',
    props
  })
}))

type MockContextValue = {
  hideChangelogsOnStartup: boolean
  lastChangelogShown: string
  setLastChangelogShown: jest.Mock
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    hideChangelogsOnStartup: true,
    lastChangelogShown: '',
    setLastChangelogShown: jest.fn(),
    ...overrides
  }
}

let contextValue: MockContextValue = makeContextValue()

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
    useContext: () => contextValue,
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
    }
  }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

const mockApi = {
  getHeroicVersion: jest.fn(),
  getLatestReleases: jest.fn(),
  logInfo: jest.fn(),
  clearCache: jest.fn(),
  openExternalUrl: jest.fn()
}
const mockLocalStorage: Storage = {
  getItem: jest.fn().mockReturnValue(null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0
}
// `HeroicVersion/index.tsx:32-33` reads `window.localStorage` at MODULE
// LOAD time -- `window` must exist with a `localStorage` before the import
// below runs.
;(
  globalThis as unknown as {
    window: { localStorage: Storage; api: typeof mockApi }
  }
).window = {
  localStorage: mockLocalStorage,
  api: mockApi
}

// Imported after the mocks and window setup above (textual order -- this
// project's ts-jest setup does not hoist jest.mock like babel-jest).
import HeroicVersion from '../components/HeroicVersion'

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

type HookHarness = {
  __beginRender: () => void
  __resetMount: () => void
}

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

// The `.type` unwrap -- see file header docstring.
const HeroicVersionRender = (
  HeroicVersion as unknown as { type: () => AnyElement }
).type

function mount(): AnyElement {
  harness().__resetMount()
  harness().__beginRender()
  return HeroicVersionRender()
}

beforeEach(() => {
  contextValue = makeContextValue()
  mockApi.getHeroicVersion.mockReset().mockResolvedValue('v1.0.0')
  mockApi.getLatestReleases.mockReset().mockResolvedValue([])
})

describe('HeroicVersion', () => {
  it("the returned root element's type is 'div' with className 'heroicVersionContainer'", () => {
    const root = mount()

    expect(root.type).toBe('div')
    expect(root.props.className).toBe('heroicVersionContainer')
  })

  it('the root carries data-tour="nav-version"', () => {
    const root = mount()

    expect(root.props['data-tour']).toBe('nav-version')
  })

  it('exactly one element in the returned tree carries a data-tour prop -- the anchor is on the container, not sprayed onto inner nodes', () => {
    const root = mount()

    const allElements = [root, ...collectElements(root.props.children)]
    const tagged = allElements.filter((el) => el.props?.['data-tour'] !== undefined)
    expect(tagged).toHaveLength(1)
  })
})
