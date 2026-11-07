/**
 * Phase 17 (17-02/17-04): dedicated Steam CrossOver bottle foundation +
 * provisioning + bottled-Steam command dispatch.
 *
 * 17-02 laid down the pure path/guard/settings helpers below. 17-04 adds:
 *  - provisionBottle(): create the bottle via the 17-01 LOCKED cxbottle
 *    mechanism, fetch SteamSetup.exe once, run it non-silently (D-02).
 *  - tellBottledSteamTo{Install,Launch,Uninstall}(): appId-guarded (T-17-04),
 *    provisioned-gated verb dispatch to the bottled Steam client via
 *    runWineCommand.
 *
 * Bottled-Steam auth is opaque (D-04) — this module never inspects
 * loginusers.vdf/sentry files; login state is only ever set by the
 * guided-setup flow (17-06) confirming the user completed login.
 */
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { existsSync, readFileSync, rmSync } from 'graceful-fs'
import type { GameSettings, WineInstallation } from 'common/types'
import { GlobalConfig } from 'backend/config'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { spawnAsync } from 'backend/utils'
import {
  killBottleWineServer,
  type ProvisionBottleResult
} from './provisionBottle'
import {
  bridgeBottleNameFor,
  drmRunnerBinDir,
  getDrmBridgeRunner,
  isBridgeBottleReady
} from './bridgeBottle'
// NOTE: `runWineCommand` is imported LAZILY (dynamic import inside the two
// async functions that use it) rather than statically. Importing it at module
// load pulls in backend/launcher -> the full storeManagers barrel (sideload ->
// shortcuts -> fs-extra), which breaks any unit test that imports bottle.ts for
// its pure helpers (e.g. steam/library.ts consumers like games.test.ts). Only
// the provisioning/command functions actually need it, so defer the load.
import { DEFAULT_STEAM_BOTTLE_NAME } from './constants'
import { steamBottleConfigStore } from './stores'
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
import {
  resolveCrossoverBinDir,
  resolveCrossoverBinDirAsync
} from 'backend/engine/crossoverLocation'

// ── Phase 24 (24-04): dedicated bridge bottle (macOS native Steam bridge) ──
// D-08/R6/Pitfall 1: the bridge bottle is a SEPARATE, shared CrossOver
// bottle from the Phase 17 DEFAULT_STEAM_BOTTLE_NAME bottle above — every
// spike ran inside that bottle, which already contains a full bottled
// Windows Steam client, directly conflicting with R6's "no Windows Steam
// client in the bottle" acceptance bar. Distinct name so
// getBridgeBottleSettings()/isBridgeBottleReady() can never accidentally
// resolve the Phase 17 bottle.
export const DEFAULT_BRIDGE_BOTTLE_NAME = 'GameLibSteamBridge'

// CrossOver's cxbottle CLI lives in the CrossOver install's bin dir. Where
// that install is (/Applications, ~/Applications, anywhere mdfind finds it) is
// resolved by ./crossoverLocation — nothing here hard-codes it (quick
// 261024-cjq). GAP-17-CEF-RECREATE-RUNNING: the sibling `wineserver` binary and
// the CrossOver root are derived from the resolved bin dir:
//   wineserver binary = <bin dir>/wineserver
//   CX_ROOT           = dirname(<bin dir>)  (.../SharedSupport/CrossOver)
export const cxbottleIn = (binDir: string): string => join(binDir, 'cxbottle')
export const wineserverIn = (binDir: string): string =>
  join(binDir, 'wineserver')
export const cxRootFrom = (binDir: string): string => dirname(binDir)

export function persistedWineBins(): string[] {
  const bin = steamBottleConfigStore.get_nodefault('wineVersion')?.bin
  return bin ? [bin] : []
}

export const CROSSOVER_MISSING = 'crossover-missing' as const
/** D-12: `cxbottle --create` exceeded its cap (for example an expired trial dialog). */
export const CROSSOVER_CREATE_TIMEOUT = 'crossover-create-timeout' as const
/**
 * 59-REVIEW WR-02: `cxbottle --create` exited (or threw) without producing cxbottle.conf. A
 * non-timeout create failure is how a broken CrossOver most often shows itself, and D-09 routes a
 * broken CrossOver to the built-in engine (the fallback condition itself lives in
 * installBridgeGame).
 */
