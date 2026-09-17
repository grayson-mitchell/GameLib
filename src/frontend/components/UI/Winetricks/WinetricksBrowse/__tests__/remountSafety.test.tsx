/**
 * Phase 44, plan 05 (D-17/D-18). Proves `Winetricks/index.tsx` mounts
 * `WinetricksBrowse` unconditionally on `!declined` (C-1) and never re-gates
 * it on either `installing` or the installed-list revalidation flag -- the
 * exact shape Phase 35 Plan 25 (`366e719bb`) only half-closed: that fix
 * covered the `installing` trigger (an install starting) but left the
 * post-install refetch trigger (`listInstalled()`'s revalidation flag)
 * unguarded. D-18 requires the PROOF to be a revert-to-red on each trigger
 * INDEPENDENTLY -- see the bottom of this file's companion revert
 * transcripts recorded in `44-05-SUMMARY.md` -- not merely that this suite
 * passes today.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`'s own docstring), so this follows the
 * established hand-rolled hook-harness pattern, copied from
 * `winetricksInstallMouseRace.test.tsx` (Row) and extended per
 * `WinetricksBrowse.test.tsx`'s "mock the whole nested component" precedent:
 * JSX only ever *constructs* an element object for a function-component
 * type -- it never calls the function -- so a nested custom component like
 * `WinetricksBrowse` appears in `Winetricks`'s own returned tree as an
 * un-invoked element descriptor. Invoking it for real here would either
 * collide its hook-slot cursors with `Winetricks`'s own (same mocked
 * `'react'` module, one shared slot array) or require a full
 * `__resetMount()` that would destroy the very persisted state
 * (`installing`, `isRevalidatingInstalled`, ...) these tests need to survive
 * across `reinvoke()` calls. `WinetricksBrowse` is therefore mocked
 * entirely, as a simple hook-free stand-in that derives `WinetricksBrowse__row`
 * divs directly from its `allComponents` prop and a
 * `WinetricksBrowse__revalidating` div from its `isRevalidatingInstalled`
 * prop -- both props `Winetricks` passes straight through, so row-key
 * stability and the revalidation-indicator's presence are exactly what this
 * file needs to observe. `ProgressDialog` is mocked for the same reason,
 * and additionally because it side-effect-imports `./index.css`, which
 * ts-jest has no transform for in this project (no CSS moduleNameMapper is
 * configured, unlike the SVG one) -- no existing test in this repo imports
 * it, so this is a new precedent, not a followed one.
 *
 * Do not write `render()`, `fireEvent`, or `screen.*` -- there is no
 * renderer here to drive.
 */
import type { WinetricksComponent, Runner } from 'common/types'

// Colocated SCSS side-effect import -- same treatment as every other
// component test in this project (StoreSearchRow.test.tsx's precedent,
// followed again by winetricksInstallMouseRace.test.tsx above it in this
// same directory).
jest.mock('../../index.scss', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue: string,
      _options?: Record<string, unknown>
    ): string => defaultValue
  })
}))

// `SettingsContext`'s real module (`React.createContext(...)`) is left
// unmocked -- it is a plain value object with no side effects -- but real
// React's `useContext` needs an active dispatcher this harness never sets
// up, so `useContext` itself is stubbed below to return a fixed value
// regardless of which context object is passed, matching the
// `useContext: () => contextValue` idiom used across this project's other
// Frontend-project suites (e.g. `StoreSearchScreen.test.tsx`,
// `useStoreEmbedHost.test.tsx`).
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
    useContext: () => ({ appName: 'default' }),
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

// The whole nested `WinetricksBrowse` is mocked -- see the file-level
// comment above for why. This stand-in reflects exactly the two props this
// file's assertions care about: `allComponents` (row identity/stability)
// and `isRevalidatingInstalled` (the stale-while-revalidate indicator).
// Everything else `Winetricks` passes down is accepted and ignored.
jest.mock('../index', () => ({
  __esModule: true,
  default: (props: {
    allComponents: WinetricksComponent[]
    isRevalidatingInstalled: boolean
  }) => ({
    type: 'div',
    key: null,
    props: {
      className: 'WinetricksBrowse-mock',
      children: [
        props.isRevalidatingInstalled
          ? {
              type: 'div',
              key: 'revalidating-indicator',
              props: {
                className: 'WinetricksBrowse__revalidating',
                children: null
              }
            }
          : null,
        ...props.allComponents.map((component) => ({
          type: 'div',
          key: component.verb,
          props: {
            className: 'WinetricksBrowse__row',
            children: component.verb
          }
        }))
      ]
    }
  })
}))

// `ProgressDialog` is mocked entirely -- see the file-level comment above.
// Only `props.children` (the `dialogContent` fragment `Winetricks` builds)
// needs to survive into the returned tree; nothing else about the real
// dialog shell (C-6) is exercised or asserted on here.
jest.mock('../../../ProgressDialog', () => ({
  __esModule: true,
  ProgressDialog: (props: { children?: unknown }) => ({
    type: 'div',
    key: null,
    props: {
      className: 'mock-progress-dialog',
      children: props.children
    }
  })
}))

