/** Synthetic Mach-O builders (thin and fat). No real binaries. */

export type Sym = { name: string; type: number }
export const EXT_DEF = 0x0f // N_EXT | N_SECT
export const EXT_UNDF = 0x01 // N_EXT | N_UNDF
export const LOCAL_DEF = 0x0e
export const STAB = 0x24 // stab bits set

export function buildThin(
  syms: Sym[],
  opts: { dysymtab?: boolean; breakStroff?: boolean } = {}
): Buffer {
  const dysymtab = opts.dysymtab ?? true
  // order: undefined first, then defined externals, locals first overall like ld
  const ordered = [
    ...syms.filter((s) => s.type === LOCAL_DEF || s.type === STAB),
    ...syms.filter((s) => s.type === EXT_DEF),
    ...syms.filter((s) => s.type === EXT_UNDF)
  ]
  const nlocal = syms.filter(
    (s) => s.type === LOCAL_DEF || s.type === STAB
  ).length
  const nextdef = syms.filter((s) => s.type === EXT_DEF).length
  const nundef = syms.filter((s) => s.type === EXT_UNDF).length

  const strParts: Buffer[] = [Buffer.from([0])]
  const offsets: number[] = []
  let strsize = 1
  for (const s of ordered) {
    offsets.push(strsize)
    const b = Buffer.from(s.name + '\0')
    strParts.push(b)
    strsize += b.length
  }
  const strtab = Buffer.concat(strParts)

  const ncmds = dysymtab ? 2 : 1
  const cmdsBytes = 24 + (dysymtab ? 80 : 0)
  const symoff = 32 + cmdsBytes
  const stroff = symoff + ordered.length * 16

  const header = Buffer.alloc(32)
  header.writeUInt32LE(0xfeedfacf, 0)
  header.writeUInt32LE(0x01000007, 4)
  header.writeUInt32LE(ncmds, 16)
  header.writeUInt32LE(cmdsBytes, 20)

  const symtab = Buffer.alloc(24)
  symtab.writeUInt32LE(0x2, 0)
  symtab.writeUInt32LE(24, 4)
  symtab.writeUInt32LE(opts.breakStroff ? 0x7fffffff : symoff, 8)
  symtab.writeUInt32LE(ordered.length, 12)
  symtab.writeUInt32LE(stroff, 16)
  symtab.writeUInt32LE(strsize, 20)

  const parts = [header, symtab]
  if (dysymtab) {
    const dy = Buffer.alloc(80)
    dy.writeUInt32LE(0xb, 0)
    dy.writeUInt32LE(80, 4)
    dy.writeUInt32LE(0, 8)
    dy.writeUInt32LE(nlocal, 12)
    dy.writeUInt32LE(nlocal, 16)
    dy.writeUInt32LE(nextdef, 20)
    dy.writeUInt32LE(nlocal + nextdef, 24)
    dy.writeUInt32LE(nundef, 28)
    parts.push(dy)
  }
  const nl = Buffer.alloc(ordered.length * 16)
  ordered.forEach((s, i) => {
    nl.writeUInt32LE(offsets[i], i * 16)
    nl.writeUInt8(s.type, i * 16 + 4)
  })
  parts.push(nl, strtab)
  return Buffer.concat(parts)
}

export function buildFat(slices: { cputype: number; data: Buffer }[]): Buffer {
  const head = Buffer.alloc(8 + slices.length * 20)
  head.writeUInt32BE(0xcafebabe, 0)
  head.writeUInt32BE(slices.length, 4)
  let off = Math.ceil(head.length / 16) * 16
  const firstOff = off
  slices.forEach((s, i) => {
    const p = 8 + i * 20
    head.writeUInt32BE(s.cputype, p)
    head.writeUInt32BE(off, p + 8)
    head.writeUInt32BE(s.data.length, p + 12)
    off += s.data.length
  })
  return Buffer.concat([
    head,
    Buffer.alloc(firstOff - head.length),
    ...slices.map((s) => s.data)
  ])
}
