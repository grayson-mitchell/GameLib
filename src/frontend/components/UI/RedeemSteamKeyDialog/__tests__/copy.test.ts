import { TFunction } from 'i18next'

import { redeemOutcomeCopy } from '../copy'

// Minimal fixture mirroring repairFailure.test.ts's `t` mock (returns its
// second argument), extended to perform a simple `{{packageName}}`
// substitution when an interpolation-options argument is supplied — the
// smallest behaviour needed to prove the successWithPackage branch is
// copy-preserving, not a rewrite.
const t = ((
  _key: string,
  defaultValue: string,
  options?: { packageName?: string }
) => {
  if (options?.packageName) {
    return defaultValue.replace('{{packageName}}', options.packageName)
  }
  return defaultValue
}) as unknown as TFunction

const throwingT = (() => {
  throw new Error('translation exploded')
}) as unknown as TFunction

describe('redeemOutcomeCopy', () => {
  it.each([
    ['success', 'Half-Life 3'],
    ['already-owned', undefined],
    ['invalid', undefined],
    ['rate-limited', undefined],
    ['error', undefined]
  ] as const)(
    'returns a message for outcome %s',
    (outcome, packageName) => {
      const result = redeemOutcomeCopy(outcome, t, packageName)
      expect(result.message).toEqual(expect.any(String))
      expect(result.message.length).toBeGreaterThan(0)
    }
  )

  it('interpolates the package name into the success message', () => {
    const { message } = redeemOutcomeCopy('success', t, 'Half-Life 3')
    expect(message).toContain('Half-Life 3')
  })

  it('produces mutually distinct messages across all four buckets + error', () => {
    const outcomes: Array<
      Parameters<typeof redeemOutcomeCopy>[0]
    > = ['success', 'already-owned', 'invalid', 'rate-limited', 'error']
    const messages = outcomes.map(
      (outcome) => redeemOutcomeCopy(outcome, t, 'Some Game').message
    )
    const uniqueMessages = new Set(messages)
    expect(uniqueMessages.size).toBe(messages.length)
  })

  it('never falls back to a generic "failed" message shared across buckets', () => {
    const outcomes: Array<
      Parameters<typeof redeemOutcomeCopy>[0]
    > = ['already-owned', 'invalid', 'rate-limited', 'error']
    for (const outcome of outcomes) {
      const { message } = redeemOutcomeCopy(outcome, t)
      expect(message.toLowerCase()).not.toBe('failed')
      expect(message.toLowerCase()).not.toBe('redemption failed')
    }
  })

  it('marks success as tone "success" and all others as tone "error"', () => {
    expect(redeemOutcomeCopy('success', t).tone).toBe('success')
    expect(redeemOutcomeCopy('already-owned', t).tone).toBe('error')
    expect(redeemOutcomeCopy('invalid', t).tone).toBe('error')
    expect(redeemOutcomeCopy('rate-limited', t).tone).toBe('error')
    expect(redeemOutcomeCopy('error', t).tone).toBe('error')
  })

  // Phase 34.8-07 (REQ-34.8-12/-13): copy-preserving assertions — with a
  // mock `t` that returns its (interpolated) default, every outcome's
  // message equals the EXACT pre-retrofit English text. This is what proves
  // the retrofit is a routing change, not a copy edit.
  describe('copy-preserving retrofit (pre-retrofit English text unchanged)', () => {
    it('success with a packageName', () => {
      const { message } = redeemOutcomeCopy('success', t, 'Half-Life 3')
      expect(message).toBe(
        'Key redeemed! Half-Life 3 has been added to your Steam library.'
      )
    })

    it('success with no packageName', () => {
      const { message } = redeemOutcomeCopy('success', t)
      expect(message).toBe('Key redeemed! Your Steam library has been updated.')
    })

    it('already-owned', () => {
      const { message } = redeemOutcomeCopy('already-owned', t)
      expect(message).toBe(
        'This key has already been redeemed — you already own this on Steam.'
      )
    })

    it('invalid', () => {
      const { message } = redeemOutcomeCopy('invalid', t)
      expect(message).toBe(
        "This key doesn't look right. Double-check it and try again."
      )
    })

    it('rate-limited', () => {
      const { message } = redeemOutcomeCopy('rate-limited', t)
      expect(message).toBe(
        'Too many attempts — please wait a bit before trying again.'
      )
    })

    it('error', () => {
      const { message } = redeemOutcomeCopy('error', t)
      expect(message).toBe(
        "Couldn't reach Steam to redeem this key. Check your connection and try again."
      )
    })
  })

  // Phase 34.8-07: throwing-`t` fallback assertions — the repairFailure.ts
  // try/catch posture. A throwing `t` must still yield a non-empty English
  // message rather than propagating.
  describe('throwing t falls back to the hardcoded English text', () => {
    it.each([
      ['success', 'Half-Life 3'],
      ['success', undefined],
      ['already-owned', undefined],
      ['invalid', undefined],
      ['rate-limited', undefined],
      ['error', undefined]
    ] as const)('outcome %s (packageName %s)', (outcome, packageName) => {
      expect(() =>
        redeemOutcomeCopy(outcome, throwingT, packageName)
      ).not.toThrow()
      const { message } = redeemOutcomeCopy(outcome, throwingT, packageName)
      expect(message).toEqual(expect.any(String))
      expect(message.length).toBeGreaterThan(0)
    })
  })
})