export const CROSSOVER_CREATE_FAILED = 'crossover-create-failed' as const
/**
 * 59-REVIEW CR-01: bottle creation was cancelled (install abort / quit). Not a failure: the caller
 * must not fall back to another engine.
 */
export const PROVISION_ABORTED = 'provision-aborted' as const
export const CROSSOVER_REQUIRED_MESSAGE =
  'CrossOver is required. Install CrossOver from https://www.codeweavers.com/crossover, then try again.'

/** True when a CrossOver install with a cxbottle can be located. */
export async function isCrossoverInstalled(): Promise<boolean> {
  return (
    (await resolveCrossoverBinDirAsync({
      hintWineBins: persistedWineBins()
    })) !== undefined
  )
}

/**
 * GAP-17-PFX86-PATH: the CrossOver `win10` bottle template does not
 * guarantee a 64-bit prefix. A 32-bit (`win32`) prefix has NO
 * `Program Files (x86)` directory at all — 32-bit apps (including Steam,
 * which is itself a 32-bit executable) install directly under
 * `Program Files`. Verified on real CrossOver 26.2 / macOS: the bottle's
 * `cxbottle.conf` reported `WineArch = win32`, and Steam installed to
 * `drive_c/Program Files/Steam/steam.exe` — NOT `Program Files (x86)`.
 * Hardcoding the x86 path here meant `isBottleReady()` never went true for
 * such a bottle, so the guided flow re-ran SteamSetup.exe on every Install
 * click even though Steam was already installed and working.
 *
 * Order matters: x86 first (win64 prefix, the common/expected CrossOver
 * layout), plain `Program Files` second (win32 prefix fallback).
 */
const STEAM_ROOT_SEGMENTS: string[][] = [
  ['Program Files (x86)', 'Steam'],
  ['Program Files', 'Steam']
]

/**
 * Shared both-root resolver (GAP-17-PFX86-PATH): probes every candidate
 * Steam-root layout inside the bottle's `drive_c` and returns whichever one
 * the bottle actually created. Every bottled-Steam-path consumer
 * (getBottleSteamExePath, getBottleSteamappsDir — and transitively
 * isBottleReady/provisionBottle/dispatchToBottledSteam, which all call
 * those two) MUST route through this single resolver rather than
 * duplicating the probe.
 *
 * Resolution order:
 *  1. The first candidate root whose `steam.exe` exists (the real
 *     "which layout did this bottle actually use" signal).
 *  2. If no candidate has steam.exe yet, the first candidate root whose
 *     directory itself exists (bottle created but Steam not installed).
 *  3. Otherwise the FIRST (x86) candidate, so pre-install path
 *     construction (e.g. the initial provisionBottle download target) is
 *     still deterministic.
 *
 * Pure `existsSync` probe only — never writes to disk.
 */
function resolveBottleSteamRoot(bottleName: string): string {
  const bottleDir = getBottleDir(bottleName)
  const candidateRoots = STEAM_ROOT_SEGMENTS.map((segments) =>
    join(bottleDir, 'drive_c', ...segments)
  )

  const byExe = candidateRoots.find((root) =>
    existsSync(join(root, 'steam.exe'))
  )
  if (byExe) return byExe

  const byDir = candidateRoots.find((root) => existsSync(root))
  if (byDir) return byDir

  return (
    candidateRoots[0] ??
    join(bottleDir, 'drive_c', 'Program Files (x86)', 'Steam')
  )
}

/**
 * The bottle's OWN steamapps ACF root — distinct from the native
 * `defaultSteamPath`. Windows Steam installs here inside the bottle's Wine
 * prefix, regardless of host OS. Resolves under EITHER prefix layout via
 * resolveBottleSteamRoot (GAP-17-PFX86-PATH).
 */
