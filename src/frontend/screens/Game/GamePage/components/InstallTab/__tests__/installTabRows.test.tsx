/**
 * Phase 100 gap closure (CR-01, WR-03). These are behavioural render tests of
 * the Install-tab rows. There is no jsdom, so each row is called as a plain
 * function under a hand-rolled hook harness and its element tree is
 * inspected. Source greps could not see CR-01 (a Version row that vanished
 * when a game had no version). Plans 100-13 (Location row) and 100-14
 * (danger zone) add describe blocks here.
 */
import type { ReactElement, ReactNode } from 'react'
import 'frontend/testUtils/tauriWindow'

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let slots: unknown[] = []
  let cursor = 0
  let contextValue: unknown = undefined
  // useEffect recorder: an effect is queued when its deps changed (the first
  // render counts as changed) and runs on __flushEffects, cleanup first.
  type EffectSlot = { deps?: unknown[]; cleanup?: unknown }
  let pendingEffects: Array<() => void> = []
  const { withStoreHooks } = jest.requireActual<
    typeof import('frontend/testUtils/storeHookReact')
  >('frontend/testUtils/storeHookReact')
  return withStoreHooks(actualReact, {
    useState: (initial: unknown) => {
      const idx = cursor++
      if (idx >= slots.length) slots[idx] = initial
      const setState = (value: unknown) => {
        slots[idx] =
          typeof value === 'function'
            ? (value as (prev: unknown) => unknown)(slots[idx])
            : value
      }
      return [slots[idx], setState]
    },
    useReducer: (
      reducer: (state: unknown, action: unknown) => unknown,
      initialArg: unknown,
      init?: (arg: unknown) => unknown
    ) => {
      const idx = cursor++
      if (idx >= slots.length) slots[idx] = init ? init(initialArg) : initialArg
      const dispatch = (action: unknown) => {
        slots[idx] = reducer(slots[idx], action)
      }
      return [slots[idx], dispatch]
    },
    // Memoised per deps, so a stable callback in an effect's deps stays stable.
    useCallback: (fn: unknown, deps?: unknown[]) => {
      const idx = cursor++
      const prev = slots[idx] as { fn: unknown; deps?: unknown[] } | undefined
      const same =
        prev !== undefined &&
        deps !== undefined &&
        prev.deps !== undefined &&
        deps.every((dep, i) => Object.is(dep, (prev.deps as unknown[])[i]))
      if (!same) slots[idx] = { fn, deps }
      return (slots[idx] as { fn: unknown }).fn
    },
    useContext: () => contextValue,
    useEffect: (fn: () => unknown, deps?: unknown[]) => {
      const idx = cursor++
      const first = idx >= slots.length
      if (first) slots[idx] = {} satisfies EffectSlot
      const slot = slots[idx] as EffectSlot
      const changed =
        first ||
        !deps ||
        !slot.deps ||
        deps.some((dep, i) => !Object.is(dep, (slot.deps as unknown[])[i]))
      slot.deps = deps
      if (changed) {
        pendingEffects.push(() => {
          if (typeof slot.cleanup === 'function') slot.cleanup()
          slot.cleanup = fn()
        })
      }
    },
    __flushEffects: () => {
      const queued = pendingEffects
      pendingEffects = []
      queued.forEach((run) => run())
    },
    __beginRender: () => {
      cursor = 0
    },
    __resetMount: () => {
      slots = []
      pendingEffects = []
      cursor = 0
    },
    __setContext: (value: unknown) => {
      contextValue = value
    }
  } as unknown as Partial<typeof import('react')>)
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string, options?: Record<string, string>) =>
      (defaultValue ?? key).replace(
        /\{\{(\w+)\}\}/g,
        (_match, name: string) => options?.[name] ?? ''
      )
  })
}))

// WhatsNewLink pulls GameChangeLog and sanitize-html, an ES module jest cannot
// parse. The row only places the link, so a string-typed stub is enough.
jest.mock('../WhatsNewLink', () => ({
  __esModule: true,
  default: 'WhatsNewLink'
}))

import * as React from 'react'
import type { GameInfo, Runner } from 'common/types'
import type { GameContextType } from 'frontend/types'
import { resetAllStores } from 'frontend/state/storeKit'
import useLibraryState from 'frontend/state/libraryState'
import useUiState from 'frontend/state/uiState'
import { useInstallLocationActions } from '../../../actions/useInstallLocationActions'
import type { InstallLocationActions } from '../../../actions/useInstallLocationActions'
import { installActionGates } from '../../../actions/installActionGates'
import { FactAction } from '../FactRow'
import VersionRow from '../VersionRow'
import LocationRow from '../LocationRow'
import DangerZone from '../DangerZone'
import UninstallModal from 'frontend/components/UI/UninstallModal'
import { RowFailure, SwitchRow } from '../SwitchRow'
import OptInDlcRows from '../OptInDlcRows'
import type { SteamOptInDlcInfo } from 'common/types/steam'

