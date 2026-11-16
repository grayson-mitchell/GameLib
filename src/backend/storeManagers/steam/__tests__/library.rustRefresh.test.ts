/**
 * Phase 79-31: the Rust Refresh input builder, known-fix catalogue enumeration and result applier.
 */
import { withEmptyPollStatus } from 'backend/testUtils/steamPollStatusFake'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createTestManagerDeps,
  createTestStores
} from 'backend/testUtils/testServices'
import type { SteamGameInfo } from 'common/types/steam'
import type { RefreshResult } from '../cm/steamCmTypes'

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

const env = { isMac: false, isAppleSiliconMac: true }
jest.mock('backend/constants/environment', () => ({
  get isMac() {
    return env.isMac
  },
  get isAppleSiliconMac() {
    return env.isAppleSiliconMac
  },
  isWindows: false,
  isLinux: true
}))

jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn((n: number) => `${n} B`)
}))

jest.mock('../stores', () => ({
  steamLibraryStore: { get: jest.fn(), set: jest.fn() },
  steamMetadataStore: { get: jest.fn(), set: jest.fn(), entries: jest.fn() },
  steamSyncStore: { get: jest.fn(), set: jest.fn() }
}))

jest.mock('../bridge/allowlist', () => ({
  bridgeAllowlist: {
    has: jest.fn(),
    knownBadReason: jest.fn(),
    seedIds: jest.fn()
  }
}))
jest.mock('../bridgeBottle', () => ({
  createDrmBridgeRunners: () => ({}),
  listReadyBridgeBottleNames: jest.fn(() => [])
}))

jest.mock('../library/installedMap', () => ({
  installVersionField: jest.requireActual<
    typeof import('../library/installedMap')
  >('../library/installedMap').installVersionField,
  buildInstalledMap: jest.fn(),
  buildIncompleteInstallSet: jest.fn(),
  buildBottleInstalledMap: jest.fn(),
  buildBridgeInstalledMap: jest.fn()
}))

import { bridgeAllowlist } from '../bridge/allowlist'
import { listKnownFixMac32AppIds } from '../macArchKnownFix'
import {
  applyRustRefreshResult,
  buildRustRefreshInputs
} from '../library/rustRefresh'
import {
  buildBottleInstalledMap,
  buildIncompleteInstallSet,
  buildInstalledMap
} from '../library/installedMap'
import { getFileSize } from 'backend/utils'
import { listReadyBridgeBottleNames } from '../bridgeBottle'

const stores =
  jest.requireMock<ReturnType<typeof createTestStores>['steam']>('../stores')
const sendFrontendMessage = jest.fn()
const deps = createTestManagerDeps({
  stores: createTestStores({ steam: stores as never }),
  sendFrontendMessage,
  requestRustInvoke: withEmptyPollStatus(() => Promise.resolve(undefined))
})
const library = deps.steamSession.libraryState.library
// Typed handles: reading .set off the mocked stores trips @typescript-eslint/unbound-method.
const storeMocks = stores as unknown as Record<
  'steamMetadataStore' | 'steamLibraryStore' | 'steamSyncStore',
  { set: jest.Mock }
>
const allowlistMocks = bridgeAllowlist as unknown as { seedIds: jest.Mock }

const game = (id: string, extra: Partial<SteamGameInfo> = {}): SteamGameInfo =>
  ({
    runner: 'steam',
    app_name: id,
    title: `Game ${id}`,
    art_cover: '',
    art_square: '',
    is_installed: false,
    install: {},
    extra: { reqs: [] },
    canRunOffline: true,
    installable: true,
    ...extra
  }) as unknown as SteamGameInfo

const result = (over: Partial<RefreshResult> = {}): RefreshResult => ({
  games: [],
  metadataUpdates: {},
  ownedCount: 0,
  demoCount: 0,
  demosFailed: false,
  capture: {
    platforms: { scoped: 0, captured: 0, skipped: 0, failed: false },
    metacritic: { scoped: 0, captured: 0, skipped: 0, failed: false },
    anonCount: 0,
    heldCount: 0
  },
  enrich: {
    attempted: 0,
    enriched: 0,
    delisted: 0,
    failed: 0,
    rateLimited: false,
    budgetHit: false,
    notReached: []
  },
  source: 'cm',
  ...over
})

