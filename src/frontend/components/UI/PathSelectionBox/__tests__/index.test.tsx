/**
 * Component tests for PathSelectionBox's Enter-to-commit wiring and the
 * two-part double-commit guard (REQ-34.17-01, REQ-34.17-02).
 *
 * No DOM test environment (jsdom / react-test-renderer) is installed in
 * this project (see src/frontend/jest.config.js docstring) — 'react' is
 * mocked at the module level so the component can be invoked directly as a
 * plain function and its returned React-element object graph inspected
 * without a DOM. Harness copied from
 * src/frontend/screens/StoreSearch/__tests__/StoreSearchRow.test.tsx, with a
 * useRef slot added (that analog has none): PathSelectionBox's
 * enterCommittedRef must return the SAME object identity across renders for
 * the guard to work at all, so a fresh object per render would silently
 * defeat every guard assertion below.
 *
 * Every behavioural case below invokes a handler (props.onKeyDown /
 * props.onBlur) and asserts on jest.fn() call arguments and call counts —
 * never on the mere presence of a prop. This project's own named failure
 * mode is a gate that checks the call site rather than the behaviour.
 */
import type {
  ReactElement,
  KeyboardEvent as ReactKeyboardEvent,
  FocusEvent as ReactFocusEvent
} from 'react'

// Transitively imported CSS side-effect imports (PathSelectionBox ->
// TextInputWithIconField -> TextInputField -> './index.css', and
// TextInputWithIconField -> SvgButton -> './index.css'). No CSS transform is
// configured for this jest project, so both must be stubbed.
jest.mock('../../TextInputField/index.css', () => ({}))
jest.mock('../../SvgButton/index.css', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // PathSelectionBox calls t('box.choose') with a single argument inside
    // handleIconClick, which no case in this file exercises. Must tolerate
    // a missing defaultValue without throwing.
    t: (_key: string, defaultValue?: string): string | undefined => defaultValue
  })
}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let slots: unknown[] = []
  let effectDeps: (unknown[] | undefined)[] = []
  let cursor = 0
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
      const idx = cursor++
      if (idx >= slots.length) {
        slots[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const setState = (updater: unknown) => {
        slots[idx] =
          typeof updater === 'function'
            ? (updater as (prev: unknown) => unknown)(slots[idx])
            : updater
      }
      return [slots[idx], setState]
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        effectDeps[idx] = deps
        effect()
      }
    },
    // Not present in the StoreSearchRow.test.tsx analog — added here
    // because PathSelectionBox's guard depends on a ref that keeps its
    // object identity across renders. A fresh object per render would
    // silently defeat every guard assertion below.
    useRef: (initial: unknown) => {
      const idx = refCursor++
      if (idx >= refSlots.length) {
        refSlots[idx] = { current: initial }
      }
      return refSlots[idx]
    },
    __beginRender: () => {
      cursor = 0
      effectCursor = 0
      refCursor = 0
    },
    __resetMount: () => {
      slots = []
      effectDeps = []
      refSlots = []
      cursor = 0
      effectCursor = 0
      refCursor = 0
    }
  }
})

// Imported after the mocks above (textual order — this project's ts-jest
// setup does not hoist jest.mock like babel-jest) so the component
// transitively requires the mocked modules.
import PathSelectionBox from '../index'
import TextInputWithIconField from '../../TextInputWithIconField'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

type MountProps = {
  htmlId: string
  type: 'file' | 'directory'
  onPathChange: (path: string) => void
  path: string
  pathDialogTitle: string
}

// The handlers as PathSelectionBox wires them once Task 2 lands. Used to
// cast the field's untyped props object so call sites read
// `props.onKeyDown(...)` / `props.onBlur(...)` directly.
type FieldHandlers = {
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
  onBlur: (event: ReactFocusEvent<HTMLInputElement>) => void
}

