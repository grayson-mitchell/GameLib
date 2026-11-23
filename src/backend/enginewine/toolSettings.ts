import type { GameSettings, InstallPlatform, Runner } from 'common/types'
import {
  RUST_ENGINE_NON_CROSSOVER_ENGINE,
  RUST_ENGINE_RESOLVE_TOOL_SETTINGS
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The settings a Wine tool (Winetricks apply, its catalog and installed list, Run EXE in prefix) acts on for a game are
 * decided in Rust (Phase 87, `gamelib-engine` `tool_settings`, D-23): the stored override, the game's prefix, the bottle's
 * marker and, while a launch is live on a chosen engine, that launch's selection and its per-launch overlay, which only
 * Rust's registry holds. Each body is one returned typed call (D-06). The shim schedule in `engineWineShimSchedule.test.ts`
 * pins the shape and the phase that deletes each shim.
 */

/** What `engine_resolve_tool_settings` is asked: the game, its stored settings and whether the call creates the bottle. */
export interface EngineToolSettingsRequest {
  runner: Runner
  appName: string
  /** The install platform; `Browser` is never engine-controlled. */
  platform?: InstallPlatform
  /** The game's own stored settings (`game.getSettings()`). */
  stored: GameSettings
  /** True when the call is a need that creates a missing bottle (an apply, a catalog read, a wine command). */
  ensureBottle: boolean
}

/**
 * Resolves the settings a Wine tool acts on. Resolves the `ToolSettingsResult` JSON as an unknown (the caller narrows it).
 * Rejects with Rust's category word for an argument the crate refused (an unknown field, a wrong type).
 */
export async function resolveEngineToolSettings(
  deps: RustInvokeDeps,
  request: EngineToolSettingsRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_RESOLVE_TOOL_SETTINGS, [request])
}

/**
 * The built-in or Wine Manager engine an engine id runs on. Resolves the `NonCrossoverEngine` JSON, or `null` when it is
 * not installed, as an unknown (the caller narrows it). Rejects with Rust's category word for an argument it refused.
 */
export async function resolveNonCrossoverEngine(
  deps: RustInvokeDeps,
  request: { engineId: string }
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_NON_CROSSOVER_ENGINE, [request])
}
