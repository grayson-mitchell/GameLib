/**
 * Phase 53-02: synthetic CLI-assembly builder for managedImports tests. Builds
 * a minimal PE32 with one `.text` section holding a CLR header and an
 * ECMA-335 metadata root with a `#~` stream (MethodDef, ModuleRef, ImplMap
 * tables only) and a `#Strings` heap. No game binaries are used or checked in.
 */

export type ManagedPeOptions = {
  machine?: number
  /** false builds a native PE (no CLR data directory) */
  clr?: boolean
  clrFlags?: number
  moduleRefs?: string[]
  /** `module` is the 1-based ModuleRef index */
  implMaps?: Array<{ name: string; module: number }>
  /** HeapSizes bit 0: 4-byte #Strings indexes */
  wideStrings?: boolean
  /** MethodDef row count (zero rows); at least implMaps.length is used */
  methodDefRows?: number
  // hostile knobs
  /** overrides the #~ stream header offset */
  streamOffsetOverride?: number
  /** overrides the ModuleRef row count written in the #~ header */
  rowCountOverride?: number
  /** overrides the first ImplMap row's ImportName string index */
  importNameIndexOverride?: number
  /** number of extra (empty) stream headers */
  extraStreams?: number
  /** overrides the #Strings stream size */
  stringsSizeOverride?: number
}

const PE_OFFSET = 0x80
const SECTION_VA = 0x1000
const SECTION_RAW = 0x200

