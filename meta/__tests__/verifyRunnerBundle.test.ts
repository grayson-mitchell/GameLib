/**
 * First-ever test coverage for meta/verifyRunnerBundle.ts (Phase 34.9 Plan
 * 08). Every fixture is a synthetic temp tree built with `fs.mkdtempSync`
 * under `os.tmpdir()` and torn down in `afterEach` -- nothing here touches
 * the real `public/bin` or `build/` trees, and nothing is committed.
 *
 * `codesign`/`file` are invoked FOR REAL (no mocking) -- this module's
 * `<interfaces>` note both tools are verified present on this machine and on
 * macOS CI runners, and the whole point of this tool is to observe what
 * those real tools report, not a stub of them.
 */
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  RUNNERS,
  censusTree,
  inspectRunnerTree,
  main,
  summarise,
  type TreeCensus
} from '../verifyRunnerBundle'

const ARCH = 'arm64'

// C2-04's own PACKAGE_JSON_PATH, module-scope, identical form to
// cleanDistMac.test.ts:32. Deliberately declared here rather than imported
// from that file -- see the rationale comment above the describe block below.
const PACKAGE_JSON_PATH = join(__dirname, '..', '..', 'package.json')

// Real Mach-O 64-bit magic bytes as they appear on disk (MH_MAGIC_64,
// little-endian host representation): CF FA ED FE. Padded so the "file"
// command fallback path is never exercised by these fixtures (the magic
// sniff always succeeds against a readable 4+ byte file).
function machoBuffer(size = 64): Buffer {
  const buf = Buffer.alloc(size)
  buf[0] = 0xcf
  buf[1] = 0xfa
  buf[2] = 0xed
  buf[3] = 0xfe
  return buf
}

function darwinDirFor(root: string, arch: string): string {
  return join(
    root,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'build',
    'bin',
    arch,
    'darwin'
  )
}

function writeFillerFiles(dir: string, count: number): void {
  for (let i = 0; i < count; i++) {
    writeFileSync(join(dir, `filler-${i}.dat`), `not a mach-o file ${i}`)
  }
}

/**
 * Builds a full pass-case fixture: darwinDir/{legendary,gogdl,nile}/{runner}
 * each a real Mach-O magic'd, exec-bit file, plus `fillerCount` sibling
 * files per runner (default 25, above the 20-file floor).
 */
function buildPassCaseFixture(
  root: string,
  arch: string = ARCH,
  fillerCount = 25
): { darwinDir: string; binaryPaths: Record<string, string> } {
  const darwinDir = darwinDirFor(root, arch)
  const binaryPaths: Record<string, string> = {}
  for (const runner of RUNNERS) {
    const runnerDir = join(darwinDir, runner)
    mkdirSync(runnerDir, { recursive: true })
    const binaryPath = join(runnerDir, runner)
    writeFileSync(binaryPath, machoBuffer())
    chmodSync(binaryPath, 0o755)
    writeFillerFiles(runnerDir, fillerCount)
    binaryPaths[runner] = binaryPath
  }
  return { darwinDir, binaryPaths }
}

/**
 * Lays down a `Python.framework` inside `gogdl/_internal/` (the exact
 * location the live gate observed, 34.9-LIVE-GATE.md item 4), on top of an
 * otherwise well-formed three-runner pass-case tree, in one of six shapes.
 *
 * `well-formed` reproduces the real shape verified on disk (34.9-13-PLAN.md
 * <interfaces>): a real Mach-O `Versions/3.14/Python`, a real
 * `Versions/3.14/Resources/` directory, and four symlinks with the exact
 * relative targets from that table.
 *
 * `dereferenced` is produced from the well-formed shape via
 * `cp -RL` -- the SAME one-variable discriminator that proved F-34.9-01's
 * root cause in the live gate (34.9-12-SUMMARY.md) -- which turns every
 * symlink inside the framework into a real copy.
 *
 * `stub-file`, `unresolvable-target`, `stub-absent` and `stub-dangling-target`
 * each malform exactly one other structural property, independent of the
 * dereferenced case. `stub-absent` is the partial-copy shape (WR-02): the
 * `Versions/Current` symlink survived intact but the top-level stub link
 * (`Python.framework/Python`) was dropped entirely -- a real malformation a
 * partial dereferencing/copy failure can produce, distinct from `stub-file`
 * where the stub exists but as the wrong type. `stub-dangling-target` (C2-06)
 * is distinct again: the stub link IS present and IS a symlink, but its
 * target names a path that does not exist -- the shape none of the other
 * four exercise.
 */
