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
 *
 * 87-39 (D-24) adds the bridge's sync bottle helpers: `getBottleDir`, `sanitizeBottleName`,
 * `isBottleProvisioned`, `buildFallbackGameSettings`, the three read-only marker views, `isPinnedEngineInstalled`
 * and the pinned-engine table (`ENGINE_PINS`, `pinById`, now read from `common/enginePins.json`, the file
 * the Rust crate reads too). The Rust owners are `bottles::paths`, `bottles::marker`, `bottles::pin_marker`,
 * `engines::is_pinned_engine_installed` and `tool_settings::build_fallback_game_settings`; the shared
 * `bottle_twin.json` vectors pin the two sides (`twinVectors.test.ts` here, `twin_vectors.rs` in Rust). They
 * stay synchronous because the launch path and the bridge still call them inline; `bottlePrimitives.ts`,
 * `engineSwitch.ts`, `fallbackEngine.ts` and `enginePins.ts` re-export them so no caller changes until 87-43
 * repoints them and deletes the re-exporting modules. The helpers the still-TS marker writers and the
 * pinned-engine installer share with the readers (`readEngineMarker`, `hasStagingDxvk`,
 * `isContradictedCrossover`, `isInside`, `pinMarkerMatches`, `pinnedEnginePaths`) are intra-phase rows
 * (`deletedBy: 87`): 87-56 deletes their callers and makes them private, as with `perGameBottleName`.
 */
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { existsSync as gracefulExistsSync } from 'graceful-fs'
import { basename, isAbsolute, join, relative, resolve } from 'path'
import enginePinsTable from 'common/enginePins.json'
import { hasCapability } from 'common/storeCapabilities'
import type { GameSettings } from 'common/types'
import type { AppPaths } from 'backend/process/context'
import type { EnginePin, PinnedArtifact } from 'backend/engine/enginePins'
import type { NonCrossoverEngine } from 'backend/engine/engineTypes'
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

/**
 * The pinned fallback engine table (phase 59, D-08 release lever), read from `common/enginePins.json`: the one
 * file the Rust crate (`pins.rs`) reads too, so the two sides cannot name different builds. `enginePins.test.ts`
 * pins the JSON field for field. `previous` is null: no earlier GameLib release shipped a pin.
 */
export const ENGINE_PINS: Readonly<{
  current: EnginePin
  previous: EnginePin | null
}> = enginePinsTable

/** The pin with this id (current, then previous), or null. */
export function pinById(id: string): EnginePin | null {
  if (typeof id !== 'string') return null
  if (id === ENGINE_PINS.current.id) return ENGINE_PINS.current
  if (ENGINE_PINS.previous && id === ENGINE_PINS.previous.id)
    return ENGINE_PINS.previous
  return null
}

/**
 * Directory of a named CrossOver bottle.
 * `<userHome>/Library/Application Support/CrossOver/Bottles/<bottleName>`
 */
export function getBottleDir(
  paths: Pick<AppPaths, 'userHome'>,
  bottleName: string
): string {
  return join(
    paths.userHome,
    'Library/Application Support/CrossOver/Bottles',
    bottleName
  )
}

/**
 * T-17-01 mitigation chokepoint: every bottle-name -> path/argv site must
 * pass the name through this guard first. Mirrors buildSteamProtocolUrl's
 * numeric-guard precedent (T-03-01). Rejects any name containing a path
 * separator, a parent-directory traversal sequence, a NUL byte, or an
 * empty/whitespace-only name. Returns the trimmed name when clean.
 */
export function sanitizeBottleName(name: string | null): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (!trimmed) return null
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..') ||
    trimmed.includes('\0')
  ) {
    return null
  }
  return trimmed
}

/**
 * Reuses the launcher.ts:828-836 cxbottle.conf existence predicate (the
 * existing CrossOver bottle-exists gate) as the provisioned-state signal.
 * `bottleName` is required; the Steam stored-name default lives in
 * isSteamBottleProvisioned (steam/bottle.ts).
 *
 * NOTE: this retains its narrow, original meaning — "the bottle directory
 * has been created" — NOT "the bottle is ready to use". A bottle can have
 * cxbottle.conf on disk while the bottled Steam.exe install never completed
 * (half-provisioned, e.g. the SteamSetup.exe download failed). Used by
 * provisionBottle() to decide whether `cxbottle --create` needs to run again
 * (re-entrancy check). For the REAL completion signal, use isBottleReady().
 */
