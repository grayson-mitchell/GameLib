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
import { existsSync } from 'graceful-fs'
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
 * The bottle's OWN steamapps ACF root — distinct from the native
 * `defaultSteamPath`. Windows Steam installs here inside the bottle's Wine
 * prefix, regardless of host OS.
 */
export function getBottleSteamappsDir(bottleName: string): string {
  return join(
    getBottleDir(bottleName),
    'drive_c',
    'Program Files (x86)',
    'Steam',
    'steamapps'
  )
}

/**
 * The bottle's own Windows Steam client executable — the target of every
 * tellBottledSteamTo* dispatch below.
 */
export function getBottleSteamExePath(bottleName: string): string {
  return join(
    getBottleDir(bottleName),
    'drive_c',
    'Program Files (x86)',
    'Steam',
    'steam.exe'
  )
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
 */
export function isBottleProvisioned(bottleName?: string): boolean {
  const name =
    bottleName ??
    steamBottleConfigStore.get_nodefault('bottleName') ??
    DEFAULT_STEAM_BOTTLE_NAME
  return existsSync(join(getBottleDir(name), 'cxbottle.conf'))
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

  // (3) Idempotent short-circuit — bottle already exists.
  if (isBottleProvisioned(bottleName)) {
    return { status: 'done' }
  }

  // (4) CREATE the bottle via the 17-01 LOCKED mechanism — argv form only,
  // arguments as discrete words, never a shell-interpolated string.
  try {
    const { code, stderr } = await spawnAsync(CXBOTTLE_BIN, [
      '--create',
      '--bottle',
      bottleName,
      '--template',
      'win10'
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

  // (5) Download the official SteamSetup.exe (HTTPS only — T-17-02), reusing
  // a cached copy on re-provision.
  const steamSetupDir = join(steamSupportPath, 'redist')
  const steamSetupExePath = join(steamSetupDir, 'SteamSetup.exe')
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
 * T-17-04), pre-flights isBottleProvisioned(), then dispatches the verb to
 * the bottled Steam client via runWineCommand. Fire-and-forget — never
 * optimistically flips install state (D-02); the bottle-scoped ACF poller
 * (17-05) owns real status.
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

  if (!isBottleProvisioned()) {
    return {
      status: 'error',
      error: 'Steam bottle is not provisioned yet'
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
