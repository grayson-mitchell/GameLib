/**
 * Bridge bottle cluster (Phase 65 plan 08): per-game bridge bottle names and
 * readiness, the DRM / overlay runner registry, and the settings a bridge
 * launch runs under. Split out of bottle.ts; the base bottle helpers stay there.
 */
import { dirname, isAbsolute, join } from 'path'
import { existsSync, readdirSync } from 'graceful-fs'
import type { GameSettings, WineInstallation } from 'common/types'
import { GlobalConfig } from 'backend/config'
import { logInfo, LogPrefix } from 'backend/logger'
import { getEngineSelection } from 'backend/engine/engineRegistry'
import { isNonCrossover } from 'backend/engine/engineTypes'
import type { NonCrossoverSelection } from 'backend/engine/engineTypes'
import {
  buildFallbackGameSettings,
  getBottleDir,
  isBottleProvisioned
} from 'backend/engine/bottlePrimitives'
import {
  DEFAULT_BRIDGE_BOTTLE_NAME,
  getBottleSteamappsDir,
  resolveCrossoverWine
} from './bottle'
import { NUMERIC_APP_ID } from './gameConstants'

// ── 24-04: dedicated bridge bottle provisioning ─────────────────────────────

/**
 * The bridge bottle's readiness signal — DELIBERATELY narrower than
 * isBottleReady(): the bridge bottle never contains a bottled Steam client
 * (R6), so "ready" can only ever mean "the CrossOver bottle itself has been
 * created" (the same cxbottle.conf-existence signal isBottleProvisioned()
 * already uses), never "+ a bottled Windows Steam client exists". Reusing
 * isBottleReady() here would leave the bridge bottle perpetually
 * non-ready, since no Windows Steam client is ever installed on this path.
 *
 * quick/261016-u1w (D-E): `bottleName` is now required — every bridge-bottle
 * entry point must name the specific bottle (legacy or per-game) it means,
 * so `tsc` rejects any caller that forgot which one. Probes exactly the
 * named bottle; a per-game name never touches the legacy or Phase 17 dir.
 */
export function isBridgeBottleReady(bottleName: string): boolean {
  return isBottleProvisioned(bottleName)
}

// ── quick/261016-u1w (D-A/D-B): per-game bridge bottles ─────────────────────
// Every bridge-routed Steam game now gets its OWN dedicated CrossOver bottle
// (GameLibSteamBridge-<appId>, Proton-style) instead of sharing the single
// DEFAULT_BRIDGE_BOTTLE_NAME bottle above. The shared bottle is kept as a
// LEGACY fallback only — resolveBridgeBottleName() below is the single
// resolver that decides, per appId, which bottle a caller should use.

/**
 * D-A: pure, NUMERIC_APP_ID-guarded builder for a per-game bridge bottle
 * name. Mirrors buildSteamProtocolUrl's numeric-guard precedent (T-03-01) —
 * never constructs a name from an untrusted/non-numeric appId. Returns null
 * (never throws) for a non-numeric appId so callers can treat "no valid
 * per-game name" as a plain data case, not an exception path.
 */
export function bridgeBottleNameFor(appId: string): string | null {
  if (!NUMERIC_APP_ID.test(appId)) {
    return null
  }
  return `${DEFAULT_BRIDGE_BOTTLE_NAME}-${appId}`
}

/**
 * D-B: the SINGLE resolver for "which bridge bottle does this appId use".
 * Every bridge-routed call site that needs to find an EXISTING install
 * (launch, uninstall, library-state reconciliation) must route through
 * this function — never re-derive the per-game/legacy choice locally.
 *
 * Resolution order:
 *  1. The per-game bottle (GameLibSteamBridge-<appId>) wins if it is
 *     already ready (provisioned) AND holds this appId's manifest — the
 *     new, steady-state layout (51-REVIEW WR-09 added the manifest check).
 *  2. Otherwise, the legacy shared bottle (DEFAULT_BRIDGE_BOTTLE_NAME) wins
 *     ONLY if it is ready AND it genuinely holds THIS appId's manifest
 *     (appmanifest_<appId>.acf) — i.e. this game was installed before the
 *     per-game-bottle migration and still lives in the shared bottle.
 *  3. Otherwise the per-game bottle name is returned anyway (even though
 *     not yet provisioned) — a not-yet-installed game resolves to the
 *     bottle its OWN install will create, never to the shared legacy one.
 *
 * New installs never call this resolver — they always target
 * bridgeBottleNameFor(appId) directly (installBridgeGame below), so a
 * fresh install can never accidentally land in the legacy shared bottle.
 */