function buildGogdlFrameworkFixture(
  root: string,
  shape:
    | 'well-formed'
    | 'dereferenced'
    | 'stub-file'
    | 'unresolvable-target'
    | 'stub-absent'
    | 'stub-dangling-target',
  arch: string = ARCH
): {
  darwinDir: string
  frameworkDir: string
  binaryPaths: Record<string, string>
} {
  const { darwinDir, binaryPaths } = buildPassCaseFixture(root, arch)
  const gogdlDir = join(darwinDir, 'gogdl')
  const internalDir = join(gogdlDir, '_internal')
  mkdirSync(internalDir, { recursive: true })

  const frameworkDir = join(internalDir, 'Python.framework')
  const versionsDir = join(frameworkDir, 'Versions')
  const versionDir = join(versionsDir, '3.14')
  const resourcesDir = join(versionDir, 'Resources')
  mkdirSync(resourcesDir, { recursive: true })

  const pythonBinPath = join(versionDir, 'Python')
  writeFileSync(pythonBinPath, machoBuffer())
  chmodSync(pythonBinPath, 0o755)
  writeFileSync(join(resourcesDir, 'dummy.txt'), 'resource')

  // The four symlinks, exact relative targets per <interfaces>. The sibling
  // stub target is resolved from ITS OWN parent (internalDir), so it needs
  // the "Python.framework/" prefix -- without it the target resolves to
  // "_internal/Versions/3.14/Python", which does not exist (quick-260901-e7o,
  // reproduced standalone with symlinkSync + existsSync, isolated from jest).
  symlinkSync(
    'Python.framework/Versions/3.14/Python',
    join(internalDir, 'Python')
  )
  symlinkSync('Versions/Current/Python', join(frameworkDir, 'Python'))
  symlinkSync('Versions/Current/Resources', join(frameworkDir, 'Resources'))
  symlinkSync('3.14', join(versionsDir, 'Current'))

  if (shape === 'dereferenced') {
    // Reproduce F-34.9-01's specific defect IN ISOLATION: replace ONLY the
    // `Versions/Current` symlink with a real `cp -RL`-dereferenced copy of
    // the version directory it pointed to -- the exact discriminator (`-RL`
    // dereferences, `-R` alone preserves symlinks) that proved F-34.9-01's
    // root cause in the live gate (34.9-12-SUMMARY.md). Applied surgically
    // to this ONE entry (not the whole framework directory) so this fixture
    // isolates the Versions/Current defect from the top-level-stub defect,
    // which is a distinct, separately-tested malformation below -- a whole-
    // framework `cp -RL` would dereference BOTH `Versions/Current` and
    // `Python.framework/Python` at once, making a test built on it unable to
    // discriminate which enforced condition actually caught the failure
    // (the vacuous-mutation class this repo's standing lessons warn about).
    const currentPath = join(versionsDir, 'Current')
    rmSync(currentPath)
    const cp = spawnSync('cp', ['-RL', versionDir, currentPath])
    if (cp.status !== 0) {
      throw new Error(`cp -RL fixture setup failed: ${cp.stderr}`)
    }
  } else if (shape === 'stub-file') {
    rmSync(join(frameworkDir, 'Python'))
    writeFileSync(join(frameworkDir, 'Python'), machoBuffer())
    chmodSync(join(frameworkDir, 'Python'), 0o755)
  } else if (shape === 'unresolvable-target') {
    rmSync(versionDir, { recursive: true, force: true })
  } else if (shape === 'stub-absent') {
    // Unlink ONLY the top-level stub `Python.framework/Python` (the link
    // `inspectFramework` derives from the framework's own name). This is
    // NOT the sibling `_internal/Python` symlink -- that one lives outside
    // the framework directory entirely and is not what `topLevelStubExists`
    // reflects. Nothing else is touched, so `Versions/Current` remains a
    // valid symlink -- the framework is malformed in exactly one respect.
    rmSync(join(frameworkDir, 'Python'))
  } else if (shape === 'stub-dangling-target') {
    // Replace ONLY the top-level stub symlink with one pointing at a
    // lexically plausible target that does not exist anywhere in the tree
    // (C2-06) -- distinct from `stub-absent` (no link at all) and
    // `stub-file` (not a symlink). `Versions/Current` remains a valid
    // symlink, so the framework is malformed in exactly one respect.
    rmSync(join(frameworkDir, 'Python'))
    symlinkSync('Versions/Current/PythonMissing', join(frameworkDir, 'Python'))
  }

  return { darwinDir, frameworkDir, binaryPaths }
}

