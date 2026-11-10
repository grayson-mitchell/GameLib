/**
 * Node-env helper letting a real zustand selector hook run inside a component
 * test that already mocks `react` (the repo has no jsdom).
 *
 * Intended use is INSIDE an existing mock factory of a test file that already
 * mocks react, so no extra `jest.mock` call is added (Phase 69 R3):
 *
 *   jest.mock('react', () =>
 *     require('frontend/testUtils/storeHookReact').withStoreHooks(
 *       jest.requireActual('react'), { ... }))
 *
 * The mock must be declared textually before the component and before zustand
 * is first imported: the use-sync-external-store with-selector shim captures
 * React hooks at its own import time.
 *
 * Seed the real store with `useXState.setState(fixture)`; the component's real
 * store hook then reads it.
 */
type React = typeof import('react')

export function withStoreHooks(
  actualReact: React,
  // Loose on purpose: test harnesses hand in slot-based fakes whose
  // signatures are narrower than React's overloaded hook types.
  overrides: Record<string, unknown> = {}
): React {
  const noop = () => undefined
  return {
    ...actualReact,
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) =>
      getSnapshot(),
    useRef: (value: unknown) => ({ current: value }),
    useMemo: (fn: () => unknown) => fn(),
    useCallback: (fn: unknown) => fn,
    useEffect: noop,
    useLayoutEffect: noop,
    useInsertionEffect: noop,
    useDebugValue: noop,
    ...overrides
  } as unknown as React
}