export function resolveBridgeBottleName(appId: string): string | null {
  const perGameName = bridgeBottleNameFor(appId)
  if (!perGameName) {
    return null
  }

  // 51-REVIEW WR-09: step 1 used to accept a per-game bottle that was merely
  // ready, with no manifest. A bridge reinstall whose download failed after
  // inline provisioning leaves exactly that, beside a legacy shared bottle
  // that still holds this appId. findBridgeInstallBottle (launch/uninstall's
  // decision step) then picked the legacy bottle, while every execution step
  // re-resolving through here picked the empty per-game one: launch failed
  // the existence gate, and uninstall/removeSteamInstallCopy targeted the
  // wrong bottle. Steps 1-2 now ARE findBridgeInstallBottle, so the two can
  // never disagree; step 3 (a not-yet-installed game) is unchanged.
  return findBridgeInstallBottle(appId) ?? perGameName
}

/**
 * Phase 51 Plan 09 (D-51-09): "where does an EXISTING bridge install's bits
 * already live", as distinct from `resolveBridgeBottleName` above (step 3 of
 * which answers "where should a NEW install go" and always returns a name,
 * even for a game that has never been installed at all). `launch()` and
 * `uninstall()` need the FIRST question — dispatching a launch/uninstall
 * into a bottle that was never provisioned, or that holds no manifest for
 * this appId, would act against nothing. Returns `null` when neither the
 * per-game nor the legacy shared bridge bottle actually holds this appId's
 * manifest (appmanifest_<appId>.acf) — including the brand-new,
 * not-yet-installed case `resolveBridgeBottleName` falls back to its
 * per-game name for.
 *
 * Resolution order mirrors `resolveBridgeBottleName`'s, with the per-game
 * branch ALSO requiring the manifest check (resolveBridgeBottleName's step 1
 * only requires "ready", since a fresh install target doesn't have a
 * manifest yet by definition):
 *  1. The per-game bottle (GameLibSteamBridge-<appId>), if ready AND it
 *     holds this appId's manifest.
 *  2. The legacy shared bottle (DEFAULT_BRIDGE_BOTTLE_NAME), if ready AND it
 *     holds this appId's manifest.
 *  3. Otherwise `null` — nothing is installed via the bridge for this appId.
 */
export function findBridgeInstallBottle(appId: string): string | null {
  const perGameName = bridgeBottleNameFor(appId)
  if (!perGameName) {
    return null
  }

  if (
    isBridgeBottleReady(perGameName) &&
    existsSync(
      join(getBottleSteamappsDir(perGameName), `appmanifest_${appId}.acf`)
    )
  ) {
    return perGameName
  }

  if (
    isBridgeBottleReady(DEFAULT_BRIDGE_BOTTLE_NAME) &&
    existsSync(
      join(
        getBottleSteamappsDir(DEFAULT_BRIDGE_BOTTLE_NAME),
        `appmanifest_${appId}.acf`
      )
    )
  ) {
    return DEFAULT_BRIDGE_BOTTLE_NAME
  }

  return null
}

/**
 * Composes a GameSettings-shaped object for a bridge bottle, mirroring
 * getSteamBottleSettings() in shape. quick/261016-u1w (D-E): `appId` is now
 * REQUIRED — every bridge-bottle entry point must name the specific game it
 * means, so `tsc` rejects any caller that forgot which one (the Task 1
 * optional/back-compat branch is gone). `appId` resolves the bottle name via
 * resolveBridgeBottleName (D-B) — per-game bottle if ready, else the legacy
 * shared bottle only if it is ready AND holds this appId's manifest, else
 * the per-game name anyway. No per-install override is read back from
 * steamBottleConfigStore; bridge bottle names/engine are not
 * user-configurable.
 *
 * Throws when `appId` fails NUMERIC_APP_ID (e.g. 'abc') — unlike
 * resolveBridgeBottleName, which returns null for the same input, a caller
 * that bothered to pass an appId at all has a specific game in mind;
 * silently falling back to the shared bottle would resolve settings for the
 * WRONG game rather than surfacing the bad id.
 *
 * D-UAT-24-06: `wineVersion` must resolve the CrossOver runtime that CREATED
 * this bottle via cxbottle (D-08 CrossOver-only lifecycle) — never
 * globalSettings.wineVersion, which on a machine with Game Porting Toolkit
 * (GPTK) set as the global default resolves to GPTK's 64-bit-only `wine64`.
 * GPTK has no 32-bit `wine` loader, so a 32-bit bridge game exe aborts
 * instantly (`alloc_pages_vprot` assertion) instead of launching. Falls back
 * to globalSettings.wineVersion only when CrossOver is not present on disk —
 * identical to today's behavior for dev/CI/non-macOS.
 */
