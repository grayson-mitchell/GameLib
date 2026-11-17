/**
 * Native source port catalogue (hint-only).
 *
 * GameLib links to a community source port for a Steam game the user owns and
 * helps them set it up; it never downloads, configures or launches the port.
 * See .planning/notes/native-engine-ports-hint-only.md.
 *
 * Pure: no node/electron/react imports. Malformed rows are dropped rather
 * than thrown so a bad row can never break the game page; the test pins that
 * the shipped file drops nothing.
 */
import catalogueJson from './nativePortCatalogue.json'

export type NativePortMac = 'arm64' | 'universal' | 'x86' | 'none'
export type NativePortDataStyle = 'point' | 'copy' | 'import'

export interface NativePortEntry {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly licence: string
  readonly appIds: readonly number[]
  readonly gogIds?: readonly string[]
  readonly mac: NativePortMac
  readonly linux: boolean
  readonly windows: boolean
  readonly dataStyle: NativePortDataStyle
  readonly dataFiles?: readonly string[]
  readonly note?: string
}

const MACS: readonly string[] = ['arm64', 'universal', 'x86', 'none']
const STYLES: readonly string[] = ['point', 'copy', 'import']

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')

function isEntry(row: unknown): row is NativePortEntry {
  if (!row || typeof row !== 'object') return false
  const r = row as Record<string, unknown>
  if (!isNonEmptyString(r.id)) return false
  if (!isNonEmptyString(r.name)) return false
  if (!isNonEmptyString(r.licence)) return false
  if (!isNonEmptyString(r.url) || !r.url.startsWith('https://')) return false
  if (
    !Array.isArray(r.appIds) ||
    r.appIds.length === 0 ||
    !r.appIds.every((n) => Number.isInteger(n) && (n as number) > 0)
  )
    return false
  if (typeof r.mac !== 'string' || !MACS.includes(r.mac)) return false
  if (typeof r.linux !== 'boolean' || typeof r.windows !== 'boolean')
    return false
  if (typeof r.dataStyle !== 'string' || !STYLES.includes(r.dataStyle))
    return false
  if (r.dataFiles !== undefined && !isStringArray(r.dataFiles)) return false
  if (
    r.dataStyle === 'copy' &&
    (!Array.isArray(r.dataFiles) || r.dataFiles.length === 0)
  )
    return false
  if (r.note !== undefined && typeof r.note !== 'string') return false
  if (r.gogIds !== undefined && !isStringArray(r.gogIds)) return false
  return true
}

export function parseNativePortCatalogue(raw: unknown): NativePortEntry[] {
  return Array.isArray(raw) ? raw.filter(isEntry) : []
}

export const NATIVE_PORT_CATALOGUE: readonly NativePortEntry[] =
  parseNativePortCatalogue(catalogueJson)

export function findNativePort(
  appId: string | number,
  platform: string,
  catalogue: readonly NativePortEntry[] = NATIVE_PORT_CATALOGUE
): NativePortEntry | undefined {
  let id: number
  if (typeof appId === 'number') id = appId
  else if (/^\d+$/.test(appId)) id = Number(appId)
  else return undefined
  return catalogue.find((e) => {
    if (!e.appIds.includes(id)) return false
    if (platform === 'darwin') return e.mac !== 'none'
    if (platform === 'linux') return e.linux
    if (platform === 'win32') return e.windows
    return false
  })
}

export type NativePortPlatformKey =
  | 'mac-arm64'
  | 'mac-universal'
  | 'mac-x86'
  | 'linux'
  | 'windows'

export function nativePortPlatformKeys(
  entry: NativePortEntry
): NativePortPlatformKey[] {
  const keys: NativePortPlatformKey[] = []
  if (entry.mac !== 'none') keys.push(`mac-${entry.mac}`)
  if (entry.linux) keys.push('linux')
  if (entry.windows) keys.push('windows')
  return keys
}
