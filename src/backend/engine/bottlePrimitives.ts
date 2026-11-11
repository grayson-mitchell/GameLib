/**
 * Phase 61 (D-19): the bottle primitives every store shares (Steam today, non-Steam next).
 * Moved verbatim from storeManagers/steam/bottle.ts; the only edits are the ones that removed a
 * Steam-only default (isBottleProvisioned's name, the Bottles-root derivation).
 */
import { dirname, join, relative, resolve } from 'path'
import { existsSync, mkdirSync, rmSync } from 'graceful-fs'
import type { GameSettings } from 'common/types'
import type { AppPaths } from 'backend/process/context'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SpawnAsync } from 'backend/spawnAsync'
import { writeCxbottleConf } from './adoptBottle'
import type { NonCrossoverEngine } from './engineTypes'
import type { EngineServices } from './engineServices'

/** Same string as PROVISION_ABORTED in steam/bottle.ts (a structural match, not a re-export). */
const PROVISION_ABORTED_CODE = 'provision-aborted' as const

/** What createFallbackBottle returns; steam/bottle.ts's ProvisionBottleResult is a superset. */
export type FallbackBottleResult = {
  status: 'done' | 'error'
  error?: string
  errorCode?: typeof PROVISION_ABORTED_CODE
  /** True only when this call created the bottle dir (absent at entry). */
  createdHere?: boolean
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
  return existsSync(join(getBottleDir(paths, bottleName), 'cxbottle.conf'))
}

/** The one capability the bottle helpers need (66.1 R3). */
export interface BottleSpawnDeps {
  spawnAsync: SpawnAsync
  paths: Pick<AppPaths, 'userHome'>
}

/**
 * Phase 59: `wineserver -k` with an explicit (non-CrossOver) wineserver.
 * Same scope fence as killBottleWineServer (T-17-DoS): WINEPREFIX is always
 * the per-game bottle (spread last so extraEnv cannot override it), the name
 * must survive sanitizeBottleName and sit directly under the Bottles root.
 * Real-profile arm: the env inherits process.env (HOME) because the prefix is
 * explicit and wine needs nothing GameLib-private from HOME. Never throws.
 */
