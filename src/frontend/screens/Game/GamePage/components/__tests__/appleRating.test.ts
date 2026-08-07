import { TFunction } from 'i18next'

import { ratingTier } from '../appleRating'

// Mirrors repairFailure.test.ts / copy.test.ts's `t` mock: returns its
// default-text argument unchanged so copy-preservation is provable.
const passthroughT = ((_key: string, defaultValue: string) =>
  defaultValue) as unknown as TFunction

const SENTINEL = '__SENTINEL_TRANSLATION__'
const sentinelT = ((_key: string, _defaultValue: string) =>
  SENTINEL) as unknown as TFunction

describe('ratingTier', () => {
  test("empty rating with a passthrough t preserves the English default 'Unrated'", () => {
    expect(ratingTier('', passthroughT)).toEqual({
      label: 'Unrated',
      colorVar: '--status-default'
    })
  })

  test('empty rating routes through the injected t (sentinel proves it is called)', () => {
    expect(ratingTier('', sentinelT)).toEqual({
      label: SENTINEL,
      colorVar: '--status-default'
    })
  })

  test.each([
    ['perfect', '--status-success'],
    ['playable', '--status-success'],
    ['runs', '--status-warning'],
    ['borderline', '--status-warning'],
    ['unplayable', '--status-danger']
  ])('%s rating is unaffected by the t retrofit', (rating, colorVar) => {
    expect(ratingTier(rating, passthroughT)).toEqual({
      label: rating.charAt(0).toUpperCase() + rating.slice(1),
      colorVar
    })
  })

  test('unknown rating falls through to capitalize(), unaffected by the t retrofit', () => {
    expect(ratingTier('mystery', passthroughT)).toEqual({
      label: 'Mystery',
      colorVar: '--status-default'
    })
  })
})