import Winetricks from '../../index'
import MockedWinetricksBrowse from '../index'

type HookHarness = {
  __beginRender: () => void
  __resetMount: () => void
}

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

interface ElementLike {
  type: unknown
  key?: string | number | null
  props: Record<string, unknown> & { children?: unknown }
}

function walk(node: unknown, visit: (el: ElementLike) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit))
    return
  }
  if (!node || typeof node !== 'object') return
  const el = node as ElementLike
  if (!('props' in el) || !el.props) return
  visit(el)
  walk(el.props.children, visit)
}

function findAll(
  tree: ElementLike,
  predicate: (el: ElementLike) => boolean
): ElementLike[] {
  const found: ElementLike[] = []
  walk(tree, (el) => {
    if (predicate(el)) found.push(el)
  })
  return found
}

function hasClass(tree: ElementLike, className: string): boolean {
  return findAll(tree, (el) => el.props.className === className).length > 0
}

function findElementByType(
  tree: ElementLike,
  type: unknown
): ElementLike | undefined {
  let found: ElementLike | undefined
  walk(tree, (el) => {
    if (el.type === type) found = el
  })
  return found
}

// `WinetricksBrowse` is a LEAF component call (`<WinetricksBrowse ... />`,
// no JSX children) -- unlike `ProgressDialog` above, its rendered output is
// NOT reachable by descending through `.props.children`, because JSX only
// ever *constructs* an element descriptor for a function-component `type`;
// it never calls the function. To see what the mocked stand-in actually
// produced for a given render, its element must be located in the
// Winetricks tree and invoked directly -- the same "find the element, then
// call it yourself" move `WinetricksBrowse.test.tsx`'s `renderRow()` helper
// uses for the real `Row` component.
function renderBrowse(winetricksTree: ElementLike): ElementLike | undefined {
  const el = findElementByType(winetricksTree, MockedWinetricksBrowse)
  if (!el) return undefined
  return (el.type as (props: unknown) => ElementLike)(el.props)
}

function browseRowKeys(winetricksTree: ElementLike): string[] {
  const browseTree = renderBrowse(winetricksTree)
  if (!browseTree) return []
  return findAll(
    browseTree,
    (el) => el.props.className === 'WinetricksBrowse__row'
  )
    .map((el) => String(el.key))
    .sort()
}

function browseHasRevalidatingIndicator(winetricksTree: ElementLike): boolean {
  const browseTree = renderBrowse(winetricksTree)
  if (!browseTree) return false
  return hasClass(browseTree, 'WinetricksBrowse__revalidating')
}

type WinetricksProps = { onClose: () => void; runner: Runner }

function baseProps(): WinetricksProps {
  return { onClose: () => undefined, runner: 'legendary' as Runner }
}

function mount(props: WinetricksProps): ElementLike {
  harness().__resetMount()
  harness().__beginRender()
  return Winetricks(props) as unknown as ElementLike
}

function reinvoke(props: WinetricksProps): ElementLike {
  harness().__beginRender()
  return Winetricks(props) as unknown as ElementLike
}

async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

const FIXTURE_COMPONENTS: WinetricksComponent[] = [
  {
    verb: 'vcrun2019',
    title: 'Visual C++ 2019 libraries',
    category: 'dlls',
    cached: false
  },
  { verb: 'xact', title: 'XACT audio engine', category: 'dlls', cached: false }
]

type ProgressListener = (
  e: unknown,
  payload: { messages: string[]; installingComponent: string }
) => void
type InstallingListener = (e: unknown, component: string) => void

let pendingListInstalled: Array<(value: string[]) => void>
let mockApi: {
  winetricksListInstalled: jest.Mock
  winetricksListAvailable: jest.Mock
  winetricksInstall: jest.Mock
  handleProgressOfWinetricks: jest.Mock
  handleWinetricksInstalling: jest.Mock
  callTool: jest.Mock
  logError: jest.Mock
}

// This project's Frontend jest config sets `resetMocks: true`, which strips
// implementations (not just call history) off every `jest.fn()` before each
// test -- including one supplied at module/factory scope
// (`backend-jest-resetmocks-strips-factory-implementations`, same trap,
// same config flag, this project's Frontend config not just Backend's).
// Building a brand-new `mockApi` inside `beforeEach` sidesteps that
// entirely: there is nothing stale left over from a previous test to reset.
beforeEach(() => {
  pendingListInstalled = []
  mockApi = {
    winetricksListInstalled: jest.fn(
      () =>
        new Promise<string[]>((resolve) => {
          pendingListInstalled.push(resolve)
        })
    ),
    winetricksListAvailable: jest.fn(() => Promise.resolve(FIXTURE_COMPONENTS)),
    winetricksInstall: jest.fn(),
    handleProgressOfWinetricks: jest.fn(() => () => undefined),
    handleWinetricksInstalling: jest.fn(() => () => undefined),
    callTool: jest.fn(() => Promise.resolve()),
    logError: jest.fn()
  }
  ;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
    api: mockApi
  }
})