const harness = React as unknown as {
  __flushEffects: () => void
  __beginRender: () => void
  __resetMount: () => void
  __setContext: (value: unknown) => void
}

type Props = Record<string, unknown> & { children?: ReactNode }

type RetryGate = { retryDisabled?: boolean; retryDisabledReason?: string }

function isElement(node: unknown): node is ReactElement<Props> {
  return typeof node === 'object' && node !== null && 'props' in node
}

function walk(node: ReactNode, out: ReactElement<Props>[] = []) {
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, out))
    return out
  }
  if (!isElement(node)) return out
  out.push(node)
  walk(node.props.children, out)
  return out
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isElement(node)) return textOf(node.props.children)
  return ''
}

const makeIs = (
  overrides: Partial<GameContextType['is']> = {}
): GameContextType['is'] => ({
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
  notPlayableOffline: false,
  ...overrides
})

type InstallOverrides = Partial<NonNullable<GameInfo['install']>>

function makeGame(
  runner: Runner,
  install: InstallOverrides = {},
  extra: Partial<GameInfo> = {}
): GameInfo {
  return {
    app_name: '1234',
    runner,
    title: 'Test Game',
    is_installed: true,
    install: {
      install_path: '/games/test',
      platform: 'Mac',
      ...install
    },
    ...extra
  } as unknown as GameInfo
}

function gatesFor(game: GameInfo, is: GameContextType['is']) {
  return installActionGates({
    is,
    runner: game.runner,
    isInstalled: Boolean(game.is_installed),
    isThirdPartyManaged: Boolean(game.thirdPartyManagedApp),
    hasWinePrefix: false,
    hasChangelog: false,
    cloudSavesAvailable: false
  })
}

interface RenderOptions {
  is?: Partial<GameContextType['is']>
  hasUpdate?: boolean
  availableVersion?: string
}

function renderVersion(game: GameInfo, opts: RenderOptions = {}) {
  const is = makeIs(opts.is)
  harness.__setContext({
    is,
    runner: game.runner,
    gameInstallInfo: opts.availableVersion
      ? { game: { version: opts.availableVersion } }
      : null
  })
  harness.__beginRender()
  return VersionRow({
    gameInfo: game,
    gates: gatesFor(game, is),
    handleUpdate: jest.fn(),
    hasUpdate: Boolean(opts.hasUpdate)
  }) as ReactElement<Props> | null
}

function factActions(tree: ReactElement<Props>) {
  return walk(tree.props.actions as ReactNode).filter(
    (el) => el.type === FactAction
  )
}

const actionLabels = (tree: ReactElement<Props>) =>
  factActions(tree).map((el) => el.props.label)

const findAction = (tree: ReactElement<Props>, label: string) =>
  factActions(tree).find((el) => el.props.label === label)

const mockApi = {
  repair: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
  requestAppSettings: jest.fn(),
  openDialog: jest.fn(),
  moveInstall: jest.fn(),
  changeInstallPath: jest.fn(),
  openFolder: jest.fn(),
  steamRemoveAllCopies: jest.fn(),
  getSteamDeleteRoute: jest.fn(),
  uninstall: jest.fn(),
  getSteamOptInDlc: jest.fn(),
  updateGame: jest.fn()
}

beforeEach(() => {
  harness.__resetMount()
  Object.values(mockApi).forEach((fn) => fn.mockReset())
  mockApi.repair.mockResolvedValue(undefined)
  mockApi.requestAppSettings.mockResolvedValue({ defaultInstallPath: '/games' })
  mockApi.openDialog.mockResolvedValue('/new/place')
  mockApi.moveInstall.mockResolvedValue(undefined)
  mockApi.changeInstallPath.mockResolvedValue(undefined)
  mockApi.steamRemoveAllCopies.mockResolvedValue({ removed: 1, refused: 0 })
  mockApi.getSteamDeleteRoute.mockResolvedValue({
    delegated: false,
    gamelibDelete: true
  })
  mockApi.uninstall.mockResolvedValue(undefined)
  mockApi.updateGame.mockResolvedValue(undefined)
  useLibraryState.setState({ refresh: jest.fn().mockResolvedValue(undefined) })
  useUiState.setState({ showDialogModal: jest.fn() })
  ;(globalThis as unknown as { window: unknown }).window = { api: mockApi }
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  resetAllStores()
  jest.restoreAllMocks()
})

