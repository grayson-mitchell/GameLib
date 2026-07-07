/**
 * Unit tests for the pure urgency tier + countdown-copy helpers used by the
 * Humble Keys urgency badge (D-61/D-62/D-63, HVIEW-01/HVIEW-02). The helpers
 * live in common/humble/urgencyBadge.ts (no React/i18n/I/O); this test sits
 * in the backend suite because jest's project roots only cover src/backend.
 */

import { HumbleKeyState } from 'common/types/humble'
import {
  getUrgencyTier,
  getUrgencyCountdownParts
} from 'common/humble/urgencyBadge'

const NOW = new Date('2026-07-07T00:00:00.000Z')

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString()
}

function hoursFromNow(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString()
}

describe('getUrgencyTier', () => {
  test('returns danger at exactly the 7-day boundary', () => {
    expect(getUrgencyTier('UNREVEALED', daysFromNow(7), NOW)).toBe('danger')
  })

  test('returns warning just past the 7-day boundary (~8 days)', () => {
    expect(getUrgencyTier('UNREVEALED', daysFromNow(8), NOW)).toBe('warning')
  })

  test('returns warning at exactly the 30-day boundary', () => {
    expect(getUrgencyTier('UNREVEALED', daysFromNow(30), NOW)).toBe('warning')
  })

  test('returns null just past the 30-day boundary', () => {
    expect(getUrgencyTier('UNREVEALED', daysFromNow(45), NOW)).toBeNull()
  })

  test('returns danger for a near-future expiration (3 days out)', () => {
    expect(getUrgencyTier('UNREVEALED', daysFromNow(3), NOW)).toBe('danger')
  })

  test('returns warning for a mid-future expiration (20 days out)', () => {
    expect(getUrgencyTier('UNREVEALED', daysFromNow(20), NOW)).toBe('warning')
  })

  test.each<HumbleKeyState>(['REDEEMED', 'UNREDEEMABLE'])(
    'D-63: never badges for state %s regardless of expiration',
    (state) => {
      expect(getUrgencyTier(state, daysFromNow(1), NOW)).toBeNull()
    }
  )

  test('returns null for state REDEEMED with a near-future expiration', () => {
    expect(getUrgencyTier('REDEEMED', daysFromNow(1), NOW)).toBeNull()
  })

  test('returns null when expiration is null', () => {
    expect(getUrgencyTier('UNREVEALED', null, NOW)).toBeNull()
  })

  test('returns null for a past expiration', () => {
    expect(getUrgencyTier('UNREVEALED', daysFromNow(-1), NOW)).toBeNull()
  })

  test.each<HumbleKeyState>(['UNPICKED', 'UNREVEALED', 'REVEALED'])(
    'badges eligible states within the danger window (%s)',
    (state) => {
      expect(getUrgencyTier(state, daysFromNow(2), NOW)).toBe('danger')
    }
  )
})

describe('getUrgencyCountdownParts', () => {
  test('under 24h returns hours phrasing, rounded up', () => {
    expect(getUrgencyCountdownParts(hoursFromNow(5.2), NOW)).toEqual({
      kind: 'hours',
      value: 6
    })
  })

  test('under 24h floors to a minimum value of 1', () => {
    expect(getUrgencyCountdownParts(hoursFromNow(0.1), NOW)).toEqual({
      kind: 'hours',
      value: 1
    })
  })

  test('at exactly 24h returns days phrasing', () => {
    expect(getUrgencyCountdownParts(hoursFromNow(24), NOW)).toEqual({
      kind: 'days',
      value: 1
    })
  })

  test('exactly-1-day range yields value 1', () => {
    expect(getUrgencyCountdownParts(hoursFromNow(30), NOW)).toEqual({
      kind: 'days',
      value: 2
    })
  })

  test('multi-day span returns ceil of days left', () => {
    expect(getUrgencyCountdownParts(daysFromNow(14.2), NOW)).toEqual({
      kind: 'days',
      value: 15
    })
  })

  test('returns null/blank for a null expiration', () => {
    expect(getUrgencyCountdownParts(null, NOW)).toEqual({ kind: 'none' })
  })

  test('returns null/blank for an already-past expiration', () => {
    expect(getUrgencyCountdownParts(daysFromNow(-1), NOW)).toEqual({
      kind: 'none'
    })
  })
})