export function isBottleProvisioned(
  paths: Pick<AppPaths, 'userHome'>,
  bottleName: string
): boolean {
  return gracefulExistsSync(
    join(getBottleDir(paths, bottleName), 'cxbottle.conf')
  )
}

const FALLBACK_STRIPPED_ENV_KEYS: readonly string[] = Object.freeze([
  'USER',
  'WINEPREFIX',
  'CX_BOTTLE',
  'CX_ROOT',
  'WINELOADER',
  'WINESERVER',
  'WINEDEBUG',
  'MVK_CONFIG_LOG_LEVEL'
])

/**
 * Phase 59 (D-01): GameSettings that run a bottle on a non-CrossOver engine
 * (pinned fallback or Wine Manager override). Takes a bottle name, not an
 * appId, so bottle creation (59-06) can use it too. DXVK is managed by the
 * engine switch, never by the generic auto-install.
 */
export function buildFallbackGameSettings(
  paths: Pick<AppPaths, 'userHome'>,
  bottleName: string,
  engine: NonCrossoverEngine,
  base: GameSettings
): GameSettings {
  // Phase 61: a non-Steam launch passes the game's own stored settings so its launcher args,
  // target exe and environment survive; Steam passes the global settings (66.3-06: the caller
  // reads them from its config slice).
  const globalSettings = base
  const kept = (globalSettings.enviromentOptions ?? []).filter(
    (e) => !FALLBACK_STRIPPED_ENV_KEYS.includes(String(e.key).toUpperCase())
  )
  return {
    ...globalSettings,
    wineCrossoverBottle: bottleName,
    winePrefix: getBottleDir(paths, bottleName),
    wineVersion: {
      type: 'wine',
      bin: engine.wineBin,
      name: engine.label,
      wineserver: engine.wineserverBin
    },
    autoInstallDxvk: false,
    autoInstallDxvkNvapi: false,
    autoInstallVkd3d: false,
    enviromentOptions: [
      ...kept,
      // Wine-Staging takes its profile name from USER; USER keeps C:\users\crossover.
      { key: 'USER', value: 'crossover' },
      { key: 'WINEDEBUG', value: '-all' },
      { key: 'MVK_CONFIG_LOG_LEVEL', value: '0' }
    ]
  }
}

/** `<bottle>/.gamelib-engine.json`: what the still-TS writer in `engineSwitch.ts` names `ENGINE_MARKER_FILE`. */
const ENGINE_MARKER_FILE = '.gamelib-engine.json'
const DXVK_VERSION_FILE = 'current_dxvk-macOS'
const PIN_MARKER_FILE = '.gamelib-pin.json'

export type MarkerKind = 'crossover' | 'pinned' | 'wine-manager'
export type MarkerDxvk = { dir: string; version: string } | 'failed'
export type EngineMarker = {
  kind: MarkerKind
  id: string
  wineserverBin: string
  /** Installed DXVK, or 'failed' when a switch handed the bottle over but DXVK did not install. */
  dxvk?: MarkerDxvk
}

/** What the read-only marker views need: the bottles' home, and the pinned-engine owner's two answers. */
export interface BottleReadContext {
  paths: Pick<AppPaths, 'userHome'>
  fallback: {
    pinnedEngineRoot: () => string
    isPinnedEngineInstalled: (pin: EnginePin) => boolean
  }
}

/** True when `path` is absolute and strictly below `root` (resolved lexically, so `..` cannot escape). */
export function isInside(root: string, path: string): boolean {
  if (!isAbsolute(path)) return false
  const rel = relative(resolve(root), resolve(path))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * The bottle's engine marker as the file holds it, validated (kind, id token, wineserver string, and a
 * DXVK dir that must sit inside the pinned-engine root: T-59-60, a hand-edited dir must not steer the DLL
 * removal list elsewhere). Null for an absent or unreadable marker.
 */