describe('VersionRow', () => {
  it('renders Verify and an Unknown value for an installed Steam game with no version', () => {
    const tree = renderVersion(makeGame('steam'))

    expect(tree).not.toBeNull()
    const row = tree as ReactElement<Props>
    expect(actionLabels(row)).toContain('Verify')
    expect(textOf(row.props.children)).toContain('Unknown')
    expect(textOf(row.props.children)).not.toContain('up to date')
  })

  it('renders Verify and Update for an installed Legendary game with no version', () => {
    const row = renderVersion(makeGame('legendary')) as ReactElement<Props>

    expect(actionLabels(row)).toEqual(
      expect.arrayContaining(['Verify', 'Update'])
    )
  })

  it('reads "<version> · up to date" for a game with a version and no update', () => {
    const row = renderVersion(
      makeGame('legendary', { version: '1.2.3' })
    ) as ReactElement<Props>

    expect(textOf(row.props.children).trim()).toBe('1.2.3 · up to date')
  })

  it('reads Unknown plus the available version when there is no version but an update is pending', () => {
    const row = renderVersion(makeGame('legendary'), {
      hasUpdate: true,
      availableVersion: '1.3'
    }) as ReactElement<Props>

    const text = textOf(row.props.children)
    expect(text).toContain('Unknown')
    expect(text).toContain('· 1.3 available')
    expect(text).not.toContain('up to date')
  })

  it.each([
    ['not installed', makeGame('legendary', {}, { is_installed: false })],
    ['sideloaded', makeGame('sideload')],
    [
      'third-party managed',
      makeGame('legendary', {}, { thirdPartyManagedApp: 'Origin' })
    ],
    ['a browser game', makeGame('legendary', { platform: 'Browser' })]
  ])('renders no Version row for a game that is %s', (_name, game) => {
    expect(renderVersion(game)).toBeNull()
  })

  it('starts repair with the game app name and runner when Verify is clicked', async () => {
    const game = makeGame('steam')
    const row = renderVersion(game) as ReactElement<Props>
    const verify = findAction(row, 'Verify') as ReactElement<Props>

    await (verify.props.onClick as () => Promise<void>)()

    expect(mockApi.repair).toHaveBeenCalledTimes(1)
    expect(mockApi.repair).toHaveBeenCalledWith('1234', 'steam')
  })

  describe('a failed Verify', () => {
    const failedRow = async (opts: RenderOptions = {}) => {
      mockApi.repair.mockRejectedValue(new Error('repair blew up'))
      const game = makeGame('steam')
      const first = renderVersion(game, opts) as ReactElement<Props>
      const verify = findAction(first, 'Verify') as ReactElement<Props>
      await (verify.props.onClick as () => Promise<void>)()
      return { game, rerender: (o: RenderOptions) => renderVersion(game, o) }
    }

    type Failure = {
      message: string
      retryDisabled?: boolean
      retryDisabledReason?: string
    }
    const failureOf = (tree: ReactElement<Props> | null) =>
      tree?.props.failure as Failure | undefined

    it('shows the fixed inline message with a live Retry and logs the error once', async () => {
      const { rerender } = await failedRow()

      const failure = failureOf(rerender({}))
      expect(failure?.message).toBe('Verify failed. Details are in the log.')
      expect(failure?.retryDisabled).toBe(false)
      expect(mockApi.logError).toHaveBeenCalledTimes(1)
    })

    it('makes Retry inert with the gate reason while a move runs', async () => {
      const { rerender } = await failedRow()

      const failure = failureOf(rerender({ is: { moving: true } }))
      expect(failure?.retryDisabled).toBe(true)
      expect(failure?.retryDisabledReason).toBe('Wait for the move to finish')
    })
  })
})

