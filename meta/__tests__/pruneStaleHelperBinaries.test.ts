/**
 * Fixture-driven coverage for meta/pruneStaleHelperBinaries.ts (quick task
 * 260901-a2w). Every fixture is a synthetic temp tree via `fs.mkdtempSync`
 * under `os.tmpdir()`, torn down in `afterEach` -- nothing here touches the
 * real `build/bin` or `public/bin` trees, and no network call is made.
 *
 * Deliberately exercises the guard's FAILING direction (T16/T17), not just
 * its passing one -- this repo has a standing lesson that a gate whose
 * failing direction is never exercised proves nothing.
 */
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveDestPath } from '../preserveRunnerSymlinks'
import { RELEASE_TAGS } from '../releaseTags'
import {
  assessPublicBin,
  collectEntries,
  computeDarwinLayoutMarker,
  computePruneSet,
  pruneStaleHelperBinaries
} from '../pruneStaleHelperBinaries'

// Safe here ONLY because jest sets JEST_WORKER_ID, which is precisely what
// suppresses meta/downloadHelperBinaries.ts's module-scope main() call. Do
// NOT copy this import into build-time code (vite plugins, etc) -- see the
// warning at the top of pruneStaleHelperBinaries.ts.
import { darwinLayoutMarker } from '../downloadHelperBinaries'

const RUNNERS = ['legendary', 'gogdl', 'nile'] as const

let workDir: string

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'a2w-prune-'))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function buildBinPath(): string {
  return join(workDir, 'build-bin')
}

function publicBinPath(): string {
  return join(workDir, 'public-bin')
}

