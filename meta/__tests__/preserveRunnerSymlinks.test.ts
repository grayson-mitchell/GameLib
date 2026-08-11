/**
 * Fixture-driven coverage for meta/preserveRunnerSymlinks.ts (Phase 34.9
 * gap cycle 1, plan 12, F-34.9-01/F-34.9-03).
 *
 * The known-bad fixture is produced with `spawnSync('cp', ['-RL', src,
 * dest])` -- the SAME one-variable discriminator (`cp -R` vs `cp -RL`) that
 * proved F-34.9-01's root cause in 34.9-LIVE-GATE.md item 4, reproducing
 * vite's `copyDir` dereferencing behaviour for this shape. Its bad state is
 * asserted BEFORE any restore call runs (`known-bad fixture` test below) --
 * a fixture that is not first proven bad would make the rest of this suite
 * vacuous (a lesson this repo has hit before: an assertion that would pass
 * vacuously against an unmatchable input is not evidence).
 *
 * Every fixture is a synthetic temp tree via `fs.mkdtempSync` under
 * `os.tmpdir()`, torn down in `afterEach` -- nothing here touches the real
 * `public/` or `build/` trees.
 */
import { spawnSync } from 'node:child_process'
import {
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
import { join, sep } from 'node:path'

import {
  collectSymlinks,
  resolveDestPath,
  restoreSymlinks
} from '../preserveRunnerSymlinks'

const GOGDL_INTERNAL = join('bin', 'arm64', 'darwin', 'gogdl', '_internal')

const tempDirs: string[] = []

function mktemp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop() as string
    rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * Builds, under `<root>/bin/arm64/darwin/gogdl/_internal/`: a real file
 * `Python.framework/Versions/3.14/Python`, a real directory
 * `Python.framework/Versions/3.14/Resources/` with one file in it, and the
 * four symlinks with the exact relative targets from the plan's
 * `<interfaces>` table. Returns the four symlinks' POSIX-normalised
 * relPaths (relative to `root`), matching `collectSymlinks`'s own output
 * shape.
 */
function buildFrameworkFixture(root: string): string[] {
  const internalDir = join(root, GOGDL_INTERNAL)
  const versionsDir = join(internalDir, 'Python.framework', 'Versions', '3.14')
  mkdirSync(versionsDir, { recursive: true })
  writeFileSync(join(versionsDir, 'Python'), 'real-python-binary-bytes')

  const resourcesDir = join(versionsDir, 'Resources')
  mkdirSync(resourcesDir, { recursive: true })
  writeFileSync(join(resourcesDir, 'Info.plist'), 'resource-bytes')

  const frameworkDir = join(internalDir, 'Python.framework')
  symlinkSync(
    'Python.framework/Versions/3.14/Python',
    join(internalDir, 'Python')
  )
  symlinkSync('Versions/Current/Python', join(frameworkDir, 'Python'))
  symlinkSync('Versions/Current/Resources', join(frameworkDir, 'Resources'))
  symlinkSync('3.14', join(frameworkDir, 'Versions', 'Current'))

  return [
    join(GOGDL_INTERNAL, 'Python'),
    join(GOGDL_INTERNAL, 'Python.framework', 'Python'),
    join(GOGDL_INTERNAL, 'Python.framework', 'Resources'),
    join(GOGDL_INTERNAL, 'Python.framework', 'Versions', 'Current')
  ].map((p) => p.split(sep).join('/'))
}

/**
 * Builds a well-formed source fixture, then produces the KNOWN-BAD
 * destination with `cp -RL` -- the exact discriminator that proved
 * F-34.9-01's root cause. See file header for why this must be proven bad
 * before use.
 */
function buildKnownBadFixture(): {
  sourceRoot: string
  destRoot: string
  relPaths: string[]
} {
  const sourceRoot = mktemp('gamelib-symlink-src-')
  const relPaths = buildFrameworkFixture(sourceRoot)

  const destRootHolder = mktemp('gamelib-symlink-dest-')
  // cp requires the destination to not already exist for it to receive a
  // copy of sourceRoot's own contents (rather than nesting sourceRoot
  // inside it) -- mkdtemp already reserved a unique path for us; free it
  // and let `cp -RL` recreate it as the dereferenced copy.
  rmSync(destRootHolder, { recursive: true, force: true })

  const result = spawnSync('cp', ['-RL', sourceRoot, destRootHolder])
  if (result.status !== 0) {
    throw new Error(
      `cp -RL fixture setup failed: ${result.stderr?.toString() ?? result.error}`
    )
  }

  return { sourceRoot, destRoot: destRootHolder, relPaths }
}

describe('preserveRunnerSymlinks', () => {
  it('known-bad fixture: cp -RL genuinely dereferences Versions/Current before any restore runs (vacuity guard)', () => {
    const { destRoot, relPaths } = buildKnownBadFixture()
    const versionsCurrentRel = relPaths.find((p) =>
      p.endsWith('Versions/Current')
    ) as string
    const versionsCurrentDest = join(destRoot, ...versionsCurrentRel.split('/'))

    const st = lstatSync(versionsCurrentDest)
    expect(st.isSymbolicLink()).toBe(false)
    expect(st.isDirectory()).toBe(true)
  })

  it('restoreSymlinks replaces the dereferenced framework with symlinks matching the source targets', () => {
    const { sourceRoot, destRoot, relPaths } = buildKnownBadFixture()

    const { restored, skipped } = restoreSymlinks(sourceRoot, destRoot)

    expect(skipped).toEqual([])
    expect(restored).toHaveLength(4)

    for (const relPath of relPaths) {
      const srcTarget = readlinkSync(join(sourceRoot, ...relPath.split('/')))
      const destPath = join(destRoot, ...relPath.split('/'))
      expect(lstatSync(destPath).isSymbolicLink()).toBe(true)
      expect(readlinkSync(destPath)).toBe(srcTarget)
    }
  })

  it('restoreSymlinks over a symlink-free source tree leaves the destination byte-for-byte unchanged', () => {
    const sourceRoot = mktemp('gamelib-symlink-src-nolinks-')
    writeFileSync(join(sourceRoot, 'plain.txt'), 'hello')

    const destRoot = mktemp('gamelib-symlink-dest-nolinks-')
    writeFileSync(join(destRoot, 'plain.txt'), 'hello')
    writeFileSync(join(destRoot, 'other.txt'), 'untouched')
    const before = readFileSync(join(destRoot, 'other.txt'), 'utf-8')

    const result = restoreSymlinks(sourceRoot, destRoot)

    expect(result.restored).toEqual([])
    expect(result.skipped).toEqual([])
    expect(readFileSync(join(destRoot, 'other.txt'), 'utf-8')).toBe(before)
  })

  it('resolveDestPath refuses a ..-escaping relPath, naming it, and returns a normal joined path otherwise', () => {
    const destDir = mktemp('gamelib-symlink-dest-guard-')

    expect(() => resolveDestPath(destDir, '../evil')).toThrow(/evil/)
    expect(() => resolveDestPath(destDir, '../evil')).toThrow(destDir)

    expect(resolveDestPath(destDir, join('a', 'b'))).toBe(
      join(destDir, 'a', 'b')
    )
  })

  it('collectSymlinks does not walk through a symlinked directory: one record, not two', () => {
    const outsideRoot = mktemp('gamelib-symlink-outside-')
    writeFileSync(join(outsideRoot, 'real-target.txt'), 'x')
    symlinkSync('real-target.txt', join(outsideRoot, 'inner-link'))

    const root = mktemp('gamelib-symlink-walk-')
    symlinkSync(outsideRoot, join(root, 'dir-link'))

    const records = collectSymlinks(root)

    expect(records).toHaveLength(1)
    expect(records[0].relPath).toBe('dir-link')
  })

  it('restoreSymlinks is idempotent: a second call over an already-restored tree yields identical link targets', () => {
    const { sourceRoot, destRoot, relPaths } = buildKnownBadFixture()

    restoreSymlinks(sourceRoot, destRoot)
    const firstTargets = relPaths.map((relPath) =>
      readlinkSync(join(destRoot, ...relPath.split('/')))
    )

    const second = restoreSymlinks(sourceRoot, destRoot)
    const secondTargets = relPaths.map((relPath) =>
      readlinkSync(join(destRoot, ...relPath.split('/')))
    )

    expect(second.restored).toHaveLength(4)
    expect(second.skipped).toEqual([])
    expect(secondTargets).toEqual(firstTargets)
  })
})
