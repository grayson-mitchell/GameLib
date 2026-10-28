/**
 * quick 261029-exu: a bridge install flips is_installed when its manifest lands
 * but keeps installing (shared redists, DRM prefetch) under
 * installing/steam-bridge-finishing until installBridgeGame's own 'done'. The
 * game page must not offer Play in that window (live: Grim Dawn showed Play,
 * then switched to "Installing Redistributables").
 *
 * Same no-jsdom pattern as MainButton.steamWaitingRestart.test.tsx.
 */
import type { ReactElement } from 'react'
import { GameInfo } from 'common/types'

let mockIs: Record<string, boolean>
let mockStatusContext: string | undefined

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => ({ is: mockIs, statusContext: mockStatusContext })
}))

// 34.13 review C-10: this mock USED to be
// `t: (_key, defaultValue) => defaultValue`, so every assertion below
// measured the inline DEFAULT ARGUMENT rather than the shipped label. That
// is the repo's ledgered "editing a `t()` DEFAULT is a silent no-op when the
// key exists" trap, seen from the test side: `status.steamInstalling`'s
// catalog value is "Installing…" while the source default reads
// "Steam installing", so these suites asserted a literal that appears
// NOWHERE in the running UI and would have stayed green through any change
// to the real catalog value.
//
// This mock now reproduces i18next's ACTUAL precedence -- catalog value if
// the key resolves, inline default only if it does not -- so the assertions
// measure what the app renders. `require` (not a module-scope import)
// because jest hoists `jest.mock` factories above imports.
jest.mock('react-i18next', () => {
  // 34.13 review C-21: the shared faithful mock, which is namespace-AWARE.
  // The previous inline copy resolved `gamepage.json` only, so
  // `t('gamelib:steam.install.withOptionsLabel', ...)` -- the one key in this
  // component that crosses namespaces -- silently fell through to its inline
  // default, falsifying the mock's own claim to reproduce i18next's real
  // precedence. `jest.requireActual` because jest hoists this factory above
  // every import.
  const { faithfulReactI18next } = jest.requireActual<
    typeof import('./faithfulTranslate')
  >('./faithfulTranslate')
  return faithfulReactI18next()
})

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

function steamGameInfo(): GameInfo {
  return {
    app_name: '1295660',
    runner: 'steam',
    title: "Sid Meier's Civilization VII",
    is_installed: true,
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

/** True when some element in the tree carries `disabled: true`. */
function hasDisabled(node: unknown): boolean {
  if (node === null || node === undefined || typeof node !== 'object')
    return false
  if (Array.isArray(node)) return node.some(hasDisabled)
  const props = (node as ReactElement).props as
    | { disabled?: boolean; children?: unknown }
    | undefined
  if (!props) return false
  if (props.disabled === true) return true
  return hasDisabled(props.children)
}

function render(): ReactElement {
  const noop = async () => {}
  return MainButton({
    gameInfo: steamGameInfo(),
    handlePlay: noop,
    handleInstall: noop as never
  }) as ReactElement
}

describe('MainButton — bridge install tail (quick 261029-exu)', () => {
  it('shows a disabled "Finishing install…" instead of Play while still installing', () => {
    mockIs = { ...baseIs, installing: true }
    mockStatusContext = 'steam-bridge-finishing'
    const tree = render()
    const text = collectText(tree)
    expect(text).toContain('Finishing install…')
    expect(text).not.toContain('Play Now')
    expect(hasDisabled(tree)).toBe(true)
  })

  it('offers Play once the install is done', () => {
    mockIs = { ...baseIs }
    mockStatusContext = undefined
    const tree = render()
    expect(collectText(tree)).toContain('Play Now')
    expect(hasDisabled(tree)).toBe(false)
  })
})
