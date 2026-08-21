/**
 * Regression suite for the sidecar-write -> renderer store-change notification seam.
 *
 * The defect these tests pin (live-confirmed 2026-08-03,
 * `.planning/debug/gog-login-ui-never-updates.md`): Phase 29 D-06's
 * `STORE_CHANGED_CHANNEL` only ever fired for writes the RENDERER initiated. Writes the
 * SIDECAR performed — every backend store manager, e.g. `GOGLibraryManager` persisting a
 * freshly-fetched library — went straight to disk and announced nothing, so the renderer's
 * synchronous snapshot kept its pre-write value for the life of the window. Observable
 * result: a GOG login persisted 7 games while the Library rendered none, with zero errors
 * logged, until an app restart re-hydrated the snapshot.
 *
 * These tests assert the WRITE side (that the store classes announce) and the leak guard.
 * The renderer's handling of `invalidated` is pinned separately in
 * `src/preload/__tests__/tauriTransport.test.ts`.
 */

import Store from 'electron-store'

import CacheStore from '../cache'
import { TypeCheckedStoreBackend } from '../electron_store'
import {
  hasStoreChangeNotifier,
  notifyStoreChanged,
  notifyStoreInvalidated,
  setStoreChangeNotifier,
  withStoreChangeSuppressed
} from '../storeChangeNotifier'
import { installedGamesStore } from '../storeManagers/gog/electronStores'
import { isAllowedStoreField } from 'common/types/storePolicy'
import type { StoreChangedPayload } from 'common/types/sidecarTransport'

jest.mock('electron-store')

