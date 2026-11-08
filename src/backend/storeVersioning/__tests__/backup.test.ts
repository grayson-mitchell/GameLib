import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'graceful-fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  atomicWritePrivate,
  listBackups,
  writePreMigrationBackup
} from '../backup'

const posix = process.platform !== 'win32'
const mode = (p: string) => statSync(p).mode & 0o777
const root = () => mkdtempSync(join(tmpdir(), 'gl68-backup-'))

let tick = 0
const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, tick++))

describe('atomicWritePrivate', () => {
  test('writes content at 0o600 and creates a missing parent at 0o700', () => {
    const base = root()
    const p = join(base, 'sub', 'a.json')
    atomicWritePrivate(p, '{"a":1}')
    expect(readFileSync(p, 'utf-8')).toBe('{"a":1}')
    if (posix) {
      expect(mode(p)).toBe(0o600)
      expect(mode(join(base, 'sub'))).toBe(0o700)
    }
  })

  test('leaves an existing parent directory mode alone', () => {
    if (!posix) return
    const base = root()
    const dir = join(base, 'existing')
    mkdirSync(dir, { mode: 0o755 })
    atomicWritePrivate(join(dir, 'a.json'), 'x')
    expect(mode(dir)).toBe(0o755)
  })

  test('leaves no temp file behind', () => {
    const base = root()
    atomicWritePrivate(join(base, 'a.json'), 'x')
    expect(readdirSync(base).filter((f) => f.includes('.tmp-'))).toEqual([])
  })
})

describe('writePreMigrationBackup', () => {
  test('writes a named 0o600 backup with identical bytes', () => {
    const store = join(root(), 'config.json')
    const bytes = Buffer.from('{"a":1}')
    const out = writePreMigrationBackup(store, 0, bytes, clock)
    expect(out).toMatch(/config\.v0\.\d{8}T\d{9}Z\.bak\.json$/)
    expect(readFileSync(out).equals(bytes)).toBe(true)
    if (posix) expect(mode(out)).toBe(0o600)
  })

  test('keeps only the newest 3, deleting the oldest', () => {
    const store = join(root(), 'config.json')
    const outs = [1, 2, 3, 4].map((i) =>
      writePreMigrationBackup(store, 0, Buffer.from(`d${i}`), clock)
    )
    const left = listBackups(store)
    expect(left).toHaveLength(3)
    expect(left).toEqual(outs.slice(1))
    expect(existsSync(outs[0] as string)).toBe(false)
  })

  test('skips a backup identical to the newest', () => {
    const store = join(root(), 'config.json')
    const a = writePreMigrationBackup(store, 0, Buffer.from('same'), clock)
    const b = writePreMigrationBackup(store, 0, Buffer.from('same'), clock)
    expect(b).toBe(a)
    expect(listBackups(store)).toHaveLength(1)
  })

  test('never prunes files outside the store backup pattern', () => {
    const base = root()
    const store = join(base, 'config.json')
    const keep = [
      'other.v0.20260101T000000000Z.bak.json',
      'config.json',
      'config.v0.bak.json.extra'
    ]
    for (const k of keep) writeFileSync(join(base, k), 'x')
    for (let i = 0; i < 5; i++) {
      writePreMigrationBackup(store, 0, Buffer.from(`d${i}`), clock)
    }
    for (const k of keep) expect(existsSync(join(base, k))).toBe(true)
    expect(listBackups(store)).toHaveLength(3)
  })

  test('refuses a store path with no usable name', () => {
    const base = root()
    expect(() =>
      writePreMigrationBackup(base + '/..', 0, Buffer.from('x'), clock)
    ).toThrow()
    expect(readdirSync(base)).toEqual([])
  })
})
