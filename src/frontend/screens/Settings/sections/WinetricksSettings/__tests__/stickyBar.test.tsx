/**
 * Phase 45 Plan 08 (D-02/D-11/D-12/D-13, UI-SPEC E8): the sticky bottom bar in
 * its three modes. The component is rendered on its own through the shared
 * `treeHarness` (no jsdom here, see `src/frontend/jest.config.js`).
 *
 *  - rest:     `N selected` on the left, Apply on the right
 *  - inFlight: `Installing x of y . title` plus a neutral Cancel remaining
 *  - done:     `N installed` and, only when something failed, `M failed`
 */
import type { WinetricksQueueRun, WinetricksVerbOutcome } from 'common/types'
import {
  collectText,
  findAll,
  findByClass,
  harness,
  render,
  type ElementLike
} from './treeHarness'

jest.mock('../StickyBar/index.scss', () => ({}), { virtual: true })
jest.mock('react', () =>
  jest
    .requireActual<typeof import('./treeHarness')>('./treeHarness')
    .createReactMock()
)
jest.mock('react-i18next', () =>
  jest
    .requireActual<typeof import('./treeHarness')>('./treeHarness')
    .createI18nMock()
)

import StickyBar from '../StickyBar'

type BarProps = Parameters<typeof StickyBar>[0]

function runOf(
  outcomes: Record<string, WinetricksVerbOutcome>,
  overrides: Partial<WinetricksQueueRun> = {}
): WinetricksQueueRun {
  return {
    runId: 1,
    runner: 'legendary',
    appName: 'fake-app',
    verbs: Object.keys(outcomes),
    outcomes,
    currentVerb: '',
    status: 'running',
    cancelRequested: false,
    log: [],
    ...overrides
  }
}

function props(overrides: Partial<BarProps> = {}): BarProps {
  return {
    mode: 'rest',
    selectedCount: 0,
    run: null,
    titleOf: (verb) => `Title ${verb.toUpperCase()}`,
    applyDisabled: false,
    onApply: jest.fn(),
    onCancelRemaining: jest.fn(),
    ...overrides
  }
}

function bar(overrides: Partial<BarProps> = {}): ElementLike {
  return render(StickyBar, props(overrides))
}

function applyButton(tree: ElementLike): ElementLike | undefined {
  return findByClass(tree, 'WinetricksStickyBar__apply')[0]
}

function cancelButton(tree: ElementLike): ElementLike | undefined {
  return findByClass(tree, 'WinetricksStickyBar__cancel')[0]
}

beforeEach(() => {
  harness().__resetMount()
})

const PRIMARY = { button: 0, preventDefault: () => undefined }

describe('rest mode (E8-empty, E8-populated, E8-zero-one-many)', () => {
  it('non-vacuity: the bar root renders with its class and a text area', () => {
    const tree = bar()
    expect(String(tree.props.className)).toContain('WinetricksStickyBar')
    expect(findByClass(tree, 'WinetricksStickyBar__text')).toHaveLength(1)
  })

  it('zero selected: reads "0 selected" and Apply is disabled', () => {
    const tree = bar({ selectedCount: 0 })
    expect(collectText(findByClass(tree, 'WinetricksStickyBar__text')[0])).toBe(
      '0 selected'
    )
    expect(applyButton(tree)?.props.disabled).toBe(true)
    expect(cancelButton(tree)).toBeUndefined()
  })

  it('two selected: Apply is enabled and its accessible name carries the count', () => {
    const tree = bar({ selectedCount: 2 })
    expect(collectText(findByClass(tree, 'WinetricksStickyBar__text')[0])).toBe(
      '2 selected'
    )
    const apply = applyButton(tree)
    expect(apply?.props.disabled).toBe(false)
    expect(apply?.props['aria-label']).toBe('Apply 2 selected components')
    expect(collectText(apply)).toBe('Apply')
  })

  it('one selected: singular forms of both strings', () => {
    const tree = bar({ selectedCount: 1 })
    expect(collectText(findByClass(tree, 'WinetricksStickyBar__text')[0])).toBe(
      '1 selected'
    )
    expect(applyButton(tree)?.props['aria-label']).toBe(
      'Apply 1 selected component'
    )
  })

  it('a foreign install (applyDisabled) keeps Apply disabled even with a selection', () => {
    expect(
      applyButton(bar({ selectedCount: 3, applyDisabled: true }))?.props
        .disabled
    ).toBe(true)
  })
})

