/**
 * Manual mock for `backend/store_backend` (Phase 35 Plan 05 — renamed from
 * `__mocks__/electron-store.ts` when D-04 removed `electron-store`).
 *
 * Subclasses the REAL shim and gives a store built with no root one rooted at the jest-contained
 * userData. For the whole `Backend` jest project, `jest.setupContainment.ts` has already redirected
 * `os.homedir()` and `HOME`/`APPDATA`/`XDG_*` into a disposable per-test-file root, so that userData
 * is itself throwaway.
 *
 * Until Phase 85 plan 21 this mock also forced every `cwd` under a `jest_store_root/` subdirectory.
 * Every store is now a mirror whose file the shell writes at the store table's own path
 * (`<userData>/<store key>.json`), and a store anywhere else is refused, so the redirect is gone; the
 * disposable userData is the isolation.
 */

import type RealStore from '../store_backend'
import type { StoreRoot } from '../stores/storeRoot'

const OriginalStore = jest.requireActual('../store_backend').default

/** The facade's own constructor options (`declaration` and `root` included), so the mock never drifts from it. */
type FacadeOptions<T extends Record<string, unknown>> = NonNullable<
  ConstructorParameters<typeof RealStore<T>>[0]
>

// A suite that builds a store with no root gets one rooted at the jest-contained userData. Its
// frame sink is the in-process disk sink (`testUtils/diskStoreSink.ts`), so a store the shell owns
// still writes its file here and reads it back.
let defaultRoot: StoreRoot | undefined
function fallbackRoot(): StoreRoot {
  const { createTestStoreRoot } = jest.requireActual(
    '../testUtils/testStoreRoot'
  )
  defaultRoot ??= createTestStoreRoot()
  return defaultRoot as StoreRoot
}

export default class Store<
  T extends Record<string, unknown> = Record<string, unknown>
> extends OriginalStore<T> {
  constructor(options?: FacadeOptions<T>) {
    super({
      ...(options ?? {}),
      root: options?.root ?? fallbackRoot()
    })
  }
}
