import type { GameConfigs } from '../game_config'
import type { GlobalConfigSlice } from '../config'
import type { StatusUpdateDeps } from '../appRuntime'
import type { RustInvokeDeps } from '../host/rustInvokeDeps'
import type { StoreManagers } from 'backend/services/types'
import type { Runner, WineCommandArgs } from 'common/types'
import { hasCapability, isStore } from 'common/storeCapabilities'
import { sendGameStatusUpdate } from '../utils'
import { logDebug, logError, LogPrefix } from '../logger'
import { wineReleasesInfoReady } from '../enginewine/wineManager'
import { engineKeyFor } from '../enginewine/twin'
import type { SteamEngineFacts } from '../storeManagers/steam/engine/steamEngineDeps'
import {
  RUST_ENGINE_STATE_GET,
  RUST_WINE_DXVK_INSTALL_REMOVE,
  RUST_WINE_RUN_COMMAND,
  RUST_WINE_RUN_COMMAND_FOR_GAME,
  RUST_WINE_TOOL_CALL,
  RUST_WINE_WINETRICKS_APPLY,
  RUST_WINE_WINETRICKS_AVAILABLE,
  RUST_WINE_WINETRICKS_INSTALLED
} from 'common/types/sidecarTransport'
import type { GameCommandFacts } from '../services/gameCommandFacts'
import type { WinetricksTarget } from '../services/winetricksTarget'
import type { IpcRegistry } from './ipcRegistry'

/**
 * The scheduled resolvers of the engine and wine services (Phase 87, D-23).
 *
 * A resolver is the one shape a renderer-facing channel keeps in TypeScript once its work is Rust's: it
 * gathers the inputs only TypeScript holds (here the game's merged settings, which live in the sidecar's
 * game-config store) as `const` declarations, then makes exactly one typed `requestRustInvoke` call and
 * returns it. `engineWineShimSchedule.test.ts` pins that shape, its channel and the phase that deletes each
 * resolver (Phase 98, with the config and the stores it reads), so none can grow a second call or a branch.
 *
 * 87-34 lands the DXVK family: the renderer's three toggles. Every writer of a prefix's DXVK DLLs now runs
 * the one Rust op (`wine_dxvk_install_remove`): these toggles, the launcher's DXVK step and the still-TS
 * engine's `installRemove`, the last two through the `dxvkInstallRemove` shim (`enginewine/tools.ts`). The
 * Winetricks resolvers (87-35) and the wine-command resolvers (87-36: `runWineCommand`, `runWineCommandForGame`
 * and `callTool`) joined this file as their families flipped, so a family never had a TS and a Rust writer at
 * once (D-06). With 87-36 the wine tools cluster's own registration file is gone: every channel of it is native or
 * registered here, and `registerEngineWineResolvers` also holds the `releasesInfoReady` listener.
 *
 * The zod entries for every channel here stay: the sidecar still receives them as renderer invokes, and the
 * payloads (`{ appName, action }`, a command, a tool) are untrusted until the registry validates them.
 */

/** What a renderer DXVK toggle sends. */
export interface DxvkToggleArgs {
  appName: string
  action: 'backup' | 'restore'
}

/**
 * The slice the wine-command resolvers read, which the launcher's known-fix step builds too: the one Rust transport
 * and the facts about a game only TypeScript can read (`services/gameCommandFacts.ts`: the library, the game
 * configs, the Steam bottle markers). `pendingInstall` is the sideload "Run installer" that runs before the game is
 * in the library. It rejects when the library, the game config or a resolver fails.
 */
export interface WineCommandResolverDeps extends RustInvokeDeps {
  gameCommandFacts: (
    runner: Runner,
    appName: string,
    opts: { pendingInstall: boolean; tool?: boolean }
  ) => Promise<GameCommandFacts>
}

