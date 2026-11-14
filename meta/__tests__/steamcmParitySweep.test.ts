import {
  CATEGORIES,
  checkPreconditions,
  classifyDiff,
  compareAndRecord,
  compareValues,
  decideExit,
  formatReport,
  newReport,
  redact,
  sha1Prefix
} from '../steamcmParitySweep'

describe('steamcmParitySweep classifyDiff', () => {
  it('classes ordering and numeric coercion', () => {
    expect(classifyDiff('licences', [3, 1, 2], [1, 2, 3])).toBe('ordering')
    expect(classifyDiff('owned-field', { p: 5 }, { p: '5' })).toBe(
      'numeric-coercion'
    )
  })

  it('classes the rust-only depotOrder field on pics only', () => {
    const ts = { common: { name: 'x' } }
    const rust = { common: { name: 'x' }, depotOrder: ['1'] }
    expect(classifyDiff('pics', ts, rust)).toBe('extra-rust-field')
    expect(classifyDiff('owned-field', ts, rust)).toBeNull()
  })

  it('classes request-code, content-server and persona differences by category', () => {
    expect(classifyDiff('request-code', 'a', 'b')).toBe(
      'request-code-differs-by-design'
    )
    expect(classifyDiff('request-code', 'a', '')).toBeNull()
    expect(classifyDiff('content-servers', 20, 19)).toBe(
      'content-server-set-rotation'
    )
    expect(classifyDiff('content-servers', 20, 0)).toBeNull()
    expect(classifyDiff('persona', true, false)).toBe('persona-unsupported')
    expect(classifyDiff('persona', false, true)).toBeNull()
  })

  it('classes an owned-set difference only when the extras have no playtime', () => {
    const a = { appid: 1, playtime_forever: 10 }
    const free = { appid: 2, playtime_forever: 0 }
    const played = { appid: 3, playtime_forever: 7 }
    expect(classifyDiff('owned-set', [a, free], [a])).toBe('f2p-or-unvetted')
    expect(classifyDiff('owned-set', [a, played], [a])).toBeNull()
  })

  it('returns null for an unexplained difference and equal for equal', () => {
    expect(classifyDiff('depot-key', 'aa', 'bb')).toBeNull()
    expect(compareValues('depot-key', 'aa', 'aa')).toEqual({ kind: 'equal' })
    expect(compareValues('depot-key', 'aa', 'bb')).toEqual({
      kind: 'unexplained'
    })
  })
})

describe('steamcmParitySweep redaction', () => {
  it('strips steamids, jwts, long tokens and home paths', () => {
    const line = redact(
      'id 76561198000000000 jwt eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl path /Users/someone/x tok ' +
        'A'.repeat(48)
    )
    expect(line).not.toMatch(/7656119\d{10}/)
    expect(line).not.toContain('eyJhbGciOi')
    expect(line).not.toContain('someone')
    expect(line).not.toContain('A'.repeat(40))
  })

  it('sha1Prefix is a hex prefix', () => {
    expect(sha1Prefix('abc')).toBe('a9993e36')
    expect(sha1Prefix(Buffer.from('abc'), 40)).toHaveLength(40)
  })
})

describe('steamcmParitySweep exit decision', () => {
  function filled() {
    const r = newReport()
    compareAndRecord(r, 'licences', [1], [1])
    compareAndRecord(r, 'owned-set', [{ appid: 1 }], [{ appid: 1 }])
    return r
  }

  it('is 0 when all equal or explained', () => {
    const r = filled()
    compareAndRecord(r, 'owned-field', { p: 1 }, { p: '1' })
    expect(decideExit(r)).toBe(0)
  })

  it('is 1 when anything is unexplained', () => {
    const r = filled()
    compareAndRecord(r, 'depot-key', 'a', 'b')
    expect(decideExit(r)).toBe(1)
  })

  it('is 3 when vacuous or a precondition failed', () => {
    expect(decideExit(newReport())).toBe(3)
    expect(decideExit(filled(), { preconditionFailed: true })).toBe(3)
  })

  it('formats counts only, one line per category', () => {
    expect(formatReport(filled())).toHaveLength(CATEGORIES.length)
  })
})

describe('steamcmParitySweep preconditions', () => {
  const ok = {
    sidecarRunning: false,
    hasToken: true,
    wrapVerdict: 'PASS' as const,
    macSteamRunning: true
  }
  it('passes when GameLib is down and the token exists', () => {
    expect(checkPreconditions(ok)).toBeNull()
  })
  it('fails on a running app, a missing token, or Mac Steam without a PASS wrap', () => {
    expect(checkPreconditions({ ...ok, sidecarRunning: true })).toMatch(
      /GameLib is running/
    )
    expect(checkPreconditions({ ...ok, hasToken: false })).toMatch(/vault/)
    expect(
      checkPreconditions({ ...ok, wrapVerdict: 'FAIL', macSteamRunning: true })
    ).toMatch(/Mac Steam/)
    expect(
      checkPreconditions({ ...ok, wrapVerdict: 'FAIL', macSteamRunning: false })
    ).toBeNull()
  })
})
