import { createHash } from 'crypto'
import { applyNtdllPatch } from '../ntdllPatch'
import {
  findNtdllPatchRow,
  NTDLL_PATCH_ROWS,
  supportedCrossoverBuilds
} from '../ntdllPatchTable'
import type { NtdllPatchRow } from '../ntdllPatchTable'

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

const HOOK_RVA = 0x1010
const HOOK_OFF = 0x410
const STOLEN = '4883bc24f000000000'
const PE = 0x80
const OPT = PE + 24
const TBL = OPT + 0xf0
const NSECT = 11

function makePe(): Buffer {
  // 0x600 + 0x37 bytes: deliberately not 0x200-aligned
  const b = Buffer.alloc(0x637)
  b.write('MZ', 0)
  b.writeUInt32LE(PE, 0x3c)
  b.writeUInt32LE(0x4550, PE)
  b.writeUInt16LE(NSECT, PE + 6)
  b.writeUInt16LE(0xf0, PE + 20)
  b.writeUInt16LE(0x20b, OPT)
  b.writeUInt32LE(0x200, OPT + 36)
  b.writeUInt32LE(0xae000, OPT + 56)
  b.writeUInt32LE(0x400, OPT + 60)
  b.writeUInt32LE(0xa95b4, OPT + 64)
  // section 0 covers the hook RVA with raw data; the rest are bss-like
  const s0 = TBL
  b.write('.text', s0)
  b.writeUInt32LE(0x1000, s0 + 8)
  b.writeUInt32LE(0x1000, s0 + 12)
  b.writeUInt32LE(0x200, s0 + 16)
  b.writeUInt32LE(0x400, s0 + 20)
  for (let i = 1; i < NSECT; i++) {
    const en = TBL + i * 40
    b.write('.s' + i, en)
    b.writeUInt32LE(0x1000, en + 8)
    b.writeUInt32LE(0x1000 + i * 0x1000, en + 12)
  }
  Buffer.from(STOLEN, 'hex').copy(b, HOOK_OFF)
  return b
}

const PAYLOAD = Buffer.from('synthetic-detour-payload')

function makeRow(clean: Buffer, patchedSha256: string): NtdllPatchRow {
  return {
    crossoverBuild: '0.0.0',
    cleanSize: clean.length,
    cleanSha256: sha(clean),
    hookRva: HOOK_RVA,
    stolenBytes: STOLEN,
    sectionName: '.npdet',
    sectionRva: 0xae000,
    sectionVirtualSize: 0x1000,
    sectionRawSize: 0x1000,
    sectionCharacteristics: 0x60000020,
    payloadSha256: sha(PAYLOAD),
    patchedSha256
  }
}

// Pinned from a first run of the applier over makePe() and PAYLOAD.
const SYNTH_PATCHED_SHA =
  'fb011347bf0b9d75385623a540fdb598a35bfd2c7f09512652612676370a34ad'

describe('ntdllPatchTable allowlist', () => {
  const row = NTDLL_PATCH_ROWS['26.3.0.39832']
  it('returns the row for the matching build and sha', () => {
    expect(findNtdllPatchRow('26.3.0.39832', row.cleanSha256)).toBe(row)
  })
  it.each([
    ['wrong build', '26.3.0.1', row.cleanSha256],
    ['wrong sha', '26.3.0.39832', 'ab'.repeat(32)],
    ['short build', '26.3', row.cleanSha256],
    ['empty build', '', row.cleanSha256],
    ['prototype key', 'constructor', row.cleanSha256]
  ])('returns null for %s', (_n, build, s) => {
    expect(findNtdllPatchRow(build, s)).toBeNull()
  })
  it('lists exactly one supported build', () => {
    expect(supportedCrossoverBuilds()).toEqual(['26.3.0.39832'])
  })
})

