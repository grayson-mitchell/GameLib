/**
 * Phase 61 (D-19): the bottle primitives every store shares (Steam today, non-Steam next).
 * Moved verbatim from storeManagers/steam/bottle.ts; the only edits are the ones that removed a
 * Steam-only default (isBottleProvisioned's name, the Bottles-root derivation).
 */
import { dirname, join, relative, resolve } from 'path'
import { existsSync, mkdirSync, rmSync } from 'graceful-fs'
import type { AppPaths } from 'backend/process/context'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SpawnAsync } from 'backend/spawnAsync'
import {
  buildFallbackGameSettings,
  getBottleDir,
  isBottleProvisioned,
  sanitizeBottleName
} from 'backend/enginewine/twin'
import { writeCxbottleConf } from './adoptBottle'
import type { NonCrossoverEngine } from './engineTypes'
import type { EngineServices } from './engineServices'

/**
 * The sync pure helpers live once in the D-24 twin `enginewine/twin.ts` (Phase 87, 87-39), pinned to the Rust
 * `gamelib-engine` owners by the shared `bottle_twin.json` vectors. Re-exported so every caller keeps its
 * import until 87-43 repoints them and deletes this module.
 */
export {
  buildFallbackGameSettings,
  getBottleDir,
  isBottleProvisioned,
  sanitizeBottleName
}

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
