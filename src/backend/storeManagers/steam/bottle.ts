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
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'graceful-fs'
import { app } from 'backend/platform'
import type { GameInfo, GameSettings, WineInstallation } from 'common/types'
import { userHome } from 'backend/constants/paths'
import { GlobalConfig } from 'backend/config'
import {
  getRunnerLogWriter,
  logError,
  logInfo,
  logWarning,
  LogPrefix
} from 'backend/logger'
import { checkWineBeforeLaunch, spawnAsync } from 'backend/utils'
import { downloadSetupPayload } from './setupDownloads'
// NOTE: `runWineCommand` is imported LAZILY (dynamic import inside the two
// async functions that use it) rather than statically. Importing it at module
// load pulls in backend/launcher -> the full storeManagers barrel (sideload ->
// shortcuts -> fs-extra), which breaks any unit test that imports bottle.ts for
// its pure helpers (e.g. steam/library.ts consumers like games.test.ts). Only
// the provisioning/command functions actually need it, so defer the load.
import {
  DEFAULT_STEAM_BOTTLE_NAME,
  STEAM_BOTTLE_RESERVED_APPNAME,
  STEAM_SETUP_EXE_URL,
  steamSupportPath
} from './constants'
import { steamBottleConfigStore } from './electronStores'
import { library } from './state'
import {
  resolveCrossoverBinDir,
  resolveCrossoverBinDirAsync
} from './crossoverLocation'

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
const cxbottleIn = (binDir: string): string => join(binDir, 'cxbottle')
const wineserverIn = (binDir: string): string => join(binDir, 'wineserver')
const cxRootFrom = (binDir: string): string => dirname(binDir)

function persistedWineBins(): string[] {
  const bin = steamBottleConfigStore.get_nodefault('wineVersion')?.bin
  return bin ? [bin] : []
}

export const CROSSOVER_MISSING = 'crossover-missing' as const
const CROSSOVER_REQUIRED_MESSAGE =
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
 * Directory of a named CrossOver bottle.
 * `<userHome>/Library/Application Support/CrossOver/Bottles/<bottleName>`
 */