/** The slice every resolver of this file reads: the game configs and the one Rust transport. */
export interface EngineWineResolverDeps
  extends WineCommandResolverDeps, StatusUpdateDeps {
  ipc: Pick<IpcRegistry, 'handle'>
  /** The global settings `runWineCommand` fills a payload's absent `gameSettings` keys from. */
  config: Pick<GlobalConfigSlice, 'getSettings'>
  /** The GOG manager: the offline-installer check `callTool` runs after a tool. */
  managers: Pick<StoreManagers, 'library'>
  gameConfigs: Pick<GameConfigs, 'get'>
  /**
   * The Wine environment a game's Winetricks calls act on: the tool settings, or the reason there are none
   * (`services/winetricksTarget.ts`). `ensureBottle` is true when the call creates the bottle (an apply, a catalog
   * read) and false for a read of the installed list. It never rejects.
   */
  winetricksTarget: (
    runner: Runner,
    appName: string,
    opts: { ensureBottle: boolean }
  ) => Promise<WinetricksTarget>
  /**
   * The facts of a Steam title's engine state that only TypeScript holds (its install bottle, whether the override and
   * the Wine tools apply to it, its own bottle name), gathered by the Steam adapter (`steamEngineDeps.ts`) for an
   * app id that is digits.
   */
  steamEngineFacts: (appId: string) => Promise<SteamEngineFacts>
}

/** What a renderer Winetricks read sends: the game. */
export interface WinetricksGameArgs {
  runner: Runner
  appName: string
}

/**
 * The `toggleDXVK` channel: installs (`backup`) or removes (`restore`) DXVK in the game's prefix. Resolves
 * the boolean `installRemove` answered; rejects with Rust's category word when the install failed.
 */
export async function toggleDXVK(
  deps: EngineWineResolverDeps,
  { appName, action }: DxvkToggleArgs
): Promise<unknown> {
  const gameSettings = await deps.gameConfigs.get(appName).getSettings()
  return deps.requestRustInvoke(RUST_WINE_DXVK_INSTALL_REMOVE, [
    { settings: gameSettings, tool: 'dxvk', action }
  ])
}

/**
 * The `toggleDXVKNVAPI` channel: DXVK-NVAPI in the game's prefix. macOS refuses it before any file is
 * touched (the crate keeps the TS platform guard).
 */
export async function toggleDXVKNVAPI(
  deps: EngineWineResolverDeps,
  { appName, action }: DxvkToggleArgs
): Promise<unknown> {
  const gameSettings = await deps.gameConfigs.get(appName).getSettings()
  return deps.requestRustInvoke(RUST_WINE_DXVK_INSTALL_REMOVE, [
    { settings: gameSettings, tool: 'dxvk-nvapi', action }
  ])
}

/**
 * The `toggleVKD3D` channel: vkd3d-proton in the game's prefix. macOS permits `dxvk` only and the crate
 * excludes vkd3d there before any file I/O, as the TS did, so this registers on every platform and no
 * platform branch lives here.
 */
export async function toggleVKD3D(
  deps: EngineWineResolverDeps,
  { appName, action }: DxvkToggleArgs
): Promise<unknown> {
  const gameSettings = await deps.gameConfigs.get(appName).getSettings()
  return deps.requestRustInvoke(RUST_WINE_DXVK_INSTALL_REMOVE, [
    { settings: gameSettings, tool: 'vkd3d', action }
  ])
}

/**
 * The `winetricksApply` channel: applies the renderer's verbs to the game through the Rust apply queue. The Rust
 * op runs the apply guard (the verbs against the game's catalog) before any verb reaches an argv and answers at
 * once with the state or the refusal; the verbs install detached and the queue's events (`winetricksQueueChanged`,
 * `progressOfWinetricks`, `installing-winetricks-component`) are Rust's. The verbs travel as the renderer sent
 * them: the guard, not this resolver, judges their shape.
 */
