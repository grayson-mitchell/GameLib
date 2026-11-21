/**
 * Phase 82 (FND-02; D-10, D-11, D-12, D-13, D-15, D-16): the Steam bridge's destructive paths ask
 * the Rust guard before anything is deleted. These suites drive the real `uninstall` entry
 * (gameUninstall.ts) and the real `removePerGameBridgeBottle` over real tmp bottle trees, with
 * `fakeSafetyRustInvoke` answering the two safety channels. No module is mocked.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
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
import type { SafetyRequest } from 'common/types/safety'
import { createTestEngineRuntime } from 'backend/testUtils/testEngineRuntime'
import { getBottleDir } from 'backend/engine/bottlePrimitives'
import { setBridgeLaunchTarget } from '../bridge/bridgeVerdict'
import { DEFAULT_BRIDGE_BOTTLE_NAME, getBottleSteamappsDir } from '../bottle'
import { uninstall } from '../gameUninstall'
import { removePerGameBridgeBottle } from '../bridgeBottleLifecycle'
import * as uninstallPollingModule from '../library/uninstallPolling'
import type SteamGame from '../games'
import type { SteamGameInfo } from 'common/types/steam'

const APP_ID = '206040'
const CX_BIN_DIR =
  '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'

function isSymlink(path: string | undefined): boolean {
  if (!path) return false
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}
const TITLE = 'Avernum 4'

type Sent = [string, unknown]

interface Harness {
  root: string
  deps: ManagerDeps
  steamGame: SteamGame
  sent: Sent[]
  safetyCalls: { channel: string }[]
  spawned: { bin: string; args: string[] }[]
  /** Safety calls and spawns in the order they happened, so a test can pin check-before-spawn. */
  events: string[]
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
  const events: string[] = []
  const requestRustInvoke: RequestRustInvoke = async (channel, args) => {
    events.push(`safety:${channel}`)
    const reply = (await safety.requestRustInvoke(channel, args)) as {
      items?: { id: string; verdict: string }[]
    }
    if (!reply.items) return reply
    const request = (args as unknown as [SafetyRequest])[0]
    return {
      ...reply,
      items: reply.items.map((item) => ({
        ...item,
        // The crate reports a symlink target as a link; the fake does not model that.
        isLink: isSymlink(request.targets.find((t) => t.id === item.id)?.path),
        ...(options.otherKey && item.verdict !== 'yes'
          ? { otherKey: options.otherKey }
          : {})
      }))
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
    // CrossOver is installed (a fixed bin dir); its cxbottle --delete removes the bottle like the real one.
    engineRuntime: {
      ...createTestEngineRuntime(),
      crossover: {
        resolveCrossoverBinDir: () => CX_BIN_DIR,
        resolveCrossoverBinDirAsync: () => Promise.resolve(CX_BIN_DIR)
      }
    } as unknown as ManagerDeps['engineRuntime'],
    spawnAsync: ((bin: string, args: string[]) => {
      spawned.push({ bin, args })
      events.push(`spawn:${basename(bin)}`)
      if (basename(bin) === 'cxbottle' && args.includes('--delete')) {
        rmSync(getBottleDir(paths, args[args.indexOf('--bottle') + 1] ?? ''), {
          recursive: true,
          force: true
        })
      }
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
    events,
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

describe('per-game bridge bottle removal (D-11, D-12, D-15, D-16)', () => {
  const PER_GAME = `GameLibSteamBridge-${APP_ID}`
  let h: Harness
  let bottleDir: string

  function seedPerGame(options?: Parameters<typeof makeHarness>[0]): void {
    h = makeHarness(options)
    seedBottle(h, PER_GAME)
    bottleDir = h.bottleDir(PER_GAME)
  }

  afterEach(() => {
    rmSync(h.root, { recursive: true, force: true })
  })

  it('yes: checks first, then stops the wineserver and runs cxbottle --delete, and reports removed', async () => {
    seedPerGame()

    const result = await removePerGameBridgeBottle(h.deps, APP_ID)

    expect(result).toEqual({ status: 'removed' })
    expect(existsSync(bottleDir)).toBe(false)
    expect(h.events).toEqual([
      'safety:safety_check_removal',
      'spawn:wineserver',
      'spawn:cxbottle',
      // WR-09: the guard is asked again once cxbottle --delete has returned.
      'safety:safety_check_removal'
    ])
    const deleteCall = h.spawned.find((c) => basename(c.bin) === 'cxbottle')
    expect(deleteCall?.args).toEqual([
      '--bottle',
      PER_GAME,
      '--delete',
      '--force'
    ])
    const request = (h.safetyCalls[0] as unknown as { args: [SafetyRequest] })
      .args[0]
    expect(request.selfKey).toBe(`steam:${APP_ID}`)
    expect(request.targets).toEqual([
      {
        id: 'bottle',
        path: bottleDir,
        kind: 'bottle',
        trustRoot: join(bottleDir, '..')
      }
    ])
  })

  it('D-12 rejection: a failed check refuses and touches nothing (no wineserver stop, no cxbottle, bottle intact)', async () => {
    seedPerGame({ rejectCheck: true })

    const result = await removePerGameBridgeBottle(h.deps, APP_ID)

    expect(result).toEqual({ status: 'refused', reason: 'rust-invoke-failed' })
    expect(existsSync(bottleDir)).toBe(true)
    expect(existsSync(join(bottleDir, 'cxbottle.conf'))).toBe(true)
    expect(h.spawned).toEqual([])
    expect(h.events).toEqual(['safety:safety_check_removal'])
  })

  it('D-16: a bottle holding another store game is refused naming that game, and nothing is touched', async () => {
    seedPerGame({
      checkVerdict: 'no',
      reason: 'nested-known-install',
      otherKey: 'gog:gog-1'
    })

    const result = await removePerGameBridgeBottle(h.deps, APP_ID)

    expect(result).toEqual({
      status: 'refused',
      reason: 'nested-known-install',
      otherKey: 'gog:gog-1'
    })
    expect(existsSync(bottleDir)).toBe(true)
    expect(h.spawned).toEqual([])
  })

  it('D-15: a symlinked bottle is only unlinked; its referent survives and cxbottle never runs', async () => {
    h = makeHarness()
    const referent = join(h.root, 'precious-referent')
    mkdirSync(referent, { recursive: true })
    writeFileSync(join(referent, 'precious.txt'), 'keep me')
    bottleDir = h.bottleDir(PER_GAME)
    mkdirSync(join(bottleDir, '..'), { recursive: true })
    symlinkSync(referent, bottleDir)

    const result = await removePerGameBridgeBottle(h.deps, APP_ID)

    expect(result).toEqual({ status: 'removed' })
    expect(isSymlink(bottleDir)).toBe(false)
    expect(existsSync(bottleDir)).toBe(false)
    expect(readFileSync(join(referent, 'precious.txt'), 'utf8')).toBe('keep me')
    expect(h.spawned).toEqual([])
    expect(h.events).toEqual([
      'safety:safety_check_removal',
      'safety:safety_check_removal',
      'safety:safety_remove_tree'
    ])
  })

  it('WR-09: a guard that objects after cxbottle --delete returns reports an error, not removed', async () => {
    seedPerGame()
    const objecting = fakeSafetyRustInvoke({
      checkVerdict: 'no',
      reason: 'nested-known-install'
    }).requestRustInvoke
    let checks = 0
    const deps: ManagerDeps = {
      ...h.deps,
      requestRustInvoke: (channel, args) => {
        if (channel === 'safety_check_removal' && ++checks === 2) {
          return objecting(channel, args)
        }
        return h.deps.requestRustInvoke(channel, args)
      }
    }

    const result = await removePerGameBridgeBottle(deps, APP_ID)

    expect(checks).toBe(2)
    expect(result.status).toBe('error')
    expect(h.spawned.map((c) => basename(c.bin))).toEqual([
      'wineserver',
      'cxbottle'
    ])
  })

  it('an absent bottle needs no guard call at all', async () => {
    h = makeHarness()

    const result = await removePerGameBridgeBottle(h.deps, APP_ID)

    expect(result).toEqual({ status: 'absent' })
    expect(h.events).toEqual([])
  })

  describe('through the uninstall route (D-13)', () => {
    let pollSpy: jest.SpyInstance

    beforeEach(() => {
      pollSpy = jest
        .spyOn(uninstallPollingModule, 'pollUninstallOnce')
        .mockResolvedValue(undefined)
    })
    afterEach(() => pollSpy.mockRestore())

    it('a refused bottle pushes the generic notice, settles the tile and keeps the bottle', async () => {
      seedPerGame({ rejectCheck: true })

      const result = await uninstall(h.steamGame, {})

      expect(result.refused).toBe(true)
      expect(result.failed).toBeUndefined()
      expect(existsSync(bottleDir)).toBe(true)
      expect(h.spawned).toEqual([])
      expect(pollSpy).not.toHaveBeenCalled()
      expect(messages(h, 'removalRefusedNotice')).toEqual([
        {
          kind: 'remove-bottle',
          outcome: 'refused',
          reason: 'rust-invoke-failed',
          title: TITLE,
          appName: APP_ID,
          runner: 'steam'
        }
      ])
      expect(messages(h, 'steamRequestNotice')).toEqual([])
      expect(statuses(h).at(-1)).toBe('done')
    })

    it('a yes removes the bottle and completes through the poll with no refusal notice', async () => {
      seedPerGame()

      const result = await uninstall(h.steamGame, {})

      expect(result).toEqual({ stdout: '', stderr: '' })
      expect(existsSync(bottleDir)).toBe(false)
      expect(pollSpy).toHaveBeenCalledWith(h.deps, APP_ID, 'bridge')
      expect(messages(h, 'removalRefusedNotice')).toEqual([])
    })
  })
})
