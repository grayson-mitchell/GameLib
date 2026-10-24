import {
  parsePeSectionNames,
  hasSteamStubSection,
  MAX_PE_SECTIONS
} from '../peSections'

function buildPe(
  names: string[],
  opts: { declared?: number; truncateTail?: number; lfanew?: number } = {}
): Buffer {
  const pe = 0x80
  const optSize = 0xf0
  const table = pe + 24 + optSize
  const buf = Buffer.alloc(table + names.length * 40)
  buf.writeUInt16LE(0x5a4d, 0)
  buf.writeUInt32LE(opts.lfanew ?? pe, 0x3c)
  buf.writeUInt32LE(0x4550, pe)
  buf.writeUInt16LE(opts.declared ?? names.length, pe + 6)
  buf.writeUInt16LE(optSize, pe + 20)
  names.forEach((n, i) => buf.write(n, table + i * 40, 8, 'latin1'))
  return opts.truncateTail
    ? buf.subarray(0, buf.length - opts.truncateTail)
    : buf
}

describe('parsePeSectionNames', () => {
  it('lists section names and detects .bind', () => {
    const names = parsePeSectionNames(buildPe(['.text', '.rdata', '.bind']))
    expect(names).toEqual(['.text', '.rdata', '.bind'])
    expect(hasSteamStubSection(names)).toBe(true)
  })
  it('reports no steamstub without .bind', () => {
    const names = parsePeSectionNames(buildPe(['.text', '.rdata']))
    expect(hasSteamStubSection(names)).toBe(false)
  })
  it('returns [] for a short buffer', () => {
    expect(parsePeSectionNames(Buffer.alloc(0x3f))).toEqual([])
  })
  it('returns [] for wrong MZ magic', () => {
    const b = buildPe(['.text'])
    b.writeUInt16LE(0, 0)
    expect(parsePeSectionNames(b)).toEqual([])
  })
  it('returns [] for wrong PE signature', () => {
    const b = buildPe(['.text'])
    b.writeUInt32LE(0, 0x80)
    expect(parsePeSectionNames(b)).toEqual([])
  })
  it('returns [] without throwing when e_lfanew is past the buffer', () => {
    const b = buildPe(['.text'], { lfanew: 0xfffffff0 })
    expect(() => parsePeSectionNames(b)).not.toThrow()
    expect(parsePeSectionNames(b)).toEqual([])
  })
  it('caps a lying section count to the entries present', () => {
    const names = parsePeSectionNames(
      buildPe(['.a', '.b', '.c'], { declared: 200 })
    )
    expect(names).toEqual(['.a', '.b', '.c'])
    expect(names.length).toBeLessThanOrEqual(MAX_PE_SECTIONS)
  })
  it('never returns more than MAX_PE_SECTIONS', () => {
    const many = Array.from({ length: 150 }, (_, i) => `.s${i}`)
    expect(parsePeSectionNames(buildPe(many)).length).toBe(MAX_PE_SECTIONS)
  })
  it('returns only complete entries when the table is truncated', () => {
    const names = parsePeSectionNames(
      buildPe(['.a', '.b', '.c'], { truncateTail: 10 })
    )
    expect(names).toEqual(['.a', '.b'])
  })
  it('returns an 8-char name with no NUL terminator', () => {
    expect(parsePeSectionNames(buildPe(['12345678']))).toEqual(['12345678'])
  })
  it('matches .bind exactly and case-sensitively', () => {
    expect(hasSteamStubSection(['.binder'])).toBe(false)
    expect(hasSteamStubSection(['.BIND'])).toBe(false)
  })
})
