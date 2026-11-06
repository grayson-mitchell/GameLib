/**
 * Synthetic PE builder for the CEG / `.bind` scanner and the 63-03 goldens.
 * Synthetic; no game binaries are used or checked in.
 */

export type PeFixture = {
  magic?: number
  extraSections?: string[]
  resources?: {
    rcdataNames?: string[]
    rcdataIds?: number[]
    iconDir?: boolean
    /** RCDATA subdirectory offset points back at the root */
    selfReference?: boolean
  } | null
  resourceSizeZero?: boolean
  resourceRvaOutside?: boolean
  /**
   * 53-15 (Overlooting 3410180): a section listed BEFORE .rsrc whose
   * SizeOfRawData (an embedded Godot pack) spans past .rsrc's RVA while its
   * VirtualSize is 8.
   */
  pckOverlay?: boolean
}

export const PE_OFFSET = 0x80
export const RSRC_VA = 0x2000
export const RSRC_RAW = 0x400

function buildResourceSection(
  res: NonNullable<PeFixture['resources']>
): Uint8Array {
  const buf = new Uint8Array(0x1000)
  const dv = new DataView(buf.buffer)
  let cursor = 0
  const alloc = (n: number) => {
    const at = cursor
    cursor += n
    return at
  }
  const writeDir = (named: number, ids: number) => {
    const at = alloc(16 + (named + ids) * 8)
    dv.setUint16(at + 12, named, true)
    dv.setUint16(at + 14, ids, true)
    return at
  }
  const leaf = () => alloc(16)

  const topIds = (res.iconDir ? 1 : 0) + 1
  const root = writeDir(0, topIds)
  let slot = 0
  const setEntry = (dir: number, i: number, name: number, data: number) => {
    dv.setUint32(dir + 16 + i * 8, name >>> 0, true)
    dv.setUint32(dir + 16 + i * 8 + 4, data >>> 0, true)
  }

  if (res.iconDir) {
    const icon = writeDir(0, 1)
    setEntry(icon, 0, 1, leaf())
    setEntry(root, slot++, 3, (0x80000000 | icon) >>> 0)
  }

  const names = res.rcdataNames ?? []
  const ids = res.rcdataIds ?? []
  const rc = writeDir(names.length, ids.length)
  names.forEach((n, i) => {
    const str = alloc(2 + n.length * 2)
    dv.setUint16(str, n.length, true)
    for (let k = 0; k < n.length; k++) {
      dv.setUint16(str + 2 + k * 2, n.charCodeAt(k), true)
    }
    setEntry(rc, i, (0x80000000 | str) >>> 0, leaf())
  })
  ids.forEach((id, i) => setEntry(rc, names.length + i, id, leaf()))
  const rcTarget = res.selfReference ? root : rc
  setEntry(root, slot++, 10, (0x80000000 | rcTarget) >>> 0)

  return buf.subarray(0, Math.max(cursor, 16))
}

export function buildPe(f: PeFixture = {}): Uint8Array {
  const magic = f.magic ?? 0x10b
  const optSize = magic === 0x20b ? 240 : 224
  const rsrc = f.resources ? buildResourceSection(f.resources) : null
  const sections: {
    name: string
    va: number
    raw: Uint8Array
    vsize?: number
    rawSize?: number
  }[] = [{ name: '.text', va: 0x1000, raw: new Uint8Array(0x10) }]
  if (f.pckOverlay) {
    sections.push({
      name: 'pck',
      va: 0x1800,
      raw: new Uint8Array(0x10),
      vsize: 8,
      rawSize: 0x3000
    })
  }
  if (rsrc) sections.push({ name: '.rsrc', va: RSRC_VA, raw: rsrc })
  for (const [i, name] of (f.extraSections ?? []).entries()) {
    sections.push({ name, va: 0x8000 + i * 0x1000, raw: new Uint8Array(0x10) })
  }

  const total = RSRC_RAW + sections.reduce((n, s) => n + s.raw.length + 0x10, 0)
  const buf = new Uint8Array(total)
  const dv = new DataView(buf.buffer)
  buf[0] = 0x4d
  buf[1] = 0x5a
  dv.setUint32(0x3c, PE_OFFSET, true)
  dv.setUint32(PE_OFFSET, 0x00004550, true)
  dv.setUint16(PE_OFFSET + 4, magic === 0x20b ? 0x8664 : 0x14c, true)
  dv.setUint16(PE_OFFSET + 6, sections.length, true)
  dv.setUint16(PE_OFFSET + 20, optSize, true)
  const opt = PE_OFFSET + 24
  dv.setUint16(opt, magic, true)
  const countOff = magic === 0x20b ? opt + 108 : opt + 92
  const dirs = magic === 0x20b ? opt + 112 : opt + 96
  dv.setUint32(countOff, 16, true)
  if (rsrc) {
    dv.setUint32(dirs + 16, f.resourceRvaOutside ? 0x00f00000 : RSRC_VA, true)
    dv.setUint32(dirs + 20, f.resourceSizeZero ? 0 : rsrc.length, true)
  }

  let raw = RSRC_RAW
  sections.forEach((s, i) => {
    const base = opt + optSize + i * 40
    for (let k = 0; k < s.name.length; k++) buf[base + k] = s.name.charCodeAt(k)
    dv.setUint32(base + 8, s.vsize ?? s.raw.length, true)
    dv.setUint32(base + 12, s.va, true)
    dv.setUint32(base + 16, s.rawSize ?? s.raw.length, true)
    dv.setUint32(base + 20, raw, true)
    buf.set(s.raw, raw)
    raw += s.raw.length + 0x10
  })
  return buf
}
