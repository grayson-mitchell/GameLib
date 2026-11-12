import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  existsSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { storeKeyOf } from '../engine'
import { listBackups } from '../backup'
import { STORE_MIGRATIONS, storeVersionCodec } from '../../storeMigrations'
import {
  createVersioningHarness,
  type VersioningHarness
} from '../../testUtils/testStoreRoot'
import type { Migration, StoreDeclaration } from '../types'

const KEY = 'store_cache/probe'
const decl: StoreDeclaration = { kind: 'user-state' }
const cacheDecl: StoreDeclaration = { kind: 'cache' }

// One engine and read-only tracker per test (nothing carries over, as the module reset did).
let h: VersioningHarness
const setMigrations: VersioningHarness['setMigrations'] = (k, c) =>
  h.setMigrations(k, c)
const prepareStoreFile: VersioningHarness['versioning']['prepareStoreFile'] = (
  ...a
) => h.versioning.prepareStoreFile(...a)
const viewOf: VersioningHarness['versioning']['viewOf'] = (...a) =>
  h.versioning.viewOf(...a)
const stampForWrite: VersioningHarness['versioning']['stampForWrite'] = (
  ...a
) => h.versioning.stampForWrite(...a)
const listReadOnly = () => h.readOnly.list()

let root: string
let file: string
let stderr: jest.SpyInstance

const lines = () =>
  stderr.mock.calls.map((c) => String(c[0])).filter((l) => l.length > 0)

const versioned = (data: Record<string, unknown>, v: number) =>
  JSON.stringify({ ...data, __internal__: { gamelib: { schemaVersion: v } } })

const chain = (run: Migration['run'] = (d) => ({ renamed: d.old })) =>
  [{ id: 'probe-v1-v2', to: 2, run }] as const

const run = (declaration = decl) =>
  h.versioning.runFileMigration(file, {
    chainKey: KEY,
    declaration,
    codec: storeVersionCodec
  })

beforeEach(() => {
  h = createVersioningHarness()
  root = mkdtempSync(join(tmpdir(), 'engine-'))
  mkdirSync(join(root, 'store_cache'))
  file = join(root, 'store_cache', 'probe.json')
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  stderr.mockRestore()
  rmSync(root, { recursive: true, force: true })
})

describe('runFileMigration', () => {
  test('absent file is ok and creates nothing', () => {
    const s = run()
    expect(s.status).toBe('ok')
    expect(existsSync(file)).toBe(false)
  })

  test('adoption of an unversioned file is identity', () => {
    const body = JSON.stringify({ a: 1 })
    writeFileSync(file, body)
    const s = run()
    expect(s.status).toBe('ok')
    expect(readFileSync(file, 'utf8')).toBe(body)
    expect(listBackups(file)).toEqual([])
  })

  test('real migration rewrites, drops old fields, takes one backup', () => {
    setMigrations(KEY, chain())
    const original = versioned({ old: 5 }, 1)
    writeFileSync(file, original)
    const s = run()
    expect(s.status).toBe('ok')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      renamed: 5,
      __internal__: { gamelib: { schemaVersion: 2 } }
    })
    const backups = listBackups(file)
    expect(backups).toHaveLength(1)
    expect(readFileSync(backups[0]!, 'utf8')).toBe(original)
  })

  test('newer file is read-only and untouched', () => {
    const body = versioned({ a: 1 }, 99)
    writeFileSync(file, body)
    const s = run()
    expect(s).toMatchObject({ status: 'readOnly', reason: 'newer' })
    expect(readFileSync(file, 'utf8')).toBe(body)
    expect(listBackups(file)).toEqual([])
    const ls = lines().filter((l) => l.includes(KEY) && l.includes('newer'))
    expect(ls).toHaveLength(1)
    expect(listReadOnly()).toEqual([
      expect.objectContaining({ storeKey: KEY, reason: 'newer' })
    ])
  })

  test('throwing migration leaves file byte-identical and retries next launch', () => {
    const throwing = chain(() => {
      throw new Error('boom')
    })
    setMigrations(KEY, throwing)
    const body = versioned({ old: 1 }, 1)
    writeFileSync(file, body)
    expect(run()).toMatchObject({ status: 'readOnly', reason: 'failed' })
    expect(readFileSync(file, 'utf8')).toBe(body)
    expect(listBackups(file)).toHaveLength(1)
    // A new launch: fresh engine state over the same chain.
    h = createVersioningHarness()
    setMigrations(KEY, throwing)
    expect(run()).toMatchObject({ status: 'readOnly', reason: 'failed' })
    expect(listBackups(file)).toHaveLength(1)
  })

  test('cache with a real step is discarded; adoption alone is not', () => {
    setMigrations(KEY, chain())
    writeFileSync(file, versioned({ old: 1 }, 1))
    expect(run(cacheDecl).status).toBe('ok')
    expect(existsSync(file)).toBe(false)
    expect(listBackups(file)).toEqual([])

    setMigrations(KEY, undefined)
    writeFileSync(file, JSON.stringify({ a: 1 }))
    run(cacheDecl)
    expect(existsSync(file)).toBe(true)
  })

  test('never throws on odd files', () => {
    mkdirSync(file)
    expect(() => run()).not.toThrow()
    rmSync(file, { recursive: true })
    writeFileSync(file, '[1,2]')
    expect(run().status).toBe('ok')
    expect(readFileSync(file, 'utf8')).toBe('[1,2]')
    writeFileSync(file, '{nope')
    expect(run().status).toBe('ok')
    expect(readFileSync(file, 'utf8')).toBe('{nope')
  })

  test.each(['"x"', '-1'])('invalid schemaVersion %s reads as 0', (raw) => {
    writeFileSync(file, `{"__internal__":{"gamelib":{"schemaVersion":${raw}}}}`)
    expect(run().status).toBe('ok')
    expect(lines().some((l) => l.includes('invalid schemaVersion'))).toBe(true)
  })
})

