import { getOrCreateCmLogonId } from '../cmLogonId'

function makeStore(initial?: unknown) {
  let value = initial as number | undefined
  const set = jest.fn((_k: 'cmLogonId', v: number) => {
    value = v
  })
  return { get: () => value, set }
}

describe('getOrCreateCmLogonId', () => {
  test('generates, persists, and is stable', () => {
    const store = makeStore()
    const id = getOrCreateCmLogonId(store)
    expect(Number.isInteger(id)).toBe(true)
    expect(id).toBeGreaterThanOrEqual(1)
    expect(id).toBeLessThanOrEqual(4294967295)
    expect(store.set).toHaveBeenCalledTimes(1)
    expect(getOrCreateCmLogonId(store)).toBe(id)
    expect(store.set).toHaveBeenCalledTimes(1)
  })

  test.each([0, -5, 1.5, 4294967296, NaN, '7'])(
    'replaces invalid stored value %p',
    (bad) => {
      const store = makeStore(bad)
      const id = getOrCreateCmLogonId(store)
      expect(id).toBeGreaterThanOrEqual(1)
      expect(id).toBeLessThanOrEqual(4294967295)
      expect(store.set).toHaveBeenCalledTimes(1)
    }
  )
})