export function readEngineMarker(
  bottleDir: string,
  ctx: Pick<BottleReadContext, 'fallback'>
): EngineMarker | null {
  try {
    const raw = JSON.parse(
      readFileSync(join(bottleDir, ENGINE_MARKER_FILE), 'utf8')
    ) as Partial<EngineMarker>
    const kinds: MarkerKind[] = ['crossover', 'pinned', 'wine-manager']
    if (
      !raw ||
      !kinds.includes(raw.kind as MarkerKind) ||
      typeof raw.id !== 'string' ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(raw.id) ||
      typeof raw.wineserverBin !== 'string'
    ) {
      return null
    }
    const out: EngineMarker = {
      kind: raw.kind as MarkerKind,
      id: raw.id,
      wineserverBin: raw.wineserverBin
    }
    const d: unknown = raw.dxvk
    if (d === 'failed') {
      out.dxvk = 'failed'
    } else if (d && typeof d === 'object') {
      const { dir, version } = d as { dir?: unknown; version?: unknown }
      if (
        typeof dir === 'string' &&
        isInside(ctx.fallback.pinnedEngineRoot(), dir) &&
        typeof version === 'string' &&
        /^[A-Za-z0-9._-]{1,64}$/.test(version)
      ) {
        out.dxvk = { dir, version }
      }
    }
    return out
  } catch {
    return null
  }
}

/**
 * DXVK-macOS (`current_dxvk-macOS`) is installed only by non-CrossOver paths (createFallbackBottle,
 * the switch's installNextDxvk, launcher autoInstallDxvk gated on a non-CrossOver wine), and every
 * switch to CrossOver removes it. A bottle that carries it was set up by a non-CrossOver engine
 * (76-VERIFICATION CR-01).
 */
export function hasStagingDxvk(bottleDir: string): boolean {
  return existsSync(join(bottleDir, DXVK_VERSION_FILE))
}

/** A crossover marker contradicted by DXVK-macOS in the bottle (76 CR-01). */
export function isContradictedCrossover(
  bottleDir: string,
  marker: EngineMarker | null
): boolean {
  return marker?.kind === 'crossover' && hasStagingDxvk(bottleDir)
}

/**
 * 76 review WR-01: the marker as the switch sees it, for the read-only views, without logging.
 * A contradicted crossover marker reads as the pinned marker inferMarker would give (DXVK-macOS
 * always infers the current pin). Its wineserver is left empty: the views never use it to act.
 */
function viewMarker(
  bottleDir: string,
  ctx: Pick<BottleReadContext, 'fallback'>
): EngineMarker | null {
  const marker = readEngineMarker(bottleDir, ctx)
  if (isContradictedCrossover(bottleDir, marker)) {
    return { kind: 'pinned', id: ENGINE_PINS.current.id, wineserverBin: '' }
  }
  return marker
}

/**
 * G22 (59-38): read-only view of the bottle's engine marker for the launch path. Never writes a
 * marker; null for an absent/unreadable marker or an unsafe bottle name. A crossover marker
 * contradicted by DXVK-macOS reads as the pin, as the switch treats it (76 review WR-01).
 */
export function readBottleEngineMarkerKind(
  ctx: Pick<BottleReadContext, 'paths' | 'fallback'>,
  bottleName: string
): 'crossover' | 'non-crossover' | null {
  try {
    if (sanitizeBottleName(bottleName) !== bottleName) return null
    const marker = viewMarker(getBottleDir(ctx.paths, bottleName), ctx)
    if (!marker) return null
    return marker.kind === 'crossover' ? 'crossover' : 'non-crossover'
  } catch {
    return null
  }
}

/**
 * WR-01: read-only marker kind plus the pin id (null unless a pinned marker). Same contract as
 * readBottleEngineMarkerKind: never infers or writes a marker.
 */
