/**
 * Element-graph tests for quick 260916-cdb, closing
 * `.planning/todos/completed/2026-08-29-import-game-is-unlabelled-and-over-promoted-rename-demote-an.md`.
 *
 * The operator's 2026-09-16 decision was: KEEP the import feature, but DEMOTE
 * its door out of the Game-page primary install row (`MainButton`) into
 * `GameSubMenu`, and rename its label from the unlabelled/misleading
 * "Import Game" wording to "Locate existing installation…". This suite pins
 * the `MainButton` half of that demotion: no button in its element graph may
 * still open the install modal in import mode, for ANY runner — including
 * `sideload` and `thirdPartyManagedApp`, which never reach `DownloadDialog`
 * (`InstallModal/index.tsx:629`, `:706-761`) and therefore depend entirely on
 * `GameSubMenu`'s door (D-02) once this one is gone.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) — `MainButton` is called directly
 * as a plain function and its returned React-element object graph is walked,
 * exactly as the sibling `MainButton.installClickRouting.test.tsx` suite does.
 *
 * VACUITY BOUNDARY: this suite proves the element graph of `MainButton` ONLY.
 * It proves NOTHING about `GameSubMenu`, which cannot be called bare in this
 * repo's jest setup — it imports `./index.css` with no `moduleNameMapper` for
 * it, and it carries six `useState` hooks plus effects that a bare function
 * call cannot satisfy. `GameSubMenu`'s half of the demotion (that it NOW
 * carries the door, reachable for `sideload` and `thirdPartyManagedApp`) rests
 * on a source-shaped census recorded in the plan's Task 1 verify step and in
 * the quick's SUMMARY — that census is weaker than a render test and this
 * suite does not launder that weakness away.
 *
 * Non-vacuity: before this suite was finalized, the deleted MainButton import
 * block was temporarily restored and this suite was re-run to confirm it went
 * RED (a test named for a bug must sit downstream of it, not upstream). That
 * result is recorded in the quick's SUMMARY, not here.
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
import { openInstallGameModal } from 'frontend/state/InstallGameModal'
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

async function assertNoImportDoor(gameInfo: GameInfo) {
  const tree = MainButton({
    gameInfo,
    handlePlay: jest.fn(),
    handleInstall: jest.fn()
  }) as unknown as ReactElement

  const buttons = allButtons(tree)
  expect(buttons.length).toBeGreaterThan(0)

  for (const button of buttons) {
    ;(openInstallGameModal as jest.Mock).mockClear()
    if (button.props.onClick) {
      await button.props.onClick()
    }
    const calls = (openInstallGameModal as jest.Mock).mock.calls as Array<
      [{ action?: string }]
    >
    const importCalls = calls.filter((args) => args[0]?.action === 'import')
    expect(importCalls).toEqual([])
  }

  const allText = allTextLeaves(tree)
  expect(allText).not.toContain(DOOR_LABEL)
}

beforeEach(() => {
  resetContext()
  jest.clearAllMocks()
})

describe('MainButton — import door demotion (260916-cdb)', () => {
  it('R1: gog, uninstalled — no button routes action:"import", door label absent from the graph', async () => {
    resetContext({ runner: 'gog', is: { ...DEFAULT_IS } })
    await assertNoImportDoor(
      makeGameInfo({ runner: 'gog', is_installed: false })
    )
  })

  it('R2: sideload, uninstalled — no button routes action:"import" (sideload never reaches DownloadDialog, D-02)', async () => {
    resetContext({ runner: 'sideload', is: { ...DEFAULT_IS } })
    await assertNoImportDoor(
      makeGameInfo({ runner: 'sideload', is_installed: false })
    )
  })

  it('R3: thirdPartyManagedApp, uninstalled — no button routes action:"import" (also never reaches DownloadDialog, D-02)', async () => {
    resetContext({ runner: 'gog', is: { ...DEFAULT_IS } })
    await assertNoImportDoor(
      makeGameInfo({
        runner: 'gog',
        is_installed: false,
        thirdPartyManagedApp: 'epic'
      })
    )
  })
})
