/**
 * String-preserving ACF reader for update detection. Depot manifest GIDs are 19-digit integers that
 * exceed Number.MAX_SAFE_INTEGER, and a VDF parser that number-coerces values loses digits (spike
 * 070 step 1). This module scans the raw ACF text and never coerces: every value stays a string.
 */
import { join } from 'path'
import { existsSync, readFileSync } from 'graceful-fs'
import { NUMERIC_APP_ID } from './gameConstants'

export interface AcfInstalledDepot {
  depotId: string
  manifest: string
  size: string
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
    const cur = stack[stack.length - 1]
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
      const token = m[1].replace(/\\(.)/g, '$1')
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
      installedDepots.push({
        depotId,
        manifest,
        size: size !== undefined && ID.test(size) ? size : '0'
      })
    }
  }
  return { buildid, installedDepots }
}

export function readAcfInstalledDepots(
  steamappsDir: string,
  appId: string
): ReturnType<typeof parseAcfInstalledDepots> | null {
  if (!NUMERIC_APP_ID.test(appId)) return null
  try {
    const file = join(steamappsDir, `appmanifest_${appId}.acf`)
    if (!existsSync(file)) return null
    return parseAcfInstalledDepots(readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}
