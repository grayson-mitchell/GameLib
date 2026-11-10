/**
 * Per-game bridge bottle lifecycle (provision, stop, end-of-session kill,
 * remove, discard). Split out of bottle.ts (Phase 65-09). The DRM runner
 * registry stays owned by ./bridgeBottle and is read only through its
 * accessors.
 */
import { dirname, isAbsolute, relative, resolve } from 'path'
import { existsSync, rmSync } from 'graceful-fs'
import type { WineInstallation } from 'common/types'
import { GlobalConfig } from 'backend/config'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  killBottleWineServer,
  type ProvisionBottleResult,
  type SpawnDeps
} from './provisionBottle'
import {
  bridgeBottleNameFor,
  drmRunnerBinDir,
  getDrmBridgeRunner,
  isBridgeBottleReady
} from './bridgeBottle'
import {
  CROSSOVER_CREATE_FAILED,
  CROSSOVER_CREATE_TIMEOUT,
  CROSSOVER_MISSING,
  CROSSOVER_REQUIRED_MESSAGE,
  DEFAULT_BRIDGE_BOTTLE_NAME,
  PROVISION_ABORTED,
  bottleConfigStore,
  cxbottleIn,
  persistedWineBins
} from './bottle'
import { DEFAULT_STEAM_BOTTLE_NAME } from './constants'
import { getEngineSelection } from 'backend/engine/engineRegistry'
import { isNonCrossover } from 'backend/engine/engineTypes'
import type { NonCrossoverEngine } from 'backend/engine/engineTypes'
import {
  createFallbackBottle,
  getBottleDir,
  isBottleProvisioned,
  killBottleWineServerWith,
  removeCreatedBottleDir,
  sanitizeBottleName
} from 'backend/engine/bottlePrimitives'
import { resolveCrossoverBinDirAsync } from 'backend/engine/crossoverLocation'

/**
 * The guard chain shared by removePerGameBridgeBottle and
 * stopPerGameBridgeBottle, so the two cannot drift (quick 261024-urq). Returns
 * the vetted per-game bottle name, or an error string; has no side effect
 * other than logging. `caller` prefixes the log lines.
 */
function guardPerGameBridgeBottleName(
  appId: string,
  caller: string
): { ok: true; name: string } | { ok: false; error: string } {
  // (1) Only a numeric appId yields a per-game name at all.
  const rawName = bridgeBottleNameFor(appId)
  if (!rawName) {
    logError(
      `${caller}: rejected non-numeric appId "${appId}" (T-17-04 mirror)`,
      LogPrefix.Steam
    )
    return { ok: false, error: `Invalid appId: "${appId}"` }
  }

  // (2) T-17-01 chokepoint — reject unsafe characters/traversal.
  const name = sanitizeBottleName(rawName)
  if (name !== rawName) {
    logError(
      `${caller}: rejected unsafe bottle name "${rawName}" for appId "${appId}" (T-17-01)`,
      LogPrefix.Steam
    )
    return { ok: false, error: `Invalid bottle name: "${rawName}"` }
  }

  // (3) Refuse every non-per-game bottle this function could ever be asked
  // to touch, mirroring provisionBottle's CR-01 guard (D-01).
  const storedPhase17Name = bottleConfigStore().get_nodefault('bottleName')
  const sharedBottle = GlobalConfig.get().getSettings().wineCrossoverBottle
  const forbidden = new Set<string>([
    DEFAULT_BRIDGE_BOTTLE_NAME,
    DEFAULT_STEAM_BOTTLE_NAME
  ])
  if (typeof storedPhase17Name === 'string' && storedPhase17Name.trim()) {
    forbidden.add(storedPhase17Name.trim())
  }
  if (typeof sharedBottle === 'string' && sharedBottle.trim()) {
    forbidden.add(sharedBottle.trim())
  }
  if (forbidden.has(name)) {
    logError(
      `${caller}: refusing to remove protected bottle "${name}" for appId "${appId}" (CR-01 mirror)`,
      LogPrefix.Steam
    )
    return {
      ok: false,
      error: `Refusing to remove protected bottle "${name}".`
    }
  }

  // (4) Containment: the resolved bottle dir must sit exactly one segment
  // (== name) below the Bottles root — never above it, never elsewhere.
  const bottlesRoot = dirname(getBottleDir(DEFAULT_BRIDGE_BOTTLE_NAME))
  const relFromRoot = relative(
    resolve(bottlesRoot),
    resolve(getBottleDir(name))
  )
  if (relFromRoot !== name) {
    logError(
      `${caller}: containment check failed for bottle "${name}" (resolved outside the Bottles root)`,
      LogPrefix.Steam
    )
    return {
      ok: false,
      error: `Refusing to remove "${name}": outside the Bottles directory.`
    }
  }

  return { ok: true, name }
}

