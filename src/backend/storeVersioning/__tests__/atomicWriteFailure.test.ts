import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync as realRenameSync,
  rmSync,
  statSync,
  writeFileSync as realWriteFileSync
} from 'fs'
import { tmpdir } from 'os'
import { basename, dirname, join } from 'path'
import { renameSync, writeFileSync } from 'graceful-fs'
import { atomicWritePrivate, listBackups } from '../backup'
import { __resetStoreState, runFileMigration } from '../engine'
import { __resetReadOnlyForTest, listReadOnly } from '../readOnlyStores'
import {
  __setMigrationsForTest,
  storeVersionCodec
} from '../../storeMigrations'

jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  writeFileSync: jest.fn(),
  renameSync: jest.fn()
}))

// resetMocks: true wipes factory implementations, so they are installed in beforeEach.
const writeMock = writeFileSync as unknown as jest.Mock
const renameMock = renameSync as unknown as jest.Mock

const enospc = () =>
  Object.assign(new Error('ENOSPC: no space left on device, write'), {
    code: 'ENOSPC'
  })
const eperm = () =>
  Object.assign(new Error('EPERM: operation not permitted, rename'), {
    code: 'EPERM'
  })

const delegate = () => {
  writeMock.mockImplementation(
    (...args: Parameters<typeof realWriteFileSync>) =>
      realWriteFileSync(...args)
  )
  renameMock.mockImplementation((...args: Parameters<typeof realRenameSync>) =>
    realRenameSync(...args)
  )
}

/**
 * Fails writes to the live file's temp (after a partial write) and to the live
 * file itself (after truncating it, as O_TRUNC would), like a full disk.
 */
const failWritesTo = (live: string) => {
  writeMock.mockImplementation(
    (...args: Parameters<typeof realWriteFileSync>) => {
      const target = String(args[0])
      if (target === `${live}.tmp-${process.pid}`) {
        realWriteFileSync(target, 'par')
        throw enospc()
      }
      if (target === live) {
        realWriteFileSync(live, '')
        throw enospc()
      }
      return realWriteFileSync(...args)
    }
  )
}

const KEY = 'store_cache/probe'
const versioned = (data: Record<string, unknown>, v: number) =>
  JSON.stringify({ ...data, __internal__: { gamelib: { schemaVersion: v } } })

let root: string
let stderr: jest.SpyInstance

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atomic-fail-'))
  mkdirSync(join(root, 'store_cache'))
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  delegate()
})

afterEach(() => {
  __resetStoreState()
  __resetReadOnlyForTest()
  __setMigrationsForTest(KEY, undefined)
  stderr.mockRestore()
  rmSync(root, { recursive: true, force: true })
})

describe('atomicWritePrivate write failures', () => {
  test('temp-write ENOSPC leaves the live file byte-identical and rethrows', () => {
    const p = join(root, 'store_cache', 'live.json')
    const original = Buffer.from('{"keep":"me"}')
    realWriteFileSync(p, original, { mode: 0o600 })
    failWritesTo(p)

    let thrown: unknown
    try {
      atomicWritePrivate(p, 'new')
    } catch (err) {
      thrown = err
    }
    expect((thrown as { code?: string } | undefined)?.code).toBe('ENOSPC')
    expect(readFileSync(p).equals(original)).toBe(true)
    expect(readdirSync(dirname(p)).filter((e) => e.includes('.tmp-'))).toEqual(
      []
    )
    expect(writeMock.mock.calls.some((c) => String(c[0]) === p)).toBe(false)
    expect(renameMock).not.toHaveBeenCalled()
  })

  test('rename EPERM falls back to a direct write and removes the temp', () => {
    const p = join(root, 'store_cache', 'live.json')
    // writeFileSync with a mode does not chmod an existing file
    realWriteFileSync(p, 'old', { mode: 0o600 })
    renameMock.mockImplementationOnce(() => {
      throw eperm()
    })

    expect(() => atomicWritePrivate(p, 'new-content')).not.toThrow()
    expect(readFileSync(p, 'utf8')).toBe('new-content')
    if (process.platform !== 'win32') {
      expect(statSync(p).mode & 0o777).toBe(0o600)
    }
    expect(readdirSync(dirname(p)).filter((e) => e.includes('.tmp-'))).toEqual(
      []
    )
    const out = stderr.mock.calls.map((c) => String(c[0]))
    expect(out.filter((l) => l.includes(basename(p)))).toHaveLength(1)
    expect(out.some((l) => l.includes('new-content'))).toBe(false)
  })
})

describe('runFileMigration on a write failure (D-06, CR-01)', () => {
  test('ENOSPC on the migrated-file temp write leaves the store byte-identical and read-only, and the next launch recovers', () => {
    const file = join(root, 'store_cache', 'probe.json')
    __setMigrationsForTest(KEY, [
      { id: 'probe-v1-v2', to: 2, run: (d) => ({ renamed: d.old }) }
    ])
    const original = Buffer.from(versioned({ old: 5 }, 1))
    realWriteFileSync(file, original, { mode: 0o600 })
    failWritesTo(file)

    const run = () =>
      runFileMigration(file, {
        chainKey: KEY,
        declaration: { kind: 'user-state' },
        codec: storeVersionCodec
      })

    expect(run()).toMatchObject({ status: 'readOnly', reason: 'failed' })
    const after = readFileSync(file)
    expect(after.equals(original)).toBe(true)
    expect(() => JSON.parse(after.toString('utf8'))).not.toThrow()
    const backups = listBackups(file)
    expect(backups).toHaveLength(1)
    expect(readFileSync(backups[0] as string).equals(original)).toBe(true)
    expect(listReadOnly()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          storeKey: KEY,
          reason: 'failed',
          detail: expect.stringContaining('ENOSPC')
        })
      ])
    )
    expect(
      readdirSync(dirname(file)).filter((e) => e.includes('.tmp-'))
    ).toEqual([])

    delegate()
    __resetStoreState()
    __resetReadOnlyForTest()
    expect(run().status).toBe('ok')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      renamed: 5,
      __internal__: { gamelib: { schemaVersion: 2 } }
    })
  })
})