// Same shape, but optional — used only by the non-Enter negative case,
// which must tolerate `onKeyDown` being `undefined` at HEAD (before Task 2)
// without throwing, so the case is a true regression anchor rather than a
// TypeError.
type OptionalFieldHandlers = {
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void
  onBlur?: (event: ReactFocusEvent<HTMLInputElement>) => void
}

function collectElements(
  node: unknown,
  out: ReactElement<Record<string, unknown>>[] = []
): ReactElement<Record<string, unknown>>[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, out))
    return out
  }
  if (typeof node === 'object' && 'type' in (node as Record<string, unknown>)) {
    const element = node as ReactElement<Record<string, unknown>>
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

function findByType(
  tree: unknown,
  type: unknown
): ReactElement<Record<string, unknown>> | undefined {
  return collectElements(tree).find((el) => el.type === type)
}

function mount(props: MountProps): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return PathSelectionBox(props) as ReactElement
}

// PathSelectionBox currently returns a single top-level
// <TextInputWithIconField> element, so `findByType` and the raw returned
// tree resolve to the same props object today. Using findByType anyway,
// because plan 34.17-02 wraps `afterInput` in a fragment and a bare
// `tree.props` read would then be walking the wrong node.
function mountField(props: MountProps): Record<string, unknown> {
  const tree = mount(props)
  const field = findByType(tree, TextInputWithIconField)
  if (!field) {
    throw new Error('TextInputWithIconField not found in PathSelectionBox tree')
  }
  return field.props
}