describe('backend/storeChangeNotifier.ts', () => {
  let pushed: StoreChangedPayload[]

  beforeEach(() => {
    pushed = []
    setStoreChangeNotifier((payload) => pushed.push(payload))
  })

  // Module-level state shared across suites — a leaked notifier would make unrelated
  // suites push into a dead array (or a previous suite's array).
  afterEach(() => setStoreChangeNotifier(null))

  describe('the seam itself', () => {
    test('is a no-op when no notifier is installed — the Electron case', () => {
      setStoreChangeNotifier(null)
      expect(hasStoreChangeNotifier()).toBe(false)
      expect(() =>
        notifyStoreChanged({ store: 'configStore', key: 'foo', value: 1 })
      ).not.toThrow()
      expect(pushed).toHaveLength(0)
    })

    test('a throwing notifier never propagates into the caller', () => {
      // The write has already succeeded by the time we notify. A failed notification must
      // degrade to a stale snapshot (the pre-fix behaviour), never to a failed write.
      setStoreChangeNotifier(() => {
        throw new Error('transport is down')
      })
      expect(() =>
        notifyStoreChanged({ store: 'configStore', key: 'foo', value: 1 })
      ).not.toThrow()
    })

    test('notifyStoreInvalidated marks the whole store, with no meaningful key', () => {
      notifyStoreInvalidated('gog_library')
      expect(pushed).toEqual([
        { store: 'gog_library', key: '', invalidated: true }
      ])
    })

    test('withStoreChangeSuppressed silences notifications inside it only', () => {
      // Prevents the double-push `skeletonFlows.test.ts` caught: `applyStoreWrite`
      // performs its write THROUGH these store classes and then pushes a richer payload
      // itself, so the class-level notification must stay quiet for that one write.
      const store = new CacheStore<string>('gog_library')
      pushed = []

      withStoreChangeSuppressed(() => store.set('games', 'inner'))
      expect(pushed).toHaveLength(0)

      store.set('games', 'outer')
      expect(pushed.length).toBeGreaterThan(0)
    })

    test('suppression nests without an inner scope re-enabling the outer', () => {
      // Why the flag is a counter and not a boolean.
      const store = new CacheStore<string>('gog_library')
      pushed = []

      withStoreChangeSuppressed(() => {
        withStoreChangeSuppressed(() => store.set('a', '1'))
        store.set('b', '2')
      })

      expect(pushed).toHaveLength(0)
    })

    test('suppression is released even when the wrapped write throws', () => {
      expect(() =>
        withStoreChangeSuppressed(() => {
          throw new Error('disk full')
        })
      ).toThrow('disk full')

      pushed = []
      notifyStoreChanged({ store: 'configStore', key: 'theme', value: 'x' })
      expect(pushed).toHaveLength(1)
    })
  })

  describe('CacheStore — the class that persists the runner libraries', () => {
    test('set announces BOTH the value and its __timestamp', () => {
      // Load-bearing, and the reason a value-only push would have silently failed to fix
      // anything: the renderer's mirror (`frontend/helpers/electronStores.ts`
      // `CacheStore.get`) returns the caller fallback unless `storeHas(key)` AND
      // `storeGet('__timestamp.' + key)` BOTH resolve. Announce only the value and the
      // renderer still renders nothing.
      const store = new CacheStore<string>('gog_library')
      pushed = []

      store.set('games', 'seven-titles')

      expect(pushed).toHaveLength(2)
      expect(pushed[0]).toMatchObject({
        store: 'gog_library',
        key: 'games',
        value: 'seven-titles'
      })
      expect(pushed[1]).toMatchObject({
        store: 'gog_library',
        key: '__timestamp.games'
      })
      expect(pushed[1].value).toBeTruthy()
    })

    test('delete announces both keys as deleted', () => {
      const store = new CacheStore<string>('gog_library')
      store.set('games', 'x')
      pushed = []

      store.delete('games')

      expect(pushed).toEqual([
        { store: 'gog_library', key: 'games', deleted: true },
        { store: 'gog_library', key: '__timestamp.games', deleted: true }
      ])
    })

    test('clear announces a whole-store invalidation, not per-key deletes', () => {
      // A per-key encoding cannot express the removals, so the renderer would keep every
      // stale key. Same failure WR-07 fixed for hydrateStore by replacing, not merging.
      const store = new CacheStore<string>('nile_library')
      store.set('library', 'x')
      pushed = []

      store.clear()

      expect(pushed).toEqual([
        { store: 'nile_library', key: '', invalidated: true }
      ])
    })

    test('in-memory writes announce NOTHING until commit', () => {
      // use_in_memory() batches into a Map that has not reached disk. Announcing there
      // would make the renderer's snapshot claim a value the sidecar has not persisted —
      // divergence in the opposite direction.
      const store = new CacheStore<string>('legendary_library')
      store.use_in_memory()
      pushed = []

      store.set('library', 'a')
      store.set('other', 'b')
      expect(pushed).toHaveLength(0)

      store.commit()

      expect(pushed).toEqual([
        { store: 'legendary_library', key: '', invalidated: true }
      ])
    })

    test('commit on a store that never went in-memory announces nothing', () => {
      const store = new CacheStore<string>('gog_library')
      pushed = []
      store.commit()
      expect(pushed).toHaveLength(0)
    })
  })

  describe('TypeCheckedStoreBackend — the named stores', () => {
    test('set and delete announce with the store NAME, not its filename', () => {
      // REQ-29-01: the ValidStoreName is not the on-disk filename. The renderer knows the
      // store by its name, and `StoreChangedPayload.store` must carry that identity.
      //
      // Uses `zoomInstalledGamesStore` (same shape as `gogInstalledGamesStore`, and NOT
      // the store this generic test is really about) rather than a locally-constructed
      // `gogInstalledGamesStore` instance — the `gogInstalledGamesStore` describe block
      // below imports the PRODUCTION `installedGamesStore` singleton instead, and a second,
      // locally-constructed instance under the same `ValidStoreName` would trip
      // `TypeCheckedStoreBackend`'s own WR-08 duplicate-registration guard.
      const store = new TypeCheckedStoreBackend('zoomInstalledGamesStore', {
        cwd: 'zoom_store',
        name: 'installed'
      })
      pushed = []

      store.set('installed', [] as never)
      store.delete('installed')

      expect(pushed).toEqual([
        { store: 'zoomInstalledGamesStore', key: 'installed', value: [] },
        { store: 'zoomInstalledGamesStore', key: 'installed', deleted: true }
      ])
    })

    test('clear announces a whole-store invalidation', () => {
      const store = new TypeCheckedStoreBackend('sideloadedStore', {
        cwd: 'store'
      })
      pushed = []

      store.clear()

      expect(pushed).toEqual([
        { store: 'sideloadedStore', key: '', invalidated: true }
      ])
    })

    test('a write that THROWS does not announce', () => {
      // Announcing a failed write would cache a value in the renderer that is not on
      // disk — precisely the divergence this whole mechanism exists to prevent.
      //
      // The electron-store mock (`src/backend/__mocks__/electron-store.ts`) is a real
      // subclass writing to a tmp dir, not a jest.fn, so the failure has to be injected
      // on the prototype the instance actually inherits `set` from.
      const store = new TypeCheckedStoreBackend('configStore', { cwd: 'store' })
      const spy = jest
        .spyOn(Object.getPrototypeOf(Store.prototype), 'set')
        .mockImplementation(() => {
          throw new Error('disk full')
        })
      pushed = []

      try {
        expect(() => store.set('foo', 'bar' as never)).toThrow('disk full')
        expect(pushed).toHaveLength(0)
      } finally {
        spy.mockRestore()
      }
    })
  })

  // GAP CYCLE 6 (34.5-46 Task 3): settles whether commit eb117d9e4 already covers the
  // 34.5-UAT.md gap "uninstall completes in the backend but the tile still reads
  // installed". Three links chain GOGGame.uninstall to the renderer push:
  //   (1) GOGGame.uninstall writes through installedGamesStore.set('installed', …)
  //       (gog/games.ts:986) — verified by direct source read, not re-proven here.
  //   (2) that store is a TypeCheckedStoreBackend, whose set() announces via
  //       notifyStoreChanged (electron_store.ts:113) — covered by the positive case below.
  //   (3) pushStoreChanged forwards it only if isAllowedStoreField('gogInstalledGamesStore',
  //       'installed') — the one link that could still silently DROP the push, and the
  //       reason this task exists rather than a paper assertion. Covered by both the
  //       positive and negative cases below.
  //
  // Imports the PRODUCTION `installedGamesStore` singleton (not a locally-constructed
  // `TypeCheckedStoreBackend('gogInstalledGamesStore', …)` — see the note on the
  // `zoomInstalledGamesStore` test above for why a second instance under the same
  // ValidStoreName would trip WR-08's duplicate-registration guard) so link (2) is
  // verified against the exact instance GOGGame.uninstall itself calls.
  describe('gogInstalledGamesStore — production store, three-link uninstall→renderer chain', () => {
    test('link 2: writing through the production installedGamesStore announces store===gogInstalledGamesStore, key===installed', () => {
      pushed = []

      installedGamesStore.set('installed', [])

      expect(pushed).toEqual([
        { store: 'gogInstalledGamesStore', key: 'installed', value: [] }
      ])
    })

    test('link 2: delete announces the same store/key identity', () => {
      installedGamesStore.set('installed', [])
      pushed = []

      installedGamesStore.delete('installed')

      expect(pushed).toEqual([
        { store: 'gogInstalledGamesStore', key: 'installed', deleted: true }
      ])
    })

    test("link 3 (positive): isAllowedStoreField('gogInstalledGamesStore', 'installed') is true — pushStoreChanged does not drop the payload link 2 just produced", () => {
      expect(isAllowedStoreField('gogInstalledGamesStore', 'installed')).toBe(
        true
      )
    })

    test("link 3 (negative, non-vacuous): isAllowedStoreField('gogInstalledGamesStore', 'credentials') is false — a secret-shaped field on this store IS dropped", () => {
      expect(isAllowedStoreField('gogInstalledGamesStore', 'credentials')).toBe(
        false
      )
    })
  })
})
