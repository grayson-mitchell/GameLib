/**
 * Element-graph tests for the footer Install button's "Locate existing
 * installation…" door.
 *
 * History: quick 260916-cdb (closing
 * `.planning/todos/completed/2026-08-29-import-game-is-unlabelled-and-over-promoted-rename-demote-an.md`)
 * KEPT the import feature, renamed its label from "Import Game" to "Locate
 * existing installation…" and DEMOTED its door out of the primary install row
 * into `GameSubMenu` (the ⋮ menu). Phase 100 deletes ⋮, and decision D-20 puts
 * the door in the footer Install ▾ — the demotion moved it out of the primary
 * ROW, D-20 puts it one click behind the Install button instead of two.
 *
 * So this suite now pins two things for gog, sideload and
 * thirdPartyManagedApp (the last two never reach `DownloadDialog`,
 * `InstallModal/index.tsx:629`, `:706-761`, so the ▾ is their ONLY import
 * door):
 *   - no button OUTSIDE the Dropdown routes `action: 'import'` (the main
 *     Install button still opens the install modal, D-20), and
 *   - the Dropdown holds exactly one item, reading "Locate existing
 *     installation…", that routes `openInstallGameModal` with action 'import'.
 * R4 and R5 pin the Steam item (Install with options…, never import) and the
 * installed case (no Dropdown).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) — `MainButton` is called directly
 * as a plain function and its returned React-element object graph is walked,
 * exactly as the sibling `MainButton.installClickRouting.test.tsx` suite does.
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
  preparingDrm: false,
  downloadingEngine: false,
  startingSteam: false,
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
  appName: 'alan-wake',
  runner: 'gog',
  gameInfo: null,
  gameExtraInfo: null,
  gameSettings: null,
  gameInstallInfo: null,
  is: { ...DEFAULT_IS },
  statusContext: undefined,
  status: undefined,
  wikiInfo: null
}

// Quick 261029-s5l: InstallGameModal now imports the stores helper,
// which opens a Tauri-backed store at import. Mocked here as in
// signInInputs.test.ts.
jest.mock('frontend/helpers/stores', () => ({
  legendaryConfigStore: { get_nodefault: jest.fn() },
  gogConfigStore: { get_nodefault: jest.fn() },
  nileConfigStore: { get_nodefault: jest.fn() },
  steamConfigStore: { get_nodefault: jest.fn() }
}))

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => mockGameContext
}))

jest.mock('react-i18next', () => {
  const { faithfulReactI18next } = jest.requireActual<
    typeof import('./faithfulTranslate')
  >('./faithfulTranslate')
  return faithfulReactI18next()
})

jest.mock('frontend/hooks/useSetting', () => ({
  __esModule: true,
  default: () => [false, jest.fn()]
}))

// Dropdown/index.tsx does `import './index.scss'`, unparseable under
// `testEnvironment: 'node'` — mocked so the module is never loaded.
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
import { makeFaithfulT } from './faithfulTranslate'

function makeGameInfo(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    runner: 'gog',
    app_name: 'alan-wake',
    art_cover: '',
    art_square: '',
    install: {},
    is_installed: false,
    title: 'Alan Wake',
    canRunOffline: true,
    ...overrides
  }
}

function resetContext(overrides: Partial<GameContextType> = {}) {
  mockGameContext = {
    appName: 'alan-wake',
    runner: 'gog',
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

/** Every `<button>` node anywhere in the tree, at any depth. */
function allButtons(tree: ReactElement): ReactElement<{
  onClick?: () => Promise<void> | void
}>[] {
  return findAll(tree, (n) => n.type === 'button') as ReactElement<{
    onClick?: () => Promise<void> | void
  }>[]
}

/** Every text leaf anywhere in the tree, flattened. Strings only — icon
 * elements and other non-string children are skipped, matching how a reader
 * of the rendered DOM would see text content. */
function allTextLeaves(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node)
    return out
  }
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => allTextLeaves(child, out))
    return out
  }
  if (isValidElement(node)) {
    const children = (node.props as { children?: unknown }).children
    if (children !== undefined) {
      allTextLeaves(children, out)
    }
  }
  return out
}

// The door label, resolved through the SAME faithful-catalog `t` the
// component itself is mocked with — not retyped from a display copy. If the
// catalog's copy changes, this constant tracks it; a retyped literal would
// silently no-op against a catalog edit (the repo's ledgered
// "anchor retyped from display copy" trap).
const gamelibT = makeFaithfulT('gamelib')
const DOOR_LABEL = gamelibT(
  'gamelib:installFlows.importDoorLabel',
  'Locate existing installation…'
)

type ButtonEl = ReactElement<{ onClick?: () => Promise<void> | void }>

function dropdownsOf(tree: ReactElement): ReactElement[] {
  return findAll(tree, (n) => n.type === Dropdown)
}

