/**
 * quick/261026-e1c: while a first-launch redist install runs, the status line
 * under the Play button shows a spinner beside "Installing Redistributables
 * (<component>)". Other states carry no spinner.
 *
 * Same no-jsdom pattern as GameStatus.bottleWaiting.test.tsx: react's
 * useContext and react-i18next are mocked so GameStatus can be invoked as a
 * plain function and its returned element tree searched.
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

function hasSpinner(node: unknown): boolean {
  if (node === null || node === undefined || typeof node !== 'object')
    return false
  if (Array.isArray(node)) return node.some(hasSpinner)
  const el = node as ReactElement
  if (el.type === 'spinner') return true
  if (el.props && 'children' in el.props) {
    return hasSpinner((el.props as { children: unknown }).children)
  }
  return false
}

const gameInfo = {
  app_name: '1363080',
  runner: 'steam',
  is_installed: true
} as unknown as GameInfo

function render(): ReactElement {
  return GameStatus({
    gameInfo,
    progress: { bytes: '', eta: '', percent: 0 },
    handleUpdate: () => undefined,
    hasUpdate: false
  }) as ReactElement
}

describe('GameStatus redist spinner (quick/261026-e1c)', () => {
  it('shows a spinner beside the component being installed', () => {
    mockContext = {
      runner: 'steam',
      is: { installingRedist: true },
      statusContext: 'vcredist 2022'
    }
    const tree = render()
    expect(hasSpinner(tree)).toBe(true)
    // faithfulTranslate returns the catalog string uninterpolated.
    expect(collectText(tree)).toContain('Installing Redistributables (')
  })

  it('labels DRM-mode launch setup as DRM support, not redists (quick/261029-d7v)', () => {
    mockContext = {
      runner: 'steam',
      is: { preparingDrm: true },
      statusContext: 'Compatibility runner'
    }
    const tree = render()
    expect(hasSpinner(tree)).toBe(true)
    const text = collectText(tree)
    expect(text).toContain('Preparing Steam DRM support (')
    expect(text).not.toContain('Installing Redistributables')
  })

  it('shows no spinner once the redist step is over', () => {
    mockContext = { runner: 'steam', is: {} }
    expect(hasSpinner(render())).toBe(false)
  })
})
