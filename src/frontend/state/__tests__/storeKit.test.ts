import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
  bindStoreHooks,
  registerStoreForReset,
  resetAllStores
} from '../storeKit'

interface Demo {
  a: number
  b: string
  bump: () => void
}

const makeStore = () => {
  const useRaw = create<Demo>()(
    subscribeWithSelector((set) => ({
      a: 1,
      b: 'x',
      bump: () => set((s) => ({ a: s.a + 1 }))
    }))
  )
  return { useRaw, hooks: bindStoreHooks(useRaw) }
}

describe('storeKit', () => {
  it('returns a callable hook exposing the raw api functions', () => {
    const { useRaw, hooks } = makeStore()
    expect(typeof hooks).toBe('function')
    expect(typeof hooks.keys).toBe('function')
    expect(hooks.setState).toBe(useRaw.setState)
    expect(hooks.getState).toBe(useRaw.getState)
    expect(hooks.subscribe).toBe(useRaw.subscribe)
  })

  it('subscribe with a selector fires only when the slice changes', () => {
    const { hooks } = makeStore()
    const listener = jest.fn()
    hooks.subscribe((s) => s.a, listener)
    hooks.setState({ b: 'y' })
    expect(listener).not.toHaveBeenCalled()
    hooks.setState({ a: 5 })
    expect(listener).toHaveBeenCalledWith(5, 1)
  })

  it('1-arg subscribe fires on every change', () => {
    const { hooks } = makeStore()
    const listener = jest.fn()
    hooks.subscribe(listener)
    hooks.setState({ b: 'y' })
    hooks.setState({ a: 2 })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('resetAllStores restores registered stores and keeps actions', () => {
    const { useRaw, hooks } = makeStore()
    registerStoreForReset(useRaw)
    hooks.setState({ a: 99, b: 'changed' })
    expect(hooks.getState().a).toBe(99)
    resetAllStores()
    expect(hooks.getState().a).toBe(1)
    expect(hooks.getState().b).toBe('x')
    hooks.getState().bump()
    expect(hooks.getState().a).toBe(2)
  })

  it('registering the same store twice keeps one registry entry', () => {
    const { useRaw, hooks } = makeStore()
    const spy = jest.spyOn(useRaw, 'setState')
    registerStoreForReset(useRaw)
    registerStoreForReset(useRaw)
    hooks.setState({ a: 7 })
    spy.mockClear()
    resetAllStores()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(hooks.getState().a).toBe(1)
  })
})
