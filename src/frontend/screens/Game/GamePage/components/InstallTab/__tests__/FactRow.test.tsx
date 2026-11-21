/**
 * Phase 100 (D-01, D-10, D-11). `FactRow` and `FactAction` are hook-free, so
 * they are called as plain functions and the returned element tree is walked.
 * No jsdom is installed (testEnvironment: 'node') and nothing is mocked.
 */
import type { MouseEvent, ReactElement, ReactNode } from 'react'
import { FactAction, FactRow } from '../FactRow'

type Props = Record<string, unknown> & { children?: ReactNode }

function isElement(node: unknown): node is ReactElement<Props> {
  return typeof node === 'object' && node !== null && 'props' in node
}

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

const click = (el: ReactElement<Props>) =>
  (el.props.onClick as (event: MouseEvent<HTMLButtonElement>) => void)(
    {} as MouseEvent<HTMLButtonElement>
  )

describe('FactAction', () => {
  const onClick = jest.fn()
  beforeEach(() => onClick.mockClear())

  it('calls onClick once when enabled', () => {
    const el = FactAction({ label: 'Move…', onClick })
    click(el)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(textOf(el)).toBe('Move…')
    expect(el.props['aria-disabled']).toBeUndefined()
  })

  it('busy: shows the busy label, marks aria-busy and ignores clicks (D-10)', () => {
    const el = FactAction({
      label: 'Move…',
      busyLabel: 'Moving…',
      busy: true,
      onClick
    })
    expect(textOf(el)).toBe('Moving…')
    expect(el.props['aria-busy']).toBe(true)
    expect(el.props['aria-disabled']).toBe(true)
    expect(String(el.props.className)).toContain('is-busy')
    click(el)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('busy without a busy label keeps the label', () => {
    const el = FactAction({ label: 'Open', busy: true, onClick })
    expect(textOf(el)).toBe('Open')
  })

  it('disabled: carries the reason as its title and ignores clicks (D-11)', () => {
    const el = FactAction({
      label: 'Verify',
      disabled: true,
      disabledReason: 'Wait for the move to finish',
      onClick
    })
    expect(el.props.title).toBe('Wait for the move to finish')
    expect(el.props['aria-disabled']).toBe(true)
    expect(el.props.disabled).toBeUndefined()
    click(el)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('uses the link class for the link variant', () => {
    const el = FactAction({ label: 'Wrong folder?', variant: 'link', onClick })
    expect(String(el.props.className)).toBe('factLink')
    expect(String(FactAction({ label: 'x', onClick }).props.className)).toBe(
      'factButton'
    )
  })
})

describe('FactRow', () => {
  it('renders the label and the children inside fact__value with the title', () => {
    const tree = FactRow({
      label: 'Location',
      valueTitle: '/games/full/path',
      children: '/games/full/path'
    })
    const all = walk(tree)
    const value = all.find((el) => el.props.className === 'fact__value')
    expect(value?.props.title).toBe('/games/full/path')
    expect(textOf(value?.props.children)).toBe('/games/full/path')
    expect(textOf(all.find((el) => el.props.className === 'fact__label'))).toBe(
      'Location'
    )
  })

  it('renders the actions container only when actions exist', () => {
    const without = walk(FactRow({ label: 'Size', children: '1 GB' }))
    expect(without.some((el) => el.props.className === 'fact__actions')).toBe(
      false
    )
    const withActions = walk(
      FactRow({
        label: 'Size',
        children: '1 GB',
        actions: <button type="button">Modify…</button>
      })
    )
    expect(
      withActions.some((el) => el.props.className === 'fact__actions')
    ).toBe(true)
  })

  it('renders RowFailure only when a failure is set', () => {
    const failure = {
      message: 'Move failed.',
      retryLabel: 'Retry',
      onRetry: jest.fn()
    }
    const names = (tree: ReactNode) =>
      walk(tree).map((el) => (el.type as { name?: string }).name)
    expect(names(FactRow({ label: 'x', children: 'y' }))).not.toContain(
      'RowFailure'
    )
    expect(names(FactRow({ label: 'x', children: 'y', failure }))).toContain(
      'RowFailure'
    )
  })

  it('never emits an is-text class', () => {
    const tree = FactRow({
      label: 'x',
      children: 'y',
      actions: FactAction({ label: 'z', onClick: jest.fn() })
    })
    for (const el of walk(tree)) {
      expect(String(el.props.className ?? '')).not.toContain('is-text')
    }
  })
})
