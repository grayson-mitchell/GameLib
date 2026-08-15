/**
 * Element-graph tests for the D-21 split button landed on `MainButton`
 * (34.13-08 Task 2).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) — `MainButton` is called
 * directly as a plain function and its returned React-element object graph
 * is walked without ever needing a DOM/render tree (the documented
 * `HumbleOriginInfo.test.tsx` idiom). `Dropdown/index.tsx` imports
 * `./index.scss`, which would kill this suite before the first assertion
 * under `testEnvironment: 'node'` — mocked below so its module is never
 * actually loaded.
 *
 * VACUITY BOUNDARY: these specs prove element-graph STRUCTURE and ORDER —
 * document order IS the entire gamepad-reachability mechanism on both
 * runtimes (Electron simulates real keypresses; Tauri's
 * `tauriGamepadInput.ts` walks `FOCUSABLE_SELECTOR` via
 * `document.querySelectorAll`, which is document order). They do NOT prove
 * the caret is visible, that it animates, or that a gamepad actually reaches
 * it — that is 34.13-13's manual gate.
 */
import type { ReactElement } from 'react'
import { isValidElement } from 'react'

import { GameInfo } from 'common/types'
import type { GameContextType } from 'frontend/types'

const DEFAULT_IS: GameContextType['is'] = {
  installing: false,
  importing: false,
  installingWinetricksPackages: false,
  installingRedist: false,
  launching: false,
  linux: false,
  linuxNative: false,
  mac: false,
  macNative: false,
  moving: false,
  native: false,
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

let mockGameContext: GameContextType = {
  appName: '570',
  runner: 'steam',
  gameInfo: null,
  gameExtraInfo: null,
  gameSettings: null,
  gameInstallInfo: null,
  is: { ...DEFAULT_IS },
  statusContext: undefined,
  status: undefined,
  wikiInfo: null
}

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => mockGameContext
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key
  })
}))

jest.mock('frontend/hooks/useSetting', () => ({
  __esModule: true,
  default: () => [false, jest.fn()]
}))

// Dropdown/index.tsx does `import './index.scss'`, which is not parseable
// under this node-env project — mocked so the module is never loaded. We
// identify caret nodes by reference equality against this same mocked
// default export, never by invoking it (nothing here renders).
jest.mock('frontend/components/UI/Dropdown', () => ({
  __esModule: true,
  default: jest.fn()
}))

jest.mock('frontend/state/InstallGameModal')

import MainButton from '../MainButton'
import Dropdown from 'frontend/components/UI/Dropdown'
import {
  openInstallGameModal,
  openSteamInstallOptions
} from 'frontend/state/InstallGameModal'

function makeGameInfo(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    runner: 'steam',
    app_name: '570',
    art_cover: '',
    art_square: '',
    install: {},
    is_installed: false,
    title: 'Dota 2',
    canRunOffline: true,
    ...overrides
  }
}

function resetContext(overrides: Partial<GameContextType> = {}) {
  mockGameContext = {
    appName: '570',
    runner: 'steam',
    gameInfo: null,
    gameExtraInfo: null,
    gameSettings: null,
    gameInstallInfo: null,
    is: { ...DEFAULT_IS, ...(overrides.is ?? {}) },
    statusContext: undefined,
    status: undefined,
    wikiInfo: null,
    ...overrides
  }
}

/** Walks a React element graph via `props.children`, collecting every node
 * (at any depth) for which `predicate` returns true. Nothing is rendered —
 * child function/class components are never invoked, only the plain
 * `{type, props}` element objects `React.createElement` already built are
 * inspected. */
function findAll(
  node: unknown,
  predicate: (n: ReactElement) => boolean,
  results: ReactElement[] = []
): ReactElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return results
  }
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child, predicate, results))
    return results
  }
  if (!isValidElement(node)) {
    return results
  }
  if (predicate(node)) {
    results.push(node)
  }
  const children = (node.props as { children?: unknown }).children
  if (children !== undefined) {
    findAll(children, predicate, results)
  }
  return results
}

function invoke(gameInfo: GameInfo): ReactElement {
  return MainButton({
    gameInfo,
    handlePlay: jest.fn(),
    handleInstall: jest.fn()
  }) as unknown as ReactElement
}