function writeFile(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

function writeSymlink(path: string, target: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  symlinkSync(target, path)
}

/**
 * Populates `publicBinDir` with a fully-valid fixture: `.release_tags`
 * matching RELEASE_TAGS + the real __darwin_layout marker, and each of
 * legendary/gogdl/nile holding an executable {runner}/{runner} plus
 * `filesPerRunner` regular files (default comfortably above the >20 floor).
 */
function populateValidPublicBin(
  publicBinDir: string,
  options?: { filesPerRunner?: Partial<Record<(typeof RUNNERS)[number], number>> }
): void {
  writeFile(
    join(publicBinDir, '.release_tags'),
    JSON.stringify({ ...RELEASE_TAGS, __darwin_layout: darwinLayoutMarker() })
  )

  for (const runner of RUNNERS) {
    const runnerDir = join(publicBinDir, 'arm64', 'darwin', runner)
    const binaryPath = join(runnerDir, runner)
    writeFile(binaryPath, 'binary-content')
    chmodSync(binaryPath, 0o755)

    const fileCount = options?.filesPerRunner?.[runner] ?? 25
    for (let i = 0; i < fileCount; i++) {
      writeFile(join(runnerDir, '_internal', `f${i}.dylib`), `content-${i}`)
    }
  }
}

describe('collectEntries', () => {
  it('T1 returns an empty Map for a non-existent root', () => {
    expect(collectEntries(join(workDir, 'does-not-exist')).size).toBe(0)
  })

  it('T2 classifies a symlink-to-directory as symlink, not dir, and does not recurse through it', () => {
    const root = join(workDir, 'root')
    mkdirSync(join(root, 'real-dir'), { recursive: true })
    writeFile(join(root, 'real-dir', 'inner.txt'))
    writeSymlink(join(root, 'link-to-dir'), join(root, 'real-dir'))

    const entries = collectEntries(root)

    expect(entries.get('link-to-dir')).toBe('symlink')
    expect([...entries.keys()].some((k) => k.startsWith('link-to-dir/'))).toBe(
      false
    )
  })

  it('T3 uses / separators in relPaths on every platform', () => {
    const root = join(workDir, 'root')
    writeFile(join(root, 'a', 'b', 'c.txt'))

    const entries = collectEntries(root)

    expect([...entries.keys()]).toContain('a')
    expect([...entries.keys()]).toContain('a/b')
    expect([...entries.keys()]).toContain('a/b/c.txt')
    expect([...entries.keys()].some((k) => k.includes('\\'))).toBe(false)
  })
})

describe('computePruneSet', () => {
  it('T4 a file present in build but absent in public IS in the set', () => {
    writeFile(join(buildBinPath(), 'stale.txt'))
    const set = computePruneSet(buildBinPath(), publicBinPath())
    expect(set).toEqual(['stale.txt'])
  })

  it('T5 a file present in both is NOT in the set', () => {
    writeFile(join(buildBinPath(), 'shared.txt'))
    writeFile(join(publicBinPath(), 'shared.txt'))
    expect(computePruneSet(buildBinPath(), publicBinPath())).toEqual([])
  })

  it('T6 a symlink present in both with the same target is NOT in the set', () => {
    mkdirSync(buildBinPath(), { recursive: true })
    mkdirSync(publicBinPath(), { recursive: true })
    writeFile(join(buildBinPath(), 'real.txt'))
    writeFile(join(publicBinPath(), 'real.txt'))
    writeSymlink(join(buildBinPath(), 'link'), 'real.txt')
    writeSymlink(join(publicBinPath(), 'link'), 'real.txt')

    expect(computePruneSet(buildBinPath(), publicBinPath())).toEqual([])
  })

  it('T7 a kind mismatch (build has a real dir, public has a symlink) puts the build path in the set, minimally', () => {
    mkdirSync(join(buildBinPath(), 'thing'), { recursive: true })
    writeFile(join(buildBinPath(), 'thing', 'nested.txt'))
    mkdirSync(publicBinPath(), { recursive: true })
    // public/bin's "thing" is a symlink, not a directory
    writeFile(join(workDir, 'symlink-target.txt'))
    writeSymlink(join(publicBinPath(), 'thing'), join(workDir, 'symlink-target.txt'))

    const set = computePruneSet(buildBinPath(), publicBinPath())

    expect(set).toEqual(['thing'])
    expect(set).not.toContain('thing/nested.txt')
  })

  it('T8 a whole directory absent from public is emitted once, not once per descendant', () => {
    writeFile(join(buildBinPath(), 'dir', 'a.txt'))
    writeFile(join(buildBinPath(), 'dir', 'sub', 'b.txt'))
    mkdirSync(publicBinPath(), { recursive: true })

    const set = computePruneSet(buildBinPath(), publicBinPath())

    expect(set).toEqual(['dir'])
  })

  it('T9 an entry present in public but absent in build produces nothing', () => {
    mkdirSync(buildBinPath(), { recursive: true })
    writeFile(join(publicBinPath(), 'public-only.txt'))

    expect(computePruneSet(buildBinPath(), publicBinPath())).toEqual([])
  })
})

describe('assessPublicBin', () => {
  it('T10 fully-populated fixture -> ok: true, reasons: []', () => {
    populateValidPublicBin(publicBinPath())
    expect(assessPublicBin(publicBinPath())).toEqual({ ok: true, reasons: [] })
  })

  it('T11 missing .release_tags -> ok: false, a reason naming .release_tags', () => {
    populateValidPublicBin(publicBinPath())
    rmSync(join(publicBinPath(), '.release_tags'))

    const result = assessPublicBin(publicBinPath())

    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.includes('.release_tags'))).toBe(true)
  })

  it('T12 __darwin_layout mutated by one char -> ok: false, a reason naming the layout marker', () => {
    populateValidPublicBin(publicBinPath())
    const tagsPath = join(publicBinPath(), '.release_tags')
    const parsed = JSON.parse(readFileSync(tagsPath, 'utf-8'))
    parsed.__darwin_layout = parsed.__darwin_layout.slice(0, -1) + (parsed.__darwin_layout.endsWith('a') ? 'b' : 'a')
    writeFileSync(tagsPath, JSON.stringify(parsed))

    const result = assessPublicBin(publicBinPath())

    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.includes('__darwin_layout'))).toBe(true)
  })

  it('T13 THE PARTIAL CASE -- nile complete, gogdl present but holding only 3 files -> ok: false naming gogdl and the floor', () => {
    populateValidPublicBin(publicBinPath(), { filesPerRunner: { gogdl: 3 } })

    const result = assessPublicBin(publicBinPath())

    expect(result.ok).toBe(false)
    expect(
      result.reasons.some((r) => r.includes('gogdl') && r.includes('floor'))
    ).toBe(true)
  })

  it('T14 a runner binary present but with no exec bit -> ok: false', () => {
    populateValidPublicBin(publicBinPath())
    const binaryPath = join(publicBinPath(), 'arm64', 'darwin', 'legendary', 'legendary')
    chmodSync(binaryPath, 0o644)

    const result = assessPublicBin(publicBinPath())

    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.includes('exec bit'))).toBe(true)
  })
})