describe('PathSelectionBox', () => {
  it('commits the current input value on Enter (REQ-34.17-01)', () => {
    const onPathChange = jest.fn()
    const props = mountField({
      htmlId: 'test-path',
      type: 'directory',
      onPathChange,
      path: '',
      pathDialogTitle: 'Choose'
    }) as unknown as FieldHandlers

    props.onKeyDown({
      key: 'Enter',
      repeat: false,
      currentTarget: { value: '/tmp/foo' }
    } as unknown as ReactKeyboardEvent<HTMLInputElement>)

    expect(onPathChange).toHaveBeenCalledWith('/tmp/foo')
    expect(onPathChange).toHaveBeenCalledTimes(1)
  })

  // Passes at HEAD too (onKeyDown is undefined, so optional-chaining is a
  // no-op) — a regression anchor, not a defect pin. Mandatory regardless:
  // without it, a handler that commits on every keystroke would also pass
  // the suite, which is a worse defect than the one being fixed.
  it('does not commit on a non-Enter key (REQ-34.17-01, negative case)', () => {
    const onPathChange = jest.fn()
    const props = mountField({
      htmlId: 'test-path',
      type: 'directory',
      onPathChange,
      path: '',
      pathDialogTitle: 'Choose'
    }) as unknown as OptionalFieldHandlers

    props.onKeyDown?.({
      key: 'a',
      repeat: false,
      currentTarget: { value: '/tmp/par' }
    } as unknown as ReactKeyboardEvent<HTMLInputElement>)

    expect(onPathChange).not.toHaveBeenCalled()
  })

  it('does not commit on an auto-repeat Enter (T-34.17-02)', () => {
    const onPathChange = jest.fn()
    const props = mountField({
      htmlId: 'test-path',
      type: 'directory',
      onPathChange,
      path: '',
      pathDialogTitle: 'Choose'
    }) as unknown as FieldHandlers

    props.onKeyDown({
      key: 'Enter',
      repeat: true,
      currentTarget: { value: '/tmp/foo' }
    } as unknown as ReactKeyboardEvent<HTMLInputElement>)

    expect(onPathChange).not.toHaveBeenCalled()
  })

  it('does not double-fire when Enter is followed by a blur carrying the same value (REQ-34.17-02)', () => {
    const onPathChange = jest.fn()
    const props = mountField({
      htmlId: 'test-path',
      type: 'directory',
      onPathChange,
      path: '',
      pathDialogTitle: 'Choose'
    }) as unknown as FieldHandlers

    props.onKeyDown({
      key: 'Enter',
      repeat: false,
      currentTarget: { value: '/tmp/foo' }
    } as unknown as ReactKeyboardEvent<HTMLInputElement>)
    props.onBlur({
      target: { value: '/tmp/foo' }
    } as unknown as ReactFocusEvent<HTMLInputElement>)

    expect(onPathChange).toHaveBeenCalledTimes(1)
  })

  // Vacuity control for the case above: without this, a blanket "ignore
  // every blur after an Enter" implementation would also pass, and would
  // silently drop real edits.
  it('still commits when the blur value differs from what Enter committed (REQ-34.17-02, vacuity control)', () => {
    const onPathChange = jest.fn()
    const props = mountField({
      htmlId: 'test-path',
      type: 'directory',
      onPathChange,
      path: '',
      pathDialogTitle: 'Choose'
    }) as unknown as FieldHandlers

    props.onKeyDown({
      key: 'Enter',
      repeat: false,
      currentTarget: { value: '/tmp/foo' }
    } as unknown as ReactKeyboardEvent<HTMLInputElement>)
    props.onBlur({
      target: { value: '/tmp/bar' }
    } as unknown as ReactFocusEvent<HTMLInputElement>)

    expect(onPathChange).toHaveBeenCalledTimes(2)
    expect(onPathChange).toHaveBeenNthCalledWith(2, '/tmp/bar')
  })

  // Passes at HEAD too — a regression anchor, not a defect pin.
  it('commits on a blur with no preceding Enter, exactly as at HEAD (no regression)', () => {
    const onPathChange = jest.fn()
    const props = mountField({
      htmlId: 'test-path',
      type: 'directory',
      onPathChange,
      path: '/old',
      pathDialogTitle: 'Choose'
    }) as unknown as FieldHandlers

    props.onBlur({
      target: { value: '/new' }
    } as unknown as ReactFocusEvent<HTMLInputElement>)

    expect(onPathChange).toHaveBeenCalledWith('/new')
    expect(onPathChange).toHaveBeenCalledTimes(1)
  })

  it('does not commit a value that already equals the committed path prop (REQ-34.17-02)', () => {
    const onPathChange = jest.fn()
    const props = mountField({
      htmlId: 'test-path',
      type: 'directory',
      onPathChange,
      path: '/same',
      pathDialogTitle: 'Choose'
    }) as unknown as FieldHandlers

    props.onBlur({
      target: { value: '/same' }
    } as unknown as ReactFocusEvent<HTMLInputElement>)
    expect(onPathChange).not.toHaveBeenCalled()

    props.onKeyDown({
      key: 'Enter',
      repeat: false,
      currentTarget: { value: '/same' }
    } as unknown as ReactKeyboardEvent<HTMLInputElement>)
    expect(onPathChange).not.toHaveBeenCalled()
  })

  // Retry control: without this case, an implementation that arms
  // enterCommittedRef permanently instead of one-shot would pass every
  // other case while silently trapping the user in a field that has
  // stopped responding to Enter after a parent-rejected commit (e.g.
  // EgsSettings's egsSync failing and leaving egsPath stale).
  it('re-commits on a second Enter after the parent rejected the first (REQ-34.17-02, retry control)', () => {
    const onPathChange = jest.fn()
    const props = mountField({
      htmlId: 'test-path',
      type: 'directory',
      onPathChange,
      path: '',
      pathDialogTitle: 'Choose'
    }) as unknown as FieldHandlers

    props.onKeyDown({
      key: 'Enter',
      repeat: false,
      currentTarget: { value: '/tmp/foo' }
    } as unknown as ReactKeyboardEvent<HTMLInputElement>)
    props.onKeyDown({
      key: 'Enter',
      repeat: false,
      currentTarget: { value: '/tmp/foo' }
    } as unknown as ReactKeyboardEvent<HTMLInputElement>)

    expect(onPathChange).toHaveBeenCalledTimes(2)
    expect(onPathChange).toHaveBeenNthCalledWith(1, '/tmp/foo')
    expect(onPathChange).toHaveBeenNthCalledWith(2, '/tmp/foo')
  })
})
