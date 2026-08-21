/**
 * Unit tests for reconcilePartialState (Phase 23-03, D-04) — sha1-gated
 * partial-state reconciliation. Real tmpdir, no fs mocking (established
 * project convention for this fs-heavy module family — see depot.test.ts's
 * finalizeToSteam/downloadDepotFiles describe blocks).
 *
 * Mock strategy: reconcile.ts composes sha1File/resolveContainedPath from
 * '../depot' (Shared Patterns rule — do not duplicate), so importing
 * '../depot/reconcile' transitively loads depot.ts's own module graph. The
 * same transitive-dependency mocks depot.test.ts establishes (logger/user/
 * ipc/select/crypto/fileAttributes/content_manifest parser/decompress/
 * i18next) are required here purely to keep depot.ts's module load
 * side-effect-free in tests — none of these mocked modules are actually
 * exercised by reconcilePartialState itself.
 */
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reconcilePartialState } from '../depot/reconcile'
import { PathTraversalError, type DepotPlan, type DepotPlanFile } from '../depot'

// ── Transitive-dependency mocks (depot.ts's own module graph) ───────────────
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('../user')
jest.mock('backend/utils', () => ({ getFileSize: jest.fn() }))
jest.mock('../depot/select', () => ({
  ...jest.requireActual('../depot/select'),
  selectAllDepots: jest.fn()
}))
jest.mock('../depot/crypto', () => ({ decryptFilename: jest.fn() }))
jest.mock('../depot/fileAttributes', () => ({ applyDepotFileFlags: jest.fn() }))
jest.mock('steam-user/components/content_manifest.js', () => ({ parse: jest.fn() }))
jest.mock('../depot/decompress', () => ({ fetchChunk: jest.fn() }))
jest.mock('../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (_key: string, fallback = '') => fallback }
}))

function sha1Hex(buf: Buffer): string {
  return createHash('sha1').update(buf).digest('hex')
}

function makePlan(depots: DepotPlan['depots']): DepotPlan {
  return { appId: '12345', depots, totalBytes: 0, name: 'SomeGame', skippedDepots: [] }
}