describe('verifyRunnerBundle', () => {
  let root: string

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('pass case: three well-formed onedir trees -> ok, no failures', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-pass-'))
    buildPassCaseFixture(root)

    const results = inspectRunnerTree(root, ARCH)
    expect(results).toHaveLength(3)
    for (const r of results) {
      expect(r.exists).toBe(true)
      expect(r.executable).toBe(true)
      expect(r.isMachO).toBe(true)
      expect(r.fileCount).toBeGreaterThan(20)
    }

    const summary = summarise(results)
    expect(summary.ok).toBe(true)
    expect(summary.failures).toEqual([])
  })

  it('missing runner: deleting nile/nile fails and names nile + the absolute path', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-missing-'))
    const { binaryPaths } = buildPassCaseFixture(root)
    rmSync(binaryPaths.nile)

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)

    expect(summary.ok).toBe(false)
    const nileFailure = summary.failures.find((f) => f.startsWith('nile:'))
    expect(nileFailure).toBeDefined()
    expect(nileFailure).toContain(binaryPaths.nile)
  })

  it('non-executable: chmod 0o644 on gogdl/gogdl fails and names the exec bit', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-noexec-'))
    const { binaryPaths } = buildPassCaseFixture(root)
    chmodSync(binaryPaths.gogdl, 0o644)

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)

    expect(summary.ok).toBe(false)
    const gogdlFailure = summary.failures.find((f) => f.startsWith('gogdl:'))
    expect(gogdlFailure).toBeDefined()
    expect(gogdlFailure).toMatch(/exec bit/)
  })

  it('not Mach-O: legendary/legendary as plain text fails and says so', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-notmacho-'))
    const { binaryPaths } = buildPassCaseFixture(root)
    writeFileSync(binaryPaths.legendary, 'this is not a mach-o binary')
    chmodSync(binaryPaths.legendary, 0o755)

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)

    expect(summary.ok).toBe(false)
    const legendaryFailure = summary.failures.find((f) =>
      f.startsWith('legendary:')
    )
    expect(legendaryFailure).toBeDefined()
    expect(legendaryFailure).toMatch(/not a Mach-O/)
  })

  it('smuggled onefile: a nile tree with only 3 files fails on the file-count floor', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-smuggled-'))
    const darwinDir = darwinDirFor(root, ARCH)

    // legendary/gogdl are well-formed; nile is a smuggled onefile shape.
    for (const runner of ['legendary', 'gogdl'] as const) {
      const runnerDir = join(darwinDir, runner)
      mkdirSync(runnerDir, { recursive: true })
      const binaryPath = join(runnerDir, runner)
      writeFileSync(binaryPath, machoBuffer())
      chmodSync(binaryPath, 0o755)
      writeFillerFiles(runnerDir, 25)
    }
    const nileDir = join(darwinDir, 'nile')
    mkdirSync(nileDir, { recursive: true })
    const nileBinaryPath = join(nileDir, 'nile')
    writeFileSync(nileBinaryPath, machoBuffer())
    chmodSync(nileBinaryPath, 0o755)
    writeFillerFiles(nileDir, 2)

    const results = inspectRunnerTree(root, ARCH)
    const nileResult = results.find((r) => r.runner === 'nile')
    expect(nileResult?.fileCount).toBe(3)
    expect(nileResult?.exists).toBe(true)
    expect(nileResult?.executable).toBe(true)
    expect(nileResult?.isMachO).toBe(true)

    const summary = summarise(results)
    expect(summary.ok).toBe(false)
    const nileFailure = summary.failures.find((f) => f.startsWith('nile:'))
    expect(nileFailure).toBeDefined()
    expect(nileFailure).toMatch(/floor/)
  })

  it('tree not found: no build/bin/{arch}/darwin segment -> throws naming root and arch', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-notfound-'))
    mkdirSync(join(root, 'unrelated', 'nested', 'dir'), { recursive: true })

    expect(() => inspectRunnerTree(root, ARCH)).toThrow(root)
    expect(() => inspectRunnerTree(root, ARCH)).toThrow(ARCH)
  })

  it('signature reporting is not enforcement: pass-case files are unsigned, ok stays true', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-signature-'))
    buildPassCaseFixture(root)

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)
    expect(summary.ok).toBe(true)

    for (const r of results) {
      expect(r.machoCount).toBeGreaterThan(0)
      for (const m of r.machoFiles) {
        expect(m.signature).toBe('unsigned')
      }
    }
  })

  it('scope: a broken comet file and a win32 directory alongside darwin still pass', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-scope-'))
    const { darwinDir } = buildPassCaseFixture(root)

    // Broken comet file INSIDE the darwin dir, sibling to the three runner
    // directories -- never inspected because RUNNERS is exactly the three
    // onedir names.
    writeFileSync(join(darwinDir, 'comet'), 'broken, not a real binary')

    // win32/ directory sibling to darwin/ (same build/bin/${arch} parent) --
    // never traversed into because findDarwinBinRoot stops at the first
    // matching darwin directory.
    const binArchDir = join(darwinDir, '..')
    const win32LegendaryDir = join(binArchDir, 'win32', 'legendary')
    mkdirSync(win32LegendaryDir, { recursive: true })
    writeFileSync(join(win32LegendaryDir, 'legendary.exe'), 'broken PE stub')

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)
    expect(summary.ok).toBe(true)
    expect(summary.failures).toEqual([])
  })
})

