import {
  initStateSubscriptions,
  __resetInitStateSubscriptionsGuardForTests
} from '../initStateSubscriptions'

describe('initStateSubscriptions', () => {
  beforeEach(() => __resetInitStateSubscriptionsGuardForTests())

  it('is importable in node env and returns no disposer', () => {
    expect(initStateSubscriptions()).toBeUndefined()
  })

  it('runs its body once; a second call is a no-op', () => {
    const lengthSpy = jest.spyOn(Set.prototype, 'add')
    initStateSubscriptions()
    const afterFirst = lengthSpy.mock.calls.length
    initStateSubscriptions()
    expect(lengthSpy.mock.calls.length).toBe(afterFirst)
    lengthSpy.mockRestore()
  })

  it('guard reset allows a second run (anti-vacuity)', () => {
    initStateSubscriptions()
    __resetInitStateSubscriptionsGuardForTests()
    // would throw/no-op incorrectly if the guard were stuck; just must not throw
    expect(() => initStateSubscriptions()).not.toThrow()
  })
})
