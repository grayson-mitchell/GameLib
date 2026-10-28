/**
 * Phase 56 plan 06 (D-03): pure, table-driven x64 ntdll detour applier
 * (NotProton layout). Bytes in, bytes out: never writes, never spawns, never
 * throws. Anything not recognised exactly is refused.
 */
import { createHash } from 'crypto'
import type { NtdllPatchRow } from './ntdllPatchTable'

// ts-prune-ignore-next
export type NtdllPatchResult =
  | { status: 'patched'; bytes: Buffer }
  | { status: 'refused'; reason: string }

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

const refuse = (reason: string): NtdllPatchResult => ({
  status: 'refused',
  reason
})

// ts-prune-ignore-next
export function applyNtdllPatch(
  cleanBytes: Buffer,
  payload: Buffer,
  row: NtdllPatchRow
): NtdllPatchResult {
  try {
    if (cleanBytes.length !== row.cleanSize) {
      return refuse(
        `clean size ${cleanBytes.length} differs from pinned ${row.cleanSize}`
      )
    }
    if (sha256(cleanBytes) !== row.cleanSha256) {
      return refuse('clean sha256 differs from pinned value')
    }
    if (sha256(payload) !== row.payloadSha256) {
      return refuse('payload sha256 differs from pinned value')
    }
    if (payload.length > row.sectionRawSize) {
      return refuse('payload is longer than the section raw size')
    }

    const b = Buffer.from(cleanBytes)
    const len = b.length
    if (len < 0x40) return refuse('PE too short for a DOS header')
    const pe = b.readUInt32LE(0x3c)
    if (pe + 24 > len) return refuse('e_lfanew points past the end of the file')
    if (b.readUInt32LE(pe) !== 0x4550) return refuse('missing PE signature')
    const numSections = b.readUInt16LE(pe + 6)
    const sizeOfOptional = b.readUInt16LE(pe + 20)
    const opt = pe + 24
    const tbl = opt + sizeOfOptional
    if (opt + 64 > len || tbl + numSections * 40 > len) {
      return refuse('PE headers extend past the end of the file')
    }
    const fileAlign = b.readUInt32LE(opt + 36)
    const sizeOfImage = b.readUInt32LE(opt + 56)
    const sizeOfHeaders = b.readUInt32LE(opt + 60)
    if (fileAlign === 0) return refuse('FileAlignment is zero')

    const slot = tbl + numSections * 40
    if (slot + 40 > sizeOfHeaders || slot + 40 > len) {
      return refuse('no room for a new section header below SizeOfHeaders')
    }
    for (let i = 0; i < 40; i++) {
      if (b[slot + i] !== 0) return refuse('section header slot is not zero')
    }

    // locate the hook site through the original section table
    let hookOff = -1
    for (let i = 0; i < numSections; i++) {
      const en = tbl + i * 40
      const vs = b.readUInt32LE(en + 8)
      const va = b.readUInt32LE(en + 12)
      const rs = b.readUInt32LE(en + 16)
      const ro = b.readUInt32LE(en + 20)
      if (!rs || !ro) continue
      if (row.hookRva >= va && row.hookRva < va + Math.max(vs, rs)) {
        hookOff = ro + row.hookRva - va
        break
      }
    }
    if (hookOff < 0 || hookOff + 9 > len) {
      return refuse('hook RVA does not map into the file')
    }
    if (b.slice(hookOff, hookOff + 9).toString('hex') !== row.stolenBytes) {
      return refuse('bytes at the hook site differ from the stolen bytes')
    }

    const raw = Math.ceil(len / fileAlign) * fileAlign
    const hdr = Buffer.alloc(40)
    hdr.write(row.sectionName, 0, 8, 'latin1')
    hdr.writeUInt32LE(row.sectionVirtualSize, 8)
    hdr.writeUInt32LE(row.sectionRva, 12)
    hdr.writeUInt32LE(row.sectionRawSize, 16)
    hdr.writeUInt32LE(raw, 20)
    hdr.writeUInt32LE(row.sectionCharacteristics, 36)
    hdr.copy(b, slot)
    b.writeUInt16LE(numSections + 1, pe + 6)
    b.writeUInt32LE(sizeOfImage + row.sectionVirtualSize, opt + 56)

    const out = Buffer.concat([b, Buffer.alloc(raw + row.sectionRawSize - len)])
    payload.copy(out, raw)
    const jump = Buffer.alloc(9, 0xcc)
    jump[0] = 0xe9
    jump.writeInt32LE(row.sectionRva - (row.hookRva + 5), 1)
    jump.copy(out, hookOff)

    if (sha256(out) !== row.patchedSha256) {
      return refuse('patched sha256 differs from pinned value')
    }
    return { status: 'patched', bytes: out }
  } catch (e) {
    return refuse(`internal: ${e instanceof Error ? e.message : String(e)}`)
  }
}