/** Buttons in the tree that are NOT inside a Dropdown panel. */
function buttonsOutsideDropdown(tree: ReactElement): ButtonEl[] {
  const inside = new Set<unknown>()
  for (const dropdown of dropdownsOf(tree)) {
    for (const b of allButtons(dropdown)) inside.add(b)
  }
  return allButtons(tree).filter((b) => !inside.has(b))
}

function importCalls() {
  const calls = (openInstallGameModal as jest.Mock).mock.calls as Array<
    [{ action?: string }]
  >
  return calls.filter((args) => args[0]?.action === 'import')
}

function render(gameInfo: GameInfo): ReactElement {
  return MainButton({
    gameInfo,
    handlePlay: jest.fn(),
    handleInstall: jest.fn()
  }) as unknown as ReactElement
}

/** D-20: nothing outside the Dropdown routes import, and the Dropdown's one
 * item is the Locate door. */
async function assertLocateDoorInCaretOnly(gameInfo: GameInfo) {
  const tree = render(gameInfo)

  const outside = buttonsOutsideDropdown(tree)
  expect(outside.length).toBeGreaterThan(0)
  for (const button of outside) {
    ;(openInstallGameModal as jest.Mock).mockClear()
    if (button.props.onClick) {
      await button.props.onClick()
    }
    expect(importCalls()).toEqual([])
  }
  expect(allTextLeaves(outside)).not.toContain(DOOR_LABEL)

  const dropdowns = dropdownsOf(tree)
  expect(dropdowns).toHaveLength(1)
  const panelChild = (dropdowns[0]!.props as { children: unknown }).children
  expect(isValidElement(panelChild)).toBe(true)
  const item = panelChild as ButtonEl
  expect(item.type).toBe('button')
  expect(allTextLeaves(item)).toContain(DOOR_LABEL)
  ;(openInstallGameModal as jest.Mock).mockClear()
  await item.props.onClick?.()
  expect(importCalls()).toHaveLength(1)
  expect(openInstallGameModal).toHaveBeenCalledWith(
    expect.objectContaining({
      appName: gameInfo.app_name,
      runner: gameInfo.runner,
      action: 'import'
    })
  )
}

beforeEach(() => {
  resetContext()
  jest.clearAllMocks()
})

describe('MainButton — Install ▾ Locate door (D-20, was the 260916-cdb demotion)', () => {
  it('R1: gog, uninstalled — the ▾ holds the Locate item; no button outside it routes action:"import"', async () => {
    resetContext({ runner: 'gog', is: { ...DEFAULT_IS } })
    await assertLocateDoorInCaretOnly(
      makeGameInfo({ runner: 'gog', is_installed: false })
    )
  })

  it('R2: sideload, uninstalled — the ▾ is its only import door (sideload never reaches DownloadDialog)', async () => {
    resetContext({ runner: 'sideload', is: { ...DEFAULT_IS } })
    await assertLocateDoorInCaretOnly(
      makeGameInfo({ runner: 'sideload', is_installed: false })
    )
  })

  it('R3: thirdPartyManagedApp, uninstalled — the ▾ keeps the door although Install is not supported', async () => {
    resetContext({
      runner: 'gog',
      is: { ...DEFAULT_IS, notSupportedGame: true }
    })
    await assertLocateDoorInCaretOnly(
      makeGameInfo({
        runner: 'gog',
        is_installed: false,
        thirdPartyManagedApp: 'epic'
      })
    )
  })

  it('R4: steam, uninstalled — the ▾ item opens Install with options, never import', async () => {
    resetContext({ runner: 'steam', is: { ...DEFAULT_IS } })
    const gameInfo = makeGameInfo({
      runner: 'steam',
      app_name: '620',
      is_installed: false
    })
    const tree = render(gameInfo)
    const dropdowns = dropdownsOf(tree)
    expect(dropdowns).toHaveLength(1)
    const item = (dropdowns[0]!.props as { children: unknown })
      .children as ButtonEl
    expect(allTextLeaves(item)).not.toContain(DOOR_LABEL)
    await item.props.onClick?.()
    expect(openSteamInstallOptions).toHaveBeenCalledWith('620', gameInfo)
    expect(importCalls()).toEqual([])
  })

  it('R5: gog, installed — no Dropdown', () => {
    resetContext({ runner: 'gog', is: { ...DEFAULT_IS } })
    const tree = render(makeGameInfo({ runner: 'gog', is_installed: true }))
    expect(dropdownsOf(tree)).toHaveLength(0)
  })

  it('R6: gog, installing — the ▾ is unmounted, not disabled', () => {
    resetContext({ runner: 'gog', is: { ...DEFAULT_IS, installing: true } })
    const tree = render(makeGameInfo({ runner: 'gog', is_installed: false }))
    expect(dropdownsOf(tree)).toHaveLength(0)
  })
})
