/**
 * Regression proof for the winetricks mouse-click race (Phase 35 Plan 25,
 * commit `366e719bb`, closing REQ-35-16's winetricks clause /
 * 35-VERIFICATION.md gap 2), PORTED from
 * `WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx` onto the
 * new `WinetricksBrowse/Row` component (D-19; plan 44-05 deletes the
 * original `WinetricksSearch` file this was ported from).
 *
 * Root cause, unchanged from the original: a live-measured `pnpm tauri:dev`
 * trace showed a real mouse click's `mousedown` correctly targets a list
 * button while the surrounding list is still mounted, but a parent-driven
 * remount (in Row's case: the post-install refetch swapping this row's
 * action-slot contents) can remove that button from the DOM before
 * `mouseup`/`click` fire, so `click` is never synthesized and the action
 * handler never runs. Keyboard activation (Tab + Enter/Space) dispatches
 * `click` directly against the still-focused element with no positional
 * hit-test, so it is unaffected.
 *
 * Extended beyond the original (which only covered Install): D-19 requires
 * the mousedown-capture + suppressNextClick technique on every clickable row
 * action, so this file also covers the Retry button (`errored` state) and
 * the Open GUI button (`needsGui` state), both wired through the same
 * `activate()` helper in `Row/index.tsx`.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`), so this follows the established
 * useState/useEffect/useRef re-invocation harness pattern, copied verbatim
 * from the source file named above: invoke the component as a plain
 * function against a hand-rolled hook harness and inspect the returned
 * React element graph.
 */
import type { ReactElement } from 'react'
import type { WinetricksComponent } from 'common/types'
import type { VerbErrorMap } from 'common/winetricks/deriveRowState'

// Colocated SCSS side-effect import -- ts-jest has no CSS transform and this
// project deliberately installs no such loader (jest.config.js docstring);
// following StoreSearchRow.test.tsx's precedent.
jest.mock('../Row/index.scss', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue: string,
      _options?: Record<string, unknown>
    ): string => defaultValue
  })
}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
  let effectCursor = 0
  let refSlots: { current: unknown }[] = []
  let refCursor = 0

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
    useRef: (initial: unknown) => {
      const idx = refCursor++
      if (idx >= refSlots.length) {
        refSlots[idx] = { current: initial }
      }
      return refSlots[idx]
    },
    __beginRender: () => {
      stateCursor = 0
      effectCursor = 0
      refCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
      refSlots = []
      refCursor = 0
    }
  }
})

import WinetricksBrowseRow from '../Row/index'

type RowProps = {
  component: WinetricksComponent
  installed: readonly string[]
  installing: boolean
  installingComponent: string
  erroredVerbs: VerbErrorMap
  onInstall: (verb: string) => void
  onOpenGui: () => void
}

type HookHarness = {
  __beginRender: () => void
  __resetMount: () => void
}

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function mount(props: RowProps): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return WinetricksBrowseRow(props) as unknown as ReactElement
}

function reinvoke(props: RowProps): ReactElement {
  harness().__beginRender()
  return WinetricksBrowseRow(props) as unknown as ReactElement
}