export function getBottleDir(bottleName: string): string {
  return join(
    userHome,
    'Library/Application Support/CrossOver/Bottles',
    bottleName
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

  return candidateRoots[0]
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
 * `bottleName` defaults to the stored bottle name, falling back to
 * DEFAULT_STEAM_BOTTLE_NAME.
 *
 * NOTE: this retains its narrow, original meaning — "the bottle directory
 * has been created" — NOT "the bottle is ready to use". A bottle can have
 * cxbottle.conf on disk while the bottled Steam.exe install never completed
 * (half-provisioned, e.g. the SteamSetup.exe download failed). Used by
 * provisionBottle() to decide whether `cxbottle --create` needs to run again
 * (re-entrancy check). For the REAL completion signal, use isBottleReady().
 */
export function isBottleProvisioned(bottleName?: string): boolean {
  const name =
    bottleName ??
    steamBottleConfigStore.get_nodefault('bottleName') ??
    DEFAULT_STEAM_BOTTLE_NAME
  return existsSync(join(getBottleDir(name), 'cxbottle.conf'))
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

// GAP 5: bottled-Steam installer process names to raise to the front. The
// guided provisioning installer is `SteamSetup.exe`; a per-game bottled install
// surfaces the bottled Windows Steam client `steam.exe`. Deliberately NOT the
// native macOS Steam client (`steam_osx`), which may also be running.
const INSTALLER_PROCESS_NAMES = ['SteamSetup.exe', 'steam.exe']

/**
 * GAP 5 fix (macOS-only, fire-and-forget): the installer window is owned by a
 * separate, UNBUNDLED CrossOver/Wine process that appears a few seconds AFTER
 * dispatch — diagnosed via GAP5-DIAG as `SteamSetup.exe` (provisioning) /
 * bottled `steam.exe` (per-game install), each its OWN foreground macOS app
 * with bundleId "missing value". Because it has no bundle id AND (in CrossOver
 * per-app mode) is a distinct app from the CrossOver host, we target the
 * process directly BY NAME and raise it via System Events `set frontmost` —
 * the scripted-user action that should defeat macOS focus-stealing protection.
 *
 * We poll (~1.5s cadence, ~18s window) because the process appears after the
 * wine launcher runs; once raised, we re-raise once to catch the splash->main
 * window transition. If the installer process never appears, we fall back to
 * app.hide() (the previous best-effort yield) so GameLib at least steps aside.
 *
 * GameLib's window + guided banner stay VISIBLE on the success path — we do NOT
 * touch GameLib's own window state. In particular, when GameLib is in native
 * fullscreen (its own macOS Space), `set frontmost` on the installer makes
 * macOS auto-switch Spaces to the installer (the "scroll" to its Space) rather
 * than us yanking GameLib out of fullscreen (17-UAT refinement). Every step is
 * guarded; failure never affects the install flow. No-op on Linux/Windows.
 */
// Steam's OWN client/helper processes running inside the bottle. When we raise
// a LAUNCHED game's window (GAP-17-LAUNCH-FOCUS) we must skip these — the game
// is a DIFFERENT unbundled `.exe`, and raising steam.exe/steamwebhelper would
// pull the client forward instead of the game.
const STEAM_CLIENT_PROCESS_NAMES = [
  'steam.exe',
  'steamwebhelper.exe',
  'SteamSetup.exe',
  'GameOverlayUI.exe'
]

/**
 * GAP C (17-16) leak-safe cancellation state. The raise poll loop is fired
 * `void` (fire-and-forget) from provisionBottle/dispatch, so under Jest its
 * real ~18s `sleep` retry survived teardown — keeping the worker alive ("A
 * worker process has failed to exit gracefully") and, worse, firing a dynamic
 * `import(...)` after the environment was torn down ("import a file after the
 * Jest environment has been torn down"). We (a) unref every retry timer so a
 * pending sleep never keeps the process alive, and (b) gate each iteration on a
 * cancellation flag so no `import`/spawn runs after teardown.
 */
let bottledRaiseLoopsCancelled = false
const activeRaiseTimers = new Set<ReturnType<typeof setTimeout>>()

/**
 * Test-only teardown hook (GAP C): cancel any in-flight raise loop and clear
 * every tracked retry timer so no loop survives a test (`jest.getTimerCount()`
 * returns to 0). Production never calls this — the flag is reset at the start of
 * each raise loop, so a prior cancel never suppresses a legitimate later raise.
 */
export function __stopBottledRaiseLoops(): void {
  bottledRaiseLoopsCancelled = true
  for (const handle of activeRaiseTimers) {
    clearTimeout(handle)
  }
  activeRaiseTimers.clear()
}

/**
 * Shared raise-to-front core (macOS-only, fire-and-forget). Polls (~1.5s
 * cadence, ~18s window) running a caller-supplied AppleScript that returns
 * either "<name> pid=<n>" for the raised process or "none". On a hit it
 * re-raises once (splash -> main-window settle); on a persistent miss it falls
 * back to app.hide() so GameLib at least steps aside. Every step is guarded —
 * failure never affects the install/launch flow. No-op on Linux/Windows.
 */
async function raiseFrontmostBottledProcess(
  context: string,
  raiseScript: string
): Promise<void> {
  try {
    // GAP C: a fresh loop clears any prior cancellation (teardown hook only
    // suppresses loops that are already in flight, never future ones).
    bottledRaiseLoopsCancelled = false

    const { isMac } = await import('backend/constants/environment')
    if (!isMac || bottledRaiseLoopsCancelled) {
      return
    }

    // GAP C: unref the retry timer so a pending sleep never keeps the Node
    // (Jest worker) process alive; track the handle so the teardown hook can
    // clear it. Optional-chained unref is a no-op in any non-Node context.
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const handle = setTimeout(() => {
          activeRaiseTimers.delete(handle)
          resolve()
        }, ms)
        activeRaiseTimers.add(handle)
        handle.unref?.()
      })
    const tryRaise = async (): Promise<string | null> => {
      try {
        const { stdout } = await spawnAsync('osascript', ['-e', raiseScript])
        const out = stdout.trim()
        return out && out !== 'none' ? out : null
      } catch (error) {
        logWarning(
          [
            `raiseFrontmostBottledProcess [${context}]: osascript raise failed`,
            error
          ],
          LogPrefix.Steam
        )
        return null
      }
    }

    let raised: string | null = null
    for (let attempt = 0; attempt < 12 && !raised; attempt++) {
      if (bottledRaiseLoopsCancelled) return
      await sleep(1500)
      if (bottledRaiseLoopsCancelled) return
      raised = await tryRaise()
    }

    if (raised) {
      logInfo(
        `raiseFrontmostBottledProcess [${context}]: raised to front (${raised})`,
        LogPrefix.Steam
      )
      // Re-raise once after the window settles (splash -> main UI).
      if (bottledRaiseLoopsCancelled) return
      await sleep(2500)
      if (bottledRaiseLoopsCancelled) return
      await tryRaise()
    } else if (bottledRaiseLoopsCancelled) {
      return
    } else {
      logWarning(
        `raiseFrontmostBottledProcess [${context}]: no matching process within ~18s — falling back to app.hide()`,
        LogPrefix.Steam
      )
      try {
        // quick/260815-vvz (defect 1): this line used to destructure `app` off a native
        // dynamic ESM import of the 'electron' module, awaited inline right here. That
        // bypasses the sidecar's `Module._load` electron interception
        // (`installElectronHook.ts`), because esbuild's `--external:electron` (package.json's
        // `build:sidecar`) leaves such a dynamic import as a real ESM one in the CJS bundle
        // rather than downleveling it to a `require()`. Node's ESM loader never consults
        // `Module._load`, so the real `electron` npm package (whose CJS export is a bare path
        // STRING) loaded instead, and `app` resolved to `undefined` -- this fallback threw
        // `TypeError: Cannot read properties of undefined (reading 'hide')` instead of
        // yielding. The static `app` import at the top of this file compiles to a plain
        // `require()`, which the hook DOES intercept, and gets the real stub.
        // `externalDynamicImportGate.test.ts` now guards this class of defect permanently.
        app.hide()
      } catch (error) {
        logWarning(
          [
            `raiseFrontmostBottledProcess [${context}]: app.hide fallback failed`,
            error
          ],
          LogPrefix.Steam
        )
      }
    }
  } catch (error) {
    logWarning(
      [`raiseFrontmostBottledProcess [${context}]: failed`, error],
      LogPrefix.Steam
    )
  }
}

async function raiseInstallerWindow(context: string): Promise<void> {
  const nameClause = INSTALLER_PROCESS_NAMES.map((n) => `name is "${n}"`).join(
    ' or '
  )
  // GAP C (17-16): conservative focus reliability — filter to `visible is true`
  // processes (mirroring the already-working raiseBottledGameWindow) and pick
  // the FIRST visible match, so we never target a hidden/background helper of
  // the same name (`item 1 of procs` could otherwise select one).
  const raiseScript = [
    'tell application "System Events"',
    `set procs to (every process whose visible is true and (${nameClause}))`,
    'if procs is {} then return "none"',
    'set p to item 1 of procs',
    'set frontmost of p to true',
    'return (name of p) & " pid=" & (unix id of p)',
    'end tell'
  ].join('\n')
  await raiseFrontmostBottledProcess(context, raiseScript)
}

/**
 * GAP-17-LAUNCH-FOCUS (macOS-only, fire-and-forget): after a bottled game is
 * launched via `-applaunch`, the game window is a SEPARATE unbundled Wine
 * process (the game's own `.exe`) that macOS focus-stealing protection leaves
 * behind GameLib. Bottled Windows executables end in `.exe` (native macOS apps
 * do not), so we raise the frontmost visible `.exe` process that is NOT one of
 * Steam's own client/helper processes — i.e. the launched game itself.
 */
async function raiseBottledGameWindow(context: string): Promise<void> {
  const excludeList = STEAM_CLIENT_PROCESS_NAMES.map((n) => `"${n}"`).join(', ')
  const raiseScript = [
    'tell application "System Events"',
    `set steamNames to {${excludeList}}`,
    'set procs to (every process whose visible is true and name ends with ".exe")',
    'repeat with p in procs',
    '  if (name of p) is not in steamNames then',
    '    set frontmost of p to true',
    '    return (name of p) & " pid=" & (unix id of p)',
    '  end if',
    'end repeat',
    'return "none"',
    'end tell'
  ].join('\n')
  await raiseFrontmostBottledProcess(context, raiseScript)
}

// ── 17-04: bottle provisioning ──────────────────────────────────────────────

export type ProvisionBottleResult = {
  status: 'done' | 'error'
  error?: string
  errorCode?: typeof CROSSOVER_MISSING
}

/**
 * GAP-17-CEF-RECREATE-RUNNING: stop the target bottle's OWN Wine processes so a
 * subsequent `cxbottle --delete` cannot abort with "There are still
 * applications running… Aborting" (the exact failure hit in the CEF grey-bar
 * scenario the win32->win64 recreate targets — the user reaches the grey bar
 * *because* the bottled Steam client is running, and that same running Steam
 * blocks the delete).
 *
 * SCOPE-FENCE (T-17-DoS): `WINEPREFIX` MUST be `getBottleDir(bottleName)` — the
 * dedicated Steam bottle's own prefix — and NOTHING else. Never the shared
 * `GameLib` GOG/Epic bottle dir, and never unset/empty (an unset WINEPREFIX
 * would let `wineserver -k` hit the default prefix and DoS unrelated bottles).
 * `bottleName` is already sanitized by provisionBottle (T-17-01) before reaching
 * here. `CX_ROOT` is required so the CrossOver-bundled wineserver resolves its
 * own libraries. Best-effort: a kill failure logs a warning and MUST NOT abort
 * provisioning (the rmSync fallback + recreate still run).
 */
async function killBottleWineServer(
  bottleName: string,
  knownBinDir?: string,
  timeoutMs?: number
): Promise<boolean> {
  const binDir =
    knownBinDir ??
    (await resolveCrossoverBinDirAsync({ hintWineBins: persistedWineBins() }))
  if (!binDir) {
    logWarning(
      `killBottleWineServer: no CrossOver install found, skipping wineserver -k for "${bottleName}"`,
      LogPrefix.Steam
    )
    return false
  }
  try {
    const result = await spawnAsync(wineserverIn(binDir), ['-k'], {
      env: {
        ...process.env,
        WINEPREFIX: getBottleDir(bottleName),
        CX_ROOT: cxRootFrom(binDir)
      },
      ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {})
    })
    if (result?.code === null) {
      logWarning(
        `killBottleWineServer: wineserver -k for bottle "${bottleName}" was killed by its timeout`,
        LogPrefix.Steam
      )
      return false
    }
    return true
  } catch (error) {
    logWarning(
      [
        `killBottleWineServer: wineserver -k for bottle "${bottleName}" failed (best-effort — provisioning continues)`,
        error
      ],
      LogPrefix.Steam
    )
    return false
  }
}