export async function winetricksApply(
  deps: EngineWineResolverDeps,
  runner: Runner,
  appName: string,
  verbs: unknown
): Promise<unknown> {
  const target = await deps.winetricksTarget(runner, appName, {
    ensureBottle: true
  })
  return deps.requestRustInvoke(RUST_WINE_WINETRICKS_APPLY, [target, verbs])
}

/**
 * The `winetricksAvailable` channel: the components winetricks can install for the game (the visible ones). Resolves
 * the list the Rust catalog read answered, which is empty when the game has no usable Wine environment, as the TS
 * handler's swallow-and-return-empty did.
 */
export async function winetricksAvailable(
  deps: EngineWineResolverDeps,
  { runner, appName }: WinetricksGameArgs
): Promise<unknown> {
  const target = await deps.winetricksTarget(runner, appName, {
    ensureBottle: true
  })
  return deps.requestRustInvoke(RUST_WINE_WINETRICKS_AVAILABLE, [target])
}

/**
 * The `winetricksInstalled` channel: the lines of the game's `winetricks.log`. A read: it never creates a bottle, and
 * a game with no usable environment has none.
 */
export async function winetricksInstalled(
  deps: EngineWineResolverDeps,
  { runner, appName }: WinetricksGameArgs
): Promise<unknown> {
  const target = await deps.winetricksTarget(runner, appName, {
    ensureBottle: false
  })
  return deps.requestRustInvoke(RUST_WINE_WINETRICKS_INSTALLED, [target])
}

/** What a wine command on a game is: the game, the command as the caller sent it and how it runs. */
export interface WineCommandForGameArgs {
  runner: Runner
  appName: string
  /** Any JSON: the Rust shape guard judges it (non-empty strings, at most 256 of 4096 characters). */
  commandParts: unknown
  wait?: boolean
  protonVerb?: string
  startFolder?: string
  /** A sideload "Run installer" before the game is in the library (CR-04). */
  pendingInstall?: boolean
}

/**
 * The `runWineCommandForGame` channel, and the launcher's known-fix `runInPrefix` step: one wine command on a game,
 * in the game's own bottle. TypeScript gathers the facts only it holds (the game's tool settings and its library
 * entry, `gameCommandFacts`); the Rust op judges every guard (the command's shape, a Steam title without its own
 * bottle, a native game, no install path, a pending install of anything but a sideload) before any child starts,
 * spawns as a Helper, and answers the empty result with one log line when a guard refused.
 */
export async function runWineCommandForGame(
  deps: WineCommandResolverDeps,
  args: WineCommandForGameArgs
): Promise<unknown> {
  const facts = await deps.gameCommandFacts(args.runner, args.appName, {
    pendingInstall: args.pendingInstall === true
  })
  return deps.requestRustInvoke(RUST_WINE_RUN_COMMAND_FOR_GAME, [
    {
      ...facts,
      pendingInstall: args.pendingInstall,
      commandParts: args.commandParts,
      wait: args.wait,
      protonVerb: args.protonVerb,
      startFolder: args.startFolder
    }
  ])
}

/** What the renderer's `runWineCommand` sends: a `WineCommandArgs` minus the backend-internal `options` and `onSpawn`. */
export type RunWineCommandArgs = Omit<WineCommandArgs, 'options' | 'onSpawn'>

/**
 * The `runWineCommand` channel: one wine command in the prefix the caller's `gameSettings` name, the global settings
 * filling every key the payload leaves out (the payload's keys win). The Rust `wine_run_command` op checks the prefix,
 * builds the environment and spawns as a Helper; a command with no `gameSettings` goes through exactly as it came.
 */
export async function runWineCommand(
  deps: RustInvokeDeps & { config: Pick<GlobalConfigSlice, 'getSettings'> },
  args: RunWineCommandArgs
): Promise<unknown> {
  const command = args.gameSettings
    ? {
        ...args,
        gameSettings: { ...deps.config.getSettings(), ...args.gameSettings }
      }
    : args
  return deps.requestRustInvoke(RUST_WINE_RUN_COMMAND, [command])
}

