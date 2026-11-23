/**
 * The TS twins of the engine configuration's non-bridge pure helpers (Phase 87, D-24 extended, 87-28).
 *
 * `gamelib-engine` owns these in Rust (`key::engine_key_for`, `config::is_writable_engine_override`,
 * `config::import_engine_settings`, `game_engine::per_game_bottle_name_for` and
 * `game_engine::per_game_bottle_name`). They stay here because TS callers still run them synchronously:
 * the launch paths (`launcher.ts` and the five `games.ts`, until Phase 92 moves them to Rust) and the
 * settings and install flows' engine-override validation (until Phase 98 moves the config). A synchronous
 * call cannot become an async `requestRustInvoke` shim without rewriting those callers, so the helpers
 * live in this one file, once (never a second TS copy), and `twinVectors.test.ts` replays the shared
 * `engine_twin.json` vectors against it while `twin_vectors.rs` replays the same file against Rust.
 *
 * Deleting phases (the schedule in `engineWineShimSchedule.test.ts`): `engineKeyFor` goes with its launch
 * callers in Phase 92; `isWritableEngineOverride`, `importEngineSettings` and `getPerGameBottleNameFor` go
 * with the settings and install flows in Phase 98. `perGameBottleName` is the naming rule the two bottle
 * functions share; it is exported only because the engine TS that is still alive in Phase 87 (`gamePrefix`,
 * `launchEngine`, `gameEngineState`, through `perGameBottle.ts`) calls it, so it is an intra-phase row
 * (`deletedBy: 87`) and 87-56 makes it private when that TS goes.
 *
 * The grammar of an engine override id and the Steam / clean-name rules are imported, not copied: they
 * stay in `engine/engineIds.ts` and `engine/gameKey.ts` until the same deletion.
 */
import { createHash } from 'crypto'
import { hasCapability } from 'common/storeCapabilities'
import { sanitizeBottleName } from 'backend/engine/bottlePrimitives'
import { parseEngineOverride } from 'backend/engine/engineIds'
import type { EngineOverrideId } from 'backend/engine/engineIds'
import {
  isCleanAppName,
  isKnownRunner,
  STEAM_APP_ID_RE
} from 'backend/engine/gameKey'
import type { EngineKey } from 'backend/engine/gameKey'

const PER_GAME_BOTTLE_NAME_MAX = 64
const BOTTLE_PREFIX = 'GameLib'
const HASH_HEX = 10

/** `${runner}:${appName}`, or the bare app id for a store whose app name is a Steam app id. */
export function engineKeyFor(
  runner: string,
  appName: unknown
): EngineKey | null {
  if (!isKnownRunner(runner) || !isCleanAppName(appName)) return null
  if (hasCapability(runner, 'appNameIsSteamAppId')) {
    return STEAM_APP_ID_RE.test(appName) ? appName : null
  }
  return `${runner}:${appName}`
}

/** True only for a value that survives the closed grammar unchanged. */
export function isWritableEngineOverride(v: unknown): v is EngineOverrideId {
  return typeof v === 'string' && parseEngineOverride(v) === v
}

/**
 * Keeps `[A-Za-z0-9-]` and writes every other byte of the UTF-8 appName as `_xx` (lower-case hex), which
 * is injective. A lone `.` is kept (Amazon ids carry them); a dot inside a run of dots is escaped so `..`
 * can never appear.
 */
function encodeAppName(appName: string): string {
  const bytes = Buffer.from(appName, 'utf8')
  let out = ''
  for (const [i, b] of bytes.entries()) {
    const ch = String.fromCharCode(b)
    const dotInRun =
      b === 0x2e && (bytes[i - 1] === 0x2e || bytes[i + 1] === 0x2e)
    if (/[A-Za-z0-9-]/.test(ch) || (b === 0x2e && !dotInRun)) {
      out += ch
    } else {
      out += `_${b.toString(16).padStart(2, '0')}`
    }
  }
  return out
}

/**
 * The deterministic per-game bottle name `GameLib-<runner>-<encoded appName>`, cut at 64 characters and
 * suffixed `-<first 10 hex of sha256(runner:appName)>`; null for an unknown runner, an unclean appName or
 * a name that does not survive `sanitizeBottleName`. Spike 068 accepted names up to 120 characters; the
 * cap is held at 64 so every id real stores produce stays whole.
 */
export function perGameBottleName(
  runner: string,
  appName: string
): string | null {
  if (engineKeyFor(runner, appName) === null) return null
  let name = `${BOTTLE_PREFIX}-${runner}-${encodeAppName(appName)}`
  if (name.length > PER_GAME_BOTTLE_NAME_MAX) {
    const digest = createHash('sha256')
      .update(`${runner}:${appName}`)
      .digest('hex')
      .slice(0, HASH_HEX)
    const keep = PER_GAME_BOTTLE_NAME_MAX - HASH_HEX - 1
    name = `${name.slice(0, keep)}-${digest}`
  }
  return sanitizeBottleName(name) === name ? name : null
}

/**
 * The per-game bottle name for the install dialogs (D-17), or null for an invalid or bottle-runtime (Steam)
 * game. Anything that is no `{ runner, appName }` of two strings is null, never an error.
 */
export function getPerGameBottleNameFor(args: unknown): string | null {
  if (typeof args !== 'object' || args === null) return null
  const { runner, appName } = args as Record<string, unknown>
  if (typeof runner !== 'string' || typeof appName !== 'string') return null
  if (engineKeyFor(runner, appName) === null) return null
  if (hasCapability(runner, 'usesBottleRuntime')) return null
  return perGameBottleName(runner, appName)
}

/**
 * Phase 61 D-17, T-61-58, T-61-59: the settings an engine-choice import adds to a game's config. Returns
 * null when the renderer sent no writable engine id (the caller then keeps the Wine prefix/version path).
 * The bottle name is computed here; a renderer-sent name is never trusted.
 */
export function importEngineSettings(args: {
  runner: string
  appName: string
  engineOverride?: unknown
}): { engineOverride: string; wineCrossoverBottle?: string } | null {
  const { runner, appName, engineOverride } = args
  if (!isWritableEngineOverride(engineOverride)) return null
  const bottle = getPerGameBottleNameFor({ runner, appName })
  return {
    engineOverride,
    ...(bottle ? { wineCrossoverBottle: bottle } : {})
  }
}
