import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { GameInfo } from 'common/types'

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

const GAME = {
  app_name: '730',
  title: 'CS:GO',
  runner: 'steam'
} as GameInfo

const render = (onCancel = jest.fn(), gameInfo?: GameInfo) =>
  SteamManagedItemView({
    appName: '730',
    title: 'CS:GO',
    percent: 40,
    bytes: '1 GB',
    t,
    onCancel,
    gameInfo
  }) as El

const buttons = (el: El) => findAll(el, (e) => e.type === 'button')
const titles = (el: El) =>
  findAll(el, (e) => e.props.className === 'steamManagedItem__title')

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

  test('the title link carries the GameInfo in router state', () => {
    const title = at(titles(render(jest.fn(), GAME)), 0)
    expect(titles(render(jest.fn(), GAME))).toHaveLength(1)
    expect(title.type).toBe(Link)
    expect(title.props.to).toBe('/gamepage/steam/730')
    expect(title.props.state).toEqual({ gameInfo: GAME })
    expect((title.props.state as { gameInfo: GameInfo }).gameInfo).toBe(GAME)
    expect(title.props.children).toBe('CS:GO')
  })

  test('without a GameInfo the title is plain text, not a link', () => {
    const tree = render()
    expect(findAll(tree, (e) => e.type === Link)).toHaveLength(0)
    const found = titles(tree)
    expect(found).toHaveLength(1)
    const title = at(found, 0)
    expect(title.type).toBe('span')
    expect(title.props.children).toBe('CS:GO')
  })
})