interface ElementLike {
  type: unknown
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

function findButton(tree: ElementLike, className: string): ElementLike {
  let found: ElementLike | undefined
  walk(tree, (el) => {
    if (el.props.className === className) found = el
  })
  if (!found) {
    throw new Error(
      `no ${className} button found -- this test proves nothing`
    )
  }
  return found
}

const VCRUN: WinetricksComponent = {
  verb: 'vcrun2019',
  title: 'Visual C++ 2019 libraries',
  category: 'dlls',
  cached: false
}

// 3dmark03 is a Needs-GUI verb (verbs.ts) -- used to drive the `needsGui`
// state for the Open GUI button coverage below.
const NEEDS_GUI_COMPONENT: WinetricksComponent = {
  verb: '3dmark03',
  title: '3DMark03',
  category: 'benchmarks',
  cached: false
}

function baseProps(overrides: Partial<RowProps> = {}): RowProps {
  return {
    component: VCRUN,
    installed: [],
    installing: false,
    installingComponent: '',
    erroredVerbs: {},
    onInstall: () => undefined,
    onOpenGui: () => undefined,
    ...overrides
  }
}

function extractHandlers(button: ElementLike) {
  const onMouseDown = button.props.onMouseDown as
    | ((e: { preventDefault: () => void }) => void)
    | undefined
  const onClick = button.props.onClick as (() => void) | undefined
  return { onMouseDown, onClick }
}

describe('Row Install button mouse-click race (D-19, ported from Phase 35 Plan 25)', () => {
  it('renders an Install button at all (non-vacuity anchor)', () => {
    const tree = mount(baseProps()) as unknown as ElementLike
    expect(() =>
      findButton(tree, 'WinetricksBrowse__installButton')
    ).not.toThrow()
  })

  it('mousedown alone fires onInstall exactly once with this row verb, before any click is required', () => {
    const onInstall = jest.fn()
    const tree = mount(baseProps({ onInstall })) as unknown as ElementLike
    const button = findButton(tree, 'WinetricksBrowse__installButton')
    const { onMouseDown } = extractHandlers(button)

    expect(typeof onMouseDown).toBe('function')
    const preventDefault = jest.fn()
    onMouseDown!({ preventDefault })

    expect(onInstall).toHaveBeenCalledTimes(1)
    expect(onInstall).toHaveBeenCalledWith('vcrun2019')
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('a click that follows the mousedown does not double-invoke onInstall', () => {
    const onInstall = jest.fn()
    const tree = mount(baseProps({ onInstall })) as unknown as ElementLike
    const button = findButton(tree, 'WinetricksBrowse__installButton')
    const { onMouseDown, onClick } = extractHandlers(button)

    onMouseDown!({ preventDefault: jest.fn() })
    onClick!()

    expect(onInstall).toHaveBeenCalledTimes(1)
  })

  it('click alone (no preceding mousedown) still installs -- keyboard activation path', () => {
    const onInstall = jest.fn()
    const tree = mount(baseProps({ onInstall })) as unknown as ElementLike
    const button = findButton(tree, 'WinetricksBrowse__installButton')
    const { onClick } = extractHandlers(button)

    expect(typeof onClick).toBe('function')
    onClick!()

    expect(onInstall).toHaveBeenCalledTimes(1)
    expect(onInstall).toHaveBeenCalledWith('vcrun2019')
  })
})

describe('Row Retry button mouse-click race (D-19 extension: errored state)', () => {
  function mountErrored(onInstall: (verb: string) => void): ElementLike {
    return mount(
      baseProps({ erroredVerbs: { vcrun2019: true }, onInstall })
    ) as unknown as ElementLike
  }

  it('renders a Retry button at all (non-vacuity anchor)', () => {
    const tree = mountErrored(() => undefined)
    expect(() =>
      findButton(tree, 'WinetricksBrowse__retryButton')
    ).not.toThrow()
  })

  it('mousedown alone fires onInstall exactly once with this row verb', () => {
    const onInstall = jest.fn()
    const tree = mountErrored(onInstall)
    const button = findButton(tree, 'WinetricksBrowse__retryButton')
    const { onMouseDown } = extractHandlers(button)

    const preventDefault = jest.fn()
    onMouseDown!({ preventDefault })

    expect(onInstall).toHaveBeenCalledTimes(1)
    expect(onInstall).toHaveBeenCalledWith('vcrun2019')
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('a click that follows the mousedown does not double-invoke onInstall', () => {
    const onInstall = jest.fn()
    const tree = mountErrored(onInstall)
    const button = findButton(tree, 'WinetricksBrowse__retryButton')
    const { onMouseDown, onClick } = extractHandlers(button)

    onMouseDown!({ preventDefault: jest.fn() })
    onClick!()

    expect(onInstall).toHaveBeenCalledTimes(1)
  })

  it('click alone (no preceding mousedown) still retries -- keyboard activation path', () => {
    const onInstall = jest.fn()
    const tree = mountErrored(onInstall)
    const button = findButton(tree, 'WinetricksBrowse__retryButton')
    const { onClick } = extractHandlers(button)

    onClick!()

    expect(onInstall).toHaveBeenCalledTimes(1)
    expect(onInstall).toHaveBeenCalledWith('vcrun2019')
  })
})

describe('Row Open GUI button mouse-click race (D-19 extension: needsGui state)', () => {
  function mountNeedsGui(onOpenGui: () => void): ElementLike {
    return mount(
      baseProps({ component: NEEDS_GUI_COMPONENT, onOpenGui })
    ) as unknown as ElementLike
  }

  it('renders an Open GUI button at all (non-vacuity anchor)', () => {
    const tree = mountNeedsGui(() => undefined)
    expect(() =>
      findButton(tree, 'WinetricksBrowse__guiButton')
    ).not.toThrow()
  })

  it('mousedown alone fires onOpenGui exactly once', () => {
    const onOpenGui = jest.fn()
    const tree = mountNeedsGui(onOpenGui)
    const button = findButton(tree, 'WinetricksBrowse__guiButton')
    const { onMouseDown } = extractHandlers(button)

    const preventDefault = jest.fn()
    onMouseDown!({ preventDefault })

    expect(onOpenGui).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('a click that follows the mousedown does not double-invoke onOpenGui', () => {
    const onOpenGui = jest.fn()
    const tree = mountNeedsGui(onOpenGui)
    const button = findButton(tree, 'WinetricksBrowse__guiButton')
    const { onMouseDown, onClick } = extractHandlers(button)

    onMouseDown!({ preventDefault: jest.fn() })
    onClick!()

    expect(onOpenGui).toHaveBeenCalledTimes(1)
  })

  it('click alone (no preceding mousedown) still opens the GUI -- keyboard activation path', () => {
    const onOpenGui = jest.fn()
    const tree = mountNeedsGui(onOpenGui)
    const button = findButton(tree, 'WinetricksBrowse__guiButton')
    const { onClick } = extractHandlers(button)

    onClick!()

    expect(onOpenGui).toHaveBeenCalledTimes(1)
  })
})

// Exercises `reinvoke()` so the harness's re-render path (used elsewhere by
// the multi-render effect-driven original) is proven to work against Row
// too, even though Row itself needs only one render per props change (no
// effects): the ref persists across re-invocations exactly as it would
// across real React re-renders of the same mounted instance.
describe('Row ref persistence across re-invocation', () => {
  it('suppressNextClick set by mousedown survives a reinvoke() with the same props', () => {
    const onInstall = jest.fn()
    const props = baseProps({ onInstall })
    let tree = mount(props) as unknown as ElementLike
    let button = findButton(tree, 'WinetricksBrowse__installButton')
    const { onMouseDown } = extractHandlers(button)
    onMouseDown!({ preventDefault: jest.fn() })

    tree = reinvoke(props) as unknown as ElementLike
    button = findButton(tree, 'WinetricksBrowse__installButton')
    const { onClick } = extractHandlers(button)
    onClick!()

    // The suppressed click must still be suppressed after a re-render --
    // onInstall was already invoked once by the mousedown above.
    expect(onInstall).toHaveBeenCalledTimes(1)
  })
})
