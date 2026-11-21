/**
 * D-02, the one-way door, proven (Phase 85 plan 11, FND-06). Once Rust writes a store version newer
 * than the TS stack understands, the TS fallback (`GAMELIB_STORE=ts`, the conf-backed owner) opens
 * that file read-only through the Phase 68 refuse-newer rule. There is no restore-from-backup path
 * and no new downgrade code: the fallback must leave the file exactly as Rust wrote it, never
 * rewriting, resetting or deleting it. These cases hold that line for both a cache and a
 * user-state store, and for every write shape a store offers.
 */
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import GameLibStore from '../../store_backend'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import { resolveStoreMode } from '../storeOwnership'
import type { StoreRoot } from '../storeRoot'

let userData: string
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'gamelib-store-fallback-'))
  // The engine reports a newer file on stderr; the cases read the aggregate, not the log.
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
})
afterEach(() => {
  jest.restoreAllMocks()
  rmSync(userData, { recursive: true, force: true })
})

/** A file as Rust writes it: tab-indented, the version envelope stamped one above the chain. */
function plantNewer(root: StoreRoot, storeKey: string): string {
  const current = root.versioning.currentVersionOf(storeKey)
  const file = join(userData, `${storeKey}.json`)
  mkdirSync(join(file, '..'), { recursive: true })
  const bytes = JSON.stringify(
    {
      '480': { title: 'written by a newer GameLib' },
      __internal__: { gamelib: { schemaVersion: current + 1 } }
    },
    undefined,
    '\t'
  )
  writeFileSync(file, bytes)
  return file
}

/** Every file under `dir`, with its bytes and mtime: what "nothing was rewritten or deleted" compares. */
function snapshot(dir: string): Map<string, { bytes: string; mtime: number }> {
  const out = new Map<string, { bytes: string; mtime: number }>()
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else {
        out.set(full, {
          bytes: readFileSync(full, 'utf8'),
          mtime: statSync(full).mtimeMs
        })
      }
    }
  }
  walk(dir)
  return out
}

describe('the TS fallback and a store file one version above its chain (D-02)', () => {
  const tsRoot = () =>
    createTestStoreRoot(userData, {
      storeMode: resolveStoreMode({ GAMELIB_STORE: 'ts' })
    })

  it('GAMELIB_STORE=ts resolves to the ts owner', () => {
    expect(resolveStoreMode({ GAMELIB_STORE: 'ts' })).toBe('ts')
    expect(tsRoot().storeMode).toBe('ts')
  })

  it.each([
    ['a cache', 'store_cache/wikigameinfo', 'cache'],
    ['a user-state store', 'store/config', 'user-state']
  ] as const)(
    'opens %s read-only and every write leaves the file byte for byte as it was',
    (_label, storeKey, kind) => {
      const root = tsRoot()
      const file = plantNewer(root, storeKey)
      const before = snapshot(userData)
      const bytesBefore = readFileSync(file, 'utf8')
      const [dir, name] = storeKey.split('/') as [string, string]

      const store = new GameLibStore({
        root,
        cwd: dir,
        name,
        declaration: { kind },
        clearInvalidConfig: true
      })
      expect(store.readOnly).toBe(true)
      expect(root.readOnly.list()).toEqual([
        expect.objectContaining({ storeKey, reason: 'newer' })
      ])

      store.set('480', { title: 'overwritten' })
      store.set('another', 1)
      store.set('480.title', 'x')
      store.delete('480')
      store.clear()
      store.store = { replaced: true }
      store.reset()

      expect(readFileSync(file, 'utf8')).toBe(bytesBefore)
      // Nothing else was written, deleted, backed up or touched.
      expect(snapshot(userData)).toEqual(before)
    }
  )

  it('never resets the file when it is opened again, by a second store or a second root', () => {
    const first = tsRoot()
    const file = plantNewer(first, 'store_cache/wikigameinfo')
    const bytesBefore = readFileSync(file, 'utf8')
    for (const root of [first, tsRoot()]) {
      const store = new GameLibStore({
        root,
        cwd: 'store_cache',
        name: 'wikigameinfo',
        declaration: { kind: 'cache' },
        clearInvalidConfig: true
      })
      expect(store.readOnly).toBe(true)
      store.set('k', 1)
    }
    expect(readFileSync(file, 'utf8')).toBe(bytesBefore)
  })

  it('treats a file at the chain’s current version as writable, so the refusal is about the version and nothing else', () => {
    const root = tsRoot()
    const current = root.versioning.currentVersionOf('store_cache/wikigameinfo')
    const file = join(userData, 'store_cache', 'wikigameinfo.json')
    mkdirSync(join(userData, 'store_cache'), { recursive: true })
    writeFileSync(
      file,
      JSON.stringify(
        { __internal__: { gamelib: { schemaVersion: current } } },
        undefined,
        '\t'
      )
    )
    const store = new GameLibStore({
      root,
      cwd: 'store_cache',
      name: 'wikigameinfo',
      declaration: { kind: 'cache' }
    })
    expect(store.readOnly).toBe(false)
    store.set('k', 1)
    expect(JSON.parse(readFileSync(file, 'utf8')).k).toBe(1)
  })
})
