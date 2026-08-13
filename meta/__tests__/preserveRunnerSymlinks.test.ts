/**
 * Fixture-driven coverage for meta/preserveRunnerSymlinks.ts (Phase 34.9
 * gap cycle 1, plan 12, F-34.9-01/F-34.9-03; Phase 34.9 gap cycle 2, plan 18,
 * CR-01/WR-01).
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
 *
 * CR-01/WR-01 (gap cycle 2, plan 18): CR-01 is the code review's sole
 * Critical finding -- `closeBundle` reports a skipped-symlink count via
 * `console.log` and returns normally, so `electron-vite build` succeeds and
 * `electron-builder` runs even on a partial restoration. Guard A below makes
 * `closeBundle` throw instead. Guard A is defense-in-depth and is NOT
 * reachable from a real build today: the vendored darwin onedir trees are
 * git-ignored and untracked (`public/bin/.gitignore`), so every fresh
 * checkout -- and every Linux/Windows checkout -- has no darwin symlinks at
 * all, meaning `collectSymlinks` returns `[]` and both `skipped`/`rejected`
 * stay empty. Guard A's failing direction is therefore proven at UNIT level
 * ONLY; the live failing-direction proof belongs to plan 34.9-21 against the
 * separately-wired `verify:runner-bundle` (plan 34.9-20). WR-01 is the
 * companion finding that `restoreSymlinks` copies a symlink's target string
 * verbatim from the untrusted vendored tree with zero validation -- an
 * absolute or `..`-escaping target would be faithfully recreated inside the
 * signed `.app`. Guard B (`isContainedSymlinkTarget`) rejects such targets
 * before they are ever written.
 */
