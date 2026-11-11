/**
 * Engine channel registration (Phase 61 Plan 13, D-09/D-12/D-17).
 *
 * One store-agnostic domain replaces the three Steam-named engine channels.
 *
 *   invoke (ipcMain.handle, 5): getEngineState, listEngineOptions, getDefaultEngine,
 *     getPerGameBottleName, dismissEngineNotice
 *   push (sendFrontendMessage): engineStateChanged
 *
 * Renderer args[0] is passed UNCAST to the module guards (engineKeyFor / asNonSteamIdentity /
 * dismissEngineNotice's own closed-set checks); an invalid identity resolves null with no game
 * lookup (T-61-37). Payloads carry ids, labels and bottle names, never paths (T-61-38).
 * Steam games are dispatched to the Steam adapter by capability, not by runner literal.
 *
 * Registering installs a closure only: no I/O, timer or handle at register time (sidecar exit
 * contract).
 */
import type { GlobalConfigSlice } from 'backend/config'
import { hasCapability } from 'common/storeCapabilities'
import type { IpcRegistry } from './ipcRegistry'
import type {
  BootServices,
  StoreManagers,
  Stores
} from 'backend/services/types'
import { isMac } from '../constants/environment'
import {
  getDefaultEngine,
  getGameEngineState,
  getPerGameBottleNameFor,
  listGameEngineOptions
} from 'backend/engine/gameEngineState'
import { engineKeyFor } from 'backend/engine/gameKey'
import { wineManagerReleasesFrom } from 'backend/engine/wineManagerReleases'
import type { EngineServices } from 'backend/engine/engineServices'
import type { SteamEngineBottle } from 'backend/storeManagers/steam/bottle'

/** Narrow slice (66.1 D-01): only the library managers are read. */
export interface EngineFlowDeps {
  ipc: Pick<IpcRegistry, 'handle'>
  managers: Pick<StoreManagers, 'library'>
  stores: Pick<Stores, 'steam' | 'wineManager'>
  spawnAsync: BootServices['spawnAsync']
  /** The boot process runner (66.2); consumers converted by 66.2-03. */
  runner: BootServices['runner']
  /** The global config slice the engine reads its inherited settings from (66.3-06). */
  config: Pick<GlobalConfigSlice, 'getSettings'>
  /** The boot-owned engine state; its publisher is built by the 'engine-state' boot step (D-66.3-12). */
  engineState: EngineServices['engineState']
  /** The boot-owned engine runtime and path roots (66.4-05). */
  engineRuntime: EngineServices['engineRuntime']
  paths: EngineServices['paths']
  /** The Steam bottle slice the Steam engine state reads (66.3-15). */
  steamBottle: SteamEngineBottle['steamBottle']
}

function engineServicesOf(
  deps: EngineFlowDeps
): Pick<BootServices, 'spawnAsync'> &
  Pick<
    EngineServices,
    | 'runner'
    | 'wineManagerReleases'
    | 'globalSettings'
    | 'engineState'
    | 'engineRuntime'
    | 'paths'
  > {
  return {
    spawnAsync: deps.spawnAsync,
    engineState: deps.engineState,
    engineRuntime: deps.engineRuntime,
    paths: deps.paths,
    runner: deps.runner,
    wineManagerReleases: wineManagerReleasesFrom(deps),
    globalSettings: () =>
      deps.config.getSettings() as unknown as Record<string, unknown>
  }
}

async function getEngineStateFor(
  deps: EngineFlowDeps,
  arg: unknown
): Promise<unknown> {
  const library = deps.managers.library
  if (typeof arg !== 'object' || arg === null) return null
  const { runner, appName } = arg as Record<string, unknown>
  if (typeof runner !== 'string') return null
  if (engineKeyFor(runner, appName) === null) return null
  if (hasCapability(runner, 'usesBottleRuntime')) {
    const { getSteamEngineState } =
      await import('backend/storeManagers/steam/engine/steamEngineDeps')
    return getSteamEngineState(deps, appName)
  }
  if (!isMac) return null
  if (!Object.prototype.hasOwnProperty.call(library, runner)) {
    return null
  }
  try {
    const game = library[runner as keyof typeof library].getGame(
      appName as string
    )
    if (game.getGameInfo().install?.platform === 'Browser') return null
    if (game.isNative()) return null
  } catch {
    return null
  }
  return getGameEngineState(engineServicesOf(deps), arg)
}

/**
 * Registers the five engine invoke channels (`getEngineState`, `listEngineOptions`,
 * `getDefaultEngine`, `getPerGameBottleName`, `dismissEngineNotice`). Invoke channels use
 * `ipcMain.handle`; the `engineStateChanged` push is the boot-built engine state's publisher.
 */
export function registerEngineFlows(deps: EngineFlowDeps): void {
  deps.ipc.handle(
    'getEngineState',
    async (_event: unknown, ...args: unknown[]) =>
      getEngineStateFor(deps, args[0])
  )

  deps.ipc.handle(
    'listEngineOptions',
    async (_event: unknown, ...args: unknown[]) =>
      listGameEngineOptions(engineServicesOf(deps), args[0])
  )

  deps.ipc.handle('getDefaultEngine', () =>
    Promise.resolve(getDefaultEngine(engineServicesOf(deps)))
  )

  deps.ipc.handle(
    'getPerGameBottleName',
    (_event: unknown, ...args: unknown[]) =>
      Promise.resolve(getPerGameBottleNameFor(args[0]))
  )

  deps.ipc.handle(
    'dismissEngineNotice',
    async (_event: unknown, ...args: unknown[]) =>
      deps.engineState.dismissEngineNotice(args[0])
  )
}
