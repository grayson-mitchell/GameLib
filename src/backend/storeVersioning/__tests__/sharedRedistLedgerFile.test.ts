import {
  createVersioningHarness,
  type VersioningHarness
} from '../../testUtils/testStoreRoot'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { listBackups } from '../backup'
import {
  SHARED_REDIST_LEDGER_CHAIN,
  ensureSharedRedistLedgerMigrated,
  isSharedRedistLedgerReadOnly,
  sharedRedistLedgerCodec,
  sharedRedistLedgerVersion
} from '../sharedRedistLedgerFile'

let root: string
let file: string

const legacy = (prior: string | null = 'mac') =>
  JSON.stringify({
    version: 1,
    done: { 'dx-1': 'gid-1' },
    timedOut: {},
    failures: {},
    rejected: {},
    markPending: {},
    displayDriver: { prior, at: '2026-01-01T00:00:00.000Z' },
    settled: { optIn: true }
  })

// One engine and tracker per test: nothing carries over between tests.
let h: VersioningHarness

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gamelib-ledger-'))
  file = join(root, 'gamelib-shared-redists.json')
  h = createVersioningHarness()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('sharedRedistLedgerCodec', () => {
  let stderr: jest.SpyInstance
  beforeEach(() => {
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => stderr.mockRestore())

  it('reads integer versions, absent as 0, invalid as 0 with a data-free line', () => {
    expect(sharedRedistLedgerCodec.read({ version: 3 })).toBe(3)
    expect(sharedRedistLedgerCodec.read({})).toBe(0)
    expect(sharedRedistLedgerCodec.read({ version: '1' })).toBe(0)
    expect(sharedRedistLedgerCodec.read({ version: -1 })).toBe(0)
    expect(sharedRedistLedgerCodec.read({ version: 1.5 })).toBe(0)
    expect(stderr).toHaveBeenCalledTimes(3)
  })

  it('writes a top-level version with no __internal__ key', () => {
    const out = sharedRedistLedgerCodec.write({ done: {} }, 2)
    expect(out).toEqual({ done: {}, version: 2 })
    expect(out).not.toHaveProperty('__internal__')
  })
})

describe('ensureSharedRedistLedgerMigrated', () => {
  it('adopts a legacy v1 ledger with zero byte changes and no backup', () => {
    writeFileSync(file, legacy())
    const before = readFileSync(file)
    ensureSharedRedistLedgerMigrated(h.versioning, file)
    expect(readFileSync(file).equals(before)).toBe(true)
    expect(listBackups(file)).toEqual([])
    expect(isSharedRedistLedgerReadOnly(h.versioning, file)).toBe(false)
  })

  it.each(['mac', null])(
    'migrates v1 -> v2 with a backup, keeping displayDriver.prior=%s and done',
    (prior) => {
      writeFileSync(file, legacy(prior))
      const original = readFileSync(file)
      h.setMigrations(SHARED_REDIST_LEDGER_CHAIN, [
        { id: 'test-v2', to: 2, run: (d) => d }
      ])
      ensureSharedRedistLedgerMigrated(h.versioning, file)
      const backups = listBackups(file)
      expect(backups).toHaveLength(1)
      expect(backups[0]).toMatch(/gamelib-shared-redists\.v1\..*\.bak\.json$/)
      expect(readFileSync(backups[0]!).equals(original)).toBe(true)
      const live = JSON.parse(readFileSync(file, 'utf8'))
      expect(live.version).toBe(2)
      expect(live).not.toHaveProperty('__internal__')
      expect(live.displayDriver.prior).toBe(prior)
      expect(live.done).toEqual({ 'dx-1': 'gid-1' })
      expect(sharedRedistLedgerVersion(h.versioning)).toBe(2)
    }
  )

  it('leaves a newer-version ledger untouched and read-only', () => {
    writeFileSync(file, JSON.stringify({ version: 99, done: {} }))
    const before = readFileSync(file)
    ensureSharedRedistLedgerMigrated(h.versioning, file)
    expect(isSharedRedistLedgerReadOnly(h.versioning, file)).toBe(true)
    expect(h.versioning.readOnlyReasonOf(file)).toBe('newer')
    expect(readFileSync(file).equals(before)).toBe(true)
    expect(listBackups(file)).toEqual([])
  })

  it('has no opinion on a corrupt file: untouched, not read-only', () => {
    writeFileSync(file, '{nope')
    ensureSharedRedistLedgerMigrated(h.versioning, file)
    expect(readFileSync(file, 'utf8')).toBe('{nope')
    expect(isSharedRedistLedgerReadOnly(h.versioning, file)).toBe(false)
  })

  it('creates nothing for a missing file', () => {
    ensureSharedRedistLedgerMigrated(h.versioning, file)
    expect(existsSync(file)).toBe(false)
    expect(readdirSync(root)).toEqual([])
    expect(isSharedRedistLedgerReadOnly(h.versioning, file)).toBe(false)
  })
})
