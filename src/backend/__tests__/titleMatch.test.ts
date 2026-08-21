/**
 * Unit tests for the shared, store-agnostic fuzzy title matcher
 * (common/matching/titleMatch.ts — Phase 20 D-02, lifted from dedup.ts).
 *
 * These assertions mirror the pure-function coverage in
 * backend/humble/__tests__/dedup.test.ts — the moved functions are
 * behavior-identical, so both suites must stay green together.
 */

import {
  normalizeTitle,
  titleSimilarity,
  isDlcFalsePositiveRisk,
  isRemasterFalsePositiveRisk,
  fuzzyMatch,
  HUMBLE_FUZZY_MATCH_THRESHOLD
} from 'common/matching/titleMatch'

describe('HUMBLE_FUZZY_MATCH_THRESHOLD', () => {
  it('is locked at 0.85 (D-02)', () => {
    expect(HUMBLE_FUZZY_MATCH_THRESHOLD).toBe(0.85)
  })
})

describe('normalizeTitle', () => {
  it('strips the trademark symbol and lowercases', () => {
    expect(normalizeTitle('The Witcher 3™')).toBe('the witcher 3')
  })

  it('strips parenthetical qualifiers like "(Steam)" — load-bearing fixture', () => {
    expect(normalizeTitle('Into The Breach (Steam)')).toBe(
      normalizeTitle('Into the Breach')
    )
  })

  it('lowercases, strips trademark symbols, punctuation, and edition suffixes', () => {
    expect(normalizeTitle('FRAMED Collection™')).toBe('framed')
    expect(normalizeTitle('Assault Android Cactus+')).toBe(
      'assault android cactus'
    )
    expect(normalizeTitle('Skyrim: Game of the Year Edition')).toBe('skyrim')
  })

  it('no longer strips "remastered" — quick task 260715-a7g product-differentiator fix', () => {
    expect(normalizeTitle('Alan Wake Remastered')).toContain('remastered')
  })
})

describe('titleSimilarity', () => {
  it('identical-after-normalization titles score 1', () => {
    expect(titleSimilarity('FRAMED Collection', 'Framed Collection')).toBe(1)
  })

  it('empty-after-normalization input scores 0', () => {
    expect(titleSimilarity('™®©', 'Portal 2')).toBe(0)
  })

  it('a DLC title scores well below threshold against its base game', () => {
    expect(titleSimilarity('Game X: Season Pass', 'Game X')).toBeLessThan(0.85)
  })
})

describe('isDlcFalsePositiveRisk', () => {
  it('flags Terraria vs Terraria Soundtrack DLC (keyword in longer, not shorter)', () => {
    expect(isDlcFalsePositiveRisk('Terraria', 'Terraria Soundtrack DLC')).toBe(
      true
    )
  })

  it('flags when the longer raw title carries a DLC keyword the shorter lacks', () => {
    expect(isDlcFalsePositiveRisk('Game X', 'Game X: Season Pass')).toBe(true)
    expect(isDlcFalsePositiveRisk('Game X: Season Pass', 'Game X')).toBe(true)
    expect(
      isDlcFalsePositiveRisk('Half-Life', 'Half-Life (Original Soundtrack)')
    ).toBe(true)
  })

  it('does not flag when neither or both titles carry DLC keywords', () => {
    expect(isDlcFalsePositiveRisk('Portal 2', 'Portal 2')).toBe(false)
    expect(
      isDlcFalsePositiveRisk('Game X Season Pass', 'Game X: Season Pass')
    ).toBe(false)
  })
})

describe('isRemasterFalsePositiveRisk', () => {
  it('flags an original title against its remastered/remade release (keyword in longer, not shorter)', () => {
    expect(
      isRemasterFalsePositiveRisk('Alan Wake', 'Alan Wake Remastered')
    ).toBe(true)
    expect(isRemasterFalsePositiveRisk('Alan Wake', 'Alan Wake Remake')).toBe(
      true
    )
  })

  it('does not flag when both titles carry the same product-variant keyword', () => {
    expect(
      isRemasterFalsePositiveRisk(
        'Alan Wake Remastered',
        'Alan Wake Remastered'
      )
    ).toBe(false)
  })
})

describe('fuzzyMatch', () => {
  it('matches identical titles', () => {
    expect(fuzzyMatch('Portal 2', 'Portal 2')).toBe(true)
  })

  it('respects the 0.85 threshold for a partial title', () => {
    expect(fuzzyMatch('Portal', 'Portal 2')).toBe(
      titleSimilarity('Portal', 'Portal 2') >= HUMBLE_FUZZY_MATCH_THRESHOLD
    )
  })

  it('accepts documented should-match pairs at the 85% threshold', () => {
    expect(
      fuzzyMatch('Assault Android Cactus+', 'Assault Android Cactus')
    ).toBe(true)
    expect(fuzzyMatch('FRAMED Collection', 'Framed Collection')).toBe(true)
    expect(fuzzyMatch('Into the Breach', 'Into The Breach (Steam)')).toBe(true)
  })

  it('returns false whenever isDlcFalsePositiveRisk is true, regardless of score', () => {
    expect(fuzzyMatch('Game X: Season Pass', 'Game X')).toBe(false)
    expect(fuzzyMatch('Batman', 'Batman: Arkham Knight')).toBe(false)
    expect(fuzzyMatch('Terraria', 'Terraria Soundtrack DLC')).toBe(false)
  })

  it('regression: other edition suffixes still match unaffected (Deluxe Edition, (Steam) qualifier)', () => {
    expect(fuzzyMatch('Portal 2', 'Portal 2 Deluxe Edition')).toBe(true)
    expect(fuzzyMatch('Into the Breach', 'Into The Breach (Steam)')).toBe(true)
  })
})

describe('remaster/remake product differentiators (quick task 260715-a7g)', () => {
  it('does not match an original title against its remaster/remake — the reported owned-badge bug', () => {
    expect(fuzzyMatch('Alan Wake', 'Alan Wake Remastered')).toBe(false)
    expect(fuzzyMatch('Alan Wake', 'Alan Wake Remake')).toBe(false)
  })

  it('an exact remaster title still self-matches', () => {
    expect(fuzzyMatch('Alan Wake Remastered', 'Alan Wake Remastered')).toBe(
      true
    )
  })

  it('regression: a sequel is distinct and must not falsely match either title', () => {
    expect(fuzzyMatch('Alan Wake', 'Alan Wake 2')).toBe(false)
  })
})
