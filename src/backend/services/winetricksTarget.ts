/**
 * The game a Winetricks call is about, as the Rust `TargetArg` takes it (Phase 87, 87-35, D-23).
 *
 * Which Wine environment a game's tools act on (its bottle or prefix, on which engine) is still decided by TypeScript:
 * `engine/toolSettings.ts` reads the game config, the live launch selection and the bottle markers, and a bottle-runtime
 * store (Steam) goes through the Steam resolver. This module is that decision's one entry for the Winetricks resolvers
 * of `sidecar/engineWineResolvers.ts`, which hand the answer to Rust as the target: `settings` when there is a usable
 * environment, `unavailable` with the resolver's reason word when there is not. It is the `resolveGameToolSettings` of
 * `tools/index.ts`, the TS tools' own caller of the same resolvers, so a game resolves to the same environment through
 * either; 87-37 deletes that module and this one stays until the config and the engine state it reads move (Phase 98).
 *
 * It never throws: a game the library does not know, or a resolver that fails, is logged and answers
 * `unavailable`, which Rust reads as "no usable Wine environment" and answers with the empty result the
 * TS handlers returned (a catalog read swallowed every error into an empty list).
 */
import type { GameSettings, Runner } from 'common/types'
import { hasCapability } from 'common/storeCapabilities'
import { resolveToolSettings } from 'backend/engine/toolSettings'
import { logError, LogPrefix } from 'backend/logger'
import {
  steamEngineServicesFrom,
  type EngineServicesSource
} from './engineServices'

/** What Rust's `TargetArg` takes: the game and exactly one of the tool settings or the reason there are none. */
export type WinetricksTarget =
  | { runner: Runner; appName: string; settings: GameSettings }
  | { runner: Runner; appName: string; unavailable: string }

/**
 * Resolves the target for `runner`/`appName`, rejecting when the library, the game config or a resolver fails.
 * `ensureBottle` is true when the call is a need that creates the bottle (an apply, a catalog read: a verb is a
 * need, and so is a wine command) and false for a read of the installed list, which never creates one. The
 * Winetricks resolvers use [`resolveWinetricksTarget`], which never rejects; a wine command on a game uses this one
 * (`services/gameCommandFacts.ts`), where the TS handler let a failure reach the renderer.
 */
export async function resolveToolTarget(
  source: EngineServicesSource,
  runner: Runner,
  appName: string,
  { ensureBottle }: { ensureBottle: boolean }
): Promise<WinetricksTarget> {
  if (hasCapability(runner, 'usesBottleRuntime')) {
    const { resolveSteamWineToolSettings } =
      await import('backend/storeManagers/steam/bridgeWineTools')
    const resolved = await resolveSteamWineToolSettings(
      steamEngineServicesFrom(source),
      appName
    )
    return resolved.kind === 'unavailable'
      ? { runner, appName, unavailable: resolved.reason }
      : { runner, appName, settings: resolved.settings }
  }
  const game = source.libraryManagers[runner].getGame(appName)
  const resolved = await resolveToolSettings(
    steamEngineServicesFrom(source),
    game,
    await game.getSettings(),
    { ensureBottle }
  )
  return resolved.kind === 'unavailable'
    ? { runner, appName, unavailable: resolved.reason }
    : { runner, appName, settings: resolved.settings }
}

/** [`resolveToolTarget`] that never rejects: a failure is logged and answers `unavailable` ("no-engine"). */
export async function resolveWinetricksTarget(
  source: EngineServicesSource,
  runner: Runner,
  appName: string,
  opts: { ensureBottle: boolean }
): Promise<WinetricksTarget> {
  try {
    return await resolveToolTarget(source, runner, appName, opts)
  } catch (error) {
    logError(
      [
        `Winetricks target for ${runner} ${appName} could not be resolved:`,
        error
      ],
      LogPrefix.WineTricks
    )
    return { runner, appName, unavailable: 'no-engine' }
  }
}