/**
 * quick/261016-u1w (D-D): deletes a game's own per-game bridge bottle
 * (`GameLibSteamBridge-<appId>`) on uninstall. This function can NEVER name
 * any other bottle — the guard chain below rejects anything that is not
 * exactly `bridgeBottleNameFor(appId)`, so the legacy shared bridge bottle
 * (DEFAULT_BRIDGE_BOTTLE_NAME), the Phase 17 Steam bottle
 * (DEFAULT_STEAM_BOTTLE_NAME), the user's own stored bottle name, and the
 * shared GOG/Epic bottle (CR-01 mirror) are all unreachable targets (LD-1).
 *
 * Guard order, ALL before any spawn/delete side effect:
 * 1. `bridgeBottleNameFor(appId)` must be non-null (numeric appId only).
 * 2. `sanitizeBottleName(name) === name` (T-17-01 chokepoint).
 * 3. `name` must not equal DEFAULT_BRIDGE_BOTTLE_NAME,
 *    DEFAULT_STEAM_BOTTLE_NAME, the trimmed stored Phase 17 bottle name
 *    (steamBottleConfigStore), or the trimmed shared GOG/Epic bottle
 *    (GlobalConfig.wineCrossoverBottle) — mirrors provisionBottle's CR-01.
 * 4. Containment: `relative(resolve(bottlesRoot), resolve(getBottleDir(name)))`
 *    must equal `name` exactly, where `bottlesRoot` is the CrossOver
 *    Bottles directory every bottle lives in.
 *
 * Then: absent dir -> 'absent'. Otherwise stop the bottle's own wineserver
 * (killBottleWineServer, WINEPREFIX-scoped — T-17-DoS), run
 * `cxbottle --bottle <name> --delete --force` (also cleans CrossOver's own
 * menu/association entries, which a bare rmSync would not), then rmSync the
 * dir if it still survives. Returns 'removed' once the dir is confirmed
 * gone, or 'error' with a message, and never throws.
 *
 * Contains no reference to the Windows Steam installer (SteamSetup.exe /
 * STEAM_SETUP_EXE_URL) — a per-game bridge bottle never has one to clean up.
 */
export async function removePerGameBridgeBottle(
  deps: SpawnDeps,
  appId: string
): Promise<
  | { status: 'removed' }
  | { status: 'absent' }
  | { status: 'error'; error: string }