describe('framework structural integrity (F-34.9-01)', () => {
  let root: string

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('well-formed framework: frameworks.length === 1, ok stays true (vacuity-guard baseline for the malformed case below)', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-fw-pass-'))
    buildGogdlFrameworkFixture(root, 'well-formed')

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    expect(gogdl?.frameworks).toHaveLength(1)
    expect(gogdl?.frameworks[0]?.name).toBe('Python.framework')
    expect(gogdl?.frameworks[0]?.versionsCurrentIsSymlink).toBe(true)
    // C2-06 vacuity control: the new dangling-target branch must not fire
    // against an otherwise well-formed stub.
    expect(gogdl?.frameworks[0]?.resolvedTopLevelTargetExists).toBe(true)

    const summary = summarise(results)
    expect(summary.ok).toBe(true)
    expect(summary.failures).toEqual([])
    expect(summary.failures.join(' ')).not.toMatch(
      /does not resolve to an existing path/
    )
  })

  it('dereferenced Versions/Current (the exact F-34.9-01 shape): ok becomes false, message names the framework path + Versions/Current', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-fw-deref-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(root, 'dereferenced')

    // The known-bad state must be proven BEFORE summarise runs, or this test
    // is vacuous (standing project rule).
    const versionsCurrentPath = join(frameworkDir, 'Versions', 'Current')
    expect(lstatSync(versionsCurrentPath).isSymbolicLink()).toBe(false)
    expect(lstatSync(versionsCurrentPath).isDirectory()).toBe(true)

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)

    expect(summary.ok).toBe(false)
    const fwFailure = summary.failures.find((f) => f.includes(frameworkDir))
    expect(fwFailure).toBeDefined()
    expect(fwFailure).toContain('Versions/Current')
  })

  it('top-level stub is a real file, not a symlink: ok becomes false', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-fw-stub-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(root, 'stub-file')

    const stubPath = join(frameworkDir, 'Python')
    expect(lstatSync(stubPath).isSymbolicLink()).toBe(false)

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)

    expect(summary.ok).toBe(false)
    const fwFailure = summary.failures.find((f) => f.includes(frameworkDir))
    expect(fwFailure).toBeDefined()
    expect(fwFailure).toMatch(/top-level stub/)
  })

  it('top-level stub is absent entirely (partial-copy shape): ok becomes false', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-fw-stub-absent-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(root, 'stub-absent')

    // Vacuity guard, asserted BEFORE inspectRunnerTree/summarise are called:
    // the framework must be malformed in exactly ONE respect, so any
    // failure below is attributable to the absent stub and not to a
    // co-occurring defect.
    expect(existsSync(join(frameworkDir, 'Python'))).toBe(false)
    expect(
      lstatSync(join(frameworkDir, 'Versions', 'Current')).isSymbolicLink()
    ).toBe(true)
    expect(existsSync(join(frameworkDir, 'Versions', '3.14', 'Python'))).toBe(
      true
    )

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    expect(gogdl?.frameworks[0]?.topLevelStubExists).toBe(false)
    expect(gogdl?.frameworks[0]?.versionsCurrentIsSymlink).toBe(true)
    expect(gogdl?.frameworks[0]?.resolvedVersionDirExists).toBe(true)

    const summary = summarise(results)
    expect(summary.ok).toBe(false)
    const fwFailures = summary.failures.filter((f) => f.includes(frameworkDir))
    expect(fwFailures).toHaveLength(1)
    expect(fwFailures[0]).toContain('top-level stub')
    expect(fwFailures[0]).toContain('"Python"')
    expect(fwFailures[0]).toContain('does not exist (F-34.9-01)')
  })

  it('Versions/Current symlink target does not resolve to an existing Versions/ directory: ok becomes false', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-fw-unresolvable-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(
      root,
      'unresolvable-target'
    )

    const versionsCurrentPath = join(frameworkDir, 'Versions', 'Current')
    expect(lstatSync(versionsCurrentPath).isSymbolicLink()).toBe(true)
    expect(existsSync(join(frameworkDir, 'Versions', '3.14'))).toBe(false)

    const results = inspectRunnerTree(root, ARCH)
    const summary = summarise(results)

    expect(summary.ok).toBe(false)
    const fwFailure = summary.failures.find((f) => f.includes(frameworkDir))
    expect(fwFailure).toBeDefined()
    expect(fwFailure).toMatch(/does not resolve/)
  })

  it('top-level stub is a symlink whose target does not resolve (dangling target, C2-06): ok becomes false, message names the target, and no other stub failure double-fires', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-fw-stub-dangling-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(
      root,
      'stub-dangling-target'
    )

    const stubPath = join(frameworkDir, 'Python')
    // Vacuity guard, asserted BEFORE inspectRunnerTree/summarise run: the
    // stub IS present and IS a symlink, but its target resolves to nothing,
    // and Versions/Current remains untouched -- the framework is malformed
    // in exactly one respect.
    expect(lstatSync(stubPath).isSymbolicLink()).toBe(true)
    expect(existsSync(stubPath)).toBe(false)
    expect(
      lstatSync(join(frameworkDir, 'Versions', 'Current')).isSymbolicLink()
    ).toBe(true)

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    expect(gogdl?.frameworks[0]?.topLevelStubExists).toBe(true)
    expect(gogdl?.frameworks[0]?.topLevelStubIsSymlink).toBe(true)
    expect(gogdl?.frameworks[0]?.resolvedTopLevelTargetExists).toBe(false)

    const summary = summarise(results)
    expect(summary.ok).toBe(false)
    const fwFailures = summary.failures.filter((f) => f.includes(frameworkDir))
    expect(fwFailures).toHaveLength(1)
    expect(fwFailures[0]).toContain('top-level stub')
    expect(fwFailures[0]).toContain('Versions/Current/PythonMissing')
    expect(fwFailures[0]).toContain(
      'does not resolve to an existing path (F-34.9-01)'
    )
    // Proves the else-if chaining works: one defect yields exactly one
    // failure, not the pre-existing "absent" or "wrong type" messages too.
    expect(fwFailures[0]).not.toContain('does not exist (F-34.9-01)')
    expect(fwFailures[0]).not.toContain('is a real file, not a symlink')
  })

  it('findFrameworks does not walk through a symlinked directory: a nested framework is counted once, not duplicated via the Versions/Current alias', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-fw-symlink-walk-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(root, 'well-formed')

    // Plant a SECOND framework nested inside Versions/3.14/Resources --
    // reachable via its REAL path (Versions/3.14/Resources/Nested.framework)
    // exactly once, but ALSO reachable via two symlink aliases if the
    // recursion guard ever followed symlinked directories:
    // `Python.framework/Resources` (-> Versions/Current/Resources) and
    // `Python.framework/Versions/Current` (-> 3.14) both resolve to the SAME
    // physical directory. Without this planted nested framework, following
    // symlinks would be a silent no-op here (Versions/Current's target
    // directory contains no `.framework`-named entry of its own), which
    // would make a mutation test built without it vacuous.
    const nestedFrameworkDir = join(
      frameworkDir,
      'Versions',
      '3.14',
      'Resources',
      'Nested.framework'
    )
    mkdirSync(nestedFrameworkDir, { recursive: true })

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    expect(gogdl?.frameworks).toHaveLength(2)
    expect(gogdl?.frameworks.map((f) => f.name).sort()).toEqual([
      'Nested.framework',
      'Python.framework'
    ])
  })

  it('no framework in the tree: frameworks is empty and does not fail on that account', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-fw-none-'))
    buildPassCaseFixture(root)

    const results = inspectRunnerTree(root, ARCH)
    for (const r of results) {
      expect(r.frameworks).toEqual([])
    }

    const summary = summarise(results)
    expect(summary.ok).toBe(true)
  })

  it('all-unsigned well-formed framework still passes (reporting is not enforcement)', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-fw-unsigned-'))
    buildGogdlFrameworkFixture(root, 'well-formed')

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    // No Apple Developer identity is enrolled anywhere in this fixture
    // (D-03/D-04) -- whatever `codesign -dv` reports for the framework
    // DIRECTORY (empirically `unknown:...bundle format unrecognized...` for
    // this synthetic, Info.plist-less fixture -- codesign cannot classify a
    // directory holding only a magic-byte stub as a real bundle the way it
    // classifies a real PyInstaller-built framework), it must never be a
    // real signing identity.
    expect(gogdl?.frameworks[0]?.codesignDisplay).toBeDefined()
    expect(gogdl?.frameworks[0]?.codesignDisplay).not.toMatch(/^signed:/)

    const summary = summarise(results)
    expect(summary.ok).toBe(true)
  })
})

