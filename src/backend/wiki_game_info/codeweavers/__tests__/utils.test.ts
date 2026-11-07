import { slugify } from '../utils'

describe('slugify', () => {
  // KNOWN_GOOD self-check trio (spike/crossover-compat-lookup.mjs:53-57)
  test('007 Nightfire', () => {
    expect(slugify('007 Nightfire')).toBe('007-nightfire')
  })

  test('10,000,000', () => {
    expect(slugify('10,000,000')).toBe('10-000-000')
  })

  test('001 Game Creator', () => {
    expect(slugify('001 Game Creator')).toBe('001-game-creator')
  })

  test('Hades', () => {
    expect(slugify('Hades')).toBe('hades')
  })

  // D-04: apostrophes DROPPED entirely, not hyphenated
  test("Baldur's Gate 3 drops the apostrophe", () => {
    expect(slugify("Baldur's Gate 3")).toBe('baldurs-gate-3')
  })

  test("Marvel's Spider-Man Remastered drops the apostrophe", () => {
    expect(slugify("Marvel's Spider-Man Remastered")).toBe(
      'marvels-spider-man-remastered'
    )
  })

  // D-20: roman numerals kept VERBATIM — the site serves the roman form,
  // converting to Arabic digits was WRONG and pulled two already-matching
  // strings apart.
  test('Call of Duty: Modern Warfare II keeps the roman numeral', () => {
    expect(slugify('Call of Duty: Modern Warfare II')).toBe(
      'call-of-duty-modern-warfare-ii'
    )
  })

  test('Age of Empires II keeps the roman numeral', () => {
    expect(slugify('Age of Empires II')).toBe('age-of-empires-ii')
  })

  test('Quake II keeps the roman numeral', () => {
    expect(slugify('Quake II')).toBe('quake-ii')
  })

  test("Alekhine's Gun drops the apostrophe", () => {
    expect(slugify("Alekhine's Gun")).toBe('alekhines-gun')
  })

  // Diacritics stripped
  test('Pokémon strips the diacritic', () => {
    expect(slugify('Pokémon')).toBe('pokemon')
  })
})
