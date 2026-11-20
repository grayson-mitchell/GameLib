/**
 * Phase 82 (FND-02; D-09, D-12, D-13, D-16): the Steam direct removal routes ask the Rust guard
 * before anything is deleted. This suite drives the real `uninstall` entry down the bottle-direct
 * route (`uninstallBottleGameDirectly`) over a real tmp bottle tree, with `fakeSafetyRustInvoke`
 * answering the two safety channels. No module is mocked.
 *
 * Plan 82-09 task 2 extends it with the copy-removal pre-check (`removeCopyViaRust`).
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RequestRustInvoke } from 'backend/host'
import { initHeadless } from 'backend/logger'
import * as environment from 'backend/constants/environment'
import {
  fakeSafetyRustInvoke,
  type FakeSafetyOptions
} from 'backend/testUtils/fakeSafetyRust'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import {
  createTestManagerDeps,
  createTestManagers
} from 'backend/testUtils/testServices'
import type { ManagerDeps } from 'backend/services/types'
import type { GameInfo } from 'common/types'
import type { SteamGameInfo } from 'common/types/steam'
import type { RemovalRefusalPayload } from 'common/types/removalRefusal'
import type { SafetyItem, SafetyRequest } from 'common/types/safety'
import { getBottleSteamappsDir } from '../bottle'
import { uninstall } from '../gameUninstall'
import * as acfState from '../library/acfState'
import * as uninstallPollingModule from '../library/uninstallPolling'
import type SteamGame from '../games'

// Not a curated known-fix id (Hoard's 63000 is seeded as 32-bit, which would route it to guided setup).
const APP_ID = '4242001'
const TITLE = 'Hoard'

type Sent = [string, unknown]

interface Harness {
  root: string
  deps: ManagerDeps
  steamGame: SteamGame
  sent: Sent[]
  safetyCalls: { channel: string; args: unknown[] }[]
  /** The bottle's steamapps dir (real, under the tmp root). */
  steamapps: string
}

interface HarnessOptions extends FakeSafetyOptions {
  otherGames?: GameInfo[]
  /**
   * Decide the verdict from the request itself, the way the crate does: a known install inside a
   * target is `nested-known-install`. Proves the request carries the other game's folder.
   */
  decideFromRequest?: boolean
}

/** What the Rust check answers for a request whose known installs sit inside a target. */
function nestedItems(req: SafetyRequest): SafetyItem[] | null {
  const items: SafetyItem[] = []
  for (const target of req.targets) {
    const inside = req.knownInstalls?.find(
      (k) =>
        k.key !== req.selfKey &&
        k.path.startsWith(`${target.path}/`) &&
        k.path !== target.path
    )
    if (inside) {
      items.push({
        id: target.id,
        verdict: 'no',
        reason: 'nested-known-install',
        isLink: false,
        absent: false,
        otherKey: inside.key
      })
    }
  }
  return items.length > 0 ? items : null
}

function makeHarness(options: HarnessOptions = {}): Harness {
  const root = mkdtempSync(join(tmpdir(), 'gamelib-steam-direct-removal-'))
  const paths = createTestAppPaths(root)
  const sent: Sent[] = []
  const safety = fakeSafetyRustInvoke({
    ...options,
    base: () => Promise.reject(new Error('unexpected non-safety rustInvoke'))
  })
  const requestRustInvoke: RequestRustInvoke = async (channel, args) => {
    if (options.decideFromRequest) {
      const request = (args as unknown as [SafetyRequest])[0]
      const blocked = nestedItems(request)
      if (blocked) {
        safety.calls.push({ channel, args: args as unknown as unknown[] })
        const reply = { overall: 'no', items: blocked }
        return channel === 'safety_remove_tree'
          ? { ...reply, outcome: 'refused' }
          : reply
      }
    }
    return safety.requestRustInvoke(channel, args)
  }
  const managers = createTestManagers().library
  const otherGames = options.otherGames ?? []
  const libraryManagers = Object.fromEntries(
    Object.entries(managers).map(([runner, manager]) => [
      runner,
      {
        ...manager,
        getListOfGames: () => (runner === 'gog' ? otherGames : []),
        getGame: (appName: string) => ({
          getGameInfo: () => otherGames.find((g) => g.app_name === appName)
        })
      }
    ])
  ) as unknown as ManagerDeps['libraryManagers']
  const deps = createTestManagerDeps({
    paths,
    config: createTestGlobalConfig(),
    libraryManagers,
    requestRustInvoke,
    sendFrontendMessage: ((name: string, payload: unknown) => {
      sent.push([name, payload])
    }) as ManagerDeps['sendFrontendMessage']
  })
  const bottleName =
    deps.steamBottle.getSteamBottleSettings().wineCrossoverBottle
  const steamapps = getBottleSteamappsDir(paths, bottleName)
  mkdirSync(join(steamapps, 'common'), { recursive: true })
  deps.steamSession.libraryState.library.set(APP_ID, {
    runner: 'steam',
    app_name: APP_ID,
    title: TITLE,
    art_cover: '',
    art_square: '',
    is_installed: true,
    install: { install_path: join(steamapps, 'common', TITLE) },
    extra: { reqs: [] },
    canRunOffline: true,
    installable: true
  } as SteamGameInfo)
  // Platforms captured, and a native mac title, so no metadata fetch and no bottle-setup request.
  deps.stores.steam.steamMetadataStore.set(APP_ID, {
    art_cover: '',
    art_square: '',
    extra: { reqs: [] },
    platformsCaptured: true,
    is_mac_native: true
  } as never)
  const steamGame = {
    appId: APP_ID,
    deps,
    getGameInfo: () => deps.steamSession.libraryState.library.get(APP_ID),
    findGameInfo: () => undefined
  } as unknown as SteamGame
  return { root, deps, steamGame, sent, safetyCalls: safety.calls, steamapps }
}