function stockBridgeBottleSettings(appId: string): GameSettings {
  const globalSettings = GlobalConfig.get().getSettings()
  const resolved = resolveBridgeBottleName(appId)
  if (!resolved) {
    throw new Error(
      `getBridgeBottleSettings: invalid appId "${appId}" (must be numeric)`
    )
  }
  return {
    ...globalSettings,
    wineCrossoverBottle: resolved,
    wineVersion:
      resolveCrossoverWine('CrossOver (bridge bottle runtime)') ??
      globalSettings.wineVersion
  }
}

/**
 * Phase 56 (56-11): DRM-mode runner for a bridge bottle (D-11).
 *
 * A SteamStub title keeps its own `GameLibSteamBridge-<appid>` bottle, and
 * only the runner changes, to GameLib's patched CrossOver clone. Every wine
 * spawn for that appId must use the same runner, or the bottle's wineserver is
 * started by one runner and joined by another (RESEARCH "Runner clone").
 *
 * The registry below is in-memory and session-scoped. It is filled only by
 * `drmLaunchSetup` and does nothing at module load (sidecar exit contract).
 */
export type DrmLaunchForm = 'bin/wine+CX_BOTTLE' | 'raw WINELOADER+WINEPREFIX'

// 56-01-SUMMARY.md (.planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-01-SUMMARY.md) records: "launch_form: bin/wine+CX_BOTTLE"
export const DRM_LAUNCH_FORM: DrmLaunchForm = 'bin/wine+CX_BOTTLE'

/**
 * The runner paths bottle.ts needs. 56-08's `RunnerReady` is passed as is: it
 * is a structural superset. bottle.ts does not import the drm modules, which
 * keeps the static import graph acyclic.
 */
export type DrmBridgeRunner = {
  crossoverBuild: string
  runnerDir: string
  cxRoot: string
  wrapperBin: string
  wineloaderBin: string
  wineserverBin: string
  windowsDllDir: string
  unixDllDir: string
}

/** Which feature owns a registered runner (D-04: overlay clones live apart). */
export type BridgeRunnerKind = 'drm' | 'overlay'

const BRIDGE_RUNNER_CXROOT_RE =
  /\/steam-bridge\/(drm|overlay)\/runners\/crossover-([0-9]{1,4}(?:\.[0-9]{1,6}){2,4})\/CrossOver$/

const DRM_RUNNER_FIELDS = [
  'crossoverBuild',
  'runnerDir',
  'cxRoot',
  'wrapperBin',
  'wineloaderBin',
  'wineserverBin',
  'windowsDllDir',
  'unixDllDir'
] as const

function isValidDrmRunner(
  runner: DrmBridgeRunner,
  kind: BridgeRunnerKind = 'drm'
): boolean {
  if (!runner || typeof runner !== 'object') return false
  for (const field of DRM_RUNNER_FIELDS) {
    const value = runner[field]
    // eslint-disable-next-line no-control-regex
    if (typeof value !== 'string' || !value || /[\x00-\x1f\x7f]/.test(value)) {
      return false
    }
  }
  const { cxRoot } = runner
  if (!isAbsolute(cxRoot)) return false
  const match = BRIDGE_RUNNER_CXROOT_RE.exec(cxRoot)
  if (!match || match[1] !== kind || match[2] !== runner.crossoverBuild) {
    return false
  }
  return (
    runner.runnerDir === dirname(cxRoot) &&
    runner.wrapperBin === join(cxRoot, 'bin', 'wine') &&
    runner.wineloaderBin === join(cxRoot, 'bin', 'wineloader') &&
    runner.wineserverBin === join(cxRoot, 'bin', 'wineserver') &&
    runner.windowsDllDir === join(cxRoot, 'lib', 'wine', 'x86_64-windows') &&
    runner.unixDllDir === join(cxRoot, 'lib', 'wine', 'x86_64-unix')
  )
}

