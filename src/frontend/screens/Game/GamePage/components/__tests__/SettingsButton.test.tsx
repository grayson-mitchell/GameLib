/**
 * SettingsButton visibility + click routing. No jsdom is installed, so the
 * component is invoked as a plain function and the returned element inspected.
 */
import type { ReactElement } from 'react'

import { GameInfo, Runner } from 'common/types'

const mockOpen = jest.fn()

jest.mock('frontend/state/uiState', () => ({
  __esModule: true,
  default: { keys: () => ({ openGameSettingsModal: mockOpen }) }
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string): string => fallback ?? key
  })
}))

jest.mock('frontend/components/UI', () => ({
  SvgButton: () => null
}))

import SettingsButton from '../SettingsButton'

function makeGameInfo(overrides: Record<string, unknown> = {}): GameInfo {
  return {
    app_name: 'app1',
    runner: 'legendary',
    title: 'Game',
    is_installed: true,
    install: { platform: 'Windows' },
    ...overrides
  } as unknown as GameInfo
}

describe('SettingsButton', () => {
  beforeEach(() => mockOpen.mockClear())

  it.each<Runner>(['legendary', 'gog', 'nile', 'sideload', 'steam'])(
    'renders for an installed %s game and opens its settings',
    (runner) => {
      const gameInfo = makeGameInfo({ runner })
      const el = SettingsButton({ gameInfo }) as ReactElement
      expect(el).not.toBeNull()
      el.props.onClick()
      expect(mockOpen).toHaveBeenCalledWith(gameInfo)
    }
  )

  it('is hidden when not installed', () => {
    const gameInfo = makeGameInfo({ is_installed: false })
    expect(SettingsButton({ gameInfo })).toBeNull()
  })

  it('is hidden while uninstalling', () => {
    expect(
      SettingsButton({ gameInfo: makeGameInfo(), isUninstalling: true })
    ).toBeNull()
  })

  it('is hidden for Browser games', () => {
    const gameInfo = makeGameInfo({ install: { platform: 'Browser' } })
    expect(SettingsButton({ gameInfo })).toBeNull()
  })

  it('labels the button with the translated settings text', () => {
    const el = SettingsButton({ gameInfo: makeGameInfo() }) as ReactElement
    expect(el.props.title).toBe('Settings')
    expect(el.props['aria-label']).toBe('Settings')
  })
})
