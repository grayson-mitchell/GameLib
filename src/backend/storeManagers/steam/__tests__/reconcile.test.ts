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
import {
  reconcilePartialState,
  verifyStructuralIntegrity
} from '../depot/reconcile'
import {
  PathTraversalError,
  type DepotPlan,
  type DepotPlanFile
} from '../depot'

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
jest.mock('steam-user/components/content_manifest.js', () => ({
  parse: jest.fn()
}))
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
  return {
    appId: '12345',
    depots,
    totalBytes: 0,
    name: 'SomeGame',
    skippedDepots: []
  }
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
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }
    ])

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
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }
    ])

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
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }
    ])

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
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }
    ])

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
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }
    ])

    await expect(reconcilePartialState(plan, dir)).rejects.toThrow(
      PathTraversalError
    )
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
      {
        depotId: '2',
        gid: 'g2',
        key: Buffer.from('key'),
        files: [fileMissing, fileBad]
      }
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
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }
    ])

    const result = await reconcilePartialState(plan, dir)

    expect(result.skippedBytes).toBe(0)
  })

  it("quick-260821-nyh: skippedBytes sums exactly the verified entries' sizes, excluding missing/mismatched ones", async () => {
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
      {
        depotId: '2',
        gid: 'g2',
        key: Buffer.from('key'),
        files: [fileMissing, fileBad]
      }
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
      {
        depotId: '1',
        gid: 'g1',
        key: Buffer.from('key'),
        files: [presentDir, missingDir]
      }
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
      {
        depotId: '1',
        gid: 'g1',
        key: Buffer.from('key'),
        files: [goodLink, badLink]
      }
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
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }
    ])

    const result = await reconcilePartialState(plan, dir)

    expect(result.jobs).toEqual([])
    expect(result.allFilesVerified).toBe(true)
  })
})

