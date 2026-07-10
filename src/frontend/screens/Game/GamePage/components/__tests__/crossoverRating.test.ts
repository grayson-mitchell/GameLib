import { formatCrossoverRating } from '../crossoverRating'

describe('formatCrossoverRating', () => {
  test('formats a numeric rating with a plural rating count', () => {
    expect(formatCrossoverRating(4.5, 2)).toBe('4.5 / 5 (2 ratings)')
  })

  test('formats a numeric rating with a singular rating count', () => {
    expect(formatCrossoverRating(5, 1)).toBe('5 / 5 (1 rating)')
  })

  test('returns null on a genuine miss (rating is null)', () => {
    expect(formatCrossoverRating(null, null)).toBeNull()
  })
})
