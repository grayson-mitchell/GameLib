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
import { dirname, join } from 'path'
import { existsSync, readFileSync } from 'graceful-fs'
import type { GameSettings, WineInstallation } from 'common/types'
import type { ProcessRunner } from 'backend/process/types'
import type { GlobalConfigSlice } from 'backend/config'
import type { Stores } from 'backend/services/types'
import { logWarning, LogPrefix } from 'backend/logger'
// NOTE: `runWineCommand` is imported LAZILY (dynamic import inside the two
// async functions that use it) rather than statically. Importing it at module
// load pulls in backend/launcher -> the full storeManagers barrel (sideload ->
// shortcuts -> fs-extra), which breaks any unit test that imports bottle.ts for
// its pure helpers (e.g. steam/library.ts consumers like games.test.ts). Only
// the provisioning/command functions actually need it, so defer the load.
import { DEFAULT_STEAM_BOTTLE_NAME } from './constants'
import {
  getBottleDir,
  isBottleProvisioned
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

/** What the bottle helpers read: the bottle config store and the global settings. */
export interface SteamBottleDeps {
  stores: { steam: Pick<Stores['steam'], 'steamBottleConfigStore'> }
  config: Pick<GlobalConfigSlice, 'getSettings'>
}

/**
 * The Steam bottle helpers that read the dedicated bottle config store, built once per boot
 * (D-05, 66.3-15) and passed to consumers by slice. Construction reads nothing and does no I/O.
 */
export function createSteamBottle(deps: SteamBottleDeps) {
  /** Resolved per call so construction touches no store. */
  const configStore = () => deps.stores.steam.steamBottleConfigStore

  function persistedWineBins(): string[] {
    const bin = configStore().get_nodefault('wineVersion')?.bin
    return bin ? [bin] : []
  }

  /** True when a CrossOver install with a cxbottle can be located. */
  async function isCrossoverInstalled(rdeps: {
    runner: Pick<ProcessRunner, 'run'>
  }): Promise<boolean> {
    return (
      (await resolveCrossoverBinDirAsync(
        { runner: rdeps.runner },
        { hintWineBins: persistedWineBins() }
      )) !== undefined
    )
  }

  /**
   * isBottleProvisioned() for the Steam bottle: the stored bottle name, falling back to
   * DEFAULT_STEAM_BOTTLE_NAME (the no-argument default that used to live in isBottleProvisioned).
   */
  function isSteamBottleProvisioned(): boolean {
    return isBottleProvisioned(
      configStore().get_nodefault('bottleName') ?? DEFAULT_STEAM_BOTTLE_NAME
    )
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
  function isBottleReady(bottleName?: string): boolean {
    const name =
      bottleName ??
      configStore().get_nodefault('bottleName') ??
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
    if (ready && configStore().get_nodefault('provisioned') !== true) {
      configStore().set('provisioned', true)
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
  function getSteamBottleSettings(): GameSettings {
    const globalSettings = deps.config.getSettings()
    const storedWineVersion = configStore().get_nodefault('wineVersion')
    const storedBottleName = configStore().get_nodefault('wineCrossoverBottle')

    const candidateWineVersion = storedWineVersion ?? globalSettings.wineVersion
    // 34.13 review A-20: OPTIONAL dereference. The pre-539bc979c body was
    // `wineVersion: storedWineVersion ?? globalSettings.wineVersion` — tolerant
    // of both being absent. `library.ts`'s getBottleSteamappsRoot() calls this
    // getter SOLELY for `wineCrossoverBottle`, and that sits on
    // readAcfState(deps, 'bottle')'s hot path: every install poll tick, every
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
      configStore().set('wineVersion', wineVersion)
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
  function persistBottleWineVersion(wineVersion: WineInstallation): void {
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
    configStore().set('wineVersion', wineVersion)
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
  function resolveCrossoverWine(label: string): WineInstallation | undefined {
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

  return {
    configStore,
    persistedWineBins,
    isCrossoverInstalled,
    isSteamBottleProvisioned,
    isBottleReady,
    getSteamBottleSettings,
    persistBottleWineVersion,
    resolveCrossoverWine
  }
}

export type SteamBottle = ReturnType<typeof createSteamBottle>

/** What a consumer that only resolves the bottle's settings (for example its steamapps dir) needs. */
export type BottleSettingsDeps = {
  steamBottle: Pick<
    SteamBottle,
    'getSteamBottleSettings' | 'resolveCrossoverWine'
  >
}

/** What a consumer that reads the bottle's readiness and settings needs. */
export type BottleReadyDeps = {
  steamBottle: Pick<SteamBottle, 'getSteamBottleSettings' | 'isBottleReady'>
}

/** The bottle slice the Steam engine deps add to the generic engine services (66.3-15). */
export type SteamEngineBottle = {
  steamBottle: Pick<SteamBottle, 'persistedWineBins' | 'resolveCrossoverWine'>
}