function findInstallButtonsSpan(tree: ReactElement): ReactElement | undefined {
  return findAll(
    tree,
    (n) => (n.props as { className?: string }).className === 'installButtons'
  )[0]
}

beforeEach(() => {
  resetContext()
})

describe('MainButton — D-21 split button (steam)', () => {
  it('S1: renders the caret for an uninstalled Steam game', () => {
    const tree = invoke(makeGameInfo())
    const carets = findAll(tree, (n) => n.type === Dropdown)
    expect(carets).toHaveLength(1)
  })

  it.each(['gog', 'legendary', 'nile', 'sideload'] as GameInfo['runner'][])(
    'S2: D-28: renders NO caret for %s',
    (runner) => {
      const tree = invoke(makeGameInfo({ runner }))
      const carets = findAll(tree, (n) => n.type === Dropdown)
      expect(carets).toHaveLength(0)
    }
  )

  it('S3: renders NO caret for an installed Steam game', () => {
    const tree = invoke(makeGameInfo({ is_installed: true }))
    const carets = findAll(tree, (n) => n.type === Dropdown)
    expect(carets).toHaveLength(0)
  })

  it('S4: the caret is removed by UNMOUNT, not by disabled, when install is disabled', () => {
    resetContext({ is: { ...mockGameContext.is, settingUpBottle: true } })
    const tree = invoke(makeGameInfo())

    const carets = findAll(tree, (n) => n.type === Dropdown)
    expect(carets).toHaveLength(0)

    // Across every rendered node in the tree, Dropdown never receives a
    // `disabled` prop — Dropdown/index.tsx's Props type has none, so a
    // disabled-looking-but-present caret would still sit in the focus ring.
    resetContext()
    const enabledTree = invoke(makeGameInfo())
    const enabledCaret = findAll(enabledTree, (n) => n.type === Dropdown)[0]
    expect(
      (enabledCaret.props as { disabled?: unknown }).disabled
    ).toBeUndefined()
  })

  it('S5: the caret follows the primary Install button in document order', () => {
    const tree = invoke(makeGameInfo())
    const installButtons = findInstallButtonsSpan(tree)
    expect(installButtons).toBeDefined()

    const children = (installButtons!.props as { children: unknown })
      .children as unknown[]
    const flatChildren = Array.isArray(children) ? children : [children]

    const primaryIndex = flatChildren.findIndex(
      (c) => isValidElement(c) && c.type === 'button'
    )
    const caretIndex = flatChildren.findIndex(
      (c) => isValidElement(c) && c.type === Dropdown
    )

    expect(primaryIndex).toBeGreaterThanOrEqual(0)
    expect(caretIndex).toBeGreaterThan(primaryIndex)
  })

  it('S6: the caret panel holds exactly one activatable item, wired to openSteamInstallOptions', () => {
    const gameInfo = makeGameInfo()
    const tree = invoke(gameInfo)
    const caret = findAll(tree, (n) => n.type === Dropdown)[0]

    const panelChild = (caret.props as { children: unknown }).children
    expect(isValidElement(panelChild)).toBe(true)
    const button = panelChild as ReactElement<{ onClick: () => void }>
    expect(button.type).toBe('button')

    button.props.onClick()
    expect(openSteamInstallOptions).toHaveBeenCalledTimes(1)
    expect(openSteamInstallOptions).toHaveBeenCalledWith(
      gameInfo.app_name,
      gameInfo
    )
  })

  it('S7: the caret is not aria-hidden and carries an accessible name', () => {
    const tree = invoke(makeGameInfo())
    const caret = findAll(tree, (n) => n.type === Dropdown)[0]
    const titleNode = (caret.props as { title: unknown }).title

    const labeledNodes = findAll(titleNode, (n) =>
      Boolean((n.props as { 'aria-label'?: string })['aria-label'])
    )
    expect(labeledNodes).toHaveLength(1)
    expect(
      (labeledNodes[0].props as { 'aria-label': string })['aria-label']
    ).toBe('Install with options…')

    const hiddenInTitle = findAll(
      titleNode,
      (n) =>
        (n.props as { 'aria-hidden'?: unknown })['aria-hidden'] !== undefined
    )
    const hiddenInPanel = findAll(
      (caret.props as { children: unknown }).children,
      (n) =>
        (n.props as { 'aria-hidden'?: unknown })['aria-hidden'] !== undefined
    )
    expect(hiddenInTitle).toHaveLength(0)
    expect(hiddenInPanel).toHaveLength(0)
  })

  it('S8: the primary Install button is untouched for Steam — calls handleInstall, not openInstallGameModal', async () => {
    const gameInfo = makeGameInfo()
    const handleInstall = jest.fn()
    const tree = MainButton({
      gameInfo,
      handlePlay: jest.fn(),
      handleInstall
    }) as unknown as ReactElement

    const primaryButton = findAll(
      tree,
      (n) =>
        n.type === 'button' && !!(n.props as { autoFocus?: unknown }).autoFocus
    )[0] as ReactElement<{ onClick: () => Promise<void> }>

    await primaryButton.props.onClick()

    expect(handleInstall).toHaveBeenCalledWith(false)
    expect(openInstallGameModal).not.toHaveBeenCalled()
  })

  it('S9: the Import button is still absent for Steam and still present for gog', () => {
    const steamTree = invoke(makeGameInfo({ runner: 'steam' }))
    const steamImport = findAll(
      steamTree,
      (n) =>
        n.type === 'button' &&
        (n.props as { className?: string }).className ===
          'button mainBtn outline'
    )
    // The caret is a Dropdown node, not a bare <button>, so this predicate
    // (bare <button> with that class) matches only a surviving Import
    // button, never the caret itself. NOTE (34.13 review WR-14): the caret
    // no longer uses "button mainBtn outline" at all — it dropped `mainBtn`
    // because that class's `min-width: 200px` wrapped the split button onto
    // two rows. So this predicate is now doubly unable to match it.
    expect(steamImport).toHaveLength(0)

    const gogTree = invoke(makeGameInfo({ runner: 'gog' }))
    const gogImport = findAll(
      gogTree,
      (n) =>
        n.type === 'button' &&
        (n.props as { className?: string }).className ===
          'button mainBtn outline'
    )
    expect(gogImport).toHaveLength(1)
  })

  it('S10 (34.13 review C-04): renders NO caret for a DELISTED Steam game', () => {
    // `common/types.ts` documents a delisted game as "confirmed unavailable
    // on Steam ... not activatable", so an install-options door is a door to
    // nothing. The two sibling entries (GameCard, GameSubMenu) already gate
    // on this; the caret was the only one that did not, and neither
    // `notInstallable` (set only inside a `runner !== 'steam'` block) nor
    // `notSupportedGame` (keys on thirdPartyManagedApp) covered it.
    const tree = invoke(makeGameInfo({ is_delisted: true }))
    expect(findAll(tree, (n) => n.type === Dropdown)).toHaveLength(0)
  })

  it('S10b: the DISCRIMINATOR — the same game NOT delisted still renders the caret', () => {
    // Without this pair, S10 would also pass if the caret had been deleted
    // outright or gated on something unrelated.
    const tree = invoke(makeGameInfo({ is_delisted: false }))
    expect(findAll(tree, (n) => n.type === Dropdown)).toHaveLength(1)
  })

  it('S11 (34.13 review C-11): the caret panel item carries the same class vocabulary as its GameSubMenu sibling', () => {
    const tree = invoke(makeGameInfo())
    const caret = findAll(tree, (n) => n.type === Dropdown)[0]
    const button = (caret.props as { children: unknown })
      .children as ReactElement<{ className?: string }>

    const className = button.props.className ?? ''
    // `Dropdown/index.scss`'s only rule reaching a panel child is
    // `.dropdownContainer .dropdown button { margin/padding/font-size }` --
    // spacing, with no surface, border, colour or hover state. These are the
    // classes `GameSubMenu/index.tsx` gives the identical action.
    for (const token of ['link', 'button', 'is-text', 'is-link']) {
      expect(className.split(/\s+/)).toContain(token)
    }
  })
})
