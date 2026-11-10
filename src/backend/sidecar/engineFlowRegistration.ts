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
import { hasCapability } from 'common/storeCapabilities'
import { ipcMain } from '../platform'
import type { StoreManagers } from 'backend/services/types'
import { isMac } from '../constants/environment'
import { sendFrontendMessage } from '../ipc'
import {
  dismissEngineNotice,
  setEngineStatePublisher
} from 'backend/engine/engineState'
import {
  getDefaultEngine,
  getGameEngineState,
  getPerGameBottleNameFor,
  listGameEngineOptions
} from 'backend/engine/gameEngineState'
import { engineKeyFor } from 'backend/engine/gameKey'

/** Narrow slice (66.1 D-01): only the library managers are read. */
export interface EngineFlowDeps {
  managers: Pick<StoreManagers, 'library'>
}

async function getEngineStateFor(
  deps: EngineFlowDeps,
  arg: unknown
): Promise<unknown> {
  const libraryManagerMap = deps.managers.library
  if (typeof arg !== 'object' || arg === null) return null
  const { runner, appName } = arg as Record<string, unknown>
  if (typeof runner !== 'string') return null
  if (engineKeyFor(runner, appName) === null) return null
  if (hasCapability(runner, 'usesBottleRuntime')) {
    const { getSteamEngineState } =
      await import('backend/storeManagers/steam/engine/steamEngineDeps')
    return getSteamEngineState(appName)
  }
  if (!isMac) return null
  if (!Object.prototype.hasOwnProperty.call(libraryManagerMap, runner)) {
    return null
  }
  try {
    const game = libraryManagerMap[
      runner as keyof typeof libraryManagerMap
    ].getGame(appName as string)
    if (game.getGameInfo().install?.platform === 'Browser') return null
    if (game.isNative()) return null
  } catch {
    return null
  }
  return getGameEngineState(arg)
}

/**
 * Registers the five engine invoke channels (`getEngineState`, `listEngineOptions`,
 * `getDefaultEngine`, `getPerGameBottleName`, `dismissEngineNotice`) and installs the
 * `engineStateChanged` publisher. Invoke channels use `ipcMain.handle`; the push is not a channel.
 */
export function registerEngineFlows(deps: EngineFlowDeps): void {
  ipcMain.handle(
    'getEngineState',
    async (_event: unknown, ...args: unknown[]) =>
      getEngineStateFor(deps, args[0])
  )

  ipcMain.handle(
    'listEngineOptions',
    async (_event: unknown, ...args: unknown[]) =>
      listGameEngineOptions(args[0])
  )

  ipcMain.handle('getDefaultEngine', () => Promise.resolve(getDefaultEngine()))

  ipcMain.handle(
    'getPerGameBottleName',
    (_event: unknown, ...args: unknown[]) =>
      Promise.resolve(getPerGameBottleNameFor(args[0]))
  )

  ipcMain.handle(
    'dismissEngineNotice',
    async (_event: unknown, ...args: unknown[]) => dismissEngineNotice(args[0])
  )

  setEngineStatePublisher((state) =>
    sendFrontendMessage('engineStateChanged', state)
  )
}