/** What the renderer's Wine tool buttons send. */
export interface CallToolArgs {
  tool: 'winecfg' | 'runExe'
  exe?: string
  appName: string
  runner: Runner
}

/**
 * The `callTool` channel's wine command: `winecfg` or `runExe` on a game, `wait` false, through the same Rust guards as
 * a wine command on a game. What the TS handler did after it (the GOG offline-installer check, the library push and
 * the final `done` status) is the registration's, below, in the TS order.
 */
export async function callTool(
  deps: WineCommandResolverDeps,
  { tool, exe, appName, runner }: CallToolArgs
): Promise<unknown> {
  const facts = await deps.gameCommandFacts(runner, appName, {
    pendingInstall: false,
    tool: true
  })
  return deps.requestRustInvoke(RUST_WINE_TOOL_CALL, [{ ...facts, tool, exe }])
}

/**
 * What `getEngineState` sends Rust: the game, or `identity: null` when TypeScript knows the game has no engine state, and
 * a bottle-runtime title's facts. The renderer's argument is untrusted and arrives uncast: anything that is not a
 * `{runner, appName}` of two strings with a valid engine key is a null identity, a title of a bottle-runtime store must
 * have an app id of digits, and a non-Steam game is looked up in the library only to refuse a native game and a Browser
 * install (the facts TypeScript alone holds; Rust refuses a host that is not macOS and derives the rest from the stored
 * settings). Never throws: a failing library lookup is a game with no state.
 */
async function engineStateRequest(
  deps: Pick<EngineWineResolverDeps, 'managers' | 'steamEngineFacts'>,
  arg: unknown
): Promise<{
  identity: { runner: string; appName: string } | null
  facts?: SteamEngineFacts
}> {
  if (typeof arg !== 'object' || arg === null) return { identity: null }
  const { runner, appName } = arg as Record<string, unknown>
  if (typeof runner !== 'string' || typeof appName !== 'string') {
    return { identity: null }
  }
  if (engineKeyFor(runner, appName) === null) return { identity: null }
  if (hasCapability(runner, 'usesBottleRuntime')) {
    if (!/^\d+$/.test(appName)) return { identity: null }
    return {
      identity: { runner, appName },
      facts: await deps.steamEngineFacts(appName)
    }
  }
  const library = deps.managers.library
  if (!Object.prototype.hasOwnProperty.call(library, runner)) {
    return { identity: null }
  }
  try {
    const game = library[runner as keyof typeof library].getGame(appName)
    if (game.getGameInfo().install?.platform === 'Browser') {
      return { identity: null }
    }
    if (game.isNative()) return { identity: null }
  } catch {
    return { identity: null }
  }
  return { identity: { runner, appName } }
}

/**
 * The `getEngineState` channel: the per-title engine state the game page and the badge read (the same state the Rust
 * launch step records, D-06), or `null` for a game with none. TypeScript gathers only what it alone holds (the library's
 * native and Browser facts, a Steam title's bridge facts), as a request value, and makes the one typed call; Rust derives
 * the rest and decides.
 */
export async function getEngineState(
  deps: Pick<
    EngineWineResolverDeps,
    'managers' | 'steamEngineFacts' | 'requestRustInvoke'
  >,
  arg: unknown
): Promise<unknown> {
  const request = await engineStateRequest(deps, arg)
  return deps.requestRustInvoke(RUST_ENGINE_STATE_GET, [request])
}

/**
 * Registers every channel this file resolves, once per boot, from `handlers.ts` (pinned by
 * `registrationOncePerBoot.test.ts`). Every channel of the wine tools cluster is registered
 * here, or native, and the cluster's own registration file is gone (87-36): a channel has one owner (D-06).
 */