describe('Resources alias structural integrity (F-34.9-01/quick-260901-e7o)', () => {
  let root: string

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('Resources alias absent: ok becomes false, message names the framework + "Resources alias does not exist"', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-res-absent-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(root, 'well-formed')
    const resourcesAliasPath = join(frameworkDir, 'Resources')

    // Known-bad state proven BEFORE summarise runs (standing project rule).
    rmSync(resourcesAliasPath)
    expect(existsSync(resourcesAliasPath)).toBe(false)

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    expect(gogdl?.frameworks[0]?.resourcesAliasExists).toBe(false)

    const summary = summarise(results)
    expect(summary.ok).toBe(false)
    const failure = summary.failures.find((f) => f.includes(frameworkDir))
    expect(failure).toBeDefined()
    expect(failure).toContain('Resources alias does not exist')
  })

  it('Resources alias is a real directory, not a symlink: ok becomes false', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-res-dir-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(root, 'well-formed')
    const resourcesAliasPath = join(frameworkDir, 'Resources')

    rmSync(resourcesAliasPath)
    mkdirSync(resourcesAliasPath)
    writeFileSync(join(resourcesAliasPath, 'dummy.txt'), 'not an alias')
    expect(lstatSync(resourcesAliasPath).isSymbolicLink()).toBe(false)
    expect(lstatSync(resourcesAliasPath).isDirectory()).toBe(true)

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    expect(gogdl?.frameworks[0]?.resourcesAliasExists).toBe(true)
    expect(gogdl?.frameworks[0]?.resourcesAliasIsSymlink).toBe(false)

    const summary = summarise(results)
    expect(summary.ok).toBe(false)
    const failure = summary.failures.find((f) => f.includes(frameworkDir))
    expect(failure).toBeDefined()
    expect(failure).toContain('Resources alias is a real directory')
  })

  it('Resources alias symlink target does not resolve (dangling): ok becomes false', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-res-dangling-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(root, 'well-formed')
    const resourcesAliasPath = join(frameworkDir, 'Resources')

    rmSync(resourcesAliasPath)
    symlinkSync('Versions/Current/ResourcesMissing', resourcesAliasPath)
    expect(lstatSync(resourcesAliasPath).isSymbolicLink()).toBe(true)
    expect(
      existsSync(join(frameworkDir, 'Versions/Current/ResourcesMissing'))
    ).toBe(false)

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    expect(gogdl?.frameworks[0]?.resourcesAliasIsSymlink).toBe(true)
    expect(gogdl?.frameworks[0]?.resolvedResourcesTargetExists).toBe(false)

    const summary = summarise(results)
    expect(summary.ok).toBe(false)
    const failure = summary.failures.find((f) => f.includes(frameworkDir))
    expect(failure).toBeDefined()
    expect(failure).toContain(
      'Resources alias symlink target "Versions/Current/ResourcesMissing" ' +
        'does not resolve to an existing path'
    )
  })

  it('Resources alias symlink target escapes the runner tree (T-e7o-01): ok becomes false, message says UNSAFE', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-res-escape-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(root, 'well-formed')
    const resourcesAliasPath = join(frameworkDir, 'Resources')

    // 60 "../" segments: deep enough from this fixture's nesting depth
    // (tmp root / Contents/Resources/app.asar.unpacked/build/bin/arm64/
    // darwin/gogdl/_internal/Python.framework/Resources) that the naive
    // `join()`-based existence check clamps at the filesystem root "/"
    // (which exists -- satisfying the "dangling" branch) while the
    // `resolve()`-based containment check correctly reports it as escaping
    // the runner tree. Proves containment is a genuine, load-bearing
    // addition and not vacuous -- a target this naive check would wrongly
    // accept as "resolved" must still be rejected as unsafe.
    const escapeTarget = Array(60).fill('..').join('/')
    rmSync(resourcesAliasPath)
    symlinkSync(escapeTarget, resourcesAliasPath)

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    const fw = gogdl?.frameworks[0]
    expect(fw?.resourcesAliasIsSymlink).toBe(true)
    // The naive existence check is satisfied (clamped to "/", which exists)
    // -- the vacuity control that proves this test is not merely
    // re-testing the dangling-target branch above.
    expect(fw?.resolvedResourcesTargetExists).toBe(true)
    expect(fw?.resourcesAliasTargetContained).toBe(false)

    const summary = summarise(results)
    expect(summary.ok).toBe(false)
    const failure = summary.failures.find(
      (f) => f.includes(frameworkDir) && f.includes('Resources alias')
    )
    expect(failure).toBeDefined()
    expect(failure).toContain('UNSAFE')
    expect(failure).toContain('escapes the runner tree')
  })
})

