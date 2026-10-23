/**
 * Quick 261024-br4: pure, dependency-free PE scanner for Steam CEG DRM.
 *
 * Todo 2026-10-22 "detect Steam CEG DRM in the bridge prescreen". XCOM
 * (200510) proved that a CEG-protected exe scans clean (its steam_api import
 * table is fully covered), routes to the native bridge, then idles ~30s and
 * exits without a word: CEG asks the Windows Steam client for a per-user
 * build key, and a Mac bridge bottle has no Windows Steam client to answer.
 * The completed todo 2026-10-22 "confirm XCOM CEG diagnosis via bottled
 * Steam" records the diagnosis.
 *
 * CEG leaves named RT_RCDATA (type 10) resources in the exe:
 * STEAM_SPLIT_GUID, STEAM_GUIDD and STEAM_MINSTANCE. This module walks the
 * PE resource directory and reports which of those names are present.
 *
 * It also reports whether a section named `.bind` (SteamStub) is present.
 * That flag is INFORMATIONAL ONLY: SteamStub is in scope for the bridge
 * (todo 2026-10-23 "forwarding steamclient dll for SteamStub titles"), and
 * bottled Steam is a narrow fallback, so `.bind` never changes routing.
 *
 * Zero imports by design (D-51-15), the same discipline as importParse.ts:
 * meta/bridgeCensus.ts bundles this module with no backend module graph.
 * Only Uint8Array / DataView / String.fromCharCode are used.
 * `grep -c "^import" peSteamDrm.ts` must print 0.
 *
 * The exe is untrusted, attacker-shaped input (T-br4-01). Every read is
 * bounds-checked (a short read means "not parsed"), sections are capped at
 * 96, directory entries at 4096, names at 256 code units, subdirectory
 * offsets must move strictly forward, and the whole body is wrapped in
 * try/catch. It never throws.
 */

// Exported for meta/bridgeCensus.ts and tests.
// ts-prune-ignore-next
export const CEG_RESOURCE_NAMES = [
  'STEAM_SPLIT_GUID',
  'STEAM_GUIDD',
  'STEAM_MINSTANCE'
] as const

export type PeSteamDrmResult = {
  /** false when the bytes are not a well-formed PE (treat as not CEG) */
  parsed: boolean
  /** CEG resource names found, as read, de-duplicated, in file order */
  cegMarkers: string[]
  /** a section named `.bind` (SteamStub) exists. Informational only. */
  hasBindSection: boolean
}

/**
 * Ranged read callback. Returns null, or fewer than `length` bytes, when the
 * range runs past EOF. Any short read is treated as a bounds failure.
 */
export type PeReader = (offset: number, length: number) => Uint8Array | null

const unparsed = (): PeSteamDrmResult => ({
  parsed: false,
  cegMarkers: [],
  hasBindSection: false
})

const MAX_SECTIONS = 96
const MAX_DIR_ENTRIES = 4096
const MAX_NAME_UNITS = 256
const RT_RCDATA = 10

class BoundsError extends Error {}

function readExact(read: PeReader, offset: number, length: number): DataView {
  if (!Number.isSafeInteger(offset) || offset < 0 || length < 0) {
    throw new BoundsError('bad offset')
  }
  const bytes = read(offset, length)
  if (!bytes || bytes.length < length) throw new BoundsError('short read')
  return new DataView(bytes.buffer, bytes.byteOffset, length)
}

const u16 = (read: PeReader, offset: number) =>
  readExact(read, offset, 2).getUint16(0, true)
const u32 = (read: PeReader, offset: number) =>
  readExact(read, offset, 4).getUint32(0, true)

type Section = {
  name: string
  va: number
  span: number
  rawPtr: number
}