describe('in-flight mode (E8-loading, E8-partial)', () => {
  const midRun = runOf(
    { a: 'installed', b: 'installing', c: 'pending' },
    { currentVerb: 'b' }
  )

  it('replaces the count with "Installing x of y . title" and shows Cancel, not Apply', () => {
    const tree = bar({ mode: 'inFlight', run: midRun })
    expect(collectText(findByClass(tree, 'WinetricksStickyBar__text')[0])).toBe(
      'Installing 2 of 3 · Title B'
    )
    expect(applyButton(tree)).toBeUndefined()
    const cancel = cancelButton(tree)
    expect(cancel).toBeDefined()
    expect(collectText(cancel)).toBe('Cancel remaining')
    expect(cancel?.props.disabled).toBe(false)
  })

  it('E8-partial: Cancel is present but DISABLED while currentVerb is empty (between two verbs)', () => {
    const gap = runOf(
      { a: 'installed', b: 'pending', c: 'pending' },
      { currentVerb: '' }
    )
    const tree = bar({ mode: 'inFlight', run: gap })
    const cancel = cancelButton(tree)
    expect(cancel).toBeDefined()
    expect(cancel?.props.disabled).toBe(true)
  })

  it('names the verb that is about to start while currentVerb is empty, never a blank title', () => {
    const gap = runOf(
      { a: 'installed', b: 'pending', c: 'pending' },
      { currentVerb: '' }
    )
    const text = collectText(
      findByClass(
        bar({ mode: 'inFlight', run: gap }),
        'WinetricksStickyBar__text'
      )[0]
    )
    expect(text).toBe('Installing 2 of 3 · Title B')
  })

  it('Cancel is disabled once a cancel has been requested (the press had an effect)', () => {
    const asked = runOf(
      { a: 'installing', b: 'pending' },
      { currentVerb: 'a', cancelRequested: true }
    )
    expect(
      cancelButton(bar({ mode: 'inFlight', run: asked }))?.props.disabled
    ).toBe(true)
  })

  it('Cancel is a neutral control: it carries no accent or danger modifier class', () => {
    const cancel = cancelButton(bar({ mode: 'inFlight', run: midRun }))
    const cn = String(cancel?.props.className)
    expect(cn).not.toMatch(/accent|danger|primary|error/)
  })

  it('Cancel is activated once by mousedown, and its trailing click is suppressed (Interaction 2)', () => {
    const onCancelRemaining = jest.fn()
    const cancel = cancelButton(
      bar({ mode: 'inFlight', run: midRun, onCancelRemaining })
    )
    ;(cancel?.props.onMouseDown as (e: unknown) => void)(PRIMARY)
    ;(cancel?.props.onClick as () => void)()
    expect(onCancelRemaining).toHaveBeenCalledTimes(1)
  })

  it('Cancel still works from a bare click (keyboard activation)', () => {
    const onCancelRemaining = jest.fn()
    const cancel = cancelButton(
      bar({ mode: 'inFlight', run: midRun, onCancelRemaining })
    )
    ;(cancel?.props.onClick as () => void)()
    expect(onCancelRemaining).toHaveBeenCalledTimes(1)
  })
})

describe('done mode (E8-error, E8-zero-one-many)', () => {
  it('a mixed run reads "N installed" then "M failed" in a separate fragment', () => {
    const done = runOf(
      { a: 'installed', b: 'failed', c: 'installed' },
      { status: 'done' }
    )
    const tree = bar({ mode: 'done', run: done })
    expect(findByClass(tree, 'WinetricksStickyBar__installed')).toHaveLength(1)
    expect(
      collectText(findByClass(tree, 'WinetricksStickyBar__installed')[0])
    ).toBe('2 installed')
    const failed = findByClass(tree, 'WinetricksStickyBar__failed')
    expect(failed).toHaveLength(1)
    expect(collectText(failed[0])).toBe('1 failed')
    expect(applyButton(tree)).toBeUndefined()
    expect(cancelButton(tree)).toBeUndefined()
  })

  it('the " . " separator is CSS, never a character in the markup', () => {
    const done = runOf({ a: 'installed', b: 'failed' }, { status: 'done' })
    expect(collectText(bar({ mode: 'done', run: done }))).not.toContain('·')
  })

  it('a run with no failure renders no failed fragment at all', () => {
    const done = runOf({ a: 'installed', b: 'installed' }, { status: 'done' })
    const tree = bar({ mode: 'done', run: done })
    expect(findByClass(tree, 'WinetricksStickyBar__failed')).toHaveLength(0)
    expect(collectText(tree)).toBe('2 installed')
  })

  it('singular forms: "1 installed" and "1 failed"', () => {
    const done = runOf({ a: 'installed', b: 'failed' }, { status: 'done' })
    const tree = bar({ mode: 'done', run: done })
    expect(collectText(tree)).toBe('1 installed1 failed')
  })

  it('cancelled and pending outcomes count as neither installed nor failed', () => {
    const done = runOf(
      { a: 'installed', b: 'cancelled', c: 'cancelled' },
      { status: 'done' }
    )
    expect(collectText(bar({ mode: 'done', run: done }))).toBe('1 installed')
  })

  it('the bar itself takes no error styling, even when everything failed', () => {
    const done = runOf({ a: 'failed', b: 'failed' }, { status: 'done' })
    const tree = bar({ mode: 'done', run: done })
    const everyClass = findAll(tree, () => true)
      .map((el) =>
        typeof el.props.className === 'string' ? el.props.className : ''
      )
      .join(' ')
    expect(String(tree.props.className)).not.toMatch(/error|danger/)
    expect(everyClass).not.toMatch(/--error|--danger/)
  })
})

describe('Apply activation', () => {
  it('Apply is activated once by mousedown, and its trailing click is suppressed', () => {
    const onApply = jest.fn()
    const apply = applyButton(bar({ selectedCount: 1, onApply }))
    ;(apply?.props.onMouseDown as (e: unknown) => void)(PRIMARY)
    ;(apply?.props.onClick as () => void)()
    expect(onApply).toHaveBeenCalledTimes(1)
  })
})