describe('_internal sibling stub structural integrity (F-34.9-01/quick-260901-e7o)', () => {
  let root: string

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('sibling stub absent: ok becomes false, message names "_internal sibling stub"', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-sib-absent-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(root, 'well-formed')
    const internalDir = join(frameworkDir, '..')
    const siblingStubPath = join(internalDir, 'Python')

    rmSync(siblingStubPath)
    expect(existsSync(siblingStubPath)).toBe(false)

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    expect(gogdl?.frameworks[0]?.siblingStubApplicable).toBe(true)
    expect(gogdl?.frameworks[0]?.siblingStubExists).toBe(false)

    const summary = summarise(results)
    expect(summary.ok).toBe(false)
    const failure = summary.failures.find((f) =>
      f.includes('_internal sibling stub')
    )
    expect(failure).toBeDefined()
    expect(failure).toContain('does not exist')
  })

  it('sibling stub is a real file, not a symlink: ok becomes false', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-sib-file-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(root, 'well-formed')
    const internalDir = join(frameworkDir, '..')
    const siblingStubPath = join(internalDir, 'Python')

    rmSync(siblingStubPath)
    writeFileSync(siblingStubPath, machoBuffer())
    chmodSync(siblingStubPath, 0o755)
    expect(lstatSync(siblingStubPath).isSymbolicLink()).toBe(false)

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    expect(gogdl?.frameworks[0]?.siblingStubExists).toBe(true)
    expect(gogdl?.frameworks[0]?.siblingStubIsSymlink).toBe(false)

    const summary = summarise(results)
    expect(summary.ok).toBe(false)
    const failure = summary.failures.find((f) =>
      f.includes('_internal sibling stub')
    )
    expect(failure).toBeDefined()
    expect(failure).toContain('is a real file, not a symlink')
  })

  it('sibling stub symlink target does not resolve (dangling): ok becomes false', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-sib-dangling-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(root, 'well-formed')
    const internalDir = join(frameworkDir, '..')
    const siblingStubPath = join(internalDir, 'Python')

    rmSync(siblingStubPath)
    symlinkSync('Python.framework/Versions/3.14/PythonMissing', siblingStubPath)
    expect(lstatSync(siblingStubPath).isSymbolicLink()).toBe(true)

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    expect(gogdl?.frameworks[0]?.siblingStubIsSymlink).toBe(true)
    expect(gogdl?.frameworks[0]?.resolvedSiblingStubTargetExists).toBe(false)

    const summary = summarise(results)
    expect(summary.ok).toBe(false)
    const failure = summary.failures.find((f) =>
      f.includes('_internal sibling stub')
    )
    expect(failure).toBeDefined()
    expect(failure).toContain('does not resolve to an existing path')
  })

  it('sibling stub symlink target escapes the runner tree (T-e7o-01): ok becomes false, message says UNSAFE', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-sib-escape-'))
    const { frameworkDir } = buildGogdlFrameworkFixture(root, 'well-formed')
    const internalDir = join(frameworkDir, '..')
    const siblingStubPath = join(internalDir, 'Python')

    const escapeTarget = Array(60).fill('..').join('/')
    rmSync(siblingStubPath)
    symlinkSync(escapeTarget, siblingStubPath)

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    const fw = gogdl?.frameworks[0]
    expect(fw?.siblingStubIsSymlink).toBe(true)
    expect(fw?.resolvedSiblingStubTargetExists).toBe(true)
    expect(fw?.siblingStubTargetContained).toBe(false)

    const summary = summarise(results)
    expect(summary.ok).toBe(false)
    const failure = summary.failures.find(
      (f) => f.includes('_internal sibling stub') && f.includes(frameworkDir)
    )
    expect(failure).toBeDefined()
    expect(failure).toContain('UNSAFE')
    expect(failure).toContain('escapes the runner tree')
  })

  it('scoping: a framework whose parent directory is NOT named "_internal" never fires the sibling-stub check', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-sib-scope-'))
    const { darwinDir } = buildPassCaseFixture(root, ARCH)
    const gogdlDir = join(darwinDir, 'gogdl')
    const notInternalDir = join(gogdlDir, 'NotInternal')
    mkdirSync(notInternalDir, { recursive: true })

    const frameworkDir = join(notInternalDir, 'Python.framework')
    const versionsDir = join(frameworkDir, 'Versions')
    const versionDir = join(versionsDir, '3.14')
    const resourcesDir = join(versionDir, 'Resources')
    mkdirSync(resourcesDir, { recursive: true })
    writeFileSync(join(versionDir, 'Python'), machoBuffer())
    chmodSync(join(versionDir, 'Python'), 0o755)
    writeFileSync(join(resourcesDir, 'dummy.txt'), 'resource')
    symlinkSync('Versions/Current/Python', join(frameworkDir, 'Python'))
    symlinkSync('Versions/Current/Resources', join(frameworkDir, 'Resources'))
    symlinkSync('3.14', join(versionsDir, 'Current'))
    // Deliberately NO sibling stub planted at notInternalDir/Python -- since
    // this framework's parent is not "_internal", siblingStubApplicable
    // must be false and the check must never fire against its absence.

    const results = inspectRunnerTree(root, ARCH)
    const gogdl = results.find((r) => r.runner === 'gogdl')
    expect(gogdl?.frameworks).toHaveLength(1)
    const fw = gogdl?.frameworks[0]
    expect(fw?.siblingStubApplicable).toBe(false)
    expect(fw?.siblingStubExists).toBe(false)

    const summary = summarise(results)
    expect(summary.failures.join(' ')).not.toContain('_internal sibling stub')
    expect(summary.ok).toBe(true)
  })
})

