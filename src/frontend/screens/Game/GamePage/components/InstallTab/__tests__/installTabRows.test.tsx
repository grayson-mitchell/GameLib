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
    useContext: () => contextValue,
    __beginRender: () => {
      cursor = 0
    },
    __resetMount: () => {
      slots = []
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
import { installActionGates } from '../../../actions/installActionGates'
import { FactAction } from '../FactRow'
import VersionRow from '../VersionRow'

const harness = React as unknown as {
  __beginRender: () => void
  __resetMount: () => void
  __setContext: (value: unknown) => void
}

type Props = Record<string, unknown> & { children?: ReactNode }

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
    isBrowserGame: game.install.platform === 'Browser',
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
  logInfo: jest.fn()
}

beforeEach(() => {
  harness.__resetMount()
  Object.values(mockApi).forEach((fn) => fn.mockReset())
  mockApi.repair.mockResolvedValue(undefined)
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
})
