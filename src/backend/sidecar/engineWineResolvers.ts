import type { GameConfigs } from '../game_config'
import type { RustInvokeDeps } from '../host/rustInvokeDeps'
import type { Runner } from 'common/types'
import {
  RUST_WINE_DXVK_INSTALL_REMOVE,
  RUST_WINE_RUN_COMMAND_FOR_GAME,
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
 * Winetricks resolvers (87-35) and the wine-command resolvers (87-36) join this file as their families
 * flip, so a family never has a TS and a Rust writer at once (D-06).
 *
 * The zod entries for `toggleDXVK`, `toggleDXVKNVAPI` and `toggleVKD3D` stay: the sidecar still receives
 * these three as renderer invokes, and `{ appName, action }` is untrusted until the registry validates it.
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
    opts: { pendingInstall: boolean }
  ) => Promise<GameCommandFacts>
}

/** The slice every resolver of this file reads: the game configs and the one Rust transport. */
export interface EngineWineResolverDeps extends WineCommandResolverDeps {
  ipc: Pick<IpcRegistry, 'handle'>
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

/**
 * Registers every channel this file resolves, once per boot, from `handlers.ts` (pinned by
 * `registrationOncePerBoot.test.ts`). A channel is registered here or in `wineToolsFlowRegistration.ts`,
 * never both: the family moves in one commit.
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
}