> {
  const guard = guardPerGameBridgeBottleName(appId, 'removePerGameBridgeBottle')
  if (!guard.ok) {
    return { status: 'error', error: guard.error }
  }
  const { name } = guard

  // (5) Nothing on disk — nothing to do.
  const bottleDir = getBottleDir(name)
  if (!existsSync(bottleDir)) {
    return { status: 'absent' }
  }

  // (6) Stop the bottle's own wineserver first (best-effort), then delete
  // via the same locked cxbottle mechanism provisionBottle uses, with an
  // rmSync fallback if the dir survives.
  await killBottleWineServer(deps, name)

  const removeBinDir = await resolveCrossoverBinDirAsync({
    hintWineBins: persistedWineBins()
  })
  if (!removeBinDir) {
    logWarning(
      `removePerGameBridgeBottle: no CrossOver install found, skipping cxbottle --delete for "${name}" (rmSync fallback follows)`,
      LogPrefix.Steam
    )
  } else {
    try {
      await deps.spawnAsync(cxbottleIn(removeBinDir), [
        '--bottle',
        name,
        '--delete',
        '--force'
      ])
    } catch (error) {
      logWarning(
        ['removePerGameBridgeBottle: cxbottle --delete threw', error],
        LogPrefix.Steam
      )
    }
  }

  if (existsSync(bottleDir)) {
    try {
      rmSync(bottleDir, { recursive: true, force: true })
    } catch (error) {
      logWarning(
        ['removePerGameBridgeBottle: fallback rmSync threw', error],
        LogPrefix.Steam
      )
    }
  }

  // (7) Final confirmation.
  if (existsSync(bottleDir)) {
    const error = `Bottle directory "${bottleDir}" still exists after removal attempt`
    logError(`removePerGameBridgeBottle: ${error}`, LogPrefix.Steam)
    return { status: 'error', error }
  }

  logInfo(
    `removePerGameBridgeBottle: removed per-game bridge bottle "${name}" for appId "${appId}"`,
    LogPrefix.Steam
  )
  return { status: 'removed' }
}

/**
 * Stop-button counterpart of removePerGameBridgeBottle (quick 261024-urq):
 * `wineserver -k` the game's OWN per-game bridge bottle so a bridge-launched
 * game actually ends. It stops; it never deletes.
 *
 * Per-game-only scope: `wineserver -k` kills every process in a prefix, which
 * is only safe because a `GameLibSteamBridge-<appId>` bottle holds a single
 * game. The target is therefore derived solely from `bridgeBottleNameFor` and
 * passes the same guard chain as removal (numeric appId, sanitize round-trip,
 * forbidden shared/legacy/Steam bottles, Bottles-root containment) before any
 * spawn. The kill reuses killBottleWineServer (WINEPREFIX-scoped, T-17-DoS,
 * best-effort) - no new spawn site. Never throws.
 */
/**
 * The one engine dispatch for killing a per-game bottle, in order: DRM runner,
 * registered non-CrossOver engine, the caller's engine hint (59-31 H2), then
 * stock CrossOver (D-10).
 */
async function killForRegisteredEngine(
  deps: SpawnDeps,
  appId: string,
  name: string,
  timeoutMs?: number,
  engineHint?: { wineserverBin: string }
): Promise<boolean> {
  if (getDrmBridgeRunner(appId)) {
    return killBottleWineServer(deps, name, drmRunnerBinDir(appId), timeoutMs)
  }
  const engine = getEngineSelection(appId)
  if (engine && isNonCrossover(engine)) {
    return killBottleWineServerWith(
      deps,
      name,
      engine.wineserverBin,
      { USER: 'crossover' },
      timeoutMs ?? 10000
    )
  }
  if (engineHint) {
    if (
      isAbsolute(engineHint.wineserverBin) &&
      existsSync(engineHint.wineserverBin)
    ) {
      return killBottleWineServerWith(
        deps,
        name,
        engineHint.wineserverBin,
        { USER: 'crossover' },
        timeoutMs ?? 10000
      )
    }
    logWarning(
      'endPerGameBridgeBottleSession: ignoring unusable engine wineserver hint',
      LogPrefix.Steam
    )
  }
  return killBottleWineServer(deps, name, undefined, timeoutMs)
}

/**
 * Phase 60 D-04: like endPerGameBridgeBottleSession, but stops with an explicit
 * wineserver bin dir (undefined = stock CrossOver). Used when the registered
 * runner changes after drmLaunchSetup has already cleared the entry, so the stop
 * must use the PREVIOUS runner's own wineserver (RESEARCH Pitfall 2): a clone
 * never joins a stock wineserver or the reverse. Same guards; never throws.
 */
