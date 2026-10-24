/**
 * quick/261024-gvu: the bottled-Steam waiting panel. cause=none past the grace
 * window reads as "Steam is still starting the game" (not a failure headline),
 * and both variants carry a Stop waiting button that ends the wait via
 * window.api.kill(appName, 'steam').
 *
 * Same no-jsdom pattern as MainButton.steamWaitingRestart.test.tsx: react's
 * useContext and react-i18next are mocked so GameStatus can be invoked as a
 * plain function and its returned element tree searched.
 */
import type { ReactElement } from 'react'
import { GameInfo } from 'common/types'

let mockEntry: { appName: string; detectedCause: string | null } | undefined

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => ({ runner: 'steam', is: {}, statusContext: undefined })
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
  useBottleLaunchWaiting: () => mockEntry
}))

jest.mock('react-router-dom', () => ({ Link: 'a' }))
jest.mock('@mui/material', () => ({ LinearProgress: 'progress' }))
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

function findButton(node: unknown): ReactElement | null {
  if (node === null || node === undefined || typeof node !== 'object')
    return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findButton(child)
      if (hit) return hit
    }
    return null
  }
  const el = node as ReactElement<{ children?: unknown }>
  if (el.type === 'button') return el
  return findButton(el.props?.children)
}

const gameInfo = { app_name: '200510', runner: 'steam' } as unknown as GameInfo
const progress = {} as never

const render = () =>
  (GameStatus as unknown as (p: Record<string, unknown>) => ReactElement)({
    gameInfo,
    progress,
    handleUpdate: jest.fn(),
    hasUpdate: false
  })

describe('GameStatus bottled waiting panel (261024-gvu)', () => {
  let kill: jest.Mock

  beforeEach(() => {
    kill = jest.fn().mockResolvedValue(undefined)
    ;(globalThis as unknown as { window: unknown }).window = { api: { kill } }
  })

  afterEach(() => {
    mockEntry = undefined
  })

  test('cause=none shows the still-starting copy, not the failure headline', () => {
    mockEntry = { appName: '200510', detectedCause: null }
    const text = collectText(render())
    expect(text).toContain('Steam is still starting the game')
    expect(text).toContain('several minutes')
    expect(text).toContain('If it still does not start, check:')
    expect(text).not.toContain('Waiting for Steam')
    expect(text).not.toContain('Likely causes:')
  })

  test('a detected cause keeps the original copy', () => {
    mockEntry = { appName: '200510', detectedCause: 'login' }
    const text = collectText(render())
    expect(text).toContain('Waiting for Steam')
    expect(text).toContain('Most likely:')
    expect(text).toContain('Likely causes:')
    expect(text).not.toContain('Steam is still starting the game')
  })

  test.each([null, 'self-update'])(
    'detectedCause=%s renders Stop waiting, which kills via window.api.kill',
    (cause) => {
      mockEntry = { appName: '200510', detectedCause: cause }
      const button = findButton(render())
      expect(button).not.toBeNull()
      expect(collectText(button)).toContain('Stop waiting')
      ;(button?.props as { onClick: () => void }).onClick()
      expect(kill).toHaveBeenCalledWith('200510', 'steam')
    }
  )

  test('no waitingEntry renders nothing from the waiting panel', () => {
    mockEntry = undefined
    const tree = render()
    expect(findButton(tree)).toBeNull()
    expect(collectText(tree)).not.toContain('Stop waiting')
  })
})