const messages = (h: Harness, name: string): unknown[] =>
  h.sent.filter(([n]) => n === name).map(([, payload]) => payload)

const statuses = (h: Harness): string[] =>
  messages(h, 'gameStatusUpdate').map((p) => (p as { status: string }).status)

beforeAll(() => initHeadless())

describe('bottle-direct uninstall (D-09, D-12, D-13)', () => {
  let h: Harness
  let installDir: string
  let manifestPath: string
  let pollSpy: jest.SpyInstance
  let readAcfSpy: jest.SpyInstance
  let conflictSpy: jest.SpyInstance
  let macSpy: jest.ReplaceProperty<boolean>

  /** A real bottle tree: `common/<installdir>` with a binary, and the app's manifest. */
  function seed(options?: HarnessOptions, installdir: string = TITLE): void {
    h = makeHarness(options)
    installDir = join(h.steamapps, 'common', installdir)
    manifestPath = join(h.steamapps, `appmanifest_${APP_ID}.acf`)
    mkdirSync(installDir, { recursive: true })
    writeFileSync(join(installDir, 'Hoard.exe'), 'binary-stub')
    writeFileSync(manifestPath, '"AppState"\n{\n}\n')
    h.deps.steamSession.libraryState.library.set(APP_ID, {
      ...h.deps.steamSession.libraryState.library.get(APP_ID),
      install: { install_path: installDir }
    } as SteamGameInfo)
    readAcfSpy.mockResolvedValue({
      state: 'installed',
      installPath: installDir
    })
  }

  beforeEach(() => {
    macSpy = jest.replaceProperty(environment, 'isMac', true)
    pollSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)
    readAcfSpy = jest.spyOn(acfState, 'readAcfState')
    conflictSpy = jest
      .spyOn(acfState, 'findOtherManifestsWithInstalldir')
      .mockResolvedValue([])
  })

  afterEach(() => {
    macSpy.restore()
    pollSpy.mockRestore()
    readAcfSpy.mockRestore()
    conflictSpy.mockRestore()
    rmSync(h.root, { recursive: true, force: true })
  })

  it('yes: removes the install root and the manifest, and completes through the poll', async () => {
    seed()

    const result = await uninstall(h.steamGame, {})

    expect(result).toEqual({ stdout: '', stderr: '' })
    expect(existsSync(installDir)).toBe(false)
    expect(existsSync(manifestPath)).toBe(false)
    expect(pollSpy).toHaveBeenCalledWith(h.deps, APP_ID, 'bottle')
    expect(messages(h, 'removalRefusedNotice')).toEqual([])
  })

  it('hands the guard the install root with the bottle common dir as its trust root', async () => {
    seed()

    await uninstall(h.steamGame, {})

    const request = h.safetyCalls.find(
      (c) => c.channel === 'safety_remove_tree'
    )?.args[0] as SafetyRequest
    expect(request.selfKey).toBe(`steam:${APP_ID}`)
    expect(request.targets).toEqual([
      {
        id: 'install',
        path: installDir,
        kind: 'game-install',
        trustRoot: join(h.steamapps, 'common')
      }
    ])
  })

  it('D-12 rejection: a failed safety check keeps the install root and manifest, notices once and settles the tile', async () => {
    seed({ rejectCheck: true })

    const result = await uninstall(h.steamGame, {})

    expect(result.refused).toBe(true)
    expect(result.failed).toBeUndefined()
    expect(existsSync(join(installDir, 'Hoard.exe'))).toBe(true)
    expect(existsSync(manifestPath)).toBe(true)
    expect(pollSpy).not.toHaveBeenCalled()
    expect(messages(h, 'removalRefusedNotice')).toEqual([
      {
        kind: 'uninstall',
        outcome: 'refused',
        reason: 'rust-invoke-failed',
        title: TITLE,
        appName: APP_ID,
        runner: 'steam'
      } satisfies RemovalRefusalPayload
    ])
    // D-13: the generic notice replaces the steam request notice, and done is sent once.
    expect(messages(h, 'steamRequestNotice')).toEqual([])
    expect(statuses(h)).toEqual(['done'])
  })

  it('D-12 rejection: a remove that rejects after a yes check is reported as failed and keeps the manifest', async () => {
    seed({ rejectRemove: true })

    const result = await uninstall(h.steamGame, {})

    expect(result.failed).toBe(true)
    expect(result.refused).toBeUndefined()
    expect(existsSync(installDir)).toBe(true)
    expect(existsSync(manifestPath)).toBe(true)
    expect(pollSpy).not.toHaveBeenCalled()
    const notices = messages(
      h,
      'removalRefusedNotice'
    ) as RemovalRefusalPayload[]
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({
      kind: 'uninstall',
      outcome: 'failed',
      reason: 'rust-invoke-failed'
    })
    expect(statuses(h)).toEqual(['done'])
  })

  describe('D-09 nested installdir row', () => {
    /** A second known install nested inside the manifest's `Studio` installdir. */
    function otherGameInside(dir: string): GameInfo[] {
      return [
        {
          runner: 'gog',
          app_name: 'gog-1',
          title: 'Game B',
          is_installed: true,
          install: { install_path: join(dir, 'GameB') }
        } as unknown as GameInfo
      ]
    }

    it('another known install at common/Studio/GameB refuses naming it and deletes nothing', async () => {
      const others: GameInfo[] = []
      seed(
        {
          checkVerdict: 'no',
          reason: 'nested-known-install',
          otherGames: others
        },
        'Studio'
      )
      const gameB = join(installDir, 'GameB')
      mkdirSync(gameB, { recursive: true })
      writeFileSync(join(gameB, 'GameB.exe'), 'other-store-stub')
      others.push(...otherGameInside(installDir))

      const result = await uninstall(h.steamGame, {})

      expect(result.refused).toBe(true)
      expect(existsSync(join(gameB, 'GameB.exe'))).toBe(true)
      expect(existsSync(join(installDir, 'Hoard.exe'))).toBe(true)
      expect(existsSync(manifestPath)).toBe(true)
      expect(pollSpy).not.toHaveBeenCalled()
      expect(
        h.safetyCalls.filter((c) => c.channel === 'safety_remove_tree')
      ).toEqual([])
      expect(statuses(h)).toEqual(['done'])
    })

    it('end to end: the request carries the other game, and the nested verdict names it in the notice', async () => {
      const others: GameInfo[] = []
      seed({ decideFromRequest: true, otherGames: others }, 'Studio')
      const gameB = join(installDir, 'GameB')
      mkdirSync(gameB, { recursive: true })
      writeFileSync(join(gameB, 'GameB.exe'), 'other-store-stub')
      others.push(...otherGameInside(installDir))

      const result = await uninstall(h.steamGame, {})

      const request = h.safetyCalls.find(
        (c) => c.channel === 'safety_check_removal'
      )?.args[0] as SafetyRequest
      expect(request.knownInstalls).toEqual([
        { key: 'gog:gog-1', path: join(installDir, 'GameB') }
      ])
      expect(result.refused).toBe(true)
      expect(existsSync(join(gameB, 'GameB.exe'))).toBe(true)
      expect(existsSync(manifestPath)).toBe(true)
      const [notice] = messages(
        h,
        'removalRefusedNotice'
      ) as RemovalRefusalPayload[]
      expect(notice).toMatchObject({
        kind: 'uninstall',
        outcome: 'refused',
        reason: 'nested-known-install',
        otherTitle: 'Game B'
      })
    })
  })
})
