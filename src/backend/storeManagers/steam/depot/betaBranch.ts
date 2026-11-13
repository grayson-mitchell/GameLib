// quick 261110-up7: the per-app Steam beta branch a depot install honors.
//
// Two sources, ACF first (re-installs and updates), then Steam's own
// localconfig.vdf (a first install of an app the user already picked a beta
// for in Steam, Properties -> Betas):
//   1. <steamapps>/appmanifest_<id>.acf  AppState.UserConfig.BetaKey
//   2. <steam>/userdata/<accountId>/config/localconfig.vdf, section
//      "UserAppConfig" { "<appId>" "<hex>" }. The hex is a binary-KeyValues
//      blob, e.g. ADOM (333300):
//        00 "UserConfig\0" 01 "language\0" "english\0" 01 "BetaKey\0" "public\0" 08 08
//      Apps with no beta choice carry a map "internal" { language } and no
//      UserConfig. (Layout read from a real localconfig.vdf.)
// Both files are writable by anything that can write the Steam dir, so every
// candidate key passes isValidBetaKey before it reaches an ACF or a CM
// request (T-up7-01). Any read failure falls back to 'public'; resolution
// never fails an install.
//
// Leaf module, no module-level mutable state.

import { join } from 'path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  RUST_STEAMFILES_READ_ACF,
  RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY
} from 'common/types/sidecarTransport'
import { invokeSteamFiles } from '../localFiles/rustSteamFiles'

const STEAMID64_BASE = BigInt('76561197960265728')

/** Injection guard: the key lands in a quoted VDF value and a CM request. */
export function isValidBetaKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(key)
}

export async function readAcfBetaKey(
  rust: RustInvokeDeps,
  steamappsDir: string,
  appId: string
): Promise<string | undefined> {
  try {
    const res = await invokeSteamFiles(rust, RUST_STEAMFILES_READ_ACF, {
      path: join(steamappsDir, `appmanifest_${appId}.acf`)
    })
    return res.record?.betaKey || undefined
  } catch {
    return undefined
  }
}

export async function readLocalConfigBetaKey(
  rust: RustInvokeDeps,
  localconfigPath: string,
  appId: string
): Promise<string | undefined> {
  try {
    if (!/^\d+$/.test(appId)) return undefined
    const res = await invokeSteamFiles(
      rust,
      RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY,
      { path: localconfigPath, appId }
    )
    return res.betaKey ?? undefined
  } catch {
    return undefined
  }
}

export function steamId64ToAccountId(id64: string): string | undefined {
  if (!/^\d+$/.test(id64)) return undefined
  const acct = BigInt(id64) - STEAMID64_BASE
  return acct > BigInt(0) ? acct.toString() : undefined
}

export async function resolveUserBetaKey(
  rust: RustInvokeDeps,
  args: {
    appId: string
    steamappsDir: string
    steamRoot?: string
    steamId64?: string
  }
): Promise<string> {
  try {
    let source: 'acf' | 'localconfig' | 'default' = 'default'
    let candidate = await readAcfBetaKey(rust, args.steamappsDir, args.appId)
    if (candidate !== undefined) {
      source = 'acf'
    } else if (args.steamRoot && args.steamId64) {
      const acct = steamId64ToAccountId(args.steamId64)
      if (acct) {
        candidate = await readLocalConfigBetaKey(
          rust,
          join(args.steamRoot, 'userdata', acct, 'config', 'localconfig.vdf'),
          args.appId
        )
        if (candidate !== undefined) source = 'localconfig'
      }
    }
    if (candidate === undefined) {
      logInfo(
        `Steam beta branch: appId ${args.appId} source=default key=public`,
        LogPrefix.Steam
      )
      return 'public'
    }
    if (!isValidBetaKey(candidate)) {
      const shown = String(candidate).slice(0, 64)
      logWarning(
        `Steam beta branch: appId ${args.appId} ${source} BetaKey "${shown}" is not a valid branch name, using public`,
        LogPrefix.Steam
      )
      return 'public'
    }
    logInfo(
      `Steam beta branch: appId ${args.appId} source=${source} key=${candidate}`,
      LogPrefix.Steam
    )
    return candidate
  } catch {
    return 'public'
  }
}

export function chooseInstallBranch(
  appinfo: unknown,
  requested: string,
  appId: string
): string {
  if (requested === 'public') return 'public'
  const branches = (
    appinfo as {
      depots?: { branches?: Record<string, { pwdrequired?: unknown }> }
    }
  )?.depots?.branches
  const entry = branches?.[requested]
  if (!entry) {
    logInfo(
      `Steam beta branch: appId ${appId} branch ${requested} not in appinfo branches, using public`,
      LogPrefix.Steam
    )
    return 'public'
  }
  const pw = entry.pwdrequired
  if (pw === true || pw === 1 || pw === '1') {
    logInfo(
      `Steam beta branch: appId ${appId} branch ${requested} is password-protected, CheckAppBetaPassword is out of scope, using public`,
      LogPrefix.Steam
    )
    return 'public'
  }
  return requested
}