/**
 * Creates the dedicated Steam CrossOver bottle (via the 17-01 LOCKED
 * mechanism), fetches the official SteamSetup.exe once, and runs it
 * NON-SILENTLY inside the bottle so the user clicks through the real
 * installer window (guided click-through provisioning, D-02).
 *
 * Idempotent: if the bottle already exists (isBottleProvisioned() true),
 * short-circuits without re-creating or re-downloading anything.
 *
 * Never hangs silently on the documented steamwebhelper self-update issue
 * (Pitfall 4 / A3) — the installer is launched with `wait: false`, so this
 * function always returns promptly; it does not (and cannot) wait for the
 * user to finish clicking through the installer or for Steam to finish its
 * own first-run update.
 */
export async function provisionBottle(opts?: {
  bottleName?: string
  wineVersion?: WineInstallation
}): Promise<ProvisionBottleResult> {
  const rawName = opts?.bottleName ?? DEFAULT_STEAM_BOTTLE_NAME
  const bottleName = sanitizeBottleName(rawName)

  // (1) Reject unsafe names before any path/argv construction (T-17-01).
  if (!bottleName) {
    logError(
      `provisionBottle: rejected unsafe bottle name "${rawName}" (T-17-01)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid bottle name: "${rawName}"` }
  }

  // (1b) CR-01 (17-17) AUTHORITATIVE scope guard (D-01): refuse to provision
  // Steam into the shared GameLib GOG/Epic Wine bottle. This is the SINGLE
  // source of correctness — it MUST hold even if a future or renderer caller
  // passes the shared bottle name, precisely because the downstream
  // win32-recreate branch (step 2b) would otherwise `killBottleWineServer` +
  // `cxbottle --delete --force` + `rmSync(getBottleDir(...))` the shared bottle
  // (irrecoverable data loss), and the win64 path would install a multi-GB
  // Steam client into it. Placed AFTER sanitize (so `bottleName` is trimmed) and
  // BEFORE any store write / cxbottle delete-create / rmSync. Compared against
  // the TRIMMED shared value so a whitespace-padded config value cannot slip
  // past. An unset/empty shared value is inert — it never blocks provisioning.
  const sharedBottle = GlobalConfig.get().getSettings().wineCrossoverBottle
  if (
    typeof sharedBottle === 'string' &&
    sharedBottle.trim() &&
    bottleName === sharedBottle.trim()
  ) {
    logError(
      `provisionBottle: refusing to provision Steam into the shared GameLib GOG/Epic Wine bottle "${bottleName}" (CR-01 / D-01) — the dedicated Steam bottle must stay distinct`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: 'Refusing to provision Steam into the shared Wine bottle.'
    }
  }

  // (1c) CrossOver-only, mirroring provisionBridgeBottle's D-08 guard: reject
  // a non-CrossOver engine before any side effect — do not silently persist a
  // broken GPTK/toolkit bottle (steam-bottle-gptk-engine-produces-broken-bottle.md).
  // Placed BEFORE the step (2) store write below, same as the bridge sibling.
  if (opts?.wineVersion && opts.wineVersion.type !== 'crossover') {
    logError(
      `provisionBottle: rejected non-CrossOver engine "${opts.wineVersion.type}" for bottle "${bottleName}" (steam-bottle-gptk-engine-produces-broken-bottle.md)`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `The Steam bottle requires a CrossOver engine, got "${opts.wineVersion.type}"`
    }
  }

  // (1d) quick 261024-cjq: CrossOver precondition. Resolved right after the
  // engine guard and before any store write or spawn. A ready bottle with
  // CrossOver since uninstalled still short-circuits 'done' (step 3), so the
  // missing-CrossOver error is returned only when a recreate or a create is
  // actually needed.
  const binDir = await resolveCrossoverBinDirAsync({
    wineVersion: opts?.wineVersion,
    hintWineBins: persistedWineBins()
  })
  const needsCxbottle =
    !isBottleReady(bottleName) ||
    (isBottleProvisioned(bottleName) && bottleWineArch(bottleName) === 'win32')
  if (!binDir && needsCxbottle) {
    logWarning(
      `provisionBottle: CrossOver not found, cannot provision bottle "${bottleName}"`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      errorCode: CROSSOVER_MISSING,
      error: CROSSOVER_REQUIRED_MESSAGE
    }
  }

  // (2) Persist the chosen wine/bottle identity before composing settings.
  steamBottleConfigStore.set('bottleName', bottleName)
  steamBottleConfigStore.set('wineCrossoverBottle', bottleName)
  if (opts?.wineVersion) {
    steamBottleConfigStore.set('wineVersion', opts.wineVersion)
  }

  // (2b) GAP-17-CEF-RENDER: a win32 bottle cannot be converted in place — it
  // must be detected and recreated as win10_64 BEFORE either idempotent guard
  // below (isBottleReady / isBottleProvisioned) gets a chance to reuse the
  // stale bottle forever. Only bottle STATE (`provisioned`) is reset here;
  // GameLib's Steam ACCOUNT auth (refreshToken/isLoggedIn/userData) is never
  // touched — bottled-client login lives inside the prefix, so re-login in
  // the fresh bottle is inherent and expected (MACSTEAM-02/MACSTEAM-04).
  if (
    isBottleProvisioned(bottleName) &&
    bottleWineArch(bottleName) === 'win32'
  ) {
    logInfo(
      `provisionBottle: bottle "${bottleName}" is a stale 32-bit (win32) prefix — recreating as win10_64 (GAP-17-CEF-RENDER)`,
      LogPrefix.Steam
    )
    // GAP-17-CEF-RECREATE-RUNNING: stop the bottle's OWN Wine processes first —
    // WINEPREFIX-scoped (T-17-DoS) — so `cxbottle --delete` does not abort while
    // the bottled Steam client/steamwebhelper is still running.
    await killBottleWineServer(bottleName, binDir)
    try {
      await spawnAsync(cxbottleIn(binDir as string), [
        '--bottle',
        bottleName,
        '--delete',
        '--force'
      ])
    } catch (error) {
      logWarning(
        [
          'provisionBottle: cxbottle --delete of the stale win32 bottle threw',
          error
        ],
        LogPrefix.Steam
      )
    }
    // Fallback: if cxbottle.conf lingered (delete failed/incomplete), remove
    // the bottle directory directly so the create-guard below rebuilds fresh.
    if (isBottleProvisioned(bottleName)) {
      try {
        rmSync(getBottleDir(bottleName), { recursive: true, force: true })
      } catch (error) {
        logWarning(
          [
            'provisionBottle: fallback rmSync of the stale win32 bottle dir threw',
            error
          ],
          LogPrefix.Steam
        )
      }
    }
    // Reset ONLY bottle state — never touch refreshToken/isLoggedIn/userData.
    steamBottleConfigStore.set('provisioned', false)
  }

  // (3) Idempotent short-circuit — bottle is FULLY ready (conf + steam.exe).
  // A half-provisioned bottle (conf only) must NOT short-circuit here — it
  // needs to resume (self-heal) via steps 4-7 below.
  if (isBottleReady(bottleName)) {
    return { status: 'done' }
  }

  // (4) CREATE the bottle via the 17-01 LOCKED mechanism (win10_64 per
  // GAP-17-CEF-RENDER — win10 is CrossOver's 32-bit template and its win32
  // prefix breaks modern 64-bit Steam's CEF install-dialog UI (0x0 render);
  // MACSTEAM-02) — argv form only, arguments as discrete words, never a
  // shell-interpolated string. Skipped when cxbottle.conf already exists
  // (half-provisioned bottle being resumed) — re-running `cxbottle --create`
  // on an existing bottle is unnecessary and this resumes straight into the
  // download/install step.
  if (!isBottleProvisioned(bottleName)) {
    try {
      const { code, stderr } = await spawnAsync(cxbottleIn(binDir as string), [
        '--create',
        '--bottle',
        bottleName,
        '--template',
        'win10_64'
      ])
      if (!isBottleProvisioned(bottleName)) {
        // log-secret-gate-exempt: stderr of cxbottle create (bottle provisioning), not an auth command
        logError(
          [
            'provisionBottle: cxbottle create did not produce cxbottle.conf for',
            bottleName,
            `(code=${code}):`,
            stderr
          ],
          LogPrefix.Steam
        )
        return {
          status: 'error',
          error: `Failed to create CrossOver bottle "${bottleName}"`
        }
      }
    } catch (error) {
      logError(
        ['provisionBottle: cxbottle create threw', error],
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: `Failed to create CrossOver bottle "${bottleName}": ${String(error)}`
      }
    }
  } else {
    logInfo(
      `provisionBottle: resuming half-provisioned bottle "${bottleName}" (cxbottle.conf exists, Steam.exe missing) — skipping cxbottle --create`,
      LogPrefix.Steam
    )
  }

  // (5) Download the official SteamSetup.exe (HTTPS only — T-17-02), reusing
  // a cached copy on re-provision. mkdirSync the redist dir first (recursive
  // is idempotent, no throw if it already exists) — closes the ENOENT that
  // caused "Failed to download SteamSetup.exe" per the debug root cause.
  const steamSetupDir = join(steamSupportPath, 'redist')
  const steamSetupExePath = join(steamSetupDir, 'SteamSetup.exe')
  mkdirSync(steamSetupDir, { recursive: true })
  if (!existsSync(steamSetupExePath)) {
    try {
      await downloadSetupPayload('steam-bottle', {
        url: STEAM_SETUP_EXE_URL,
        dest: steamSetupExePath
      })
    } catch (error) {
      logError(
        ['provisionBottle: failed to download SteamSetup.exe', error],
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: `Failed to download SteamSetup.exe: ${String(error)}`
      }
    }
  }

  // (6) Pitfall 6: checkWineBeforeLaunch writes recovery via
  // GameConfig.get(appName).setSetting('wineVersion', ...) — use the
  // reserved synthetic appName so it never collides with a real game.
  const bottleSettings = getSteamBottleSettings()
  try {
    const syntheticGameInfo: GameInfo = {
      runner: 'steam',
      app_name: STEAM_BOTTLE_RESERVED_APPNAME,
      art_cover: '',
      art_square: '',
      install: {},
      is_installed: false,
      title: 'GameLib Steam Bottle',
      canRunOffline: true
    }
    const logWriter = getRunnerLogWriter('steam')
    const wineOk = await checkWineBeforeLaunch(
      syntheticGameInfo,
      bottleSettings,
      logWriter
    )
    if (wineOk && bottleSettings.wineVersion) {
      steamBottleConfigStore.set('wineVersion', bottleSettings.wineVersion)
    }
  } catch (error) {
    logWarning(
      ['provisionBottle: checkWineBeforeLaunch recovery step failed', error],
      LogPrefix.Steam
    )
  }

  // (7) Run the installer NON-SILENTLY (D-02) — no /S or /VERYSILENT flags,
  // the user sees and clicks through the real installer window.
  try {
    // GAP 5: raise the installer to the front once it appears (fire-and-forget).
    // Kicked off BEFORE awaiting runWineCommand — that await does not resolve
    // until the installer closes, so it must not gate the raise.
    void raiseInstallerWindow('provision-SteamSetup')
    const { runWineCommand } = await import('backend/launcher')
    await runWineCommand({
      commandParts: [steamSetupExePath],
      gameSettings: getSteamBottleSettings(),
      wait: false,
      protonVerb: 'run',
      skipPrefixCheckIKnowWhatImDoing: true,
      startFolder: steamSetupDir
    })
  } catch (error) {
    logError(
      ['provisionBottle: failed to launch SteamSetup.exe', error],
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `Failed to launch SteamSetup.exe inside the bottle: ${String(error)}`
    }
  }

  // (8) GAP-17-PROVISIONED-FLAG-STUCK: only ever persist `provisioned: true`
  // here, and only when the bottled Steam.exe is genuinely present. The
  // installer's non-silent run is fire-and-forget (wait:false), so right after
  // returning here steam.exe is almost always still absent — writing the flag
  // `false` in that window (as the old unconditional set did) clobbered a
  // possibly-correct value and never re-evaluated it once the user finished the
  // click-through. Leave the flag UNTOUCHED when steam.exe is absent; the lazy
  // reconcile inside isBottleReady() flips it true the first time a real
  // bottled steam.exe is observed.
  const steamExePath = getBottleSteamExePath(bottleName)
  const steamExeReady =
    isBottleProvisioned(bottleName) && existsSync(steamExePath)
  if (steamExeReady) {
    steamBottleConfigStore.set('provisioned', true)
  }

  logInfo(
    `provisionBottle: bottle "${bottleName}" created; SteamSetup.exe launched non-silently (steamExeReady=${steamExeReady}; provisioned flag left untouched while steam.exe is absent)`,
    LogPrefix.Steam
  )

  return { status: 'done' }
}

