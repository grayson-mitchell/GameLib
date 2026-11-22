/**
 * Phase 68 plan 04 (D-03, D-06): a read-only store takes no write and announces none, and
 * the `__internal__` version key is invisible outside the engine.
 *
 * Uses the REAL store stack (no `store_backend` mock). The backend jest project redirects
 * HOME/APPDATA/XDG_* to a disposable root, so the userData dir never touches the
 * real profile. Since 85-21 (D-03) every store is a mirror: a store is read-only because the
 * shell said so at boot (`GAMELIB_STORE_BOOT`, the root's `boot`), and the renderer's writes are
 * checked in Rust (`store_native.rs`), so the old TS write choke point's cases are the shell's.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import CacheStore from '../cache'
import { TypeCheckedStoreBackend } from '../typed_store'
import {
  createTestStoreRoot,
  testUserDataDir
} from '../testUtils/testStoreRoot'
import type { StoreChangedPayload } from 'common/types/sidecarTransport'

// A fresh root per test (engine, tracker and cells included): its userData is the jest-contained
// profile the fixtures are written to.
let root = createTestStoreRoot()

const cacheDir = () => join(testUserDataDir(), 'store_cache')
const fixture = (name: string, body: unknown) => {
  mkdirSync(cacheDir(), { recursive: true })
  const p = join(cacheDir(), `${name}.json`)
  writeFileSync(p, JSON.stringify(body))
  return p
}
const v = (data: Record<string, unknown>, n: number) => ({
  ...data,
  __internal__: { gamelib: { schemaVersion: n } }
})
/** A root on which the shell reported `storeKeys` read-only (newer) at boot. */
const readOnlyRoot = (...storeKeys: string[]) => {
  const r = createTestStoreRoot(undefined, {
    boot: {
      readOnly: new Map(storeKeys.map((k) => [k, 'newer' as const])),
      startEmpty: new Set()
    }
  })
  r.changes.bind((p) => pushed.push(p))
  return r
}
const typed = (name: string, extra: Record<string, unknown> = {}) =>
  new TypeCheckedStoreBackend(
    'timestampStore',
    { cwd: 'store_cache', name, ...extra } as never,
    { kind: 'user-state' },
    { root }
  )

let stderr: jest.SpyInstance
let pushed: StoreChangedPayload[]
const frontendPush = jest.fn()
const lines = () => stderr.mock.calls.map((c) => String(c[0]))

beforeEach(() => {
  root = createTestStoreRoot()
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  pushed = []
  root.changes.bind((p) => pushed.push(p))
  frontendPush.mockReset()
})
afterEach(() => {
  root.changes.bind(null)
  stderr.mockRestore()
})

describe('read-only typed store', () => {
  test('set, delete, clear change nothing and notify nothing', () => {
    const p = fixture('sr_typed1', v({ k: 1 }, 99))
    const before = readFileSync(p)
    root = readOnlyRoot('store_cache/sr_typed1')
    const s = typed('sr_typed1')
    expect(s.readOnly).toBe(true)
    s.set('k', 2 as never)
    s.delete('k')
    s.clear()
    expect(readFileSync(p).equals(before)).toBe(true)
    expect(pushed).toHaveLength(0)
  })

  test('reserved key set/delete are refused with no write and no notify', () => {
    const p = fixture('sr_typed2', v({ k: 1 }, 1))
    const before = readFileSync(p)
    const s = typed('sr_typed2')
    expect(s.readOnly).toBe(false)
    s.set('__internal__', { gamelib: { schemaVersion: 0 } } as never)
    s.set('__internal__.gamelib.schemaVersion', 0 as never)
    s.delete('__internal__')
    expect(readFileSync(p).equals(before)).toBe(true)
    expect(pushed).toHaveLength(0)
    expect(
      lines().filter((l) => l.includes('refusing reserved key'))
    ).toHaveLength(3)
  })

  test('raw_store omits __internal__, including dot-notation-off stores', () => {
    fixture('sr_typed3', v({ k: 1 }, 1))
    expect(Object.keys(typed('sr_typed3').raw_store)).toEqual(['k'])

    fixture('sr_typed4', v({ 'https://x.example/log': { uploadedAt: 1 } }, 1))
    const logs = typed('sr_typed4', { accessPropertiesByDotNotation: false })
    expect(Object.keys(logs.raw_store)).toEqual(['https://x.example/log'])
  })
})

describe('read-only CacheStore', () => {
  test('set, delete, clear and in-memory commit write and notify nothing', () => {
    const p = fixture('sr_cache1', v({ a: 1 }, 99))
    const before = readFileSync(p)
    root = readOnlyRoot('store_cache/sr_cache1')
    const c = new CacheStore<number>('sr_cache1', null, {
      root,
      kind: 'user-state'
    })
    expect(c.readOnly).toBe(true)
    c.set('a', 2)
    c.delete('a')
    expect(() => c.clear()).not.toThrow()
    c.use_in_memory()
    c.set('b', 3)
    expect(c.get('b')).toBe(3)
    c.commit()
    expect(readFileSync(p).equals(before)).toBe(true)
    expect(pushed).toHaveLength(0)
  })

  test('entries never yields __internal__, file-backed or in memory', () => {
    const c = new CacheStore<number>('sr_cache2', null, {
      root,
      kind: 'user-state'
    })
    c.set('a', 1)
    const disk = JSON.parse(
      readFileSync(join(cacheDir(), 'sr_cache2.json'), 'utf8')
    )
    expect(disk.__internal__).toBeDefined()
    expect(c.entries().map(([k]) => k)).toEqual(['a'])
    c.use_in_memory()
    expect(c.entries().map(([k]) => k)).toEqual(['a'])
    c.commit()
  })
})
