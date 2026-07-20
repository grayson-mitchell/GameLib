import { redeemOutcomeCopy } from '../copy'

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
      const result = redeemOutcomeCopy(outcome, packageName)
      expect(result.message).toEqual(expect.any(String))
      expect(result.message.length).toBeGreaterThan(0)
    }
  )

  it('interpolates the package name into the success message', () => {
    const { message } = redeemOutcomeCopy('success', 'Half-Life 3')
    expect(message).toContain('Half-Life 3')
  })

  it('produces mutually distinct messages across all four buckets + error', () => {
    const outcomes: Array<
      Parameters<typeof redeemOutcomeCopy>[0]
    > = ['success', 'already-owned', 'invalid', 'rate-limited', 'error']
    const messages = outcomes.map(
      (outcome) => redeemOutcomeCopy(outcome, 'Some Game').message
    )
    const uniqueMessages = new Set(messages)
    expect(uniqueMessages.size).toBe(messages.length)
  })

  it('never falls back to a generic "failed" message shared across buckets', () => {
    const outcomes: Array<
      Parameters<typeof redeemOutcomeCopy>[0]
    > = ['already-owned', 'invalid', 'rate-limited', 'error']
    for (const outcome of outcomes) {
      const { message } = redeemOutcomeCopy(outcome)
      expect(message.toLowerCase()).not.toBe('failed')
      expect(message.toLowerCase()).not.toBe('redemption failed')
    }
  })

  it('marks success as tone "success" and all others as tone "error"', () => {
    expect(redeemOutcomeCopy('success').tone).toBe('success')
    expect(redeemOutcomeCopy('already-owned').tone).toBe('error')
    expect(redeemOutcomeCopy('invalid').tone).toBe('error')
    expect(redeemOutcomeCopy('rate-limited').tone).toBe('error')
    expect(redeemOutcomeCopy('error').tone).toBe('error')
  })
})
