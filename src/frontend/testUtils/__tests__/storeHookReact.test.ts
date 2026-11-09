/**
 * Mock-free unit test of withStoreHooks. The end-to-end proof that a real
 * zustand + useShallow hook works under it is delivered by plan 69-08 Task 1
 * (the Login Runner test, the first converted test that already mocks react).
 */
import { withStoreHooks } from '../storeHookReact'

const actual = jest.requireActual<typeof import('react')>('react')

describe('withStoreHooks', () => {
  const r = withStoreHooks(actual)

  it('useSyncExternalStore returns the snapshot', () => {
    expect(
      r.useSyncExternalStore(
        () => () => undefined,
        () => 42
      )
    ).toBe(42)
  })

  it('useRef returns a fresh box each call', () => {
    const a = r.useRef(1)
    const b = r.useRef(1)
    expect(a).toEqual({ current: 1 })
    expect(a).not.toBe(b)
  })

  it('useMemo invokes and useCallback returns the fn', () => {
    expect(r.useMemo(() => 'v', [])).toBe('v')
    const fn = () => 1
    expect(r.useCallback(fn, [])).toBe(fn)
  })

  it('effects and debug value are no-ops', () => {
    const effect = jest.fn()
    r.useEffect(effect)
    r.useLayoutEffect(effect)
    r.useInsertionEffect(effect)
    r.useDebugValue(1)
    expect(effect).not.toHaveBeenCalled()
  })

  it('overrides win and other exports are preserved', () => {
    const ctx = jest.fn(() => 'ctx')
    const o = withStoreHooks(actual, {
      useContext: ctx as unknown as typeof actual.useContext
    })
    expect(o.useContext(actual.createContext(0))).toBe('ctx')
    expect(o.createElement).toBe(actual.createElement)
    expect(o.Fragment).toBe(actual.Fragment)
  })
})
