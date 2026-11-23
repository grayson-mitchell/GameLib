/**
 * Phase 61 (D-05..D-09): the engine key and its read-time migration.
 *
 * `GameSettings.engineOverride` holds a closed-grammar id (engineIds.ts) for
 * every store. A game with no key gets its engine derived from its stored
 * `wineVersion` on every read; nothing is ever written here (D-08). Legacy is
 * never a stored value: it is a derived variant for a Wine outside the option
 * list.
 */
import { isAbsolute, join, relative, resolve } from 'path'
import type { AppPaths } from 'backend/process/context'
import type { FallbackEngine } from './fallbackEngine'
import {
  readSettingsDoc,
  settingsDocExists,
  type SettingsDocRoot
} from 'backend/stores/settingsDocs'
import { hasCapability } from 'common/storeCapabilities'
import type { WineInstallation } from 'common/types'
import { ENGINE_PINS } from './enginePins'
import { parseEngineOverride, type EngineOverrideId } from './engineIds'
import type { WineManagerRelease } from './engineDecision'

export type EffectiveEngine =
  | { kind: 'override'; id: EngineOverrideId; source: 'stored' | 'derived' }
  | { kind: 'legacy'; label: string }

export interface EngineConfigDeps {
  wineManagerReleases(): WineManagerRelease[]
  pins: Readonly<{
    current: { id: string }
    previous: { id: string } | null
  }>
  pinWineBin(pin: { id: string }): string
  gamesConfigPath: string
  /**
   * The boot's store root (85-15): the game config is read through its mirror when the shell owns
   * the settings family, so a setting written a moment ago is seen. Absent (a test), the document
   * is read from the file as it stands: the shell migrated it at boot.
   */
  storeRoot?: SettingsDocRoot
  globalSettings(): Record<string, unknown>
}

function defaultDeps(): Pick<EngineConfigDeps, 'pins'> {
  return { pins: ENGINE_PINS }
}

/** The path reads the config helpers need (66.4-05): the games-config root and the pin's Wine binary. */
export type ConfigPathDeps = Pick<
  EngineConfigDeps,
  'gamesConfigPath' | 'pinWineBin' | 'storeRoot'
>

/** Builds the path reads from the boot's `paths`, store root and fallback-engine owner. */
export function configPathDepsFrom(source: {
  paths: Pick<AppPaths, 'gamesConfigPath'>
  storeRoot?: SettingsDocRoot
  engineRuntime: { fallback: Pick<FallbackEngine, 'pinnedEnginePaths'> }
}): ConfigPathDeps {
  return {
    gamesConfigPath: source.paths.gamesConfigPath,
    ...(source.storeRoot ? { storeRoot: source.storeRoot } : {}),
    pinWineBin: (pin) =>
      source.engineRuntime.fallback.pinnedEnginePaths(
        pin as (typeof ENGINE_PINS)['current']
      ).wineBin
  }
}

/** 66.1-22i: the release reader has no default; the caller supplies it, with the path reads. */
type ConfigDepsWithReleases = Partial<EngineConfigDeps> &
  Pick<EngineConfigDeps, 'wineManagerReleases'> &
  ConfigPathDeps

/** 66.3-06: the global settings reader has no default either (the config slice, via EngineServices). */
export type ConfigDepsWithSettings = ConfigDepsWithReleases &
  Pick<EngineConfigDeps, 'globalSettings'>

const withDeps = (
  deps: ConfigDepsWithReleases
): Omit<EngineConfigDeps, 'globalSettings'> &
  Partial<Pick<EngineConfigDeps, 'globalSettings'>> => ({
  ...defaultDeps(),
  ...deps
})

/**
 * The game's stored GamesConfig entry, read through the settings-document seam (never
 * `GameConfig.get`, which creates a missing file and fills asynchronously,
 * 59-UAT G11): the mirror's view, pending writes included, when the shell owns the
 * settings family; the file otherwise (85-15). The shell migrated every document at boot (85-15,
 * research A4), so no TS migration runs. Values are unvalidated. Undefined on a
 * bad appName, a missing or corrupt file, or a non-object entry.
 */
export function readStoredGameConfig(
  appName: string,
  deps: Pick<EngineConfigDeps, 'gamesConfigPath' | 'storeRoot'>
): Record<string, unknown> | undefined {
  if (
    typeof appName !== 'string' ||
    appName.length < 1 ||
    appName.length > 255 ||
    appName === '..' ||
    /[/\\\0]/.test(appName)
  ) {
    return undefined
  }
  const root = deps.gamesConfigPath
  const target = resolve(root, appName + '.json')
  const rel = relative(root, target)
  if (rel.startsWith('..') || isAbsolute(rel)) return undefined
  const path = join(root, `${appName}.json`)
  const docs: SettingsDocRoot = deps.storeRoot ?? {}
  if (!settingsDocExists(docs, path)) return undefined
  // Containment checks above passed (T-68-19).
  try {
    const raw = readSettingsDoc(docs, path)
    if (raw === undefined) return undefined
    const entry = raw[appName]
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return undefined
    }
    return entry as Record<string, unknown>
  } catch {
    return undefined
  }
}

