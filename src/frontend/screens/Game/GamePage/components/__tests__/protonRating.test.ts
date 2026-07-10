import { protonTierToStars } from '../protonRating'

describe('protonTierToStars', () => {
  test.each([
    ['platinum', 5],
    ['gold', 4],
    ['silver', 3],
    ['bronze', 2],
    ['borked', 1]
  ])('%s -> %i stars', (tier, expected) => {
    expect(protonTierToStars(tier)).toBe(expected)
  })

  test('is case-insensitive and trims whitespace', () => {
    expect(protonTierToStars('  Platinum  ')).toBe(5)
    expect(protonTierToStars('GOLD')).toBe(4)
  })

  test("'pending' has no compatibility signal -> null", () => {
    expect(protonTierToStars('pending')).toBeNull()
  })

  test("'native' has no Proton layer involved -> null", () => {
    expect(protonTierToStars('native')).toBeNull()
  })

  test('empty string -> null', () => {
    expect(protonTierToStars('')).toBeNull()
  })

  test('undefined -> null', () => {
    expect(protonTierToStars(undefined)).toBeNull()
  })

  test('null -> null', () => {
    expect(protonTierToStars(null)).toBeNull()
  })

  test('unknown value -> null', () => {
    expect(protonTierToStars('not-a-real-tier')).toBeNull()
  })
})
