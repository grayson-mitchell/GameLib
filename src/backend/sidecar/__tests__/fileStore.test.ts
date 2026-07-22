/**
 * Unit suite for the sidecar's `fileStore.ts` (Phase 29 Plan 01 — Task 2).
 *
 * TOKEN-WIPE SAFETY (non-negotiable): this suite MUST never resolve a store
 * path under the developer's real `~/Library/Application Support/GameLib`.
 * A previous suite did exactly that and wiped a live Steam refresh token
 * (fixed in commit 92c29a5e); an `afterAll` restore is NOT a safety net
 * because jest force-exits workers. Mirrors the `os` module mock's homedir
 * override from `skeletonFlows.test.ts`, redirecting `homedir()` to a
 * disposable per-process tmp directory before `fileStore`/`pathShim` are ever
 * imported.
 */

import { join } from 'path'

jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-filestore-test-home-${process.pid}`)
  }
})

// ── Imports AFTER the os mock ────────────────────────────────────────────────
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { getPath } from '../pathShim'
import FileStore, { __resetFileStoreRegistry } from '../fileStore'

describe('sidecar fileStore', () => {
  beforeEach(() => {
    __resetFileStoreRegistry()
  })

  it('same-path collision: two instances at the same resolved path share data (REQ-29-06)', () => {
    // Mirrors the real steamConfigStore/steamBottleConfigStore construction —
    // neither passes `name`, so both resolve to steam_store/config.json.
    const first = new FileStore({ cwd: 'steam_store' })
    const second = new FileStore({ cwd: 'steam_store' })

    first.set('fromFirst', 'alpha')
    second.set('fromSecond', 'beta')

    expect(first.get('fromFirst')).toBe('alpha')
    expect(first.get('fromSecond')).toBe('beta')
    expect(second.get('fromFirst')).toBe('alpha')
    expect(second.get('fromSecond')).toBe('beta')

    // Both keys must actually be ON DISK, not just shared in-memory — prove
    // it by resetting the registry (simulating a fresh process) and
    // constructing a third instance.
    __resetFileStoreRegistry()
    const third = new FileStore({ cwd: 'steam_store' })
    expect(third.get('fromFirst')).toBe('alpha')
    expect(third.get('fromSecond')).toBe('beta')
  })

  it('options.defaults: unset keys read back as the default, on-disk values win', () => {
    const cwd = 'defaults_test'

    // Seed an on-disk value for `existing` before constructing with defaults.
    const seeded = new FileStore({ cwd })
    seeded.set('existing', 'on-disk-value')
    __resetFileStoreRegistry()

    const store = new FileStore({
      cwd,
      defaults: { existing: 'default-value', onlyInDefaults: 'default-only' }
    })

    expect(store.get('onlyInDefaults')).toBe('default-only')
    expect(store.get('existing')).toBe('on-disk-value')
  })

  it('atomic persist: no temp file remains after a set, and the on-disk JSON parses', () => {
    const cwd = 'atomic_persist_test'
    const store = new FileStore({ cwd })
    store.set('key', 'value')

    const dir = join(getPath('userData'), cwd)
    const entries = readdirSync(dir)
    const tmpFiles = entries.filter((f) => f.includes('.tmp-'))
    expect(tmpFiles).toEqual([])

    const configFile = entries.find((f) => f === 'config.json')
    expect(configFile).toBeDefined()
    const raw = readFileSync(join(dir, configFile as string), 'utf-8')
    expect(() => JSON.parse(raw)).not.toThrow()
    expect(JSON.parse(raw)).toEqual({ key: 'value' })
  })

  it('dot-notation: set/get/has/delete traverse nested paths', () => {
    const store = new FileStore({ cwd: 'dot_notation_test' })

    store.set('a.b.c', 1)
    expect(store.get('a.b.c')).toBe(1)
    expect(store.has('a.b')).toBe(true)
    expect(store.has('a.b.c')).toBe(true)

    store.delete('a.b.c')
    expect(store.has('a.b.c')).toBe(false)
    expect(store.get('a.b.c')).toBeUndefined()
  })

  it('cache.ts surface (D-11): clear/store getter-setter/iterator all work', () => {
    const store = new FileStore({
      cwd: 'store_cache',
      name: 'test_cache',
      clearInvalidConfig: true
    })

    store.set('one', 1)
    store.set('two', 2)

    expect([...store]).toEqual(
      expect.arrayContaining([
        ['one', 1],
        ['two', 2]
      ])
    )

    store.store = { replaced: true }
    expect(store.get('replaced')).toBe(true)
    expect(store.has('one')).toBe(false)

    store.clear()
    expect(store.store).toEqual({})
    expect([...store]).toEqual([])
  })

  it('CR-01: a `__proto__` key path segment cannot pollute Object.prototype', () => {
    const store = new FileStore({ cwd: 'proto_pollution_test' })

    // The exact renderer-reachable payload from the review's verified chain:
    // window.api.storeSet('timestampStore', '__proto__.polluted', 'PWNED').
    store.set('__proto__.polluted', 'PWNED')
    store.set('constructor.prototype.polluted', 'PWNED')
    store.set('prototype.polluted', 'PWNED')

    expect(
      ({} as Record<string, unknown>)['polluted']
    ).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
    // The rejected write must also not land anywhere in the store's own data.
    expect(store.store).toEqual({})

    // Reads and deletes are guarded too — neither may traverse the chain.
    expect(store.get('__proto__.polluted')).toBeUndefined()
    expect(store.has('constructor')).toBe(false)
    expect(() => store.delete('__proto__.polluted')).not.toThrow()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('corrupt file: invalid on-disk JSON yields an empty store instead of throwing', () => {
    const cwd = 'corrupt_file_test'
    const dir = join(getPath('userData'), cwd)
    // Force the directory to exist, then write invalid JSON directly, mimicking
    // a crash mid-write BEFORE this file's atomic-persist fix existed.
    const store = new FileStore({ cwd })
    store.set('bootstrap', true) // ensures dir exists
    const filePath = join(dir, 'config.json')
    expect(existsSync(filePath)).toBe(true)
    writeFileSync(filePath, '{ not valid json ')

    __resetFileStoreRegistry()
    expect(() => new FileStore({ cwd })).not.toThrow()
    const reloaded = new FileStore({ cwd })
    expect(reloaded.store).toEqual({})
  })
})
