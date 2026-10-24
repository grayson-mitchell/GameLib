/**
 * Phase 51 Plan 02, Task 2: interface-version capture.
 *
 * Per D-51-07 (the persisted verdict stores what the scan judged) and
 * ROADMAP sub-decision 1 (bare accessors + the SteamInternal/SteamClient
 * runtime-lookup family), a game's bare-accessor imports alone do not say
 * which interface VERSION each accessor resolves to -- that is baked into
 * the game's own original `steam_api(64)?.dll` (and, for runtime-lookup
 * games, the exe) as a set of null-terminated ASCII strings such as
 * `SteamUser016` or `STEAMAPPS_INTERFACE_VERSION004`. This module reads
 * those strings and resolves the exact version each imported accessor
 * needs, or names the problem when it can't.
 *
 * Imports only `node:fs/promises` (no backend module) so `meta/` tooling
 * (and the closing census tool, D-51-15) can bundle it without pulling in
 * the backend module graph.
 */

import { open, stat } from 'node:fs/promises'

// `/(Steam[A-Za-z]{2,40}0\d{2}|STEAM[A-Z]{2,40}_INTERFACE_VERSION0\d{2})/g`
// over the buffer read as latin1 (every byte maps to one char 1:1, so a
// match can never split a multi-byte sequence). The `{2,40}` length cap is
// a DoS mitigation (T-51-07): an unbounded `+` could spin the regex across
// megabytes of non-ASCII binary noise that happens to start with
// "Steam"/"STEAM" looking for a digit that never comes.
const VERSION_STRING_PATTERN =
  /(Steam[A-Za-z]{2,40}0\d{2}|STEAM[A-Z]{2,40}_INTERFACE_(?:VERSION_?|V)0\d{2})/g

// `STEAM<NAME>_INTERFACE_VERSION0NN` macro-style version strings, keyed by
// the macro name (everything between `STEAM` and `_INTERFACE_VERSION`), to
// the CamelCase family name used everywhere else in this module/the bare
// accessor map.
const MACRO_FAMILY: Readonly<Record<string, string>> = {
  STEAMAPPS: 'SteamApps',
  STEAMUSERSTATS: 'SteamUserStats',
  STEAMREMOTESTORAGE: 'SteamRemoteStorage',
  STEAMHTTP: 'SteamHTTP',
  STEAMSCREENSHOTS: 'SteamScreenshots',
  STEAMUGC: 'SteamUGC',
  STEAMAPPLIST: 'SteamAppList',
  STEAMMUSIC: 'SteamMusic',
  STEAMMUSICREMOTE: 'SteamMusicRemote',
  STEAMUNIFIEDMESSAGES: 'SteamUnifiedMessages',
  STEAMHTMLSURFACE: 'SteamHTMLSurface',
  STEAMINVENTORY: 'SteamInventory',
  STEAMVIDEO: 'SteamVideo',
  // Phase 53 (53-12): Steamworks.NET Init families.
  STEAMPARENTALSETTINGS: 'SteamParentalSettings',
  STEAMREMOTEPLAY: 'SteamRemotePlay',
  STEAMTIMELINE: 'SteamTimeline'
}

// `Steam<Family>0NN` CamelCase version strings (e.g. `SteamUser016`). Only
// families in this set are accepted -- an arbitrary CamelCase-plus-3-digits
// token (e.g. a version number embedded in some unrelated string) must not
// be treated as an interface version.
const CAMEL_CASE_FAMILIES: ReadonlySet<string> = new Set([
  'SteamUser',
  'SteamFriends',
  'SteamUtils',
  'SteamMatchMaking',
  'SteamMatchMakingServers',
  'SteamNetworking',
  'SteamClient',
  'SteamController',
  'SteamGameServer',
  'SteamGameServerStats',
  'SteamContentServer',
  'SteamParentalSettings',
  'SteamAppList',
  // Phase 53 (53-12): `SteamMatchGameSearch001` (family SteamGameSearch, see
  // CAMEL_FAMILY_ALIAS) and `SteamParties002`.
  'SteamMatchGameSearch',
  'SteamParties'
])

// CamelCase version-string prefix -> family name, where the two spellings
// differ (the Matchmaking precedent: accessor casing vs version casing).
const CAMEL_FAMILY_ALIAS: Readonly<Record<string, string>> = {
  SteamMatchGameSearch: 'SteamGameSearch'
}

