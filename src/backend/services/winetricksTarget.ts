/**
 * The game a Winetricks call is about, as the Rust `TargetArg` takes it (Phase 87, 87-35, D-23).
 *
 * Which Wine environment a game's tools act on (its bottle or prefix, on which engine) is decided in Rust for a non-Steam
 * game (87-56a, D-23): `resolveEngineToolSettings` asks `engine_resolve_tool_settings`, which reads the live launch
 * selection and its overlay from Rust's own registry, so a tool during a live fallback-engine launch acts on the launch's
 * engine. A bottle-runtime store (Steam) goes through the Steam resolver. This module is that decision's one entry for the Winetricks resolvers
 * of `sidecar/engineWineResolvers.ts`, which hand the answer to Rust as the target: `settings` when there is a usable
 * environment, `unavailable` with the resolver's reason word when there is not. It was the `resolveGameToolSettings` of
 * the TS tools (deleted in 87-37), so a game resolves to the same environment it always did; this module stays until the
 * config and the engine state it reads move (Phase 98).
 *
 * It never throws: a game the library does not know, or a resolver that fails, is logged and answers
 * `unavailable`, which Rust reads as "no usable Wine environment" and answers with the empty result the
 * TS handlers returned (a catalog read swallowed every error into an empty list).
 */
import type { GameSettings, Runner } from 'common/types'
import { hasCapability } from 'common/storeCapabilities'
import type { ToolSettingsResult } from 'common/types/engine'
import { resolveEngineToolSettings } from 'backend/enginewine/toolSettings'
import { logError, LogPrefix } from 'backend/logger'
import type { EngineServicesSource } from './engineServices'

/** What Rust's `TargetArg` takes: the game and exactly one of the tool settings or the reason there are none. */
export type WinetricksTarget =
  | { runner: Runner; appName: string; settings: GameSettings }
  | { runner: Runner; appName: string; unavailable: string }

const UNAVAILABLE_REASONS: readonly string[] = [
  'bottle-not-created',
  'no-engine',
  'invalid-prefix',
  'not-own-bottle'
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Narrows what `engine_resolve_tool_settings` answered to a {@link ToolSettingsResult}. A reply that is not one of the
 * three shapes rejects, as a failure of the TS resolver did, so a caller never hands Rust a made-up environment.
 */
export function toolSettingsResultFrom(reply: unknown): ToolSettingsResult {
  if (isRecord(reply)) {
    if (reply.kind === 'stored' && isRecord(reply.settings)) {
      return {
        kind: 'stored',
        settings: reply.settings as unknown as GameSettings
      }
    }
    if (
      reply.kind === 'engine' &&
      typeof reply.key === 'string' &&
      isRecord(reply.settings)
    ) {
      return {
        kind: 'engine',
        key: reply.key,
        settings: reply.settings as unknown as GameSettings
      }
    }
    if (
      reply.kind === 'unavailable' &&
      typeof reply.reason === 'string' &&
      UNAVAILABLE_REASONS.includes(reply.reason)
    ) {
      return {
        kind: 'unavailable',
        reason: reply.reason as Extract<
          ToolSettingsResult,
          { kind: 'unavailable' }
        >['reason']
      }
    }
  }
  throw new Error('engine_resolve_tool_settings:unexpected-reply')
}

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
    const resolved = await resolveSteamWineToolSettings(source, appName)
    return resolved.kind === 'unavailable'
      ? { runner, appName, unavailable: resolved.reason }
      : { runner, appName, settings: resolved.settings }
  }
  const game = source.libraryManagers[runner].getGame(appName)
  const stored = await game.getSettings()
  // A native title never runs in Wine: its own settings, with no engine to ask.
  if (game.isNative()) return { runner, appName, settings: stored }
  const info = game.getGameInfo()
  // Rust decides from the live selection (the launch's engine) before the stored override (87-56a, D-23).
  const resolved = toolSettingsResultFrom(
    await resolveEngineToolSettings(
      { requestRustInvoke: source.requestRustInvoke },
      {
        runner: info.runner,
        appName: info.app_name,
        platform: info.install?.platform,
        stored,
        ensureBottle
      }
    )
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