describe('censusTree (--expect-files/--expect-symlinks/--expect-bytes, quick-260901-e7o)', () => {
  let root: string

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('exact file/symlink counts over the well-formed framework fixture (vacuity guard: a symlinked-directory double-count bug would inflate fileCount)', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-census-'))
    const { darwinDir } = buildGogdlFrameworkFixture(root, 'well-formed')

    // 3 runners x (1 binary + 25 filler) = 78, plus the framework's own real
    // Python binary and Resources/dummy.txt = 80 files. 4 symlinks: the
    // top-level stub, the Resources alias, Versions/Current, and the
    // _internal sibling stub -- none of Resources/Versions/Current's own
    // ALIASED directories may be walked into and double-counted, since
    // `censusTree` only descends `isDirectory()` (lstat-based) entries.
    const census = censusTree(darwinDir)
    expect(census.fileCount).toBe(80)
    expect(census.symlinkCount).toBe(4)
    expect(census.apparentBytes).toBeGreaterThan(0)
  })
})

describe('CLI --expect-* census flags (quick-260901-e7o)', () => {
  let root: string
  let logSpy: ReturnType<typeof jest.spyOn>
  let errorSpy: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('exact census match: exit 0', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-cli-exact-'))
    const { darwinDir } = buildPassCaseFixture(root, ARCH)
    const census = censusTree(darwinDir)

    const exitCode = main([
      root,
      `--arch=${ARCH}`,
      `--expect-files=${census.fileCount}`,
      `--expect-symlinks=${census.symlinkCount}`,
      `--expect-bytes=${census.apparentBytes}`
    ])

    expect(exitCode).toBe(0)
  })

  it.each([
    [
      'files',
      (c: TreeCensus): TreeCensus => ({ ...c, fileCount: c.fileCount + 1 })
    ],
    [
      'symlinks',
      (c: TreeCensus): TreeCensus => ({
        ...c,
        symlinkCount: c.symlinkCount + 1
      })
    ],
    [
      'bytes',
      (c: TreeCensus): TreeCensus => ({
        ...c,
        apparentBytes: c.apparentBytes + 1
      })
    ]
  ])(
    'off-by-one on %s: exit 1, printed output contains "census mismatch"',
    (_label, mutate) => {
      root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-cli-offbyone-'))
      const { darwinDir } = buildPassCaseFixture(root, ARCH)
      const wrong = mutate(censusTree(darwinDir))

      const exitCode = main([
        root,
        `--arch=${ARCH}`,
        `--expect-files=${wrong.fileCount}`,
        `--expect-symlinks=${wrong.symlinkCount}`,
        `--expect-bytes=${wrong.apparentBytes}`
      ])

      expect(exitCode).toBe(1)
      const printed = logSpy.mock.calls.flat().join(' ')
      expect(printed).toContain('census mismatch')
    }
  )

  it('partial spec (1 of 3 flags): exit 1, error names the two missing flags', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-cli-partial1-'))
    buildPassCaseFixture(root, ARCH)

    const exitCode = main([root, `--arch=${ARCH}`, '--expect-files=1'])

    expect(exitCode).toBe(1)
    const printed = errorSpy.mock.calls.flat().join(' ')
    expect(printed).toContain('--expect-symlinks')
    expect(printed).toContain('--expect-bytes')
  })

  it('partial spec (2 of 3 flags): exit 1, error names the one missing flag', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-cli-partial2-'))
    buildPassCaseFixture(root, ARCH)

    const exitCode = main([
      root,
      `--arch=${ARCH}`,
      '--expect-files=1',
      '--expect-symlinks=1'
    ])

    expect(exitCode).toBe(1)
    const printed = errorSpy.mock.calls.flat().join(' ')
    expect(printed).toContain('--expect-bytes')
    expect(printed).not.toContain('--expect-files,')
    expect(printed).not.toContain('--expect-symlinks,')
  })

  it('no --expect-* flags given: census logic is skipped, structural pass still exits 0', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-cli-noflags-'))
    buildPassCaseFixture(root, ARCH)

    const exitCode = main([root, `--arch=${ARCH}`])

    expect(exitCode).toBe(0)
  })

  it('darwin tree absent for the given --arch, all three flags given: exit 1 (throws before census logic runs)', () => {
    root = mkdtempSync(join(tmpdir(), 'verify-runner-bundle-cli-absent-'))
    buildPassCaseFixture(root, ARCH)

    const exitCode = main([
      root,
      '--arch=x64',
      '--expect-files=1',
      '--expect-symlinks=1',
      '--expect-bytes=1'
    ])

    expect(exitCode).toBe(1)
  })
})