export function getBottleSteamappsDir(bottleName: string): string {
  return join(resolveBottleSteamRoot(bottleName), 'steamapps')
}

/**
 * The bottle's own Windows Steam client executable — the target of every
 * tellBottledSteamTo* dispatch below. Resolves under EITHER prefix layout
 * via resolveBottleSteamRoot (GAP-17-PFX86-PATH).
 */
export function getBottleSteamExePath(bottleName: string): string {
  return join(resolveBottleSteamRoot(bottleName), 'steam.exe')
}

/**
 * isBottleProvisioned() for the Steam bottle: the stored bottle name, falling back to
 * DEFAULT_STEAM_BOTTLE_NAME (the no-argument default that used to live in isBottleProvisioned).
 */
export function isSteamBottleProvisioned(): boolean {
  return isBottleProvisioned(
    steamBottleConfigStore.get_nodefault('bottleName') ??
      DEFAULT_STEAM_BOTTLE_NAME
  )
}

/**
 * GAP-17-CEF-RENDER: reads a bottle's `cxbottle.conf` to determine whether it
 * was created 32-bit (`WineArch = win32`) or 64-bit (`WineArch = win64`). A
 * win32 prefix breaks modern 64-bit Steam's CEF-based install-dialog UI
 * (steamwebhelper composites at "Invalid browser dimensions: 0 x 0"),
 * rendering as a grey, unresponsive bar. This is the pre-guard signal
 * `provisionBottle()` uses to detect a stale win32 bottle and recreate it as
 * win10_64 BEFORE either idempotent guard (isBottleReady / isBottleProvisioned)
 * gets a chance to reuse the stale bottle forever.
 *
 * Mirrors `isBottleProvisioned`'s cxbottle.conf path construction. Reads
 * defensively — any error (file missing/unreadable) returns `null` rather
 * than throwing, since this check must never break provisioning.
 */