// Bare accessor export name (as seen in the import table, importParse.ts) ->
// the family name used by the version-string parsers above. Casing
// deliberately differs from the version-string family for the Matchmaking
// pair (accessor exports lowercase "m", version strings use capital "M").
// `SteamGameServer*` bare names are NOT mapped here -- they are served as
// flat stubs with no interface-version dependency.
export const BARE_ACCESSOR_FAMILY: Readonly<Record<string, string>> = {
  SteamUser: 'SteamUser',
  SteamFriends: 'SteamFriends',
  SteamUtils: 'SteamUtils',
  SteamApps: 'SteamApps',
  SteamUserStats: 'SteamUserStats',
  SteamRemoteStorage: 'SteamRemoteStorage',
  SteamMatchmaking: 'SteamMatchMaking',
  SteamMatchmakingServers: 'SteamMatchMakingServers',
  SteamNetworking: 'SteamNetworking',
  SteamClient: 'SteamClient',
  SteamScreenshots: 'SteamScreenshots',
  SteamHTTP: 'SteamHTTP',
  SteamUGC: 'SteamUGC',
  SteamController: 'SteamController',
  SteamAppList: 'SteamAppList',
  SteamMusic: 'SteamMusic',
  SteamMusicRemote: 'SteamMusicRemote',
  SteamHTMLSurface: 'SteamHTMLSurface',
  SteamInventory: 'SteamInventory',
  SteamVideo: 'SteamVideo',
  // Phase 53 (53-01): SteamInput006 is a served x64 manifest family.
  SteamInput: 'SteamInput'
}

// Importing either of these means the game resolves Steamworks interfaces
// at RUNTIME rather than importing one bare accessor per interface (D-51-07)
// -- there is no fixed accessor-to-version mapping to walk for these games;
// every known family found in the game's own version-string pool is a
// candidate.
const RUNTIME_LOOKUP_SYMBOLS: ReadonlySet<string> = new Set([
  'SteamInternal_CreateInterface',
  // quick 261024-i94: take a version string exactly like CreateInterface.
  // (SteamInternal_ContextInit takes none, so it is deliberately absent.)
  'SteamInternal_FindOrCreateUserInterface',
  'SteamInternal_FindOrCreateGameServerInterface',
  'SteamClient'
])

const MACRO_VERSION_PATTERN = /^([A-Z]+)_INTERFACE_(?:VERSION_?|V)\d{3}$/
const CAMEL_VERSION_PATTERN = /^([A-Za-z]+)\d{3}$/

const DEFAULT_MAX_BYTES = 512 * 1024 * 1024 // 512 MiB (T-51-07)
const CHUNK_SIZE = 1024 * 1024 // 1 MiB
// Longest possible version-string match is well under 96 bytes (the regex
// caps the variable run at 40 chars, plus fixed literals) -- carrying this
// much of the previous chunk's tail into the next chunk's scan guarantees a
// marker straddling a chunk boundary is never split across two separate
// parseInterfaceVersionStrings() calls.
const OVERLAP_BYTES = 96

/**
 * True iff the game resolves Steamworks interfaces at runtime
 * (`SteamInternal_CreateInterface` or the generic `SteamClient` accessor)
 * rather than importing one bare accessor per interface.
 */
export function usesRuntimeInterfaceLookup(symbols: string[]): boolean {
  return symbols.some((symbol) => RUNTIME_LOOKUP_SYMBOLS.has(symbol))
}

/**
 * The CamelCase family name (`SteamUser`, `SteamApps`, ...) a given
 * interface-version string belongs to, or `null` when the string isn't a
 * recognized version shape at all (an unknown macro name or an
 * unrecognized CamelCase family).
 */
export function familyOfInterfaceVersion(version: string): string | null {
  const macroMatch = version.match(MACRO_VERSION_PATTERN)
  if (macroMatch) {
    return MACRO_FAMILY[macroMatch[1]] ?? null
  }

  const camelMatch = version.match(CAMEL_VERSION_PATTERN)
  if (camelMatch && CAMEL_CASE_FAMILIES.has(camelMatch[1])) {
    return CAMEL_FAMILY_ALIAS[camelMatch[1]] ?? camelMatch[1]
  }

  return null
}

