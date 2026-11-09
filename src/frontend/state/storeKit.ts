import { useShallow } from 'zustand/react/shallow'
import type { Mutate, StoreApi, UseBoundStore } from 'zustand'

/**
 * Shared helper for the Phase 69 domain stores (D-01, D-08, D-11).
 *
 * Each store is built with `create<S>()(subscribeWithSelector(...))` and then
 * wrapped with {@link bindStoreHooks}, which generalises the pre-Phase-69 UI store's
 * selector hook. Unlike that store's default export (an object spread, so
 * not callable), the result here IS callable.
 *
 * Persistence middleware is not used anywhere (D-02).
 */

/** A store created with `subscribeWithSelector`, as returned by `create()`. */
type RawStore<S> = UseBoundStore<
  Mutate<StoreApi<S>, [['zustand/subscribeWithSelector', never]]>
>

export type StoreHooks<S> = {
  <T>(selector: (state: S) => T): T
  keys: <Keys extends (keyof S)[]>(...keys: Keys) => Pick<S, Keys[number]>
  setState: StoreApi<S>['setState']
  getState: StoreApi<S>['getState']
  subscribe: RawStore<S>['subscribe']
}

export function bindStoreHooks<S>(useRaw: RawStore<S>): StoreHooks<S> {
  const useSelected = <T>(selector: (state: S) => T): T =>
    useRaw(useShallow(selector))

  const useKeys = <Keys extends (keyof S)[]>(
    ...keys: Keys
  ): Pick<S, Keys[number]> =>
    useSelected(
      (state) =>
        Object.fromEntries(keys.map((key) => [key, state[key]])) as Pick<
          S,
          Keys[number]
        >
    )

  return Object.assign(useSelected, {
    keys: useKeys,
    setState: useRaw.setState,
    getState: useRaw.getState,
    subscribe: useRaw.subscribe
  })
}

const registry = new Set<RawStore<never>>()

/** Record a store so {@link resetAllStores} can restore it (D-11). */
export function registerStoreForReset<S>(useRaw: RawStore<S>): void {
  registry.add(useRaw as unknown as RawStore<never>)
}

/** Restore every registered store to its creation snapshot (tests). */
export function resetAllStores(): void {
  for (const store of registry) {
    const raw = store as unknown as RawStore<unknown>
    raw.setState(raw.getInitialState(), true)
  }
}
