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
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'fs'
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

  // WR-11: `resolveStorePath()` performed no containment check of its own — the
  // caller's regex was the only thing standing between an RPC-supplied `../../evil`
  // and a write outside the config dir. Phase 18's lesson: join is not containment.
  it.each([
    [{ cwd: 'store', name: '../../evil' }],
    [{ cwd: '../../..', name: 'evil' }],
    [{ name: '../../../../../../tmp/evil' }],
    [{ cwd: '/etc', name: 'passwd' }]
  ])('WR-11: refuses a store path that escapes userData (%p)', (options) => {
    expect(() => new FileStore(options)).toThrow(/outside userData/)
  })

  it('WR-11: an ABSOLUTE cwd inside userData is still accepted (game_overrides shape)', () => {
    const store = new FileStore({
      cwd: join(getPath('userData'), 'store'),
      name: 'gameOverrides'
    })
    expect(() => store.set('overrides', { a: 1 })).not.toThrow()
    expect(store.get('overrides')).toEqual({ a: 1 })
  })

  it('WR-06: a persisted store file is 0o600 and its directory 0o700', () => {
    const cwd = 'perms_test'
    const store = new FileStore({ cwd })
    store.set('token', 'ciphertext')

    const dir = join(getPath('userData'), cwd)
    // eslint-disable-next-line no-bitwise
    expect(statSync(join(dir, 'config.json')).mode & 0o777).toBe(0o600)
    // eslint-disable-next-line no-bitwise
    expect(statSync(dir).mode & 0o777).toBe(0o700)

    // A REWRITE must not widen the mode back out — temp+rename replaces the inode,
    // so the mode has to be set on the temp file each time.
    store.set('token', 'ciphertext-2')
    // eslint-disable-next-line no-bitwise
    expect(statSync(join(dir, 'config.json')).mode & 0o777).toBe(0o600)
  })

  it('WR-05: a failing rename leaves no orphan .tmp file behind', () => {
    const cwd = 'orphan_tmp_test'
    const store = new FileStore({ cwd })
    store.set('seed', 1) // ensures the directory exists

    const dir = join(getPath('userData'), cwd)
    const fs = jest.requireActual('graceful-fs')
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EXDEV: cross-device link not permitted')
    })
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)

    let stderrCalls: string[] = []
    try {
      store.set('afterFailure', 'value')
      stderrCalls = stderrSpy.mock.calls.map((call) => String(call[0]))
    } finally {
      renameSpy.mockRestore()
      stderrSpy.mockRestore()
    }

    // Proves the mock actually fired — otherwise this test would pass vacuously
    // against the success path.
    expect(
      stderrCalls.some((line) =>
        line.includes('atomic persist (temp+rename) failed')
      )
    ).toBe(true)

    // The direct-write fallback must still have persisted the value ...
    expect(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf-8'))).toEqual(
      {
        seed: 1,
        afterFailure: 'value'
      }
    )
    // ... and must not have left a pid-stable temp file behind, which would
    // accumulate one orphan per store file per process in the user's config dir.
    expect(readdirSync(dir).filter((f) => f.includes('.tmp-'))).toEqual([])
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

  it('CR-04: accessPropertiesByDotNotation:false keeps a URL key FLAT on disk', () => {
    // Mirrors src/backend/logger/electronStores.ts's uploadedLogFileStore exactly —
    // its keys are dpaste URLs (uploader.ts: `uploadedLogFileStore.set(url, data)`),
    // which contain dots. Split on '.', the entry landed as
    // {"https://dpaste": {"com/AB12": {…}}}, so getUploadedLogFiles() read
    // `value.uploadedAt` as undefined -> NaN expiry -> the entry never expired.
    const cwd = 'dot_notation_off_test'
    const store = new FileStore({
      cwd,
      name: 'uploadedLogs',
      accessPropertiesByDotNotation: false
    })

    const url = 'https://dpaste.com/AB12'
    const uploadData = {
      name: 'gamelib.log',
      token: 'tok',
      uploadedAt: 1_700_000
    }
    store.set(url, uploadData)

    expect(store.get(url)).toEqual(uploadData)
    expect(store.has(url)).toBe(true)

    // The on-disk shape must be flat — interchangeable with the file the Electron
    // build's electron-store writes for this same store.
    const raw = JSON.parse(
      readFileSync(join(getPath('userData'), cwd, 'uploadedLogs.json'), 'utf-8')
    )
    expect(Object.keys(raw)).toEqual([url])
    expect(raw[url]).toEqual(uploadData)

    // getUploadedLogFiles() iterates raw_store top-level entries — each value must
    // carry a real `uploadedAt`, not `undefined`.
    for (const [, value] of Object.entries(store.store)) {
      expect((value as { uploadedAt?: number }).uploadedAt).toBe(1_700_000)
    }

    store.delete(url)
    expect(store.has(url)).toBe(false)
    expect(store.store).toEqual({})
  })

  it('CR-04: the default (option absent) is still dot-notation, so nested paths keep working', () => {
    const store = new FileStore({ cwd: 'dot_notation_default_test' })
    store.set('a.b', 1)
    expect(store.get('a.b')).toBe(1)
    expect(store.store).toEqual({ a: { b: 1 } })
  })

  it('CR-01: a `__proto__` key path segment cannot pollute Object.prototype', () => {
    const store = new FileStore({ cwd: 'proto_pollution_test' })

    // The exact renderer-reachable payload from the review's verified chain:
    // window.api.storeSet('timestampStore', '__proto__.polluted', 'PWNED').
    store.set('__proto__.polluted', 'PWNED')
    store.set('constructor.prototype.polluted', 'PWNED')
    store.set('prototype.polluted', 'PWNED')

    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
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

  // CR-05: PARSEABLE-but-wrong-type JSON was the uncovered half of the "corrupt file
  // is never fatal" guarantee. `null` + options.defaults threw inside the constructor
  // (at module scope of storeRegistration.ts's imports -> the sidecar failed to boot);
  // a primitive silently discarded every write.
  it.each([
    ['null', 'null'],
    ['a string', '"just a string"'],
    ['a number', '12'],
    ['a boolean', 'true'],
    ['an array', '[1, 2, 3]']
  ])(
    'CR-05: a store file containing %s is treated as an empty store, never fatal',
    (_label, contents) => {
      const cwd = `nonobject_json_test_${contents.replace(/\W/g, '')}`
      const seed = new FileStore({ cwd })
      seed.set('bootstrap', true) // ensures the directory exists
      writeFileSync(join(getPath('userData'), cwd, 'config.json'), contents)
      __resetFileStoreRegistry()

      // With defaults present — the exact shape that threw at construction.
      expect(
        () => new FileStore({ cwd, defaults: { seeded: 'value' } })
      ).not.toThrow()
      __resetFileStoreRegistry()

      const store = new FileStore({ cwd })
      expect(store.store).toEqual({})
      // Writes must actually land, not be silently swallowed by a primitive.
      expect(() => store.set('afterCorruption', 'ok')).not.toThrow()
      expect(store.get('afterCorruption')).toBe('ok')
    }
  )
})