export async function endPerGameBridgeBottleSessionWith(
  deps: SpawnDeps,
  appId: string,
  bottleName: string | undefined,
  runnerBinDir: string | undefined,
  timeoutMs: number
): Promise<boolean> {
  try {
    if (!bottleName || bottleName !== bridgeBottleNameFor(appId)) return false
    const guard = guardPerGameBridgeBottleName(
      appId,
      'endPerGameBridgeBottleSessionWith'
    )
    if (!guard.ok) return false
    const { name } = guard
    if (!existsSync(getBottleDir(name))) return false
    logInfo(
      `endPerGameBridgeBottleSessionWith: wineserver -k for bottle "${name}" (appId ${appId})`,
      LogPrefix.Steam
    )
    return await killBottleWineServer(deps, name, runnerBinDir, timeoutMs)
  } catch (error) {
    logWarning(
      [`endPerGameBridgeBottleSessionWith: failed for appId "${appId}"`, error],
      LogPrefix.Steam
    )
    return false
  }
}

/**
 * Phase 59: stops this appId's per-game bottle with the wineserver of the
 * engine actually running it. Refuses (false, no spawn) when the per-game
 * guard refuses. Never throws.
 */
export async function killBridgeBottleWineServer(
  deps: SpawnDeps,
  appId: string,
  timeoutMs: number
): Promise<boolean> {
  try {
    const guard = guardPerGameBridgeBottleName(
      appId,
      'killBridgeBottleWineServer'
    )
    if (!guard.ok) return false
    return await killForRegisteredEngine(deps, appId, guard.name, timeoutMs)
  } catch (error) {
    logWarning(
      [`killBridgeBottleWineServer: failed for appId "${appId}"`, error],
      LogPrefix.Steam
    )
    return false
  }
}

export async function stopPerGameBridgeBottle(
  deps: SpawnDeps,
  appId: string
): Promise<
  | { status: 'stopped' }
  | { status: 'absent' }
  | { status: 'refused'; error: string }
> {
  const guard = guardPerGameBridgeBottleName(appId, 'stopPerGameBridgeBottle')
  if (!guard.ok) {
    return { status: 'refused', error: guard.error }
  }
  const { name } = guard

  if (!existsSync(getBottleDir(name))) {
    logInfo(
      `stopPerGameBridgeBottle: bottle "${name}" is absent for appId "${appId}", nothing to stop`,
      LogPrefix.Steam
    )
    return { status: 'absent' }
  }

  logInfo(
    `stopPerGameBridgeBottle: wineserver -k for bottle "${name}" (appId ${appId})`,
    LogPrefix.Steam
  )
  // D-11: a registered DRM runner's own wineserver, one runner per bottle.
  await killForRegisteredEngine(deps, appId, name)
  return { status: 'stopped' }
}

/**
 * Quick 261027-nd3: ends the wineserver session of this appId's OWN per-game
 * bridge bottle so a Wine driver change takes effect (and so the game starts a
 * fresh session). Per-game-only for the same reason as stopPerGameBridgeBottle:
 * a shared-bottle game is never killed. Bounded by `timeoutMs`. Never throws;
 * resolves true only when a `wineserver -k` ran to completion.
 */
export async function endPerGameBridgeBottleSession(
  deps: SpawnDeps,
  appId: string,
  bottleName: string | undefined,
  timeoutMs: number,
  engineHint?: { wineserverBin: string }
): Promise<boolean> {
  try {
    if (!bottleName || bottleName !== bridgeBottleNameFor(appId)) return false
    const guard = guardPerGameBridgeBottleName(
      appId,
      'endPerGameBridgeBottleSession'
    )
    if (!guard.ok) return false
    const { name } = guard
    if (!existsSync(getBottleDir(name))) return false
    logInfo(
      `endPerGameBridgeBottleSession: wineserver -k for bottle "${name}" (appId ${appId})`,
      LogPrefix.Steam
    )
    // D-11: a registered DRM runner's own wineserver, one runner per bottle.
    return await killForRegisteredEngine(
      deps,
      appId,
      name,
      timeoutMs,
      engineHint
    )
  } catch (error) {
    logWarning(
      [`endPerGameBridgeBottleSession: failed for appId "${appId}"`, error],
      LogPrefix.Steam
    )
    return false
  }
}