describe('reconcilePartialState', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-reconcile-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('a present sha1-matching file is EXCLUDED from jobs and counted verified', async () => {
    const content = Buffer.from('hello world')
    writeFileSync(join(dir, 'game.bin'), content)

    const file: DepotPlanFile = {
      filename: 'game.bin',
      size: content.length,
      sha_content: sha1Hex(content),
      chunks: [{ sha: 's', cb_original: content.length, offset: 0 }]
    }
    const plan = makePlan([{ depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }])

    const result = await reconcilePartialState(plan, dir)

    expect(result.jobs).toEqual([])
    expect(result.allFilesVerified).toBe(true)
  })

  it('a missing file is INCLUDED as a job, not verified', async () => {
    const file: DepotPlanFile = {
      filename: 'missing.bin',
      size: 10,
      sha_content: 'irrelevant',
      chunks: [{ sha: 's', cb_original: 10, offset: 0 }]
    }
    const plan = makePlan([{ depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }])

    const result = await reconcilePartialState(plan, dir)

    expect(result.jobs).toHaveLength(1)
    expect(result.jobs[0].file.filename).toBe('missing.bin')
    expect(result.allFilesVerified).toBe(false)
  })

  it('a present file with WRONG SIZE is included as a job without needing sha1 (decisive)', async () => {
    writeFileSync(join(dir, 'wrong-size.bin'), Buffer.alloc(5))
    const file: DepotPlanFile = {
      filename: 'wrong-size.bin',
      size: 999,
      sha_content: 'irrelevant',
      chunks: [{ sha: 's', cb_original: 999, offset: 0 }]
    }
    const plan = makePlan([{ depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }])

    const result = await reconcilePartialState(plan, dir)

    expect(result.jobs).toHaveLength(1)
    expect(result.allFilesVerified).toBe(false)
  })

  it('T-23-07 (Pitfall 1): a present, size-correct, CONTENT-CORRUPTED file is re-downloaded — sha1 always gates, size match alone is never sufficient', async () => {
    const realContent = Buffer.from('AAAA') // 4 bytes, matches declared size
    const corrupt = Buffer.from('ZZZZ') // same length, different content
    writeFileSync(join(dir, 'corrupt.bin'), corrupt)

    const file: DepotPlanFile = {
      filename: 'corrupt.bin',
      size: realContent.length,
      sha_content: sha1Hex(realContent),
      chunks: [{ sha: 's', cb_original: realContent.length, offset: 0 }]
    }
    const plan = makePlan([{ depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }])

    const result = await reconcilePartialState(plan, dir)

    expect(result.jobs).toHaveLength(1)
    expect(result.jobs[0].file.filename).toBe('corrupt.bin')
    expect(result.allFilesVerified).toBe(false)
  })

  it('T-23-08: a path-traversal filename throws PathTraversalError, never silently skipped', async () => {
    const file: DepotPlanFile = {
      filename: '../../evil.bin',
      size: 0,
      sha_content: '',
      chunks: []
    }
    const plan = makePlan([{ depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }])

    await expect(reconcilePartialState(plan, dir)).rejects.toThrow(PathTraversalError)
  })

  it('a mix of verified/missing/mismatched files across two depots reduces jobs to only the missing+mismatched set', async () => {
    const good = Buffer.from('good-content')
    writeFileSync(join(dir, 'good.bin'), good)
    const fileGood: DepotPlanFile = {
      filename: 'good.bin',
      size: good.length,
      sha_content: sha1Hex(good),
      chunks: [{ sha: 's1', cb_original: good.length, offset: 0 }]
    }
    const fileMissing: DepotPlanFile = {
      filename: 'missing.bin',
      size: 3,
      sha_content: 'irrelevant',
      chunks: [{ sha: 's2', cb_original: 3, offset: 0 }]
    }
    const bad = Buffer.from('AAAA')
    writeFileSync(join(dir, 'bad.bin'), Buffer.from('ZZZZ'))
    const fileBad: DepotPlanFile = {
      filename: 'bad.bin',
      size: bad.length,
      sha_content: sha1Hex(bad),
      chunks: [{ sha: 's3', cb_original: bad.length, offset: 0 }]
    }

    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [fileGood] },
      { depotId: '2', gid: 'g2', key: Buffer.from('key'), files: [fileMissing, fileBad] }
    ])

    const result = await reconcilePartialState(plan, dir)

    const names = result.jobs.map((j) => j.file.filename).sort()
    expect(names).toEqual(['bad.bin', 'missing.bin'])
    expect(result.allFilesVerified).toBe(false)
  })

  // Quick 260821-nyh: skippedBytes surfaces the byte total of the reconciler's
  // own skip set, for depot.ts to seed doneBytes with (resumed-install
  // progress fix). Assert the exact SUM, not merely `> 0` — a `> 0` assertion
  // would also pass against an implementation that counted FILES instead of
  // BYTES, which is precisely the file-count-vs-bytes confusion the todo
  // warns about (82.6% of files was only ~24% of bytes on HUMANKIND).
  it('quick-260821-nyh: skippedBytes is 0 when nothing on disk is reconciled (fresh install)', async () => {
    const file: DepotPlanFile = {
      filename: 'missing.bin',
      size: 10,
      sha_content: 'irrelevant',
      chunks: [{ sha: 's', cb_original: 10, offset: 0 }]
    }
    const plan = makePlan([{ depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }])

    const result = await reconcilePartialState(plan, dir)

    expect(result.skippedBytes).toBe(0)
  })

  it('quick-260821-nyh: skippedBytes sums exactly the verified entries\' sizes, excluding missing/mismatched ones', async () => {
    const good = Buffer.from('good-content') // 12 bytes, verified/skipped
    writeFileSync(join(dir, 'good.bin'), good)
    const fileGood: DepotPlanFile = {
      filename: 'good.bin',
      size: good.length,
      sha_content: sha1Hex(good),
      chunks: [{ sha: 's1', cb_original: good.length, offset: 0 }]
    }
    const fileMissing: DepotPlanFile = {
      filename: 'missing.bin',
      size: 3, // NOT verified — must NOT contribute to skippedBytes
      sha_content: 'irrelevant',
      chunks: [{ sha: 's2', cb_original: 3, offset: 0 }]
    }
    const bad = Buffer.from('AAAA')
    writeFileSync(join(dir, 'bad.bin'), Buffer.from('ZZZZ'))
    const fileBad: DepotPlanFile = {
      filename: 'bad.bin',
      size: bad.length, // 4 bytes, size matches but content is corrupt — NOT verified
      sha_content: sha1Hex(bad),
      chunks: [{ sha: 's3', cb_original: bad.length, offset: 0 }]
    }

    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [fileGood] },
      { depotId: '2', gid: 'g2', key: Buffer.from('key'), files: [fileMissing, fileBad] }
    ])

    const result = await reconcilePartialState(plan, dir)

    // Only good.bin's 12 bytes are verified/skipped — missing.bin (3) and
    // bad.bin (4) both hit the job list and must NOT be summed in.
    expect(result.skippedBytes).toBe(good.length)
  })

  it('a real, already-present Directory manifest entry is reconciled (excluded); a missing one is included as a job', async () => {
    mkdirSync(join(dir, 'existing-dir'))
    const presentDir: DepotPlanFile = {
      filename: 'existing-dir',
      size: 0,
      sha_content: '',
      chunks: [],
      flags: 64
    }
    const missingDir: DepotPlanFile = {
      filename: 'missing-dir',
      size: 0,
      sha_content: '',
      chunks: [],
      flags: 64
    }
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [presentDir, missingDir] }
    ])

    const result = await reconcilePartialState(plan, dir)

    expect(result.jobs.map((j) => j.file.filename)).toEqual(['missing-dir'])
  })

  it('a correctly-targeted existing Symlink manifest entry is reconciled (excluded); a wrong-target one is included as a job', async () => {
    symlinkSync('game.exe', join(dir, 'good-link'))
    symlinkSync('wrong-target.exe', join(dir, 'bad-link'))
    const goodLink: DepotPlanFile = {
      filename: 'good-link',
      size: 0,
      sha_content: '',
      chunks: [],
      flags: 512,
      linktarget: 'game.exe'
    }
    const badLink: DepotPlanFile = {
      filename: 'bad-link',
      size: 0,
      sha_content: '',
      chunks: [],
      flags: 512,
      linktarget: 'game.exe'
    }
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [goodLink, badLink] }
    ])

    const result = await reconcilePartialState(plan, dir)

    expect(result.jobs.map((j) => j.file.filename)).toEqual(['bad-link'])
  })

  it("a zero-size regular file present on disk is reconciled without a sha1 check (mirrors downloadSingleFile's own zero-size fast path)", async () => {
    writeFileSync(join(dir, 'empty.dat'), Buffer.alloc(0))
    const file: DepotPlanFile = {
      filename: 'empty.dat',
      size: 0,
      sha_content: '',
      chunks: []
    }
    const plan = makePlan([{ depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }])

    const result = await reconcilePartialState(plan, dir)

    expect(result.jobs).toEqual([])
    expect(result.allFilesVerified).toBe(true)
  })
})