beforeEach(() => {
  jest.clearAllMocks()
  library.clear()
  env.isMac = false
  env.isAppleSiliconMac = true
  stores.steamMetadataStore.entries = jest.fn().mockReturnValue([])
  stores.steamMetadataStore.get = jest.fn()
  jest.mocked(getFileSize).mockImplementation((n: unknown) => `${n} B`)
  jest.mocked(buildInstalledMap).mockResolvedValue(new Map())
  jest.mocked(buildIncompleteInstallSet).mockResolvedValue(new Set())
  jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
  allowlistMocks.seedIds.mockReturnValue(['111'])
})

describe('listKnownFixMac32AppIds', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gl-fix-'))
    for (const d of ['local', 'bundled', 'remote']) mkdirSync(join(root, d))
    writeFileSync(join(root, 'bundled', '10-steam.json'), '{"macArch":"32"}')
    writeFileSync(join(root, 'remote', '20-steam.json'), '{"macArch":"64"}')
    writeFileSync(join(root, 'local', '30-steam.profile.json'), '{}')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))
  const fixDeps = () => ({
    paths: {
      localFixesPath: join(root, 'local'),
      bundledFixesPath: join(root, 'bundled'),
      fixesPath: join(root, 'remote')
    }
  })

  it('returns exactly the 32-bit fix, not the 64-bit fix or a tier-2 profile', () => {
    expect(listKnownFixMac32AppIds(fixDeps())).toEqual(['10'])
  })

  it('is empty off Apple silicon', () => {
    env.isAppleSiliconMac = false
    expect(listKnownFixMac32AppIds(fixDeps())).toEqual([])
  })

  it('skips an unreadable layer', () => {
    rmSync(join(root, 'local'), { recursive: true })
    expect(listKnownFixMac32AppIds(fixDeps())).toEqual(['10'])
  })
})

describe('buildRustRefreshInputs', () => {
  it('snapshots metadata, the previous library, native installs with formatted sizes and the allowlist', async () => {
    const entry = { art_cover: 'c', art_square: 's', extra: { reqs: [] } }
    stores.steamMetadataStore.entries = jest
      .fn()
      .mockReturnValue([['10', entry]])
    library.set('10', game('10'))
    jest
      .mocked(buildInstalledMap)
      .mockResolvedValue(
        new Map([[10, { installPath: '/p', sizeOnDisk: '2048', buildid: '5' }]])
      )
    jest.mocked(buildIncompleteInstallSet).mockResolvedValue(new Set([11]))

    const inputs = await buildRustRefreshInputs(deps)

    expect(inputs.metadata).toEqual({ '10': entry })
    expect(inputs.metadata['10']).not.toBe(entry)
    expect(inputs.previousGames).toHaveLength(1)
    expect(inputs.installState).toEqual({
      native: {
        '10': { installPath: '/p', installSize: '2048 B', buildid: '5' }
      },
      incomplete: [11]
    })
    expect(inputs.bridgeAllowlist).toEqual(['111'])
    expect(inputs.isMac).toBe(false)
    expect(inputs.bridgeAppIds).toEqual([])
  })

  it('omits bottle and bridge off macOS', async () => {
    const inputs = await buildRustRefreshInputs(deps)
    expect(inputs.installState).not.toHaveProperty('bottle')
    expect(inputs.installState).not.toHaveProperty('bridge')
    expect(buildBottleInstalledMap).not.toHaveBeenCalled()
  })
})

describe('applyRustRefreshResult', () => {
  it('writes changed entries that still equal the sent snapshot and skips a concurrently changed one', async () => {
    const sent = {
      a: { art_cover: '1', art_square: '', extra: { reqs: [] } },
      b: { art_cover: '2', art_square: '', extra: { reqs: [] } }
    }
    const current: Record<string, unknown> = {
      a: { ...sent.a },
      b: { ...sent.b, art_cover: 'lazy-write' }
    }
    stores.steamMetadataStore.get = jest.fn(
      (id: string) => current[id]
    ) as never
    const upd = (c: string) => ({
      art_cover: c,
      art_square: '',
      extra: { reqs: [] }
    })

    const out = await applyRustRefreshResult(
      deps,
      sent as never,
      result({ metadataUpdates: { a: upd('new-a'), b: upd('new-b') } })
    )

    expect(out).toEqual({ written: 1, staleSkipped: 1 })
    expect(storeMocks.steamMetadataStore.set).toHaveBeenCalledTimes(1)
    expect(storeMocks.steamMetadataStore.set).toHaveBeenCalledWith(
      'a',
      upd('new-a')
    )
  })

  it('replaces libraryState, pushes every game once, persists games and syncedAt', async () => {
    library.set('stale', game('stale'))
    await applyRustRefreshResult(
      deps,
      {},
      result({ games: [game('1'), game('2')] })
    )

    expect([...library.keys()]).toEqual(['1', '2'])
    expect(sendFrontendMessage).toHaveBeenCalledTimes(2)
    expect(storeMocks.steamLibraryStore.set).toHaveBeenCalledWith(
      'games',
      expect.arrayContaining([
        expect.objectContaining({ app_name: '1' }),
        expect.objectContaining({ app_name: '2' })
      ])
    )
    expect(storeMocks.steamSyncStore.set).toHaveBeenCalledWith(
      'syncedAt',
      expect.any(Number)
    )
  })

  it('strips a stray key from a Rust game before it reaches state', async () => {
    const dirty = { ...game('1'), bogusKey: 'x' } as unknown as SteamGameInfo
    await applyRustRefreshResult(deps, {}, result({ games: [dirty] }))
    expect(library.get('1')).not.toHaveProperty('bogusKey')
  })
})