/**
 * Creates the dedicated, SHARED bridge bottle (D-03) via the same LOCKED
 * cxbottle --create --template win10_64 mechanism provisionBottle() uses
 * above, but — unlike provisionBottle() — this function never downloads or
 * runs any Windows Steam client installer artifact. R6's acceptance bar is a
 * bridge bottle provably free of a Windows Steam client; this function is
 * grep-verifiable as containing no reference to that installer artifact or
 * its download URL constant (Pitfall 1).
 *
 * D-08: CrossOver-only lifecycle. A caller-supplied non-CrossOver
 * wineVersion (GPTK/toolkit/plain Wine) is rejected outright — mirrors the
 * Phase 17/18 non-crossover rejection posture (folded todo
 * steam-bottle-gptk-engine-produces-broken-bottle.md, T-24-09) rather than
 * silently creating a broken bottle.
 *
 * Idempotent: isBridgeBottleReady() (cxbottle.conf existence — the bridge
 * bottle's own readiness signal, distinct from isBottleReady()'s
 * conf-plus-Steam-client check) short-circuits a repeat call.
 *
 * quick/261016-u1w (D-E): `bottleName` is now required — no more silent
 * DEFAULT_BRIDGE_BOTTLE_NAME fallback. Every caller (shared-bottle
 * provisioning, per-game provisioning on install) must say which bottle it
 * means.
 */

/**
 * Discard a bottle the caller created in this install (see ProvisionBottleResult.createdHere),
 * already stopped by the post-create kill. Same single-segment-under-Bottles-root guard as
 * removeCreatedBottleDir (T-59-25). Never call for a bottle that pre-existed.
 */
export function discardNewBridgeBottle(bottleName: string): void {
  logInfo(
    `provisionBridgeBottle: discarding newly created bottle "${bottleName}"`,
    LogPrefix.Steam
  )
  removeCreatedBottleDir(bottleName)
}

