/**
 * Quick 261024-j4l: synthetic PE builder for the Delay Import Directory
 * (data directory 13). Builds a minimal valid PE32 / PE32+ in memory: one
 * section holding the delay descriptor table, the INT thunks and the
 * hint/name entries. No game binaries are used or checked in.
 */

export type DelayImportDll = {
  name: string
  /** a string is a by-name import, a number an ordinal */
  imports: (string | number)[]
}

export type DelayImportPeOptions = {
  plus: boolean
  dlls: DelayImportDll[]
  /** Attributes = 0 and the descriptor fields are VAs (ImageBase + RVA) */
  vaForm?: boolean
}

const PE_OFFSET = 0x80
const SECTION_VA = 0x1000
const SECTION_RAW = 0x400
const SECTION_SIZE = 0x8000
const IMAGE_BASE_32 = 0x400000
const IMAGE_BASE_64 = 0x140000000

export function buildDelayImportPe(opts: DelayImportPeOptions): Buffer {
  const { plus, dlls } = opts
  // the VA form only exists for PE32; PE32+ descriptors are always RVAs
  const vaForm = (opts.vaForm ?? false) && !plus
  const buf = Buffer.alloc(SECTION_RAW + SECTION_SIZE)
  buf.write('MZ', 0, 'latin1')
  buf.writeUInt32LE(PE_OFFSET, 0x3c)
  buf.writeUInt32LE(0x00004550, PE_OFFSET)
  buf.writeUInt16LE(plus ? 0x8664 : 0x14c, PE_OFFSET + 4)
  buf.writeUInt16LE(1, PE_OFFSET + 6) // one section
  const optSize = plus ? 240 : 224
  buf.writeUInt16LE(optSize, PE_OFFSET + 20)
  const opt = PE_OFFSET + 24
  buf.writeUInt16LE(plus ? 0x20b : 0x10b, opt)
  const imageBase = plus ? IMAGE_BASE_64 : IMAGE_BASE_32
  if (plus) buf.writeBigUInt64LE(BigInt(imageBase), opt + 24)
  else buf.writeUInt32LE(imageBase, opt + 28)
  buf.writeUInt32LE(16, opt + (plus ? 108 : 92)) // NumberOfRvaAndSizes
  const dirs = opt + (plus ? 112 : 96)

  // section table
  const sec = opt + optSize
  buf.write('.didat', sec, 'latin1')
  buf.writeUInt32LE(SECTION_SIZE, sec + 8)
  buf.writeUInt32LE(SECTION_VA, sec + 12)
  buf.writeUInt32LE(SECTION_SIZE, sec + 16)
  buf.writeUInt32LE(SECTION_RAW, sec + 20)

  // section content: descriptors (+ zero terminator) first
  let cursor = (dlls.length + 1) * 32
  const rvaOf = (at: number) => SECTION_VA + at
  const field = (at: number) => (vaForm ? imageBase + rvaOf(at) : rvaOf(at))
  const thunk = plus ? 8 : 4

  dlls.forEach((dll, i) => {
    const nameAt = cursor
    buf.write(dll.name + '\0', SECTION_RAW + nameAt, 'latin1')
    cursor += dll.name.length + 1
    cursor = (cursor + 1) & ~1

    const entryRvas = dll.imports.map((imp) => {
      if (typeof imp === 'number') return imp
      const at = cursor
      buf.writeUInt16LE(0, SECTION_RAW + at) // hint
      buf.write(imp + '\0', SECTION_RAW + at + 2, 'latin1')
      cursor += 2 + imp.length + 1
      cursor = (cursor + 1) & ~1
      return rvaOf(at)
    })

    cursor = (cursor + 7) & ~7
    const intAt = cursor
    dll.imports.forEach((imp, k) => {
      const at = SECTION_RAW + intAt + k * thunk
      const value = entryRvas[k]
      if (typeof imp === 'number') {
        if (plus) {
          buf.writeUInt32LE(value, at)
          buf.writeUInt32LE(0x80000000, at + 4)
        } else {
          buf.writeUInt32LE((0x80000000 | value) >>> 0, at)
        }
      } else {
        // by-name entries are VAs in the VA form, RVAs otherwise
        const full = vaForm ? imageBase + value : value
        if (plus) buf.writeBigUInt64LE(BigInt(full), at)
        else buf.writeUInt32LE(full, at)
      }
    })
    cursor += (dll.imports.length + 1) * thunk // zero terminator

    const d = SECTION_RAW + i * 32
    buf.writeUInt32LE(vaForm ? 0 : 1, d)
    buf.writeUInt32LE(field(nameAt), d + 4)
    buf.writeUInt32LE(field(intAt), d + 16)
  })

  buf.writeUInt32LE(rvaOf(0), dirs + 13 * 8)
  buf.writeUInt32LE((dlls.length + 1) * 32, dirs + 13 * 8 + 4)
  return buf
}
