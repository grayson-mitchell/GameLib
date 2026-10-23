/**
 * quick 261024-h5y: a bottle-route 1026 handoff turns the GamePage primary
 * button into an enabled "Start Steam to finish" / "Show Steam" action that
 * calls window.api.steamFinishBottledInstall; the native restart hint stays
 * passive and disabled.
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

const handleInstall = jest.fn()
const finishIpc = jest.fn()

function renderTree(): ReactElement {
  const noop = async () => {}
  return MainButton({
    gameInfo: steamGameInfo(),
    handlePlay: noop,
    handleInstall: handleInstall as never
  }) as ReactElement
}

/** Depth-first search for the first element of the given type. */
function findAll(node: unknown, type: string, out: ReactElement[] = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((n) => findAll(n, type, out))
    return out
  }
  const el = node as ReactElement
  if (el.type === type) out.push(el)
  if (el.props && 'children' in el.props) {
    findAll((el.props as { children: unknown }).children, type, out)
  }
  return out
}

function installButton(tree: ReactElement) {
  return findAll(tree, 'button').find((b) =>
    String((b.props as { className?: string }).className ?? '').includes(
      'button'
    )
  ) as ReactElement
}

beforeEach(() => {
  ;(global as unknown as { window: unknown }).window = {
    api: { steamFinishBottledInstall: finishIpc }
  }
})

describe('MainButton -- bottled 1026 handoff (quick 261024-h5y)', () => {
  it('waiting: enabled "Start Steam to finish" that calls the IPC and not handleInstall', () => {
    mockIs = { ...baseIs, installing: true }
    mockStatusContext = 'steam-waiting-for-bottled-steam'
    const tree = renderTree()
    expect(collectText(tree)).toContain('Start Steam to finish')
    const btn = installButton(tree)
    const props = btn.props as { disabled: boolean; onClick: () => unknown }
    expect(props.disabled).toBe(false)
    void props.onClick()
    expect(finishIpc).toHaveBeenCalledWith('1295660')
    expect(handleInstall).not.toHaveBeenCalled()
  })

  it('finishing: enabled "Show Steam" that re-sends the same IPC', () => {
    mockIs = { ...baseIs, installing: true }
    mockStatusContext = 'steam-finishing-in-bottled-steam'
    const tree = renderTree()
    expect(collectText(tree)).toContain('Show Steam')
    const props = installButton(tree).props as {
      disabled: boolean
      onClick: () => unknown
    }
    expect(props.disabled).toBe(false)
    void props.onClick()
    expect(finishIpc).toHaveBeenCalledWith('1295660')
  })

  it('native steam-waiting-for-restart stays a disabled passive hint', () => {
    mockIs = { ...baseIs, installing: true }
    mockStatusContext = 'steam-waiting-for-restart'
    const tree = renderTree()
    expect(collectText(tree)).toContain('Restart Steam to finish')
    const props = installButton(tree).props as { disabled: boolean }
    expect(props.disabled).toBe(true)
  })
})
