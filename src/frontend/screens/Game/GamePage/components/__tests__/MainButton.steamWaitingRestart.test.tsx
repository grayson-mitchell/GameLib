/**
 * D-UAT-07 regression: the GamePage primary action button must surface the
 * steam-waiting-for-restart handoff as an honest "Restart Steam to finish"
 * hint instead of a stuck, spinning "Steam installing" label.
 *
 * Follows the same no-jsdom pattern as HumbleOriginInfo.test.tsx — 'react'
 * (useContext), 'react-i18next' (useTranslation) and useSetting are mocked at
 * the module level so MainButton can be invoked directly as a plain function
 * and its returned element tree searched for label text.
 */
import type { ReactElement } from 'react'
import { GameInfo } from 'common/types'

let mockIs: Record<string, boolean>
let mockStatusContext: string | undefined

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => ({ is: mockIs, statusContext: mockStatusContext })
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

jest.mock('frontend/hooks/useSetting', () => ({
  __esModule: true,
  default: () => [true, jest.fn()]
}))

jest.mock('frontend/state/InstallGameModal', () => ({
  openInstallGameModal: jest.fn(),
  openSteamInstallOptions: jest.fn()
}))

// 34.13-08: Dropdown/index.tsx imports './index.scss', which is not
// parseable under this node-env project (no jsdom/CSS transform) — mocked
// here purely so the module resolves; this suite never exercises the D-21
// caret itself (see MainButton.steamSplitButton.test.tsx for that).
jest.mock('frontend/components/UI/Dropdown', () => ({
  __esModule: true,
  default: jest.fn()
}))

import MainButton from '../MainButton'

/** Recursively collect all string text nodes from a React element tree. */
function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  const el = node as ReactElement
  if (el.props && 'children' in el.props) {
    return collectText((el.props as { children: unknown }).children)
  }
  return ''
}

function steamGameInfo(): GameInfo {
  return {
    app_name: '1295660',
    runner: 'steam',
    title: "Sid Meier's Civilization VII",
    is_installed: false,
    art_cover: '',
    art_square: '',
    install: {},
    canRunOffline: false,
    cloud_save_enabled: false,
    namespace: '',
    save_folder: '',
    folder_name: ''
  } as unknown as GameInfo
}

const baseIs = {
  installing: false,
  importing: false,
  installingWinetricksPackages: false,
  installingRedist: false,
  launching: false,
  linux: false,
  linuxNative: false,
  mac: false,
  macNative: false,
  native: false,
  moving: false,
  notAvailable: false,
  notInstallable: false,
  notSupportedGame: false,
  playing: false,
  queued: false,
  reparing: false,
  sideloaded: false,
  settingUpBottle: false,
  syncing: false,
  uninstalling: false,
  updating: false,
  win: false,
  notPlayableOffline: false
}

function renderLabel(): string {
  const noop = async () => {}
  const tree = MainButton({
    gameInfo: steamGameInfo(),
    handlePlay: noop,
    handleInstall: noop as never
  })
  return collectText(tree)
}

describe('MainButton — steam-waiting-for-restart (D-UAT-07)', () => {
  it('shows "Restart Steam to finish" when the 1026 handoff is waiting for a Steam restart', () => {
    mockIs = { ...baseIs, installing: true }
    mockStatusContext = 'steam-waiting-for-restart'
    const text = renderLabel()
    expect(text).toContain('Restart Steam to finish')
    expect(text).not.toContain('Steam installing')
  })

  it('shows the generic steam-installing label during an active install (no waiting context)', () => {
    mockIs = { ...baseIs, installing: true }
    mockStatusContext = undefined
    const text = renderLabel()
    expect(text).toContain('Steam installing')
    expect(text).not.toContain('Restart Steam to finish')
  })
})