describe('pruneStaleHelperBinaries', () => {
  it('T15 empty prune set is a silent no-op, even when neither dir exists', () => {
    const result = pruneStaleHelperBinaries(
      join(workDir, 'no-build'),
      join(workDir, 'no-public')
    )

    expect(result).toEqual({ pruned: [], bytesFreed: 0, guardEvaluated: false })
  })

  it('T16 non-empty prune set + failing guard (absent public/bin) throws and deletes nothing', () => {
    writeFile(join(buildBinPath(), 'stale-a.txt'))
    writeFile(join(buildBinPath(), 'stale-b.txt'))
    // publicBinPath() deliberately never created

    expect(() =>
      pruneStaleHelperBinaries(buildBinPath(), publicBinPath())
    ).toThrow(/refusing to prune/)

    expect(existsSync(join(buildBinPath(), 'stale-a.txt'))).toBe(true)
    expect(existsSync(join(buildBinPath(), 'stale-b.txt'))).toBe(true)
  })

  it('T16b the thrown message names the refused entry count and every reason', () => {
    writeFile(join(buildBinPath(), 'stale-a.txt'))

    let caught: Error | undefined
    try {
      pruneStaleHelperBinaries(buildBinPath(), publicBinPath())
    } catch (err) {
      caught = err as Error
    }

    expect(caught).toBeDefined()
    expect(caught?.message).toContain('1')
    const assessment = assessPublicBin(publicBinPath())
    for (const reason of assessment.reasons) {
      expect(caught?.message).toContain(reason)
    }
  })

  it('T17 non-empty prune set + failing guard (partial public/bin from T13) throws and deletes nothing', () => {
    writeFile(join(buildBinPath(), 'stale.txt'))
    populateValidPublicBin(publicBinPath(), { filesPerRunner: { gogdl: 3 } })

    expect(() =>
      pruneStaleHelperBinaries(buildBinPath(), publicBinPath())
    ).toThrow(/refusing to prune/)

    expect(existsSync(join(buildBinPath(), 'stale.txt'))).toBe(true)
  })

  it('T18 non-empty prune set + passing guard deletes only the stale entries, leaves shared entries and symlinks untouched, and reports bytesFreed', () => {
    populateValidPublicBin(publicBinPath())

    // Shared file, present identically in both.
    writeFile(join(buildBinPath(), 'shared.txt'), 'shared-content')
    writeFile(join(publicBinPath(), 'shared.txt'), 'shared-content')

    // Shared symlink, present identically in both.
    writeFile(join(buildBinPath(), 'real.txt'), 'real-content')
    writeFile(join(publicBinPath(), 'real.txt'), 'real-content')
    writeSymlink(join(buildBinPath(), 'link'), 'real.txt')
    writeSymlink(join(publicBinPath(), 'link'), 'real.txt')

    // Stale entries, present only in build.
    const staleContent = 'stale-payload-12345'
    writeFile(join(buildBinPath(), 'stale.dylib'), staleContent)
    writeFile(
      join(buildBinPath(), 'arm64', 'darwin', 'nile', '_internal', 'ghost.dylib'),
      'ghost-payload'
    )

    const before = pruneStaleHelperBinaries(buildBinPath(), publicBinPath())

    expect(before.guardEvaluated).toBe(true)
    expect(before.pruned.sort()).toEqual(
      ['arm64/darwin/nile/_internal/ghost.dylib', 'stale.dylib'].sort()
    )
    expect(existsSync(join(buildBinPath(), 'stale.dylib'))).toBe(false)
    expect(
      existsSync(join(buildBinPath(), 'arm64', 'darwin', 'nile', '_internal', 'ghost.dylib'))
    ).toBe(false)

    // Shared entries survive.
    expect(existsSync(join(buildBinPath(), 'shared.txt'))).toBe(true)
    expect(lstatSync(join(buildBinPath(), 'link')).isSymbolicLink()).toBe(true)
    expect(readlinkSync(join(buildBinPath(), 'link'))).toBe('real.txt')

    // bytesFreed equals the summed apparent size of the deleted regular files.
    expect(before.bytesFreed).toBe(
      Buffer.byteLength(staleContent) + Buffer.byteLength('ghost-payload')
    )
  })

  it('T19 idempotence: a second call over the just-pruned tree is a no-op', () => {
    populateValidPublicBin(publicBinPath())
    writeFile(join(buildBinPath(), 'stale.txt'), 'stale')

    pruneStaleHelperBinaries(buildBinPath(), publicBinPath())
    const second = pruneStaleHelperBinaries(buildBinPath(), publicBinPath())

    expect(second.pruned).toEqual([])
    // No throw is implicit in reaching this line.
  })

  it('T20 containment: resolveDestPath (reused, not reimplemented) rejects an escaping relPath', () => {
    expect(() => resolveDestPath(buildBinPath(), '../../etc')).toThrow(
      /escapes destDir/
    )
  })

  it('T21 the locally-recomputed darwin layout marker equals darwinLayoutMarker() from downloadHelperBinaries.ts', () => {
    expect(computeDarwinLayoutMarker()).toBe(darwinLayoutMarker())
  })
})
