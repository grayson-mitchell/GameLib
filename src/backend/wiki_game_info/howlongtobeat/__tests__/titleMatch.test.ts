import {
  MIN_CONFIDENCE,
  diceSimilarity,
  normalizeTitle,
  pickBestMatch,
  sequelToken
} from '../titleMatch'

const candidates = (...titles: string[]) =>
  titles.map((title) => ({ title, value: title }))

describe('normalizeTitle', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeTitle('  The Witcher 3: Wild Hunt  ')).toBe(
      'the witcher 3 wild hunt'
    )
  })

  it('strips diacritics', () => {
    expect(normalizeTitle('Pokémon Snap')).toBe('pokemon snap')
  })

  it('spells & as and', () => {
    expect(normalizeTitle('Sam & Max')).toBe('sam and max')
  })

  it('folds a trailing roman numeral to arabic', () => {
    expect(normalizeTitle('Final Fantasy VII')).toBe('final fantasy 7')
    expect(normalizeTitle('Final Fantasy 7')).toBe('final fantasy 7')
  })

  it('leaves an interior roman numeral alone', () => {
    expect(normalizeTitle('Rome II Total War')).toBe('rome ii total war')
  })

  it('does not fold a single-word title that is itself a numeral', () => {
    expect(normalizeTitle('X')).toBe('x')
  })

  it('does not strip edition suffixes', () => {
    expect(normalizeTitle('Dark Souls: Remastered')).toBe(
      'dark souls remastered'
    )
  })
})

describe('sequelToken', () => {
  it('reads a trailing number', () => {
    expect(sequelToken(normalizeTitle('Portal 2'))).toBe(2)
    expect(sequelToken(normalizeTitle('Final Fantasy VII'))).toBe(7)
  })

  it('is null when there is no trailing number', () => {
    expect(sequelToken(normalizeTitle('Portal'))).toBeNull()
    expect(sequelToken(normalizeTitle('Half-Life: Alyx'))).toBeNull()
  })
})

describe('diceSimilarity', () => {
  it('scores identical strings 1', () => {
    expect(diceSimilarity('portal', 'portal')).toBe(1)
  })

  it('scores disjoint strings 0', () => {
    expect(diceSimilarity('abcd', 'wxyz')).toBe(0)
  })

  it('is symmetric', () => {
    expect(diceSimilarity('celeste', 'celestia')).toBeCloseTo(
      diceSimilarity('celestia', 'celeste')
    )
  })
})

describe('pickBestMatch', () => {
  it('accepts an exact match after normalization', () => {
    expect(
      pickBestMatch(
        'The Witcher 3: Wild Hunt',
        candidates('the witcher 3 wild hunt')
      )
    ).toBe('the witcher 3 wild hunt')
  })

  it('accepts a roman-numeral spelling of the same sequel', () => {
    expect(
      pickBestMatch('Final Fantasy VII', candidates('Final Fantasy 7'))
    ).toBe('Final Fantasy 7')
  })

  it('picks the right sequel out of a family', () => {
    expect(
      pickBestMatch(
        'Final Fantasy VII',
        candidates(
          'Final Fantasy VIII',
          'Final Fantasy VII',
          'Final Fantasy VI'
        )
      )
    ).toBe('Final Fantasy VII')
  })

  // The headline correctness case: two DISTINCT games normalize identically, so a
  // similarity-only rule would return whichever HLTB ranked first.
  it('refuses two candidates that normalize identically', () => {
    expect(pickBestMatch('Doom', candidates('Doom', 'DOOM'))).toBeNull()
  })

  it('refuses a sequel when the query has no sequel token', () => {
    expect(pickBestMatch('Portal', candidates('Portal 2'))).toBeNull()
  })

  // These two are the sequel guard's ONLY load-bearing cases. Long titles differing by one
  // numeral score ABOVE MIN_CONFIDENCE (Final Fantasy VII vs VIII is 0.93), and as a sole
  // candidate there is no runner-up to trip the ambiguity guard either -- so without the
  // sequel filter they are accepted outright, and the wrong game's playtime is shown.
  // Deleting the filter leaves every other test in this file green.
  it('refuses a wrong-numbered sequel that scores above the threshold', () => {
    expect(
      pickBestMatch('Final Fantasy VII', candidates('Final Fantasy VIII'))
    ).toBeNull()
  })

  it('refuses a wrong-numbered sequel given in arabic', () => {
    expect(
      pickBestMatch('Dragon Quest 11', candidates('Dragon Quest 12'))
    ).toBeNull()
  })

  it('refuses a base game when the query is a sequel', () => {
    expect(pickBestMatch('Portal 2', candidates('Portal'))).toBeNull()
  })

  it('refuses an edition variant', () => {
    expect(
      pickBestMatch('Dark Souls', candidates('Dark Souls: Remastered'))
    ).toBeNull()
  })

  it('refuses a near-tie between two different titles', () => {
    expect(
      pickBestMatch('Celeste', candidates('Celeste', 'Celeste!'))
    ).toBeNull()
  })

  it('refuses anything below the confidence threshold', () => {
    expect(pickBestMatch('Hades', candidates('Hollow Knight'))).toBeNull()
  })

  it('returns null for an empty candidate list', () => {
    expect(pickBestMatch('Hades', [])).toBeNull()
  })

  it('returns null for an empty query', () => {
    expect(pickBestMatch('   ', candidates('Hades'))).toBeNull()
  })

  it('accepts only at or above MIN_CONFIDENCE', () => {
    const accepted = pickBestMatch('Hollow Knight', candidates('Hollow Knight'))
    expect(accepted).toBe('Hollow Knight')
    expect(
      diceSimilarity(
        normalizeTitle('Hollow Knight'),
        normalizeTitle('Hollow Knight')
      )
    ).toBeGreaterThanOrEqual(MIN_CONFIDENCE)
  })
})
