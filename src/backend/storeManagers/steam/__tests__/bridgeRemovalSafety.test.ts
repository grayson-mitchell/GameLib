/**
 * Phase 82 (FND-02; D-10, D-11, D-12, D-13, D-15, D-16): the Steam bridge's destructive paths ask
 * the Rust guard before anything is deleted. These suites drive the real `uninstall` entry
 * (gameUninstall.ts) and the real `removePerGameBridgeBottle` over real tmp bottle trees, with
 * `fakeSafetyRustInvoke` answering the two safety channels. No module is mocked.
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
import type { RemovalRefusalPayload } from 'common/types/removalRefusal'
import { getBottleDir } from 'backend/engine/bottlePrimitives'
import { setBridgeLaunchTarget } from '../bridge/bridgeVerdict'
import { DEFAULT_BRIDGE_BOTTLE_NAME, getBottleSteamappsDir } from '../bottle'
import { uninstall } from '../gameUninstall'
import * as uninstallPollingModule from '../library/uninstallPolling'
import type SteamGame from '../games'
import type { SteamGameInfo } from 'common/types/steam'

const APP_ID = '206040'
const TITLE = 'Avernum 4'

type Sent = [string, unknown]

interface Harness {
  root: string
  deps: ManagerDeps
  steamGame: SteamGame
  sent: Sent[]
  safetyCalls: { channel: string }[]
  spawned: { bin: string; args: string[] }[]
  /** The tmp bottle dir for a bottle name (what getBottleDir resolves). */
  bottleDir: (name: string) => string
  steamapps: (name: string) => string
}

function makeHarness(
  options: FakeSafetyOptions & {
    otherGames?: GameInfo[]
    /** Stamped on every non-yes item, as the crate does for a nested or inside known install. */
    otherKey?: string
  } = {}
): Harness {
  const root = mkdtempSync(join(tmpdir(), 'gamelib-bridge-removal-'))
  const paths = createTestAppPaths(root)
  const sent: Sent[] = []
  const spawned: { bin: string; args: string[] }[] = []
  const safety = fakeSafetyRustInvoke({
    ...options,
    base: () => Promise.reject(new Error('unexpected non-safety rustInvoke'))
  })
  const requestRustInvoke: RequestRustInvoke = async (channel, args) => {
    const reply = (await safety.requestRustInvoke(channel, args)) as {
      items?: { verdict: string }[]
    }
    if (!options.otherKey || !reply.items) return reply
    return {
      ...reply,
      items: reply.items.map((item) =>
        item.verdict === 'yes' ? item : { ...item, otherKey: options.otherKey }
      )
    }
  }
  const managers = createTestManagers().library
  const otherGames = options.otherGames ?? []
  // Every manager answers its list (a manager that throws reads as an unknown known-installs list).
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
    }) as ManagerDeps['sendFrontendMessage'],
    spawnAsync: ((bin: string, args: string[]) => {
      spawned.push({ bin, args })
      return Promise.resolve({ code: 0, stdout: '', stderr: '' })
    }) as ManagerDeps['spawnAsync']
  })
  deps.steamSession.libraryState.library.set(APP_ID, {
    runner: 'steam',
    app_name: APP_ID,
    title: TITLE,
    art_cover: '',
    art_square: '',
    is_installed: true,
    install: {},
    extra: { reqs: [] },
    canRunOffline: true,
    installable: true
  } as SteamGameInfo)
  // The platforms-captured gate returns at once, so no metadata fetch is attempted.
  deps.stores.steam.steamMetadataStore.set(APP_ID, {
    art_cover: '',
    art_square: '',
    extra: { reqs: [] },
    platformsCaptured: true
  } as never)
  const steamGame = {
    appId: APP_ID,
    deps,
    getGameInfo: () => deps.steamSession.libraryState.library.get(APP_ID),
    findGameInfo: () => undefined
  } as unknown as SteamGame
  return {
    root,
    deps,
    steamGame,
    sent,
    safetyCalls: safety.calls,
    spawned,
    bottleDir: (name) => getBottleDir(paths, name),
    steamapps: (name) => getBottleSteamappsDir(paths, name)
  }
}

/** A bottle that findBridgeInstallBottle sees: provisioned (cxbottle.conf) with the appId's manifest. */
function seedBottle(h: Harness, name: string): void {
  const dir = h.bottleDir(name)
  mkdirSync(join(dir, 'drive_c'), { recursive: true })
  writeFileSync(join(dir, 'cxbottle.conf'), '[Bottle]\n')
  mkdirSync(join(h.steamapps(name), 'common'), { recursive: true })
  writeFileSync(
    join(h.steamapps(name), `appmanifest_${APP_ID}.acf`),
    '"AppState"\n{\n}\n'
  )
}

const messages = (h: Harness, name: string): unknown[] =>
  h.sent.filter(([n]) => n === name).map(([, payload]) => payload)

const statuses = (h: Harness): string[] =>
  messages(h, 'gameStatusUpdate').map((p) => (p as { status: string }).status)

beforeAll(() => initHeadless())