describe('verifyStructuralIntegrity (quick 260908-nbd)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-structural-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('a complete tree — every planned regular file present with the right size — is ok with zero mismatches', async () => {
    const a = Buffer.from('file-a-content')
    const b = Buffer.from('file-b-content-longer')
    writeFileSync(join(dir, 'a.bin'), a)
    writeFileSync(join(dir, 'b.bin'), b)

    const fileA: DepotPlanFile = {
      filename: 'a.bin',
      size: a.length,
      sha_content: sha1Hex(a),
      chunks: [{ sha: 's1', cb_original: a.length, offset: 0 }]
    }
    const fileB: DepotPlanFile = {
      filename: 'b.bin',
      size: b.length,
      sha_content: sha1Hex(b),
      chunks: [{ sha: 's2', cb_original: b.length, offset: 0 }]
    }
    const plan = makePlan([
      {
        depotId: '1',
        gid: 'g1',
        key: Buffer.from('key'),
        files: [fileA, fileB]
      }
    ])

    const result = await verifyStructuralIntegrity(plan, dir)

    expect(result.ok).toBe(true)
    expect(result.mismatchCount).toBe(0)
    expect(result.checked).toBe(2)
  })

  it('the observed 38410 master.dat shape — a planned regular file present as an EMPTY DIRECTORY — mismatches as not-a-file', async () => {
    mkdirSync(join(dir, 'master.dat'))
    const file: DepotPlanFile = {
      filename: 'master.dat',
      size: 100,
      sha_content: 'irrelevant',
      chunks: [{ sha: 's', cb_original: 100, offset: 0 }]
    }
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }
    ])

    const result = await verifyStructuralIntegrity(plan, dir)

    expect(result.ok).toBe(false)
    expect(result.mismatches).toEqual([
      expect.objectContaining({ filename: 'master.dat', reason: 'not-a-file' })
    ])
  })

  it('a planned regular file present but SHORT mismatches as wrong-size, reporting the found size', async () => {
    writeFileSync(join(dir, 'short.bin'), Buffer.alloc(5))
    const file: DepotPlanFile = {
      filename: 'short.bin',
      size: 999,
      sha_content: 'irrelevant',
      chunks: [{ sha: 's', cb_original: 999, offset: 0 }]
    }
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }
    ])

    const result = await verifyStructuralIntegrity(plan, dir)

    expect(result.ok).toBe(false)
    expect(result.mismatches).toEqual([
      expect.objectContaining({
        filename: 'short.bin',
        reason: 'wrong-size',
        foundSize: 5
      })
    ])
  })

  it('a planned regular file ABSENT from disk mismatches as missing', async () => {
    const file: DepotPlanFile = {
      filename: 'gone.bin',
      size: 10,
      sha_content: 'irrelevant',
      chunks: [{ sha: 's', cb_original: 10, offset: 0 }]
    }
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }
    ])

    const result = await verifyStructuralIntegrity(plan, dir)

    expect(result.ok).toBe(false)
    expect(result.mismatches).toEqual([
      expect.objectContaining({ filename: 'gone.bin', reason: 'missing' })
    ])
  })

  it('Directory(64), Symlink(512) and zero-size entries all satisfied correctly are ok — guards against false-failing the non-regular entry kinds', async () => {
    mkdirSync(join(dir, 'a-dir'))
    symlinkSync('target.exe', join(dir, 'a-link'))
    writeFileSync(join(dir, 'empty.dat'), Buffer.alloc(0))

    const dirFile: DepotPlanFile = {
      filename: 'a-dir',
      size: 0,
      sha_content: '',
      chunks: [],
      flags: 64
    }
    const linkFile: DepotPlanFile = {
      filename: 'a-link',
      size: 0,
      sha_content: '',
      chunks: [],
      flags: 512,
      linktarget: 'target.exe'
    }
    const zeroFile: DepotPlanFile = {
      filename: 'empty.dat',
      size: 0,
      sha_content: '',
      chunks: []
    }
    const plan = makePlan([
      {
        depotId: '1',
        gid: 'g1',
        key: Buffer.from('key'),
        files: [dirFile, linkFile, zeroFile]
      }
    ])

    const result = await verifyStructuralIntegrity(plan, dir)

    expect(result.ok).toBe(true)
    expect(result.mismatchCount).toBe(0)
    expect(result.checked).toBe(3)
  })

  it('more than 10 mismatches caps the reported list at 10 but keeps the true mismatchCount uncapped', async () => {
    const files: DepotPlanFile[] = []
    for (let i = 0; i < 15; i++) {
      files.push({
        filename: `missing-${i}.bin`,
        size: 10,
        sha_content: 'irrelevant',
        chunks: [{ sha: 's', cb_original: 10, offset: 0 }]
      })
    }
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files }
    ])

    const result = await verifyStructuralIntegrity(plan, dir)

    expect(result.ok).toBe(false)
    expect(result.mismatches).toHaveLength(10)
    expect(result.mismatchCount).toBe(15)
  })

  it('NO SHA1 — a file with correct size but WRONG CONTENT is ok (documented boundary, not a loophole)', async () => {
    const declared = Buffer.from('AAAA')
    const actual = Buffer.from('ZZZZ') // same length, different content
    writeFileSync(join(dir, 'wrong-content.bin'), actual)

    const file: DepotPlanFile = {
      filename: 'wrong-content.bin',
      size: declared.length,
      sha_content: sha1Hex(declared),
      chunks: [{ sha: 's', cb_original: declared.length, offset: 0 }]
    }
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }
    ])

    const result = await verifyStructuralIntegrity(plan, dir)

    // verifyStructuralIntegrity is a POST-download damage detector, not a
    // content check (see its doc comment) — this is the documented boundary.
    expect(result.ok).toBe(true)
    expect(result.mismatchCount).toBe(0)
  })

  it("CONTRAST: reconcilePartialState's sha1 invariant survives the regularFileShape extraction — the identical wrong-content/right-size file still fails its sha1 gate and is pushed as a job", async () => {
    const declared = Buffer.from('AAAA')
    const actual = Buffer.from('ZZZZ')
    writeFileSync(join(dir, 'wrong-content.bin'), actual)

    const file: DepotPlanFile = {
      filename: 'wrong-content.bin',
      size: declared.length,
      sha_content: sha1Hex(declared),
      chunks: [{ sha: 's', cb_original: declared.length, offset: 0 }]
    }
    const plan = makePlan([
      { depotId: '1', gid: 'g1', key: Buffer.from('key'), files: [file] }
    ])

    const result = await reconcilePartialState(plan, dir)

    expect(result.allFilesVerified).toBe(false)
    expect(result.jobs.map((j) => j.file.filename)).toEqual([
      'wrong-content.bin'
    ])
  })
})