function capturedProgressListener(): ProgressListener {
  const calls = mockApi.handleProgressOfWinetricks.mock
    .calls as unknown as ProgressListener[][]
  return calls[calls.length - 1][0]
}

function capturedInstallingListener(): InstallingListener {
  const calls = mockApi.handleWinetricksInstalling.mock
    .calls as unknown as InstallingListener[][]
  return calls[calls.length - 1][0]
}

// Mounts, lets both initial IPC probes settle (available components +
// installed list, both empty/none), and returns the settled tree. Every
// case below starts from this same baseline.
async function mountSettled(): Promise<{
  props: WinetricksProps
  tree: ElementLike
}> {
  const props = baseProps()
  mount(props)
  await flush()

  const resolveInstalled = pendingListInstalled.shift()
  if (!resolveInstalled) {
    throw new Error(
      'expected an in-flight winetricksListInstalled call after mount -- this test proves nothing'
    )
  }
  resolveInstalled([])
  await flush()

  return { props, tree: reinvoke(props) }
}

describe('Winetricks remount safety (D-17/D-18, C-1)', () => {
  it('non-vacuity anchor: installWrapper and rows are present once settled', async () => {
    const { tree } = await mountSettled()
    expect(hasClass(tree, 'installWrapper')).toBe(true)
    expect(browseRowKeys(tree)).toEqual(['vcrun2019', 'xact'])
  })

  it('Case A -- install START (the `installing` trigger): installWrapper and row keys survive', async () => {
    const { props, tree: baseline } = await mountSettled()
    const baselineKeys = browseRowKeys(baseline)
    expect(baselineKeys.length).toBeGreaterThan(0)

    // Invoke the captured progress listener exactly as the real IPC bridge
    // would on an install starting -- this is what flips `installing` true.
    capturedProgressListener()(
      {},
      { messages: ['starting'], installingComponent: 'xact' }
    )

    const afterStart = reinvoke(props)
    expect(hasClass(afterStart, 'installWrapper')).toBe(true)
    expect(browseRowKeys(afterStart)).toEqual(baselineKeys)
  })

  it('Case B -- install COMPLETION (the post-install refetch trigger): installWrapper and row keys survive across the whole in-flight window', async () => {
    const { props, tree: baseline } = await mountSettled()
    const baselineKeys = browseRowKeys(baseline)
    expect(baselineKeys.length).toBeGreaterThan(0)

    // Invoke the captured installing-change listener exactly as the real
    // IPC bridge would on install completion (`component === ''`) -- this
    // is what triggers `listInstalled()`'s revalidation refetch.
    capturedInstallingListener()({}, '')

    // Assert WHILE the refetch is still in flight (nothing resolved yet).
    const inFlight = reinvoke(props)
    expect(hasClass(inFlight, 'installWrapper')).toBe(true)
    expect(browseRowKeys(inFlight)).toEqual(baselineKeys)

    // Now resolve the refetch and assert again on the other side of it.
    const resolveInstalled = pendingListInstalled.shift()
    if (!resolveInstalled) {
      throw new Error(
        'expected a second in-flight winetricksListInstalled call from the refetch -- this test proves nothing'
      )
    }
    resolveInstalled(['xact'])
    await flush()

    const afterRefetch = reinvoke(props)
    expect(hasClass(afterRefetch, 'installWrapper')).toBe(true)
    expect(browseRowKeys(afterRefetch)).toEqual(baselineKeys)
  })

  it("stale-while-revalidate contract (positive): the revalidating indicator IS present during Case B's in-flight window, not merely absent evidence of rows disappearing", async () => {
    const { props } = await mountSettled()

    capturedInstallingListener()({}, '')

    const inFlight = reinvoke(props)
    // Asserted together and positively -- a test that only checked rows
    // survived would pass just as well against an implementation that had
    // silently dropped the indicator element entirely.
    expect(browseHasRevalidatingIndicator(inFlight)).toBe(true)
    expect(hasClass(inFlight, 'installWrapper')).toBe(true)
    expect(browseRowKeys(inFlight).length).toBeGreaterThan(0)

    const resolveInstalled = pendingListInstalled.shift()
    if (!resolveInstalled) {
      throw new Error(
        'expected a second in-flight winetricksListInstalled call from the refetch -- this test proves nothing'
      )
    }
    resolveInstalled(['xact'])
    await flush()

    const afterRefetch = reinvoke(props)
    expect(browseHasRevalidatingIndicator(afterRefetch)).toBe(false)
  })
})