const AUTOMATIC: EffectiveEngine = {
  kind: 'override',
  id: 'automatic',
  source: 'derived'
}

/** D-05..D-07, D-15: the override a stored Wine corresponds to, or Legacy. */
export function deriveEngineFromWine(
  wine: WineInstallation | undefined | null,
  deps: ConfigDepsWithReleases
): EffectiveEngine {
  if (!wine || typeof wine !== 'object') return AUTOMATIC
  if (wine.type === 'crossover') return AUTOMATIC
  const label = wine.name || wine.type
  if (wine.type !== 'wine' || typeof wine.bin !== 'string') {
    return { kind: 'legacy', label }
  }
  const d = withDeps(deps)
  for (const pin of [d.pins.current, d.pins.previous]) {
    if (pin && wine.bin === d.pinWineBin(pin)) {
      return {
        kind: 'override',
        id: parseEngineOverride(`pinned:${pin.id}`),
        source: 'derived'
      }
    }
  }
  const rel = d
    .wineManagerReleases()
    .find(
      (r) =>
        r.type === 'Wine-Staging-macOS' &&
        r.isInstalled &&
        typeof r.installDir === 'string' &&
        join(r.installDir, 'Contents', 'Resources', 'wine', 'bin', 'wine') ===
          wine.bin
    )
  if (rel) {
    const id = parseEngineOverride(`wine-manager:${rel.version}`)
    if (id !== 'automatic') return { kind: 'override', id, source: 'derived' }
  }
  return { kind: 'legacy', label }
}

export function resolveEffectiveEngine(
  entry: Record<string, unknown> | undefined,
  inheritedWine: WineInstallation | undefined,
  opts: { legacyKey?: string; derive: boolean },
  deps: ConfigDepsWithReleases
): EffectiveEngine {
  const stored = entry?.engineOverride
  if (typeof stored === 'string') {
    return {
      kind: 'override',
      id: parseEngineOverride(stored),
      source: 'stored'
    }
  }
  const legacy = opts.legacyKey ? entry?.[opts.legacyKey] : undefined
  if (typeof legacy === 'string') {
    return {
      kind: 'override',
      id: parseEngineOverride(legacy),
      source: 'stored'
    }
  }
  if (opts.derive) {
    return deriveEngineFromWine(
      (entry?.wineVersion as WineInstallation | undefined) ?? inheritedWine,
      deps
    )
  }
  return AUTOMATIC
}

/**
 * CR-05: the single source of truth for a game's engine. The launch and the
 * settings page's derived value (getGameEngineState.effectiveEngineId) both
 * call this. A global Engine pick reaches games only through new installs
 * (D-09, written explicitly by the install dialogs); an existing game with no
 * engine key derives from its own or the inherited global wineVersion.
 */
export function readEngineForGame(
  args: { runner: string; appName: string },
  deps: ConfigDepsWithSettings
): EffectiveEngine {
  const d = withDeps(deps)
  const entry = readStoredGameConfig(args.appName, d)
  if (hasCapability(args.runner, 'usesBottleRuntime')) {
    // Steam titles never derive from wineVersion (as before phase 61).
    return resolveEffectiveEngine(
      entry,
      undefined,
      { legacyKey: 'steamEngineOverride', derive: false },
      d
    )
  }
  const inherited =
    entry?.wineVersion === undefined
      ? (deps.globalSettings().wineVersion as WineInstallation | undefined)
      : undefined
  return resolveEffectiveEngine(entry, inherited, { derive: true }, d)
}

/** D-09: the global default derives the same way as a game. */
export function resolveGlobalEngine(
  globalSettings: Record<string, unknown>,
  deps: ConfigDepsWithReleases
): EffectiveEngine {
  if (typeof globalSettings.engineOverride === 'string') {
    return {
      kind: 'override',
      id: parseEngineOverride(globalSettings.engineOverride),
      source: 'stored'
    }
  }
  return deriveEngineFromWine(
    globalSettings.wineVersion as WineInstallation | undefined,
    deps
  )
}

/**
 * The override id, or `legacy:<label>` for display only. Never parse this back
 * into a launch path.
 */
export function engineIdOf(e: EffectiveEngine): string {
  return e.kind === 'override' ? e.id : `legacy:${e.label}`
}
