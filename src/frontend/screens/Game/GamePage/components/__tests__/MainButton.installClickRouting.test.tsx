/**
 * Element-graph tests for quick 260907-dbh, closing
 * `.planning/todos/pending/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md`.
 *
 * The install button's LABEL is computed from `is.installing` (`getButtonLabel()`
 * at `MainButton.tsx:222`), but the button's `onClick` guard did not test that
 * flag before deciding between `openInstallGameModal` (fresh install) and
 * `handleInstall` (pause/cancel, for a runner other than steam). Mid-download
 * of a non-steam game, the label read "Pause / Cancel" but the click opened the
 * install modal instead.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) — `MainButton` is called directly as
 * a plain function and its returned React-element object graph is walked.
 *
 * VACUITY BOUNDARY: this suite proves element-graph ROUTING — which handler a
 * click reaches, and whether the button node is `disabled`. It does NOT prove
 * that `handleStopInstallation` actually stops a live download. That half
 * rests on two source cites re-verified and recorded in the SUMMARY:
 * `src/backend/downloadmanager/utils.ts` emitting `folder: path` on the
 * `'installing'` status update, and `src/frontend/helpers/library.ts`'s
 * `install()` routing `isInstalling` to `handleStopInstallation`.
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
import { Download } from '@mui/icons-material'
import { openInstallGameModal } from 'frontend/state/InstallGameModal'

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

function findInstallButtonsSpan(tree: ReactElement): ReactElement | undefined {
  return findAll(
    tree,
    (n) => (n.props as { className?: string }).className === 'installButtons'
  )[0]
}

function installButtonOf(
  tree: ReactElement
): ReactElement<{
  onClick: () => Promise<void>
  disabled?: boolean
}> {
  const span = findInstallButtonsSpan(tree)
  if (!span) {
    throw new Error('installButtons span not found in element graph')
  }
  const button = findAll(span, (n) => n.type === 'button')[0]
  if (!button) {
    throw new Error('install button not found inside installButtons span')
  }
  return button as ReactElement<{
    onClick: () => Promise<void>
    disabled?: boolean
  }>
}

/** Identifies the fresh-install label branch STRUCTURALLY by the icon
 * element type it renders (`<Download />`), never by translated text — the
 * catalog is upstream-owned and its wording is not this suite's business. */
function labelIsFreshInstall(button: ReactElement): boolean {
  return findAll(button, (n) => n.type === Download).length > 0
}

interface ProbeResult {
  flag: keyof GameContextType['is']
  disabled: boolean
  freshInstallLabel: boolean
  opensModal: boolean
  callsHandleInstall: boolean
}

async function probe(
  flag: keyof GameContextType['is']
): Promise<ProbeResult> {
  resetContext({ is: { ...DEFAULT_IS, [flag]: true } })
  // `openInstallGameModal` is a module-level mock shared across every call to
  // `probe()` within a single test (R2/R3 call it once per flag, in a loop).
  // Without clearing here, a call recorded by an earlier flag would leak into
  // every later flag's `opensModal` reading via `.mock.calls.length > 0`.
  ;(openInstallGameModal as jest.Mock).mockClear()
  const gameInfo = makeGameInfo()
  const handleInstall = jest.fn()
  const handlePlay = jest.fn()

  const tree = MainButton({
    gameInfo,
    handlePlay,
    handleInstall
  }) as unknown as ReactElement

  const button = installButtonOf(tree)
  const disabled = button.props.disabled === true
  const freshInstallLabel = labelIsFreshInstall(button)

  await button.props.onClick()

  return {
    flag,
    disabled,
    freshInstallLabel,
    opensModal: (openInstallGameModal as jest.Mock).mock.calls.length > 0,
    callsHandleInstall: handleInstall.mock.calls.length > 0
  }
}

beforeEach(() => {
  resetContext()
  jest.clearAllMocks()
})

describe('MainButton — install click routing (260907-dbh)', () => {
  it('R1: gog, is.installing — button is NOT disabled, label is Pause/cancel, click reaches handleInstall (not the modal)', async () => {
    const result = await probe('installing')

    expect(result.disabled).toBe(false)
    expect(result.freshInstallLabel).toBe(false)
    expect(result.callsHandleInstall).toBe(true)
    expect(result.opensModal).toBe(false)
  })

  it('R2: census — for every `is` flag, if the label is not fresh-install, either the button is disabled OR the click does not open the modal', async () => {
    const flags = Object.keys(DEFAULT_IS) as (keyof GameContextType['is'])[]
    const results: ProbeResult[] = []
    for (const flag of flags) {
      results.push(await probe(flag))
    }

    const violations = results
      .filter((r) => !r.freshInstallLabel)
      .filter((r) => !r.disabled && r.opensModal)
      .map((r) => r.flag)

    expect(violations).toEqual([])
  })

  it('R3: partition pin — exactly {notInstallable, notSupportedGame, queued, installing, settingUpBottle} change the label for a gog game', async () => {
    const flags = Object.keys(DEFAULT_IS) as (keyof GameContextType['is'])[]
    const results: ProbeResult[] = []
    for (const flag of flags) {
      results.push(await probe(flag))
    }

    const labelChangingFlags = results
      .filter((r) => !r.freshInstallLabel)
      .map((r) => r.flag)
      .sort()

    expect(labelChangingFlags).toEqual(
      [
        'installing',
        'notInstallable',
        'notSupportedGame',
        'queued',
        'settingUpBottle'
      ].sort()
    )
  })

  it.each(['updating', 'reparing', 'moving'] as const)(
    'R4: todo-named sibling %s — label IS fresh-install AND button is disabled',
    async (flag) => {
      const result = await probe(flag)
      expect(result.freshInstallLabel).toBe(true)
      expect(result.disabled).toBe(true)
    }
  )

  it('R5a: steam, is.installing — button is disabled', async () => {
    resetContext({ runner: 'steam', is: { ...DEFAULT_IS, installing: true } })
    const gameInfo = makeGameInfo({ runner: 'steam' })
    const tree = MainButton({
      gameInfo,
      handlePlay: jest.fn(),
      handleInstall: jest.fn()
    }) as unknown as ReactElement

    const button = installButtonOf(tree)
    expect(button.props.disabled).toBe(true)
  })

  it('R5b: steam, is.installing false — click routes to handleInstall, never the modal', async () => {
    resetContext({ runner: 'steam', is: { ...DEFAULT_IS, installing: false } })
    const gameInfo = makeGameInfo({ runner: 'steam' })
    const handleInstall = jest.fn()
    const tree = MainButton({
      gameInfo,
      handlePlay: jest.fn(),
      handleInstall
    }) as unknown as ReactElement

    const button = installButtonOf(tree)
    await button.props.onClick()

    expect(handleInstall).toHaveBeenCalledTimes(1)
    expect(openInstallGameModal).not.toHaveBeenCalled()
  })
})