export function buildManagedPe(opts: ManagedPeOptions = {}): Buffer {
  const clr = opts.clr ?? true
  const moduleRefs = opts.moduleRefs ?? []
  const implMaps = opts.implMaps ?? []
  const wide = opts.wideStrings ?? false
  const methodDefRows = Math.max(opts.methodDefRows ?? 0, implMaps.length)

  // #Strings heap
  const heapParts: Buffer[] = [Buffer.from([0])]
  let heapLen = 1
  const strIndex = new Map<string, number>()
  const addString = (s: string) => {
    const known = strIndex.get(s)
    if (known !== undefined) return known
    const at = heapLen
    const b = Buffer.from(s + '\0', 'latin1')
    heapParts.push(b)
    heapLen += b.length
    strIndex.set(s, at)
    return at
  }
  const mrIdx = moduleRefs.map(addString)
  const imIdx = implMaps.map((m) => addString(m.name))
  if (opts.importNameIndexOverride !== undefined && imIdx.length > 0) {
    imIdx[0] = opts.importNameIndexOverride
  }
  while (heapLen % 4 !== 0) {
    heapParts.push(Buffer.from([0]))
    heapLen++
  }
  const heap = Buffer.concat(heapParts)

  // #~ stream
  const strW = wide ? 4 : 2
  const writeIdx = (b: Buffer, at: number, v: number, w: number) =>
    w === 4 ? b.writeUInt32LE(v, at) : b.writeUInt16LE(v, at)
  const mfW = methodDefRows >= 1 << 15 ? 4 : 2
  const mrCount = opts.rowCountOverride ?? moduleRefs.length
  const present: Array<[number, number]> = []
  if (methodDefRows > 0) present.push([0x06, methodDefRows])
  if (moduleRefs.length > 0 || opts.rowCountOverride !== undefined) {
    present.push([0x1a, mrCount])
  }
  if (implMaps.length > 0) present.push([0x1c, implMaps.length])
  // MethodDef row: 8 + str + blob(2) + idx(Param)(2)
  const mdRowSize = 8 + strW + 2 + 2
  const mrRowSize = strW
  const imRowSize = 2 + mfW + strW + 2
  const tildeHeader = 24 + 4 * present.length
  const tilde = Buffer.alloc(
    tildeHeader +
      methodDefRows * mdRowSize +
      moduleRefs.length * mrRowSize +
      implMaps.length * imRowSize
  )
  tilde.writeUInt8(wide ? 1 : 0, 6) // HeapSizes
  let validLo = 0
  for (const [t] of present) validLo |= 1 << t
  tilde.writeUInt32LE(validLo >>> 0, 8)
  present.forEach(([, n], i) => tilde.writeUInt32LE(n, 24 + 4 * i))
  let at = tildeHeader + methodDefRows * mdRowSize
  moduleRefs.forEach((_, i) => {
    writeIdx(tilde, at, mrIdx[i], strW)
    at += mrRowSize
  })
  implMaps.forEach((m, i) => {
    tilde.writeUInt16LE(0x0100, at) // MappingFlags
    writeIdx(tilde, at + 2, ((i + 1) << 1) | 1, mfW) // MethodDef row i+1
    writeIdx(tilde, at + 2 + mfW, imIdx[i], strW)
    tilde.writeUInt16LE(m.module, at + 2 + mfW + strW)
    at += imRowSize
  })

  // metadata root
  const version = Buffer.from('v4.0.30319\0\0', 'latin1') // 12 bytes
  const extra = opts.extraStreams ?? 0
  const names = ['#~', '#Strings']
  for (let i = 0; i < extra; i++) names.push(`#X${i}`)
  const nameBufs = names.map((n) => {
    const b = Buffer.alloc((n.length + 1 + 3) & ~3)
    b.write(n, 0, 'latin1')
    return b
  })
  const rootFixed = 16 + version.length + 4
  const headersLen = nameBufs.reduce((a, b) => a + 8 + b.length, 0)
  const dataStart = rootFixed + headersLen
  const tildeOffset = opts.streamOffsetOverride ?? dataStart
  const stringsOffset = dataStart + tilde.length
  const root = Buffer.alloc(dataStart)
  root.writeUInt32LE(0x424a5342, 0)
  root.writeUInt16LE(1, 4)
  root.writeUInt16LE(1, 6)
  root.writeUInt32LE(version.length, 12)
  version.copy(root, 16)
  root.writeUInt16LE(names.length, 16 + version.length + 2)
  let hc = rootFixed
  names.forEach((_, i) => {
    let off = dataStart + tilde.length + heap.length
    let size = 0
    if (i === 0) {
      off = tildeOffset
      size = tilde.length
    } else if (i === 1) {
      off = stringsOffset
      size = opts.stringsSizeOverride ?? heap.length
    }
    root.writeUInt32LE(off, hc)
    root.writeUInt32LE(size, hc + 4)
    nameBufs[i].copy(root, hc + 8)
    hc += 8 + nameBufs[i].length
  })
  const metadata = Buffer.concat([root, tilde, heap])

  // PE
  const clrHeaderSize = 72
  const section = Buffer.alloc(
    clr ? clrHeaderSize + metadata.length : clrHeaderSize
  )
  if (clr) {
    section.writeUInt32LE(clrHeaderSize, 0)
    section.writeUInt32LE(SECTION_VA + clrHeaderSize, 8) // MetaData RVA
    section.writeUInt32LE(metadata.length, 12)
    section.writeUInt32LE(opts.clrFlags ?? 0x1, 16)
    metadata.copy(section, clrHeaderSize)
  }
  const buf = Buffer.alloc(SECTION_RAW + section.length)
  buf.write('MZ', 0, 'latin1')
  buf.writeUInt32LE(PE_OFFSET, 0x3c)
  buf.writeUInt32LE(0x00004550, PE_OFFSET)
  buf.writeUInt16LE(opts.machine ?? 0x14c, PE_OFFSET + 4)
  buf.writeUInt16LE(1, PE_OFFSET + 6)
  buf.writeUInt16LE(224, PE_OFFSET + 20)
  const opt = PE_OFFSET + 24
  buf.writeUInt16LE(0x10b, opt)
  buf.writeUInt32LE(16, opt + 92)
  if (clr) {
    buf.writeUInt32LE(SECTION_VA, opt + 96 + 14 * 8)
    buf.writeUInt32LE(clrHeaderSize, opt + 96 + 14 * 8 + 4)
  }
  const sec = opt + 224
  buf.write('.text', sec, 'latin1')
  buf.writeUInt32LE(section.length, sec + 8)
  buf.writeUInt32LE(SECTION_VA, sec + 12)
  buf.writeUInt32LE(section.length, sec + 16)
  buf.writeUInt32LE(SECTION_RAW, sec + 20)
  section.copy(buf, SECTION_RAW)
  return buf
}

/** A ranged reader over a buffer: null when the range runs past EOF. */
export function bufferReader(buf: Buffer) {
  return (offset: number, length: number): Uint8Array | null =>
    offset < 0 || offset + length > buf.length
      ? null
      : buf.subarray(offset, offset + length)
}