describe('applyRustRefreshResult: install state that changed during the op (C1/WR-01)', () => {
  const acf = (path: string, buildid?: string) => ({
    installPath: path,
    installSize: '9 B',
    ...(buildid !== undefined ? { buildid } : {})
  })
  const installedGame = (id: string, path: string) =>
    game(id, {
      is_installed: true,
      install: { install_path: path, install_size: '9 B', platform: 'linux' }
    } as Partial<SteamGameInfo>)

  it('keeps an install that finished during the op', async () => {
    // The op saw nothing installed; by apply time the ACF is fully installed.
    jest
      .mocked(buildInstalledMap)
      .mockResolvedValue(
        new Map([[1, { installPath: '/n/1', sizeOnDisk: '9', buildid: '7' }]])
      )
    await applyRustRefreshResult(deps, {}, result({ games: [game('1')] }), {
      installState: { native: {}, incomplete: [] },
      previousGames: []
    })
    expect(library.get('1')).toMatchObject({
      is_installed: true,
      install: { install_path: '/n/1', install_size: '9 B', version: '7' }
    })
    expect(storeMocks.steamLibraryStore.set).toHaveBeenCalledWith('games', [
      expect.objectContaining({ app_name: '1', is_installed: true })
    ])
  })

  it('does not bring back an install that was uninstalled during the op', async () => {
    await applyRustRefreshResult(
      deps,
      {},
      result({ games: [installedGame('2', '/n/2')] }),
      {
        installState: { native: { '2': acf('/n/2') }, incomplete: [] },
        previousGames: []
      }
    )
    expect(library.get('2')).toMatchObject({ is_installed: false, install: {} })
  })

  it('keeps a resume breadcrumb written by an install that started during the op', async () => {
    library.set(
      '3',
      game('3', {
        install: {
          steamResumePending: true,
          steamResumeTargetSteamappsDir: '/steamapps',
          steamResumeInstalldir: 'Game'
        }
      } as Partial<SteamGameInfo>)
    )
    await applyRustRefreshResult(deps, {}, result({ games: [game('3')] }), {
      installState: { native: {}, incomplete: [] },
      previousGames: [game('3')]
    })
    expect(library.get('3')?.install).toEqual({
      steamResumePending: true,
      steamResumeTargetSteamappsDir: '/steamapps',
      steamResumeInstalldir: 'Game'
    })
  })

  it("leaves Rust's fields alone for an app whose install inputs did not change", async () => {
    jest
      .mocked(buildInstalledMap)
      .mockResolvedValue(
        new Map([[4, { installPath: '/n/4', sizeOnDisk: '9' }]])
      )
    const fromRust = installedGame('4', '/n/4')
    await applyRustRefreshResult(deps, {}, result({ games: [fromRust] }), {
      installState: { native: { '4': acf('/n/4') }, incomplete: [] },
      previousGames: []
    })
    expect(library.get('4')?.install).toEqual(fromRust.install)
  })

  it("keeps the op's snapshot when the re-read fails", async () => {
    jest.mocked(buildInstalledMap).mockRejectedValue(new Error('scan'))
    await applyRustRefreshResult(
      deps,
      {},
      result({ games: [installedGame('5', '/n/5')] }),
      {
        installState: { native: { '5': acf('/n/5') }, incomplete: [] },
        previousGames: []
      }
    )
    expect(library.get('5')?.is_installed).toBe(true)
  })
})
