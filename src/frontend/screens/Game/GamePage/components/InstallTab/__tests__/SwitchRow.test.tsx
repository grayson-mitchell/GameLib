/**
 * Phase 100 (D-01, D-12, D-18). `SwitchRow` and `RowFailure` are hook-free, so
 * they are called as plain functions and the returned element tree is walked.
 * No jsdom is installed (testEnvironment: 'node') and nothing is mocked.
 */
import type { ReactElement, ReactNode } from 'react'
import { SwitchRow, RowFailure } from '../SwitchRow'

type Props = Record<string, unknown> & { children?: ReactNode }

function isElement(node: unknown): node is ReactElement<Props> {
  return typeof node === 'object' && node !== null && 'props' in node
}

/** Every element in the tree, depth first, expanding function components. */
function walk(node: ReactNode, out: ReactElement<Props>[] = []) {
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, out))
    return out
  }
  if (!isElement(node)) return out
  out.push(node)
  walk(node.props.children, out)
  return out
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isElement(node)) return textOf(node.props.children)
  return ''
}

function typeName(el: ReactElement<Props>): string {
  const t = el.type as unknown
  if (typeof t === 'string') return t
  const fn = t as { displayName?: string; name?: string }
  return fn.displayName ?? fn.name ?? ''
}

function find(
  tree: ReactNode,
  pred: (el: ReactElement<Props>) => boolean
): ReactElement<Props> | undefined {
  return walk(tree).find(pred)
}

const findSwitch = (tree: ReactNode) =>
  find(tree, (el) => el.props.role === 'switch') as ReactElement<Props>

const base = {
  id: 'row',
  label: 'Applications shortcut',
  description: 'Opens the game without opening GameLib first.',
  onToggle: jest.fn()
}

describe('SwitchRow', () => {
  beforeEach(() => {
    base.onToggle.mockClear()
  })

  it.each([true, false])(
    'exposes role=switch with aria-checked mirroring checked=%s',
    (checked) => {
      const sw = findSwitch(SwitchRow({ ...base, checked }))
      expect(sw.props['aria-checked']).toBe(checked)
    }
  )

  it('keeps the label text identical whatever the state (D-01)', () => {
    const labelOf = (checked: boolean) => {
      const label = find(
        SwitchRow({ ...base, checked }),
        (el) => el.props.className === 'switchRow__label'
      )
      return textOf(label)
    }
    expect(labelOf(true)).toBe('Applications shortcut')
    expect(labelOf(false)).toBe(labelOf(true))
  })

  it('busy: marks the row, ignores click and Space, shows the aside, renders no spinner', () => {
    const tree = SwitchRow({
      ...base,
      checked: false,
      busy: true,
      busyLabel: 'Adding…'
    })
    const sw = findSwitch(tree)
    expect(String(sw.props.className)).toContain('is-busy')
    expect(sw.props['aria-busy']).toBe(true)
    expect(sw.props['aria-disabled']).toBe(true)
    ;(sw.props.onClick as () => void)()
    const preventDefault = jest.fn()
    ;(sw.props.onKeyDown as (e: unknown) => void)({
      key: ' ',
      preventDefault
    })
    expect(base.onToggle).not.toHaveBeenCalled()

    const aside = find(tree, (el) => el.props.className === 'switchRow__aside')
    expect(textOf(aside)).toBe('Adding…')

    const spinner = walk(tree).find((el) =>
      /Progress|Spinner/i.test(typeName(el))
    )
    expect(spinner).toBeUndefined()
  })

  it('idle: no aside renders', () => {
    const tree = SwitchRow({ ...base, checked: false, busyLabel: 'Adding…' })
    expect(
      find(tree, (el) => el.props.className === 'switchRow__aside')
    ).toBeUndefined()
  })

  it('enabled: Space and Enter each call onToggle once with preventDefault', () => {
    const sw = findSwitch(SwitchRow({ ...base, checked: false }))
    const onKeyDown = sw.props.onKeyDown as (e: unknown) => void

    const spaceDefault = jest.fn()
    onKeyDown({ key: ' ', preventDefault: spaceDefault })
    expect(base.onToggle).toHaveBeenCalledTimes(1)
    expect(spaceDefault).toHaveBeenCalledTimes(1)

    const enterDefault = jest.fn()
    onKeyDown({ key: 'Enter', preventDefault: enterDefault })
    expect(base.onToggle).toHaveBeenCalledTimes(2)
    expect(enterDefault).toHaveBeenCalledTimes(1)

    const otherDefault = jest.fn()
    onKeyDown({ key: 'a', preventDefault: otherDefault })
    expect(base.onToggle).toHaveBeenCalledTimes(2)
    expect(otherDefault).not.toHaveBeenCalled()
    ;(sw.props.onClick as () => void)()
    expect(base.onToggle).toHaveBeenCalledTimes(3)
  })

  it('disabled: onToggle is not called and the title is the reason', () => {
    const sw = findSwitch(
      SwitchRow({
        ...base,
        checked: true,
        disabled: true,
        disabledReason: 'Moving the game'
      })
    )
    ;(sw.props.onClick as () => void)()
    ;(sw.props.onKeyDown as (e: unknown) => void)({
      key: 'Enter',
      preventDefault: jest.fn()
    })
    expect(base.onToggle).not.toHaveBeenCalled()
    expect(sw.props.title).toBe('Moving the game')
    expect(sw.props['aria-disabled']).toBe(true)
  })

  it('describes the row by its description element', () => {
    const tree = SwitchRow({ ...base, checked: false })
    const sw = findSwitch(tree)
    expect(sw.props['aria-describedby']).toBe('row-desc')
    expect(sw.props['aria-labelledby']).toBe('row-label')
  })

  it('failure: renders a RowFailure whose retry button calls onRetry', () => {
    const onRetry = jest.fn()
    const tree = SwitchRow({
      ...base,
      checked: false,
      failure: {
        message: "Couldn't update the shortcuts.",
        retryLabel: 'Retry',
        onRetry
      }
    })
    const failure = find(tree, (el) => el.type === RowFailure)
    expect(failure).toBeDefined()

    const rendered = RowFailure(failure!.props as never)
    expect(textOf(rendered)).toContain("Couldn't update the shortcuts.")
    const retry = find(rendered, (el) => el.type === 'button')
    expect(textOf(retry)).toBe('Retry')
    expect(retry!.props.type).toBe('button')
    ;(retry!.props.onClick as () => void)()
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(rendered.props.role).toBe('alert')
  })

  it('no failure element without a failure', () => {
    const tree = SwitchRow({ ...base, checked: false })
    expect(find(tree, (el) => el.type === RowFailure)).toBeUndefined()
  })

  it('uses no is-text class anywhere', () => {
    const tree = SwitchRow({
      ...base,
      checked: true,
      busy: true,
      busyLabel: 'x',
      failure: { message: 'm', retryLabel: 'r', onRetry: jest.fn() }
    })
    const rendered = RowFailure({
      message: 'm',
      retryLabel: 'r',
      onRetry: jest.fn()
    })
    const classes = [...walk(tree), ...walk(rendered)].map((el) =>
      String(el.props.className ?? '')
    )
    expect(classes.some((c) => c.includes('is-text'))).toBe(false)
  })
})
