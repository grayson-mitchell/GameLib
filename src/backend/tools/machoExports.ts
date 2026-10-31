/**
 * In-process Mach-O defined-external symbol reader (quick 261031-rjv).
 *
 * Gives `nm -gU` semantics without spawning `nm`: on macOS `/usr/bin/nm` is an xcrun
 * shim that can pop the "install command line developer tools" dialog on machines
 * without CLT. Reading LC_SYMTAB / LC_DYSYMTAB directly spawns nothing.
 */
import { existsSync, readFileSync } from 'graceful-fs'
import { join } from 'path'

const MH_MAGIC_64 = 0xfeedfacf
const FAT_MAGIC = 0xcafebabe
const CPU_TYPE_X86_64 = 0x01000007
const LC_SYMTAB = 0x2
const LC_DYSYMTAB = 0xb
const NLIST_64_SIZE = 16
const N_EXT = 0x01
const N_TYPE_MASK = 0x0e
const N_STAB_MASK = 0xe0

const DXMT_REQUIRED_MACDRV_SYMBOLS = [
  '_macdrv_functions',
  '_macdrv_view_create_metal_view',
  '_macdrv_view_get_metal_layer',
  '_macdrv_view_release_metal_view'
] as const

function readCString(buf: Buffer, start: number, limit: number): string | null {
  if (start < 0 || start >= limit) return null
  const end = buf.indexOf(0, start)
  if (end === -1 || end > limit) return null
  return buf.toString('utf8', start, end)
}

function parseThin(buf: Buffer): string[] | null {
  if (buf.length < 32 || buf.readUInt32LE(0) !== MH_MAGIC_64) return null
  const ncmds = buf.readUInt32LE(16)
  let off = 32
  let sym: { symoff: number; nsyms: number; stroff: number; strsize: number }
  let dysym: { iextdefsym: number; nextdefsym: number } | undefined
  let haveSym = false

  for (let i = 0; i < ncmds; i++) {
    if (off + 8 > buf.length) return null
    const cmd = buf.readUInt32LE(off)
    const cmdsize = buf.readUInt32LE(off + 4)
    if (cmdsize < 8 || off + cmdsize > buf.length) return null
    if (cmd === LC_SYMTAB) {
      if (cmdsize < 24) return null
      sym = {
        symoff: buf.readUInt32LE(off + 8),
        nsyms: buf.readUInt32LE(off + 12),
        stroff: buf.readUInt32LE(off + 16),
        strsize: buf.readUInt32LE(off + 20)
      }
      haveSym = true
    } else if (cmd === LC_DYSYMTAB) {
      if (cmdsize < 24) return null
      dysym = {
        iextdefsym: buf.readUInt32LE(off + 16),
        nextdefsym: buf.readUInt32LE(off + 20)
      }
    }
    off += cmdsize
  }
  if (!haveSym) return null
  const s = sym!

  const first = dysym ? dysym.iextdefsym : 0
  const count = dysym ? dysym.nextdefsym : s.nsyms
  if (first + count > s.nsyms) return null
  const strEnd = s.stroff + s.strsize
  if (strEnd > buf.length) return null
  if (s.symoff + s.nsyms * NLIST_64_SIZE > buf.length) return null

  const out: string[] = []
  for (let i = first; i < first + count; i++) {
    const p = s.symoff + i * NLIST_64_SIZE
    const nStrx = buf.readUInt32LE(p)
    const nType = buf.readUInt8(p + 4)
    if ((nType & N_EXT) === 0) continue
    if ((nType & N_TYPE_MASK) === 0) continue
    if ((nType & N_STAB_MASK) !== 0) continue
    const name = readCString(buf, s.stroff + nStrx, strEnd)
    if (name === null) return null
    out.push(name)
  }
  return out
}

/** Names of defined external symbols, or null when not a supported Mach-O. Never throws. */
export function parseMachODefinedExternals(buf: Buffer): string[] | null {
  try {
    if (buf.length >= 8 && buf.readUInt32BE(0) === FAT_MAGIC) {
      const n = buf.readUInt32BE(4)
      for (let i = 0; i < n; i++) {
        const p = 8 + i * 20
        if (p + 20 > buf.length) return null
        if (buf.readUInt32BE(p) !== CPU_TYPE_X86_64) continue
        const offset = buf.readUInt32BE(p + 8)
        const size = buf.readUInt32BE(p + 12)
        if (offset + size > buf.length) return null
        return parseThin(buf.subarray(offset, offset + size))
      }
      return null
    }
    return parseThin(buf)
  } catch {
    return null
  }
}

export type WinemacMetalCheck =
  | { ok: true }
  | { ok: false; winemacPath: string; reason: string; missing: string[] }

export function checkWinemacMetalViewExports(
  wineBundlePath: string
): WinemacMetalCheck {
  const winemacPath = join(
    wineBundlePath,
    'Contents',
    'Resources',
    'wine',
    'lib',
    'wine',
    'x86_64-unix',
    'winemac.so'
  )
  const all = [...DXMT_REQUIRED_MACDRV_SYMBOLS] as string[]
  let buf: Buffer
  try {
    if (!existsSync(winemacPath)) {
      return {
        ok: false,
        winemacPath,
        reason: 'winemac.so not found',
        missing: all
      }
    }
    buf = readFileSync(winemacPath)
  } catch (error) {
    return {
      ok: false,
      winemacPath,
      reason: `could not read winemac.so: ${String(error)}`,
      missing: all
    }
  }

  const defined = parseMachODefinedExternals(buf)
  if (defined === null) {
    return {
      ok: false,
      winemacPath,
      reason: 'winemac.so is not a parseable x86_64 Mach-O',
      missing: all
    }
  }

  const set = new Set(defined)
  if (set.has('_macdrv_functions')) return { ok: true }
  if (all.slice(1).every((n) => set.has(n))) return { ok: true }
  return {
    ok: false,
    winemacPath,
    reason: 'winemac.so lacks the macdrv metal-view exports',
    missing: all.filter((n) => !set.has(n))
  }
}