describe('Location row (CR-02)', () => {
  const MOVE_FAILED = 'Move failed. Details are in the log.'
  const TIMEOUT = 'sidecar invoke timed out: moveInstall'

  // One render pass as InstallTab composes it: context, the hook, the row.
  function renderLocation(
    game: GameInfo,
    isOverrides: RenderOptions['is'] = {}
  ) {
    const is = makeIs(isOverrides)
    harness.__setContext({ is, runner: game.runner })
    harness.__beginRender()
    const actions = useInstallLocationActions(game)
    const tree = LocationRow({
      gameInfo: game,
      gates: gatesFor(game, is),
      actions
    }) as ReactElement<Props> | null
    return { actions, tree }
  }

  const failureOf = (tree: ReactElement<Props> | null) =>
    tree?.props.failure as { message: string } | undefined

  const setStatus = (status: string) =>
    useLibraryState.setState({
      libraryStatus: [{ appName: '1234', status }]
    } as unknown as Parameters<typeof useLibraryState.setState>[0])

  it('hands a timeout over to the game status while the game still reads moving', async () => {
    const game = makeGame('legendary')
    setStatus('moving')
    mockApi.moveInstall.mockRejectedValue(TIMEOUT)
    await renderLocation(game).actions.retryMove()

    expect(renderLocation(game, { moving: true }).actions.moveFailed).toBe(
      false
    )
    expect(mockApi.logInfo).toHaveBeenCalledTimes(1)
    expect(mockApi.logError).not.toHaveBeenCalled()
  })

  it('reports the same timeout as a failure once the game no longer reads moving', async () => {
    const game = makeGame('legendary')
    mockApi.moveInstall.mockRejectedValue(TIMEOUT)
    await renderLocation(game).actions.retryMove()

    expect(renderLocation(game).actions.moveFailed).toBe(true)
  })

  it('reports a real rejection as a failure even while the game reads moving', async () => {
    const game = makeGame('legendary')
    setStatus('moving')
    mockApi.moveInstall.mockRejectedValue(new Error('rsync exited 23'))
    await renderLocation(game).actions.retryMove()

    expect(renderLocation(game).actions.moveFailed).toBe(true)
  })

  it('shows no Move failure while the game is moving, and the message once it is not', () => {
    const game = makeGame('legendary')
    const failedActions = {
      moveFailed: true,
      setFolderFailed: false
    } as unknown as InstallLocationActions
    const render = (moving: boolean) => {
      const is = makeIs({ moving })
      harness.__setContext({ is, runner: game.runner })
      harness.__beginRender()
      return LocationRow({
        gameInfo: game,
        gates: gatesFor(game, is),
        actions: failedActions
      }) as ReactElement<Props>
    }

    expect(failureOf(render(true))).toBeUndefined()
    expect(failureOf(render(false))?.message).toBe(MOVE_FAILED)
  })
  it('makes the Move failure Retry inert with the gate reason while the game plays', () => {
    const game = makeGame('legendary')
    const stub = { moveFailed: true } as unknown as InstallLocationActions
    const render = (playing: boolean) => {
      const is = makeIs({ playing })
      harness.__setContext({ is, runner: game.runner })
      harness.__beginRender()
      return LocationRow({
        gameInfo: game,
        gates: gatesFor(game, is),
        actions: stub
      }) as ReactElement<Props>
    }

    const inert = render(true).props.failure as RetryGate
    expect(inert.retryDisabled).toBe(true)
    expect(inert.retryDisabledReason).toBe('Quit the game first')
    expect((render(false).props.failure as RetryGate).retryDisabled).toBe(false)
  })

  it('carries the setFolder gate on the Set-folder failure Retry', () => {
    const game = makeGame('legendary')
    const stub = {
      moveFailed: false,
      setFolderFailed: true
    } as unknown as InstallLocationActions
    const is = makeIs({ playing: true })
    harness.__setContext({ is, runner: game.runner })
    harness.__beginRender()
    const tree = LocationRow({
      gameInfo: game,
      gates: gatesFor(game, is),
      actions: stub
    }) as ReactElement<Props>
    const gate = gatesFor(game, is).setFolder

    const failure = tree.props.failure as RetryGate
    expect(failure.retryDisabled).toBe(gate.disabled)
    expect(failure.retryDisabled).toBe(true)
  })

  it('shows a Set-folder failure right after a Move failure (WR-04)', async () => {
    const game = makeGame('legendary')
    mockApi.moveInstall.mockRejectedValue(new Error('boom'))
    await renderLocation(game).actions.retryMove()
    expect(renderLocation(game).actions.moveFailed).toBe(true)

    mockApi.changeInstallPath.mockRejectedValue(new Error('nope'))
    await renderLocation(game).actions.retrySetFolder()

    const { actions, tree } = renderLocation(game)
    expect(actions.moveFailed).toBe(false)
    expect(actions.setFolderFailed).toBe(true)
    expect(failureOf(tree)?.message).toBe(
      "Couldn't set the install folder. Details are in the log."
    )
  })

  it('clears a Set-folder failure when a Move starts (WR-04)', async () => {
    const game = makeGame('legendary')
    mockApi.changeInstallPath.mockRejectedValue(new Error('nope'))
    await renderLocation(game).actions.retrySetFolder()
    expect(renderLocation(game).actions.setFolderFailed).toBe(true)

    mockApi.moveInstall.mockRejectedValue(new Error('boom'))
    await renderLocation(game).actions.retryMove()

    const { actions } = renderLocation(game)
    expect(actions.setFolderFailed).toBe(false)
    expect(actions.moveFailed).toBe(true)
  })

  it('clears a Move failure when the install path changes (WR-04)', async () => {
    const game = makeGame('legendary')
    const mount = renderLocation(game)
    harness.__flushEffects() // the mount effect, before any failure exists
    mockApi.moveInstall.mockRejectedValue(new Error('boom'))
    await mount.actions.retryMove()
    expect(renderLocation(game).actions.moveFailed).toBe(true)
    harness.__flushEffects()
    expect(renderLocation(game).actions.moveFailed).toBe(true)

    const moved = makeGame('legendary', { install_path: '/elsewhere/test' })
    expect(renderLocation(moved).actions.moveFailed).toBe(true)
    harness.__flushEffects()

    expect(renderLocation(moved).actions.moveFailed).toBe(false)
  })
  it('keeps Open, without Move or Wrong folder, for an installed third-party-managed game (WR-02)', () => {
    const game = makeGame(
      'legendary',
      { install_path: '/games/ea' },
      { thirdPartyManagedApp: 'EA' }
    )
    const row = renderLocation(game).tree as ReactElement<Props>

    expect(row).not.toBeNull()
    expect(actionLabels(row)).toEqual(['Open'])
  })

  it('renders no Location row for an installed game with no folder at all', () => {
    const game = makeGame(
      'legendary',
      { install_path: '' },
      { folder_name: '' }
    )

    expect(renderLocation(game).tree).toBeNull()
  })
})

