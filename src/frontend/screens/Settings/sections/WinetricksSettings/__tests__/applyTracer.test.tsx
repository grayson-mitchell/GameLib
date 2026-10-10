/**
 * Phase 45 Plan 01 (D-01/D-11): end-to-end tracer for the Winetricks Settings
 * tab. Proves the renderer half of the slice the plan's objective names: tick
 * one curated row, press Apply, see `window.api.winetricksApply` called with
 * exactly `(runner, appName, [verb])`; then a `winetricksQueueChanged` push
 * reporting that verb `installed` and the run `done` renders the row's
 * trailing tag as `Installed` and the sticky bar as `1 installed`.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`'s own docstring), so this follows the
 * established hand-rolled hook-harness pattern copied from
 * `WinetricksBrowse/__tests__/remountSafety.test.tsx`: `react` is mocked with
 * a minimal `useState`/`useEffect`/`useContext` implementation driven by
 * `__beginRender()`/`__resetMount()`, and the component is invoked directly
 * as a plain function -- never `render()`, `fireEvent`, or `screen.*`.
 */
import type {
  Runner,
  WinetricksComponent,
  WinetricksQueueState
} from 'common/types'

// Colocated SCSS side-effect import -- same treatment as every other
// component test in this project.
jest.mock('../index.scss', () => ({}))

// `t`'s second argument is either a plain English default string
// (`t('key', 'Default text')`) or an i18next options object carrying
// `defaultValue`/`defaultValue_one` plus interpolation values (the plural
// calls in this component, e.g. `tGamelib('...installedCount', { count,
// defaultValue, defaultValue_one })`). This stand-in covers both shapes and
// performs the same `{{token}}` interpolation i18next would, so assertions
// below can match the real rendered English text (e.g. "1 installed")
// instead of a raw, uninterpolated template.
function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key]
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : ''
  })
}

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValueOrOptions?: string | Record<string, unknown>
    ): string => {
      if (typeof defaultValueOrOptions === 'string') {
        return defaultValueOrOptions
      }
      if (defaultValueOrOptions && typeof defaultValueOrOptions === 'object') {
        const opts = defaultValueOrOptions
        const count = opts.count as number | undefined
        const template = (
          count === 1 && typeof opts.defaultValue_one === 'string'
            ? opts.defaultValue_one
            : opts.defaultValue
        ) as string | undefined
        return template ? interpolate(template, opts) : key
      }
      return key
    }
  })
}))

// Same `useContext: () => contextValue` idiom `remountSafety.test.tsx` uses
// for `SettingsContext` -- a plain value object, no provider needed.
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
    useContext: () => ({ appName: 'fake-app', runner: 'legendary' as Runner }),
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

import WinetricksSettings from '../index'

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

function hasClass(tree: ElementLike, className: string): ElementLike[] {
  return findAll(tree, (el) => el.props.className === className)
}

function collectText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(collectText).join('')
  }
  if (node && typeof node === 'object' && 'props' in (node as ElementLike)) {
    return collectText((node as ElementLike).props.children)
  }
  return ''
}

function mount(): ElementLike {
  harness().__resetMount()
  harness().__beginRender()
  return (WinetricksSettings as unknown as () => ElementLike)()
}

function reinvoke(): ElementLike {
  harness().__beginRender()
  return (WinetricksSettings as unknown as () => ElementLike)()
}

async function flush(times = 12): Promise<void> {
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
  }
]

function emptyFixtureQueueState(): WinetricksQueueState {
  return {
    runner: 'legendary' as Runner,
    appName: 'fake-app',
    run: null,
    busy: false,
    environment: { unsupportedWineVersion: null, missingDependencies: [] }
  }
}

type QueueChangedListener = (
  event: unknown,
  state: WinetricksQueueState
) => void

let mockApi: {
  winetricksListAvailable: jest.Mock
  winetricksListInstalled: jest.Mock
  winetricksQueueState: jest.Mock
  winetricksApply: jest.Mock
  winetricksCancelRemaining: jest.Mock
  handleWinetricksQueueChanged: jest.Mock
  logError: jest.Mock
}

