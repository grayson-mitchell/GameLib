/**
 * String-preserving ACF reader for update detection. Depot manifest GIDs are 19-digit integers that
 * exceed Number.MAX_SAFE_INTEGER, and a VDF parser that number-coerces values loses digits (spike
 * 070 step 1). This module scans the raw ACF text and never coerces: every value stays a string.
 */
import { join } from 'path'
import { existsSync, readFileSync } from 'graceful-fs'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import { NUMERIC_APP_ID } from './gameConstants'
import { invokeSteamFiles } from './localFiles/rustSteamFiles'
import { steamFilesTextImpl } from './localFiles/steamFilesFlags'

export interface AcfInstalledDepot {
  depotId: string
  manifest: string
  size: string
  /** The DLC app that owns this depot (`dlcappid`), when the ACF records one. */
  dlcAppId?: string
}

/** A parsed ACF block: lowercase keys, string leaves, nested blocks. */
export interface AcfTree {
  [key: string]: string | AcfTree
}

const ID = /^\d{1,20}$/

/**
 * Scans quoted tokens and braces into a tree. Malformed input yields whatever parsed before the
 * fault; it never throws.
 */
export function parseAcfTree(text: string): AcfTree {
  const root: AcfTree = {}
  const stack: AcfTree[] = [root]
  let pendingKey: string | undefined
  const re = /"((?:[^"\\]|\\.)*)"|([{}])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const cur = stack[stack.length - 1] as AcfTree
    if (m[2] === '{') {
      if (pendingKey === undefined) continue
      const child: AcfTree = {}
      cur[pendingKey] = child
      stack.push(child)
      pendingKey = undefined
    } else if (m[2] === '}') {
      if (stack.length > 1) stack.pop()
      pendingKey = undefined
    } else {
      const token = (m[1] as string).replace(/\\(.)/g, '$1')
      if (pendingKey === undefined) {
        pendingKey = token.toLowerCase()
      } else {
        cur[pendingKey] = token
        pendingKey = undefined
      }
    }
  }
  return root
}

export function acfString(
  tree: AcfTree | undefined,
  key: string
): string | undefined {
  const v = tree?.[key.toLowerCase()]
  return typeof v === 'string' ? v : undefined
}

export function acfBlock(
  tree: AcfTree | undefined,
  key: string
): AcfTree | undefined {
  const v = tree?.[key.toLowerCase()]
  return typeof v === 'object' ? v : undefined
}

export function parseAcfInstalledDepots(acfText: string): {
  buildid: string | undefined
  installedDepots: AcfInstalledDepot[]
} {
  const appState = acfBlock(parseAcfTree(acfText), 'AppState')
  const rawBuild = acfString(appState, 'buildid')
  const buildid =
    rawBuild !== undefined && ID.test(rawBuild) ? rawBuild : undefined
  const installedDepots: AcfInstalledDepot[] = []
  const block = acfBlock(appState, 'InstalledDepots')
  if (block) {
    for (const [depotId, entry] of Object.entries(block)) {
      if (typeof entry !== 'object' || !ID.test(depotId)) continue
      const manifest = acfString(entry, 'manifest')
      const size = acfString(entry, 'size')
      if (manifest === undefined || !ID.test(manifest)) continue
      const dlc = acfString(entry, 'dlcappid')
      installedDepots.push({
        depotId,
        manifest,
        size: size !== undefined && ID.test(size) ? size : '0',
        ...(dlc !== undefined && ID.test(dlc) && dlc !== '0'
          ? { dlcAppId: dlc }
          : {})
      })
    }
  }
  return { buildid, installedDepots }
}

type InstalledDepotsResult = ReturnType<typeof parseAcfInstalledDepots>

/**
 * Installed depots and buildid of one app's ACF, every id an exact digit string. Null when the
 * app id is not numeric or the manifest is absent/unreadable. On the Rust path the one ACF
 * codec reads the file (steamfiles_read_acf) and the ids stay strings end to end.
 */
export async function readAcfInstalledDepots(
  rust: RustInvokeDeps,
  steamappsDir: string,
  appId: string
): Promise<InstalledDepotsResult | null> {
  if (!NUMERIC_APP_ID.test(appId)) return null
  if (steamFilesTextImpl() === 'ts') {
    return readAcfInstalledDepotsTs(steamappsDir, appId)
  }
  try {
    const res = await invokeSteamFiles(rust, RUST_STEAMFILES_READ_ACF, {
      path: join(steamappsDir, `appmanifest_${appId}.acf`)
    })
    if (!res.exists) return null
    const rec = res.record
    const buildid =
      rec?.buildid != null && ID.test(rec.buildid) ? rec.buildid : undefined
    return {
      buildid,
      installedDepots: (rec?.installedDepots ?? []).map((d) => ({
        depotId: d.depotId,
        manifest: d.manifest,
        size: ID.test(d.size) ? d.size : '0',
        ...(d.dlcAppId && ID.test(d.dlcAppId) && d.dlcAppId !== '0'
          ? { dlcAppId: d.dlcAppId }
          : {})
      }))
    }
  } catch {
    return null
  }
}

function readAcfInstalledDepotsTs(
  steamappsDir: string,
  appId: string
): InstalledDepotsResult | null {
  try {
    const file = join(steamappsDir, `appmanifest_${appId}.acf`)
    if (!existsSync(file)) return null
    return parseAcfInstalledDepots(readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}