/**
 * Pure parser: extracts every interface-version-shaped string
 * (`Steam<Family>0NN` or `STEAM<NAME>_INTERFACE_VERSION0NN`) from a buffer
 * of arbitrary binary bytes, deduped and sorted. Does not validate that a
 * matched string's family is a KNOWN one -- that's `familyOfInterfaceVersion`'s
 * job -- this function only recognizes the shape.
 */
export function parseInterfaceVersionStrings(bytes: Buffer): string[] {
  const text = bytes.toString('latin1')
  const found = new Set<string>()
  for (const match of text.matchAll(VERSION_STRING_PATTERN)) {
    found.add(match[1])
  }
  return Array.from(found).sort()
}

type ReadInterfaceVersionStringsResult =
  | { status: 'ok'; versions: string[] }
  | { status: 'error'; error: string }

/**
 * Reads a binary file (a game's original `steam_api(64)?.dll` or exe) in
 * bounded 1 MiB chunks and returns every interface-version string found,
 * deduped and sorted. Never throws -- a stat/open/read failure or a file
 * exceeding `maxBytes` (default 512 MiB, T-51-07) is surfaced as a typed
 * `{ status: 'error' }` result naming the cap. The file handle is always
 * closed.
 */
export async function readInterfaceVersionStrings(
  filePath: string,
  opts?: { maxBytes?: number }
): Promise<ReadInterfaceVersionStringsResult> {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES

  let fileSize: number
  try {
    const stats = await stat(filePath)
    fileSize = stats.size
  } catch (error) {
    return {
      status: 'error',
      error: `Failed to stat "${filePath}": ${String(error)}`
    }
  }

  if (fileSize > maxBytes) {
    return {
      status: 'error',
      error: `"${filePath}" is ${fileSize} bytes, exceeding the ${maxBytes}-byte cap`
    }
  }

  let handle
  try {
    handle = await open(filePath, 'r')
  } catch (error) {
    return {
      status: 'error',
      error: `Failed to open "${filePath}": ${String(error)}`
    }
  }

  try {
    const found = new Set<string>()
    let position = 0
    // Carries the tail of the previous chunk so a marker straddling a
    // chunk boundary is scanned whole at least once.
    let carry = Buffer.alloc(0)

    while (position < fileSize) {
      const toRead = Math.min(CHUNK_SIZE, fileSize - position)
      const chunkBuffer = Buffer.alloc(toRead)
      const { bytesRead } = await handle.read(chunkBuffer, 0, toRead, position)
      if (bytesRead === 0) {
        break
      }
      const combined = Buffer.concat([
        carry,
        chunkBuffer.subarray(0, bytesRead)
      ])
      for (const version of parseInterfaceVersionStrings(combined)) {
        found.add(version)
      }
      carry = combined.subarray(Math.max(0, combined.length - OVERLAP_BYTES))
      position += bytesRead
    }

    return { status: 'ok', versions: Array.from(found).sort() }
  } catch (error) {
    return {
      status: 'error',
      error: `Failed to read "${filePath}": ${String(error)}`
    }
  } finally {
    await handle.close()
  }
}

/**
 * Phase 53-02: the managed-assembly variant of `parseInterfaceVersionStrings`.
 * Steamworks.NET compiles its interface-version constants into the assembly as
 * UTF-16LE literals, which the latin1 scan cannot see (it reads `S\0t\0e\0`).
 * Decodes at both byte parities so an odd-aligned literal is still found.
 */
export function parseInterfaceVersionStringsUtf16(bytes: Buffer): string[] {
  const found = new Set<string>()
  for (const start of [0, 1]) {
    const text = bytes.subarray(start).toString('utf16le')
    for (const match of text.matchAll(VERSION_STRING_PATTERN)) {
      found.add(match[1])
    }
  }
  return Array.from(found).sort()
}

// Even, so the UTF-16 carry keeps code-unit alignment relative to the chunk.
const MANAGED_OVERLAP_BYTES = 192

/**
 * Chunked UTF-16 scan of a managed assembly (same 1 MiB chunks and 512 MiB cap
 * as `readInterfaceVersionStrings`). Never throws; an unreadable or oversized
 * file reads as no versions.
 */
