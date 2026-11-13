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

import { existsSync, readFileSync } from 'graceful-fs'
import { parse } from '@node-steam/vdf'
import { join } from 'path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  RUST_STEAMFILES_READ_ACF,
  RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY
} from 'common/types/sidecarTransport'
import { invokeSteamFiles } from '../localFiles/rustSteamFiles'
import { steamFilesTextImpl } from '../localFiles/steamFilesFlags'

const STEAMID64_BASE = BigInt('76561197960265728')
const MAX_DEPTH = 8

/** Injection guard: the key lands in a quoted VDF value and a CM request. */
export function isValidBetaKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(key)
}

function readCString(
  buf: Buffer,
  offset: number
): { value: string; next: number } | undefined {
  const end = buf.indexOf(0, offset)
  if (end < 0) return undefined
  return { value: buf.toString('utf8', offset, end), next: end + 1 }
}

interface WalkState {
  offset: number
  found?: string
}

/** Walks one map's children until its 0x08. Returns false on any malformation. */
function walkMap(
  buf: Buffer,
  st: WalkState,
  depth: number,
  isUserConfig: boolean
): boolean {
  if (depth > MAX_DEPTH) return false
  for (;;) {
    if (st.offset >= buf.length) return false
    const type = buf[st.offset++]
    if (type === 0x08) return true
    const key = readCString(buf, st.offset)
    if (!key) return false
    st.offset = key.next
    switch (type) {
      case 0x00: {
        if (
          !walkMap(
            buf,
            st,
            depth + 1,
            depth === 0 && key.value === 'UserConfig'
          )
        )
          return false
        break
      }
      case 0x01: {
        const val = readCString(buf, st.offset)
        if (!val) return false
        st.offset = val.next
        if (isUserConfig && key.value === 'BetaKey') st.found = val.value
        break
      }
      case 0x02:
      case 0x03:
        st.offset += 4
        if (st.offset > buf.length) return false
        break
      case 0x07:
        st.offset += 8
        if (st.offset > buf.length) return false
        break
      default:
        return false
    }
  }
}

export function decodeUserAppConfigBetaKey(hex: string): string | undefined {
  try {
    if (!hex || !/^([0-9a-fA-F]{2})*$/.test(hex)) return undefined
    const buf = Buffer.from(hex, 'hex')
    const st: WalkState = { offset: 0 }
    if (!walkMap(buf, st, 0, false)) return undefined
    return st.found
  } catch {
    return undefined
  }
}

export async function readAcfBetaKey(
  rust: RustInvokeDeps,
  steamappsDir: string,
  appId: string
): Promise<string | undefined> {
  if (steamFilesTextImpl() === 'ts')
    return readAcfBetaKeyTs(steamappsDir, appId)
  try {
    const res = await invokeSteamFiles(rust, RUST_STEAMFILES_READ_ACF, {
      path: join(steamappsDir, `appmanifest_${appId}.acf`)
    })
    return res.record?.betaKey || undefined
  } catch {
    return undefined
  }
}

function readAcfBetaKeyTs(
  steamappsDir: string,
  appId: string
): string | undefined {
  try {
    const file = join(steamappsDir, `appmanifest_${appId}.acf`)
    if (!existsSync(file)) return undefined
    const parsed = parse(readFileSync(file, 'utf-8')) as {
      AppState?: { UserConfig?: { BetaKey?: unknown } }
    }
    const key = parsed?.AppState?.UserConfig?.BetaKey
    if (key === undefined || key === null) return undefined
    const s = String(key)
    return s ? s : undefined
  } catch {
    return undefined
  }
}

export async function readLocalConfigBetaKey(
  rust: RustInvokeDeps,
  localconfigPath: string,
  appId: string
): Promise<string | undefined> {
  if (steamFilesTextImpl() === 'ts') {
    return readLocalConfigBetaKeyTs(localconfigPath, appId)
  }
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

function readLocalConfigBetaKeyTs(
  localconfigPath: string,
  appId: string
): string | undefined {
  try {
    if (!/^\d+$/.test(appId) || !existsSync(localconfigPath)) return undefined
    const text = readFileSync(localconfigPath, 'utf-8')
    const lines = text.split(/\r?\n/)
    const start = lines.findIndex((l) => /^\s*"UserAppConfig"\s*$/i.test(l))
    if (start < 0) return undefined
    const indent = /^\s*/.exec(lines[start] ?? '')?.[0] ?? ''
    const entry = new RegExp(`^\\s*"${appId}"\\s+"([0-9a-fA-F]*)"\\s*$`)
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (line === `${indent}}`) break
      const m = entry.exec(line)
      if (m) return decodeUserAppConfigBetaKey(m[1] ?? '')
    }
    return undefined
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
