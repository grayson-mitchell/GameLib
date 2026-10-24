/**
 * Phase 53-02: pure, dependency-free reader for the steam_api / steam_api64
 * DllImport entry points of a Mono (.NET) assembly, plus the CLR-flag AnyCPU
 * arch rule.
 *
 * Why this exists. Steamworks.NET declares 930-952 P/Invokes into
 * steam_api(64).dll. The bridge scan must see them to give an honest verdict,
 * and the native import table of a Mono Unity exe says nothing about them
 * (D-53-04). The metadata is parsed as bytes: ECMA-335 CLI header, the `#~`
 * tables, ModuleRef (0x1A) and ImplMap (0x1C). No managed code is executed
 * and nothing is loaded.
 *
 * It also hosts `effectiveLaunchArch` (D-53-10, amended; 53-13 WR-02): an I386
 * PE with an IL-only CLR header (COMIMAGE_FLAGS_ILONLY, 0x1) is AnyCPU and runs
 * as x64 on a 64-bit host unless COMIMAGE_FLAGS_32BITREQUIRED (0x2) or
 * COMIMAGE_FLAGS_32BITPREFERRED (0x20000) is set. Without ILONLY it is
 * mixed-mode C++/CLI, which loads as a 32-bit process.
 *
 * Zero imports by design (D-51-15): meta/bridgeCensus.ts bundles this module
 * standalone, so the helpers below (PeReader, BoundsError, readExact, u16,
 * u32) are duplicated from peSteamDrm.ts, where they are file-private.
 * `grep -c "^import" managedImports.ts` must print 0.
 *
 * Untrusted-input contract (threats T-53-05, T-53-06, T-53-07): the assembly
 * is attacker-shaped. Reads are ranged and every one is bounds-checked (a
 * short read means "not parsed"); streams, row counts and total requested
 * bytes are capped; string reads stay inside the heap; the whole body is
 * wrapped in try/catch. It never throws and never executes managed code.
 */

/**
 * Ranged read callback. Returns null, or fewer than `length` bytes, when the
 * range runs past EOF. Any short read is treated as a bounds failure.
 */
export type PeReader = (offset: number, length: number) => Uint8Array | null

/** CLR header flag: pure IL, no native code (AnyCPU is only possible then). */
const COMIMAGE_FLAGS_ILONLY = 0x1
/** CLR header flag: the image must run as 32-bit. */
const COMIMAGE_FLAGS_32BITREQUIRED = 0x2
/** CLR header flag: the image prefers 32-bit (AnyCPU "Prefer 32-bit"). */
const COMIMAGE_FLAGS_32BITPREFERRED = 0x20000

interface ClrHeaderInfo {
  flags: number
  metadataRva: number
  metadataSize: number
}

const MAX_SECTIONS = 96
const MAX_STREAMS = 16
const MAX_ROWS = 1 << 22
const MAX_METADATA_BYTES = 64 * 1024 * 1024
const MAX_VERSION_LENGTH = 256
const MAX_STREAM_NAME = 32
const MAX_STRING_BYTES = 512

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

type Section = { va: number; span: number; rawPtr: number }

type PeLayout = {
  peOffset: number
  magic: number
  dirsOffset: number
  numberOfRvaAndSizes: number
  sections: Section[]
}

function readPeLayout(read: PeReader): PeLayout {
  const mz = readExact(read, 0, 2)
  if (mz.getUint8(0) !== 0x4d || mz.getUint8(1) !== 0x5a) {
    throw new BoundsError('not MZ')
  }
  const peOffset = u32(read, 0x3c)
  if (u32(read, peOffset) !== 0x00004550) throw new BoundsError('not PE')
  const numberOfSections = u16(read, peOffset + 6)
  const sizeOfOptionalHeader = u16(read, peOffset + 20)
  const opt = peOffset + 24
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
    throw new BoundsError('bad optional header magic')
  }
  const numberOfRvaAndSizes = u32(read, rvaCountOffset)
  const sectionTable = opt + sizeOfOptionalHeader
  const sectionCount = Math.min(numberOfSections, MAX_SECTIONS)
  const sections: Section[] = []
  for (let i = 0; i < sectionCount; i++) {
    const base = sectionTable + i * 40
    const virtualSize = u32(read, base + 8)
    const va = u32(read, base + 12)
    const sizeOfRawData = u32(read, base + 16)
    const rawPtr = u32(read, base + 20)
    sections.push({ va, span: Math.max(virtualSize, sizeOfRawData), rawPtr })
  }
  return { peOffset, magic, dirsOffset, numberOfRvaAndSizes, sections }
}

function rvaToOffset(sections: Section[], rva: number): number {
  const s = sections.find((x) => x.va <= rva && rva < x.va + x.span)
  if (!s) throw new BoundsError('rva outside every section')
  return s.rawPtr + (rva - s.va)
}

