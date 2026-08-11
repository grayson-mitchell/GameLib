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
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { RUNNERS, inspectRunnerTree, summarise } from '../verifyRunnerBundle'

const ARCH = 'arm64'

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
 * otherwise well-formed three-runner pass-case tree, in one of four shapes.
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
 * `stub-file` and `unresolvable-target` each malform exactly one other
 * structural property, independent of the dereferenced case.
 */
function buildGogdlFrameworkFixture(
  root: string,
  shape: 'well-formed' | 'dereferenced' | 'stub-file' | 'unresolvable-target',
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

  // The four symlinks, exact relative targets per <interfaces>.
  symlinkSync('Versions/3.14/Python', join(internalDir, 'Python'))
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
    const gogdlFailure = summary.failures.find((f) =>
      f.startsWith('gogdl:')
    )
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

    const summary = summarise(results)
    expect(summary.ok).toBe(true)
    expect(summary.failures).toEqual([])
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

  it("Versions/Current symlink target does not resolve to an existing Versions/ directory: ok becomes false", () => {
    root = mkdtempSync(
      join(tmpdir(), 'verify-runner-bundle-fw-unresolvable-')
    )
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

  it('findFrameworks does not walk through a symlinked directory: a nested framework is counted once, not duplicated via the Versions/Current alias', () => {
    root = mkdtempSync(
      join(tmpdir(), 'verify-runner-bundle-fw-symlink-walk-')
    )
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