import { spawnSync } from 'node:child_process'
import {
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
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'

import {
  collectSymlinks,
  isContainedSymlinkTarget,
  preserveRunnerSymlinksPlugin,
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

/**
 * Builds a well-formed source fixture (via `buildFrameworkFixture`) and an
 * EMPTY destination `mktemp` root that does not contain the
 * `bin/arm64/darwin/gogdl/_internal` subtree at all -- i.e. every record's
 * destination parent is missing, reproducing CR-01's named regression
 * scenarios (a `publicDir` restructure, a vite copy-ordering change, a
 * build-exclude pattern).
 */
function buildOrphanDestFixture(): {
  sourceRoot: string
  destRoot: string
  relPaths: string[]
} {
  const sourceRoot = mktemp('gamelib-symlink-src-orphan-')
  const relPaths = buildFrameworkFixture(sourceRoot)
  const destRoot = mktemp('gamelib-symlink-dest-orphan-')
  return { sourceRoot, destRoot, relPaths }
}

/**
 * Builds a source tree whose single `_internal/Python` link target is an
 * ABSOLUTE path into a third, separate `mktemp` directory holding a real
 * file, plus a `cp -RL`-style destination (parents present, dereferenced
 * copy in place of the link) so `restoreSymlinks` reaches the target check.
 */
function buildAbsoluteTargetFixture(): {
  sourceRoot: string
  destRoot: string
  outsideRoot: string
  relPath: string
  absoluteTarget: string
} {
  const outsideRoot = mktemp('gamelib-symlink-outside-abs-')
  const outsideFile = join(outsideRoot, 'exfil-target.txt')
  writeFileSync(outsideFile, 'sensitive-bytes')

  const sourceRoot = mktemp('gamelib-symlink-src-abs-')
  const internalDir = join(sourceRoot, GOGDL_INTERNAL)
  mkdirSync(internalDir, { recursive: true })
  symlinkSync(outsideFile, join(internalDir, 'Python'))

  const relPath = join(GOGDL_INTERNAL, 'Python').split(sep).join('/')

  const destRoot = mktemp('gamelib-symlink-dest-abs-')
  const destInternalDir = join(destRoot, GOGDL_INTERNAL)
  mkdirSync(destInternalDir, { recursive: true })
  // Reproduce vite's dereferencing copy: a REAL file sits where the symlink
  // should be, exactly as `cp -RL` would leave it.
  writeFileSync(join(destInternalDir, 'Python'), 'real-python-binary-bytes')

  return { sourceRoot, destRoot, outsideRoot, relPath, absoluteTarget: outsideFile }
}

/**
 * Builds a source tree whose single `_internal/Python` link target is a
 * RELATIVE string with enough `../` segments to climb out of the
 * destination root when resolved from the link's own directory.
 */
function buildEscapingTargetFixture(): {
  sourceRoot: string
  destRoot: string
  relPath: string
  escapingTarget: string
} {
  const sourceRoot = mktemp('gamelib-symlink-src-escape-')
  const internalDir = join(sourceRoot, GOGDL_INTERNAL)
  mkdirSync(internalDir, { recursive: true })

  // bin/arm64/darwin/gogdl/_internal/Python -> six levels up escapes any
  // destRoot that is itself the direct parent of `bin/`.
  const escapingTarget = join('..', '..', '..', '..', '..', '..', 'etc', 'passwd')
  symlinkSync(escapingTarget, join(internalDir, 'Python'))

  const relPath = join(GOGDL_INTERNAL, 'Python').split(sep).join('/')

  const destRoot = mktemp('gamelib-symlink-dest-escape-')
  const destInternalDir = join(destRoot, GOGDL_INTERNAL)
  mkdirSync(destInternalDir, { recursive: true })
  writeFileSync(join(destInternalDir, 'Python'), 'real-python-binary-bytes')

  return { sourceRoot, destRoot, relPath, escapingTarget }
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

    const { restored, skipped, rejected } = restoreSymlinks(sourceRoot, destRoot)

    expect(skipped).toEqual([])
    expect(rejected).toEqual([])
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
    expect(result.rejected).toEqual([])
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

  // --- Guard A (CR-01): skipped restore must fail the build --------------

  it('vacuity guard: buildOrphanDestFixture genuinely produces a skipped condition (no restore is possible)', () => {
    const { sourceRoot, destRoot, relPaths } = buildOrphanDestFixture()
    const firstRelPath = relPaths[0] as string
    expect(existsSync(join(destRoot, ...firstRelPath.split('/')))).toBe(false)

    const { restored, skipped } = restoreSymlinks(sourceRoot, destRoot)

    expect(skipped).toHaveLength(4)
    expect(restored).toHaveLength(0)
  })

  it('closeBundle throws when restoreSymlinks reports a non-empty skipped bucket', () => {
    const { sourceRoot, destRoot } = buildOrphanDestFixture()
    const plugin = preserveRunnerSymlinksPlugin({
      sourceDir: sourceRoot,
      destDir: destRoot
    })
    const closeBundle = plugin.closeBundle as unknown as () => void

    expect(() => closeBundle()).toThrow(
      /refusing to emit a bundle with unrestored symlink\(s\)/
    )
    expect(() => closeBundle()).toThrow(/skipped \(destination parent missing\)/)
  })

  it('closeBundle does NOT throw over a healthy (all-parents-present) destination', () => {
    const { sourceRoot, destRoot } = buildKnownBadFixture()
    const plugin = preserveRunnerSymlinksPlugin({
      sourceDir: sourceRoot,
      destDir: destRoot
    })
    const closeBundle = plugin.closeBundle as unknown as () => void

    expect(() => closeBundle()).not.toThrow()
  })

  it('closeBundle does NOT throw over two empty temp dirs (non-macOS / no-symlinks no-op)', () => {
    const sourceRoot = mktemp('gamelib-symlink-src-empty-')
    const destRoot = mktemp('gamelib-symlink-dest-empty-')
    const plugin = preserveRunnerSymlinksPlugin({
      sourceDir: sourceRoot,
      destDir: destRoot
    })
    const closeBundle = plugin.closeBundle as unknown as () => void

    expect(() => closeBundle()).not.toThrow()
  })

  // --- Guard B (WR-01): unsafe symlink targets must be rejected -----------

  it('vacuity guard: buildAbsoluteTargetFixture genuinely produces an absolute link target', () => {
    const { sourceRoot, relPath } = buildAbsoluteTargetFixture()
    const target = readlinkSync(join(sourceRoot, ...relPath.split('/')))
    expect(isAbsolute(target)).toBe(true)
  })

  it('isContainedSymlinkTarget rejects an absolute target', () => {
    const { destRoot, relPath, absoluteTarget } = buildAbsoluteTargetFixture()
    expect(isContainedSymlinkTarget(destRoot, relPath, absoluteTarget)).toBe(
      false
    )
  })

  it('restoreSymlinks rejects an absolute-target record, leaves the destination untouched, and closeBundle throws with the rejected label', () => {
    const { sourceRoot, destRoot, relPath } = buildAbsoluteTargetFixture()

    const { restored, rejected } = restoreSymlinks(sourceRoot, destRoot)
    const destPath = join(destRoot, ...relPath.split('/'))

    expect(rejected).toHaveLength(1)
    expect(restored.find((r) => r.relPath === relPath)).toBeUndefined()
    expect(lstatSync(destPath).isSymbolicLink()).toBe(false)

    const plugin = preserveRunnerSymlinksPlugin({
      sourceDir: sourceRoot,
      destDir: destRoot
    })
    const closeBundle = plugin.closeBundle as unknown as () => void
    expect(() => closeBundle()).toThrow(/rejected \(unsafe target\)/)
  })

  it('vacuity guard: buildEscapingTargetFixture genuinely produces a relative, destRoot-escaping target', () => {
    const { destRoot, relPath, escapingTarget } = buildEscapingTargetFixture()
    expect(isAbsolute(escapingTarget)).toBe(false)

    const destDirForLink = dirname(join(destRoot, ...relPath.split('/')))
    const resolvedTarget = resolve(destDirForLink, escapingTarget)
    expect(resolvedTarget.startsWith(resolve(destRoot) + sep)).toBe(false)
  })

  it('isContainedSymlinkTarget rejects a ..-escaping relative target', () => {
    const { destRoot, relPath, escapingTarget } = buildEscapingTargetFixture()
    expect(
      isContainedSymlinkTarget(destRoot, relPath, escapingTarget)
    ).toBe(false)
  })

  it('restoreSymlinks rejects a ..-escaping relative-target record', () => {
    const { sourceRoot, destRoot, relPath } = buildEscapingTargetFixture()

    const { rejected } = restoreSymlinks(sourceRoot, destRoot)

    expect(rejected.find((r) => r.relPath === relPath)).toBeDefined()
  })

  it('isContainedSymlinkTarget accepts all four real vendored target strings -- zero false positives on the shipping shape', () => {
    const destRoot = mktemp('gamelib-symlink-dest-control-')
    const cases: Array<[string, string]> = [
      [join(GOGDL_INTERNAL, 'Python').split(sep).join('/'), 'Python.framework/Versions/3.14/Python'],
      [
        join(GOGDL_INTERNAL, 'Python.framework', 'Python').split(sep).join('/'),
        'Versions/Current/Python'
      ],
      [
        join(GOGDL_INTERNAL, 'Python.framework', 'Resources').split(sep).join('/'),
        'Versions/Current/Resources'
      ],
      [
        join(GOGDL_INTERNAL, 'Python.framework', 'Versions', 'Current')
          .split(sep)
          .join('/'),
        '3.14'
      ]
    ]

    for (const [relPath, target] of cases) {
      expect(isContainedSymlinkTarget(destRoot, relPath, target)).toBe(true)
    }
  })
})
