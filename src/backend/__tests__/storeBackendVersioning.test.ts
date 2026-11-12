import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import GameLibStore from '../store_backend'
import {
  createVersioningHarness,
  testUserDataDir,
  type VersioningHarness
} from '../testUtils/testStoreRoot'
import { listBackups } from '../storeVersioning/backup'

// A fresh root (engine, tracker, chain overrides) per test: nothing carries over.
let h: VersioningHarness
let root: VersioningHarness['root']
const readOnlyReasonOf = (path: string) => h.versioning.readOnlyReasonOf(path)

const userData = () => testUserDataDir()
const cacheDir = () => join(userData(), 'store_cache')
const fixture = (name: string, body: unknown, dir = cacheDir()) => {
  mkdirSync(dir, { recursive: true })
  const p = join(dir, `${name}.json`)
  writeFileSync(p, typeof body === 'string' ? body : JSON.stringify(body))
  return p
}
const v = (data: Record<string, unknown>, n: number) => ({
  ...data,
  __internal__: { gamelib: { schemaVersion: n } }
})

let stderr: jest.SpyInstance
const lines = () => stderr.mock.calls.map((c) => String(c[0]))
const posix = process.platform === 'win32' ? test.skip : test

beforeEach(() => {
  h = createVersioningHarness()
  root = h.root
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
})
afterEach(() => {
  stderr.mockRestore()
})

describe('GameLibStore versioning', () => {
  test('constructor defaults merge does not touch a newer file (Pitfall 1)', () => {
    const p = fixture('p1', v({ k: 1 }, 99))
    const before = readFileSync(p)
    new GameLibStore({
      root,
      cwd: 'store_cache',
      name: 'p1',
      defaults: { d: 1 },
      declaration: { kind: 'user-state' }
    })
    expect(readFileSync(p).equals(before)).toBe(true)
  })

  test('every write path is refused on a read-only store, one log line', () => {
    const p = fixture('p1', v({ k: 1 }, 99))
    const before = readFileSync(p)
    const s = new GameLibStore<Record<string, unknown>>({
      root,
      cwd: 'store_cache',
      name: 'p1',
      defaults: { d: 1 },
      declaration: { kind: 'user-state' }
    })
    s.set('a', 1)
    s.delete('k')
    s.clear()
    s.reset('d')
    s.store = {}
    expect(readFileSync(p).equals(before)).toBe(true)
    expect(s.readOnly).toBe(true)
    expect(lines().filter((l) => l.includes('write refused'))).toHaveLength(1)
  })

  test('reads: user-state as-is, cache empty', () => {
    fixture('p1', v({ k: 'disk' }, 99))
    const u = new GameLibStore<Record<string, unknown>>({
      root,
      cwd: 'store_cache',
      name: 'p1',
      declaration: { kind: 'user-state' }
    })
    expect(u.get('k')).toBe('disk')

    fixture('p3c', v({ k: 'disk' }, 99))
    const c = new GameLibStore<Record<string, unknown>>({
      root,
      cwd: 'store_cache',
      name: 'p3c',
      declaration: { kind: 'cache' }
    })
    expect(c.store).toEqual({})
    expect(c.get('k')).toBeUndefined()
  })

  test('writes stamp the version; clear keeps it', () => {
    const s = new GameLibStore<Record<string, unknown>>({
      root,
      cwd: 'store_cache',
      name: 'p2',
      declaration: { kind: 'user-state' }
    })
    s.set('a', 1)
    const read = () =>
      JSON.parse(readFileSync(join(cacheDir(), 'p2.json'), 'utf8'))
    expect(read()).toMatchObject({
      a: 1,
      __internal__: { gamelib: { schemaVersion: 1 } }
    })
    s.clear()
    expect(read().__internal__.gamelib.schemaVersion).toBe(1)
  })

  test('migration runs before the first read', () => {
    h.setMigrations('store_cache/p5', [
      { id: 'p5-v1-v2', to: 2, run: (d) => ({ renamed: d.old }) }
    ])
    fixture('p5', v({ old: 7 }, 1))
    const s = new GameLibStore<Record<string, unknown>>({
      root,
      cwd: 'store_cache',
      name: 'p5',
      declaration: { kind: 'user-state' }
    })
    expect(s.get('renamed')).toBe(7)
    expect(s.get('old')).toBeUndefined()
  })

  test('shared path migrates once', () => {
    h.setMigrations('steam_store/config', [
      { id: 'sc-v1-v2', to: 2, run: (d) => ({ renamed: d.old }) }
    ])
    try {
      const p = fixture(
        'config',
        v({ old: 1 }, 1),
        join(userData(), 'steam_store')
      )
      const decl = { kind: 'user-state', tokenBearing: true } as const
      new GameLibStore({ root, cwd: 'steam_store', declaration: decl })
      new GameLibStore({ root, cwd: 'steam_store', declaration: decl })
      expect(listBackups(p)).toHaveLength(1)
    } finally {
      h.setMigrations('steam_store/config', undefined)
    }
  })

  posix('D-13 modes', () => {
    new GameLibStore<Record<string, unknown>>({
      root,
      cwd: 'fresh_dir',
      name: 'n',
      defaults: { a: 1 },
      declaration: { kind: 'user-state' }
    })
    expect(statSync(join(userData(), 'fresh_dir')).mode & 0o777).toBe(0o700)
    expect(statSync(join(userData(), 'fresh_dir', 'n.json')).mode & 0o777).toBe(
      0o600
    )

    const tokDir = join(userData(), 'tok_dir')
    const tok = fixture('config', { t: 1 }, tokDir)
    chmodSync(tok, 0o666)
    chmodSync(tokDir, 0o755)
    new GameLibStore({
      root,
      cwd: 'tok_dir',
      declaration: { kind: 'user-state', tokenBearing: true }
    })
    expect(statSync(tok).mode & 0o777).toBe(0o600)
    expect(statSync(tokDir).mode & 0o777).toBe(0o700)

    const plainDir = join(userData(), 'plain_dir')
    fixture('config', { t: 1 }, plainDir)
    chmodSync(plainDir, 0o755)
    new GameLibStore({
      root,
      cwd: 'plain_dir',
      declaration: { kind: 'user-state' }
    })
    expect(statSync(plainDir).mode & 0o777).toBe(0o755)
  })

  test('dynamic store without declaration refuses writes on a read-only path', () => {
    const p = fixture('p1', v({ k: 1 }, 99))
    const before = readFileSync(p)
    new GameLibStore({
      root,
      cwd: 'store_cache',
      name: 'p1',
      declaration: { kind: 'user-state' }
    })
    const dyn = new GameLibStore<Record<string, unknown>>({
      root,
      cwd: 'store_cache',
      name: 'p1'
    })
    dyn.set('x', 1)
    expect(dyn.readOnly).toBe(true)
    expect(readFileSync(p).equals(before)).toBe(true)
    expect(readOnlyReasonOf(p)).toBe('newer')
    expect(existsSync(p)).toBe(true)
  })
})
