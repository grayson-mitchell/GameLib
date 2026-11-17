/**
 * quick 261117-p38: read-only Mach-O reader for the "Launch without Steam"
 * eligibility verdict. Lists the dylibs a binary loads (thin 32/64-bit and
 * fat/fat64) from ranged reads only, and walks an install tree for shipped
 * Steam API files. Nothing here writes, copies or replaces a steam_api file
 * (DRM boundary).
 *
 * The bytes are third-party and possibly hostile: every read is bounded, every
 * load command is bounds-checked, and nothing throws. Anything that does not
 * parse is `null` / 'unreadable', which the verdict treats as "unknown" and
 * fails closed.
 */
import { open, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export type RangedRead = (offset: number, length: number) => Promise<Buffer>

const MH_MAGIC = 0xfeedface
const MH_MAGIC_64 = 0xfeedfacf
const MH_CIGAM = 0xcefaedfe
const MH_CIGAM_64 = 0xcffaedfe
const FAT_MAGIC = 0xcafebabe
const FAT_MAGIC_64 = 0xcafebabf

const MAX_FAT_ARCHES = 16
const MAX_SIZEOFCMDS = 1024 * 1024

// A frozen tuple, not a module-level Set: the module-state census counts Sets, and this never mutates.
const DYLIB_COMMANDS: readonly number[] = [
  0xc, // LC_LOAD_DYLIB
  0x80000018, // LC_LOAD_WEAK_DYLIB
  0x8000001f, // LC_REEXPORT_DYLIB
  0x20, // LC_LAZY_LOAD_DYLIB
  0x80000023 // LC_LOAD_UPWARD_DYLIB
]

async function readExact(
  read: RangedRead,
  offset: number,
  length: number
): Promise<Buffer | null> {
  if (!Number.isSafeInteger(offset) || offset < 0 || length < 0) return null
  const buf = await read(offset, length)
  return buf.length === length ? buf : null
}

async function listSliceDylibs(
  read: RangedRead,
  base: number
): Promise<string[] | null> {
  const magicBuf = await readExact(read, base, 4)
  if (!magicBuf) return null
  const magicBE = magicBuf.readUInt32BE(0)
  let le: boolean
  let headerSize: number
  switch (magicBE) {
    case MH_MAGIC_64:
      // 0xfeedfacf written big-endian == bytes fe ed fa cf
      le = false
      headerSize = 32
      break
    case MH_MAGIC:
      le = false
      headerSize = 28
      break
    case MH_CIGAM_64:
      le = true
      headerSize = 32
      break
    case MH_CIGAM:
      le = true
      headerSize = 28
      break
    default:
      return null
  }
  const header = await readExact(read, base, headerSize)
  if (!header) return null
  const u32 = (b: Buffer, o: number) =>
    le ? b.readUInt32LE(o) : b.readUInt32BE(o)
  const ncmds = u32(header, 16)
  const sizeofcmds = u32(header, 20)
  if (sizeofcmds > MAX_SIZEOFCMDS) return null
  const block = await readExact(read, base + headerSize, sizeofcmds)
  if (!block) return null

  const names: string[] = []
  let pos = 0
  for (let i = 0; i < ncmds; i++) {
    if (pos + 8 > sizeofcmds) return null
    const cmd = u32(block, pos)
    const cmdsize = u32(block, pos + 4)
    if (cmdsize < 8 || pos + cmdsize > sizeofcmds) return null
    if (DYLIB_COMMANDS.includes(cmd)) {
      if (cmdsize < 12) return null
      const nameOff = u32(block, pos + 8)
      if (nameOff < 12 || nameOff >= cmdsize) return null
      const start = pos + nameOff
      const end = pos + cmdsize
      let nul = start
      while (nul < end && block[nul] !== 0) nul++
      names.push(block.toString('utf8', start, nul))
    }
    pos += cmdsize
  }
  return names
}

/** The dylib names a Mach-O loads, or null when the bytes are not a parseable Mach-O. */
export async function listMachODylibs(
  read: RangedRead
): Promise<string[] | null> {
  try {
    const magicBuf = await readExact(read, 0, 4)
    if (!magicBuf) return null
    const magic = magicBuf.readUInt32BE(0)
    if (magic !== FAT_MAGIC && magic !== FAT_MAGIC_64) {
      return await listSliceDylibs(read, 0)
    }
    const is64 = magic === FAT_MAGIC_64
    const countBuf = await readExact(read, 4, 4)
    if (!countBuf) return null
    const nfat = countBuf.readUInt32BE(0)
    if (nfat === 0 || nfat > MAX_FAT_ARCHES) return null
    const entrySize = is64 ? 32 : 20
    const table = await readExact(read, 8, nfat * entrySize)
    if (!table) return null
    const union = new Set<string>()
    for (let i = 0; i < nfat; i++) {
      const o = i * entrySize
      const offset = is64
        ? Number(table.readBigUInt64BE(o + 8))
        : table.readUInt32BE(o + 8)
      const names = await listSliceDylibs(read, offset)
      if (names === null) return null
      for (const n of names) union.add(n)
    }
    return [...union]
  } catch {
    return null
  }
}

export type MachOLinkResult = 'links' | 'clean' | 'unreadable'

/** Whether the Mach-O at `path` loads a libsteam_api dylib. Never throws. */
export async function machOLinksSteamApi(
  path: string
): Promise<MachOLinkResult> {
  let handle
  try {
    handle = await open(path, 'r')
    const fh = handle
    const names = await listMachODylibs(async (offset, length) => {
      const buf = Buffer.alloc(length)
      const { bytesRead } = await fh.read(buf, 0, length, offset)
      return buf.subarray(0, bytesRead)
    })
    if (names === null) return 'unreadable'
    const links = names.some((n) => {
      const base = n.slice(n.lastIndexOf('/') + 1).toLowerCase()
      return base.includes('steam_api')
    })
    return links ? 'links' : 'clean'
  } catch {
    return 'unreadable'
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

const WALK_MAX_DEPTH = 8
const WALK_MAX_ENTRIES = 20000

/**
 * Bounded walk for shipped Steam API files: a libsteam_api.dylib file or a
 * steam_api.bundle / steam_api.framework directory. Never follows links.
 */
export async function findMacSteamApiFiles(root: string): Promise<string[]> {
  const found: string[] = []
  let seen = 0
  const walk = async (dir: string, depth: number): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (seen++ >= WALK_MAX_ENTRIES) return
      if (entry.isSymbolicLink()) continue
      const full = join(dir, entry.name)
      const lower = entry.name.toLowerCase()
      if (entry.isDirectory()) {
        if (lower === 'steam_api.bundle' || lower === 'steam_api.framework') {
          found.push(full)
          continue
        }
        if (depth < WALK_MAX_DEPTH) await walk(full, depth + 1)
        continue
      }
      if (entry.isFile() && lower === 'libsteam_api.dylib') found.push(full)
    }
  }
  await walk(root, 0)
  return found
}
