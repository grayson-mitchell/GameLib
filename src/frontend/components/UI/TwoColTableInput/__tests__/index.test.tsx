/**
 * Component tests for TableInput's in-place row editing (quick task
 * 261114-v4q). Edit turns the row's own cells into inputs; the footer row
 * only adds.
 *
 * No DOM test environment is installed (see src/frontend/jest.config.js), so
 * 'react' is mocked at module level and the component is called as a plain
 * function; its returned element tree is walked directly. Harness copied from
 * src/frontend/components/UI/PathSelectionBox/__tests__/index.test.tsx.
 *
 * Every case drives captured handlers and asserts on onChange call counts,
 * arguments and the re-rendered tree, never on the mere presence of a prop.
 */
import '../../../../testUtils/tauriWindow'
import type { ReactElement } from 'react'

jest.mock('../index.css', () => ({}))
jest.mock('../../TextInputField/index.css', () => ({}))
jest.mock('../../SvgButton/index.css', () => ({}))
jest.mock('../../FieldLabel/index.css', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string): string | undefined => defaultValue
  })
}))

jest.mock('frontend/state/settingsState', () => ({
  __esModule: true,
  default: () => false,
  selectIsRTL: () => false
}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let slots: unknown[] = []
  let effectDeps: (unknown[] | undefined)[] = []
  let cursor = 0
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
    __beginRender: () => {
      cursor = 0
      effectCursor = 0
    },
    __resetMount: () => {
      slots = []
      effectDeps = []
      cursor = 0
      effectCursor = 0
    }
  }
})

// Imported after the mocks (this project's ts-jest setup does not hoist).
import { TableInput, ColumnProps } from '../index'
import TextInputField from '../../TextInputField'
import SvgButton from '../../SvgButton'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }
type Props = Parameters<typeof TableInput>[0]
type El = ReactElement<Record<string, unknown>>

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function collectElements(node: unknown, out: El[] = []): El[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, out))
    return out
  }
  if (typeof node === 'object' && 'type' in (node as Record<string, unknown>)) {
    const element = node as El
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
  }
  return out
}

function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node as El).props.children)
  }
  return ''
}

class View {
  tree: unknown
  constructor(private props: Props) {
    harness().__resetMount()
    this.render()
  }
  render() {
    harness().__beginRender()
    this.tree = TableInput(this.props)
  }
  input(htmlId: string): El | undefined {
    return collectElements(this.tree).find(
      (e) => e.type === TextInputField && e.props.htmlId === htmlId
    )
  }
  inputValue(htmlId: string): unknown {
    return this.input(htmlId)?.props.value
  }
  buttons(label: string): El[] {
    return collectElements(this.tree).filter(
      (e) => e.type === SvgButton && e.props['aria-label'] === label
    )
  }
  errorRowText(): string {
    return collectElements(this.tree)
      .filter((e) => e.type === 'tr' && e.props.className === 'error')
      .map((e) => textOf(e.props.children))
      .join('|')
  }
  call(el: El | undefined, prop: string, ...args: unknown[]) {
    if (!el) throw new Error(`missing element for ${prop}`)
    ;(el.props[prop] as (...a: unknown[]) => void)(...args)
    this.render()
  }
  click(label: string, index = 0) {
    this.call(this.buttons(label)[index], 'onClick')
  }
  type(htmlId: string, value: string) {
    this.call(this.input(htmlId), 'onChange', value)
  }
  key(htmlId: string, key: string) {
    const ev = {
      key,
      nativeEvent: { isComposing: false },
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    }
    this.call(this.input(htmlId), 'onKeyDown', ev)
    return ev
  }
}

const rows = (): ColumnProps[] => [
  { key: 'A', value: '1' },
  { key: 'B', value: '2' }
]
const header = { key: 'Variable', value: 'Value' }

function envProps(onChange: jest.Mock, r = rows()): Props {
  return {
    label: 'Env',
    htmlId: 'env',
    header,
    rows: r,
    connector: '=',
    onChange,
    validation: (key: string) => [key.includes(' ') ? 'no spaces' : '', '']
  }
}

const EDIT_KEY = 'env-edit-key'
const EDIT_VALUE = 'env-edit-value'

