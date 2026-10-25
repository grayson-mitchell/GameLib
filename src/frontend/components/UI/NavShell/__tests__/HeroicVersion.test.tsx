/**
 * Structural tests for `HeroicVersion`, the relocated version block
 * (34.10-07 Task 1). No test file for this component existed before
 * 34.12-03.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `HeroicVersion` uses
 * `useState` (x4), `useEffect` (x2) and `useContext`, so it needs the
 * hand-rolled hooks harness (originally copied from the since-deleted `DownloadsRing.test.tsx`;
 * `DownloadsTabIcon.test.tsx` carries the same harness)
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

jest.mock('../../WelcomeModal', () => ({
  WelcomeModal: (props: Record<string, unknown>) => ({
    type: 'mock-welcome-modal',
    props
  })
}))

type MockContextValue = {
  platform: string
  hideChangelogsOnStartup: boolean
  lastChangelogShown: string
  setLastChangelogShown: jest.Mock
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    platform: 'darwin',
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
let storageData: Record<string, string> = {}
// Plain functions, not jest.fn(): the project's jest config resets mock
// implementations between tests, which would silently empty the storage.
const mockLocalStorage: Storage = {
  getItem: (key: string) => storageData[key] ?? null,
  setItem: (key: string, value: string) => {
    storageData[key] = value
  },
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0
}
// `HeroicVersion/index.tsx` reads `window.localStorage` at MODULE LOAD time
// (and decides first-run there) -- `window` must exist with a `localStorage`
// before the component is required, and each scenario re-requires the module
// inside `jest.isolateModules` with `storageData` set first.
;(
  globalThis as unknown as {
    window: { localStorage: Storage; api: typeof mockApi }
  }
).window = {
  localStorage: mockLocalStorage,
  api: mockApi
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

// Elements are not rendered, so the mocked components appear as their function
// type; identify them by function name.
function typeName(e: AnyElement): string {
  return typeof e.type === 'function' ? e.type.name : String(e.type)
}

type HookHarness = {
  __beginRender: () => void
  __resetMount: () => void
}

type Loaded = { render: () => AnyElement; harness: HookHarness }

// Re-requires the component (and the react mock, so the hooks harness is the
// one the component bound to) with `storageData` seeded. The `.type` unwrap:
// see file header docstring.
function load(seed: Record<string, string>): Loaded {
  storageData = { ...seed }
  let loaded: Loaded | undefined
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../components/HeroicVersion') as {
      default: { type: () => AnyElement }
    }
    loaded = {
      render: mod.default.type,
      harness: jest.requireMock('react') as unknown as HookHarness
    }
  })
  return loaded as Loaded
}

// An existing install: `last_version` already stored.
const EXISTING_INSTALL = { last_version: '"v0.9.0"' }

function mount(seed: Record<string, string> = EXISTING_INSTALL): AnyElement {
  const { render, harness } = load(seed)
  harness.__resetMount()
  harness.__beginRender()
  return render()
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
    const tagged = allElements.filter(
      (el) => el.props?.['data-tour'] !== undefined
    )
    expect(tagged).toHaveLength(1)
  })

  it('first run renders the WelcomeModal and NOT the changelog, even with the changelog enabled', () => {
    contextValue = makeContextValue({ hideChangelogsOnStartup: false })
    const root = mount({})

    const types = collectElements(root.props.children).map(typeName)
    expect(types).toContain('WelcomeModal')
    expect(types).not.toContain('ChangelogModal')
  })

  it('an existing install (stored last_version) still gets the changelog and no welcome', () => {
    // heroicVersion is '' on first render, so a distinct lastChangelogShown is
    // needed for the startup changelog branch to be open.
    contextValue = makeContextValue({
      hideChangelogsOnStartup: false,
      lastChangelogShown: 'v0.8.0'
    })
    const root = mount(EXISTING_INSTALL)

    const types = collectElements(root.props.children).map(typeName)
    expect(types).toContain('ChangelogModal')
    expect(types).not.toContain('WelcomeModal')
  })

  it('a stored welcome marker suppresses the welcome', () => {
    const root = mount({ gamelib_welcome_seen: '1' })

    const types = collectElements(root.props.children).map(typeName)
    expect(types).not.toContain('WelcomeModal')
  })

  it('closing the welcome persists the marker and marks the changelog seen', () => {
    const setLastChangelogShown = jest.fn()
    contextValue = makeContextValue({ setLastChangelogShown })
    const root = mount({})

    const welcome = collectElements(root.props.children).find(
      (e) => typeName(e) === 'WelcomeModal'
    )
    expect(welcome).toBeDefined()
    ;(welcome?.props.onClose as () => void)()

    expect(storageData.gamelib_welcome_seen).toBe('1')
    expect(setLastChangelogShown).toHaveBeenCalledTimes(1)
  })
})
