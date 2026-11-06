/**
 * Phase 63-03: synthetic PE builder for the regular Import Directory (data
 * directory 1) WITH symbol thunks, so Apple `/usr/bin/objdump
 * --private-headers` prints real `Hint/Ord  Name` rows. One `.idata` section
 * holds descriptors, ILT, hint/name entries, DLL names and the IAT.
 * Synthetic; no game binaries are used or checked in.
 */

type ImportSymbol = string | { ordinal: number }

type ImportSymbolsPeOptions = {
  plus: boolean
  imports: { dll: string; symbols: ImportSymbol[] }[]
  /** cut the file to this many bytes */
  truncateAt?: number
}

const PE_OFFSET = 0x80
const SECTION_VA = 0x1000
const SECTION_RAW = 0x400
const SECTION_SIZE = 0x2000

export function buildImportSymbolsPe(opts: ImportSymbolsPeOptions): Buffer {
  const { plus, imports } = opts
  const thunk = plus ? 8 : 4
  const buf = Buffer.alloc(SECTION_RAW + SECTION_SIZE)
  buf.write('MZ', 0, 'latin1')
  buf.writeUInt32LE(PE_OFFSET, 0x3c)
  buf.writeUInt32LE(0x00004550, PE_OFFSET)
  buf.writeUInt16LE(plus ? 0x8664 : 0x14c, PE_OFFSET + 4)
  buf.writeUInt16LE(1, PE_OFFSET + 6)
  const optSize = plus ? 240 : 224
  buf.writeUInt16LE(optSize, PE_OFFSET + 20)
  const opt = PE_OFFSET + 24
  buf.writeUInt16LE(plus ? 0x20b : 0x10b, opt)
  if (plus) buf.writeBigUInt64LE(BigInt('0x140000000'), opt + 24)
  else buf.writeUInt32LE(0x400000, opt + 28)
  buf.writeUInt32LE(SECTION_VA, opt + 32) // SectionAlignment
  buf.writeUInt32LE(0x200, opt + 36) // FileAlignment
  buf.writeUInt32LE(SECTION_VA + SECTION_SIZE, opt + 56) // SizeOfImage
  buf.writeUInt32LE(SECTION_RAW, opt + 60) // SizeOfHeaders
  buf.writeUInt32LE(16, opt + (plus ? 108 : 92))
  const dirs = opt + (plus ? 112 : 96)

  const sec = opt + optSize
  buf.write('.idata', sec, 'latin1')
  buf.writeUInt32LE(SECTION_SIZE, sec + 8)
  buf.writeUInt32LE(SECTION_VA, sec + 12)
  buf.writeUInt32LE(SECTION_SIZE, sec + 16)
  buf.writeUInt32LE(SECTION_RAW, sec + 20)
  buf.writeUInt32LE(0xc0000040, sec + 36)

  const rvaOf = (at: number) => SECTION_VA + at
  const align2 = (n: number) => (n + 1) & ~1
  const align8 = (n: number) => (n + 7) & ~7
  let cursor = (imports.length + 1) * 20

  imports.forEach((imp, i) => {
    buf.write(imp.dll + '\0', SECTION_RAW + cursor, 'latin1')
    const nameAt = cursor
    cursor = align2(cursor + imp.dll.length + 1)

    const hints = imp.symbols.map((s) => {
      if (typeof s !== 'string') return null
      const at = cursor
      buf.writeUInt16LE(0, SECTION_RAW + at)
      buf.write(s + '\0', SECTION_RAW + at + 2, 'latin1')
      cursor = align2(cursor + 2 + s.length + 1)
      return at
    })

    const writeThunks = (at: number) => {
      imp.symbols.forEach((s, k) => {
        const p = SECTION_RAW + at + k * thunk
        if (typeof s !== 'string') {
          if (plus) {
            buf.writeUInt32LE(s.ordinal, p)
            buf.writeUInt32LE(0x80000000, p + 4)
          } else {
            buf.writeUInt32LE((0x80000000 | s.ordinal) >>> 0, p)
          }
        } else if (plus) {
          buf.writeBigUInt64LE(BigInt(rvaOf(hints[k] as number)), p)
        } else {
          buf.writeUInt32LE(rvaOf(hints[k] as number), p)
        }
      })
    }

    cursor = align8(cursor)
    const iltAt = cursor
    writeThunks(iltAt)
    cursor += (imp.symbols.length + 1) * thunk
    const iatAt = cursor
    writeThunks(iatAt)
    cursor += (imp.symbols.length + 1) * thunk

    const d = SECTION_RAW + i * 20
    buf.writeUInt32LE(rvaOf(iltAt), d) // OriginalFirstThunk
    buf.writeUInt32LE(rvaOf(nameAt), d + 12)
    buf.writeUInt32LE(rvaOf(iatAt), d + 16) // FirstThunk
  })

  buf.writeUInt32LE(SECTION_VA, dirs + 8)
  buf.writeUInt32LE((imports.length + 1) * 20, dirs + 8 + 4)
  return opts.truncateAt === undefined ? buf : buf.subarray(0, opts.truncateAt)
}