describe("env-var shape (connector '=', validation)", () => {
  it('Edit turns the row into prefilled inputs and leaves the footer empty', () => {
    const view = new View(envProps(jest.fn()))
    expect(view.input(EDIT_KEY)).toBeUndefined()
    view.click('Edit', 1)
    expect(view.inputValue(EDIT_KEY)).toBe('B')
    expect(view.inputValue(EDIT_VALUE)).toBe('2')
    expect(view.inputValue('Variable-key')).toBe('')
    expect(view.inputValue('Value-key')).toBe('')
  })

  it('Enter commits the edit through one onChange call at the row position', () => {
    const onChange = jest.fn()
    const view = new View(envProps(onChange))
    view.click('Edit', 1)
    view.type(EDIT_VALUE, '3')
    const ev = view.key(EDIT_VALUE, 'Enter')
    expect(ev.preventDefault).toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([
      { key: 'A', value: '1' },
      { key: 'B', value: '3' }
    ])
    expect(view.input(EDIT_KEY)).toBeUndefined()
  })

  it('the Save button commits the edit through one onChange call', () => {
    const onChange = jest.fn()
    const view = new View(envProps(onChange))
    view.click('Edit', 1)
    view.type(EDIT_VALUE, '3')
    view.click('Save')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([
      { key: 'A', value: '1' },
      { key: 'B', value: '3' }
    ])
    expect(view.input(EDIT_VALUE)).toBeUndefined()
  })

  it('Escape discards the edit, stops propagation and shows the original row', () => {
    const onChange = jest.fn()
    const view = new View(envProps(onChange))
    view.click('Edit', 1)
    view.type(EDIT_VALUE, '3')
    const ev = view.key(EDIT_KEY, 'Escape')
    expect(ev.preventDefault).toHaveBeenCalled()
    expect(ev.stopPropagation).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(view.input(EDIT_KEY)).toBeUndefined()
    expect(textOf(view.tree)).toContain('2')
    expect(textOf(view.tree)).not.toContain('3')
  })

  it('the Cancel button discards the edit', () => {
    const onChange = jest.fn()
    const view = new View(envProps(onChange))
    view.click('Edit', 0)
    view.type(EDIT_VALUE, '9')
    view.click('Cancel')
    expect(onChange).not.toHaveBeenCalled()
    expect(view.input(EDIT_VALUE)).toBeUndefined()
  })

  it('a non-Enter key does not save', () => {
    const onChange = jest.fn()
    const view = new View(envProps(onChange))
    view.click('Edit', 0)
    view.key(EDIT_KEY, 'a')
    expect(onChange).not.toHaveBeenCalled()
    expect(view.input(EDIT_KEY)).toBeDefined()
  })

  it('a key failing validation is not saved and the error shows on the row', () => {
    const onChange = jest.fn()
    const view = new View(envProps(onChange))
    view.click('Edit', 0)
    view.type(EDIT_KEY, 'MY VAR')
    view.key(EDIT_KEY, 'Enter')
    expect(onChange).not.toHaveBeenCalled()
    expect(view.input(EDIT_KEY)).toBeDefined()
    expect(view.errorRowText()).toContain('no spaces')
  })

  it('an empty value is not saved under the default fullFills', () => {
    const onChange = jest.fn()
    const view = new View(envProps(onChange))
    view.click('Edit', 0)
    view.type(EDIT_VALUE, '')
    view.key(EDIT_VALUE, 'Enter')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renaming onto an existing key leaves exactly one entry for it', () => {
    const onChange = jest.fn()
    const view = new View(envProps(onChange))
    view.click('Edit', 1)
    view.type(EDIT_KEY, 'A')
    view.key(EDIT_KEY, 'Enter')
    expect(onChange).toHaveBeenCalledTimes(1)
    const saved = (onChange.mock.calls as unknown[][])[0]?.[0] as ColumnProps[]
    expect(saved.filter((r) => r.key === 'A')).toEqual([
      { key: 'A', value: '2' }
    ])
  })

  it("typing 'FOO=bar' in the edit key with an empty value splits on the connector", () => {
    const view = new View(envProps(jest.fn()))
    view.click('Edit', 0)
    view.type(EDIT_VALUE, '')
    view.type(EDIT_KEY, 'FOO=bar')
    expect(view.inputValue(EDIT_KEY)).toBe('FOO')
    expect(view.inputValue(EDIT_VALUE)).toBe('bar')
  })

  it('the footer + button appends a new row', () => {
    const onChange = jest.fn()
    const view = new View(envProps(onChange))
    view.type('Variable-key', 'C')
    view.type('Value-key', '3')
    const plus = collectElements(view.tree).find(
      (e) => e.type === SvgButton && e.props.className === 'is-primary'
    )
    view.call(plus, 'onClick')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([
      { key: 'A', value: '1' },
      { key: 'B', value: '2' },
      { key: 'C', value: '3' }
    ])
  })
})

describe('wrapper shape (fullFills value false)', () => {
  it('an empty value saves when fullFills.value is false', () => {
    const onChange = jest.fn()
    const view = new View({
      label: 'Wrappers',
      htmlId: 'env',
      header,
      rows: [{ key: 'gamemoderun', value: '--x' }],
      fullFills: { key: true, value: false },
      onChange
    })
    view.click('Edit', 0)
    view.type(EDIT_VALUE, '')
    view.key(EDIT_VALUE, 'Enter')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([{ key: 'gamemoderun', value: '' }])
  })
})