export function bottleWineArch(bottleName: string): 'win32' | 'win64' | null {
  const confPath = join(getBottleDir(bottleName), 'cxbottle.conf')
  try {
    const contents = readFileSync(confPath, 'utf-8')
    if (/["']?WineArch["']?\s*=\s*["']?win32["']?/i.test(contents)) {
      return 'win32'
    }
    if (/["']?WineArch["']?\s*=\s*["']?win64["']?/i.test(contents)) {
      return 'win64'
    }
    return null
  } catch {
    return null
  }
}

/**
 * The REAL bottle-readiness signal (per the GAP 1 stuck-loop diagnosis in
 * .planning/debug/steam-bottle-provision-stuck-loop.md): true only when
 * BOTH cxbottle.conf exists AND the bottled Steam.exe exists. cxbottle.conf
 * alone means only that CrossOver created the bottle directory — the Steam
 * install inside it (SteamSetup.exe download + non-silent run) may never
 * have completed, leaving a half-provisioned bottle. Every routing gate in
 * games.ts and the dispatchToBottledSteam pre-flight below must use THIS
 * function, not isBottleProvisioned(), to decide whether it's safe to
 * dispatch commands into the bottled Steam client.
 */
export function isBottleReady(bottleName?: string): boolean {
  const name =
    bottleName ??
    steamBottleConfigStore.get_nodefault('bottleName') ??
    DEFAULT_STEAM_BOTTLE_NAME
  const ready =
    isBottleProvisioned(name) && existsSync(getBottleSteamExePath(name))

  // GAP-17-PROVISIONED-FLAG-STUCK: lazy readiness reconcile (intentional
  // write-through side-effect). `provisioned` used to be derived from a race
  // against the wait:false SteamSetup launch (provisionBottle step 8), so it
  // was persisted `false` while steam.exe was legitimately still absent and
  // then NEVER re-evaluated once the user finished the click-through. Instead,
  // the FIRST time any routing call (games.ts install/launch/uninstall
  // pre-flights, or provisionBottle's step-3 short-circuit) observes a genuinely
  // ready bottle (cxbottle.conf + bottled steam.exe), self-heal the stored flag
  // to `true`. This makes steamBottleStatus (main.ts) read a correct value with
  // no main.ts change. Guarded by get_nodefault so a already-true flag is not
  // needlessly re-written. NEVER writes `false` here — un-readiness is not a
  // signal to un-provision (the win32-recreate branch owns the legitimate reset).
  if (ready && steamBottleConfigStore.get_nodefault('provisioned') !== true) {
    steamBottleConfigStore.set('provisioned', true)
  }

  return ready
}

/**
 * Composes a GameSettings-shaped object for the dedicated Steam bottle,
 * sourced from steamBottleConfigStore and falling back to
 * DEFAULT_STEAM_BOTTLE_NAME / the global default Wine engine. Used wherever
 * a bottled Steam operation needs a GameSettings to hand to runWineCommand.
 *
 * debug/steam-bottle-uninstall-reverts (root cause, mirrors D-UAT-24-06):
 * the dedicated Steam bottle is created and populated entirely via
 * CrossOver's own `cxbottle` mechanism (D-08 CrossOver-only lifecycle) and
 * can only be correctly dispatched into by CrossOver's own `wine` binary —
 * setupWineEnvVars (launcher.ts) sets `CX_BOTTLE` ONLY for
 * `wineVersion.type === 'crossover'`; any other type (e.g. Game Porting
 * Toolkit's `'toolkit'`, which can end up persisted here via an unguarded
 * self-heal write — persistBottleWineVersion() / provisionBottle() step 6 —
 * or simply inherited from globalSettings.wineVersion) instead routes
 * through `WINEPREFIX = gameSettings.winePrefix`, which this function never
 * overrides and which may not even point at a prefix that exists on disk.
 * The result: every dispatchToBottledSteam call (install/launch/uninstall)
 * fires the bottled steam.exe against the WRONG Wine environment and the
 * process exits almost instantly, never becoming a resident Steam client.
 * Resolve CrossOver's own engine whenever the candidate wineVersion isn't
 * already type 'crossover' — falling back to the candidate only when
 * CrossOver itself is absent from disk (dev/CI/non-macOS) — identical
 * posture to getBridgeBottleSettings() below.
 */
export function getSteamBottleSettings(): GameSettings {
  const globalSettings = GlobalConfig.get().getSettings()
  const storedWineVersion = steamBottleConfigStore.get_nodefault('wineVersion')
  const storedBottleName = steamBottleConfigStore.get_nodefault(
    'wineCrossoverBottle'
  )

  const candidateWineVersion = storedWineVersion ?? globalSettings.wineVersion
  // 34.13 review A-20: OPTIONAL dereference. The pre-539bc979c body was
  // `wineVersion: storedWineVersion ?? globalSettings.wineVersion` — tolerant
  // of both being absent. `library.ts`'s getBottleSteamappsRoot() calls this
  // getter SOLELY for `wineCrossoverBottle`, and that sits on
  // readAcfState('bottle')'s hot path: every install poll tick, every
  // uninstall poll tick, buildBottleInstalledMap, refreshInstallState. A
  // `GlobalConfig.getSettings()` result without a `wineVersion` (the sidecar's
  // config layer is a different code path from Electron's, and this repo has
  // ledgered several hollow sidecar stubs) would turn pure path resolution
  // into a TypeError propagating through the ACF readers.
  const wineVersion =
    candidateWineVersion?.type === 'crossover'
      ? candidateWineVersion
      : (resolveCrossoverWine('CrossOver (Steam bottle runtime)') ??
        candidateWineVersion)

  // 34.13 review A-21: the getter PERSISTS its own correction, so the store
  // self-heals ONCE instead of every reader re-deriving it independently.
  // 539bc979c's commit message names the defect as "a Game Porting Toolkit
  // engine WAS PERSISTED for the Steam bottle" and then fixed it in the
  // getter only — so steamBottleConfigStore kept accumulating non-CrossOver
  // engines and every OTHER reader of that key still saw them. The concrete,
  // provable consequence is on 34.13's own surface:
  // getSteamBottleEligibilityVerdict reads the store DIRECTLY and
  // deliberately (installFormIpc.ts documents why it does not use this
  // getter), so the verdict handed to the install form still carried the
  // un-healed engine. Guarded by an identity check so a store that is already
  // correct is never needlessly re-written (the get_nodefault discipline used
  // by the `provisioned` self-heal above).
  if (
    wineVersion &&
    wineVersion !== storedWineVersion &&
    wineVersion.type === 'crossover' &&
    storedWineVersion?.type !== 'crossover'
  ) {
    steamBottleConfigStore.set('wineVersion', wineVersion)
  }

  return {
    ...globalSettings,
    wineCrossoverBottle: storedBottleName ?? DEFAULT_STEAM_BOTTLE_NAME,
    wineVersion
  }
}

/**
 * debug/steam-bottle-game-no-launch (Pitfall 6, real-game-launch case):
 * checkWineBeforeLaunch's self-heal persists a corrected wineVersion via
 * `GameConfig.get(gameInfo.app_name).setSetting('wineVersion', ...)` — a
 * store getSteamBottleSettings() never reads. provisionBottle() (step 6
 * above) already works around this for its OWN synthetic-appName validation
 * call by re-persisting the result into steamBottleConfigStore itself; the
 * same gap exists at the REAL per-game launch checkpoint
 * (launcher.ts's launchEventCallback), which checkWineBeforeLaunch's
 * generic appName-keyed self-heal can never reach. Exported so launcher.ts
 * can call this immediately after a successful checkWineBeforeLaunch for a
 * Steam bottle-eligible game, mirroring provisionBottle's own pattern —
 * without this, a self-healed wine correction is silently dropped and every
 * subsequent dispatchToBottledSteam() call (install/launch/uninstall) keeps
 * reading the SAME broken wineVersion via getSteamBottleSettings().
 */
export function persistBottleWineVersion(wineVersion: WineInstallation): void {
  // 34.13 review A-21: this seam stays PERMISSIVE by an existing, recorded
  // decision (review B-WR-08) — `launcher.ts`'s checkWineBeforeLaunch
  // self-heal is a legitimate producer of a non-CrossOver value here, so
  // rejecting outright would break the very recovery path this function
  // exists to serve. The accumulation is instead made DIAGNOSABLE here and
  // self-healing in getSteamBottleSettings() above, which now persists its
  // own CrossOver correction once rather than leaving every other reader of
  // this key (notably getSteamBottleEligibilityVerdict, which reads the store
  // directly and deliberately) to re-derive it or not at all.
  if (wineVersion.type !== 'crossover') {
    logWarning(
      `Steam: persisting a non-CrossOver engine (type "${wineVersion.type}") for the Steam bottle — D-08's lifecycle is CrossOver-only, so getSteamBottleSettings() will correct and re-persist this on the next read`,
      LogPrefix.Steam
    )
  }
  steamBottleConfigStore.set('wineVersion', wineVersion)
}

/**
 * D-UAT-24-06 gap closure (24-15) — GENERALIZED (debug/steam-bottle-
 * uninstall-reverts): resolves CrossOver's OWN wine binary — derived from
 * the resolved CrossOver bin dir (sibling `wine` binary, exactly the
 * path backend/utils/compatibility_layers.ts's getCrossover() computes) —
 * rather than importing that async detector (which would force callers
 * async and ripple to their synchronous callers, see module docstring
 * above). Shared by BOTH the dedicated Steam bottle (getSteamBottleSettings)
 * and the bridge bottle (getBridgeBottleSettings) below — both are
 * CrossOver-created bottles (D-08 CrossOver-only lifecycle) and neither can
 * be correctly dispatched into by a non-CrossOver engine (setupWineEnvVars
 * only wires `CX_BOTTLE` for `type: 'crossover'`; anything else silently
 * routes through `WINEPREFIX` instead, which these getters never point at
 * the actual CrossOver bottle).
 *
 * Returns undefined when CrossOver's `wine` binary is not present on disk
 * (dev/CI/non-macOS), so the caller can fall back to another wineVersion.
 */
export function resolveCrossoverWine(
  label: string
): WineInstallation | undefined {
  const binDir = resolveCrossoverBinDir({ hintWineBins: persistedWineBins() })
  if (!binDir) {
    return undefined
  }
  const crossoverWineBin = join(binDir, 'wine')
  if (!existsSync(crossoverWineBin)) {
    return undefined
  }
  return {
    bin: crossoverWineBin,
    name: label,
    type: 'crossover',
    wineserver: wineserverIn(binDir)
  }
}

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
  const storedPhase17Name = steamBottleConfigStore.get_nodefault('bottleName')
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
  await killBottleWineServer(name)

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
      await spawnAsync(cxbottleIn(removeBinDir), [
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
  appId: string,
  name: string,
  timeoutMs?: number,
  engineHint?: { wineserverBin: string }
): Promise<boolean> {
  if (getDrmBridgeRunner(appId)) {
    return killBottleWineServer(name, drmRunnerBinDir(appId), timeoutMs)
  }
  const engine = getEngineSelection(appId)
  if (engine && isNonCrossover(engine)) {
    return killBottleWineServerWith(
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
  return killBottleWineServer(name, undefined, timeoutMs)
}

/**
 * Phase 60 D-04: like endPerGameBridgeBottleSession, but stops with an explicit
 * wineserver bin dir (undefined = stock CrossOver). Used when the registered
 * runner changes after drmLaunchSetup has already cleared the entry, so the stop
 * must use the PREVIOUS runner's own wineserver (RESEARCH Pitfall 2): a clone
 * never joins a stock wineserver or the reverse. Same guards; never throws.
 */
export async function endPerGameBridgeBottleSessionWith(
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
    return await killBottleWineServer(name, runnerBinDir, timeoutMs)
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
  appId: string,
  timeoutMs: number
): Promise<boolean> {
  try {
    const guard = guardPerGameBridgeBottleName(
      appId,
      'killBridgeBottleWineServer'
    )
    if (!guard.ok) return false
    return await killForRegisteredEngine(appId, guard.name, timeoutMs)
  } catch (error) {
    logWarning(
      [`killBridgeBottleWineServer: failed for appId "${appId}"`, error],
      LogPrefix.Steam
    )
    return false
  }
}

export async function stopPerGameBridgeBottle(
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
  await killForRegisteredEngine(appId, name)
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
    return await killForRegisteredEngine(appId, name, timeoutMs, engineHint)
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

export async function provisionBridgeBottle(opts: {
  bottleName: string
  wineVersion?: WineInstallation
  /** Phase 59: create with this engine instead of CrossOver (D-01). */
  fallbackEngine?: NonCrossoverEngine
  /** D-12: hard cap for `cxbottle --create`, in ms. */
  createTimeoutMs?: number
  /** 59-REVIEW CR-01: aborts bottle creation and removes what this call created. */
  signal?: AbortSignal
}): Promise<ProvisionBottleResult> {
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
    return createFallbackBottle(bottleName, opts.fallbackEngine, opts.signal)
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
    await killBottleWineServer(bottleName, binDir, 15_000)
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
        ? await spawnAsync(cxbottleIn(binDir), createArgv, {
            timeout: opts.createTimeoutMs,
            signal: opts.signal
          })
        : await spawnAsync(cxbottleIn(binDir), createArgv, {
            signal: opts.signal
          })
    if (opts.signal?.aborted) return await abortedCrossOver()
    if (code === null && opts.createTimeoutMs !== undefined) {
      logError(
        `provisionBridgeBottle: cxbottle create for "${bottleName}" hit its ${opts.createTimeoutMs} ms cap (D-12)`,
        LogPrefix.Steam
      )
      await killBottleWineServer(bottleName, binDir, 15_000)
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
      await killBottleWineServer(bottleName, binDir, 15_000)
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
    await killBottleWineServer(bottleName, binDir, 15_000)
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
  await killBottleWineServer(bottleName, binDir)

  logInfo(
    `provisionBridgeBottle: bridge bottle "${bottleName}" created (no Windows Steam client installed — R6)`,
    LogPrefix.Steam
  )

  return { status: 'done', createdHere }
}