// ── 17-04: bottled-Steam verb dispatch ──────────────────────────────────────

const NUMERIC_APP_ID = /^\d+$/

type BottledSteamVerb = 'install' | 'launch' | 'uninstall'
type BottledSteamResult = { status: 'done' | 'error'; error?: string }

/**
 * Numeric-guards appId (mirrors buildSteamProtocolUrl's /^\d+$/ rule,
 * T-17-04), pre-flights isBottleReady() (conf + steam.exe — belt-and-
 * suspenders even if a caller reaches dispatch on a half-provisioned
 * bottle), then dispatches the verb to the bottled Steam client via
 * runWineCommand. Fire-and-forget — never optimistically flips install
 * state (D-02); the bottle-scoped ACF poller (17-05) owns real status.
 */
async function dispatchToBottledSteam(
  verb: BottledSteamVerb,
  appId: string
): Promise<BottledSteamResult> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `tellBottledSteamTo${verb}: rejected non-numeric appId "${appId}" — not dispatching (T-17-04)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid appId: "${appId}"` }
  }

  if (!isBottleReady()) {
    return {
      status: 'error',
      error: 'Steam bottle is not ready yet'
    }
  }

  const bottleName =
    steamBottleConfigStore.get_nodefault('bottleName') ??
    DEFAULT_STEAM_BOTTLE_NAME
  const steamExePath = getBottleSteamExePath(bottleName)

  // -silent: if this call is what starts the bottled client, it comes up in
  // the tray with no main window and no Special Offers popup. Login still
  // prompts when no session is cached, and the steam:// install/uninstall
  // dialogs still show. Ignored when the client is already running.
  let commandParts: string[]
  switch (verb) {
    case 'launch':
      commandParts = [steamExePath, '-silent', '-applaunch', appId]
      break
    case 'install':
      commandParts = [steamExePath, '-silent', `steam://install/${appId}`]
      break
    case 'uninstall':
      commandParts = [steamExePath, '-silent', `steam://uninstall/${appId}`]
      break
  }

  try {
    const { runWineCommand } = await import('backend/launcher')
    // Raise the relevant bottled window once it appears (fire-and-forget, before
    // the await so it runs concurrently — see provisionBottle note).
    //  - 'install': raise the guided installer UI (steam.exe/SteamSetup.exe).
    //  - 'launch' (GAP-17-LAUNCH-FOCUS): raise the launched game's own window.
    //  - 'uninstall' (debug/steam-bottle-uninstall-reverts): the bottled
    //    steam.exe pops its own uninstall CONFIRMATION dialog on receipt of
    //    steam://uninstall/<id> — reuse the same raise as 'install' (same
    //    INSTALLER_PROCESS_NAMES, steam.exe is the owning process) so that
    //    dialog isn't left behind GameLib's own window, unseen and
    //    unconfirmed. Previously this verb raised nothing at all, so the
    //    confirm dialog was invisible, the uninstall never proceeded, and
    //    the ACF poller's own grace-window fallback silently reverted the
    //    badge to installed ~60s later.
    if (verb === 'install' || verb === 'uninstall') {
      void raiseInstallerWindow(verb)
    } else if (verb === 'launch') {
      void raiseBottledGameWindow('launch')
      // quick/261016-t3e: give a bottled launch real started/stopped
      // feedback by polling for any process under the game's own bottle
      // install directory (Playnite's SteamPlayController pattern). Lazy
      // import — see the module-load note at the top of this file: a static
      // edge here would drag `backend/ipc` into every unit test that imports
      // bottle.ts for its pure helpers.
      const installPath = library.get(appId)?.install?.install_path
      if (!installPath) {
        logWarning(
          `tellBottledSteamToLaunch: no install_path known for appId "${appId}" — no process monitor started`,
          LogPrefix.Steam
        )
      } else {
        // quick/261024-gvu: awaited so the monitor's `launching` push is sent
        // before runWineCommand and therefore before the launch IPC resolves.
        try {
          const { startBottleProcessMonitor } =
            await import('./bottleProcessMonitor')
          startBottleProcessMonitor({
            appId,
            installPath,
            bottleDir: getBottleDir(bottleName)
          })
        } catch (error) {
          logWarning(
            [
              `tellBottledSteamToLaunch: failed to start bottle process monitor for appId "${appId}"`,
              error
            ],
            LogPrefix.Steam
          )
        }
      }
    }
    await runWineCommand({
      commandParts,
      gameSettings: getSteamBottleSettings(),
      wait: false,
      protonVerb: 'run',
      skipPrefixCheckIKnowWhatImDoing: true
    })
    return { status: 'done' }
  } catch (error) {
    logError(
      [`tellBottledSteamTo${verb}: runWineCommand failed`, error],
      LogPrefix.Steam
    )
    if (verb === 'launch') {
      // quick/261024-gvu: a failed dispatch must not leave Launching held.
      try {
        const { stopBottleProcessMonitor } =
          await import('./bottleProcessMonitor')
        stopBottleProcessMonitor(appId)
      } catch {
        // never throw from the error path
      }
    }
    return {
      status: 'error',
      error: `Failed to dispatch ${verb} to bottled Steam: ${String(error)}`
    }
  }
}