// 56-01-SUMMARY.md, consequences for 56-11: "swap the wine version to `bin: <clone>/bin/wine`
// with `wineserver: <clone>/bin/wineserver`, keep `type: 'crossover'`".
export function drmRunnerWineInstallation(
  runner: DrmBridgeRunner,
  form: DrmLaunchForm,
  kind: BridgeRunnerKind = 'drm'
): WineInstallation | null {
  try {
    if (form !== 'bin/wine+CX_BOTTLE' && form !== 'raw WINELOADER+WINEPREFIX') {
      return null
    }
    if (!isValidDrmRunner(runner, kind)) return null
    const label = kind === 'overlay' ? 'overlay' : 'DRM'
    const name = `CrossOver ${runner.crossoverBuild} (GameLib ${label} runner)`
    if (form === 'bin/wine+CX_BOTTLE') {
      return {
        bin: runner.wrapperBin,
        wineserver: runner.wineserverBin,
        type: 'crossover',
        name
      }
    }
    return {
      bin: runner.wineloaderBin,
      wineserver: runner.wineserverBin,
      type: 'wine',
      name
    }
  } catch {
    return null
  }
}

/**
 * The DRM-mode settings for a title's OWN bridge bottle: same bottle name as
 * the stock settings (D-11, no new bottle), runner swapped to the clone in the
 * 56-01 launch form. Launch-time env (WINEDLLOVERRIDES, WINEDLLPATH, trace
 * file) is 56-12's. Throws for a bad appId or an invalid runner.
 */
export function getDrmBridgeBottleSettings(
  appId: string,
  runner: DrmBridgeRunner,
  form: DrmLaunchForm = DRM_LAUNCH_FORM,
  kind: BridgeRunnerKind = 'drm'
): GameSettings {
  const stock = stockBridgeBottleSettings(appId)
  const wineVersion = drmRunnerWineInstallation(runner, form, kind)
  if (!wineVersion) {
    throw new Error(
      `getDrmBridgeBottleSettings: invalid DRM runner for appId "${appId}"`
    )
  }
  if (form === 'bin/wine+CX_BOTTLE') {
    return { ...stock, wineVersion }
  }
  const kept = (stock.enviromentOptions ?? []).filter((e) => {
    const key = String(e.key).toUpperCase()
    return key !== 'WINELOADER' && key !== 'WINESERVER'
  })
  return {
    ...stock,
    wineVersion,
    winePrefix: getBottleDir(stock.wineCrossoverBottle),
    enviromentOptions: [
      ...kept,
      { key: 'WINELOADER', value: runner.wineloaderBin },
      { key: 'WINESERVER', value: runner.wineserverBin }
    ]
  }
}

const drmBridgeRunners = new Map<
  string,
  { runner: DrmBridgeRunner; form: DrmLaunchForm; kind: BridgeRunnerKind }
>()

export function setDrmBridgeRunner(
  appId: string,
  runner: DrmBridgeRunner,
  form: DrmLaunchForm = DRM_LAUNCH_FORM
): boolean {
  if (!/^[0-9]{1,10}$/.test(String(appId))) return false
  if (!drmRunnerWineInstallation(runner, form)) return false
  const copy = {} as DrmBridgeRunner
  for (const field of DRM_RUNNER_FIELDS) copy[field] = runner[field]
  drmBridgeRunners.set(appId, { runner: copy, form, kind: 'drm' })
  logInfo(
    `bottle: appId ${appId} uses DRM runner crossover-${copy.crossoverBuild}`,
    LogPrefix.Steam
  )
  return true
}

/**
 * Phase 60 D-04: registers the overlay-only clone for this appId's launch, so
 * every per-appId wine spawn shares one runner and one wineserver. Always the
 * bin/wine+CX_BOTTLE form. Returns false for an invalid appId or runner.
 */
export function setOverlayBridgeRunner(
  appId: string,
  runner: DrmBridgeRunner
): boolean {
  if (!/^[0-9]{1,10}$/.test(String(appId))) return false
  const form: DrmLaunchForm = 'bin/wine+CX_BOTTLE'
  if (!drmRunnerWineInstallation(runner, form, 'overlay')) return false
  const copy = {} as DrmBridgeRunner
  for (const field of DRM_RUNNER_FIELDS) copy[field] = runner[field]
  drmBridgeRunners.set(appId, { runner: copy, form, kind: 'overlay' })
  logInfo(
    `bottle: appId ${appId} uses overlay runner crossover-${copy.crossoverBuild}`,
    LogPrefix.Steam
  )
  return true
}

export function getBridgeRunnerKind(
  appId: string
): BridgeRunnerKind | undefined {
  return drmBridgeRunners.get(appId)?.kind
}

export function clearDrmBridgeRunner(appId: string): void {
  drmBridgeRunners.delete(appId)
}

export function getDrmBridgeRunner(
  appId: string
):
  | { runner: DrmBridgeRunner; form: DrmLaunchForm; kind: BridgeRunnerKind }
  | undefined {
  return drmBridgeRunners.get(appId)
}

