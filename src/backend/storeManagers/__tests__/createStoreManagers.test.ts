/**
 * 66.1-23 (D-02 / MH-2): the five library managers and the launcher are built once per boot by
 * createStoreManagers(deps); importing storeManagers/index.ts constructs nothing. Zero jest.mock:
 * every collaborator is a createTestServices piece, a scripted runner or a real runner on a fake
 * HOME.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { initHeadless } from 'backend/logger'
import { createCommandRunner } from 'backend/commandRunner'
import type { CommandRunnerDeps } from 'backend/commandRunner'
import type { DownloadQueue } from 'backend/downloadmanager/downloadqueue'
import type { ManagerDeps, Stores } from 'backend/services/types'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  createTestManagerDeps,
  createTestServices,
  createTestStores
} from 'backend/testUtils/testServices'
import type { GameInfo, Runner } from 'common/types'
import type { Game } from 'common/types/game_manager'
import { createStoreManagers } from '..'
import GOGLibraryManager from '../gog/library'
import LegendaryLibraryManager from '../legendary/library'
import NileLibraryManager from '../nile/library'
import SideloadLibraryManager from '../sideload/library'
import SteamLibraryManager from '../steam/library'

const flush = () => new Promise((resolve) => setImmediate(resolve))
const RUNNERS: Runner[] = ['sideload', 'gog', 'legendary', 'nile', 'steam']

type Built = ReturnType<typeof createStoreManagers>

function build(over: Partial<Parameters<typeof createStoreManagers>[0]> = {}) {
  const fakes = createTestServices()
  return createStoreManagers({
    sendFrontendMessage: fakes.host.sendFrontendMessage,
    requestRustInvoke: fakes.host.requestRustInvoke,
    stores: fakes.stores,
    commandRunner: fakes.commandRunner,
    spawnAsync: fakes.spawnAsync,
    runner: fakes.runner,
    clock: fakes.clock,
    steamProcesses: fakes.steamProcesses,
    getDownloadQueue: () => fakes.downloadQueue,
    config: fakes.config,
    gameConfigs: fakes.gameConfigs,
    paths: fakes.paths,
    appInfo: fakes.appInfo,
    dialogs: fakes.host.dialogs,
    openExternal: fakes.host.openExternal,
    notifications: fakes.host.notifications,
    appState: fakes.host.appState,
    imageTools: fakes.host.imageTools,
    onlineMonitor: fakes.onlineMonitor,
    steamLaunchRuntime: fakes.steamLaunchRuntime,
    bridgeRuntime: fakes.bridgeRuntime,
    steamInstallRuntime: fakes.steamInstallRuntime,
    gogRuntime: fakes.gogRuntime,
    legendaryRuntime: fakes.legendaryRuntime,
    nileRuntime: fakes.nileRuntime,
    infoCaches: fakes.infoCaches,
    aborts: fakes.aborts,
    appRuntime: fakes.appRuntime,
    miscRuntime: fakes.miscRuntime,
    windowRaiser: fakes.windowRaiser,
    signIn: fakes.signInProbe,
    steamSession: fakes.steamSession,
    tokenStore: fakes.tokenStore,
    anonymousClient: fakes.anonymousClient,
    bridgeHelpers: fakes.bridgeHelpers,
    steamBottle: fakes.steamBottle,
    steamUser: fakes.steamUser,
    loginWindowSeam: fakes.loginWindowSeam,
    ...over
  })
}

const depsOf = (manager: unknown) => (manager as { deps: ManagerDeps }).deps

describe('createStoreManagers: late-bound map (RESEARCH Pattern B)', () => {
  beforeAll(() => {
    initHeadless()
  })

  it('builds all five runners and hands every manager the SAME map by reference', () => {
    const built: Built = build()
    expect(Object.keys(built.library).sort()).toEqual([...RUNNERS].sort())
    for (const runner of RUNNERS) {
      expect(depsOf(built.library[runner]).libraryManagers).toBe(built.library)
    }
    expect(built.launchHooks).toBeDefined()
    expect(typeof built.launcher.prepareLaunch).toBe('function')
  })

  it('managers reach the launcher that was built beside them', () => {
    const built = build()
    expect(depsOf(built.library.gog).launcher).toBe(built.launcher)
  })

  it('no constructor dereferences the map: getters that throw are never read', () => {
    const throwing = new Proxy(
      {},
      {
        get(_target, prop) {
          throw new Error(`constructor read libraryManagers.${String(prop)}`)
        }
      }
    ) as ManagerDeps['libraryManagers']
    const deps = createTestManagerDeps({ libraryManagers: throwing })
    expect(() => new SideloadLibraryManager(deps)).not.toThrow()
    expect(() => new GOGLibraryManager(deps)).not.toThrow()
    expect(() => new LegendaryLibraryManager(deps)).not.toThrow()
    expect(() => new NileLibraryManager(deps)).not.toThrow()
    expect(() => new SteamLibraryManager(deps)).not.toThrow()
  })

  it('a later sibling call resolves through the filled map', () => {
    const built = build()
    const gog = built.library.gog
    expect(depsOf(built.library.legendary).libraryManagers.gog).toBe(gog)
  })
})

describe('createStoreManagers: launch hooks read the injected stores', () => {
  it('legendary storeExpired is true when deps.stores.legendary says expired', () => {
    const legendaryStores = {
      legendaryConfigStore: {
        get_nodefault: (key: string) => key === 'expired'
      }
    } as unknown as Stores['legendary']
    const built = build({
      stores: createTestStores({ legendary: legendaryStores })
    })
    expect(built.launchHooks.legendary.storeExpired?.()).toBe(true)
  })

  it('not expired answers false', () => {
    const legendaryStores = {
      legendaryConfigStore: { get_nodefault: () => false }
    } as unknown as Stores['legendary']
    const built = build({
      stores: createTestStores({ legendary: legendaryStores })
    })
    expect(built.launchHooks.legendary.storeExpired?.()).toBe(false)
  })
})

describe('createStoreManagers: nothing is constructed at import (source gate)', () => {
  const read = (rel: string) =>
    stripSourceComments(readFileSync(join(__dirname, rel), 'utf-8'))

  it('storeManagers/index.ts has no top-level `new` and exports no table or hook record', () => {
    const src = read('../index.ts')
    expect(src).not.toMatch(/export const (libraryManagerMap|storeLaunchHooks)/)
    // Every `new` sits inside a function body (indented), never at column 0.
    expect(src).not.toMatch(/^(const|let|export const)[^\n]*\bnew\s/m)
    expect(src).toMatch(/export function createStoreManagers/)
  })

  it("the launcher reads the boot's one monitor: createLauncher and the managers get the same `deps.onlineMonitor` (87-63, F1)", () => {
    const src = read('../index.ts')
    // The launcher's offline answer for the engine step and the connectivity log lines the monitor writes must be one
    // object: a second monitor would keep a status of its own that no log line reports.
    const launcherCall = src.slice(src.indexOf('createLauncher({'))
    expect(launcherCall.slice(0, launcherCall.indexOf('})'))).toMatch(
      /onlineMonitor: deps\.onlineMonitor/
    )
    const managerDeps = src.slice(
      src.indexOf('const managerDeps'),
      src.indexOf('const launchHooks')
    )
    expect(managerDeps).toMatch(/onlineMonitor: deps\.onlineMonitor/)
    // No other value is ever given as a monitor (the type declaration is not a value).
    for (const given of src.match(/onlineMonitor: (?!ManagerDeps)[^\n,]+/g) ??
      []) {
      expect(given).toMatch(/onlineMonitor: deps\.onlineMonitor/)
    }
    expect(src).not.toMatch(/createOnlineMonitor/)
  })

  it('launcher.ts keeps no module-level `let` (the power blocker lives in the factory closure)', () => {
    const src = read('../../launcher.ts')
    const topLevelLets = src.split('\n').filter((line) => /^let\s/.test(line))
    // The two legacy command functions keep theirs until plan 24 deletes them.
    expect(topLevelLets.some((line) => /powerDisplayId/.test(line))).toBe(false)
    expect(src).toMatch(/export function createLauncher/)
  })
})

describe('createStoreManagers: autoUpdate reaches a queue created later (blocker 1)', () => {
  const gameInfo = {
    title: 'T',
    runner: 'sideload',
    install: { install_path: '/g', platform: 'windows' }
  } as unknown as GameInfo
  const fakeGame = (ignore: boolean) =>
    ({
      getSettings: async () => ({ ignoreGameUpdates: ignore }),
      getGameInfo: () => gameInfo,
      isGameAvailable: async () => true
    }) as unknown as Game

  it('never calls getDownloadQueue during construction, then enqueues into the later queue', async () => {
    const holder: {
      q?: Pick<DownloadQueue, 'addToQueue' | 'getQueueInformation'>
    } = {}
    const getDownloadQueue = jest.fn(() => holder.q as DownloadQueue)
    const built = build({ getDownloadQueue })
    expect(getDownloadQueue).toHaveBeenCalledTimes(0)

    const addToQueue = jest.fn().mockResolvedValue(undefined)
    holder.q = {
      addToQueue,
      getQueueInformation: () => ({ elements: [] }) as never
    }
    ;(built.library as Record<string, unknown>).sideload = {
      getGame: () => fakeGame(false)
    }

    built.autoUpdate('sideload', ['g1'])
    await flush()

    expect(getDownloadQueue).toHaveBeenCalledTimes(1)
    expect(addToQueue).toHaveBeenCalledTimes(1)
    const element = addToQueue.mock.calls[0]?.[0] as {
      params: { appName: string; unattended?: boolean }
      type: string
    }
    expect(element.params.appName).toBe('g1')
    expect(element.params.unattended).toBe(true)
    expect(element.type).toBe('update')
  })

  it('skips a game already in the queue, so a user-queued update stays attended (WR-03)', async () => {
    const addToQueue = jest.fn().mockResolvedValue(undefined)
    const built = build({
      getDownloadQueue: () =>
        ({
          addToQueue,
          getQueueInformation: () => ({
            elements: [{ params: { appName: 'g1', runner: 'sideload' } }]
          })
        }) as unknown as DownloadQueue
    })
    ;(built.library as Record<string, unknown>).sideload = {
      getGame: () => fakeGame(false)
    }
    built.autoUpdate('sideload', ['g1'])
    await flush()
    expect(addToQueue).not.toHaveBeenCalled()
  })

  it('never reads the queue for a game that ignores updates', async () => {
    const getDownloadQueue = jest.fn()
    const built = build({
      getDownloadQueue: getDownloadQueue as unknown as () => DownloadQueue
    })
    ;(built.library as Record<string, unknown>).sideload = {
      getGame: () => fakeGame(true)
    }
    built.autoUpdate('sideload', ['g1'])
    await flush()
    expect(getDownloadQueue).not.toHaveBeenCalled()
  })
})

describe('createStoreManagers: spawn and stop share one runner registry (checker warning 2, 88.2-22)', () => {
  it('legendary and nile stop paths end the Rust run with the spawn filter (88.2-22)', async () => {
    const sent: Array<[string, unknown[]]> = []
    const built = build({
      requestRustInvoke: ((channel: string, args: unknown[]) => {
        sent.push([channel, args])
        return Promise.resolve(1)
      }) as unknown as ManagerDeps['requestRustInvoke']
    })

    await built.library.legendary.getGame('app-l').stop(false)
    await built.library.nile.getGame('app-n').stop(false)

    expect(sent).toEqual([
      ['launch_tracked_kill', [{ runner: 'legendary', key: 'app-l' }]],
      ['launch_tracked_kill', [{ runner: 'nile', key: 'app-n' }]]
    ])
  })

  it('the sideload stop path kills the sideload and wine children for its id', async () => {
    const sent: Array<[string, unknown[]]> = []
    const spawnAsync = jest.fn(() =>
      Promise.resolve({ code: 0, stdout: '', stderr: '' })
    )
    const built = build({
      spawnAsync,
      requestRustInvoke: ((channel: string, args: unknown[]) => {
        // launchSettingsFor asks Rust for the effective settings before it stops wine.
        if (channel === 'engine_launch_settings_get')
          return Promise.resolve({
            wineVersion: { wineserver: '/nonexistent/wineserver' },
            winePrefix: '/nonexistent/prefix'
          })
        sent.push([channel, args])
        return Promise.resolve(1)
      }) as unknown as ManagerDeps['requestRustInvoke']
    })
    const game = built.library.sideload.getGame('app-s')
    jest.spyOn(game, 'getGameInfo').mockReturnValue({
      runner: 'sideload',
      app_name: 'app-s',
      install: { executable: '/games/s.exe' }
    } as unknown as GameInfo)
    jest.spyOn(game, 'isNative').mockReturnValue(false)
    jest.spyOn(game, 'getSettings').mockResolvedValue({
      // shutdownWine runs wineserver -k through the injected spawnAsync (faked here).
      wineVersion: { wineserver: '/nonexistent/wineserver' },
      winePrefix: '/nonexistent/prefix'
    } as never)

    await game.stop()

    expect(spawnAsync).toHaveBeenCalledWith(
      '/nonexistent/wineserver',
      ['-k'],
      expect.objectContaining({ timeout: 15_000 })
    )
    expect(sent).toEqual([
      ['launch_tracked_kill', [{ runner: 'sideload', key: 'app-s' }]],
      ['launch_tracked_kill', [{ runner: 'wine', key: 'app-s' }]]
    ])
  })

  it('the filter is the meta commandRunner tracks a spawn under (scripted run carries it)', async () => {
    const runner = createScriptedRunner([
      { cmd: 'legendary', result: { code: 0 } }
    ])
    const cr = createCommandRunner(commandRunnerDeps(runner))
    await cr.callRunner(
      ['launch', 'app-l'],
      { name: 'legendary', logPrefix: 'Legendary' as never, bin: 'legendary' },
      { abortId: 'app-l' }
    )
    const spawn = runner.calls.find((c) => c.method === 'run')
    expect((spawn?.opts as { track?: unknown }).track).toEqual({
      runner: 'legendary',
      key: 'app-l'
    })
  })
})

function commandRunnerDeps(
  runner: CommandRunnerDeps['runner']
): CommandRunnerDeps {
  return {
    runner,
    platform: process.platform,
    logger: {
      logInfo: () => undefined,
      logWarning: () => undefined,
      logError: () => undefined,
      logDebug: () => undefined,
      backendPrefix: 'Backend' as never
    },
    getRunnerLogWriter: () =>
      ({
        writeString: () => undefined,
        logInfo: async () => undefined
      }) as never,
    abort: {
      create: () => new AbortController(),
      remove: () => undefined
    },
    errorHandler: () => undefined,
    searchForExecutableOnPath: async () => null,
    commandToArgsArray: () => [],
    wine: {
      getDefaultSettings: () => ({}) as never,
      verifyWinePrefix: async () => ({ res: { stdout: '', stderr: '' } }),
      validWine: async () => true,
      setupEnvVars: async () => ({}),
      setupWineEnvVars: async () => ({}),
      isUmuSupported: async () => false,
      getUmuPath: async () => '/umu'
    }
  }
}