export function tellBottledSteamToInstall(
  appId: string
): Promise<BottledSteamResult> {
  return dispatchToBottledSteam('install', appId)
}

export function tellBottledSteamToLaunch(
  appId: string
): Promise<BottledSteamResult> {
  return dispatchToBottledSteam('launch', appId)
}

/**
 * debug/steam-bottle-uninstall-reverts (FINAL): kept, deliberately, as an
 * UNUSED-BUT-HARMLESS code path — games.ts's SteamGame.uninstall() no
 * longer calls this for ANY bottle-eligible title (see its own JSDoc).
 * Delegating uninstall to the bottled Steam client's own steam://uninstall
 * confirm dialog was proven architecturally unworkable in this CrossOver
 * bottle: CrossOver/Wine's resolution of Steam's CW_USEDEFAULT window-
 * position sentinel places the dialog off-screen, so it never becomes an
 * addressable window, for ANY title (Steam-authored or GameLib-authored,
 * warm or cold client) — not merely a readiness or ownership gap this
 * function could route around. This export (and the 'uninstall' case in
 * dispatchToBottledSteam's verb switch below) is left in place rather than
 * deleted because: (1) it is a small, shared, already-tested primitive —
 * removing it means deleting real, independently-correct regression
 * coverage in bottle.test.ts for behavior that itself works correctly
 * (the URI dispatch and window-raise both fire; it's Steam's own dialog
 * rendering that's broken); (2) it may become useful again if a future fix
 * to the underlying CrossOver rendering defect makes delegation viable; and
 * (3) no other caller in this codebase currently reaches it, so keeping it
 * costs nothing beyond the export itself. If this file is ever refactored
 * and this function still has zero callers, it is safe to delete then.
 */
