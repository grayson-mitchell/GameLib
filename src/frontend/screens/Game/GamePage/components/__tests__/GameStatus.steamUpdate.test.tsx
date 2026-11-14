/**
 * quick 261114-nxb: the Steam status line no longer carries the hidden
 * "(Click to Update)" target (SteamUpdateButton replaces it); other runners
 * keep it.
 */
import type { ReactElement } from 'react'
import { GameInfo } from 'common/types'

let mockContext: {
  runner: string
  is: Record<string, boolean>
  statusContext?: string
} = { runner: 'steam', is: {} }

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => mockContext
}))

jest.mock('react-i18next', () => {
  const { faithfulReactI18next } = jest.requireActual<
    typeof import('./faithfulTranslate')
  >('./faithfulTranslate')
  return faithfulReactI18next()
})

jest.mock('frontend/state/BottleLaunchWaiting', () => ({
  ...jest.requireActual<typeof import('frontend/state/BottleLaunchWaiting')>(
    'frontend/state/BottleLaunchWaiting'
  ),
  useBottleLaunchWaiting: () => undefined
}))

jest.mock('react-router-dom', () => ({ Link: 'a' }))
jest.mock('@mui/material', () => ({
  LinearProgress: 'progress',
  CircularProgress: 'spinner'
}))
jest.mock('frontend/helpers', () => ({ getProgress: () => 0 }))
jest.mock('../../../GameContext', () => ({ __esModule: true, default: {} }))

import GameStatus from '../GameStatus'

function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean')
    return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  const el = node as ReactElement
  if (el.props && 'children' in el.props) {
    return collectText((el.props as { children: unknown }).children)
  }
  return ''
}

function hasOnClick(node: unknown): boolean {
  if (node === null || node === undefined || typeof node !== 'object')
    return false
  if (Array.isArray(node)) return node.some(hasOnClick)
  const el = node as ReactElement
  const props = (el.props ?? {}) as { onClick?: unknown; children?: unknown }
  return !!props.onClick || hasOnClick(props.children)
}

function findOnClick(node: unknown): (() => unknown) | undefined {
  if (node === null || node === undefined || typeof node !== 'object')
    return undefined
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findOnClick(n)
      if (f) return f
    }
    return undefined
  }
  const props = ((node as ReactElement).props ?? {}) as {
    onClick?: () => unknown
    children?: unknown
  }
  return props.onClick ?? findOnClick(props.children)
}

function render(runner: string, handleUpdate = () => undefined): unknown {
  mockContext = { runner, is: {} }
  return GameStatus({
    gameInfo: {
      app_name: '1',
      runner,
      is_installed: true
    } as unknown as GameInfo,
    progress: { bytes: '', eta: '', percent: 0 },
    handleUpdate,
    hasUpdate: true
  })
}

describe('GameStatus update line (quick 261114-nxb)', () => {
  it('steam: new-version text, no click-to-update suffix or click target', () => {
    const tree = render('steam')
    const text = collectText(tree)
    expect(text).toContain('New Version Available!')
    expect(text).not.toContain('Click to Update')
    expect(hasOnClick(tree)).toBe(false)
  })

  it('legendary: keeps the clickable "Click to Update" text', () => {
    const handleUpdate = jest.fn()
    const tree = render('legendary', handleUpdate)
    expect(collectText(tree)).toContain('Click to Update')
    expect(hasOnClick(tree)).toBe(true)
    void findOnClick(tree)?.()
    expect(handleUpdate).toHaveBeenCalledTimes(1)
  })
})
