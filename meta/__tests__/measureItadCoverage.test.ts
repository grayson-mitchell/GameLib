import {
  SWEEP_COUNTRIES,
  amountAgrees,
  assertNoSecret,
  pickResultsParam
} from '../measureItadCoverage'

describe('measureItadCoverage helpers', () => {
  test('assertNoSecret passes clean text and throws without echoing the secret', () => {
    expect(assertNoSecret('abc', 'k3y')).toBe('abc')
    let message = ''
    try {
      assertNoSecret('xx k3y xx', 'k3y')
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).not.toBe('')
    expect(message).not.toContain('k3y')
  })

  test('amountAgrees respects currency fraction digits', () => {
    expect(amountAgrees({ amount: 14.99, amountInt: 1499 }, 'USD')).toBe(true)
    expect(amountAgrees({ amount: 1480, amountInt: 1480 }, 'JPY')).toBe(true)
    expect(amountAgrees({ amount: 1480, amountInt: 148000 }, 'JPY')).toBe(false)
  })

  test('pickResultsParam picks the capping param', () => {
    expect(pickResultsParam({ results: 20, limit: 50 }, 20)).toBe('results')
    expect(pickResultsParam({ results: 50, limit: 20 }, 20)).toBe('limit')
    expect(pickResultsParam({ results: 50, limit: 50 }, 20)).toBeNull()
  })

  test('SWEEP_COUNTRIES covers the extras without duplicates', () => {
    expect(new Set(SWEEP_COUNTRIES).size).toBe(SWEEP_COUNTRIES.length)
    for (const c of ['US', 'GB', 'JP', 'AR', 'MD', 'NZ', 'IE', 'AE']) {
      expect(SWEEP_COUNTRIES).toContain(c)
    }
    expect(SWEEP_COUNTRIES).toHaveLength(42)
  })
})