export function tellBottledSteamToUninstall(
  appId: string
): Promise<BottledSteamResult> {
  return dispatchToBottledSteam('uninstall', appId)
}

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
// ts-prune-ignore-next
export const DRM_LAUNCH_FORM: DrmLaunchForm = 'bin/wine+CX_BOTTLE'

/**
 * The runner paths bottle.ts needs. 56-08's `RunnerReady` is passed as is: it
 * is a structural superset. bottle.ts does not import the drm modules, which
 * keeps the static import graph acyclic.
 */
// ts-prune-ignore-next
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

const DRM_RUNNER_CXROOT_RE =
  /\/steam-bridge\/drm\/runners\/crossover-([0-9]{1,4}(?:\.[0-9]{1,6}){2,4})\/CrossOver$/

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

function isValidDrmRunner(runner: DrmBridgeRunner): boolean {
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
  const match = DRM_RUNNER_CXROOT_RE.exec(cxRoot)
  if (!match || match[1] !== runner.crossoverBuild) return false
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
// ts-prune-ignore-next
export function drmRunnerWineInstallation(
  runner: DrmBridgeRunner,
  form: DrmLaunchForm
): WineInstallation | null {
  try {
    if (form !== 'bin/wine+CX_BOTTLE' && form !== 'raw WINELOADER+WINEPREFIX') {
      return null
    }
    if (!isValidDrmRunner(runner)) return null
    const name = `CrossOver ${runner.crossoverBuild} (GameLib DRM runner)`
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
// ts-prune-ignore-next
export function getDrmBridgeBottleSettings(
  appId: string,
  runner: DrmBridgeRunner,
  form: DrmLaunchForm = DRM_LAUNCH_FORM
): GameSettings {
  const stock = stockBridgeBottleSettings(appId)
  const wineVersion = drmRunnerWineInstallation(runner, form)
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
  { runner: DrmBridgeRunner; form: DrmLaunchForm }
>()

// ts-prune-ignore-next
export function setDrmBridgeRunner(
  appId: string,
  runner: DrmBridgeRunner,
  form: DrmLaunchForm = DRM_LAUNCH_FORM
): boolean {
  if (!/^[0-9]{1,10}$/.test(String(appId))) return false
  if (!drmRunnerWineInstallation(runner, form)) return false
  const copy = {} as DrmBridgeRunner
  for (const field of DRM_RUNNER_FIELDS) copy[field] = runner[field]
  drmBridgeRunners.set(appId, { runner: copy, form })
  logInfo(
    `bottle: appId ${appId} uses DRM runner crossover-${copy.crossoverBuild}`,
    LogPrefix.Steam
  )
  return true
}

// ts-prune-ignore-next
export function clearDrmBridgeRunner(appId: string): void {
  drmBridgeRunners.delete(appId)
}

// ts-prune-ignore-next
export function getDrmBridgeRunner(
  appId: string
): { runner: DrmBridgeRunner; form: DrmLaunchForm } | undefined {
  return drmBridgeRunners.get(appId)
}

function drmRunnerBinDir(appId: string): string | undefined {
  const entry = drmBridgeRunners.get(appId)
  return entry ? join(entry.runner.cxRoot, 'bin') : undefined
}

/**
 * While a DRM runner is registered for this appId (56-11), every caller gets
 * the clone runner, so the redist, known-fix, registry and launch spawns for
 * the title share one wineserver. The bottle name never changes.
 * See stockBridgeBottleSettings for the stock resolution.
 */
export function getBridgeBottleSettings(appId: string): GameSettings {
  const entry = drmBridgeRunners.get(appId)
  if (entry) {
    return getDrmBridgeBottleSettings(appId, entry.runner, entry.form)
  }
  return stockBridgeBottleSettings(appId)
}

// quick/261016-u1w (D-C): matches a per-game bridge bottle name
// (GameLibSteamBridge-<appId>), capturing the numeric appId suffix.
// Derived from DEFAULT_BRIDGE_BOTTLE_NAME rather than hardcoded, so a rename
// of the shared prefix cannot silently desync the two. Module-private —
// only listReadyBridgeBottleNames below needs it.
const PER_GAME_BRIDGE_BOTTLE_PATTERN = new RegExp(
  `^${DEFAULT_BRIDGE_BOTTLE_NAME}-(\\d+)$`
)

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
      const match = PER_GAME_BRIDGE_BOTTLE_PATTERN.exec(entry)
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
  await killBottleWineServer(name, drmRunnerBinDir(appId))
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
  timeoutMs: number
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
    return await killBottleWineServer(name, drmRunnerBinDir(appId), timeoutMs)
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
export async function provisionBridgeBottle(opts: {
  bottleName: string
  wineVersion?: WineInstallation
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

  // (2) D-08: CrossOver-only. Reject a non-CrossOver engine before any side
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
    return { status: 'done' }
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
  try {
    const { code, stderr } = await spawnAsync(cxbottleIn(binDir), [
      '--create',
      '--bottle',
      bottleName,
      '--template',
      'win10_64'
    ])
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
      return {
        status: 'error',
        error: `Failed to create CrossOver bridge bottle "${bottleName}"`
      }
    }
  } catch (error) {
    logError(
      ['provisionBridgeBottle: cxbottle create threw', error],
      LogPrefix.Steam
    )
    return {
      status: 'error',
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

  return { status: 'done' }
}