/** Throws BoundsError on malformed bytes; null when there is no CLR header. */
function clrHeaderOrThrow(
  read: PeReader,
  layout: PeLayout
): (ClrHeaderInfo & { metadataOffset: number }) | null {
  if (layout.numberOfRvaAndSizes < 15) return null
  const clrRva = u32(read, layout.dirsOffset + 14 * 8)
  const clrSize = u32(read, layout.dirsOffset + 14 * 8 + 4)
  if (clrRva === 0 || clrSize === 0) return null
  const clrOffset = rvaToOffset(layout.sections, clrRva)
  const flags = u32(read, clrOffset + 16)
  const metadataRva = u32(read, clrOffset + 8)
  const metadataSize = u32(read, clrOffset + 12)
  const metadataOffset =
    metadataRva === 0 ? 0 : rvaToOffset(layout.sections, metadataRva)
  return { flags, metadataRva, metadataSize, metadataOffset }
}

/**
 * The CLR header facts of a PE (flags and metadata location), or null when
 * the bytes are not a well-formed PE or carry no CLR header. Never throws.
 */
export function readPeClrHeader(read: PeReader): ClrHeaderInfo | null {
  try {
    const layout = readPeLayout(read)
    const info = clrHeaderOrThrow(read, layout)
    if (!info) return null
    return {
      flags: info.flags,
      metadataRva: info.metadataRva,
      metadataSize: info.metadataSize
    }
  } catch {
    return null
  }
}

/**
 * D-53-10 (amended): the arch a PE actually launches as. An I386 machine with
 * an IL-only CLR header is AnyCPU, which runs as x64 on a 64-bit host unless the
 * CLR flags demand or prefer 32-bit; an I386 image without ILONLY is mixed-mode
 * C++/CLI and stays x86 (53-13 WR-02). Every other input keeps its machine arch.
 */
export function effectiveLaunchArch(
  machine: 'x86' | 'x64' | null,
  clrFlags: number | null
): 'x86' | 'x64' | null {
  if (machine === 'x86' && clrFlags !== null) {
    const bit32 = COMIMAGE_FLAGS_32BITREQUIRED | COMIMAGE_FLAGS_32BITPREFERRED
    if ((clrFlags & COMIMAGE_FLAGS_ILONLY) !== 0 && (clrFlags & bit32) === 0) {
      return 'x64'
    }
  }
  return machine
}

/** `effectiveLaunchArch` over a PE read in place. Never throws. */
export function readPeEffectiveArch(read: PeReader): 'x86' | 'x64' | null {
  try {
    // Machine type first, from the COFF header alone: a PE too sparse for the
    // full optional-header layout (no CLR to find) still has an honest arch.
    const mz = readExact(read, 0, 2)
    if (mz.getUint8(0) !== 0x4d || mz.getUint8(1) !== 0x5a) return null
    const peOffset = u32(read, 0x3c)
    if (u32(read, peOffset) !== 0x00004550) return null
    const machine = u16(read, peOffset + 4)
    const arch = machine === 0x14c ? 'x86' : machine === 0x8664 ? 'x64' : null
    if (arch !== 'x86') return arch
    const clr = readPeClrHeader(read)
    return effectiveLaunchArch(arch, clr ? clr.flags : null)
  } catch {
    return null
  }
}

interface ManagedImportsResult {
  /** false when the bytes are not a well-formed PE / CLI image */
  parsed: boolean
  isManaged: boolean
  /** lowercased module name (no .dll) -> sorted, de-duplicated entry points */
  importsByModule: Record<string, string[]>
  steamApiImports: { steam_api: string[]; steam_api64: string[] }
}

const emptyResult = (
  parsed: boolean,
  isManaged: boolean
): ManagedImportsResult => ({
  parsed,
  isManaged,
  importsByModule: {},
  steamApiImports: { steam_api: [], steam_api64: [] }
})

// ECMA-335 II.24.2.6 coded index tag lists, as table numbers.
const TYPE_DEF_OR_REF = [0x02, 0x01, 0x1b]
const RESOLUTION_SCOPE = [0x00, 0x1a, 0x23, 0x01]
const HAS_CONSTANT = [0x04, 0x08, 0x17]
const HAS_CUSTOM_ATTRIBUTE = [
  0x06, 0x04, 0x01, 0x02, 0x08, 0x09, 0x0a, 0x00, 0x0e, 0x17, 0x14, 0x11, 0x1a,
  0x1b, 0x20, 0x23, 0x26, 0x27, 0x28, 0x2a, 0x2c, 0x2b
]
const HAS_FIELD_MARSHAL = [0x04, 0x08]
const HAS_DECL_SECURITY = [0x02, 0x06, 0x20]
const MEMBER_REF_PARENT = [0x02, 0x01, 0x1a, 0x06, 0x1b]
const HAS_SEMANTICS = [0x14, 0x17]
const METHOD_DEF_OR_REF = [0x06, 0x0a]
const MEMBER_FORWARDED = [0x04, 0x06]
const CUSTOM_ATTRIBUTE_TYPE = [0x06, 0x0a]

