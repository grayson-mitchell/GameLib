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
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'graceful-fs'
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
import {
  checkWineBeforeLaunch,
  downloadFile,
  spawnAsync
} from 'backend/utils'
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

// CrossOver's cxbottle CLI binary — resolved location per the 17-01 spike
// (spike/steam-bottle/FINDINGS.md MECHANISM DECISION). Locked, not derived.
const CXBOTTLE_BIN =
  '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle'

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
  return isBottleProvisioned(name) && existsSync(getBottleSteamExePath(name))
}

/**
 * Composes a GameSettings-shaped object for the dedicated Steam bottle,
 * sourced from steamBottleConfigStore and falling back to
 * DEFAULT_STEAM_BOTTLE_NAME / the global default Wine engine. Used wherever
 * a bottled Steam operation needs a GameSettings to hand to runWineCommand.
 */
export function getSteamBottleSettings(): GameSettings {
  const globalSettings = GlobalConfig.get().getSettings()
  const storedWineVersion =
    steamBottleConfigStore.get_nodefault('wineVersion')
  const storedBottleName = steamBottleConfigStore.get_nodefault(
    'wineCrossoverBottle'
  )

  return {
    ...globalSettings,
    wineCrossoverBottle: storedBottleName ?? DEFAULT_STEAM_BOTTLE_NAME,
    wineVersion: storedWineVersion ?? globalSettings.wineVersion
  }
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
    const { isMac } = await import('backend/constants/environment')
    if (!isMac) {
      return
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const tryRaise = async (): Promise<string | null> => {
      try {
        const { stdout } = await spawnAsync('osascript', ['-e', raiseScript])
        const out = stdout.trim()
        return out && out !== 'none' ? out : null
      } catch (error) {
        logWarning(
          [`raiseFrontmostBottledProcess [${context}]: osascript raise failed`, error],
          LogPrefix.Steam
        )
        return null
      }
    }

    let raised: string | null = null
    for (let attempt = 0; attempt < 12 && !raised; attempt++) {
      await sleep(1500)
      raised = await tryRaise()
    }

    if (raised) {
      logInfo(
        `raiseFrontmostBottledProcess [${context}]: raised to front (${raised})`,
        LogPrefix.Steam
      )
      // Re-raise once after the window settles (splash -> main UI).
      await sleep(2500)
      await tryRaise()
    } else {
      logWarning(
        `raiseFrontmostBottledProcess [${context}]: no matching process within ~18s — falling back to app.hide()`,
        LogPrefix.Steam
      )
      try {
        const { app } = await import('electron')
        app.hide()
      } catch (error) {
        logWarning(
          [`raiseFrontmostBottledProcess [${context}]: app.hide fallback failed`, error],
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
  const nameClause = INSTALLER_PROCESS_NAMES.map(
    (n) => `name is "${n}"`
  ).join(' or ')
  const raiseScript = [
    'tell application "System Events"',
    `set procs to (every process whose (${nameClause}))`,
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

  // (8) Only mark `provisioned: true` once the bottle exists AND the
  // bottled Steam.exe is present (the installer's non-silent run is
  // fire-and-forget — this will typically still be false immediately after
  // returning here, and flips true on a later status check once the user
  // finishes the click-through).
  const steamExePath = getBottleSteamExePath(bottleName)
  const fullyProvisioned =
    isBottleProvisioned(bottleName) && existsSync(steamExePath)
  steamBottleConfigStore.set('provisioned', fullyProvisioned)

  logInfo(
    `provisionBottle: bottle "${bottleName}" created; SteamSetup.exe launched non-silently (provisioned=${fullyProvisioned})`,
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
    //  - 'uninstall': no window to raise.
    if (verb === 'install') {
      void raiseInstallerWindow('install')
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

export function tellBottledSteamToUninstall(
  appId: string
): Promise<BottledSteamResult> {
  return dispatchToBottledSteam('uninstall', appId)
}
