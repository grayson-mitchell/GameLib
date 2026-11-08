import type { ReactElement } from 'react'

// The row's Link needs a Router; an inert stand-in is enough for a tree walk.
jest.mock('react-router-dom', () => ({ Link: () => null }))

import { SteamManagedItemView } from '../SteamManagedItemView'
import { at } from '../../../../__tests__/fixtures/indexed'

type El = ReactElement<Record<string, unknown>>
const t = (_k: string, fallback: string) => fallback

const NOTE = 'Managed by Steam. Pause it in Steam.'
const CANCEL_HINT =
  'Stops GameLib waiting for Steam. Anything Steam has already started keeps going in Steam.'

const findAll = (node: unknown, pred: (el: El) => boolean, out: El[] = []) => {
  if (Array.isArray(node)) {
    node.forEach((n) => findAll(n, pred, out))
  } else if (node && typeof node === 'object' && 'props' in node) {
    const el = node as El
    if (pred(el)) out.push(el)
    findAll(el.props.children, pred, out)
  }
  return out
}

const render = (onCancel = jest.fn()) =>
  SteamManagedItemView({
    appName: '730',
    title: 'CS:GO',
    percent: 40,
    bytes: '1 GB',
    t,
    onCancel
  }) as El

const buttons = (el: El) => findAll(el, (e) => e.type === 'button')

describe('SteamManagedItemView', () => {
  test('Cancel is enabled, carries the hint, and calls onCancel once', () => {
    const onCancel = jest.fn()
    const cancel = at(buttons(render(onCancel)), 1)
    expect(cancel.props.disabled).toBeFalsy()
    expect(cancel.props.title).toBe(CANCEL_HINT)
    ;(cancel.props.onClick as () => void)()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  test('Pause stays disabled with the new note as its title', () => {
    const pause = at(buttons(render()), 0)
    expect(pause.props.disabled).toBe(true)
    expect(pause.props.title).toBe(NOTE)
  })

  test('the footer note is the new copy, not the old one', () => {
    const notes = findAll(
      render(),
      (e) => e.props.className === 'steamManagedItem__note'
    )
    expect(notes).toHaveLength(1)
    const note = at(notes, 0)
    expect(note.props.children).toBe(NOTE)
    expect(note.props.children).not.toMatch(/cancel it in Steam/)
  })
})