const T_MODULE_REF = 0x1a
const T_IMPL_MAP = 0x1c

function tableRowSizes(heapSizes: number, rows: number[]) {
  const str = heapSizes & 1 ? 4 : 2
  const guid = heapSizes & 2 ? 4 : 2
  const blob = heapSizes & 4 ? 4 : 2
  const idx = (t: number) => ((rows[t] ?? 0) >= 65536 ? 4 : 2)
  const coded = (tables: number[], bits: number) =>
    Math.max(...tables.map((t) => rows[t] ?? 0)) >= 1 << (16 - bits) ? 4 : 2
  const sizes: number[] = []
  sizes[0x00] = 2 + str + 3 * guid
  sizes[0x01] = coded(RESOLUTION_SCOPE, 2) + 2 * str
  sizes[0x02] = 4 + 2 * str + coded(TYPE_DEF_OR_REF, 2) + idx(0x04) + idx(0x06)
  sizes[0x03] = idx(0x04)
  sizes[0x04] = 2 + str + blob
  sizes[0x05] = idx(0x06)
  sizes[0x06] = 8 + str + blob + idx(0x08)
  sizes[0x07] = idx(0x08)
  sizes[0x08] = 4 + str
  sizes[0x09] = idx(0x02) + coded(TYPE_DEF_OR_REF, 2)
  sizes[0x0a] = coded(MEMBER_REF_PARENT, 3) + str + blob
  sizes[0x0b] = 2 + coded(HAS_CONSTANT, 2) + blob
  sizes[0x0c] =
    coded(HAS_CUSTOM_ATTRIBUTE, 5) + coded(CUSTOM_ATTRIBUTE_TYPE, 3) + blob
  sizes[0x0d] = coded(HAS_FIELD_MARSHAL, 1) + blob
  sizes[0x0e] = 2 + coded(HAS_DECL_SECURITY, 2) + blob
  sizes[0x0f] = 6 + idx(0x02)
  sizes[0x10] = 4 + idx(0x04)
  sizes[0x11] = blob
  sizes[0x12] = idx(0x02) + idx(0x14)
  sizes[0x13] = idx(0x14)
  sizes[0x14] = 2 + str + coded(TYPE_DEF_OR_REF, 2)
  sizes[0x15] = idx(0x02) + idx(0x17)
  sizes[0x16] = idx(0x17)
  sizes[0x17] = 2 + str + blob
  sizes[0x18] = 2 + idx(0x06) + coded(HAS_SEMANTICS, 1)
  sizes[0x19] = idx(0x02) + 2 * coded(METHOD_DEF_OR_REF, 1)
  sizes[0x1a] = str
  sizes[0x1b] = blob
  sizes[0x1c] = 2 + coded(MEMBER_FORWARDED, 1) + str + idx(T_MODULE_REF)
  return { sizes, str }
}

const normaliseModule = (name: string) =>
  name.toLowerCase().replace(/\.dll$/, '')

const sortedUnique = (xs: Iterable<string>) => [...new Set(xs)].sort()