export async function provisionBridgeBottle(
  deps: SpawnDeps,
  opts: {
    bottleName: string
    wineVersion?: WineInstallation
    /** Phase 59: create with this engine instead of CrossOver (D-01). */
    fallbackEngine?: NonCrossoverEngine
    /** D-12: hard cap for `cxbottle --create`, in ms. */
    createTimeoutMs?: number
    /** 59-REVIEW CR-01: aborts bottle creation and removes what this call created. */
    signal?: AbortSignal
  }
): Promise<ProvisionBottleResult> {
  const rawName = opts.bottleName
  const bottleName = sanitizeBottleName(rawName)

  // (1) Reject unsafe names before any path/argv construction (T-24-06,
  // the same sanitizeBottleName chokepoint T-17-01 established).
  if (!bottleName) {
    logError(
      `provisionBridgeBottle: rejected unsafe bottle name "${rawName}" (T-24-06)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid bottle name: "${rawName}"` }
  }

  // (2) D-08: CrossOver-only. Phase 59 adds a separate, explicit `fallbackEngine`
  // path; a caller-supplied GPTK/toolkit wineVersion is still rejected. Reject a non-CrossOver engine before any side
  // effect — do not silently create a broken GPTK/toolkit bottle (T-24-09).
  if (opts.wineVersion && opts.wineVersion.type !== 'crossover') {
    logError(
      `provisionBridgeBottle: rejected non-CrossOver engine "${opts.wineVersion.type}" for bottle "${bottleName}" (D-08)`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `The bridge bottle requires a CrossOver engine, got "${opts.wineVersion.type}"`
    }
  }

  // (3) Idempotent short-circuit — bridge bottle already created.
  if (isBridgeBottleReady(bottleName)) {
    return { status: 'done', createdHere: false }
  }

  if (opts.signal?.aborted) {
    return {
      status: 'error',
      errorCode: PROVISION_ABORTED,
      error: 'bottle creation cancelled'
    }
  }

  // Phase 59: an explicit fallback engine creates the bottle itself.
  if (opts.fallbackEngine) {
    return createFallbackBottle(
      deps,
      bottleName,
      opts.fallbackEngine,
      opts.signal
    )
  }

  // (3b) quick 261024-cjq: CrossOver precondition, after the ready
  // short-circuit and before any spawn.
  const binDir = await resolveCrossoverBinDirAsync({
    wineVersion: opts.wineVersion,
    hintWineBins: persistedWineBins()
  })
  if (!binDir) {
    logWarning(
      `provisionBridgeBottle: CrossOver not found, cannot create bridge bottle "${bottleName}"`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      errorCode: CROSSOVER_MISSING,
      error: CROSSOVER_REQUIRED_MESSAGE
    }
  }

  // (4) CREATE via the SAME locked cxbottle mechanism provisionBottle()
  // uses (argv form only, arguments as discrete words) — win10_64 template.
  const createdHere = !existsSync(getBottleDir(bottleName))
  const abortedCrossOver = async (): Promise<ProvisionBottleResult> => {
    logInfo(
      `provisionBridgeBottle: bottle creation cancelled for "${bottleName}"`,
      LogPrefix.Steam
    )
    await killBottleWineServer(deps, bottleName, binDir, 15_000)
    if (createdHere) removeCreatedBottleDir(bottleName)
    return {
      status: 'error',
      errorCode: PROVISION_ABORTED,
      error: 'bottle creation cancelled'
    }
  }
  try {
    const createArgv = [
      '--create',
      '--bottle',
      bottleName,
      '--template',
      'win10_64'
    ]
    const { code, stderr } =
      opts.createTimeoutMs !== undefined
        ? await deps.spawnAsync(cxbottleIn(binDir), createArgv, {
            timeout: opts.createTimeoutMs,
            signal: opts.signal
          })
        : await deps.spawnAsync(cxbottleIn(binDir), createArgv, {
            signal: opts.signal
          })
    if (opts.signal?.aborted) return await abortedCrossOver()
    if (code === null && opts.createTimeoutMs !== undefined) {
      logError(
        `provisionBridgeBottle: cxbottle create for "${bottleName}" hit its ${opts.createTimeoutMs} ms cap (D-12)`,
        LogPrefix.Steam
      )
      await killBottleWineServer(deps, bottleName, binDir, 15_000)
      if (createdHere) removeCreatedBottleDir(bottleName)
      return {
        status: 'error',
        errorCode: CROSSOVER_CREATE_TIMEOUT,
        error: 'CrossOver did not finish creating the bottle'
      }
    }
    if (!isBottleProvisioned(bottleName)) {
      // log-secret-gate-exempt: stderr of cxbottle create (bridge bottle provisioning), not an auth command
      logError(
        [
          'provisionBridgeBottle: cxbottle create did not produce cxbottle.conf for',
          bottleName,
          `(code=${code}):`,
          stderr
        ],
        LogPrefix.Steam
      )
      await killBottleWineServer(deps, bottleName, binDir, 15_000)
      if (createdHere) removeCreatedBottleDir(bottleName)
      return {
        status: 'error',
        errorCode: CROSSOVER_CREATE_FAILED,
        error: `Failed to create CrossOver bridge bottle "${bottleName}"`
      }
    }
  } catch (error) {
    logError(
      ['provisionBridgeBottle: cxbottle create threw', error],
      LogPrefix.Steam
    )
    if (opts.signal?.aborted) return await abortedCrossOver()
    await killBottleWineServer(deps, bottleName, binDir, 15_000)
    if (createdHere) removeCreatedBottleDir(bottleName)
    return {
      status: 'error',
      errorCode: CROSSOVER_CREATE_FAILED,
      error: `Failed to create CrossOver bridge bottle "${bottleName}": ${String(error)}`
    }
  }

  // (5) Tooling hygiene (SPEC constraint — avoid cxstart, kill wineserver
  // between runs): best-effort cleanup after creation so a fresh bottle
  // never leaves a wedged wineserver behind. Never fails provisioning.
  await killBottleWineServer(deps, bottleName, binDir)

  logInfo(
    `provisionBridgeBottle: bridge bottle "${bottleName}" created (no Windows Steam client installed — R6)`,
    LogPrefix.Steam
  )

  return { status: 'done', createdHere }
}