describe('applyNtdllPatch', () => {
  const clean = makePe()
  const row = makeRow(clean, SYNTH_PATCHED_SHA)

  it('patches with the exact NotProton layout', () => {
    const before = sha(clean)
    const r = applyNtdllPatch(clean, PAYLOAD, row)
    expect(sha(clean)).toBe(before)
    expect(r.status).toBe('patched')
    if (r.status !== 'patched') return
    const o = r.bytes
    const raw = 0x800
    expect(o.length).toBe(raw + 0x1000)
    expect(o.readUInt16LE(PE + 6)).toBe(NSECT + 1)
    expect(o.readUInt32LE(OPT + 56)).toBe(0xae000 + 0x1000)
    expect(o.readUInt32LE(OPT + 64)).toBe(0xa95b4)
    const h = TBL + NSECT * 40
    expect(o.slice(h, h + 8).toString('hex')).toBe(
      Buffer.from('.npdet\0\0', 'latin1').toString('hex')
    )
    expect(o.readUInt32LE(h + 8)).toBe(0x1000)
    expect(o.readUInt32LE(h + 12)).toBe(0xae000)
    expect(o.readUInt32LE(h + 16)).toBe(0x1000)
    expect(o.readUInt32LE(h + 20)).toBe(raw)
    expect(o.readUInt32LE(h + 36)).toBe(0x60000020)
    expect(o.slice(raw, raw + PAYLOAD.length).equals(PAYLOAD)).toBe(true)
    expect(o.slice(raw + PAYLOAD.length).every((x) => x === 0)).toBe(true)
    expect(o[HOOK_OFF]).toBe(0xe9)
    expect(o.readInt32LE(HOOK_OFF + 1)).toBe(0xae000 - (HOOK_RVA + 5))
    expect(o.slice(HOOK_OFF + 5, HOOK_OFF + 9).toString('hex')).toBe('cccccccc')
  })

  const expectRefused = (r: ReturnType<typeof applyNtdllPatch>) => {
    expect(r.status).toBe('refused')
    if (r.status === 'refused') expect(r.reason.length).toBeGreaterThan(0)
    return r.status === 'refused' ? r.reason : ''
  }

  it('refuses every mismatch with a distinct reason', () => {
    const reasons: string[] = []
    const before = sha(clean)

    reasons.push(
      expectRefused(
        applyNtdllPatch(clean, PAYLOAD, { ...row, cleanSize: clean.length + 1 })
      )
    )
    reasons.push(
      expectRefused(
        applyNtdllPatch(clean, PAYLOAD, {
          ...row,
          cleanSha256: 'aa'.repeat(32)
        })
      )
    )
    reasons.push(
      expectRefused(applyNtdllPatch(clean, Buffer.from('other'), row))
    )
    const big = Buffer.alloc(0x1001, 1)
    reasons.push(
      expectRefused(
        applyNtdllPatch(clean, big, { ...row, payloadSha256: sha(big) })
      )
    )
    reasons.push(
      expectRefused(
        applyNtdllPatch(clean, PAYLOAD, {
          ...row,
          stolenBytes: '00' + STOLEN.slice(2)
        })
      )
    )

    const dirty = Buffer.from(clean)
    dirty[TBL + NSECT * 40 + 3] = 1
    reasons.push(
      expectRefused(
        applyNtdllPatch(dirty, PAYLOAD, {
          ...row,
          cleanSha256: sha(dirty)
        })
      )
    )

    const tight = Buffer.from(clean)
    tight.writeUInt32LE(TBL + NSECT * 40 + 39, OPT + 60)
    reasons.push(
      expectRefused(
        applyNtdllPatch(tight, PAYLOAD, { ...row, cleanSha256: sha(tight) })
      )
    )

    reasons.push(
      expectRefused(
        applyNtdllPatch(clean, PAYLOAD, {
          ...row,
          patchedSha256: 'bb'.repeat(32)
        })
      )
    )

    expect(new Set(reasons).size).toBe(reasons.length)
    expect(sha(clean)).toBe(before)
  })

  it('refuses truncated or malformed PEs without throwing', () => {
    const short = Buffer.alloc(0x20)
    expect(
      applyNtdllPatch(short, PAYLOAD, {
        ...row,
        cleanSize: 0x20,
        cleanSha256: sha(short)
      }).status
    ).toBe('refused')
    const bad = Buffer.from(clean)
    bad.writeUInt32LE(0x7fffffff, 0x3c)
    expect(
      applyNtdllPatch(bad, PAYLOAD, { ...row, cleanSha256: sha(bad) }).status
    ).toBe('refused')
  })
})
