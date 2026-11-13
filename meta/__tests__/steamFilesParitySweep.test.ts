import {
  classifyDiff,
  decideExit,
  emptyCategory,
  hashRel,
  recordOutcome,
  redact,
  type SweepReport
} from '../steamFilesParitySweep'

describe('classifyDiff', () => {
  it('reports equal values as equal', () => {
    expect(classifyDiff('x', { a: 1 }, { a: 1 })).toBe('equal')
  })

  it('explains a JS number against the same digits as a string', () => {
    const ts = new Map([[1, { sizeOnDisk: 5 }]])
    const rust = new Map([[1, { sizeOnDisk: '5' }]])
    expect(classifyDiff('buildInstalledMap', ts, rust)).toBe('numeric-coercion')
  })

  it('does not explain different digits', () => {
    expect(classifyDiff('x', { n: 5 }, { n: '6' })).toBeNull()
  })

  it('explains a decoded backslash', () => {
    expect(classifyDiff('x', { p: 'C:\\\\a' }, { p: 'C:\\a' })).toBe(
      'decoded-backslash'
    )
  })

  it('explains a registry key the oracle missed', () => {
    expect(classifyDiff('registry', 0, 5)).toBe('case-insensitive-key')
    expect(classifyDiff('registry', 3, 5)).toBeNull()
  })

  it('explains reordered installed depots only for that category', () => {
    const a = [{ depotId: '2' }, { depotId: '1' }]
    const b = [{ depotId: '1' }, { depotId: '2' }]
    expect(classifyDiff('readAcfInstalledDepots', a, b)).toBe(
      'integer-key-order'
    )
    expect(classifyDiff('readAcfBetaKey', a, b)).toBeNull()
  })

  it('returns null when any leaf is unexplained', () => {
    expect(classifyDiff('x', { a: 1, b: 'q' }, { a: '1', b: 'r' })).toBeNull()
  })
})

describe('redaction', () => {
  it('hashes a relative path to 12 hex chars', () => {
    expect(hashRel('a/b')).toMatch(/^[0-9a-f]{12}$/)
  })

  it('replaces roots, home paths and account ids', () => {
    const out = redact('{"p":"/Volumes/X/Lib/steamapps","q":"/Users/bob/z"}', [
      '/Volumes/X/Lib'
    ])
    expect(out).toContain('<ROOT>/steamapps')
    expect(out).not.toContain('bob')
    expect(redact('userdata/12345/config', [])).toBe('userdata/<ACCT>/config')
  })
})

describe('decideExit', () => {
  const ok = (): SweepReport => {
    const acf = recordOutcome(emptyCategory(), 'equal')
    const sc = recordOutcome(emptyCategory(), 'equal')
    return {
      categories: { acfInstalldir: acf, shortcutsRoundtrip: sc },
      roundtripNotIdentical: 0
    }
  }

  it('is 0 when everything is equal or explained', () => {
    expect(decideExit(ok())).toBe(0)
  })

  it('is 3 on a vacuous run', () => {
    expect(decideExit({ categories: {}, roundtripNotIdentical: 0 })).toBe(3)
  })

  it('is 3 when there are no shortcuts files', () => {
    const r = ok()
    delete r.categories.shortcutsRoundtrip
    expect(decideExit(r)).toBe(3)
  })

  it('is 1 on an unexplained diff', () => {
    const r = ok()
    r.categories.acfInstalldir = recordOutcome(
      r.categories.acfInstalldir ?? emptyCategory(),
      null
    )
    expect(decideExit(r)).toBe(1)
  })

  it('is 1 when the round trip is not identical', () => {
    const r = ok()
    r.roundtripNotIdentical = 1
    expect(decideExit(r)).toBe(1)
  })
})