describe('Danger zone (WR-05)', () => {
  const REMOVE_ALL = 'Remove all copies…'
  const REMOVE_FAILED = "Couldn't remove every copy. Details are in the log."

  function renderDanger(game: GameInfo, isOverrides: RenderOptions['is'] = {}) {
    const is = makeIs(isOverrides)
    harness.__setContext({ is, runner: game.runner })
    harness.__beginRender()
    return DangerZone({
      gameInfo: game,
      gates: gatesFor(game, is)
    }) as ReactElement<Props>
  }

  const buttonByText = (tree: ReactElement<Props>, text: string) =>
    walk(tree)
      .filter((el) => el.type === 'button')
      .find((el) => textOf(el.props.children) === text)

  const failuresOf = (tree: ReactElement<Props>) =>
    walk(tree).filter((el) => el.type === RowFailure)

  const firstFailure = (tree: ReactElement<Props>) => {
    const failure = failuresOf(tree)[0]
    if (!failure) throw new Error('expected a RowFailure in the danger zone')
    return failure
  }

  const showDialog = () =>
    useUiState.getState().showDialogModal as unknown as jest.Mock

  // Clicks the button, then returns the dialog's Yes handler (not yet run).
  function openRemoveAllConfirm(game: GameInfo) {
    const button = buttonByText(renderDanger(game), REMOVE_ALL)
    ;(button?.props.onClick as () => void)()
    const calls = showDialog().mock.calls as Array<
      [{ buttons: Array<{ onClick?: () => Promise<void> }> }]
    >
    const dialog = calls[calls.length - 1]?.[0]
    return dialog?.buttons[0]?.onClick as () => Promise<void>
  }

  it('shows an inline failure and logs once when the sweep refuses a root', async () => {
    const game = makeGame('steam')
    mockApi.steamRemoveAllCopies.mockResolvedValue({ removed: 1, refused: 1 })

    expect(showDialog()).not.toHaveBeenCalled()
    const yes = openRemoveAllConfirm(game)
    expect(showDialog()).toHaveBeenCalledTimes(1)
    await yes()

    const failures = failuresOf(renderDanger(game))
    expect(failures).toHaveLength(1)
    expect(failures[0]?.props.message).toBe(REMOVE_FAILED)
    expect(mockApi.logError).toHaveBeenCalledTimes(1)
    expect(useLibraryState.getState().refresh).toHaveBeenCalledTimes(1)
  })

  it('shows the same failure for a sweep that answers with an error', async () => {
    const game = makeGame('steam')
    mockApi.steamRemoveAllCopies.mockResolvedValue({
      removed: 0,
      refused: 0,
      error: 'disk gone'
    })
    await openRemoveAllConfirm(game)()

    expect(failuresOf(renderDanger(game))[0]?.props.message).toBe(REMOVE_FAILED)
  })

  it('shows the failure for a rejected sweep, and the awaited Yes-click does not reject', async () => {
    const game = makeGame('steam')
    mockApi.steamRemoveAllCopies.mockRejectedValue(new Error('ipc closed'))

    await expect(openRemoveAllConfirm(game)()).resolves.toBeUndefined()

    expect(failuresOf(renderDanger(game))[0]?.props.message).toBe(REMOVE_FAILED)
    expect(mockApi.logError).toHaveBeenCalledTimes(1)
  })

  it('shows no failure for a clean sweep', async () => {
    const game = makeGame('steam')
    mockApi.steamRemoveAllCopies.mockResolvedValue({ removed: 2, refused: 0 })
    await openRemoveAllConfirm(game)()

    expect(failuresOf(renderDanger(game))).toHaveLength(0)
  })

  it('Retry re-opens the confirmation and never starts a second sweep (D-13)', async () => {
    const game = makeGame('steam')
    mockApi.steamRemoveAllCopies.mockResolvedValue({ removed: 0, refused: 1 })
    await openRemoveAllConfirm(game)()

    const failure = firstFailure(renderDanger(game))
    ;(failure.props.onRetry as () => void)()

    expect(showDialog()).toHaveBeenCalledTimes(2)
    expect(mockApi.steamRemoveAllCopies).toHaveBeenCalledTimes(1)
  })

  it('makes the failure Retry inert with the gate reason while the game plays', async () => {
    const game = makeGame('steam')
    mockApi.steamRemoveAllCopies.mockResolvedValue({ removed: 0, refused: 1 })
    await openRemoveAllConfirm(game)()

    const failure = firstFailure(renderDanger(game, { playing: true }))
    expect(failure.props.retryDisabled).toBe(true)
    expect(failure.props.retryDisabledReason).toBe('Quit the game first')
    expect(firstFailure(renderDanger(game)).props.retryDisabled).toBe(false)
  })

  it('reads "Removing copies…" and aria-busy while the sweep runs', () => {
    const game = makeGame('steam')
    mockApi.steamRemoveAllCopies.mockReturnValue(new Promise(() => undefined))
    const yes = openRemoveAllConfirm(game)
    void yes()

    const tree = renderDanger(game)
    expect(buttonByText(tree, REMOVE_ALL)).toBeUndefined()
    const busy = buttonByText(tree, 'Removing copies…')
    expect(busy?.props['aria-busy']).toBe(true)
  })

  describe('Uninstall', () => {
    const UNINSTALL = 'Uninstall…'
    const UNINSTALL_FAILED = 'Uninstall failed. Details are in the log.'
    const DELEGATED = { delegated: true, gamelibDelete: false }

    // Pre-handled, so a caller that drops the rejection (the defect under test)
    // fails the assertions rather than crashing the jest worker.
    const rejected = (message: string) => {
      const rejection = Promise.reject(new Error(message))
      rejection.catch(() => undefined)
      return rejection
    }

    const flush = async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve()
    }

    const clickUninstall = async (game: GameInfo) => {
      const button = buttonByText(renderDanger(game), UNINSTALL)
      ;(button?.props.onClick as () => void)()
      await flush()
    }

    it('shows an inline failure and logs it when the delegated Steam uninstall rejects', async () => {
      const game = makeGame('steam')
      mockApi.getSteamDeleteRoute.mockResolvedValue(DELEGATED)
      mockApi.uninstall.mockReturnValue(rejected('steam said no'))
      await clickUninstall(game)

      expect(firstFailure(renderDanger(game)).props.message).toBe(
        UNINSTALL_FAILED
      )
      expect(mockApi.logError).toHaveBeenCalledTimes(1)
      expect(
        String((mockApi.logError.mock.calls as unknown[][])[0]?.[0])
      ).toContain('uninstall failed for 1234')
    })

    it('Retry asks the route again, so the confirmation decision is asked again (D-13)', async () => {
      const game = makeGame('steam')
      mockApi.getSteamDeleteRoute.mockResolvedValue(DELEGATED)
      mockApi.uninstall.mockReturnValue(rejected('steam said no'))
      await clickUninstall(game)
      expect(mockApi.getSteamDeleteRoute).toHaveBeenCalledTimes(1)

      const failure = firstFailure(renderDanger(game))
      ;(failure.props.onRetry as () => void)()
      await flush()

      expect(mockApi.getSteamDeleteRoute).toHaveBeenCalledTimes(2)
    })

    it('reports a rejection that comes through the confirm modal in the same row', async () => {
      const game = makeGame('legendary')
      await clickUninstall(game)

      const modal = walk(renderDanger(game)).find(
        (el) => el.type === UninstallModal
      )
      expect(modal).toBeDefined()
      const runUninstall = modal?.props.runUninstall as (
        uninstall: () => Promise<void>
      ) => Promise<void>
      await expect(
        runUninstall(() => rejected('rm failed'))
      ).resolves.toBeUndefined()

      expect(firstFailure(renderDanger(game)).props.message).toBe(
        UNINSTALL_FAILED
      )
      expect(mockApi.logError).toHaveBeenCalledTimes(1)
    })

    it('reads "Uninstalling…" with aria-busy while its own invoke runs', async () => {
      const game = makeGame('steam')
      mockApi.getSteamDeleteRoute.mockResolvedValue(DELEGATED)
      mockApi.uninstall.mockReturnValue(new Promise(() => undefined))
      await clickUninstall(game)

      const tree = renderDanger(game)
      expect(buttonByText(tree, UNINSTALL)).toBeUndefined()
      expect(buttonByText(tree, 'Uninstalling…')?.props['aria-busy']).toBe(true)
    })

    it('reads "Uninstalling…" while the game status says it is uninstalling', () => {
      const game = makeGame('steam')
      const tree = renderDanger(game, { uninstalling: true })

      const busy = buttonByText(tree, 'Uninstalling…')
      expect(busy?.props['aria-disabled']).toBe(true)
      expect(busy?.props.title).toBeUndefined()
    })
  })
})