// This project's Frontend jest config sets `resetMocks: true`, which strips
// implementations off every `jest.fn()` before each test -- building a
// brand-new `mockApi` inside `beforeEach` sidesteps that entirely.
beforeEach(() => {
  mockApi = {
    winetricksListAvailable: jest.fn(() => Promise.resolve(FIXTURE_COMPONENTS)),
    winetricksListInstalled: jest.fn(() => Promise.resolve([])),
    winetricksQueueState: jest.fn(() =>
      Promise.resolve(emptyFixtureQueueState())
    ),
    winetricksApply: jest.fn(() =>
      Promise.resolve({ accepted: true, state: emptyFixtureQueueState() })
    ),
    winetricksCancelRemaining: jest.fn(() =>
      Promise.resolve(emptyFixtureQueueState())
    ),
    handleWinetricksQueueChanged: jest.fn(() => () => undefined),
    logError: jest.fn()
  }
  ;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
    api: mockApi
  }
})

function capturedQueueChangedListener(): QueueChangedListener {
  const calls = mockApi.handleWinetricksQueueChanged.mock
    .calls as unknown as QueueChangedListener[][]
  return calls[calls.length - 1][0]
}

async function mountSettled(): Promise<ElementLike> {
  mount()
  await flush()
  return reinvoke()
}

function checkboxFor(tree: ElementLike, verb: string): ElementLike {
  const found = findAll(
    tree,
    (el) => el.props.className === 'WinetricksSettings__rowCheckbox'
  )
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one checkbox row for ${verb}, saw ${found.length} -- this test proves nothing`
    )
  }
  return found[0]
}

function applyButton(tree: ElementLike): ElementLike {
  const buttons = findAll(
    tree,
    (el) => el.type === 'button' && el.props.onClick !== undefined
  )
  const found = buttons.find((el) => collectText(el.props.children) === 'Apply')
  if (!found) {
    throw new Error(
      'expected an Apply button in the bar -- this test proves nothing'
    )
  }
  return found
}

describe('Winetricks Settings tab tracer (D-01/D-11)', () => {
  it('non-vacuity anchor: the curated vcrun2019 row and an Apply button are present once settled', async () => {
    const tree = await mountSettled()
    expect(hasClass(tree, 'WinetricksSettings__row')).toHaveLength(1)
    expect(() => applyButton(tree)).not.toThrow()
  })

  it('ticking the row then pressing Apply calls winetricksApply(runner, appName, [verb]) exactly once', async () => {
    const settled = await mountSettled()

    const checkbox = checkboxFor(settled, 'vcrun2019')
    ;(checkbox.props.onClick as () => void)()

    // Re-render to pick up the updated `selection` state -- the Apply
    // button's `onClick` closes over whichever `selection` array was live
    // at the render that produced it.
    const afterToggle = reinvoke()
    const apply = applyButton(afterToggle)
    ;(apply.props.onClick as () => void)()
    await flush()

    expect(mockApi.winetricksApply).toHaveBeenCalledTimes(1)
    expect(mockApi.winetricksApply).toHaveBeenCalledWith(
      'legendary',
      'fake-app',
      ['vcrun2019']
    )
  })

  it('a winetricksQueueChanged push reporting the verb installed and the run done renders "Installed" and "1 installed"', async () => {
    await mountSettled()

    const listener = capturedQueueChangedListener()
    listener(
      {},
      {
        runner: 'legendary' as Runner,
        appName: 'fake-app',
        busy: false,
        environment: { unsupportedWineVersion: null, missingDependencies: [] },
        run: {
          runId: 1,
          runner: 'legendary' as Runner,
          appName: 'fake-app',
          verbs: ['vcrun2019'],
          outcomes: { vcrun2019: 'installed' },
          currentVerb: '',
          status: 'done',
          cancelRequested: false,
          log: []
        }
      }
    )

    const tree = reinvoke()
    const installedTag = hasClass(
      tree,
      'WinetricksSettings__rowStatus WinetricksSettings__rowStatus--installed'
    )
    expect(installedTag).toHaveLength(1)
    expect(collectText(installedTag[0].props.children)).toBe('Installed')

    const bar = hasClass(tree, 'WinetricksSettings__bar')
    expect(bar).toHaveLength(1)
    expect(collectText(bar[0].props.children)).toContain('1 installed')
  })
})