function parseManaged(
  read: PeReader,
  info: ClrHeaderInfo & { metadataOffset: number }
): ManagedImportsResult {
  const { metadataOffset: root, metadataSize } = info
  if (info.metadataRva === 0 || metadataSize === 0) throw new BoundsError('md')
  if (metadataSize > MAX_METADATA_BYTES) throw new BoundsError('md too big')

  // Metadata root: signature, version string, stream headers.
  if (u32(read, root) !== 0x424a5342) throw new BoundsError('no BSJB')
  const versionLength = u32(read, root + 12)
  if (versionLength > MAX_VERSION_LENGTH) throw new BoundsError('version')
  const streamCount = u16(read, root + 16 + versionLength + 2)
  if (streamCount > MAX_STREAMS) throw new BoundsError('too many streams')
  let cursor = root + 16 + versionLength + 4
  const streams = new Map<string, { offset: number; size: number }>()
  for (let i = 0; i < streamCount; i++) {
    const offset = u32(read, cursor)
    const size = u32(read, cursor + 4)
    const nameView = readExact(read, cursor + 8, MAX_STREAM_NAME)
    let name = ''
    let j = 0
    for (; j < MAX_STREAM_NAME; j++) {
      const c = nameView.getUint8(j)
      if (c === 0) break
      name += String.fromCharCode(c)
    }
    if (j === MAX_STREAM_NAME) throw new BoundsError('stream name')
    if (offset + size > metadataSize) throw new BoundsError('stream range')
    streams.set(name, { offset, size })
    cursor += 8 + ((j + 1 + 3) & ~3)
  }
  const tilde = streams.get('#~') ?? streams.get('#-')
  const strings = streams.get('#Strings')
  if (!tilde || !strings) throw new BoundsError('missing streams')

  // `#~` header: HeapSizes, Valid bit-vector, row counts.
  const tildeOff = root + tilde.offset
  const header = readExact(read, tildeOff, 24)
  const heapSizes = header.getUint8(6)
  const validLo = header.getUint32(8, true)
  const validHi = header.getUint32(12, true)
  const rows = new Array<number>(64).fill(0)
  let rowsCursor = tildeOff + 24
  for (let t = 0; t < 64; t++) {
    const bit = t < 32 ? (validLo >>> t) & 1 : (validHi >>> (t - 32)) & 1
    if (!bit) continue
    const count = u32(read, rowsCursor)
    if (count > MAX_ROWS) throw new BoundsError('too many rows')
    rows[t] = count
    rowsCursor += 4
  }

  const { sizes, str: strWidth } = tableRowSizes(heapSizes, rows)
  const tildeEnd = tilde.size
  const tableOffset: number[] = []
  let dataCursor = rowsCursor - tildeOff
  for (let t = 0; t <= T_IMPL_MAP; t++) {
    tableOffset[t] = dataCursor
    dataCursor += rows[t] * sizes[t]
    if (dataCursor > tildeEnd) throw new BoundsError('tables past stream')
  }

  const heap = readExact(read, root + strings.offset, strings.size)
  const readString = (idx: number): string => {
    if (idx >= strings.size) throw new BoundsError('string index')
    const limit = Math.min(strings.size, idx + MAX_STRING_BYTES)
    let s = ''
    for (let p = idx; p < limit; p++) {
      const c = heap.getUint8(p)
      if (c === 0) return s
      s += String.fromCharCode(c)
    }
    throw new BoundsError('unterminated string')
  }
  const readIdx = (view: DataView, at: number, width: number) =>
    width === 4 ? view.getUint32(at, true) : view.getUint16(at, true)

  // ModuleRef rows: Name only.
  const moduleNames: string[] = []
  const mrRows = rows[T_MODULE_REF]
  if (mrRows > 0) {
    const mr = readExact(
      read,
      tildeOff + tableOffset[T_MODULE_REF],
      mrRows * sizes[T_MODULE_REF]
    )
    for (let i = 0; i < mrRows; i++) {
      moduleNames.push(
        normaliseModule(readString(readIdx(mr, i * strWidth, strWidth)))
      )
    }
  }

  // ImplMap rows: flags, MemberForwarded, ImportName, ImportScope.
  const result = emptyResult(true, true)
  const byModule = new Map<string, string[]>()
  const imRows = rows[T_IMPL_MAP]
  if (imRows > 0) {
    const rowSize = sizes[T_IMPL_MAP]
    const mfWidth = Math.max(rows[0x04], rows[0x06]) >= 1 << 15 ? 4 : 2
    const scopeWidth = rows[T_MODULE_REF] >= 65536 ? 4 : 2
    const im = readExact(
      read,
      tildeOff + tableOffset[T_IMPL_MAP],
      imRows * rowSize
    )
    for (let i = 0; i < imRows; i++) {
      const base = i * rowSize
      const name = readString(readIdx(im, base + 2 + mfWidth, strWidth))
      const scope = readIdx(im, base + 2 + mfWidth + strWidth, scopeWidth)
      if (scope < 1 || scope > moduleNames.length) {
        throw new BoundsError('scope index')
      }
      const mod = moduleNames[scope - 1]
      const list = byModule.get(mod) ?? []
      list.push(name)
      byModule.set(mod, list)
    }
  }
  for (const [mod, names] of byModule) {
    result.importsByModule[mod] = sortedUnique(names)
  }
  result.steamApiImports.steam_api = result.importsByModule['steam_api'] ?? []
  result.steamApiImports.steam_api64 =
    result.importsByModule['steam_api64'] ?? []
  return result
}

/**
 * The steam_api / steam_api64 DllImport entry points of a Mono assembly
 * (D-53-04). A non-managed PE reads `{ parsed: true, isManaged: false }`;
 * anything malformed or over a cap reads `{ parsed: false }`. Never throws.
 */
export function readManagedSteamApiImports(
  read: PeReader
): ManagedImportsResult {
  let requested = 0
  const counted: PeReader = (offset, length) => {
    requested += length
    if (requested > MAX_METADATA_BYTES) throw new BoundsError('byte budget')
    return read(offset, length)
  }
  try {
    const layout = readPeLayout(counted)
    const info = clrHeaderOrThrow(counted, layout)
    if (!info) return emptyResult(true, false)
    return parseManaged(counted, info)
  } catch {
    return emptyResult(false, false)
  }
}