export function drmRunnerBinDir(appId: string): string | undefined {
  const entry = drmBridgeRunners.get(appId)
  return entry ? join(entry.runner.cxRoot, 'bin') : undefined
}

function fallbackBridgeBottleSettings(
  appId: string,
  sel: NonCrossoverSelection
): GameSettings {
  const resolved = resolveBridgeBottleName(appId)
  if (!resolved) {
    throw new Error(
      `getBridgeBottleSettings: invalid appId "${appId}" (must be numeric)`
    )
  }
  // Interim (66.3-06): plan 08 converts this module's own GlobalConfig.get() reads.
  return buildFallbackGameSettings(
    resolved,
    sel,
    GlobalConfig.get().getSettings()
  )
}

/**
 * While a DRM runner is registered for this appId (56-11), every caller gets
 * the clone runner, so the redist, known-fix, registry and launch spawns for
 * the title share one wineserver. The bottle name never changes. A DRM runner
 * or overlay runner wins; otherwise a registered non-CrossOver engine (phase 59 fallback or
 * override) is used; otherwise stock CrossOver.
 * See stockBridgeBottleSettings for the stock resolution.
 */
export function getBridgeBottleSettings(appId: string): GameSettings {
  const entry = drmBridgeRunners.get(appId)
  if (entry) {
    return getDrmBridgeBottleSettings(
      appId,
      entry.runner,
      entry.form,
      entry.kind
    )
  }
  const engine = getEngineSelection(appId)
  if (engine && isNonCrossover(engine)) {
    return fallbackBridgeBottleSettings(appId, engine)
  }
  return stockBridgeBottleSettings(appId)
}

// quick/261016-u1w (D-C): matches a per-game bridge bottle name
// (GameLibSteamBridge-<appId>), capturing the numeric appId suffix.
// Derived from DEFAULT_BRIDGE_BOTTLE_NAME rather than hardcoded, so a rename
// of the shared prefix cannot silently desync the two. Module-private —
// only listReadyBridgeBottleNames below needs it.
//
// Built on use, not at module load: bridgeBottle.ts and bottle.ts import each
// other until the lifecycle code leaves bottle.ts, so DEFAULT_BRIDGE_BOTTLE_NAME
// can still be undefined while this module evaluates.
const perGameBridgeBottlePattern = (): RegExp =>
  new RegExp(`^${DEFAULT_BRIDGE_BOTTLE_NAME}-(\\d+)$`)

/**
 * D-C: every bridge bottle that is currently ready — the legacy shared
 * bottle (DEFAULT_BRIDGE_BOTTLE_NAME, first, if ready) followed by every
 * ready per-game bottle (GameLibSteamBridge-<appId>), sorted by ascending
 * numeric appId. Never includes DEFAULT_STEAM_BOTTLE_NAME (Phase 17), a
 * user's own bottle, or a per-game-shaped but non-numeric-suffixed name.
 *
 * The Bottles root is `dirname(getBottleDir(DEFAULT_BRIDGE_BOTTLE_NAME))` —
 * the directory ALL CrossOver bottles live in, shared with the user's own
 * bottles and the Phase 17/GOG/Epic ones. Returns [] without ever calling
 * readdirSync when that root does not exist. A readdirSync throw (e.g.
 * permission denied) is also swallowed and returns [] silently — this is
 * called on every periodic library refresh, so a log line here would repeat
 * every cycle rather than surfacing once (mirrors buildBridgeInstalledMap's
 * own silent catch).
 */
export function listReadyBridgeBottleNames(): string[] {
  const bottlesRoot = dirname(getBottleDir(DEFAULT_BRIDGE_BOTTLE_NAME))
  if (!existsSync(bottlesRoot)) {
    return []
  }

  let entries: string[]
  try {
    entries = readdirSync(bottlesRoot)
  } catch {
    return []
  }

  const perGame = entries
    .map((entry) => {
      const match = perGameBridgeBottlePattern().exec(entry)
      return match ? { name: entry, appId: Number(match[1]) } : null
    })
    .filter(
      (candidate): candidate is { name: string; appId: number } =>
        candidate !== null && isBridgeBottleReady(candidate.name)
    )
    .sort((a, b) => a.appId - b.appId)
    .map((candidate) => candidate.name)

  const legacy = isBridgeBottleReady(DEFAULT_BRIDGE_BOTTLE_NAME)
    ? [DEFAULT_BRIDGE_BOTTLE_NAME]
    : []

  return [...legacy, ...perGame]
}
