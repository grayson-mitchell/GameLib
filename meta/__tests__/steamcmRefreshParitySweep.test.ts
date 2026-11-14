import {
  FIELDS,
  checkPreconditions,
  classifyRefreshDiff,
  compareField,
  decideExit,
  describeDiff,
  diffLibraries,
  formatReport,
  newReport,
  populated,
  redact,
  sampleIds,
  storeBlocked,
  type GameLike
} from '../steamcmRefreshParitySweep'

const game = (id: string, over: Partial<GameLike> = {}): GameLike => ({
  app_name: id,
  title: `Title ${id}`,
  art_cover: '',
  art_square: '',
  extra: { steamPlaytimeMinutes: 5, steamLastPlayed: 100 },
  ...over
})

describe('classifyRefreshDiff', () => {
  it('classes numeric coercion and unset-vs-empty', () => {
    expect(classifyRefreshDiff('playtime', 5, '5')).toBe('numeric-coercion')
    expect(classifyRefreshDiff('last-played', undefined, 0)).toBe(
      'unset-vs-empty'
    )
    expect(classifyRefreshDiff('art', { art_cover: '' }, {})).toBe(
      'unset-vs-empty'
    )
  })

  it('classes enriched-in-refresh only for art, post-refresh, ts empty and rust populated', () => {
    const ts = { art_cover: '' }
    const rust = { art_cover: 'x' }
    expect(classifyRefreshDiff('art', ts, rust, 'post-refresh')).toBe(
      'enriched-in-refresh'
    )
    expect(classifyRefreshDiff('art', ts, rust, 'at-rest')).toBeNull()
    expect(classifyRefreshDiff('name', '', 'x', 'post-refresh')).toBeNull()
    expect(
      classifyRefreshDiff(
        'art',
        { art_cover: 'a' },
        { art_cover: 'b' },
        'post-refresh'
      )
    ).toBeNull()
  })

  it('classes an id-set difference only when the extras carry no playtime', () => {
    const a = { ids: ['1'], onlyPlaytimeFree: true }
    const b = { ids: ['1', '2'], onlyPlaytimeFree: true }
    expect(classifyRefreshDiff('ids', a, b)).toBe('f2p-or-unvetted')
    expect(
      classifyRefreshDiff('ids', { ...a, onlyPlaytimeFree: false }, b)
    ).toBeNull()
  })

  it('returns equal for equal and unexplained for a real difference', () => {
    expect(compareField('name', 'a', 'a', 'at-rest')).toEqual({ kind: 'equal' })
    expect(compareField('name', 'a', 'b', 'at-rest')).toEqual({
      kind: 'unexplained'
    })
  })
})

describe('diffLibraries and the report', () => {
  it('counts per field and stage, and records value-free shapes', () => {
    const report = newReport()
    const ts = [game('1'), game('2', { art_cover: 'a' })]
    const rust = [game('1'), game('2', { art_cover: 'b' })]
    diffLibraries(report, 'at-rest', ts, rust, {
      ts: new Set(),
      rust: new Set()
    })
    expect(report['at-rest'].name.equal).toBe(2)
    expect(report['at-rest'].art.unexplained).toBe(1)
    const lines = formatReport(report).join('\n')
    expect(lines).toContain(
      'shape at-rest art UNEXPLAINED art_cover:differs: 1'
    )
    expect(lines).not.toMatch(/Title|"a"|"b"/)
  })

  it('post-refresh art that only rust populated is explained', () => {
    const report = newReport()
    diffLibraries(
      report,
      'post-refresh',
      [game('1')],
      [game('1', { art_cover: 'x' })],
      { ts: new Set(), rust: new Set() }
    )
    expect(report['post-refresh'].art.explained).toEqual({
      'enriched-in-refresh': 1
    })
  })

  it('describes which side is empty without values', () => {
    expect(describeDiff({ a: '', b: 'x' }, { a: 'y', b: 'x' })).toBe(
      'a:ts-empty'
    )
    expect(describeDiff('x', '')).toBe('rust-empty')
  })
})

describe('exit decision', () => {
  it('is 0 clean, 1 unexplained, 3 vacuous or precondition', () => {
    const clean = newReport()
    expect(decideExit(clean, { tsOwned: 2, rustOwned: 2 })).toBe(0)
    const bad = newReport()
    bad['at-rest'].name.unexplained = 1
    expect(decideExit(bad, { tsOwned: 2, rustOwned: 2 })).toBe(1)
    expect(decideExit(clean, { tsOwned: 0, rustOwned: 2 })).toBe(3)
    expect(
      decideExit(clean, { tsOwned: 2, rustOwned: 2, preconditionFailed: true })
    ).toBe(3)
    expect(FIELDS).toContain('metacritic')
  })
})

describe('helpers', () => {
  it('samples deterministically and returns all when no limit', () => {
    const ids = ['5', '3', '1', '4', '2']
    expect(sampleIds(ids, null)).toEqual(['1', '2', '3', '4', '5'])
    expect(sampleIds(ids, 2)).toHaveLength(2)
    expect(sampleIds(ids, 2)).toEqual(sampleIds([...ids].reverse(), 2))
    expect(sampleIds(ids, 99)).toHaveLength(5)
  })

  it('counts populated art and metacritic', () => {
    const p = populated([
      game('1'),
      game('2', { art_cover: 'a', extra: { metacritic_score: 80 } })
    ])
    expect(p).toEqual({ art: 1, metacritic: 1 })
  })

  it('names a blocked store and accepts a 200', () => {
    expect(storeBlocked(200)).toBeNull()
    expect(storeBlocked(403)).toContain('403')
    expect(storeBlocked(null)).toContain('nothing')
  })

  it('applies the 79-24 precondition rules', () => {
    const ok = {
      sidecarRunning: false,
      hasToken: true,
      wrapVerdict: 'PASS' as const,
      macSteamRunning: true
    }
    expect(checkPreconditions(ok)).toBeNull()
    expect(checkPreconditions({ ...ok, sidecarRunning: true })).toContain(
      'GameLib is running'
    )
    expect(checkPreconditions({ ...ok, hasToken: false })).toContain('vault')
    expect(checkPreconditions({ ...ok, wrapVerdict: 'unknown' })).toContain(
      'Mac Steam'
    )
  })
})

describe('redaction', () => {
  it('strips steamids, jwts, long tokens and home paths', () => {
    expect(redact('id 76561198012345678 x')).toBe('id <steamid> x')
    expect(redact('t eyJhbGciOi.abc123.def456')).toBe('t <jwt>')
    expect(redact(`k ${'A'.repeat(48)}`)).toBe('k <token>')
    expect(redact('/Users/someone/proj')).toBe('/Users/<user>/proj')
    expect(redact('/home/someone/x')).toBe('/home/<user>/x')
  })
})