describe('prepareStoreFile / views', () => {
  test('shared path migrates once; kind mismatch is recorded, first kind stays', () => {
    setMigrations(KEY, chain())
    writeFileSync(file, versioned({ old: 1 }, 1))
    prepareStoreFile(file, KEY, decl, storeVersionCodec)
    prepareStoreFile(file, KEY, cacheDecl, storeVersionCodec)
    expect(listBackups(file)).toHaveLength(1)
    expect(existsSync(file)).toBe(true)
    expect(h.versioning.kindMismatches()).toHaveLength(1)
  })

  test('viewOf and stampForWrite', () => {
    const data = { k: 1 }
    writeFileSync(file, versioned({ k: 1 }, 99))
    prepareStoreFile(file, KEY, decl, storeVersionCodec)
    expect(viewOf(file, data)).toBe(data)

    const cacheFile = join(root, 'store_cache', 'c.json')
    writeFileSync(cacheFile, versioned({ k: 1 }, 99))
    prepareStoreFile(cacheFile, 'store_cache/c', cacheDecl, storeVersionCodec)
    expect(viewOf(cacheFile, data)).toEqual({})

    const emptyFile = join(root, 'store_cache', 'e.json')
    writeFileSync(emptyFile, versioned({ k: 1 }, 99))
    prepareStoreFile(
      emptyFile,
      'store_cache/e',
      { kind: 'user-state', failedView: 'empty' },
      storeVersionCodec
    )
    expect(viewOf(emptyFile, data)).toEqual({})

    const okFile = join(root, 'store_cache', 'ok.json')
    prepareStoreFile(okFile, 'store_cache/ok', decl, storeVersionCodec)
    const value = { a: 1, __internal__: { other: true } }
    const stamped = stampForWrite(okFile, value)
    expect(stamped).toEqual({
      a: 1,
      __internal__: { other: true, gamelib: { schemaVersion: 1 } }
    })
    expect(value.__internal__).toEqual({ other: true })
    expect(stampForWrite(join(root, 'nope.json'), value)).toBe(value)
  })

  test('storeKeyOf', () => {
    expect(storeKeyOf(file)).toBe(KEY)
  })
})

describe('registry', () => {
  test('chains are ordered and ids unique', () => {
    for (const steps of Object.values(STORE_MIGRATIONS)) {
      const ids = steps.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
      steps.forEach((s, i) => {
        if (i > 0) expect(s.to).toBeGreaterThan(steps[i - 1]!.to)
        else expect(s.to === 1 || s.to > 1).toBe(true)
      })
    }
  })
})