export function registerEngineWineResolvers(
  deps: EngineWineResolverDeps
): void {
  deps.ipc.handle('toggleDXVK', (_event: unknown, ...args: unknown[]) =>
    toggleDXVK(deps, args[0] as DxvkToggleArgs)
  )
  deps.ipc.handle('toggleDXVKNVAPI', (_event: unknown, ...args: unknown[]) =>
    toggleDXVKNVAPI(deps, args[0] as DxvkToggleArgs)
  )
  deps.ipc.handle('toggleVKD3D', (_event: unknown, ...args: unknown[]) =>
    toggleVKD3D(deps, args[0] as DxvkToggleArgs)
  )
  deps.ipc.handle('winetricksApply', (_event: unknown, ...args: unknown[]) =>
    winetricksApply(deps, args[0] as Runner, args[1] as string, args[2])
  )
  deps.ipc.handle(
    'winetricksAvailable',
    (_event: unknown, ...args: unknown[]) =>
      winetricksAvailable(deps, {
        runner: args[0] as Runner,
        appName: args[1] as string
      })
  )
  deps.ipc.handle(
    'winetricksInstalled',
    (_event: unknown, ...args: unknown[]) =>
      winetricksInstalled(deps, {
        runner: args[0] as Runner,
        appName: args[1] as string
      })
  )
  deps.ipc.handle('getEngineState', (_event: unknown, ...args: unknown[]) =>
    getEngineState(deps, args[0])
  )
  // The renderer's wine command on a game runs `wait: false` with `runinprefix`, as the TS handler did; only a
  // pending install (Run installer) carries the caller's `wait`. The Rust op forces `runinprefix` for it too.
  deps.ipc.handle(
    'runWineCommandForGame',
    (_event: unknown, ...args: unknown[]) => {
      const { appName, commandParts, runner, wait, pendingInstall } =
        args[0] as {
          appName: string
          commandParts: unknown
          runner: Runner
          wait?: unknown
          pendingInstall?: unknown
        }
      return runWineCommandForGame(deps, {
        runner,
        appName,
        commandParts,
        wait: pendingInstall === true && wait === true,
        protonVerb: 'runinprefix',
        pendingInstall: pendingInstall === true
      })
    }
  )
  deps.ipc.handle('runWineCommand', (_event: unknown, ...args: unknown[]) =>
    runWineCommand(deps, args[0] as RunWineCommandArgs)
  )
  // `callTool` is void: the Rust call, then the GOG offline-installer check (a modified install is pushed to the
  // library) and the `done` status, which the TS handler ran in this order after its wine command.
  deps.ipc.handle('callTool', async (_event: unknown, ...args: unknown[]) => {
    const toolArgs = args[0] as CallToolArgs
    await callTool(deps, toolArgs)
    const { appName, runner } = toolArgs
    if (isStore(runner, 'gog')) {
      // Check if game was modified by offline installer / wine uninstaller
      await deps.managers.library['gog'].checkForOfflineInstallerChanges(
        appName
      )
      const maybeNewGameInfo = deps.managers.library['gog'].getGameInfo(appName)
      if (maybeNewGameInfo) {
        deps.sendFrontendMessage('pushGameToLibrary', maybeNewGameInfo)
      }
    }
    sendGameStatusUpdate(deps, { appName, runner, status: 'done' })
  })
  // A `releasesInfoReady` event (a wine-release refresh finished) checks the stored lists: a backend event, not an
  // IPC channel, and the sidecar has no other init path that subscribes, so omitting it would silently drop the wine
  // list refresh with nothing failing (T-34.5-16). The check runs in Rust (`wine_releases_info_ready`, 87-20, D-15); a
  // rejected call (the shell refused it, or the transport failed) is logged, never an unhandled rejection.
  deps.appRuntime.events.on('releasesInfoReady', (releasesInfo) => {
    logDebug('Releases info ready, checking wine releases', LogPrefix.Backend)
    wineReleasesInfoReady(deps, releasesInfo).catch((error: unknown) =>
      logError(['Wine releases check failed', error], LogPrefix.WineDownloader)
    )
  })
}