export async function killBottleWineServerWith(
  deps: BottleSpawnDeps,
  bottleName: string,
  wineserverBin: string,
  extraEnv: Record<string, string>,
  timeoutMs: number
): Promise<boolean> {
  const bottlesRoot = resolve(dirname(getBottleDir(deps.paths, '_')))
  if (
    sanitizeBottleName(bottleName) !== bottleName ||
    relative(bottlesRoot, resolve(getBottleDir(deps.paths, bottleName))) !==
      bottleName
  ) {
    logWarning(
      `killBottleWineServerWith: refusing unsafe bottle "${bottleName}"`,
      LogPrefix.Backend
    )
    return false
  }
  try {
    const result = await deps.spawnAsync(wineserverBin, ['-k'], {
      env: {
        ...process.env,
        ...extraEnv,
        WINEPREFIX: getBottleDir(deps.paths, bottleName)
      },
      timeout: timeoutMs
    })
    if (result?.code === null) {
      logWarning(
        `killBottleWineServerWith: wineserver -k for bottle "${bottleName}" was killed by its timeout`,
        LogPrefix.Backend
      )
      return false
    }
    return true
  } catch (error) {
    logWarning(
      [
        `killBottleWineServerWith: wineserver -k for bottle "${bottleName}" failed`,
        error
      ],
      LogPrefix.Backend
    )
    return false
  }
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

/**
 * Phase 59 removes a bottle dir only when this call created it, and only as a single safe
 * segment directly under the Bottles root (T-59-25).
 */
export function removeCreatedBottleDir(
  paths: Pick<AppPaths, 'userHome'>,
  bottleName: string
): void {
  const bottlesRoot = resolve(dirname(getBottleDir(paths, '_')))
  const dir = resolve(getBottleDir(paths, bottleName))
  if (
    sanitizeBottleName(bottleName) !== bottleName ||
    relative(bottlesRoot, dir) !== bottleName
  ) {
    logWarning(
      `provisionBridgeBottle: not removing partial bottle outside the Bottles root: ${dir}`,
      LogPrefix.Backend
    )
    return
  }
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch (error) {
    logWarning(
      ['provisionBridgeBottle: could not remove partial bottle', error],
      LogPrefix.Backend
    )
  }
}

/**
 * Phase 59 (D-01/D-02/D-03): create the bridge bottle with the fallback engine, in CrossOver's own
 * Bottles directory, so the Windows profile is C:\users\crossover from the start. The
 * cxbottle.conf is written LAST so isBridgeBottleReady stays false until the bottle is complete.
 *
 * Real-profile arm (fakeHomeIsolation): the env inherits process.env because the engine runs
 * against the user's own bottle with an explicit WINEPREFIX; none of the HOME/config variables
 * are assigned here.
 */
export async function createFallbackBottle(
  deps: BottleSpawnDeps &
    Pick<EngineServices, 'installRemove' | 'globalGameSettings'>,
  bottleName: string,
  engine: NonCrossoverEngine,
  signal?: AbortSignal
): Promise<FallbackBottleResult> {
  const dir = getBottleDir(deps.paths, bottleName)
  const createdHere = !existsSync(dir)
  const env = {
    ...process.env,
    WINEPREFIX: dir,
    USER: 'crossover',
    // Only Gecko stays off. mscoree must stay enabled so wineboot registers the engine's bundled
    // Wine Mono (offline); without it DXSETUP's Managed DirectX step fails with exit 247 (59-32 H1).
    WINEDLLOVERRIDES: 'mshtml=',
    WINEDEBUG: '-all',
    MVK_CONFIG_LOG_LEVEL: '0'
  }
  const fail = async (error: string): Promise<FallbackBottleResult> => {
    logError(`provisionBridgeBottle: ${error}`, LogPrefix.Backend)
    await killBottleWineServerWith(
      deps,
      bottleName,
      engine.wineserverBin,
      { USER: 'crossover' },
      15_000
    )
    if (createdHere) removeCreatedBottleDir(deps.paths, bottleName)
    return { status: 'error', error }
  }
  const aborted = async (): Promise<FallbackBottleResult> => {
    logInfo(
      `provisionBridgeBottle: bottle creation cancelled for "${bottleName}"`,
      LogPrefix.Backend
    )
    await killBottleWineServerWith(
      deps,
      bottleName,
      engine.wineserverBin,
      { USER: 'crossover' },
      15_000
    )
    if (createdHere) removeCreatedBottleDir(deps.paths, bottleName)
    return {
      status: 'error',
      errorCode: PROVISION_ABORTED_CODE,
      error: 'bottle creation cancelled'
    }
  }
  try {
    mkdirSync(dirname(dir), { recursive: true })
    const boot = await deps.spawnAsync(engine.wineBin, ['wineboot', '-i'], {
      env,
      timeout: 180_000,
      signal
    })
    if (signal?.aborted) return await aborted()
    if (boot?.code !== 0) {
      // log-secret-gate-exempt: stderr of wineboot, not an auth command
      return await fail(
        `wineboot -i failed for bottle "${bottleName}" (code=${boot?.code}): ${boot?.stderr ?? ''}`
      )
    }
    // system.reg is flushed only once the wineserver exits.
    const wait = await deps.spawnAsync(engine.wineserverBin, ['-w'], {
      env,
      timeout: 60_000,
      signal
    })
    if (signal?.aborted) return await aborted()
    if (wait?.code === null) {
      return await fail(`wineserver -w timed out for bottle "${bottleName}"`)
    }
    if (engine.dxvk) {
      const ok = await deps.installRemove(
        buildFallbackGameSettings(
          deps.paths,
          bottleName,
          engine,
          deps.globalGameSettings()
        ),
        'dxvk',
        'backup',
        engine.dxvk
      )
      if (signal?.aborted) return await aborted()
      if (!ok || !existsSync(join(dir, 'current_dxvk-macOS'))) {
        return await fail(`DXVK install failed for bottle "${bottleName}"`)
      }
    }
    // D-03: last, so the bottle only counts as ready once everything above succeeded.
    if (!writeCxbottleConf(dir)) {
      return await fail(`cxbottle.conf not written for bottle "${bottleName}"`)
    }
  } catch (error) {
    if (signal?.aborted) return await aborted()
    return await fail(`fallback bottle creation threw: ${String(error)}`)
  }
  await killBottleWineServerWith(
    deps,
    bottleName,
    engine.wineserverBin,
    { USER: 'crossover' },
    15_000
  )
  logInfo(
    `provisionBridgeBottle: bridge bottle "${bottleName}" created by ${engine.label}`,
    LogPrefix.Backend
  )
  return { status: 'done', createdHere }
}
