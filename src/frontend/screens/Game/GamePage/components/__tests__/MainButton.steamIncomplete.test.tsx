/**
 * D-UAT-09 (21-17): the GamePage primary action button must never render
 * "Play" for an incomplete native Steam install (StateFlags bit 4 unset,
 * install.steamResumePending true) — it must surface a distinct
 * "Resume Install" resume affordance instead, never the generic "Install"
 * download label. A genuinely-installed game (StateFlags=4) and the
 * existing steam-waiting-for-restart handoff must both keep working
 * unchanged.
 *
 * quick-260819-ch5: retargeted from the old "Finish in Steam" copy —
 * GameLib's own native depot downloader (resumeInterruptedSteamInstall,
 * Phase 23) resumes this install itself, so the label no longer sends the
 * user to Steam. Only the words changed; the branch condition and click
 * routing are untouched.
 *
 * Follows the same no-jsdom pattern as MainButton.steamWaitingRestart.test.tsx
 * — 'react' (useContext), 'react-i18next' (useTranslation) and useSetting are
 * mocked at the module level so MainButton can be invoked directly as a
 * plain function and its returned element tree searched for label text.
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

function steamGameInfo(overrides: Partial<GameInfo> = {}): GameInfo {
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
    folder_name: '',
    ...overrides
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

function renderTree(gameInfo: GameInfo): { text: string; tree: ReactElement } {
  const noop = async () => {}
  const tree = MainButton({
    gameInfo,
    handlePlay: noop,
    handleInstall: noop as never
  }) as ReactElement
  return { text: collectText(tree), tree }
}

describe('MainButton — incomplete native steam install (D-UAT-09, 21-17)', () => {
  it('incomplete install (is_installed=false, steamResumePending=true, not installing/queued): renders NO Play button and "Resume Install"', () => {
    mockIs = { ...baseIs }
    mockStatusContext = undefined
    const { text } = renderTree(
      steamGameInfo({
        is_installed: false,
        install: { steamResumePending: true }
      })
    )

    expect(text).toContain('Resume Install')
    expect(text).not.toContain('Play')
    expect(text).not.toMatch(/^Install$/m)
    // quick-260819-ch5: standing regression pin — 'in Steam' is the stronger
    // assertion, since it fails for any resurrection of the "go do it in
    // Steam" framing, not just the exact retired string.
    expect(text).not.toContain('Finish in Steam')
    expect(text).not.toContain('in Steam')
  })

  it('installed (StateFlags=4 equivalent — is_installed=true): still renders Play, no regression', () => {
    mockIs = { ...baseIs }
    mockStatusContext = undefined
    const { text } = renderTree(steamGameInfo({ is_installed: true }))

    expect(text).toContain('Play')
    expect(text).not.toContain('Resume Install')
  })

  it('mid-install, steam-waiting-for-restart: still renders "Restart Steam to finish", unaffected by the new branch', () => {
    mockIs = { ...baseIs, installing: true }
    mockStatusContext = 'steam-waiting-for-restart'
    const { text } = renderTree(
      steamGameInfo({ is_installed: false, install: {} })
    )

    expect(text).toContain('Restart Steam to finish')
    expect(text).not.toContain('Resume Install')
  })

  it('steam-paused: unaffected — still shows the generic steam-installing label, not "Resume Install"', () => {
    mockIs = { ...baseIs, installing: true }
    mockStatusContext = 'steam-paused'
    const { text } = renderTree(
      steamGameInfo({ is_installed: false, install: {} })
    )

    expect(text).toContain('Installing…')
    expect(text).not.toContain('Resume Install')
  })

  it('a bare not-installed steam game (no steamResumePending) never renders "Resume Install" or "Play" (falls through to the generic Install label)', () => {
    mockIs = { ...baseIs }
    mockStatusContext = undefined
    const { text } = renderTree(
      steamGameInfo({ is_installed: false, install: {} })
    )

    expect(text).not.toContain('Resume Install')
    expect(text).not.toContain('Play')
  })
})
