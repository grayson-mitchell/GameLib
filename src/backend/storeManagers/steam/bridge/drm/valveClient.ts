/**
 * Phase 56 D-04/D-05/D-06: the genuine Valve client set for DRM mode,
 * fetched from Valve's own CDN onto the user's machine and never shipped.
 *
 * The package follows the current `steam_client_win64` manifest's
 * `bins_win64` node and is verified against that manifest's own `sha2`; no
 * sha is pinned in GameLib. Trust rests on TLS plus a three-host allowlist
 * plus `sha2`; no manifest signature scheme is invented (RESEARCH Pitfall 9).
 *
 * This module never throws: every failure is a `DrmStepResult` error with
 * step `valve-fetch` (transport) or `valve-verify` (content).
 *
 * Sidecar exit contract: nothing runs at import or boot. Every network wait
 * is bounded by an unref'd deadline and registered with the app abort
 * handler, so `callAllAbortControllers()` at stdin EOF ends it. The unzip
 * child is unref'd and killed on its own deadline.
 *
 * Must NOT import backend/launcher or backend/utils statically (utils imports
 * launcher); axios is reached through a lazy import. It does not import
 * the app path constants either: the caller passes `appFolder` (56-04).
 */

import { parse } from '@node-steam/vdf'

// ts-prune-ignore-next
export const VALVE_CLIENT_BASES = [
  'https://client-update.akamai.steamstatic.com',
  'https://steamcdn-a.akamaihd.net/client',
  'https://media.steampowered.com/client'
] as const

// ts-prune-ignore-next
export const VALVE_CLIENT_MANIFEST_NAME = 'steam_client_win64'

// ts-prune-ignore-next
export const VALVE_CLIENT_DLLS = [
  'steamclient64.dll',
  'tier0_s64.dll',
  'vstdlib_s64.dll'
] as const

// ts-prune-ignore-next
export const MAX_VALVE_MANIFEST_BYTES = 512 * 1024
// ts-prune-ignore-next
export const MAX_VALVE_PACKAGE_BYTES = 200 * 1024 * 1024
// ts-prune-ignore-next
export const MAX_VALVE_DLL_BYTES = 128 * 1024 * 1024

const FILE_RE = /^bins_win64\.zip\.[0-9a-f]{40}$/
const SHA2_RE = /^[0-9a-f]{64}$/
const VERSION_RE = /^[0-9]{1,20}$/
const FORBIDDEN_KEY_RE = /"(__proto__|constructor|prototype)"/

const HOST_UPDATE = 'client-update.akamai.steamstatic.com'
const ROOT_PATH_RE = /^\/[A-Za-z0-9._-]+$/
const CLIENT_PATH_RE = /^\/client\/[A-Za-z0-9._-]+$/

// ts-prune-ignore-next
export function isAllowedValveUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.href !== url) return false
    if (parsed.protocol !== 'https:') return false
    if (
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.port !== '' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      return false
    }
    if (parsed.hostname === HOST_UPDATE) {
      if (!ROOT_PATH_RE.test(parsed.pathname)) return false
    } else if (
      parsed.hostname === 'steamcdn-a.akamaihd.net' ||
      parsed.hostname === 'media.steampowered.com'
    ) {
      if (!CLIENT_PATH_RE.test(parsed.pathname)) return false
    } else {
      return false
    }
    const last = parsed.pathname.split('/').pop() ?? ''
    return last !== '.' && last !== '..' && !last.includes('..')
  } catch {
    return false
  }
}

// ts-prune-ignore-next
export function valveManifestUrl(base: string): string | null {
  const url = `${base}/${VALVE_CLIENT_MANIFEST_NAME}`
  return isAllowedValveUrl(url) ? url : null
}

// ts-prune-ignore-next
export function valvePackageUrl(base: string, file: string): string | null {
  if (typeof file !== 'string' || !FILE_RE.test(file)) return null
  const url = `${base}/${file}`
  return isAllowedValveUrl(url) ? url : null
}

// ts-prune-ignore-next
export type ValveClientPackage = {
  manifestVersion: string
  file: string
  sha2: string
  size: number
}

type Fail = { ok: false; reason: string }

function own(obj: unknown, key: string): unknown {
  if (
    obj !== null &&
    typeof obj === 'object' &&
    Object.prototype.hasOwnProperty.call(obj, key)
  ) {
    return (obj as Record<string, unknown>)[key]
  }
  return undefined
}

// ts-prune-ignore-next
export function parseValveClientManifest(
  text: unknown
): { ok: true; pkg: ValveClientPackage } | Fail {
  try {
    if (typeof text !== 'string') return { ok: false, reason: 'not text' }
    if (Buffer.byteLength(text) > MAX_VALVE_MANIFEST_BYTES) {
      return { ok: false, reason: 'manifest too large' }
    }
    // Before parse: @node-steam/vdf assigns block keys with stack[top][key],
    // so a "__proto__" block would write into Object.prototype.
    const forbidden = FORBIDDEN_KEY_RE.exec(text)
    if (forbidden) {
      return { ok: false, reason: `forbidden key ${forbidden[1]}` }
    }
    const root = parse(text)
    const win64 = own(root, 'win64')
    if (win64 === undefined) return { ok: false, reason: 'no win64 root' }
    const bins = own(win64, 'bins_win64')
    if (bins === undefined) return { ok: false, reason: 'no bins_win64 node' }

    const file = own(bins, 'file')
    if (typeof file !== 'string' || !FILE_RE.test(file)) {
      return { ok: false, reason: 'bad bins_win64 file' }
    }
    const sha2 = own(bins, 'sha2')
    if (typeof sha2 !== 'string') {
      return { ok: false, reason: 'sha2 is not a hex string' }
    }
    if (!SHA2_RE.test(sha2)) {
      return { ok: false, reason: 'bad bins_win64 sha2' }
    }
    const rawSize = own(bins, 'size')
    let size = NaN
    if (typeof rawSize === 'number' && Number.isSafeInteger(rawSize)) {
      size = rawSize
    } else if (typeof rawSize === 'string' && /^[0-9]{1,10}$/.test(rawSize)) {
      size = Number(rawSize)
    }
    if (!(size >= 1 && size <= MAX_VALVE_PACKAGE_BYTES)) {
      return { ok: false, reason: 'bad bins_win64 size' }
    }
    const rawVersion = own(win64, 'version')
    let version = ''
    if (typeof rawVersion === 'number') {
      if (Number.isSafeInteger(rawVersion) && rawVersion >= 0) {
        version = String(rawVersion)
      }
    } else if (typeof rawVersion === 'string') {
      version = rawVersion
    }
    if (!VERSION_RE.test(version)) {
      return { ok: false, reason: 'bad manifest version' }
    }
    return { ok: true, pkg: { manifestVersion: version, file, sha2, size } }
  } catch {
    return { ok: false, reason: 'manifest did not parse' }
  }
}

// ts-prune-ignore-next
export type ValveFetchText = (
  url: string,
  opts: { signal: AbortSignal; maxBytes: number }
) => Promise<string>

// ts-prune-ignore-next
export type ValveFetchToFile = (
  url: string,
  destPath: string,
  opts: { signal: AbortSignal; maxBytes: number }
) => Promise<{ bytes: number }>

// ts-prune-ignore-next
export type ValveUnzipRunner = (
  args: readonly string[],
  opts: { timeoutMs: number }
) => Promise<{
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}>
