/**
 * Unit tests for the pure per-state expiration-display decision used by the
 * HumbleKeyRow component (live-UAT round 5 polish). The helper lives in
 * common/humble/expirationDisplay.ts (no React/i18n/I/O); this test sits in
 * the backend suite because jest's project roots only cover src/backend.
 */

import { getExpirationDisplay } from 'common/humble/expirationDisplay'

const ISO = '2026-08-03T00:00:00.000Z'

describe('getExpirationDisplay', () => {
  test('REDEEMED with no expiration -> blank (never "No expiration")', () => {
    expect(getExpirationDisplay('REDEEMED', null)).toEqual({ kind: 'blank' })
  })

  test('REDEEMED with a known expiration -> STILL blank (irrelevant once redeemed)', () => {
    expect(getExpirationDisplay('REDEEMED', ISO)).toEqual({ kind: 'blank' })
  })

  test('UNREDEEMABLE with a known expiration -> shows the date', () => {
    expect(getExpirationDisplay('UNREDEEMABLE', ISO)).toEqual({
      kind: 'date',
      iso: ISO
    })
  })

  test('UNREDEEMABLE without a date -> blank (the Expired badge already says it)', () => {
    expect(getExpirationDisplay('UNREDEEMABLE', null)).toEqual({
      kind: 'blank'
    })
  })

  test('UNREVEALED with a date -> shows the date', () => {
    expect(getExpirationDisplay('UNREVEALED', ISO)).toEqual({
      kind: 'date',
      iso: ISO
    })
  })

  test('UNREVEALED without a date -> "No expiration" (unchanged)', () => {
    expect(getExpirationDisplay('UNREVEALED', null)).toEqual({
      kind: 'no-expiration'
    })
  })

  test('REVEALED with a date -> shows the date', () => {
    expect(getExpirationDisplay('REVEALED', ISO)).toEqual({
      kind: 'date',
      iso: ISO
    })
  })

  test('REVEALED without a date -> "No expiration" (unchanged)', () => {
    expect(getExpirationDisplay('REVEALED', null)).toEqual({
      kind: 'no-expiration'
    })
  })

  test('UNPICKED with a deadline -> shows the date (D-27 unchanged)', () => {
    expect(getExpirationDisplay('UNPICKED', ISO)).toEqual({
      kind: 'date',
      iso: ISO
    })
  })

  test('UNPICKED without a deadline -> pick-deadline placeholder (D-27 unchanged)', () => {
    expect(getExpirationDisplay('UNPICKED', null)).toEqual({
      kind: 'no-deadline'
    })
  })
})