export function readBottleEngineMarkerSummary(
  ctx: Pick<BottleReadContext, 'paths' | 'fallback'>,
  bottleName: string
): {
  kind: 'crossover' | 'non-crossover'
  pinId: string | null
  /** The recorded Wine Manager version (id already regex-validated), else null. */
  wineManagerVersion: string | null
  /**
   * A pinned marker's recorded wineserver, only when it is inside the pinned-engine
   * root and named `wineserver` (T-59-60 pattern); else null.
   */
  pinWineserverBin: string | null
} | null {
  try {
    if (sanitizeBottleName(bottleName) !== bottleName) return null
    const marker = viewMarker(getBottleDir(ctx.paths, bottleName), ctx)
    if (!marker) return null
    const pinWineserverBin =
      marker.kind === 'pinned' &&
      typeof marker.wineserverBin === 'string' &&
      isInside(ctx.fallback.pinnedEngineRoot(), marker.wineserverBin) &&
      basename(marker.wineserverBin) === 'wineserver'
        ? marker.wineserverBin
        : null
    return {
      kind: marker.kind === 'crossover' ? 'crossover' : 'non-crossover',
      pinId: marker.kind === 'pinned' ? marker.id : null,
      wineManagerVersion: marker.kind === 'wine-manager' ? marker.id : null,
      pinWineserverBin
    }
  } catch {
    return null
  }
}

/**
 * G22 (59-38): true when switching this bottle back to a HEALTHY CrossOver would have to
 * download a pin that is not installed (the same conditions resolveRestoreSource and
 * prepareBottleForEngine use, read-only). False whenever the restore needs no pin download,
 * and for any unreadable state.
 */
export function restoreNeedsAbsentPin(
  ctx: Pick<BottleReadContext, 'paths' | 'fallback'>,
  bottleName: string
): boolean {
  try {
    if (sanitizeBottleName(bottleName) !== bottleName) return false
    const bottleDir = getBottleDir(ctx.paths, bottleName)
    const prev = viewMarker(bottleDir, ctx)
    if (!prev || prev.kind === 'crossover') return false
    const restoreNeeded =
      existsSync(join(bottleDir, DXVK_VERSION_FILE)) || prev.dxvk !== undefined
    if (!restoreNeeded) return false
    const pin =
      (prev.kind === 'pinned' ? pinById(prev.id) : null) ?? ENGINE_PINS.current
    if (ctx.fallback.isPinnedEngineInstalled(pin)) return false
    // A healthy CrossOver restores from the marker's own DXVK copy without the pin.
    if (
      prev.dxvk &&
      prev.dxvk !== 'failed' &&
      existsSync(join(prev.dxvk.dir, 'x64'))
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/** Where a pin's Wine and DXVK live under the pinned-engine root (`<toolsPath>/steam-engines`). */
export type PinnedEnginePaths = {
  wineDir: string
  wineBin: string
  wineserverBin: string
  dxvkDir: string
}

export function pinnedEnginePaths(
  root: string,
  pin: EnginePin
): PinnedEnginePaths {
  const wineDir = join(root, pin.id)
  const wineBinDir = join(wineDir, 'Contents', 'Resources', 'wine', 'bin')
  return {
    wineDir,
    wineBin: join(wineBinDir, 'wine'),
    wineserverBin: join(wineBinDir, 'wineserver'),
    dxvkDir: join(root, `dxvk-macOS-${pin.dxvk.version}`)
  }
}

/** The artifact directory's `.gamelib-pin.json` names this artifact's sha256 (a missing or broken one does not). */
export function pinMarkerMatches(
  dir: string,
  artifact: PinnedArtifact
): boolean {
  try {
    const m = JSON.parse(readFileSync(join(dir, PIN_MARKER_FILE), 'utf8')) as {
      sha256?: string
    }
    return m.sha256 === artifact.sha256
  } catch {
    return false
  }
}

/**
 * Both halves of the pin are on disk and carry the pin's own sha256: a pure reader over the pinned-engine
 * root and each directory's `.gamelib-pin.json` (the Rust owner is `engines::is_pinned_engine_installed`).
 */
export function isPinnedEngineInstalled(root: string, pin: EnginePin): boolean {
  const p = pinnedEnginePaths(root, pin)
  const wine =
    existsSync(p.wineBin) &&
    existsSync(p.wineserverBin) &&
    pinMarkerMatches(p.wineDir, pin.wine)
  const dxvk =
    existsSync(join(p.dxvkDir, 'x32')) &&
    existsSync(join(p.dxvkDir, 'x64')) &&
    pinMarkerMatches(p.dxvkDir, pin.dxvk)
  return wine && dxvk
}