describe('bridge shared-bottle uninstall (D-10, D-12, D-13, D-16)', () => {
  let h: Harness
  let installDir: string
  let manifestPath: string
  let pollSpy: jest.SpyInstance

  beforeEach(() => {
    pollSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)
  })

  afterEach(() => {
    pollSpy.mockRestore()
    rmSync(h.root, { recursive: true, force: true })
  })

  /** The game lives in the legacy shared bridge bottle: its own per-game bottle was never made. */
  function seedSharedInstall(
    options?: Parameters<typeof makeHarness>[0]
  ): void {
    h = makeHarness(options)
    seedBottle(h, DEFAULT_BRIDGE_BOTTLE_NAME)
    installDir = join(h.steamapps(DEFAULT_BRIDGE_BOTTLE_NAME), 'common', TITLE)
    manifestPath = join(
      h.steamapps(DEFAULT_BRIDGE_BOTTLE_NAME),
      `appmanifest_${APP_ID}.acf`
    )
    mkdirSync(installDir, { recursive: true })
    writeFileSync(join(installDir, 'Avernum4.exe'), 'binary-stub')
    setBridgeLaunchTarget(h.deps, APP_ID, {
      executable: 'Avernum4.exe',
      installdir: TITLE
    })
  }

  it('removes the install root and the manifest when the guard says yes, and completes through the poll', async () => {
    seedSharedInstall()

    const result = await uninstall(h.steamGame, {})

    expect(result).toEqual({ stdout: '', stderr: '' })
    expect(existsSync(installDir)).toBe(false)
    expect(existsSync(manifestPath)).toBe(false)
    expect(pollSpy).toHaveBeenCalledWith(h.deps, APP_ID, 'bridge')
    expect(messages(h, 'removalRefusedNotice')).toEqual([])
    // The trust root the guard was handed is the bridge bottle's own steamapps/common.
    const check = h.safetyCalls.find(
      (c) => c.channel === 'safety_check_removal'
    )
    expect(check).toBeDefined()
  })

  it('D-12 rejection: a failed safety check keeps the install root and manifest, notices once and settles the tile', async () => {
    seedSharedInstall({ rejectCheck: true })

    const result = await uninstall(h.steamGame, {})

    expect(result.refused).toBe(true)
    expect(result.failed).toBeUndefined()
    expect(existsSync(installDir)).toBe(true)
    expect(existsSync(join(installDir, 'Avernum4.exe'))).toBe(true)
    expect(existsSync(manifestPath)).toBe(true)
    expect(pollSpy).not.toHaveBeenCalled()
    expect(h.spawned).toEqual([])
    const notices = messages(
      h,
      'removalRefusedNotice'
    ) as RemovalRefusalPayload[]
    expect(notices).toEqual([
      {
        kind: 'uninstall',
        outcome: 'refused',
        reason: 'rust-invoke-failed',
        title: TITLE,
        appName: APP_ID,
        runner: 'steam'
      }
    ])
    // D-13: the generic notice replaces the steam request notice; there is not also a failure toast.
    expect(messages(h, 'steamRequestNotice')).toEqual([])
    expect(statuses(h).at(-1)).toBe('done')
  })

  it('D-12 rejection: a remove that rejects after a yes check is reported as failed and keeps the manifest for a retry', async () => {
    seedSharedInstall({ rejectRemove: true })

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
    expect(messages(h, 'steamRequestNotice')).toEqual([])
    expect(statuses(h).at(-1)).toBe('done')
  })

  it('D-16: another store game inside the install root is refused naming it, and nothing is deleted', async () => {
    const others: GameInfo[] = []
    seedSharedInstall({
      checkVerdict: 'no',
      reason: 'nested-known-install',
      otherKey: 'gog:gog-1',
      otherGames: others
    })
    others.push({
      runner: 'gog',
      app_name: 'gog-1',
      title: 'Other GOG Game',
      is_installed: true,
      install: { install_path: join(installDir, 'nested') }
    } as unknown as GameInfo)

    const result = await uninstall(h.steamGame, {})

    expect(result.refused).toBe(true)
    expect(existsSync(installDir)).toBe(true)
    expect(existsSync(manifestPath)).toBe(true)
    const [notice] = messages(
      h,
      'removalRefusedNotice'
    ) as RemovalRefusalPayload[]
    expect(notice).toMatchObject({
      kind: 'uninstall',
      outcome: 'refused',
      reason: 'nested-known-install',
      otherTitle: 'Other GOG Game'
    })
    // The request carried the other game's folder, so the guard had it to compare against.
    const calls = h.safetyCalls as unknown as {
      channel: string
      args: unknown[]
    }[]
    const request = calls.find((c) => c.channel === 'safety_check_removal')
      ?.args[0] as { knownInstalls: { key: string }[] }
    expect(request.knownInstalls).toEqual([
      { key: 'gog:gog-1', path: join(installDir, 'nested') }
    ])
  })

  it('hands the guard the install root with the bridge bottle common dir as its trust root, not a manifest value', async () => {
    seedSharedInstall()
    // A hostile manifest must not move the trust root.
    writeFileSync(
      manifestPath,
      '"AppState"\n{\n"installdir" "../../../.."\n}\n'
    )

    await uninstall(h.steamGame, {})

    const calls = h.safetyCalls as unknown as {
      channel: string
      args: unknown[]
    }[]
    const request = calls.find((c) => c.channel === 'safety_remove_tree')
      ?.args[0] as {
      targets: { id: string; path: string; kind: string; trustRoot: string }[]
      selfKey: string
    }
    expect(request.selfKey).toBe(`steam:${APP_ID}`)
    expect(request.targets).toEqual([
      {
        id: 'install',
        path: installDir,
        kind: 'game-install',
        trustRoot: join(h.steamapps(DEFAULT_BRIDGE_BOTTLE_NAME), 'common')
      }
    ])
  })
})