describe('OptInDlcRows (quick 261122-rgi)', () => {
  const dlc = (appId: string, installed: boolean, owned: boolean | null) => ({
    appId,
    name: `DLC ${appId}`,
    bytes: 1024 ** 3,
    owned,
    installed
  })
  const answer = (
    manage: SteamOptInDlcInfo['manage'],
    entries: SteamOptInDlcInfo['entries']
  ): SteamOptInDlcInfo => ({ manage, entries })

  const settle = () => new Promise((resolve) => setImmediate(resolve))

  function render(game: GameInfo, isOverrides: RenderOptions['is'] = {}) {
    harness.__setContext({ is: makeIs(isOverrides), runner: game.runner })
    harness.__beginRender()
    return OptInDlcRows({ gameInfo: game }) as ReactElement<Props> | null
  }

  // First render queues the read; flush runs it; settle lets it resolve; render shows it.
  async function mount(game: GameInfo, isOverrides: RenderOptions['is'] = {}) {
    render(game, isOverrides)
    harness.__flushEffects()
    await settle()
    return render(game, isOverrides)
  }

  // Renders with the given game status and lets its effects and any re-read run.
  async function step(game: GameInfo, isOverrides: RenderOptions['is'] = {}) {
    render(game, isOverrides)
    harness.__flushEffects()
    await settle()
    return render(game, isOverrides)
  }

  const rowsOf = (tree: ReactElement<Props> | null) =>
    tree ? walk(tree).filter((el) => el.type === SwitchRow) : []
  // A SwitchRow carries its failure as a prop, so read it there (the row is not expanded here).
  const failuresOf = (tree: ReactElement<Props> | null) =>
    rowsOf(tree).flatMap((row) =>
      row.props.failure
        ? [{ props: row.props.failure as Record<string, unknown> }]
        : []
    )
  const lastUpdate = () =>
    mockApi.updateGame.mock.calls.at(-1)?.[0] as {
      steamOptInDlc: string[]
    }

  it('261122-rgi: renders nothing for a non-Steam runner, a not-installed game, a null answer or no shown entries', async () => {
    mockApi.getSteamOptInDlc.mockResolvedValue(
      answer('gamelib', [dlc('1', false, true)])
    )
    expect(await mount(makeGame('gog'))).toBeNull()
    expect(mockApi.getSteamOptInDlc).not.toHaveBeenCalled()

    harness.__resetMount()
    expect(
      await mount(makeGame('steam', {}, { is_installed: false }))
    ).toBeNull()

    harness.__resetMount()
    mockApi.getSteamOptInDlc.mockResolvedValue(null)
    expect(await mount(makeGame('steam'))).toBeNull()

    harness.__resetMount()
    mockApi.getSteamOptInDlc.mockResolvedValue(
      answer('gamelib', [dlc('1', false, false)])
    )
    expect(await mount(makeGame('steam'))).toBeNull()
  })

  it('261122-rgi: a rejected read logs the appName and renders nothing', async () => {
    mockApi.getSteamOptInDlc.mockRejectedValue(new Error('ipc closed'))
    expect(await mount(makeGame('steam'))).toBeNull()
    expect(mockApi.logError).toHaveBeenCalledTimes(1)
  })

  it('261122-rgi: renders the Optional content group with a row per owned or unknown entry, checked = installed', async () => {
    mockApi.getSteamOptInDlc.mockResolvedValue(
      answer('gamelib', [
        dlc('1', true, true),
        dlc('2', false, null),
        dlc('3', false, false)
      ])
    )
    const tree = await mount(makeGame('steam'))
    const rows = rowsOf(tree)
    expect(rows.map((r) => r.props.label)).toEqual(['DLC 1', 'DLC 2'])
    expect(rows.map((r) => r.props.checked)).toEqual([true, false])
    expect(textOf(tree)).toContain('Optional content')
    expect(rows[0]?.props.description).toBe('1 GiB')
  })

  it('261122-rgi: a Steam-managed copy shows disabled rows with the Steam reason and never dispatches', async () => {
    mockApi.getSteamOptInDlc.mockResolvedValue(
      answer('steam', [dlc('1', false, true)])
    )
    const row = rowsOf(await mount(makeGame('steam')))[0]
    expect(row?.props.disabled).toBe(true)
    expect(String(row?.props.disabledReason)).toContain('Properties')
    ;(row?.props.onToggle as () => void)()
    expect(mockApi.updateGame).not.toHaveBeenCalled()
  })

  it('261122-rgi: switching on sends the installed opt-in ids plus the row; switching off sends them minus the row', async () => {
    const game = makeGame('steam')
    mockApi.getSteamOptInDlc.mockResolvedValue(
      answer('gamelib', [dlc('1', true, true), dlc('2', false, true)])
    )
    const tree = await mount(game)
    ;(rowsOf(tree)[1]?.props.onToggle as () => void)()
    expect(mockApi.updateGame).toHaveBeenCalledTimes(1)
    expect(lastUpdate().steamOptInDlc).toEqual(['1', '2'])

    harness.__resetMount()
    const tree2 = await mount(game)
    ;(rowsOf(tree2)[0]?.props.onToggle as () => void)()
    expect(lastUpdate().steamOptInDlc).toEqual([])
  })

  it('261122-rgi: the row is busy with Adding until the game leaves its busy status, then the re-read shows it on', async () => {
    const game = makeGame('steam')
    mockApi.getSteamOptInDlc.mockResolvedValueOnce(
      answer('gamelib', [dlc('1', false, true), dlc('2', false, true)])
    )
    const tree = await mount(game)
    ;(rowsOf(tree)[0]?.props.onToggle as () => void)()

    let after = await step(game, { queued: true })
    const row = rowsOf(after)[0]
    expect(row?.props.busy).toBe(true)
    expect(row?.props.busyLabel).toBe('Adding…')
    expect(row?.props.checked).toBe(false)
    // the other row is held while one change runs
    expect(rowsOf(after)[1]?.props.disabled).toBe(true)

    after = await step(game, { updating: true })
    expect(rowsOf(after)[0]?.props.busy).toBe(true)
    expect(mockApi.getSteamOptInDlc).toHaveBeenCalledTimes(1)

    mockApi.getSteamOptInDlc.mockResolvedValueOnce(
      answer('gamelib', [dlc('1', true, true), dlc('2', false, true)])
    )
    after = await step(game)
    expect(mockApi.getSteamOptInDlc).toHaveBeenCalledTimes(2)
    expect(rowsOf(after)[0]?.props.checked).toBe(true)
    expect(rowsOf(after)[0]?.props.busy).toBeFalsy()
    expect(failuresOf(after)).toHaveLength(0)
  })

  it('261122-rgi: switching off reads Removing', async () => {
    const game = makeGame('steam')
    mockApi.getSteamOptInDlc.mockResolvedValueOnce(
      answer('gamelib', [dlc('1', true, true)])
    )
    const tree = await mount(game)
    ;(rowsOf(tree)[0]?.props.onToggle as () => void)()
    const after = await step(game, { updating: true })
    expect(rowsOf(after)[0]?.props.busyLabel).toBe('Removing…')
  })

  it('261122-rgi: a re-read that does not show the wanted state shows the inline failure, and Retry repeats the same change', async () => {
    const game = makeGame('steam')
    const same = answer('gamelib', [dlc('1', false, null)])
    mockApi.getSteamOptInDlc.mockResolvedValue(same)
    const tree = await mount(game)
    ;(rowsOf(tree)[0]?.props.onToggle as () => void)()
    await step(game, { updating: true })
    const after = await step(game)

    const failures = failuresOf(after)
    expect(failures).toHaveLength(1)
    expect(failures[0]?.props.message).toBe(
      "Couldn't change DLC 1. Details are in the log."
    )
    expect(rowsOf(after)[0]?.props.checked).toBe(false)

    mockApi.updateGame.mockClear()
    ;(failures[0]?.props.onRetry as () => void)()
    expect(lastUpdate().steamOptInDlc).toEqual(['1'])
  })

  it('261122-rgi: a rejected dispatch fails the row at once', async () => {
    const game = makeGame('steam')
    mockApi.getSteamOptInDlc.mockResolvedValue(
      answer('gamelib', [dlc('1', false, true)])
    )
    mockApi.updateGame.mockRejectedValue(new Error('ipc closed'))
    const tree = await mount(game)
    ;(rowsOf(tree)[0]?.props.onToggle as () => void)()
    await settle()
    const after = render(game)
    expect(failuresOf(after)).toHaveLength(1)
    expect(rowsOf(after)[0]?.props.busy).toBeFalsy()
    expect(mockApi.logError).toHaveBeenCalledTimes(1)
  })

  it('261122-rgi: every row is held while the game is busy for another reason', async () => {
    mockApi.getSteamOptInDlc.mockResolvedValue(
      answer('gamelib', [dlc('1', false, true)])
    )
    const row = rowsOf(await mount(makeGame('steam'), { updating: true }))[0]
    expect(row?.props.disabled).toBe(true)
    expect(String(row?.props.disabledReason)).toContain('Wait for')
  })
})
