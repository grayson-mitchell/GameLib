/**
 * Quick 261028-k7l: synthetic PE builder for the regular Import Directory
 * (data directory 1). Builds a minimal valid PE32 / PE32+ in memory: one
 * section holding the import descriptor table and the DLL names. Synthetic;
 * no game binaries are used or checked in.
 */

type ImportPeOptions = {
  plus: boolean
  /** DLL names, written as import descriptors in this order */
  dlls: string[]
  /** latin1 bytes appended after the PE content (buffer grows to fit) */
  trailingAscii?: string
}

const PE_OFFSET = 0x80
const SECTION_VA = 0x1000
const SECTION_RAW = 0x400
const SECTION_SIZE = 0x8000

export function buildImportPe(opts: ImportPeOptions): Buffer {
  const { plus, dlls } = opts
  const base = Buffer.alloc(SECTION_RAW + SECTION_SIZE)
  base.write('MZ', 0, 'latin1')
  base.writeUInt32LE(PE_OFFSET, 0x3c)
  base.writeUInt32LE(0x00004550, PE_OFFSET)
  base.writeUInt16LE(plus ? 0x8664 : 0x14c, PE_OFFSET + 4)
  base.writeUInt16LE(1, PE_OFFSET + 6) // one section
  const optSize = plus ? 240 : 224
  base.writeUInt16LE(optSize, PE_OFFSET + 20)
  const opt = PE_OFFSET + 24
  base.writeUInt16LE(plus ? 0x20b : 0x10b, opt)
  base.writeUInt32LE(16, opt + (plus ? 108 : 92)) // NumberOfRvaAndSizes
  const dirs = opt + (plus ? 112 : 96)

  const sec = opt + optSize
  base.write('.idata', sec, 'latin1')
  base.writeUInt32LE(SECTION_SIZE, sec + 8)
  base.writeUInt32LE(SECTION_VA, sec + 12)
  base.writeUInt32LE(SECTION_SIZE, sec + 16)
  base.writeUInt32LE(SECTION_RAW, sec + 20)

  // descriptors (+ zero terminator) first, names after
  let cursor = (dlls.length + 1) * 20
  dlls.forEach((name, i) => {
    base.write(name + '\0', SECTION_RAW + cursor, 'latin1')
    const d = SECTION_RAW + i * 20
    base.writeUInt32LE(SECTION_VA + cursor, d + 12) // Name RVA
    base.writeUInt32LE(SECTION_VA + 0x7000, d + 16) // FirstThunk (non-zero)
    cursor += name.length + 1
  })

  base.writeUInt32LE(SECTION_VA, dirs + 1 * 8)
  base.writeUInt32LE((dlls.length + 1) * 20, dirs + 1 * 8 + 4)

  if (opts.trailingAscii === undefined) return base
  return Buffer.concat([base, Buffer.from(opts.trailingAscii, 'latin1')])
}
