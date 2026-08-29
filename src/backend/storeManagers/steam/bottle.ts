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
import { existsSync, mkdirSync, readFileSync, rmSync } from 'graceful-fs'
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
import { checkWineBeforeLaunch, downloadFile, spawnAsync } from 'backend/utils'
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

// ── Phase 24 (24-04): dedicated bridge bottle (macOS native Steam bridge) ──
// D-08/R6/Pitfall 1: the bridge bottle is a SEPARATE, shared CrossOver
// bottle from the Phase 17 DEFAULT_STEAM_BOTTLE_NAME bottle above — every
// spike ran inside that bottle, which already contains a full bottled
// Windows Steam client, directly conflicting with R6's "no Windows Steam
// client in the bottle" acceptance bar. Distinct name so
// getBridgeBottleSettings()/isBridgeBottleReady() can never accidentally
// resolve the Phase 17 bottle.
export const DEFAULT_BRIDGE_BOTTLE_NAME = 'GameLibSteamBridge'

// CrossOver's cxbottle CLI binary — resolved location per the 17-01 spike
// (spike/steam-bottle/FINDINGS.md MECHANISM DECISION). Locked, not derived.
const CXBOTTLE_BIN =
  '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle'

// Single source of truth (GAP-17-CEF-RECREATE-RUNNING): derive the sibling
// `wineserver` binary and the CrossOver root from CXBOTTLE_BIN rather than
// hardcoding a second absolute path.
//   CrossOver bin dir = dirname(CXBOTTLE_BIN)
//   wineserver binary = <bin dir>/wineserver
//   CX_ROOT           = dirname(<bin dir>)  (.../SharedSupport/CrossOver)
const WINESERVER_BIN = join(dirname(CXBOTTLE_BIN), 'wineserver')
const CX_ROOT = dirname(dirname(CXBOTTLE_BIN))

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
export function sanitizeBottleName(name: string): string | null {
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

export type ProvisionBottleResult = { status: 'done' | 'error'; error?: string }

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
async function killBottleWineServer(bottleName: string): Promise<void> {
  try {
    await spawnAsync(WINESERVER_BIN, ['-k'], {
      env: {
        ...process.env,
        WINEPREFIX: getBottleDir(bottleName),
        CX_ROOT
      }
    })
  } catch (error) {
    logWarning(
      [
        `killBottleWineServer: wineserver -k for bottle "${bottleName}" failed (best-effort — provisioning continues)`,
        error
      ],
      LogPrefix.Steam
    )
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
    await killBottleWineServer(bottleName)
    try {
      await spawnAsync(CXBOTTLE_BIN, [
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
      const { code, stderr } = await spawnAsync(CXBOTTLE_BIN, [
        '--create',
        '--bottle',
        bottleName,
        '--template',
        'win10_64'
      ])
      if (!isBottleProvisioned(bottleName)) {
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
      await downloadFile({ url: STEAM_SETUP_EXE_URL, dest: steamSetupExePath })
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

  let commandParts: string[]
  switch (verb) {
    case 'launch':
      commandParts = [steamExePath, '-applaunch', appId]
      break
    case 'install':
      commandParts = [steamExePath, `steam://install/${appId}`]
      break
    case 'uninstall':
      commandParts = [steamExePath, `steam://uninstall/${appId}`]
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
 */
export function isBridgeBottleReady(bottleName?: string): boolean {
  const name = bottleName ?? DEFAULT_BRIDGE_BOTTLE_NAME
  return isBottleProvisioned(name)
}

/**
 * D-UAT-24-06 gap closure (24-15) — GENERALIZED (debug/steam-bottle-
 * uninstall-reverts): resolves CrossOver's OWN wine binary — derived from
 * the already-locked CXBOTTLE_BIN root (sibling `wine` binary, exactly the
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
  const crossoverWineBin = join(dirname(CXBOTTLE_BIN), 'wine')
  if (!existsSync(crossoverWineBin)) {
    return undefined
  }
  return {
    bin: crossoverWineBin,
    name: label,
    type: 'crossover',
    wineserver: WINESERVER_BIN
  }
}

/**
 * Composes a GameSettings-shaped object for the dedicated bridge bottle,
 * mirroring getSteamBottleSettings() but always resolving
 * DEFAULT_BRIDGE_BOTTLE_NAME — never the Phase 17 bottle (Pitfall 1 / R4
 * routing precondition). One shared bridge bottle (D-03 "share as much as
 * possible"), so — unlike getSteamBottleSettings() — no per-install override
 * is read back from steamBottleConfigStore; the bridge bottle's name/engine
 * are not user-configurable this phase.
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
export function getBridgeBottleSettings(): GameSettings {
  const globalSettings = GlobalConfig.get().getSettings()
  return {
    ...globalSettings,
    wineCrossoverBottle: DEFAULT_BRIDGE_BOTTLE_NAME,
    wineVersion:
      resolveCrossoverWine('CrossOver (bridge bottle runtime)') ??
      globalSettings.wineVersion
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
 */
export async function provisionBridgeBottle(opts?: {
  bottleName?: string
  wineVersion?: WineInstallation
}): Promise<ProvisionBottleResult> {
  const rawName = opts?.bottleName ?? DEFAULT_BRIDGE_BOTTLE_NAME
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
  if (opts?.wineVersion && opts.wineVersion.type !== 'crossover') {
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

  // (4) CREATE via the SAME locked cxbottle mechanism provisionBottle()
  // uses (argv form only, arguments as discrete words) — win10_64 template.
  try {
    const { code, stderr } = await spawnAsync(CXBOTTLE_BIN, [
      '--create',
      '--bottle',
      bottleName,
      '--template',
      'win10_64'
    ])
    if (!isBottleProvisioned(bottleName)) {
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
  await killBottleWineServer(bottleName)

  logInfo(
    `provisionBridgeBottle: bridge bottle "${bottleName}" created (no Windows Steam client installed — R6)`,
    LogPrefix.Steam
  )

  return { status: 'done' }
}