// C2-04: this project has no pin against `verify:runner-bundle` being
// dropped from -- or reordered after `electron-builder` within -- either
// macOS packaging script. `clean:dist-mac` already has an identical pin at
// cleanDistMac.test.ts:208-232; this block duplicates its six-line
// `loadScripts()` helper rather than importing it. That duplication is a
// deliberate, accepted cost: C2-04's own failure scenario is "a future
// refactor drops the wiring", and a pin that lives inside the test file for
// a *different* meta script becomes collateral damage in any refactor that
// retires `cleanDistMac`. The pin belongs with the thing it pins -- do NOT
// "helpfully" consolidate this with cleanDistMac.test.ts's copy.
describe('package.json wiring pin (C2-04)', () => {
  interface PackageJsonScripts {
    scripts: Record<string, string>
  }

  function loadScripts(): Record<string, string> {
    return (
      JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as PackageJsonScripts
    ).scripts
  }

  // Structural JSON.parse, never raw-text/regex: a raw-text grep for
  // `pnpm verify:runner-bundle` would ALSO match the script *definition*
  // itself (`"verify:runner-bundle": "..."` at package.json:71) even if
  // both call sites below were deleted -- the exact self-satisfying-
  // assertion class this phase has already shipped twice. Reading only
  // scripts['dist:mac'] and scripts['release:mac'] makes that definition
  // unreachable from the assertion.

  // The `dist:mac` / `release:mac` ordering pins were REMOVED by Phase 35 Plan 14: both
  // scripts invoked electron-builder and were deleted with the Electron packaging path, so
  // there is no longer a pipeline in which `verify:runner-bundle` can be ordered "before
  // electron-builder".
  //
  // THIS LEAVES A REAL GAP, and it is the same one REQ-34.16-02 has been PARTIAL on since
  // 34.18: `verify:runner-bundle` survives as a script but now has NO CALLER ANYWHERE, and
  // deleting build-base.yml removed the last route by which it could ever have run in real
  // CI. It has still never been exercised in a CI job.
  //
  // What replaces the pins is deliberately weaker and says so: assert only that the script
  // still EXISTS, so it is not quietly dropped as dead weight before a Tauri-side successor
  // wires it into the release path. An assertion that it is currently UNCALLED was
  // considered and rejected -- it would go red the moment someone did the right thing.
  test('verify:runner-bundle still exists as a script, pending a Tauri-side caller (REQ-34.16-02)', () => {
    const scripts = loadScripts()
    expect(scripts).toHaveProperty('verify:runner-bundle')
  })
})