export function detectSteamDrmInPe(read: PeReader): PeSteamDrmResult {
  try {
    // 1. DOS header
    const mz = readExact(read, 0, 2)
    if (mz.getUint8(0) !== 0x4d || mz.getUint8(1) !== 0x5a) return unparsed()
    const peOffset = u32(read, 0x3c)

    // 2. PE signature + COFF header
    if (u32(read, peOffset) !== 0x00004550) return unparsed()
    const numberOfSections = u16(read, peOffset + 6)
    const sizeOfOptionalHeader = u16(read, peOffset + 20)
    const opt = peOffset + 24

    // 3. optional header magic + resource data directory (index 2)
    const magic = u16(read, opt)
    let rvaCountOffset: number
    let dirsOffset: number
    if (magic === 0x10b) {
      rvaCountOffset = opt + 92
      dirsOffset = opt + 96
    } else if (magic === 0x20b) {
      rvaCountOffset = opt + 108
      dirsOffset = opt + 112
    } else {
      return unparsed()
    }
    const numberOfRvaAndSizes = u32(read, rvaCountOffset)
    let resourceRva = 0
    let resourceSize = 0
    if (numberOfRvaAndSizes >= 3) {
      resourceRva = u32(read, dirsOffset + 2 * 8)
      resourceSize = u32(read, dirsOffset + 2 * 8 + 4)
    }

    // 4. section table
    const sectionTable = opt + sizeOfOptionalHeader
    const sectionCount = Math.min(numberOfSections, MAX_SECTIONS)
    const sections: Section[] = []
    let hasBindSection = false
    for (let i = 0; i < sectionCount; i++) {
      const base = sectionTable + i * 40
      const nameView = readExact(read, base, 8)
      let name = ''
      for (let j = 0; j < 8; j++) {
        const c = nameView.getUint8(j)
        if (c === 0) break
        name += String.fromCharCode(c)
      }
      const virtualSize = u32(read, base + 8)
      const va = u32(read, base + 12)
      const sizeOfRawData = u32(read, base + 16)
      const rawPtr = u32(read, base + 20)
      if (name === '.bind') hasBindSection = true
      sections.push({
        name,
        va,
        span: Math.max(virtualSize, sizeOfRawData),
        rawPtr
      })
    }

    if (resourceSize === 0 || resourceRva === 0) {
      return { parsed: true, cegMarkers: [], hasBindSection }
    }

    // 5. RVA -> file offset
    const container = sections.find(
      (s) => s.va <= resourceRva && resourceRva < s.va + s.span
    )
    if (!container) return unparsed()
    const root = container.rawPtr + (resourceRva - container.va)

    // 6. a directory's entries, with the entry cap
    const readDir = (dirOffset: number) => {
      const named = u16(read, dirOffset + 12)
      const ids = u16(read, dirOffset + 14)
      const total = named + ids
      if (total > MAX_DIR_ENTRIES) throw new BoundsError('too many entries')
      const entries: { name: number; data: number; isNamed: boolean }[] = []
      for (let i = 0; i < total; i++) {
        const e = dirOffset + 16 + i * 8
        entries.push({
          name: u32(read, e),
          data: u32(read, e + 4),
          isNamed: i < named
        })
      }
      return entries
    }

    // 7. top level: find RT_RCDATA with a subdirectory
    const cegMarkers: string[] = []
    const wanted = new Set<string>(CEG_RESOURCE_NAMES)
    for (const top of readDir(root)) {
      if (top.isNamed || top.name !== RT_RCDATA) continue
      if ((top.data & 0x80000000) === 0) continue
      const subRel = top.data & 0x7fffffff
      // 8. cycle guard: a subdirectory must sit strictly after its parent
      if (subRel === 0) return unparsed()
      const sub = root + subRel
      for (const entry of readDir(sub)) {
        if ((entry.name & 0x80000000) === 0) continue
        const strOffset = root + (entry.name & 0x7fffffff)
        const len = Math.min(u16(read, strOffset), MAX_NAME_UNITS)
        const view = readExact(read, strOffset + 2, len * 2)
        let s = ''
        for (let k = 0; k < len; k++) {
          s += String.fromCharCode(view.getUint16(k * 2, true))
        }
        if (wanted.has(s.toUpperCase()) && !cegMarkers.includes(s)) {
          cegMarkers.push(s)
        }
      }
    }

    return { parsed: true, cegMarkers, hasBindSection }
  } catch {
    return unparsed()
  }
}

// Convenience wrapper over an in-memory buffer; used by tests and tooling.
// ts-prune-ignore-next
export function detectSteamDrmInPeBytes(bytes: Uint8Array): PeSteamDrmResult {
  return detectSteamDrmInPe((offset, length) =>
    offset + length > bytes.length
      ? null
      : bytes.subarray(offset, offset + length)
  )
}
