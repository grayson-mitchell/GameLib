/**
 * Regression proof for the winetricks mouse-click race (Phase 35 Plan 25,
 * commit `366e719bb`, closing REQ-35-16's winetricks clause), PORTED from the
 * Phase 44 `WinetricksBrowse/__tests__/winetricksInstallMouseRace.test.tsx`
 * (read from git: `git show e297ec0df^:src/frontend/components/UI/Winetricks/
 * WinetricksBrowse/__tests__/winetricksInstallMouseRace.test.tsx`; commit
 * `e297ec0df` deleted it, D-04) onto the new Phase 45 `WinetricksRow`.
 *
 * Root cause, unchanged: a real mouse click's `mousedown` correctly targets a
 * button while the surrounding list is mounted, but a parent-driven remount can
 * remove that button before `mouseup`/`click` fire, so `click` is never
 * synthesised and the handler never runs. Keyboard activation dispatches
 * `click` directly against the still-focused element, so it is unaffected.
 *
 * The technique (mousedown-capture plus a `suppressNextClick` guard) now guards
 * the row's CHECKBOX and RETRY button. The Phase 44 Install and Open GUI buttons
 * no longer exist (D-10, D-17). The contract asserted is the same: one gesture
 * invokes the action exactly once.
 */
import type { WinetricksComponent } from 'common/types'
import type { WinetricksRowState } from 'common/winetricks/deriveRowState'
import { findByClass, harness, render, type ElementLike } from './treeHarness'

jest.mock('../Row/index.scss', () => ({}), { virtual: true })
jest.mock('react', () => jest.requireActual('./treeHarness').createReactMock())
jest.mock('react-i18next', () =>
  jest.requireActual('./treeHarness').createI18nMock()
)
jest.mock('@fortawesome/react-fontawesome', () =>
  jest.requireActual('./treeHarness').createFontAwesomeMock()
)

import WinetricksRow from '../Row/index'

type RowProps = Parameters<typeof WinetricksRow>[0]

const VCRUN: WinetricksComponent = {
  verb: 'vcrun2019',
  title: 'Visual C++ 2019 libraries',
  category: 'dlls',
  cached: false
}

function baseProps(
  rowState: WinetricksRowState,
  overrides: Partial<RowProps> = {}
): RowProps {
  return {
    component: VCRUN,
    rowState,
    template: 'twoLine',
    locked: false,
    showDone: false,
    showCategory: false,
    onToggle: () => undefined,
    onRetry: () => undefined,
    ...overrides
  }
}

function mount(props: RowProps): ElementLike {
  harness().__resetMount()
  return render(WinetricksRow, props)
}

function reinvoke(props: RowProps): ElementLike {
  return render(WinetricksRow, props)
}

function findButton(tree: ElementLike, className: string): ElementLike {
  const found = findByClass(tree, className)
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one ${className}, saw ${found.length} -- this test proves nothing`
    )
  }
  return found[0]
}

function extractHandlers(button: ElementLike) {
  return {
    onMouseDown: button.props.onMouseDown as
      | ((e: { preventDefault: () => void; button?: number }) => void)
      | undefined,
    onClick: button.props.onClick as (() => void) | undefined
  }
}

describe('Row checkbox mouse-click race (D-04, ported from Phase 35 Plan 25)', () => {
  const CHECKBOX = 'WinetricksRow__checkbox'

  it('renders a checkbox at all (non-vacuity anchor)', () => {
    const tree = mount(baseProps('available'))
    expect(() => findButton(tree, CHECKBOX)).not.toThrow()
  })

  it('mousedown alone toggles exactly once with this row verb and prevents default', () => {
    const onToggle = jest.fn()
    const tree = mount(baseProps('available', { onToggle }))
    const { onMouseDown } = extractHandlers(findButton(tree, CHECKBOX))

    expect(typeof onMouseDown).toBe('function')
    const preventDefault = jest.fn()
    onMouseDown!({ preventDefault })

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith('vcrun2019')
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('a click that follows the mousedown does not double-toggle', () => {
    const onToggle = jest.fn()
    const tree = mount(baseProps('available', { onToggle }))
    const { onMouseDown, onClick } = extractHandlers(findButton(tree, CHECKBOX))

    onMouseDown!({ preventDefault: jest.fn() })
    onClick!()

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('click alone (no preceding mousedown) still toggles -- keyboard activation path', () => {
    const onToggle = jest.fn()
    const tree = mount(baseProps('available', { onToggle }))
    const { onClick } = extractHandlers(findButton(tree, CHECKBOX))

    onClick!()

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith('vcrun2019')
  })

  it('a non-primary mouse button does not toggle and does not arm the click guard', () => {
    const onToggle = jest.fn()
    const tree = mount(baseProps('available', { onToggle }))
    const { onMouseDown, onClick } = extractHandlers(findButton(tree, CHECKBOX))

    onMouseDown!({ preventDefault: jest.fn(), button: 2 })
    expect(onToggle).not.toHaveBeenCalled()

    // The guard must not have been armed, or this keyboard click is eaten.
    onClick!()
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('Row Retry button mouse-click race (D-04: errored state)', () => {
  const RETRY = 'WinetricksRow__retry'

  function mountErrored(onRetry: (verb: string) => void): ElementLike {
    return mount(baseProps('errored', { onRetry }))
  }

  it('renders a Retry button at all (non-vacuity anchor)', () => {
    expect(() =>
      findButton(
        mountErrored(() => undefined),
        RETRY
      )
    ).not.toThrow()
  })

  it('mousedown alone retries exactly once with this row verb', () => {
    const onRetry = jest.fn()
    const { onMouseDown } = extractHandlers(
      findButton(mountErrored(onRetry), RETRY)
    )

    const preventDefault = jest.fn()
    onMouseDown!({ preventDefault })

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith('vcrun2019')
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('a click that follows the mousedown does not double-retry', () => {
    const onRetry = jest.fn()
    const { onMouseDown, onClick } = extractHandlers(
      findButton(mountErrored(onRetry), RETRY)
    )

    onMouseDown!({ preventDefault: jest.fn() })
    onClick!()

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('click alone (no preceding mousedown) still retries -- keyboard activation path', () => {
    const onRetry = jest.fn()
    const { onClick } = extractHandlers(
      findButton(mountErrored(onRetry), RETRY)
    )

    onClick!()

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith('vcrun2019')
  })
})

// The ref persists across re-invocations exactly as it would across real React
// re-renders of the same mounted instance.
describe('Row ref persistence across re-invocation', () => {
  it('suppressNextClick set by mousedown survives a re-render with the same props', () => {
    const onToggle = jest.fn()
    const props = baseProps('available', { onToggle })
    let tree = mount(props)
    const { onMouseDown } = extractHandlers(
      findButton(tree, 'WinetricksRow__checkbox')
    )
    onMouseDown!({ preventDefault: jest.fn() })

    tree = reinvoke(props)
    const { onClick } = extractHandlers(
      findButton(tree, 'WinetricksRow__checkbox')
    )
    onClick!()

    // The suppressed click must still be suppressed after a re-render --
    // onToggle was already invoked once by the mousedown above.
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
