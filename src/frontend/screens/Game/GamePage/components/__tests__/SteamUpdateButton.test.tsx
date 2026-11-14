/**
 * quick 261114-nxb: SteamUpdateButton render/hide/disable/click gates.
 * No-jsdom pattern (see GameStatus.redistSpinner.test.tsx): the component is
 * invoked as a plain function with react's useContext mocked.
 */
import type { ReactElement } from 'react'
import { GameInfo } from 'common/types'

let mockContext: { is: Record<string, boolean> } = { is: {} }

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

jest.mock('@mui/icons-material', () => ({ CloudDownload: 'cloud-icon' }))
jest.mock('../../../GameContext', () => ({ __esModule: true, default: {} }))

import SteamUpdateButton from '../SteamUpdateButton'

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

const steam = {
  app_name: '1',
  runner: 'steam',
  is_installed: true
} as unknown as GameInfo

function render(
  is: Record<string, boolean>,
  opts: {
    gameInfo?: GameInfo
    hasUpdate?: boolean
    handleUpdate?: () => void
  } = {}
): ReactElement | null {
  mockContext = { is }
  return SteamUpdateButton({
    gameInfo: opts.gameInfo ?? steam,
    hasUpdate: opts.hasUpdate ?? true,
    handleUpdate: opts.handleUpdate ?? (() => undefined)
  }) as ReactElement | null
}

describe('SteamUpdateButton (quick 261114-nxb)', () => {
  it('renders an enabled secondary Update button that calls handleUpdate once', () => {
    const handleUpdate = jest.fn()
    const el = render({}, { handleUpdate })!
    expect(el.type).toBe('button')
    const props = el.props as {
      className: string
      type: string
      disabled: boolean
      onClick: () => void
    }
    expect(props.type).toBe('button')
    expect(props.className).toContain('button')
    expect(props.className).toContain('is-secondary')
    expect(props.disabled).toBeFalsy()
    expect(collectText(el)).toContain('Update')
    props.onClick()
    expect(handleUpdate).toHaveBeenCalledTimes(1)
  })

  it('renders nothing without an update, off Steam, or when not installed', () => {
    expect(render({}, { hasUpdate: false })).toBeNull()
    expect(
      render(
        {},
        { gameInfo: { ...steam, runner: 'legendary' } as unknown as GameInfo }
      )
    ).toBeNull()
    expect(
      render(
        {},
        { gameInfo: { ...steam, is_installed: false } as unknown as GameInfo }
      )
    ).toBeNull()
  })

  it.each([
    'updating',
    'queued',
    'installing',
    'uninstalling',
    'moving',
    'reparing'
  ])('is hidden while %s', (flag) => {
    expect(render({ [flag]: true })).toBeNull()
  })

  it.each(['launching', 'playing'])('is disabled while %s', (flag) => {
    const el = render({ [flag]: true })!
    expect((el.props as { disabled: boolean }).disabled).toBe(true)
  })
})
