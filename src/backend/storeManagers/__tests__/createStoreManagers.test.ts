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
import { createRealRunner } from 'backend/testUtils/realRunner'
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
    engineState: fakes.engineState,
    engineRuntime: fakes.engineRuntime,
    steamLaunchRuntime: fakes.steamLaunchRuntime,
    bridgeRuntime: fakes.bridgeRuntime,
    steamInstallRuntime: fakes.steamInstallRuntime,
    gogRuntime: fakes.gogRuntime,
    legendaryRuntime: fakes.legendaryRuntime,
    nileRuntime: fakes.nileRuntime,
    infoCaches: fakes.infoCaches,
    aborts: fakes.aborts,
    windowRaiser: fakes.windowRaiser,
    signIn: fakes.signInProbe,
    steamSession: fakes.steamSession,
    tokenStore: fakes.tokenStore,
    anonymousClient: fakes.anonymousClient,
    bridgeHelpers: fakes.bridgeHelpers,
    steamBottle: fakes.steamBottle,
    steamUser: fakes.steamUser,
    loginWindowSeam: fakes.humble.loginWindowSeam,
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
  it('legendary resolveOfflineMode forces offline on when deps.stores.legendary says expired', () => {
    const legendaryStores = {
      legendaryConfigStore: {
        get_nodefault: (key: string) => key === 'expired'
      }
    } as unknown as Stores['legendary']
    const built = build({
      stores: createTestStores({ legendary: legendaryStores })
    })
    const input = {
      offlineMode: false,
      runner: 'legendary' as const,
      canRunOffline: true
    }
    expect(built.launchHooks.legendary.resolveOfflineMode?.(input)).toBe(true)
  })

  it('not expired leaves offline mode off', () => {
    const legendaryStores = {
      legendaryConfigStore: { get_nodefault: () => false }
    } as unknown as Stores['legendary']
    const built = build({
      stores: createTestStores({ legendary: legendaryStores })
    })
    expect(
      built.launchHooks.legendary.resolveOfflineMode?.({
        offlineMode: false,
        runner: 'legendary',
        canRunOffline: true
      })
    ).toBe(false)
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
    const holder: { q?: Pick<DownloadQueue, 'addToQueue'> } = {}
    const getDownloadQueue = jest.fn(() => holder.q as DownloadQueue)
    const built = build({ getDownloadQueue })
    expect(getDownloadQueue).toHaveBeenCalledTimes(0)

    const addToQueue = jest.fn().mockResolvedValue(undefined)
    holder.q = { addToQueue }
    ;(built.library as Record<string, unknown>).sideload = {
      getGame: () => fakeGame(false)
    }

    built.autoUpdate('sideload', ['g1'])
    await flush()

    expect(getDownloadQueue).toHaveBeenCalledTimes(1)
    expect(addToQueue).toHaveBeenCalledTimes(1)
    const element = addToQueue.mock.calls[0]?.[0] as {
      params: { appName: string }
      type: string
    }
    expect(element.params.appName).toBe('g1')
    expect(element.type).toBe('update')
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

describe('createStoreManagers: spawn and stop share one runner registry (checker warning 2)', () => {
  it('legendary and nile stop paths call killTracked on the injected runner with the spawn filter', async () => {
    const runner = createScriptedRunner([])
    const built = build({ runner })

    await built.library.legendary.getGame('app-l').stop(false)
    await built.library.nile.getGame('app-n').stop(false)

    const kills = runner.calls
      .filter((c) => c.method === 'killTracked')
      .map((c) => c.opts)
    expect(kills).toEqual([
      { runner: 'legendary', key: 'app-l' },
      { runner: 'nile', key: 'app-n' }
    ])
  })

  it('the sideload stop path kills the sideload and wine children for its id', async () => {
    const runner = createScriptedRunner([])
    const spawnAsync = jest.fn(() =>
      Promise.resolve({ code: 0, stdout: '', stderr: '' })
    )
    const built = build({ runner, spawnAsync })
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
    const kills = runner.calls
      .filter((c) => c.method === 'killTracked')
      .map((c) => c.opts)
    expect(kills).toEqual([
      { runner: 'sideload', key: 'app-s' },
      { runner: 'wine', key: 'app-s' }
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

  it('stop game: a real child killed through the managers reads as a cancellation, not an error', async () => {
    const real = createRealRunner()
    try {
      const cr = createCommandRunner(commandRunnerDeps(real.runner))
      const built = build({ runner: real.runner, commandRunner: cr })

      const pending = cr.callRunner(
        // appName is '' for nile (no launch verb), so trackKey carries the game id.
        ['-e', 'setTimeout(()=>{},10000)'],
        {
          name: 'nile',
          logPrefix: 'Nile' as never,
          bin: process.execPath
        },
        { abortId: 'unrelated-abort-id', trackKey: 'game-n' }
      )
      await new Promise((resolve) => setTimeout(resolve, 300))

      await built.library.nile.getGame('game-n').stop(false)
      const res = await pending

      expect(res.abort).toBe(true)
      expect(res.error).toBeUndefined()
    } finally {
      real.dispose()
    }
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
      setupEnvVars: () => ({}),
      setupWineEnvVars: () => ({}),
      isUmuSupported: async () => false,
      getUmuPath: async () => '/umu'
    }
  }
}