export async function readManagedInterfaceVersionStrings(
  filePath: string,
  opts?: { maxBytes?: number }
): Promise<string[]> {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES
  let handle
  try {
    const stats = await stat(filePath)
    if (stats.size > maxBytes) return []
    handle = await open(filePath, 'r')
    const fileSize = stats.size
    const found = new Set<string>()
    let position = 0
    let carry = Buffer.alloc(0)
    while (position < fileSize) {
      const toRead = Math.min(CHUNK_SIZE, fileSize - position)
      const chunk = Buffer.alloc(toRead)
      const { bytesRead } = await handle.read(chunk, 0, toRead, position)
      if (bytesRead === 0) break
      const combined = Buffer.concat([carry, chunk.subarray(0, bytesRead)])
      for (const v of parseInterfaceVersionStringsUtf16(combined)) found.add(v)
      carry = combined.subarray(
        Math.max(0, combined.length - MANAGED_OVERLAP_BYTES)
      )
      position += bytesRead
    }
    return Array.from(found).sort()
  } catch {
    return []
  } finally {
    await handle?.close()
  }
}

/**
 * Resolved open question 2: when a Mono title's Managed dir supplied any
 * interface-version constants they ALONE form the request pool. The original
 * Valve steam_api64.dll carries many versions per family and would make every
 * family `@ambiguous`.
 */
export function selectInterfaceVersionPool(input: {
  managedVersions: string[] | null
  dllVersions: string[]
  exeVersions: string[]
}): { dllVersions: string[]; exeVersions: string[] } {
  const { managedVersions, dllVersions, exeVersions } = input
  if (managedVersions && managedVersions.length > 0) {
    return { dllVersions: [], exeVersions: managedVersions }
  }
  return { dllVersions, exeVersions }
}

type RequiredInterfaceVersionsResult = {
  required: Record<string, string>
  problems: string[]
}

/**
 * Resolves the exact interface version each of a game's imported bare
 * accessors needs, given the version strings read from the game's own
 * dll/exe. Two modes:
 *
 *  - Normal (bare-accessor) games: walks `importedSymbols`, maps each known
 *    accessor (`BARE_ACCESSOR_FAMILY`) to its family, and resolves that
 *    family's version from the combined `dllVersions`/`exeVersions` pool.
 *  - Runtime-lookup games (`usesRuntimeInterfaceLookup(importedSymbols)` is
 *    true, e.g. ELEX): there is no bare accessor per interface to walk, so
 *    every KNOWN family found anywhere in the combined pool is resolved.
 *
 * A family with no matching version string in the pool is reported as
 * `"<family>@unknown-version"`; a family with more than one DISTINCT
 * version string in the pool is reported as
 * `"<family>@ambiguous(v1,v2,...)"` (sorted) -- neither case adds an entry
 * to `required`.
 */
export function resolveRequiredInterfaceVersions(args: {
  importedSymbols: string[]
  dllVersions: string[]
  exeVersions: string[]
}): RequiredInterfaceVersionsResult {
  const { importedSymbols, dllVersions, exeVersions } = args
  const pool = [...dllVersions, ...exeVersions]

  const versionsByFamily = new Map<string, Set<string>>()
  for (const version of pool) {
    const family = familyOfInterfaceVersion(version)
    if (!family) {
      continue
    }
    if (!versionsByFamily.has(family)) {
      versionsByFamily.set(family, new Set())
    }
    versionsByFamily.get(family)?.add(version)
  }

  const required: Record<string, string> = {}
  const problems: string[] = []

  const resolveFamily = (family: string) => {
    const versions = versionsByFamily.get(family)
    if (!versions || versions.size === 0) {
      problems.push(`${family}@unknown-version`)
      return
    }
    if (versions.size > 1) {
      problems.push(
        `${family}@ambiguous(${Array.from(versions).sort().join(',')})`
      )
      return
    }
    required[family] = Array.from(versions)[0]
  }

  if (usesRuntimeInterfaceLookup(importedSymbols)) {
    for (const family of versionsByFamily.keys()) {
      resolveFamily(family)
    }
    return { required, problems }
  }

  const families = new Set<string>()
  for (const symbol of importedSymbols) {
    const family = BARE_ACCESSOR_FAMILY[symbol]
    if (family) {
      families.add(family)
    }
  }
  for (const family of families) {
    resolveFamily(family)
  }

  return { required, problems }
}
