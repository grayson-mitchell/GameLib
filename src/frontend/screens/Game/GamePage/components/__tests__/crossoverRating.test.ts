import { formatCrossoverRating } from '../crossoverRating'

describe('formatCrossoverRating', () => {
  test('formats a rating-count label with a plural rating count', () => {
    expect(formatCrossoverRating(4.5, 2)).toBe('(2 ratings)')
  })

  test('formats a rating-count label with a singular rating count', () => {
    expect(formatCrossoverRating(5, 1)).toBe('(1 rating)')
  })

  test('returns null on a genuine miss (rating is null)', () => {
    expect(formatCrossoverRating(null, null)).toBeNull()
  })
})
